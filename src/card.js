/** @fileoverview PowerFlo's read-only live topology, battery forecasts, and period history. */
import { normalizeConfig, validateConfig } from "./config.js";
import { FlowAnimator } from "./flow-engine.js";
import { appendHistoryPoint, downsample, sparklinePath } from "./history.js";
import { batteryBankIcon, gridIcon, inverterIcon, loadIcon, solarIcon } from "./icons.js";
import { loadPeriodHistory, periodEnergy, periodRange } from "./period-history.js";
import { deriveModel } from "./state-model.js";
import { BatteryChargeEstimator, BatteryRuntimeEstimator, formatRuntime } from "./runtime.js";
import { cardStyles } from "./styles.js";
import { FLOW_GEOMETRY } from "./tokens.js";

const FLOW_NAMES = Object.freeze(["solar", "grid", "battery", "load"]);
const SUMMARY_NAMES = Object.freeze(["solar", "grid", "load", "battery"]);
const PERIODS = Object.freeze(["today", "week", "month"]);

/**
 * Formats signed watts as an absolute displayed magnitude; direction is labelled separately.
 * @param {number | null} watts Power in W.
 * @returns {string} Power in kW.
 */
export function formatPower(watts) {
  return watts === null ? "—" : `${(Math.abs(watts) / 1000).toFixed(2)} kW`;
}

/**
 * Formats nullable telemetry without treating unknown as zero.
 * @param {number | null} value Numeric reading.
 * @param {string} unit Unit label.
 * @param {number} digits Decimal places.
 * @returns {string} Display value.
 */
export function formatValue(value, unit, digits = 1) {
  return value === null ? "—" : `${value.toFixed(digits)} ${unit}`;
}

/**
 * Capitalizes trusted state labels.
 * @param {string} value Domain state.
 * @returns {string} Visible label.
 */
function label(value) {
  return value ? value.charAt(0).toUpperCase() + value.slice(1) : "Unavailable";
}

/** Home Assistant custom card with isolated presentation state. */
export class PowerFloCard extends HTMLElement {
  /** Initializes domain sessions, history request state, and the Shadow DOM. */
  constructor() {
    super();
    this.attachShadow({ mode: "open" });
    this.config = normalizeConfig();
    this.hassValue = null;
    this.latestModel = null;
    this.rendered = false;
    this.pendingFrame = 0;
    this.historyKey = "";
    this.period = "today";
    this.history = new Map();
    this.historyCache = new Map();
    this.historyState = { status: "idle" };
    this.historyRequest = 0;
    this.lastDayCheck = 0;
    this.polarity = { battery: "stopped", grid: "stopped" };
    this.runtimeEstimator = new BatteryRuntimeEstimator();
    this.chargeEstimator = new BatteryChargeEstimator();
    this.animators = new Map();
    this.visible = true;
    this.reducedMotion = matchMedia("(prefers-reduced-motion: reduce)");
  }

  /**
   * Validates and applies dashboard configuration.
   * @param {Object} rawConfig User configuration.
   */
  setConfig(rawConfig) {
    this.config = normalizeConfig(rawConfig);
    const errors = validateConfig(this.config);
    if (errors.length) throw new Error(errors.join("; "));
    this.runtimeEstimator.reset();
    this.chargeEstimator.reset();
    this.latestModel = null;
    this.historyRequest += 1;
    this.historyKey = "";
    this.historyCache.clear();
    this.history.clear();
    if (!this.rendered) this.render();
    this.updateStaticText();
    this.queueUpdate();
    this.loadHistoryIfNeeded();
  }

  /**
   * Receives live Home Assistant states.
   * @param {Object} hass Home Assistant frontend context.
   */
  set hass(hass) {
    this.hassValue = hass;
    this.queueUpdate();
    this.loadHistoryIfNeeded();
  }

  /** Connects clocks and visibility observers, including after a dashboard reattachment. */
  connectedCallback() {
    if (!this.rendered) this.render();
    if (!this.animators.size) this.createAnimators();
    this.clockTimer = window.setInterval(() => this.updateClock(), 1000);
    this.runtimeTimer = window.setInterval(() => {
      if (this.hassValue) this.updateRuntime(deriveModel(this.hassValue.states, this.config, this.polarity));
      if (Date.now() - this.lastDayCheck >= 60_000) {
        this.lastDayCheck = Date.now();
        this.loadHistoryIfNeeded();
      }
    }, 1000);
    this.updateClock();
    this.visibilityObserver = new IntersectionObserver(([entry]) => {
      this.visible = entry?.isIntersecting ?? true;
      this.updateAnimationVisibility();
    });
    this.visibilityObserver.observe(this);
    this.layoutObserver = new ResizeObserver(() => this.updateConnectorGeometry());
    this.layoutObserver.observe(this.shadowRoot.querySelector(".topology"));
    this.updateConnectorGeometry();
    this.visibilityHandler = () => this.updateAnimationVisibility();
    this.motionHandler = event => { for (const animator of this.animators.values()) animator.setReducedMotion(event.matches); };
    document.addEventListener("visibilitychange", this.visibilityHandler);
    this.reducedMotion.addEventListener("change", this.motionHandler);
    this.queueUpdate();
    this.loadHistoryIfNeeded();
  }

  /** Releases timers, sessions, pending callbacks, and observers. */
  disconnectedCallback() {
    window.clearInterval(this.clockTimer);
    window.clearInterval(this.runtimeTimer);
    if (this.pendingFrame) cancelAnimationFrame(this.pendingFrame);
    this.pendingFrame = 0;
    this.historyRequest += 1;
    this.historyKey = "";
    this.runtimeEstimator.reset();
    this.chargeEstimator.reset();
    this.visibilityObserver?.disconnect();
    this.layoutObserver?.disconnect();
    document.removeEventListener("visibilitychange", this.visibilityHandler);
    this.reducedMotion.removeEventListener("change", this.motionHandler);
    for (const animator of this.animators.values()) animator.destroy();
    this.animators.clear();
  }

  /** Updates animation visibility independently of telemetry. */
  updateAnimationVisibility() {
    for (const animator of this.animators.values()) animator.setVisible(this.visible && !document.hidden);
  }

  /** Anchors connector endpoints to actual panel edges so flows never cross inverter text. */
  updateConnectorGeometry() {
    const canvas = this.shadowRoot.querySelector(".topology").getBoundingClientRect();
    if (!canvas.width || !canvas.height) return;
    const inverter = this.shadowRoot.querySelector(".inverter").getBoundingClientRect();
    const x = coordinate => (coordinate - canvas.left) / canvas.width * FLOW_GEOMETRY.width;
    const y = coordinate => (coordinate - canvas.top) / canvas.height * FLOW_GEOMETRY.height;
    for (const name of FLOW_NAMES) {
      const node = this.shadowRoot.querySelector(`.node.${name}`).getBoundingClientRect();
      const left = name === "solar" || name === "battery";
      const upper = name === "solar" || name === "grid";
      const fromX = x(left ? node.right : node.left);
      const fromY = y(node.top + node.height / 2);
      const toX = x(left ? inverter.left : inverter.right);
      const toY = y(inverter.top + inverter.height * (upper ? FLOW_GEOMETRY.upperAnchor : FLOW_GEOMETRY.lowerAnchor));
      this.shadowRoot.querySelector(`[data-flow-path="${name}"]`).setAttribute("d", `M${fromX} ${fromY} H${(fromX + toX) / 2} V${toY} H${toX}`);
    }
  }

  /** @returns {number} Default masonry rows. */
  getCardSize() { return 12; }

  /** @returns {Object} Sections grid constraints. */
  getGridOptions() { return { columns: "full", rows: "auto", min_columns: 6, min_rows: 8 }; }

  /** @returns {HTMLElement} Native visual configuration editor. */
  static getConfigElement() { return document.createElement("powerflo-card-editor"); }

  /** @returns {Object} Starter configuration without invented entity IDs. */
  static getStubConfig() { return normalizeConfig(); }

  /** Creates trusted markup and keyboard-operable period controls once. */
  render() {
    this.shadowRoot.innerHTML = `<style>${cardStyles()}</style><ha-card><div class="shell">
      <header class="header"><div><div class="title"></div><div class="status"></div></div><div class="freshness"></div><time class="clock"></time></header>
      <div class="notice" role="status" aria-live="polite"></div>
      <main class="topology">
        <section class="node solar"><div class="node-icon">${solarIcon()}</div><div class="node-content"><div class="node-title">Solar</div><div class="node-value" data-value="solar"></div><div class="mppts">${[1, 2, 3].map(i => `<div class="mppt">MPPT ${i}<strong data-value="pv${i}"></strong></div>`).join("")}</div></div></section>
        <section class="node grid"><div class="node-icon">${gridIcon()}</div><div class="node-content"><div class="node-title">Grid</div><div class="node-value" data-value="grid"></div><div class="node-meta" data-meta="grid"></div></div></section>
        <section class="inverter"><div class="inverter-visual"></div><div class="inverter-name"></div><div class="inverter-model"></div><div class="inverter-capacity"></div><div class="inverter-state"></div></section>
        <section class="node battery"><div class="node-content"><div class="battery-heading"><div class="node-title">Battery</div><div class="node-icon">${batteryBankIcon()}</div></div>
          <div class="battery-reading"><div class="soc-ring"><svg viewBox="0 0 100 100" aria-hidden="true"><circle class="soc-track" cx="50" cy="50" r="44"/><circle class="soc-fill" cx="50" cy="50" r="44" pathLength="100"/></svg><div class="soc-value" data-value="soc"></div></div><div><div class="node-value" data-value="battery"></div><div class="node-meta" data-meta="battery"></div><div class="node-meta" data-meta="battery-capacity"></div></div></div>
          <div class="forecasts"><div><div class="forecast-label">Runtime estimate</div><div class="forecast-value" data-meta="battery-runtime"></div><div class="forecast-basis" data-meta="runtime-basis"></div></div><div><div class="forecast-label" data-meta="charge-label">Time to full</div><div class="forecast-value" data-meta="battery-charge"></div><div class="forecast-basis" data-meta="charge-basis"></div></div></div>
        </div></section>
        <section class="node load"><div class="node-icon">${loadIcon()}</div><div class="node-content"><div class="node-title">Protected load</div><div class="node-value" data-value="load"></div><div class="node-meta">Live inverter output</div></div></section>
        <svg class="connectors" viewBox="0 0 1000 600" preserveAspectRatio="none" aria-hidden="true"><defs>${FLOW_NAMES.map(name => `<marker id="arrow-${name}" viewBox="0 0 10 10" refX="5" refY="5" markerWidth="5" markerHeight="5" orient="auto-start-reverse"><path d="M0 0 10 5 0 10Z" fill="var(--pf-${name})"/></marker>`).join("")}</defs>${this.flowMarkup("solar", "M330 145 H430 V245")}${this.flowMarkup("grid", "M670 145 H570 V245")}${this.flowMarkup("battery", "M330 455 H430 V355")}${this.flowMarkup("load", "M670 455 H570 V355")}</svg>
      </main>
      <div class="history-toolbar"><div><div class="history-heading">Energy history</div><div class="history-caption"></div></div><div class="period-controls" role="group" aria-label="Energy history period">${PERIODS.map(period => `<button type="button" data-period="${period}" aria-pressed="${period === this.period}">${label(period)}</button>`).join("")}</div></div>
      <div class="history-message" role="status" aria-live="polite"><span data-history-message></span><button class="retry" type="button" hidden>Retry history</button></div>
      <footer class="summaries">${SUMMARY_NAMES.map(name => `<section class="summary" data-domain="${name}"><div class="summary-header">${label(name)}<span class="summary-value" data-summary-value="${name}"></span></div><div class="summary-coverage" data-coverage="${name}"></div><svg class="spark" viewBox="0 0 100 36" preserveAspectRatio="none" aria-hidden="true"><path class="area" data-summary-area="${name}"></path><path data-summary-path="${name}"></path></svg><div class="spark-labels"><span data-period-start></span><span>Now</span></div></section>`).join("")}</footer>
    </div></ha-card>`;
    for (const button of this.shadowRoot.querySelectorAll("[data-period]")) button.addEventListener("click", () => this.selectPeriod(button.dataset.period));
    this.shadowRoot.querySelector(".retry").addEventListener("click", () => this.loadHistoryIfNeeded(true));
    this.rendered = true;
    this.createAnimators();
    this.updateStaticText();
    this.updateHistory();
  }

  /**
   * Builds immutable connector geometry.
   * @param {string} name Connector identity.
   * @param {string} path SVG geometry.
   * @returns {string} Trusted SVG markup.
   */
  flowMarkup(name, path) {
    return `<g class="flow-${name}"><path class="flow-path" data-flow-path="${name}" d="${path}"></path>${[0, 1, 2].map(() => `<circle class="particle" data-flow-particle="${name}" r="4"></circle>`).join("")}</g>`;
  }

  /** Initializes transform-only animators for the current DOM. */
  createAnimators() {
    for (const name of FLOW_NAMES) {
      const animator = new FlowAnimator(this.shadowRoot.querySelector(`[data-flow-path="${name}"]`), [...this.shadowRoot.querySelectorAll(`[data-flow-particle="${name}"]`)]);
      animator.setReducedMotion(this.reducedMotion.matches);
      animator.setVisible(this.visible && !document.hidden);
      this.animators.set(name, animator);
    }
  }

  /** Applies editable identity and validated image sources without interpreting user HTML. */
  updateStaticText() {
    this.setText(".title", this.config.title);
    this.setText(".inverter-name", this.config.inverter_name);
    this.setText(".inverter-model", this.config.inverter_model);
    this.setText(".inverter-capacity", `${this.config.inverter_capacity_kw} kW`);
    this.setText('[data-meta="battery-capacity"]', `${this.config.battery_capacity_kwh.toFixed(2)} kWh total capacity`);
    this.setText('[data-meta="charge-label"]', this.config.battery_charge_target_soc === 100 ? "Time to full" : `Time to ${this.config.battery_charge_target_soc}%`);
    const visual = this.shadowRoot.querySelector(".inverter-visual");
    visual.replaceChildren();
    if (this.config.inverter_image) {
      const image = document.createElement("img");
      image.src = this.config.inverter_image;
      image.alt = `${this.config.inverter_name} ${this.config.inverter_model}`;
      image.decoding = "async";
      visual.append(image);
    } else visual.innerHTML = inverterIcon();
    this.updateClock();
  }

  /** Coalesces live updates into one browser frame. */
  queueUpdate() {
    if (this.pendingFrame || !this.rendered || !this.hassValue) return;
    this.pendingFrame = requestAnimationFrame(() => { this.pendingFrame = 0; this.updateModel(); });
  }

  /** Projects current domain state into the live display. */
  updateModel() {
    const model = deriveModel(this.hassValue.states, this.config, this.polarity);
    this.latestModel = model;
    this.polarity = model.polarity;
    this.dataset.state = model.dataState;
    this.setText(".status", `${label(model.inverterStatus)} · ${model.connected === null ? "Grid unavailable" : model.connected ? "On-grid" : "Off-grid"}`);
    this.setText(".freshness", model.dataState === "fresh" ? "LIVE" : label(model.dataState));
    this.setText(".notice", model.dataState === "fresh" ? "" : `Telemetry is ${model.dataState}; flow motion is paused.`);
    this.setText(".inverter-state", label(model.inverterStatus));
    const powers = { solar: model.values.solarPower, grid: model.values.gridPower, battery: model.values.batteryPower, load: model.values.loadPower };
    for (const name of FLOW_NAMES) {
      this.setText(`[data-value="${name}"]`, formatPower(powers[name]));
      this.applyFlow(name, model.flows[name], powers[name], model.dataState === "fresh");
    }
    for (const index of [1, 2, 3]) this.setText(`[data-value="pv${index}"]`, formatPower(model.values[`pv${index}Power`]));
    this.setText('[data-value="soc"]', formatValue(model.values.batterySoc, "%", 0));
    const soc = model.values.batterySoc;
    this.shadowRoot.querySelector(".soc-fill").setAttribute("stroke-dasharray", `${soc === null ? 0 : Math.max(0, Math.min(100, soc))} 100`);
    this.setText('[data-meta="battery"]', `${label(model.battery)} · ${formatValue(model.values.batteryVoltage, "V")} · ${formatValue(model.values.batteryTemperature, "°C")}`);
    this.setText('[data-meta="grid"]', `${label(model.grid)} · ${formatValue(model.values.gridVoltage, "V")} · ${formatValue(model.values.gridFrequency, "Hz")}`);
    this.updateRuntime(model);
    this.appendLiveHistory();
    this.updateHistory();
  }

  /**
   * Updates independent charge/discharge estimators from real sensor timestamps.
   * @param {Object} model Current normalized battery model.
   */
  updateRuntime(model) {
    const entity = this.hassValue.states[this.config.entities.battery_power];
    const input = { now: Date.now(), sampleTime: Date.parse(entity?.last_reported ?? entity?.last_updated ?? ""),
      power: model.values.batteryPower === null ? null : Math.abs(model.values.batteryPower), soc: model.values.batterySoc,
      mode: model.battery, fresh: model.dataState === "fresh", capacityKwh: this.config.battery_capacity_kwh,
      reserveSoc: this.config.battery_reserve_soc, targetSoc: this.config.battery_charge_target_soc,
      windowMs: this.config.runtime_window_minutes * 60_000, maxAgeMs: this.config.runtime_max_sample_age_seconds * 1000 };
    const runtime = this.runtimeEstimator.observe(input);
    const charge = this.chargeEstimator.observe(input);
    const states = { warming: "Collecting data", charging: "Charging", discharging: "Not charging", static: "Not discharging",
      unavailable: "Unavailable", reserve: "Reserve reached", target: "Target reached" };
    this.setText('[data-meta="battery-runtime"]', runtime.status === "ready" ? formatRuntime(runtime.hours) : runtime.status === "warming" ? "Collecting discharge data" : states[runtime.status]);
    this.setText('[data-meta="runtime-basis"]', `To ${this.config.battery_reserve_soc}% reserve${runtime.status === "ready" ? ` · ${Math.round(runtime.averageWatts)} W recent average` : ""}`);
    this.setText('[data-meta="battery-charge"]', charge.status === "ready" ? formatRuntime(charge.hours) : charge.status === "warming" ? "Collecting charge data" : charge.status === "static" ? "Not charging" : states[charge.status]);
    this.setText('[data-meta="charge-basis"]', charge.status === "ready" ? `At recent charge rate${input.soc >= 90 ? " · Taper may extend this" : ""}` : `To ${this.config.battery_charge_target_soc}% SOC`);
  }

  /** Appends only fresh numeric live daily counters to the selected history. */
  appendLiveHistory() {
    if (!this.latestModel || this.latestModel.dataState !== "fresh") return;
    const timeZone = this.hassValue.config?.time_zone ?? Intl.DateTimeFormat().resolvedOptions().timeZone;
    const midnight = periodRange("today", new Date(), timeZone).start.getTime();
    for (const name of SUMMARY_NAMES) {
      const id = this.config.entities[`${name}_today`];
      const value = this.latestModel.values[`${name}Today`];
      if (!id || value === null || value < 0) continue;
      const entity = this.hassValue.states[id];
      const sampleTime = Date.parse(entity?.last_reported ?? entity?.last_updated ?? "");
      // A previous day's retained counter must not seed this day's maximum before its reset arrives.
      if (!Number.isFinite(sampleTime) || sampleTime < midnight || sampleTime > Date.now()) continue;
      const existing = this.history.get(id) ?? [];
      // Recorder's loaded past must remain intact; only the current endpoint needs a new sample.
      if (existing.at(-1)?.value === value) continue;
      this.history.set(id, appendHistoryPoint(existing, { time: Date.now(), value }, 0, Math.max(2000, existing.length + 1)));
    }
  }

  /**
   * Applies directional arrowheads and particles.
   * @param {string} name Connector identity.
   * @param {string} direction Normalized direction.
   * @param {number | null} watts Power magnitude.
   * @param {boolean} fresh Data freshness.
   */
  applyFlow(name, direction, watts, fresh) {
    const effective = fresh ? direction : "stopped";
    const path = this.shadowRoot.querySelector(`[data-flow-path="${name}"]`);
    path.removeAttribute("marker-start"); path.removeAttribute("marker-end");
    if (effective === "forward") path.setAttribute("marker-end", `url(#arrow-${name})`);
    if (effective === "reverse") path.setAttribute("marker-start", `url(#arrow-${name})`);
    this.animators.get(name)?.setFlow(effective, watts);
  }

  /** Updates the clock in Home Assistant's timezone. */
  updateClock() {
    const clock = this.shadowRoot.querySelector(".clock");
    clock.dateTime = new Date().toISOString();
    clock.textContent = new Intl.DateTimeFormat(undefined, { hour: "numeric", minute: "2-digit", second: "2-digit",
      hour12: this.config.clock_format !== "24", timeZone: this.hassValue?.config?.time_zone }).format(new Date());
  }

  /**
   * Selects a period while keeping live topology unchanged.
   * @param {string} period Requested period.
   */
  selectPeriod(period) {
    if (!PERIODS.includes(period) || period === this.period) return;
    this.period = period;
    for (const button of this.shadowRoot.querySelectorAll("[data-period]")) button.setAttribute("aria-pressed", String(button.dataset.period === period));
    this.loadHistoryIfNeeded();
  }

  /**
   * Fetches/caches one period and rejects late responses after a period/configuration switch.
   * @param {boolean} force Whether the user requested a retry.
   */
  async loadHistoryIfNeeded(force = false) {
    if (!this.hassValue || !this.rendered) return;
    const timeZone = this.hassValue.config?.time_zone ?? Intl.DateTimeFormat().resolvedOptions().timeZone;
    const range = periodRange(this.period, new Date(), timeZone);
    const ids = SUMMARY_NAMES.map(name => this.config.entities[`${name}_today`]);
    const day = new Intl.DateTimeFormat("en-CA", { timeZone }).format(new Date());
    const key = `${timeZone}|${day}|${this.period}|${ids.join("|")}`;
    if (!force && key === this.historyKey) return;
    this.historyKey = key;
    const request = ++this.historyRequest;
    this.history = this.historyCache.get(key) ?? new Map();
    if (!force && this.historyCache.has(key)) {
      this.historyState = { status: "ready" };
      this.appendLiveHistory(); this.updateHistory(); return;
    }
    this.historyState = { status: "loading" };
    this.updateHistory();
    try {
      const history = await loadPeriodHistory(this.hassValue, ids, range);
      if (request !== this.historyRequest) return;
      this.history = history;
      this.historyState = { status: "ready" };
      this.appendLiveHistory();
      this.historyCache.set(key, this.history);
      while (this.historyCache.size > 3) this.historyCache.delete(this.historyCache.keys().next().value);
    } catch {
      if (request !== this.historyRequest) return;
      this.historyState = { status: "error" };
    }
    this.updateHistory();
  }

  /** Renders fixed-axis cumulative energy graphs with explicit recorded/partial coverage. */
  updateHistory() {
    if (!this.rendered) return;
    const timeZone = this.hassValue?.config?.time_zone ?? Intl.DateTimeFormat().resolvedOptions().timeZone;
    const range = periodRange(this.period, new Date(), timeZone);
    const startLabel = this.period === "today" ? "12 AM" : new Intl.DateTimeFormat(undefined, { timeZone, month: "short", day: "numeric" }).format(range.start);
    this.setText(".history-caption", this.period === "today" ? "Today · midnight to now" : this.period === "week" ? "Last 7 local days · recorded energy" : "This month · recorded energy");
    const loading = this.historyState.status === "loading";
    const failed = this.historyState.status === "error";
    this.setText("[data-history-message]", loading ? "Loading Recorder history…" : failed ? "History could not be loaded. Check Recorder access and retry." : "");
    this.shadowRoot.querySelector(".retry").hidden = !failed;
    this.shadowRoot.querySelector(".history-message").hidden = !loading && !failed;
    this.shadowRoot.querySelector(".summaries").setAttribute("aria-busy", String(loading));
    for (const name of SUMMARY_NAMES) {
      const id = this.config.entities[`${name}_today`];
      const result = periodEnergy(this.history.get(id) ?? [], range, timeZone);
      const entity = this.hassValue?.states[id];
      const sampleTime = Date.parse(entity?.last_reported ?? entity?.last_updated ?? "");
      const todayStart = periodRange("today", range.end, timeZone).start.getTime();
      const live = sampleTime >= todayStart && sampleTime <= range.end.getTime() ? this.latestModel?.values[`${name}Today`] ?? null : null;
      const total = this.period === "today" ? live ?? result.total : result.total;
      this.setText(`[data-summary-value="${name}"]`, formatValue(total, "kWh"));
      this.setText(`[data-coverage="${name}"]`, !id ? "Map an energy entity" : loading ? "Loading history" : failed ? "History unavailable" : result.total === null ? "No recorded samples" : this.period === "today" ? "Daily energy" : result.partial ? `Partial · ${result.days}/${range.expectedDays} days recorded` : "Recorded total");
      const line = sparklinePath(downsample(result.points, 100), 100, 36, range);
      this.shadowRoot.querySelector(`[data-summary-path="${name}"]`).setAttribute("d", line);
      const duration = Math.max(1, range.end.getTime() - range.start.getTime());
      const firstX = ((result.points[0]?.time ?? range.start.getTime()) - range.start.getTime()) / duration * 100;
      const lastX = ((result.points.at(-1)?.time ?? range.end.getTime()) - range.start.getTime()) / duration * 100;
      this.shadowRoot.querySelector(`[data-summary-area="${name}"]`).setAttribute("d", line ? `${line} L${lastX} 36 L${firstX} 36 Z` : "");
      const summary = this.shadowRoot.querySelector(`.summary[data-domain="${name}"]`);
      summary.querySelector("[data-period-start]").textContent = startLabel;
      summary.setAttribute("aria-label", `${label(name)}, ${label(this.period)}: ${formatValue(total, "kWh")}. ${result.partial ? "Partial recorded history." : "Recorded history."}`);
    }
  }

  /**
   * Updates text without interpreting telemetry or editable labels as HTML.
   * @param {string} selector Shadow DOM selector.
   * @param {string} value Text content.
   */
  setText(selector, value) {
    const element = this.shadowRoot.querySelector(selector);
    if (element && element.textContent !== value) element.textContent = value;
  }
}
