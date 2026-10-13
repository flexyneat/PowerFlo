/** @fileoverview Integration-independent, read-only live topology, forecasts and period history. */
import { normalizeConfig, validateConfig } from "./config.js";
import { FlowAnimator } from "./flow-engine.js";
import { appendHistoryPoint } from "./history.js";
import { batteryBankIcon, forecastIcon, gridIcon, loadIcon, solarIcon } from "./icons.js";
import { loadPeriodHistory, periodEnergy, periodRange } from "./period-history.js";
import { deriveModel, numericState } from "./state-model.js";
import { BatteryChargeEstimator, BatteryRuntimeEstimator, formatRuntime } from "./runtime.js";
import { cardStyles } from "./styles.js";
import { connectorPath } from "./connector-geometry.js";
import { DEFAULT_ART_BOUNDS, READING_MOTION, CHART_GEOMETRY } from "./tokens.js";
import { readingParts, chartCoordinates, chartPaths } from "./presentation.js";
import { estimateConfidence, projectCharge } from "./charge-model.js";
import { nearestObservation } from "./chart-inspection.js";
import { loadEnergyStatistics } from "./statistics.js";
import { DEMAND_LIMITS, demandSummary, loadDemandHistory } from "./load-trend.js";

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
    this.statisticsHistory = new Map();
    this.chartSeries = new Map();
    this.cursorRatio = null;
    this.cursorPinned = false;
    this.textAnimations = new Map();
    this.lastReadingFeedback = new WeakMap();
    this.inspectionPointer = null;
    this.historyState = { status: "idle" };
    this.historyRequest = 0;
    this.demandSamples = [];
    this.demandRequest = 0;
    this.demandLastFetch = null;
    this.demandLoading = false;
    this.demandState = "idle";
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
    this.statisticsHistory.clear();
    this.demandRequest += 1;
    this.demandSamples = [];
    this.demandLastFetch = null;
    this.demandLoading = false;
    this.demandState = "idle";
    if (!this.rendered) this.render();
    this.updateStaticText();
    this.queueUpdate();
    this.loadHistoryIfNeeded();
    this.loadDemandIfNeeded();
  }

  /**
   * Receives live Home Assistant states.
   * @param {Object} hass Home Assistant frontend context.
   */
  set hass(hass) {
    this.hassValue = hass;
    this.queueUpdate();
    this.loadHistoryIfNeeded();
    this.loadDemandIfNeeded();
  }

  /** Connects clocks and visibility observers, including after a dashboard reattachment. */
  connectedCallback() {
    if (!this.rendered) this.render();
    if (!this.animators.size) this.createAnimators();
    this.clockTimer = window.setInterval(() => this.updateClock(), 1000);
    this.runtimeTimer = window.setInterval(() => {
      if (this.hassValue) this.updateRuntime(deriveModel(this.hassValue.states, this.config, this.polarity));
      if (this.hassValue) { this.updateDemand(); this.loadDemandIfNeeded(); }
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
    this.layoutObserver = new ResizeObserver(() => { this.updateConnectorGeometry(); this.updateInspection(); });
    this.layoutObserver.observe(this.shadowRoot.querySelector(".topology"));
    this.updateConnectorGeometry();
    this.visibilityHandler = () => this.updateAnimationVisibility();
    this.motionHandler = event => { for (const animator of this.animators.values()) animator.setReducedMotion(event.matches); if (event.matches) this.cancelTextAnimations(); };
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
    this.demandRequest += 1;
    this.demandLoading = false;
    this.historyKey = "";
    this.runtimeEstimator.reset();
    this.chargeEstimator.reset();
    this.visibilityObserver?.disconnect();
    this.layoutObserver?.disconnect();
    document.removeEventListener("visibilitychange", this.visibilityHandler);
    this.reducedMotion.removeEventListener("change", this.motionHandler);
    for (const animator of this.animators.values()) animator.destroy();
    this.animators.clear();
    this.cancelTextAnimations();
  }

  /** Updates animation visibility independently of telemetry. */
  updateAnimationVisibility() {
    const wireVisible = getComputedStyle(this.shadowRoot.querySelector(".connectors")).display !== "none";
    for (const animator of this.animators.values()) animator.setVisible(this.visible && !document.hidden && wireVisible);
    if (!this.visible || document.hidden) this.cancelTextAnimations();
  }

  /** Anchors connector endpoints to actual panel edges so flows never cross inverter text. */
  updateConnectorGeometry() {
    const canvas = this.shadowRoot.querySelector(".topology").getBoundingClientRect();
    if (!canvas.width || !canvas.height) return;
    const box = this.shadowRoot.querySelector(".inverter-visual").getBoundingClientRect();
    // Transparent padding in the shipped art must not create a false gap between wire and enclosure.
    const bounds = this.dataset.customImage === "true" ? { left: 0, top: 0, right: 1, bottom: 1 } : DEFAULT_ART_BOUNDS;
    const inverter = { left: box.left + box.width * bounds.left, right: box.left + box.width * bounds.right,
      top: box.top + box.height * bounds.top, bottom: box.top + box.height * bounds.bottom,
      width: box.width * (bounds.right - bounds.left), height: box.height * (bounds.bottom - bounds.top) };
    for (const name of FLOW_NAMES) {
      const node = this.shadowRoot.querySelector(`.node.${name}`).getBoundingClientRect();
      this.shadowRoot.querySelector(`[data-flow-path="${name}"]`).setAttribute("d", connectorPath(canvas, inverter, node, name));
    }
    this.updateAnimationVisibility();
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
      <header class="header"><div class="identity"><div class="title"></div><div class="status"></div></div><div class="live-pill"><span class="freshness"></span><span class="sample-age"></span></div><time class="clock"></time></header>
      <div class="notice" role="status" aria-live="polite"></div>
      <main class="topology">
        <section class="node solar"><div class="node-icon">${solarIcon()}</div><div class="node-content"><div class="node-title">Solar</div><div class="node-value" data-value="solar"></div><div class="mppts">${[1, 2, 3].map(i => `<div class="mppt">MPPT ${i}<strong data-value="pv${i}"></strong></div>`).join("")}</div></div></section>
        <section class="node grid"><div class="node-icon">${gridIcon()}</div><div class="node-content"><div class="node-title">Grid</div><div class="node-value" data-value="grid"></div><div class="node-meta" data-meta="grid"></div></div></section>
        <section class="inverter"><div class="inverter-visual"></div><div class="inverter-copy"><div class="inverter-name"></div><div class="inverter-model"></div><div class="inverter-capacity"></div><div class="inverter-state"></div></div></section>
        <section class="node battery"><div class="battery-header"><div class="node-icon">${batteryBankIcon()}</div><div class="node-title">Battery</div><div class="node-meta" data-battery-status></div></div><div class="battery-readings"><div><div class="node-value" data-value="soc"></div><div class="node-meta">State of charge</div></div><div><div class="node-value" data-value="battery"></div><div class="node-meta" data-battery-power-label></div></div></div><div class="battery-details"><div class="node-meta" data-meta="battery-capacity"></div><div class="node-meta" data-meta="battery"></div></div><div class="battery-estimates"><div><div class="forecast-label" data-battery-target-label></div><div class="forecast-value" data-meta="battery-target"></div></div><div><div class="forecast-label">To full</div><div class="forecast-value" data-meta="battery-full"></div></div></div><div class="node-meta battery-runtime-compact" data-battery-runtime hidden></div><div class="battery-footer"><div class="confidence" data-battery-confidence></div></div></section>
        <section class="node load"><div class="node-icon">${loadIcon()}</div><div class="node-content"><div class="node-title">Protected load</div><div class="node-value" data-value="load"></div><div class="node-meta">Current demand</div></div><div class="load-trend"><svg class="demand-spark" viewBox="0 0 100 36" preserveAspectRatio="none" role="img" aria-label="Recorded protected-load demand over the last 15 minutes"><path data-load-path></path></svg><div class="demand-axis"><span>15 min ago</span><span>Now</span></div><div class="load-statistics"><div><span class="node-meta">Average</span><strong data-load-average></strong></div><div><span class="node-meta">Peak</span><strong data-load-peak></strong></div></div><div class="node-meta" data-load-coverage role="status"></div><button type="button" class="retry demand-retry" hidden>Retry load history</button></div></section>
        <svg class="connectors" viewBox="0 0 1000 600" preserveAspectRatio="none" aria-hidden="true"><defs>${FLOW_NAMES.map(name => `<marker id="arrow-${name}" viewBox="0 0 10 10" refX="5" refY="5" markerWidth="5" markerHeight="5" orient="auto-start-reverse"><path d="M0 0 10 5 0 10Z" fill="var(--pf-${name})"/></marker>`).join("")}</defs>${this.flowMarkup("solar", "M330 145 H430 V245")}${this.flowMarkup("grid", "M670 145 H570 V245")}${this.flowMarkup("battery", "M330 455 H430 V355")}${this.flowMarkup("load", "M670 455 H570 V355")}</svg>
      </main>
      <section class="forecast-strip" aria-label="Battery estimates"><div class="forecast-item"><div class="forecast-label">Runtime to reserve</div><div class="forecast-value" data-meta="battery-runtime"></div><div class="forecast-basis" data-meta="runtime-basis"></div><div class="confidence" data-meta="runtime-confidence"></div></div>${[50,75,95].map(target => `<div class="forecast-item"><div class="forecast-label">Time to ${target}%</div><div class="forecast-value" data-target="${target}"></div><div class="forecast-basis" data-target-basis="${target}"></div></div>`).join("")}<div class="forecast-item"><div class="forecast-label" data-meta="charge-label"></div><div class="forecast-value" data-meta="battery-charge"></div><div class="forecast-basis" data-meta="charge-basis"></div><div class="confidence" data-meta="charge-confidence"></div></div></section>
      <details class="estimate-details"><summary>Estimate confidence and assumptions</summary><div data-meta="confidence-detail"></div></details>
      <div class="history-toolbar"><div><div class="history-heading">Energy history</div><div class="history-caption"></div></div><div class="period-controls" role="group" aria-label="Energy history period">${PERIODS.map(period => `<button type="button" data-period="${period}" aria-pressed="${period === this.period}">${label(period)}</button>`).join("")}</div></div>
      <div class="history-message" role="status" aria-live="polite"><span data-history-message></span><button class="retry" type="button" hidden>Retry history</button></div>
      <footer class="summaries">${SUMMARY_NAMES.map(name => `<section class="summary" data-domain="${name}"><div class="summary-header">${label(name)}<span class="summary-value" data-summary-value="${name}"></span></div><div class="summary-coverage" data-coverage="${name}"></div><svg class="spark" viewBox="0 0 100 36" preserveAspectRatio="none" aria-hidden="true"><path class="area" data-summary-area="${name}"></path><path data-summary-path="${name}"></path><line class="chart-cursor" data-cursor="${name}" y1="0" y2="36" hidden></line></svg><div class="inspection-value" data-inspection="${name}"></div><div class="spark-labels"><span data-period-start></span><span>Now</span></div></section>`).join("")}</footer>
      <div class="chart-inspector"><label for="history-cursor">Inspect recorded time</label><input id="history-cursor" type="range" min="0" max="1000" value="1000"><output class="inspection-time" aria-live="polite">Move over a graph or use the time slider</output></div>
    </div></ha-card>`;
    for (const marker of this.shadowRoot.querySelectorAll("marker")) {
      marker.setAttribute("markerWidth", "4");
      marker.setAttribute("markerHeight", "4");
      const arrow = marker.querySelector("path");
      arrow.setAttribute("stroke", arrow.getAttribute("fill"));
      arrow.setAttribute("fill", "none");
      arrow.setAttribute("stroke-width", "1.8");
      arrow.setAttribute("stroke-linecap", "round");
      arrow.setAttribute("stroke-linejoin", "round");
      arrow.setAttribute("d", "M1 1 7 5 1 9");
    }
    for (const [index, item] of [...this.shadowRoot.querySelectorAll(".forecast-item")].entries()) {
      const content = document.createElement("div");
      content.className = "forecast-content";
      content.append(...item.childNodes);
      const icon = document.createElement("div");
      icon.className = "forecast-icon";
      icon.dataset.forecastIcon = ["runtime", "50", "75", "95", "full"][index];
      icon.setAttribute("aria-hidden", "true");
      item.append(icon, content);
    }
    const estimates = [...this.shadowRoot.querySelectorAll(".forecast-item")];
    const runtime = document.createElement("div"); runtime.className = "runtime-outlook";
    runtime.append(estimates[0]);
    const rail = document.createElement("div"); rail.className = "milestone-rail";
    rail.setAttribute("role", "list"); rail.setAttribute("aria-label", "Charge milestones");
    for (const item of estimates.slice(1)) { item.setAttribute("role", "listitem"); rail.append(item); }
    this.shadowRoot.querySelector(".forecast-strip").replaceChildren(runtime, rail);
    // Move secondary estimates into a native keyboard-accessible disclosure without dropping selectors or states.
    const battery = this.shadowRoot.querySelector(".battery");
    const details = this.shadowRoot.querySelector(".estimate-details");
    details.querySelector("summary").textContent = "Battery details";
    details.querySelector("summary").prepend(this.shadowRoot.querySelector('[data-battery-confidence]'));
    this.shadowRoot.querySelector(".battery-footer").remove();
    details.append(this.shadowRoot.querySelector(".forecast-strip"));
    details.addEventListener("toggle", () => { if (!details.open) this.cancelTextAnimations(); });
    battery.append(details);
    this.shadowRoot.querySelector(".demand-retry").addEventListener("click", () => this.loadDemandIfNeeded(true));
    for (const button of this.shadowRoot.querySelectorAll("[data-period]")) {
      button.addEventListener("click", () => this.selectPeriod(button.dataset.period));
      button.addEventListener("pointerdown", () => button.classList.add("pointer-active"));
      for (const event of ["pointerup", "pointercancel", "pointerleave"]) button.addEventListener(event, () => button.classList.remove("pointer-active"));
    }
    for (const name of SUMMARY_NAMES) {
      const svg = this.shadowRoot.querySelector(`.summary[data-domain="${name}"] .spark`);
      const point = document.createElementNS("http://www.w3.org/2000/svg", "ellipse");
      point.classList.add("chart-point"); point.dataset.chartPoint = name;
      point.setAttribute("visibility", "hidden"); svg.append(point);
      const tooltip = this.shadowRoot.querySelector(`[data-inspection="${name}"]`);
      tooltip.setAttribute("role", "tooltip"); tooltip.id = `point-tooltip-${name}`;
    }
    // Channel readings use the full solar panel width rather than crowding the power column.
    this.shadowRoot.querySelector(".solar").append(this.shadowRoot.querySelector(".mppts"));
    const solarCapacity=document.createElement("div"); solarCapacity.className="node-meta solar-capacity";
    solarCapacity.setAttribute("data-solar-capacity",""); this.shadowRoot.querySelector(".solar").append(solarCapacity);
    this.shadowRoot.querySelector(".history-message .retry").addEventListener("click", () => this.loadHistoryIfNeeded(true));
    const slider = this.shadowRoot.querySelector("#history-cursor");
    slider.setAttribute("aria-describedby", "inspection-time");
    this.shadowRoot.querySelector(".inspection-time").id = "inspection-time";
    slider.addEventListener("input", () => { this.cursorPinned = true; this.cursorRatio = Number(slider.value) / 1000; this.updateInspection(); });
    slider.addEventListener("keydown", event => { if (event.key === "Escape") this.clearInspection(); });
    for (const chart of this.shadowRoot.querySelectorAll(".spark")) {
      chart.addEventListener("pointermove", event => {
        if (this.inspectionPointer !== null && event.pointerId !== this.inspectionPointer) return;
        const rect = chart.getBoundingClientRect();
        if (!rect.width || !Number.isFinite(event.clientX)) return;
        this.cursorRatio = Math.max(0, Math.min(1, (event.clientX - rect.left) / rect.width));
        slider.value = String(Math.round(this.cursorRatio * 1000));
        this.updateInspection();
      });
      chart.addEventListener("pointerdown", event => {
        if (event.isPrimary === false || this.inspectionPointer !== null) return;
        const rect = chart.getBoundingClientRect();
        if (!rect.width || !Number.isFinite(event.clientX)) return;
        this.inspectionPointer = event.pointerId; this.cursorPinned = true;
        this.cursorRatio = Math.max(0, Math.min(1, (event.clientX - rect.left) / rect.width));
        slider.value = String(Math.round(this.cursorRatio * 1000)); this.updateInspection();
        chart.setPointerCapture?.(event.pointerId);
      });
      chart.addEventListener("pointerup", event => { if (event.pointerId === this.inspectionPointer) this.inspectionPointer = null; });
      chart.addEventListener("pointercancel", () => this.clearInspection());
      chart.addEventListener("pointerleave", () => { if (!this.cursorPinned) this.clearInspection(); });
    }
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
    return `<g class="flow-${name}"><path class="flow-path" data-flow-path="${name}" d="${path}"></path>${[0, 1, 2].map(() => `<path class="particle" data-flow-particle="${name}" d="M-5 -4 0 0 -5 4"></path>`).join("")}</g>`;
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
    this.shadowRoot.querySelector(".inverter-model").hidden = !this.config.inverter_model;
    this.setText(".inverter-capacity", `${this.config.inverter_capacity_kw} kW rated`);
    this.setText('[data-meta="battery-capacity"]', `${this.config.battery_capacity_kwh.toFixed(2)} kWh capacity`);
    this.setText('[data-solar-capacity]', `${this.config.solar_capacity_kw} kWp installed`);
    this.shadowRoot.querySelector('[data-solar-capacity]').hidden = this.config.solar_capacity_kw <= 0;
    this.setText('[data-battery-target-label]', `To ${this.config.battery_charge_target_soc === 100 ? 95 : this.config.battery_charge_target_soc}%`);
    this.setText('[data-meta="charge-label"]', this.config.battery_charge_target_soc === 100 ? "Time to full" : `Time to ${this.config.battery_charge_target_soc}%`);
    const rail = this.shadowRoot.querySelector(".milestone-rail");
    for (const key of ["50", "75", "95", "full"]) {
      const item = this.shadowRoot.querySelector(`[data-forecast-icon="${key}"]`).parentElement;
      item.dataset.chargeTarget = key === "full" ? String(this.config.battery_charge_target_soc) : key;
      item.hidden = key !== "full" && Number(key) === this.config.battery_charge_target_soc;
    }
    const ordered = [...rail.children].sort((a, b) => Number(a.dataset.chargeTarget) - Number(b.dataset.chargeTarget));
    rail.append(...ordered);
    rail.style.setProperty("--pf-milestone-count", String(ordered.filter(item => !item.hidden).length));
    const visual = this.shadowRoot.querySelector(".inverter-visual");
    visual.replaceChildren();
    if (this.config.inverter_image) {
      const image = document.createElement("img");
      image.src = this.config.inverter_image;
      image.alt = `${this.config.inverter_name} ${this.config.inverter_model}`;
      image.decoding = "async";
      visual.append(image);
    } else {
      const image = document.createElement("img");
      const resourceUrl = new URL(import.meta.url);
      const imageUrl = new URL("./inverter-reference.png", resourceUrl);
      imageUrl.search = resourceUrl.search;
      image.src = imageUrl.href;
      image.alt = "Illustrative inverter enclosure";
      image.decoding = "async";
      visual.append(image);
    }
    this.dataset.customImage = String(Boolean(this.config.inverter_image));
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
    if (model.dataState !== "fresh") this.cancelTextAnimations();
    this.dataset.operatingNormal = String(["normal", "running"].includes(model.inverterStatus));
    this.setText(".status", `${label(model.inverterStatus)} · ${model.connected === null ? "Grid unavailable" : model.connected ? "On-grid" : "Off-grid"}`);
    this.setText(".freshness", model.dataState === "fresh" ? "LIVE" : label(model.dataState));
    this.setText(".notice", model.dataState === "fresh" ? "" : `Telemetry is ${model.dataState}; flow motion is paused.`);
    this.setText(".inverter-state", label(model.inverterStatus));
    const powers = { solar: model.values.solarPower, grid: model.values.gridPower, battery: model.values.batteryPower, load: model.values.loadPower };
    for (const name of FLOW_NAMES) {
      if (name !== "grid") this.setReading(`[data-value="${name}"]`, powers[name] === null ? null : Math.abs(powers[name]) / 1000, "kW", 2);
      this.applyFlow(name, model.flows[name], powers[name], model.dataState === "fresh");
    }
    for (const index of [1, 2, 3]) this.setReading(`[data-value="pv${index}"]`, model.values[`pv${index}Power`] === null ? null : Math.abs(model.values[`pv${index}Power`]) / 1000, "kW", 2);
    this.setReading('[data-value="soc"]', model.values.batterySoc, "%", 0);
    this.setText('[data-meta="battery"]', `${formatValue(model.values.batteryVoltage, "V")} · ${formatValue(model.values.batteryTemperature, "°C")}`);
    this.setText('[data-battery-status]', model.dataState === "fresh" ? label(model.battery) : label(model.dataState));
    this.setText('[data-battery-power-label]', model.battery === "charging" ? "Charging power" : model.battery === "discharging" ? "Discharging power" : "Battery power");
    this.observeDemand(model);
    this.updateDemand();
    this.updateGrid(model);
    this.updateRuntime(model);
    this.appendLiveHistory();
    this.updateHistory();
  }

  /** @param {Object} model Validated domain state. Separates disconnection from stale or unknown telemetry. */
  updateGrid(model) {
    const node=this.shadowRoot.querySelector(".grid");
    const meta=this.shadowRoot.querySelector('[data-meta="grid"]'); meta.setAttribute("role","status");
    node.dataset.connection=model.dataState !== "fresh" ? model.dataState : model.grid === "disconnected" ? "disconnected" : model.connected === null ? "unknown" : "connected";
    if (model.dataState !== "fresh") {
      this.setText('[data-value="grid"]',label(model.dataState));
      this.setText('[data-meta="grid"]',`Telemetry ${model.dataState} · last reported ${model.connected === false ? "disconnected" : model.connected === true ? "connected" : "unknown"}`);
    } else if (model.grid === "disconnected") {
      // A retained nonzero sensor value is not evidence of current flow through a disconnected grid port.
      this.setText('[data-value="grid"]',"Disconnected"); this.setText('[data-meta="grid"]',"Grid flow stopped");
    } else if (model.connected === null) {
      this.setText('[data-value="grid"]',"Unavailable"); this.setText('[data-meta="grid"]',"Connection unknown · grid flow paused");
    } else {
      this.setReading('[data-value="grid"]',model.values.gridPower === null ? null : Math.abs(model.values.gridPower)/1000,"kW",2);
      this.setText('[data-meta="grid"]',`${model.grid === "unavailable" ? "Connected · power unavailable" : label(model.grid)} · ${formatValue(model.values.gridVoltage,"V")} · ${formatValue(model.values.gridFrequency,"Hz")}`);
    }
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
    // Keep the measured rate alive beyond a lower configured goal so the separate 100% projection remains truthful.
    const charge = this.chargeEstimator.observe({ ...input, targetSoc: 100 });
    this.updateForecastIcon("runtime", runtime.status);
    const states = { warming: "Collecting data", charging: "Charging", discharging: "Not charging", static: "Not discharging",
      unavailable: "Unavailable", reserve: "Reserve reached", target: "Target reached" };
    const runtimeText = runtime.status === "charging" ? "Not discharging (charging)" : runtime.status === "static" ? "Not discharging (idle)" :
      runtime.status === "ready" ? formatRuntime(runtime.hours) : runtime.status === "warming" ? "Collecting discharge data" : states[runtime.status];
    this.setText('[data-meta="battery-runtime"]', runtimeText);
    this.setText('[data-meta="runtime-basis"]', runtime.status === "ready" ? `Until ${this.config.battery_reserve_soc}% reserve · ${Math.round(runtime.averageWatts)} W recent average` : `Discharge reserve: ${this.config.battery_reserve_soc}%`);
    const forecastEntity = this.hassValue.states[this.config.entities.solar_forecast_power];
    const forecastValue = numericState(this.hassValue.states, this.config.entities.solar_forecast_power);
    const solarFresh = Date.parse(this.hassValue.states[this.config.entities.solar_power]?.last_reported
      ?? this.hassValue.states[this.config.entities.solar_power]?.last_updated ?? "");
    const solar = input.now - solarFresh <= input.maxAgeMs && solarFresh <= input.now ? model.values.solarPower : null;
    const sunset = Date.parse(this.hassValue.states["sun.sun"]?.attributes?.next_setting ?? "");
    const sunDown = this.hassValue.states["sun.sun"]?.state === "below_horizon";
    const horizon = Math.min(this.config.solar_projection_hours, sunDown ? 0 : Number.isFinite(sunset) ? Math.max(0, (sunset - input.now) / 3_600_000) : this.config.solar_projection_hours);
    const forecastAge = Date.parse(forecastEntity?.last_updated ?? "");
    const validForecast = input.now - forecastAge <= 3_600_000 && forecastAge <= input.now ? forecastValue : null;
    const gridImport = model.grid === "importing" ? Math.abs(model.values.gridPower ?? 0) : 0;
    const projection = target => projectCharge({ rate: charge, soc: input.soc, target, capacityKwh: input.capacityKwh,
      solarWatts: solar, gridImportWatts: gridImport, forecastSolarWatts: validForecast, solarHours: horizon,
      taperStart: this.config.charge_taper_start_soc, taperFloor: this.config.charge_taper_floor_ratio });
    const chargeResult = projection(this.config.battery_charge_target_soc);
    const targetResult = projection(this.config.battery_charge_target_soc === 100 ? 95 : this.config.battery_charge_target_soc);
    const fullResult = projection(100);
    this.updateForecastIcon("full", chargeResult.status, this.config.battery_charge_target_soc);
    const chargeText = result => result.status === "ready" ? formatRuntime(result.hours) : result.status === "solar-limited" ? "Needs more solar" :
      result.status === "warming" ? "Collecting charge data" : result.status === "static" ? "Not charging" : states[result.status];
    this.setText('[data-meta="battery-charge"]', chargeText(chargeResult));
    this.setText('[data-meta="battery-target"]', chargeText(targetResult));
    this.setText('[data-meta="battery-full"]', chargeText(fullResult));
    const runtimeCompact = this.shadowRoot.querySelector('[data-battery-runtime]');
    runtimeCompact.hidden = model.battery !== "discharging" || model.dataState !== "fresh";
    runtimeCompact.textContent = runtime.status === "ready" ? `${formatRuntime(runtime.hours)} to ${this.config.battery_reserve_soc}% reserve` : runtime.status === "reserve" ? "Reserve reached" : runtime.status === "unavailable" ? "Runtime unavailable" : "Collecting discharge data";
    this.setText('[data-meta="charge-basis"]', chargeResult.status === "ready" ? "Solar + net charge + assumed taper" : `To ${this.config.battery_charge_target_soc}% SOC`);
    for (const target of [50, 75, 95]) {
      const result = projection(target);
      this.updateForecastIcon(String(target), result.status, target);
      this.setText(`[data-target="${target}"]`, result.status === "target" ? "Reached" : chargeText(result));
      this.setText(`[data-target-basis="${target}"]`, result.status === "target" ? "Reached at current SOC" : result.status === "ready" ? "Solar + charge rate + taper" : "Awaiting charging conditions");
    }
    const dischargeConfidence = estimateConfidence(runtime, input.windowMs);
    const chargeConfidence = estimateConfidence(charge, input.windowMs, true);
    if (solar === null && chargeConfidence.level !== "Unavailable") chargeConfidence.level = "Limited";
    this.setText('[data-meta="runtime-confidence"]', runtime.status === "ready" ? `${dischargeConfidence.level} confidence` : "");
    this.setText('[data-meta="charge-confidence"]', chargeResult.status === "ready" ? `${chargeConfidence.level} confidence` : "");
    this.setText('[data-meta="confidence-detail"]', `${charge.status === "ready" ? chargeConfidence.detail : dischargeConfidence.detail}. Net charge already includes solar; source share and taper are modeled, not calibrated battery specifications.`);
    this.setText('[data-battery-confidence]', chargeResult.status === "ready" ? `${chargeConfidence.level} confidence` : runtime.status === "ready" ? `${dischargeConfidence.level} confidence` : "Estimates need fresh observations");
    const ageSeconds = Number.isFinite(input.sampleTime) ? Math.max(0, Math.round((input.now - input.sampleTime) / 1000)) : null;
    this.setText(".sample-age", ageSeconds === null ? "" : `${ageSeconds}s`);
  }

  /**
   * Updates one decorative estimate illustration from the same state as its text.
   * @param {string} key Runtime, full, or numeric SOC column key.
   * @param {string} status Estimate lifecycle state.
   * @param {number|null} target Target SOC represented by the battery fill.
   */
  updateForecastIcon(key, status, target = null) {
    const icon = this.shadowRoot.querySelector(`[data-forecast-icon="${key}"]`);
    // The SVG factory emits only fixed paths and bounded numeric fill geometry, never entity text.
    icon.dataset.status = status;
    icon.parentElement.dataset.status = status;
    icon.innerHTML = forecastIcon(status, target);
  }

  /** @param {Object} model Current telemetry. Stores real timestamps, never a synthetic once-per-frame sample. */
  observeDemand(model) {
    const entity = this.hassValue.states[this.config.entities.load_power];
    const time = Date.parse(entity?.last_reported ?? entity?.last_updated ?? "");
    if (!Number.isFinite(time) || time > Date.now()) return;
    const unit = entity?.attributes?.unit_of_measurement ?? "W";
    const value = model.dataState === "fresh" && ["W","kW"].includes(unit) && model.values.loadPower !== null && model.values.loadPower >= 0
      ? model.values.loadPower * (unit === "kW" ? 1000 : 1) : null;
    // Never let stale UI freshness overwrite an otherwise valid historical observation.
    if (model.dataState !== "fresh") return;
    this.demandSamples = [...new Map([...this.demandSamples,{time,value}].map(p=>[p.time,p])).values()]
      .sort((a,b)=>a.time-b.time).filter(p=>p.time >= Date.now()-DEMAND_LIMITS.windowMs-DEMAND_LIMITS.holdMs).slice(-DEMAND_LIMITS.maximumPoints);
  }

  /** Projects independent recent-power statistics; energy-period selection does not change this window. */
  updateDemand() {
    if (!this.rendered) return;
    const result = demandSummary(this.demandSamples);
    this.setReading('[data-load-average]',result.averageWatts === null ? null : result.averageWatts/1000,"kW",2,false);
    this.setReading('[data-load-peak]',result.peakWatts === null ? null : result.peakWatts/1000,"kW",2,false);
    this.shadowRoot.querySelector('[data-load-path]').setAttribute("d",chartPaths(result.points,result.range).line);
    const coverage = Math.floor(result.coverage*100);
    const freshness = this.latestModel?.dataState;
    const message = this.demandState === "error" ? `Load history unavailable · ${coverage}% observed coverage` : result.averageWatts === null
      ? (this.demandLoading ? "Loading recent demand" : "Collecting recent demand") : `Last 15 minutes · ${coverage<100 ? `partial ${coverage}% coverage` : "observed coverage"}`;
    this.setText('[data-load-coverage]',`${message}${freshness && freshness !== "fresh" ? ` · telemetry ${freshness}` : ""}`);
    this.shadowRoot.querySelector(".demand-retry").hidden = this.demandState !== "error";
  }

  /** @param {boolean} force User-requested retry. Reads one bounded series with revision and refresh guards. */
  async loadDemandIfNeeded(force = false) {
    const hass = this.hassValue;
    const id = this.config.entities.load_power;
    if (!this.rendered || !hass || !id || typeof hass.callApi !== "function" || this.demandLoading) return;
    if (!force && this.demandLastFetch !== null && Date.now()-this.demandLastFetch<DEMAND_LIMITS.refreshMs) return;
    this.demandLastFetch=Date.now(); this.demandLoading=true; this.demandState="loading";
    const request=++this.demandRequest;
    this.updateDemand();
    try {
      const points=await loadDemandHistory(hass,id,new Date(),hass.states[id]?.attributes?.unit_of_measurement ?? "W");
      if (request !== this.demandRequest) return;
      // Merge post-request live observations after Recorder points, preserving newer reports at the same timestamp.
      this.demandSamples=[...new Map([...points,...this.demandSamples].map(p=>[p.time,p])).values()]
        .sort((a,b)=>a.time-b.time).slice(-DEMAND_LIMITS.maximumPoints);
      this.demandState="ready";
    } catch {
      if (request !== this.demandRequest) return;
      this.demandState="error";
    } finally {
      if (request === this.demandRequest) { this.demandLoading=false; this.updateDemand(); }
    }
  }

  /** Appends only fresh numeric live daily counters to the selected history. */
  appendLiveHistory() {
    if (this.period !== "today") return;
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
    this.cursorRatio = null;
    this.cursorPinned = false;
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
    const ids = SUMMARY_NAMES.map(name => this.period === "today" ? this.config.entities[`${name}_today`]
      : this.config.statistics[name] || this.config.entities[`${name}_today`]);
    const day = new Intl.DateTimeFormat("en-CA", { timeZone }).format(new Date());
    const key = `${timeZone}|${day}|${Math.floor(Date.now()/3_600_000)}|${this.period}|${ids.join("|")}`;
    if (!force && key === this.historyKey) return;
    this.historyKey = key;
    const request = ++this.historyRequest;
    this.history = this.period === "today" ? this.historyCache.get(key) ?? new Map() : new Map();
    this.statisticsHistory = this.period !== "today" ? this.historyCache.get(key) ?? new Map() : new Map();
    if (!force && this.historyCache.has(key)) {
      this.historyState = { status: "ready" };
      this.appendLiveHistory(); this.updateHistory(); return;
    }
    this.historyState = { status: "loading" };
    this.updateHistory();
    try {
      const history = this.period === "today" ? await loadPeriodHistory(this.hassValue, ids, range)
        : await loadEnergyStatistics(this.hassValue, ids, range);
      if (request !== this.historyRequest) return;
      if (this.period === "today") this.history = history;
      else this.statisticsHistory = history;
      this.historyState = { status: "ready" };
      this.appendLiveHistory();
      this.historyCache.set(key, history);
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
    const startLabel = this.period === "today" ? this.config.clock_format === "24" ? "00:00" : "12 AM" : new Intl.DateTimeFormat(undefined, { timeZone, month: "short", day: "numeric" }).format(range.start);
    this.setText(".history-caption", this.period === "today" ? "Today · midnight to now" : this.period === "week" ? "Last 7 local days · long-term statistics" : "This month · long-term statistics");
    const loading = this.historyState.status === "loading";
    const failed = this.historyState.status === "error";
    this.setText("[data-history-message]", loading ? "Loading Recorder history…" : failed ? "History could not be loaded. Check Recorder access and retry." : "");
    this.shadowRoot.querySelector(".history-message .retry").hidden = !failed;
    this.shadowRoot.querySelector(".history-message").hidden = !loading && !failed;
    this.shadowRoot.querySelector(".summaries").setAttribute("aria-busy", String(loading));
    for (const name of SUMMARY_NAMES) {
      const id = this.config.entities[`${name}_today`];
      const statisticId = this.config.statistics[name] || id;
      const statistic = this.statisticsHistory.get(statisticId);
      const result = this.period === "today" ? periodEnergy(this.history.get(id) ?? [], range, timeZone) :
        statistic ?? { points: [], total: null, partial: true, status: "missing", end: null };
      const entity = this.hassValue?.states[id];
      const sampleTime = Date.parse(entity?.last_reported ?? entity?.last_updated ?? "");
      const todayStart = periodRange("today", range.end, timeZone).start.getTime();
      const live = sampleTime >= todayStart && sampleTime <= range.end.getTime() ? this.latestModel?.values[`${name}Today`] ?? null : null;
      const total = this.period === "today" ? live ?? result.total : result.total;
      this.setReading(`[data-summary-value="${name}"]`, total, "kWh", 1, false);
      this.setText(`[data-coverage="${name}"]`, !(this.period === "today" ? id : statisticId) ? "Map an energy entity" : loading ? "Loading history" : failed ? "History unavailable" :
        result.total === null ? this.period === "today" ? "No recorded samples" : result.status === "missing" ? "Energy statistics not configured" : "No completed statistics" :
        this.period === "today" ? "Daily energy" : `${result.partial ? "Partial · " : ""}Statistics through ${new Intl.DateTimeFormat(undefined,{timeZone,hour:"numeric",minute:"2-digit",hour12:this.config.clock_format!=="24"}).format(new Date(result.end))}`);
      this.chartSeries.set(name, result.points);
      const paths = chartPaths(result.points, range);
      this.shadowRoot.querySelector(`[data-summary-path="${name}"]`).setAttribute("d", paths.line);
      this.shadowRoot.querySelector(`[data-summary-area="${name}"]`).setAttribute("d", paths.area);
      const summary = this.shadowRoot.querySelector(`.summary[data-domain="${name}"]`);
      summary.querySelector("[data-period-start]").textContent = startLabel;
      summary.setAttribute("aria-label", `${label(name)}, ${label(this.period)}: ${formatValue(total, "kWh")}. ${result.partial ? "Partial recorded history." : "Recorded history."}`);
    }
    this.updateInspection();
  }

  /** Shows nearest actual observations for a shared hover/touch/keyboard time cursor. */
  updateInspection() {
    if (this.cursorRatio === null || !this.hassValue) {
      this.shadowRoot.querySelector("#history-cursor").setAttribute("aria-valuetext", "No recorded time selected");
      this.setText(".inspection-time", "Move over a graph or use the time slider");
      for (const name of SUMMARY_NAMES) {
        this.shadowRoot.querySelector(`[data-cursor="${name}"]`).setAttribute("visibility", "hidden");
        this.shadowRoot.querySelector(`[data-chart-point="${name}"]`).setAttribute("visibility", "hidden");
        this.setText(`[data-inspection="${name}"]`, "");
      }
      return;
    }
    const timeZone = this.hassValue.config?.time_zone ?? Intl.DateTimeFormat().resolvedOptions().timeZone;
    const range = periodRange(this.period, new Date(), timeZone);
    const time = range.start.getTime() + this.cursorRatio * (range.end.getTime() - range.start.getTime());
    const formatter = new Intl.DateTimeFormat(undefined, { timeZone, month: "short", day: "numeric", hour: "numeric", minute: "2-digit", hour12: this.config.clock_format !== "24" });
    this.setText(".inspection-time", `Selected ${formatter.format(new Date(time))} · nearest recorded samples`);
    this.shadowRoot.querySelector("#history-cursor").setAttribute("aria-valuetext", formatter.format(new Date(time)));
    for (const name of SUMMARY_NAMES) {
      const point = nearestObservation(this.chartSeries.get(name) ?? [], time);
      const marker = this.shadowRoot.querySelector(`[data-chart-point="${name}"]`);
      const cursor = this.shadowRoot.querySelector(`[data-cursor="${name}"]`);
      cursor.setAttribute("visibility", point ? "visible" : "hidden");
      cursor.removeAttribute("hidden");
      marker.setAttribute("visibility", point ? "visible" : "hidden");
      if (!point) { this.setText(`[data-inspection="${name}"]`, "No sample"); continue; }
      const x = (point.time - range.start.getTime()) / Math.max(1, range.end.getTime() - range.start.getTime()) * 100;
      cursor.setAttribute("x1", String(x)); cursor.setAttribute("x2", String(x));
      const coordinates = chartCoordinates(point, this.chartSeries.get(name), range);
      marker.setAttribute("cx", String(coordinates.x)); marker.setAttribute("cy", String(coordinates.y));
      const rect = marker.parentElement.getBoundingClientRect();
      marker.setAttribute("rx", String(rect.width ? CHART_GEOMETRY.pointRadius * CHART_GEOMETRY.width / rect.width : 1));
      marker.setAttribute("ry", String(rect.height ? CHART_GEOMETRY.pointRadius * CHART_GEOMETRY.height / rect.height : 1));
      this.setText(`[data-inspection="${name}"]`, `${formatValue(point.value,"kWh",2)}\n${formatter.format(new Date(point.time))}`);
    }
  }

  /**
   * Updates text without interpreting telemetry or editable labels as HTML.
   * @param {string} selector Shadow DOM selector.
   * @param {string} value Text content.
   */
  setText(selector, value) {
    const element = this.shadowRoot.querySelector(selector);
    if (element && element.textContent !== value) {
      const previous = element.textContent; element.textContent = value;
      if (element.matches(".forecast-value,.inverter-state,.status")) this.animateReading(element, previous);
    }
  }

  /** Clears pinned/hover inspection without changing the selected history period. */
  clearInspection() { this.cursorRatio = null; this.cursorPinned = false; this.inspectionPointer = null; this.updateInspection(); }

  /**
   * Commits real values first, using safe text nodes and smaller typographic unit suffixes.
   * @param {string} selector Reading destination.
   * @param {number|null} value Actual value.
   * @param {string} unit Display unit.
   * @param {number} digits Decimal precision.
   * @param {boolean} animate Allow restrained opacity feedback (never used for keyboard charts).
   */
  setReading(selector, value, unit, digits = 1, animate = true) {
    const element = this.shadowRoot.querySelector(selector);
    const parts = readingParts(value, unit, digits);
    const text = parts.number + (parts.unit ? ` ${parts.unit}` : "");
    if (element.textContent === text && element.querySelector(".reading-number")) return;
    const previous = element.textContent;
    const number = document.createElement("span"); number.className = "reading-number"; number.textContent = parts.number;
    const suffix = document.createElement("span"); suffix.className = "reading-unit"; suffix.textContent = parts.unit;
    element.replaceChildren(number, ...(parts.unit ? [document.createTextNode(" "), suffix] : []));
    if (animate) this.animateReading(element, previous);
  }

  /**
   * Gives changed readings opacity feedback without delaying, counting, or hiding real data.
   * @param {HTMLElement} element Destination already containing the current reading.
   * @param {string} previous Prior visible text, used to skip the initial render.
   */
  animateReading(element, previous) {
    if (!previous || previous === "—" || this.dataset.state !== "fresh" || this.reducedMotion.matches || !this.visible || document.hidden || !element.animate) return;
    const disclosure=element.closest(".estimate-details");
    if (disclosure && !disclosure.open) return;
    const before = Number.parseFloat(previous); const after = Number.parseFloat(element.textContent);
    if (Number.isFinite(before) && Number.isFinite(after) && Math.abs(after - before) / Math.max(1, Math.abs(before)) < READING_MOTION.relativeThreshold) return;
    const now = Date.now();
    if (now - (this.lastReadingFeedback.get(element) ?? -Infinity) < READING_MOTION.cooldownMs) return;
    this.lastReadingFeedback.set(element, now);
    this.textAnimations.get(element)?.cancel();
    const animation = element.animate([{ opacity: READING_MOTION.opacity }, { opacity: 1 }], { duration: READING_MOTION.duration, easing: READING_MOTION.easing });
    this.textAnimations.set(element, animation);
    animation.onfinish = () => { if (this.textAnimations.get(element) === animation) this.textAnimations.delete(element); };
  }

  /** Stops feedback immediately on detach, hidden views, or reduced-motion preference changes. */
  cancelTextAnimations() { for (const animation of this.textAnimations.values()) animation.cancel(); this.textAnimations.clear(); }
}
