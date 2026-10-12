/**
 * @fileoverview Accessible visual editor for PowerFlo display and entity mappings.
 */

import { normalizeConfig } from "./config.js";
import { editorStyles } from "./styles.js";

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
  }

  /**
   * Receives and renders card configuration.
   * @param {Object} config Raw card configuration.
   */
  setConfig(config) {
    this.config = normalizeConfig(config);
    if (!this.rendered) this.render();
    this.sync();
  }

  /** Creates the editor DOM once using trusted static markup. */
  render() {
    const root = this.shadowRoot;
    root.innerHTML = `<style>${editorStyles()}</style><div class="editor"><fieldset data-section="appearance"><legend>Appearance</legend></fieldset><fieldset data-section="behavior"><legend>Flow behavior</legend></fieldset><fieldset data-section="entities"><legend>Entities</legend><p class="hint">Use complete entity IDs. Required mappings are marked with an asterisk.</p></fieldset><div class="error" role="status" aria-live="polite"></div></div>`;
    const appearance = root.querySelector('[data-section="appearance"]');
    const behavior = root.querySelector('[data-section="behavior"]');
    const entities = root.querySelector('[data-section="entities"]');
    const appearanceFields = [
      ["title", "Card title", "text"],
      ["inverter_name", "Inverter name", "text"],
      ["inverter_model", "Inverter model", "text"],
      ["inverter_capacity_kw", "Inverter capacity (kW)", "number"],
      ["battery_capacity_kwh", "Battery capacity (kWh)", "number"],
      ["inverter_image", "Inverter image URL", "text"],
    ];
    for (const field of appearanceFields) appearance.append(this.createField(...field));
    appearance.append(this.createUploadField());
    behavior.append(this.createSelectField("clock_format", "Clock format", [["12", "12-hour"], ["24", "24-hour"]]));
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
      control.value = value ?? "";
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
