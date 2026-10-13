/**
 * @fileoverview Pure domain-state derivation for live PowerFlo telemetry.
 */

/** @typedef {"fresh" | "stale" | "unavailable" | "config-error"} DataState */
/** @typedef {"charging" | "discharging" | "static" | "unavailable"} BatteryMode */
/** @typedef {"importing" | "exporting" | "static" | "disconnected" | "unavailable"} GridMode */
/** @typedef {"forward" | "reverse" | "stopped"} FlowDirection */

/**
 * Reads a numeric entity state without treating missing values as zero.
 * @param {Record<string, {state?: string}>} states Home Assistant state map.
 * @param {string} entityId Entity ID.
 * @returns {number | null} Finite numeric state or null.
 */
export function numericState(states, entityId) {
  const raw = entityId ? states[entityId]?.state : undefined;
  if (raw === undefined || raw === null || String(raw).trim() === "" || raw === "unknown" || raw === "unavailable") return null;
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : null;
}

/**
 * Reads an entity state as normalized lowercase text.
 * @param {Record<string, {state?: string}>} states Home Assistant state map.
 * @param {string} entityId Entity ID.
 * @returns {string | null} Normalized text or null.
 */
export function textState(states, entityId) {
  const raw = entityId ? states[entityId]?.state : undefined;
  if (!raw || raw === "unknown" || raw === "unavailable") return null;
  return String(raw).trim().toLowerCase();
}

/**
 * Interprets common boolean entity representations.
 * @param {Record<string, {state?: string}>} states Home Assistant state map.
 * @param {string} entityId Entity ID.
 * @returns {boolean | null} Boolean value or null when unavailable.
 */
export function booleanState(states, entityId) {
  const value = textState(states, entityId);
  if (value === null) return null;
  if (["on", "true", "connected", "online", "1", "yes", "fresh"].includes(value)) return true;
  if (["off", "false", "disconnected", "offline", "0", "no", "stale"].includes(value)) return false;
  return null;
}

/**
 * Applies activation/release hysteresis to a signed power value.
 * @param {number | null} power Signed power in watts.
 * @param {"positive" | "negative" | "stopped"} previous Prior polarity.
 * @param {number} activate Activation threshold in watts.
 * @param {number} release Release threshold in watts.
 * @returns {"positive" | "negative" | "stopped"} Stable polarity.
 */
export function powerPolarity(power, previous, activate, release) {
  if (power === null) return "stopped";
  if (previous === "positive" && power >= release) return "positive";
  if (previous === "negative" && power <= -release) return "negative";
  if (power >= activate) return "positive";
  if (power <= -activate) return "negative";
  return "stopped";
}

/**
 * Maps signed battery power to a human state using configured polarity.
 * @param {"positive" | "negative" | "stopped"} polarity Stable power polarity.
 * @param {"charge" | "discharge"} positiveMeaning Meaning of positive values.
 * @param {boolean} available Whether telemetry is available and fresh.
 * @returns {BatteryMode} Battery operating mode.
 */
export function batteryMode(polarity, positiveMeaning, available = true) {
  if (!available) return "unavailable";
  if (polarity === "stopped") return "static";
  const positive = polarity === "positive";
  const charging = positiveMeaning === "charge" ? positive : !positive;
  return charging ? "charging" : "discharging";
}

/**
 * Maps signed grid power and connection state to a grid mode.
 * @param {"positive" | "negative" | "stopped"} polarity Stable power polarity.
 * @param {"import" | "export"} positiveMeaning Meaning of positive values.
 * @param {boolean | null} connected Grid connection state.
 * @param {boolean} available Whether telemetry is available and fresh.
 * @returns {GridMode} Grid operating mode.
 */
export function gridMode(polarity, positiveMeaning, connected, available = true) {
  if (!available) return "unavailable";
  if (connected === false) return "disconnected";
  if (connected === null) return "unavailable";
  if (polarity === "stopped") return "static";
  const positive = polarity === "positive";
  const importing = positiveMeaning === "import" ? positive : !positive;
  return importing ? "importing" : "exporting";
}

/**
 * Converts domain modes into connector direction relative to the inverter.
 * @param {"solar" | "battery" | "grid" | "load"} connector Connector identity.
 * @param {string} mode Domain mode.
 * @returns {FlowDirection} Direction from node to inverter (forward), inverter to node (reverse), or stopped.
 */
export function flowDirection(connector, mode) {
  const key = `${connector}:${mode}`;
  const directions = {
    "solar:producing": "forward",
    "battery:discharging": "forward",
    "battery:charging": "reverse",
    "grid:importing": "forward",
    "grid:exporting": "reverse",
    "load:powered": "reverse",
  };
  return directions[key] ?? "stopped";
}

/**
 * Builds the complete render model from Home Assistant states.
 * @param {Record<string, {state?: string; attributes?: Record<string, unknown>}>} states Home Assistant state map.
 * @param {import('./config.js').PowerFloConfig} config Normalized card config.
 * @param {{battery: "positive" | "negative" | "stopped"; grid: "positive" | "negative" | "stopped"}} previous Prior hysteresis state.
 * @returns {Object} Render-ready domain model.
 */
export function deriveModel(states, config, previous) {
  const ids = config.entities;
  const fresh = booleanState(states, ids.freshness);
  const dataState = fresh === true ? "fresh" : fresh === false ? "stale" : "unavailable";
  const usable = dataState === "fresh";
  const batteryPower = numericState(states, ids.battery_power);
  const gridPower = numericState(states, ids.grid_power);
  const solarPower = numericState(states, ids.solar_power);
  const loadPower = numericState(states, ids.load_power);
  const batteryPolarity = powerPolarity(batteryPower, previous.battery, config.flow_threshold_w, config.flow_release_w);
  const gridPolarity = powerPolarity(gridPower, previous.grid, config.flow_threshold_w, config.flow_release_w);
  const battery = batteryMode(batteryPolarity, config.battery_positive, usable && batteryPower !== null);
  const connected = booleanState(states, ids.grid_connected);
  const grid = gridMode(gridPolarity, config.grid_positive, connected, usable && (gridPower !== null || connected === false));
  const solar = usable && solarPower !== null && solarPower >= config.flow_threshold_w ? "producing" : "idle";
  const load = usable && loadPower !== null && loadPower >= config.flow_threshold_w ? "powered" : "zero";
  return {
    dataState,
    inverterStatus: textState(states, ids.inverter_status) ?? "unavailable",
    connected,
    solar,
    battery,
    grid,
    load,
    values: {
      solarPower,
      pv1Power: numericState(states, ids.pv1_power),
      pv2Power: numericState(states, ids.pv2_power),
      pv3Power: numericState(states, ids.pv3_power),
      batterySoc: numericState(states, ids.battery_soc),
      batteryPower,
      batteryVoltage: numericState(states, ids.battery_voltage),
      batteryTemperature: numericState(states, ids.battery_temperature),
      gridPower,
      gridVoltage: numericState(states, ids.grid_voltage),
      gridFrequency: numericState(states, ids.grid_frequency),
      loadPower,
      solarToday: numericState(states, ids.solar_today),
      gridToday: numericState(states, ids.grid_today),
      loadToday: numericState(states, ids.load_today),
      batteryToday: numericState(states, ids.battery_today),
    },
    polarity: { battery: batteryPolarity, grid: gridPolarity },
    flows: {
      solar: flowDirection("solar", solar),
      battery: flowDirection("battery", battery),
      grid: flowDirection("grid", grid),
      load: flowDirection("load", load),
    },
  };
}
