/**
 * @fileoverview Configuration defaults, normalization, and validation.
 */

/** @typedef {"charge" | "discharge"} BatteryPositiveMode */
/** @typedef {"import" | "export"} GridPositiveMode */

/**
 * @typedef {Object} PowerFloConfig
 * @property {string} type Home Assistant custom-card type.
 * @property {string} title Visible card title.
 * @property {string} inverter_name Visible inverter brand/name.
 * @property {string} inverter_model Visible inverter model.
 * @property {number} inverter_capacity_kw Rated inverter power.
 * @property {number} battery_capacity_kwh Installed battery capacity.
 * @property {string} inverter_image Validated local or data image URL.
 * @property {"12" | "24"} clock_format Clock presentation.
 * @property {number} flow_threshold_w Flow activation threshold.
 * @property {number} flow_release_w Flow release threshold.
 * @property {BatteryPositiveMode} battery_positive Battery sign convention.
 * @property {GridPositiveMode} grid_positive Grid sign convention.
 * @property {Record<string, string>} entities Entity mapping.
 */

/** @type {Readonly<PowerFloConfig>} */
export const DEFAULT_CONFIG = Object.freeze({
  type: "custom:powerflo-card",
  title: "Deye Energy",
  inverter_name: "DEYE",
  inverter_model: "SUN-12K-SG02LP1-EU-AM3",
  inverter_capacity_kw: 12,
  battery_capacity_kwh: 32.14,
  inverter_image: "",
  clock_format: "12",
  flow_threshold_w: 40,
  flow_release_w: 20,
  battery_positive: "discharge",
  grid_positive: "import",
  entities: Object.freeze({
    freshness: "",
    inverter_status: "",
    grid_connected: "",
    solar_power: "",
    pv1_power: "",
    pv2_power: "",
    pv3_power: "",
    battery_soc: "",
    battery_power: "",
    battery_voltage: "",
    battery_temperature: "",
    grid_power: "",
    grid_voltage: "",
    grid_frequency: "",
    load_power: "",
    solar_today: "",
    grid_today: "",
    load_today: "",
    battery_today: "",
  }),
});

const REQUIRED_ENTITIES = Object.freeze([
  "freshness",
  "inverter_status",
  "grid_connected",
  "solar_power",
  "battery_soc",
  "battery_power",
  "grid_power",
  "load_power",
]);

/**
 * Accepts only local Home Assistant paths or safe raster data URLs.
 * @param {unknown} value Candidate image source.
 * @returns {string} Safe source or an empty string.
 */
export function safeImageSource(value) {
  const source = String(value ?? "").trim();
  if (!source) return "";
  if (/^data:image\/(?:png|jpeg|webp);base64,[a-z0-9+/=]+$/i.test(source)) return source;
  if (source.startsWith("/local/") || source.startsWith("/api/image/serve/")) return source;
  return "";
}

/**
 * Clamps a finite number to an inclusive range.
 * @param {unknown} value Candidate numeric value.
 * @param {number} fallback Value used when candidate is not finite.
 * @param {number} minimum Inclusive minimum.
 * @param {number} maximum Inclusive maximum.
 * @returns {number} Normalized number.
 */
function finiteInRange(value, fallback, minimum, maximum) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.min(maximum, Math.max(minimum, parsed)) : fallback;
}

/**
 * Normalizes untrusted Lovelace configuration without mutating it.
 * @param {Partial<PowerFloConfig>} input User-provided configuration.
 * @returns {PowerFloConfig} Safe normalized configuration.
 */
export function normalizeConfig(input = {}) {
  const entities = { ...DEFAULT_CONFIG.entities, ...(input.entities ?? {}) };
  const threshold = finiteInRange(input.flow_threshold_w, DEFAULT_CONFIG.flow_threshold_w, 1, 5000);
  const release = finiteInRange(input.flow_release_w, DEFAULT_CONFIG.flow_release_w, 0, threshold);
  return {
    ...DEFAULT_CONFIG,
    ...input,
    title: String(input.title ?? DEFAULT_CONFIG.title).slice(0, 60),
    inverter_name: String(input.inverter_name ?? DEFAULT_CONFIG.inverter_name).slice(0, 40),
    inverter_model: String(input.inverter_model ?? DEFAULT_CONFIG.inverter_model).slice(0, 80),
    inverter_capacity_kw: finiteInRange(input.inverter_capacity_kw, DEFAULT_CONFIG.inverter_capacity_kw, 0.1, 1000),
    battery_capacity_kwh: finiteInRange(input.battery_capacity_kwh, DEFAULT_CONFIG.battery_capacity_kwh, 0.1, 10000),
    inverter_image: safeImageSource(input.inverter_image ?? DEFAULT_CONFIG.inverter_image),
    clock_format: input.clock_format === "24" ? "24" : "12",
    flow_threshold_w: threshold,
    flow_release_w: release,
    battery_positive: input.battery_positive === "charge" ? "charge" : "discharge",
    grid_positive: input.grid_positive === "export" ? "export" : "import",
    entities,
  };
}

/**
 * Validates required entity mappings and hysteresis settings.
 * @param {PowerFloConfig} config Normalized configuration.
 * @returns {string[]} Human-readable validation errors.
 */
export function validateConfig(config) {
  const errors = REQUIRED_ENTITIES
    .filter((key) => !config.entities[key])
    .map((key) => `Missing required entity: ${key}`);
  if (config.flow_release_w > config.flow_threshold_w) {
    errors.push("Flow release threshold must not exceed activation threshold");
  }
  return errors;
}
