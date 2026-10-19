/**
 * @fileoverview Accessible visual editor for PowerFlo display and entity mappings.
 */

import { normalizeConfig } from "./config.js";
import { editorStyles } from "./styles.js";
import { SetupGuide } from "./setup-guide.js";
import { phase1Styles } from "./phase1-styles.js";

const IMAGE_TYPES = Object.freeze(["image/png", "image/jpeg", "image/webp"]);
const MAX_IMAGE_BYTES = 2 * 1024 * 1024;

/**
 * Reads a validated local raster file as a data URL.
 * @param {File} file Browser-selected image.
 * @returns {Promise<string>} Safe raster data URL.
 */
export async function readImageFile(file) {
  if (!IMAGE_TYPES.includes(file.type)) throw new Error("Choose a PNG, JPEG, or WebP image");
  if (file.size > MAX_IMAGE_BYTES) throw new Error("Image must be 2 MB or smaller");
  const source = await new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.addEventListener("load", () => resolve(String(reader.result ?? "")), { once: true });
    reader.addEventListener("error", () => reject(new Error("Image could not be read")), { once: true });
    reader.readAsDataURL(file);
  });
  await new Promise((resolve, reject) => {
    const image = new Image();
    image.addEventListener("load", () => {
      if (image.naturalWidth > 4096 || image.naturalHeight > 4096) reject(new Error("Image dimensions must not exceed 4096 × 4096"));
      else resolve();
    }, { once: true });
    image.addEventListener("error", () => reject(new Error("Image is not a valid raster file")), { once: true });
    image.src = source;
  });
  return source;
}

/** Visual configuration editor registered with Home Assistant. */
export class PowerFloEditor extends HTMLElement {
  /** Creates the editor and isolated style root. */
  constructor() {
    super();
    this.attachShadow({ mode: "open" });
    this.config = normalizeConfig();
    this.rendered = false;
  }

  /**
   * Receives Home Assistant for future entity suggestions.
   * @param {Object} hass Home Assistant frontend object.
   */
  set hass(hass) {
    this._hass = hass;
    this.guide?.updateHass(hass);
  }

  /**
   * Receives and renders card configuration.
   * @param {Object} config Raw card configuration.
   */
  setConfig(config) {
    this.config = normalizeConfig(config);
    if (!this.rendered) this.render();
    this.sync();
    this.guide.configure(this.config);
  }

  /** Creates the editor DOM once using trusted static markup. */
  render() {
    const root = this.shadowRoot;
    root.innerHTML = `<style>${editorStyles()}</style><div class="editor"><fieldset data-section="appearance"><legend>Appearance</legend></fieldset><fieldset data-section="behavior"><legend>Flow behavior</legend></fieldset><fieldset data-section="entities"><legend>Entities</legend><p class="hint">Use complete entity IDs. Required mappings are marked with an asterisk.</p></fieldset><div class="error" role="status" aria-live="polite"></div></div>`;
    const appearance = root.querySelector('[data-section="appearance"]');
    root.querySelector("style").textContent+=phase1Styles();
    const behavior = root.querySelector('[data-section="behavior"]');
    const entities = root.querySelector('[data-section="entities"]');
    const forecasts=document.createElement("fieldset");forecasts.innerHTML='<legend>Forecast and accuracy</legend><p class="hint">Select Forecast.Solar in the Energy dashboard first. Source IDs are listed inside Solar outlook. Weather is contextual; no extra cloud correction is applied. Browser retention is off until explicitly enabled in Battery details.</p>';behavior.after(forecasts);
    forecasts.append(this.createSelectField("solar_outlook_enabled","Solar outlook",[["true","Show"],["false","Hide"]]));
    forecasts.append(this.createField("solar_forecast_sources","Energy forecast source IDs (comma-separated)","text"));
    forecasts.append(this.createField("weather_entity","Hourly weather entity (optional)","text"));
    forecasts.append(this.createSelectField("estimate_accuracy_enabled","Collect estimate feedback",[["true","While visible"],["false","Disabled"]]));
    forecasts.append(this.createField("accuracy_storage_key","Local evidence identity (unique per system/card)","text"));
    this.guide=new SetupGuide(config=>{this.config=config;this.sync();this.guide.configure(config);this.dispatchEvent(new CustomEvent("config-changed",{detail:{config},bubbles:true,composed:true}));});
    root.querySelector(".editor").prepend(this.guide.element);this.guide.updateHass(this._hass);
    const appearanceFields = [
      ["title", "Card title", "text"],
      ["inverter_name", "Inverter name", "text"],
      ["inverter_model", "Inverter model", "text"],
      ["inverter_capacity_kw", "Inverter capacity (kW)", "number"],
      ["battery_capacity_kwh", "Battery capacity (kWh)", "number"],
      ["solar_capacity_kw", "Installed solar array (kWp; 0 hides)", "number"],
      ["inverter_image", "Inverter image URL", "text"],
    ];
    for (const field of appearanceFields) appearance.append(this.createField(...field));
    appearance.append(this.createUploadField());
    appearance.append(this.createSelectField("density","Layout density",[["compact","Compact"],["standard","Standard"],["expanded","Expanded"]]));
    behavior.append(this.createSelectField("use_learned_taper","Use session-learned taper",[["false","Assumed taper"],["true","Use learned when qualified"]]));
    behavior.append(this.createField("runtime_load_efficiency","Load runtime efficiency assumption (0.5–1)","number"));
    behavior.append(this.createSelectField("energy_sources_verified","Counters are PV production / grid import / battery discharge",[["false","Not verified"],["true","Verified roles"]]));
    behavior.append(this.createSelectField("clock_format", "Clock format", [["12", "12-hour"], ["24", "24-hour"]]));
    behavior.append(this.createSelectField("readiness_enabled","Overnight readiness",[["true","Show readiness and simulator"],["false","Hide readiness and simulator"]]));
    behavior.append(this.createSelectField("preparedness_enabled","Show outage preparedness",[["true","Show preparedness"],["false","Hide preparedness; keep simulator"]]));
    behavior.append(this.createSelectField("grid_power_verified","Grid power role and polarity confirmed",[["false","Not verified"],["true","Verified at grid connection point"]]));
    behavior.append(this.createField("export_threshold_w","Sustained export observation threshold (W)","number"));
    behavior.append(this.createField("export_duration_seconds","Sustained export observation duration (seconds)","number"));
    behavior.append(this.createSelectField("standby_measurement_verified","Standby sensor is qualified inverter-only idle measurement",[["false","Not verified"],["true","Verified scope and idle-only behavior"]]));
    behavior.append(this.createField("standby_assumed_w","Manual standby assumption (W; blank means unknown)","number"));
    behavior.append(this.createField("readiness_deadline","Morning deadline (HA local time)","time"));
    behavior.append(this.createField("readiness_average_w","Manual average load (W; blank uses observations)","number"));
    behavior.append(this.createField("readiness_min_coverage","Required demand history coverage (0.5–1)","number"));
    behavior.append(this.createSelectField("battery_positive", "Positive battery power", [["discharge", "Discharging"], ["charge", "Charging"]]));
    behavior.append(this.createSelectField("grid_positive", "Positive grid power", [["import", "Importing"], ["export", "Exporting"]]));
    behavior.append(this.createField("flow_threshold_w", "Flow starts above (W)", "number"));
    behavior.append(this.createField("flow_release_w", "Flow stops below (W)", "number"));
    behavior.append(this.createField("battery_reserve_soc", "Runtime reserve SOC (%)", "number"));
    behavior.append(this.createField("battery_charge_target_soc", "Charge estimate target SOC (%)", "number"));
    behavior.append(this.createField("runtime_window_minutes", "Runtime averaging window (minutes)", "number"));
    behavior.append(this.createField("runtime_max_sample_age_seconds", "Runtime maximum sample age (seconds)", "number"));
    behavior.append(this.createField("charge_taper_start_soc", "Assumed taper start SOC (%)", "number"));
    behavior.append(this.createField("charge_taper_floor_ratio", "Assumed full-SOC charge ratio", "number"));
    behavior.append(this.createField("solar_projection_hours", "Solar projection horizon (hours)", "number"));
    for (const key of Object.keys(this.config.statistics)) entities.append(this.createField(`statistics.${key}`, `${key} energy statistic ID (optional)`, "text"));
    const required = new Set(["freshness", "inverter_status", "grid_connected", "solar_power", "battery_soc", "battery_power", "grid_power", "load_power"]);
    for (const key of Object.keys(this.config.entities)) entities.append(this.createField(`entities.${key}`, `${key.replaceAll("_", " ")}${required.has(key) ? " *" : ""}`, "text"));
    root.addEventListener("change", (event) => this.handleChange(event));
    this.rendered = true;
  }

  /**
   * Creates a labelled input.
   * @param {string} path Configuration path.
   * @param {string} labelText Visible label.
   * @param {string} type Native input type.
   * @returns {HTMLDivElement} Field wrapper.
   */
  createField(path, labelText, type) {
    const wrapper = document.createElement("div");
    wrapper.className = "field";
    const label = document.createElement("label");
    const input = document.createElement("input");
    input.id = `pf-${path.replaceAll(".", "-")}`;
    input.dataset.path = path;
    input.type = type;
    if (type === "number") input.step = "any";
    label.htmlFor = input.id;
    label.textContent = labelText;
    wrapper.append(label, input);
    return wrapper;
  }

  /**
   * Creates a labelled select.
   * @param {string} path Configuration path.
   * @param {string} labelText Visible label.
   * @param {Array<[string, string]>} options Value-label pairs.
   * @returns {HTMLDivElement} Field wrapper.
   */
  createSelectField(path, labelText, options) {
    const wrapper = document.createElement("div");
    wrapper.className = "field";
    const label = document.createElement("label");
    const select = document.createElement("select");
    select.id = `pf-${path}`;
    select.dataset.path = path;
    label.htmlFor = select.id;
    label.textContent = labelText;
    for (const [value, text] of options) {
      const option = document.createElement("option");
      option.value = value;
      option.textContent = text;
      select.append(option);
    }
    wrapper.append(label, select);
    return wrapper;
  }

  /**
   * Creates the safe local image upload field.
   * @returns {HTMLDivElement} Field wrapper.
   */
  createUploadField() {
    const wrapper = this.createField("image_upload", "Upload inverter image", "file");
    const input = wrapper.querySelector("input");
    input.accept = IMAGE_TYPES.join(",");
    return wrapper;
  }

  /** Copies current config values into controls. */
  sync() {
    if (!this.rendered) return;
    for (const control of this.shadowRoot.querySelectorAll("[data-path]")) {
      if (control.dataset.path === "image_upload") continue;
      const [group, child] = control.dataset.path.split(".");
      const value = child ? this.config[group]?.[child] : this.config[group];
      control.value = Array.isArray(value)?value.join(", "):value ?? "";
    }
  }

  /**
   * Applies one editor change and publishes a standard config-changed event.
   * @param {Event} event Change event.
   */
  async handleChange(event) {
    const control = event.target;
    if (!(control instanceof HTMLInputElement || control instanceof HTMLSelectElement)) return;
    const path = control.dataset.path;
    if (!path) return;
    try {
      let value = control.type === "number" ? Number(control.value) : control.value;
      if(["use_learned_taper","energy_sources_verified","readiness_enabled","preparedness_enabled","grid_power_verified","standby_measurement_verified","solar_outlook_enabled","estimate_accuracy_enabled"].includes(path))value=control.value==="true";
      if(["readiness_average_w","standby_assumed_w"].includes(path)&&control.value==="")value=null;
      if (path === "image_upload" && control instanceof HTMLInputElement && control.files?.[0]) {
        value = await readImageFile(control.files[0]);
        this.config = normalizeConfig({ ...this.config, inverter_image: value });
      } else if (path.startsWith("entities.")) {
        const key = path.slice("entities.".length);
        this.config = normalizeConfig({ ...this.config, entities: { ...this.config.entities, [key]: value } });
      } else if (path.startsWith("statistics.")) {
        const key = path.slice("statistics.".length);
        this.config = normalizeConfig({ ...this.config, statistics: { ...this.config.statistics, [key]: value } });
      } else {
        this.config = normalizeConfig({ ...this.config, [path]: value });
      }
      this.setError("");
      this.guide.configure(this.config);
      this.dispatchEvent(new CustomEvent("config-changed", { detail: { config: this.config }, bubbles: true, composed: true }));
    } catch (error) {
      this.setError(error instanceof Error ? error.message : "Configuration could not be updated");
    }
  }

  /**
   * Updates the accessible error region.
   * @param {string} message Error message.
   */
  setError(message) {
    this.shadowRoot.querySelector(".error").textContent = message;
  }
}
