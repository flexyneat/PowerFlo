/**
 * @fileoverview Main read-only Home Assistant PowerFlo custom element.
 */

import { normalizeConfig, validateConfig } from "./config.js";
import { FlowAnimator } from "./flow-engine.js";
import { appendHistoryPoint, downsample, loadTodayHistory, sparklinePath } from "./history.js";
import { batteryBankIcon, gridIcon, inverterIcon, loadIcon, solarIcon } from "./icons.js";
import { deriveModel } from "./state-model.js";
import { BatteryRuntimeEstimator, formatRuntime } from "./runtime.js";
import { cardStyles } from "./styles.js";

const FLOW_NAMES = Object.freeze(["solar", "grid", "battery", "load"]);
const SUMMARY_NAMES = Object.freeze(["solar", "grid", "load", "battery"]);

/**
 * Formats watts as kW with two decimal places.
 * @param {number | null} watts Power in watts.
 * @returns {string} Human-readable power.
 */
export function formatPower(watts) {
  return watts === null ? "—" : `${(Math.abs(watts) / 1000).toFixed(2)} kW`;
}

/**
 * Formats a nullable value with a unit.
 * @param {number | null} value Numeric value.
 * @param {string} unit Unit suffix.
 * @param {number} digits Decimal places.
 * @returns {string} Human-readable value.
 */
export function formatValue(value, unit, digits = 1) {
  return value === null ? "—" : `${value.toFixed(digits)} ${unit}`;
}

/**
 * Capitalizes one domain-state label.
 * @param {string} value Domain value.
 * @returns {string} Display label.
 */
function label(value) {
  return value ? `${value.charAt(0).toUpperCase()}${value.slice(1)}` : "Unavailable";
}

/** Main PowerFlo Home Assistant card. */
export class PowerFloCard extends HTMLElement {
  /** Creates isolated state and DOM. */
  constructor() {
    super();
    this.attachShadow({ mode: "open" });
    this.config = normalizeConfig();
    this.hassValue = null;
    this.rendered = false;
    this.pendingFrame = 0;
    this.clockTimer = 0;
    this.historyKey = "";
    this.history = new Map();
    this.polarity = { battery: "stopped", grid: "stopped" };
    this.runtimeEstimator = new BatteryRuntimeEstimator();
    this.animators = new Map();
    this.visible = true;
    this.reducedMotion = matchMedia("(prefers-reduced-motion: reduce)");
  }

  /**
   * Receives user configuration and rejects missing required mappings.
   * @param {Object} rawConfig Raw Lovelace configuration.
   */
  setConfig(rawConfig) {
    this.runtimeEstimator.reset();
    this.config = normalizeConfig(rawConfig);
    const errors = validateConfig(this.config);
    if (errors.length) throw new Error(errors.join("; "));
    this.historyKey = "";
    if (!this.rendered) this.render();
    this.updateStaticText();
    this.queueUpdate();
  }

  /**
   * Receives Home Assistant state changes.
   * @param {Object} hass Home Assistant frontend object.
   */
  set hass(hass) {
    this.hassValue = hass;
    this.queueUpdate();
    this.loadHistoryIfNeeded();
  }

  /** Initializes observers and the live clock after connection. */
  connectedCallback() {
    if (!this.rendered) this.render();
    this.clockTimer = window.setInterval(() => this.updateClock(), 1000);
    this.updateClock();
    // Recheck sample age even when HA stops sending state events; do not resample all card histories.
    this.runtimeTimer = window.setInterval(() => {
      if (this.hassValue) this.updateRuntime(deriveModel(this.hassValue.states, this.config, this.polarity));
    }, 1000);
    this.visibilityObserver = new IntersectionObserver(([entry]) => {
      this.visible = entry?.isIntersecting ?? true;
      for (const animator of this.animators.values()) animator.setVisible(this.visible && !document.hidden);
    });
    this.visibilityObserver.observe(this);
    this.visibilityHandler = () => {
      for (const animator of this.animators.values()) animator.setVisible(this.visible && !document.hidden);
    };
    document.addEventListener("visibilitychange", this.visibilityHandler);
    this.motionHandler = (event) => {
      for (const animator of this.animators.values()) animator.setReducedMotion(event.matches);
    };
    this.reducedMotion.addEventListener("change", this.motionHandler);
  }

  /** Releases timers, observers, animation frames, and listeners. */
  disconnectedCallback() {
    window.clearInterval(this.clockTimer);
    window.clearInterval(this.runtimeTimer);
    this.runtimeEstimator.reset();
    if (this.pendingFrame) cancelAnimationFrame(this.pendingFrame);
    this.visibilityObserver?.disconnect();
    document.removeEventListener("visibilitychange", this.visibilityHandler);
    this.reducedMotion.removeEventListener("change", this.motionHandler);
    for (const animator of this.animators.values()) animator.destroy();
    this.animators.clear();
  }

  /**
   * Reports default masonry height.
   * @returns {number} Approximate card rows.
   */
  getCardSize() {
    return 10;
  }

  /**
   * Reports native Sections-grid sizing.
   * @returns {{columns: string; rows: string; min_columns: number; min_rows: number}} Grid constraints.
   */
  getGridOptions() {
    return { columns: "full", rows: "auto", min_columns: 6, min_rows: 8 };
  }

  /**
   * Creates a visual editor instance.
   * @returns {HTMLElement} Registered PowerFlo editor.
   */
  static getConfigElement() {
    return document.createElement("powerflo-card-editor");
  }

  /**
   * Returns starter configuration without invented entity IDs.
   * @returns {Object} Safe stub configuration.
   */
  static getStubConfig() {
    return normalizeConfig();
  }

  /** Builds the static DOM once. */
  render() {
    const root = this.shadowRoot;
    root.innerHTML = `<style>${cardStyles()}</style><ha-card><div class="shell"><header class="header"><div class="identity"><div class="title"></div><div class="status"></div></div><div class="freshness"></div><time class="clock"></time></header><div class="notice" role="status" aria-live="polite"></div><main class="topology"><section class="node solar"><div class="node-icon">${solarIcon()}</div><div class="node-content"><div class="node-title">Solar</div><div class="node-value" data-value="solar"></div><div class="mppts"><div class="mppt">MPPT 1<strong data-value="pv1"></strong></div><div class="mppt">MPPT 2<strong data-value="pv2"></strong></div><div class="mppt">MPPT 3<strong data-value="pv3"></strong></div></div></div></section><section class="node grid"><div class="node-icon">${gridIcon()}</div><div class="node-content"><div class="node-title">Grid</div><div class="node-value" data-value="grid"></div><div class="node-meta" data-meta="grid"></div></div></section><section class="inverter"><div class="inverter-visual"></div><div class="inverter-name"></div><div class="inverter-model"></div><div class="inverter-capacity"></div><div class="inverter-state"></div></section><section class="node battery"><div class="node-icon">${batteryBankIcon()}</div><div class="node-content"><div class="node-title">Battery</div><div class="node-value" data-value="soc"></div><div class="node-meta" data-value="battery"></div><div class="node-meta" data-meta="battery"></div><div class="node-meta" data-meta="battery-capacity"></div></div></section><section class="node load"><div class="node-icon">${loadIcon()}</div><div class="node-content"><div class="node-title">Protected load</div><div class="node-value" data-value="load"></div></div></section><svg class="connectors" viewBox="0 0 1000 600" preserveAspectRatio="none" aria-hidden="true"><defs>${FLOW_NAMES.map((name) => `<marker id="arrow-${name}" viewBox="0 0 10 10" refX="5" refY="5" markerWidth="5" markerHeight="5" orient="auto-start-reverse"><path d="M0 0 10 5 0 10Z" fill="var(--pf-${name === "solar" ? "solar" : name === "grid" ? "grid" : name === "battery" ? "battery" : "load"})"/></marker>`).join("")}</defs>${this.flowMarkup("solar", "M330 145 H430 V245")}${this.flowMarkup("grid", "M670 145 H570 V245")}${this.flowMarkup("battery", "M330 455 H430 V355")}${this.flowMarkup("load", "M670 455 H570 V355")}</svg></main><footer class="summaries"><div class="today">Today</div>${SUMMARY_NAMES.map((name) => `<section class="summary" data-domain="${name}"><div class="summary-header"><span>${name === "solar" ? "Solar" : label(name)}</span><span class="summary-value" data-summary-value="${name}"></span></div><svg class="spark" viewBox="0 0 100 36" preserveAspectRatio="none" aria-hidden="true"><path class="area" data-summary-area="${name}"></path><path data-summary-path="${name}"></path></svg><div class="spark-labels"><span>12 AM</span><span>Now</span></div></section>`).join("")}</footer></div></ha-card>`;
    this.rendered = true;
    const runtime = document.createElement("div");
    runtime.className = "node-meta";
    runtime.dataset.meta = "battery-runtime";
    const basis = document.createElement("div");
    basis.className = "node-meta";
    basis.dataset.meta = "runtime-basis";
    this.shadowRoot.querySelector(".battery .node-content").append(runtime, basis);
    this.createAnimators();
    this.updateStaticText();
  }

  /**
   * Creates one trusted SVG connector and particles.
   * @param {string} name Flow name.
   * @param {string} path Path geometry.
   * @returns {string} Trusted SVG markup.
   */
  flowMarkup(name, path) {
    return `<g class="flow-${name}"><path class="flow-path" data-flow-path="${name}" d="${path}"></path><circle class="particle" data-flow-particle="${name}" r="4"></circle><circle class="particle" data-flow-particle="${name}" r="4"></circle><circle class="particle" data-flow-particle="${name}" r="4"></circle></g>`;
  }

  /** Creates transform-only animators for every connector. */
  createAnimators() {
    for (const name of FLOW_NAMES) {
      const path = this.shadowRoot.querySelector(`[data-flow-path="${name}"]`);
      const particles = [...this.shadowRoot.querySelectorAll(`[data-flow-particle="${name}"]`)];
      const animator = new FlowAnimator(path, particles);
      animator.setReducedMotion(this.reducedMotion.matches);
      this.animators.set(name, animator);
    }
  }

  /** Updates user-configurable labels and safe inverter art. */
  updateStaticText() {
    if (!this.rendered) return;
    this.setText(".title", this.config.title);
    this.setText(".inverter-name", this.config.inverter_name);
    this.setText(".inverter-model", this.config.inverter_model);
    this.setText(".inverter-capacity", `${this.config.inverter_capacity_kw} kW`);
    this.setText("[data-meta='battery-capacity']", `Total capacity ${this.config.battery_capacity_kwh.toFixed(2)} kWh`);
    const visual = this.shadowRoot.querySelector(".inverter-visual");
    visual.replaceChildren();
    if (this.config.inverter_image) {
      const image = document.createElement("img");
      image.src = this.config.inverter_image;
      image.alt = `${this.config.inverter_name} ${this.config.inverter_model}`.trim();
      image.decoding = "async";
      visual.append(image);
    } else {
      visual.innerHTML = inverterIcon();
    }
  }

  /** Schedules one render-model update for the next frame. */
  queueUpdate() {
    if (this.pendingFrame || !this.rendered || !this.hassValue) return;
    this.pendingFrame = requestAnimationFrame(() => {
      this.pendingFrame = 0;
      this.updateModel();
    });
  }

  /** Derives and applies the latest Home Assistant state model. */
  updateModel() {
    const model = deriveModel(this.hassValue.states, this.config, this.polarity);
    this.polarity = model.polarity;
    this.dataset.state = model.dataState;
    this.setText(".status", `${label(model.inverterStatus)} · ${model.connected ? "On-grid" : "Off-grid"}`);
    this.setText(".freshness", model.dataState === "fresh" ? "LIVE" : label(model.dataState));
    this.setText(".notice", model.dataState === "fresh" ? "" : `Telemetry is ${model.dataState}; flow motion is paused.`);
    this.setText(".inverter-state", label(model.inverterStatus));
    this.setText('[data-value="solar"]', formatPower(model.values.solarPower));
    this.setText('[data-value="pv1"]', formatPower(model.values.pv1Power));
    this.setText('[data-value="pv2"]', formatPower(model.values.pv2Power));
    this.setText('[data-value="pv3"]', formatPower(model.values.pv3Power));
    this.setText('[data-value="grid"]', formatPower(model.values.gridPower));
    this.setText('[data-meta="grid"]', `${label(model.grid)} · ${formatValue(model.values.gridVoltage, "V", 1)} · ${formatValue(model.values.gridFrequency, "Hz", 1)}`);
    this.setText('[data-value="soc"]', formatValue(model.values.batterySoc, "%", 0));
    this.setText('[data-value="battery"]', formatPower(model.values.batteryPower));
    this.setText('[data-meta="battery"]', `${label(model.battery)} · ${formatValue(model.values.batteryVoltage, "V", 1)} · ${formatValue(model.values.batteryTemperature, "°C", 1)}`);
    this.updateRuntime(model);
    this.setText('[data-value="load"]', formatPower(model.values.loadPower));
    const today = { solar: model.values.solarToday, grid: model.values.gridToday, load: model.values.loadToday, battery: model.values.batteryToday };
    for (const name of SUMMARY_NAMES) this.setText(`[data-summary-value="${name}"]`, formatValue(today[name], "kWh", 1));
    this.appendLiveHistory(today);
    this.updateHistory();
    const powers = { solar: model.values.solarPower, grid: model.values.gridPower, battery: model.values.batteryPower, load: model.values.loadPower };
    for (const name of FLOW_NAMES) this.applyFlow(name, model.flows[name], powers[name], model.dataState === "fresh");
  }

  /**
   * Applies the smoothed estimate without re-sampling unrelated Home Assistant updates.
   * @param {Object} model Current battery-domain render model.
   */
  updateRuntime(model) {
    const now = Date.now();
    const entity = this.hassValue.states[this.config.entities.battery_power];
    const sampleTime = Date.parse(entity?.last_reported ?? entity?.last_updated ?? "");
    const result = this.runtimeEstimator.observe({
      now, sampleTime, power: model.values.batteryPower === null ? null : Math.abs(model.values.batteryPower),
      soc: model.values.batterySoc, mode: model.battery, fresh: model.dataState === "fresh",
      capacityKwh: this.config.battery_capacity_kwh, reserveSoc: this.config.battery_reserve_soc,
      windowMs: this.config.runtime_window_minutes * 60_000,
      maxAgeMs: this.config.runtime_max_sample_age_seconds * 1000,
    });
    const labels = { warming: "Collecting discharge data", charging: "Charging", static: "Not discharging",
      unavailable: "Unavailable", reserve: "Reserve reached" };
    this.setText('[data-meta="battery-runtime"]', `Estimated runtime: ${result.status === "ready" ? formatRuntime(result.hours) : labels[result.status]}`);
    this.setText('[data-meta="runtime-basis"]', `To ${this.config.battery_reserve_soc}% reserve${result.status === "ready" ? ` · ${Math.round(result.averageWatts)} W recent average` : ""}`);
  }

  /**
   * Extends each current-day series with its latest live entity state.
   * @param {{solar: number | null; grid: number | null; load: number | null; battery: number | null}} today Current daily totals.
   */
  appendLiveHistory(today) {
    const time = Date.now();
    for (const name of SUMMARY_NAMES) {
      const entityId = this.config.entities[`${name}_today`];
      const value = today[name];
      if (!entityId || value === null) continue;
      this.history.set(entityId, appendHistoryPoint(this.history.get(entityId) ?? [], { time, value }));
    }
  }

  /**
   * Applies direction markers and particle motion to one connector.
   * @param {string} name Connector name.
   * @param {"forward" | "reverse" | "stopped"} direction Derived direction.
   * @param {number | null} watts Live power.
   * @param {boolean} fresh Whether data is fresh.
   */
  applyFlow(name, direction, watts, fresh) {
    const effective = fresh ? direction : "stopped";
    const path = this.shadowRoot.querySelector(`[data-flow-path="${name}"]`);
    path.removeAttribute("marker-start");
    path.removeAttribute("marker-end");
    if (effective === "forward") path.setAttribute("marker-end", `url(#arrow-${name})`);
    if (effective === "reverse") path.setAttribute("marker-start", `url(#arrow-${name})`);
    this.animators.get(name)?.setFlow(effective, watts);
  }

  /** Updates the 12-hour or 24-hour clock. */
  updateClock() {
    const clock = this.shadowRoot.querySelector(".clock");
    if (!clock) return;
    const hour12 = this.config.clock_format !== "24";
    clock.dateTime = new Date().toISOString();
    clock.textContent = new Intl.DateTimeFormat(undefined, {
      hour: "numeric",
      minute: "2-digit",
      second: "2-digit",
      hour12,
      timeZone: this.hassValue?.config?.time_zone,
    }).format(new Date());
  }

  /** Loads history only when the mapped summary entity set changes. */
  async loadHistoryIfNeeded() {
    if (!this.hassValue || !this.rendered) return;
    const ids = SUMMARY_NAMES.map((name) => this.config.entities[`${name}_today`]);
    const day = new Intl.DateTimeFormat("en-CA", { timeZone: this.hassValue.config.time_zone }).format(new Date());
    const key = `${day}|${ids.join("|")}`;
    if (key === this.historyKey) return;
    this.historyKey = key;
    try {
      this.history = await loadTodayHistory(this.hassValue, ids);
      this.updateHistory();
    } catch {
      this.history = new Map();
      this.updateHistory();
    }
  }

  /** Renders every summary sparkline or its explicit no-history state. */
  updateHistory() {
    for (const name of SUMMARY_NAMES) {
      const id = this.config.entities[`${name}_today`];
      const points = downsample(this.history.get(id) ?? [], 80);
      const line = sparklinePath(points);
      const lineElement = this.shadowRoot.querySelector(`[data-summary-path="${name}"]`);
      const areaElement = this.shadowRoot.querySelector(`[data-summary-area="${name}"]`);
      lineElement.setAttribute("d", line);
      areaElement.setAttribute("d", line ? `${line} L100 36 L0 36 Z` : "");
      const summary = this.shadowRoot.querySelector(`.summary[data-domain="${name}"]`);
      summary.setAttribute("aria-label", line ? `${label(name)} history from midnight to now` : `${label(name)}: no history available`);
    }
  }

  /**
   * Writes text without HTML interpretation.
   * @param {string} selector Element selector.
   * @param {string} value Text value.
   */
  setText(selector, value) {
    const element = this.shadowRoot.querySelector(selector);
    if (element && element.textContent !== value) element.textContent = value;
  }
}
