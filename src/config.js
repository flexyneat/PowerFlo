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
 * @property {number} solar_capacity_kw Installed DC array nameplate in kWp; zero leaves the label hidden.
 * @property {number} battery_reserve_soc Runtime estimate's reserve SOC, percent.
 * @property {number} battery_charge_target_soc Time-to-full/target SOC, percent.
 * @property {number} runtime_window_minutes Time-weighted averaging window.
 * @property {number} runtime_max_sample_age_seconds Maximum power sample age and gap.
 * @property {number} charge_taper_start_soc Assumed future taper starting SOC.
 * @property {number} charge_taper_floor_ratio Assumed charge ratio at full SOC.
 * @property {number} solar_projection_hours Assumed solar availability horizon.
 * @property {"compact"|"standard"|"expanded"} density Layout density; essential readings are never hidden.
 * @property {boolean} use_learned_taper Opt-in to session-observed taper; not a calibrated BMS model.
 * @property {number} runtime_load_efficiency Assumed DC-to-AC efficiency for load scenarios.
 * @property {boolean} energy_sources_verified User confirmed production/import/discharge counter meanings.
 * @property {boolean} readiness_enabled Show conditional overnight readiness and scenario tools.
 * @property {boolean} preparedness_enabled Show preparedness row/details independently of the simulator.
 * @property {boolean} grid_power_verified Physical grid power role and configured sign have been confirmed.
 * @property {boolean} grid_status_fallback Opt-in voltage/power availability inference, not relay confirmation.
 * @property {number} grid_voltage_available_min Minimum displayed normal-voltage evidence, not an inverter trip setting.
 * @property {number} grid_voltage_available_max Maximum displayed normal-voltage evidence.
 * @property {number} grid_voltage_absent_max Maximum voltage used with negligible power to suspect outage.
 * @property {number} export_threshold_w Strict export threshold for session observation, not inverter control.
 * @property {number} export_duration_seconds Continuous export duration required for an observed event.
 * @property {boolean} standby_measurement_verified User/installer verified inverter-only idle sensor scope and behavior.
 * @property {number|null} standby_assumed_w Manual informational assumption; never deducted again from runtime.
 * @property {string} readiness_deadline Morning HH:mm in Home Assistant's time zone.
 * @property {number|null} readiness_average_w Optional manual average AC watts; null selects observed demand.
 * @property {number} readiness_min_coverage Minimum observed coverage before accepting a historical bucket.
 * @property {Record<string, string>} statistics Optional long-term energy statistic IDs.
 * @property {boolean} solar_outlook_enabled Show optional solar/weather detail.
 * @property {string[]} solar_forecast_sources Explicit HA Energy forecast config-entry IDs.
 * @property {string} weather_entity Optional hourly-capable weather entity.
 * @property {boolean} estimate_accuracy_enabled Collect qualified outcomes while visible and attached.
 * @property {string} accuracy_storage_key Distinguishes multiple cards/systems on this browser.
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
  title: "PowerFlo",
  inverter_name: "Inverter",
  inverter_model: "",
  inverter_capacity_kw: 12,
  battery_capacity_kwh: 32.14,
  solar_capacity_kw: 0,
  battery_reserve_soc: 20,
  battery_charge_target_soc: 100,
  runtime_window_minutes: 5,
  runtime_max_sample_age_seconds: 60,
  charge_taper_start_soc: 90,
  charge_taper_floor_ratio: 0.2,
  solar_projection_hours: 4,
  density: "standard",
  use_learned_taper: false,
  runtime_load_efficiency: 0.9,
  energy_sources_verified: false,
  readiness_enabled: true,
  preparedness_enabled: true,
  grid_power_verified: false,
  grid_status_fallback: false,
  grid_voltage_available_min: 180,
  grid_voltage_available_max: 270,
  grid_voltage_absent_max: 50,
  export_threshold_w: 50,
  export_duration_seconds: 300,
  standby_measurement_verified: false,
  standby_assumed_w: null,
  readiness_deadline: "06:00",
  readiness_average_w: null,
  readiness_min_coverage: 0.8,
  statistics: Object.freeze({ solar: "", grid: "", load: "", battery: "" }),
  solar_outlook_enabled: true,
  solar_forecast_sources: Object.freeze([]),
  weather_entity: "",
  estimate_accuracy_enabled: true,
  accuracy_storage_key: "default",
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
    ac_temperature: "",
    dc_temperature: "",
    grid_l2_voltage: "",
    inverter_output_power: "",
    external_ct_power_candidate: "",
    battery_charge_today: "",
    grid_export_today: "",
    solar_total: "",
    grid_import_total: "",
    grid_export_total: "",
    battery_charge_total: "",
    battery_discharge_total: "",
    load_power: "",
    solar_today: "",
    grid_today: "",
    load_today: "",
    battery_today: "",
    solar_forecast_power: "",
    battery_current: "",
    bms_charge_current_limit: "",
    bms_discharge_current_limit: "",
    inverter_standby_power: "",
    pv1_voltage: "",pv1_current: "",
    pv2_voltage: "",pv2_current: "",
    pv3_voltage: "",pv3_current: "",
  }),
});

const REQUIRED_ENTITIES = Object.freeze([
  "freshness",
  // Missing status/connection signals already render unavailable in the model.
  // Do not require users to invent entities to view otherwise valid telemetry.
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
    solar_capacity_kw: finiteInRange(input.solar_capacity_kw, DEFAULT_CONFIG.solar_capacity_kw, 0, 10000),
    battery_reserve_soc: finiteInRange(input.battery_reserve_soc, DEFAULT_CONFIG.battery_reserve_soc, 0, 100),
    battery_charge_target_soc: finiteInRange(input.battery_charge_target_soc, DEFAULT_CONFIG.battery_charge_target_soc, 1, 100),
    runtime_window_minutes: finiteInRange(input.runtime_window_minutes, DEFAULT_CONFIG.runtime_window_minutes, 1, 60),
    runtime_max_sample_age_seconds: finiteInRange(input.runtime_max_sample_age_seconds, DEFAULT_CONFIG.runtime_max_sample_age_seconds, 5, 300),
    charge_taper_start_soc: finiteInRange(input.charge_taper_start_soc, DEFAULT_CONFIG.charge_taper_start_soc, 50, 99),
    charge_taper_floor_ratio: finiteInRange(input.charge_taper_floor_ratio, DEFAULT_CONFIG.charge_taper_floor_ratio, 0.05, 1),
    solar_projection_hours: finiteInRange(input.solar_projection_hours, DEFAULT_CONFIG.solar_projection_hours, 0, 24),
    density: ["compact","expanded"].includes(input.density)?input.density:"standard",
    use_learned_taper: input.use_learned_taper===true,
    energy_sources_verified: input.energy_sources_verified===true,
    runtime_load_efficiency: finiteInRange(input.runtime_load_efficiency,DEFAULT_CONFIG.runtime_load_efficiency,0.5,1),
    readiness_enabled: input.readiness_enabled !== false,
    preparedness_enabled: input.preparedness_enabled !== false,
    grid_power_verified: input.grid_power_verified === true,
    grid_status_fallback: input.grid_status_fallback === true,
    grid_voltage_available_min: finiteInRange(input.grid_voltage_available_min,180,60,500),
    grid_voltage_available_max: finiteInRange(input.grid_voltage_available_max,270,60,500),
    grid_voltage_absent_max: finiteInRange(input.grid_voltage_absent_max,50,0,59),
    export_threshold_w: finiteInRange(input.export_threshold_w,50,1,1000000),
    export_duration_seconds: finiteInRange(input.export_duration_seconds,300,30,86400),
    standby_measurement_verified: input.standby_measurement_verified === true,
    standby_assumed_w: input.standby_assumed_w===null||input.standby_assumed_w===undefined||input.standby_assumed_w===""?null:finiteInRange(input.standby_assumed_w,null,0,100000),
    readiness_deadline: /^([01]\d|2[0-3]):[0-5]\d$/.test(input.readiness_deadline??"")?input.readiness_deadline:DEFAULT_CONFIG.readiness_deadline,
    readiness_average_w: input.readiness_average_w===null||input.readiness_average_w===undefined||input.readiness_average_w===""?null:finiteInRange(input.readiness_average_w,null,0,1000000),
    readiness_min_coverage: finiteInRange(input.readiness_min_coverage,0.8,0.5,1),
    statistics: Object.fromEntries(Object.keys(DEFAULT_CONFIG.statistics).map(key => [key, String(input.statistics?.[key] ?? "").trim().slice(0, 300)])),
    solar_outlook_enabled: input.solar_outlook_enabled !== false,
    solar_forecast_sources: [...new Set((Array.isArray(input.solar_forecast_sources)?input.solar_forecast_sources:typeof input.solar_forecast_sources==="string"?input.solar_forecast_sources.split(","):[]).filter(x=>typeof x==="string"&&/^[a-zA-Z0-9_-]{1,100}$/.test(x.trim())).map(x=>x.trim()))].slice(0,12),
    weather_entity: /^weather\.[a-z0-9_]+$/.test(input.weather_entity??"")?input.weather_entity:"",
    estimate_accuracy_enabled: input.estimate_accuracy_enabled !== false,
    accuracy_storage_key: String(input.accuracy_storage_key??"default").slice(0,100),
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
