/** @fileoverview Integration checks for runtime text, polarity, and configuration reset. */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PowerFloCard } from "../src/card.js";
import { DEFAULT_CONFIG } from "../src/config.js";
import { connectorPath } from "../src/connector-geometry.js";
import { DEFAULT_ART_BOUNDS, FLOW_GEOMETRY } from "../src/tokens.js";

if (!customElements.get("test-runtime-card")) customElements.define("test-runtime-card", PowerFloCard);

/**
 * Creates a card with deterministic fresh telemetry and no connected animation loops.
 * @param {Object} overrides Card option overrides.
 * @returns {PowerFloCard} Configured card fixture.
 */
function fixture(overrides = {}) {
  const entities = Object.fromEntries(Object.keys(DEFAULT_CONFIG.entities).map(key => [key, `sensor.${key}`]));
  const card = new PowerFloCard();
  card.setConfig({ entities, ...overrides });
  card.hassValue = { states: Object.fromEntries(Object.entries(entities).map(([key, id]) => [id,
    { state: String({ freshness: "on", inverter_status: "normal", grid_connected: "on",
      battery_soc: 85, battery_power: 512 }[key] ?? 0), last_updated: new Date().toISOString() }])),
    config: { time_zone: "Africa/Lagos" } };
  return card;
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-10-12T10:00:00Z"));
  vi.stubGlobal("matchMedia", () => ({ matches: true, addEventListener() {}, removeEventListener() {} }));
});
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });

describe("battery panel runtime", () => {
  it("displays time to full and target reached, with configurable charge target", () => {
    const card = fixture({ battery_positive: "charge", battery_charge_target_soc: 95, charge_taper_floor_ratio: 1 });
    card.hassValue.states[card.config.entities.battery_power].state = "2000";
    card.updateModel();
    expect(card.shadowRoot.querySelector('[data-meta="battery-charge"]').textContent).toBe("Collecting charge data");
    vi.setSystemTime(new Date("2026-10-12T10:00:30Z"));
    card.hassValue.states[card.config.entities.battery_power].last_updated = new Date().toISOString();
    card.updateModel();
    expect(card.shadowRoot.querySelector('[data-meta="battery-charge"]').textContent).toBe("1 h 36 min");
    expect(card.shadowRoot.querySelector('[data-meta="charge-label"]').textContent).toBe("Time to 95%");
    card.hassValue.states[card.config.entities.battery_soc].state = "95";
    card.updateModel();
    expect(card.shadowRoot.querySelector('[data-meta="battery-charge"]').textContent).toBe("Target reached");
  });
  it("shows warmup, duration and reserve without changing battery status", () => {
    const card = fixture();
    card.updateModel();
    expect(card.shadowRoot.querySelector('[data-meta="battery-runtime"]').textContent).toContain("Collecting discharge data");
    vi.setSystemTime(new Date("2026-10-12T10:00:30Z"));
    card.hassValue.states[card.config.entities.battery_power].last_updated = new Date().toISOString();
    card.updateModel();
    expect(card.shadowRoot.querySelector('[data-meta="battery-runtime"]').textContent).toContain("40 h 48 min");
    expect(card.shadowRoot.querySelector('[data-meta="runtime-basis"]').textContent).toBe("To 20% reserve · 512 W recent average");
    expect(card.shadowRoot.querySelector('[data-meta="battery"]').textContent).toContain("Discharging");
    card.setConfig({ ...card.config, battery_reserve_soc: 30 });
    card.updateModel();
    expect(card.shadowRoot.querySelector('[data-meta="battery-runtime"]').textContent).toContain("Collecting discharge data");
    expect(card.shadowRoot.querySelector('[data-meta="runtime-basis"]').textContent).toContain("30% reserve");
  });
  it("honors reverse sign conventions and rejects stale entity timestamps", () => {
    const card = fixture({ battery_positive: "charge" });
    card.hassValue.states[card.config.entities.battery_power].state = "-512";
    card.updateModel();
    expect(card.shadowRoot.querySelector('[data-meta="battery-runtime"]').textContent).toContain("Collecting discharge data");
    vi.setSystemTime(new Date("2026-10-12T10:01:01Z"));
    card.updateModel();
    expect(card.shadowRoot.querySelector('[data-meta="battery-runtime"]').textContent).toContain("Unavailable");
  });
});

describe("visible flow arrows and forecast illustrations", () => {
  it("aligns bundled wires to visible PNG bounds but keeps uploads conservative", () => {
    const card = fixture();
    const root = card.shadowRoot;
    root.querySelector(".topology").getBoundingClientRect = () => ({ left: 0, top: 0, width: 1000, height: 600 });
    root.querySelector(".inverter-visual").getBoundingClientRect = () => ({ left: 400, right: 600, top: 120, bottom: 480, width: 200, height: 360 });
    for (const name of ["solar", "grid", "battery", "load"]) root.querySelector(`.node.${name}`).getBoundingClientRect = () => ({ left: 0, right: 300, top: 0, height: 200 });
    card.updateConnectorGeometry();
    const path = root.querySelector('[data-flow-path="solar"]');
    expect(Number(path.getAttribute("d").match(/V([^ ]+)$/)[1])).toBeCloseTo(120 + 360 * DEFAULT_ART_BOUNDS.top - FLOW_GEOMETRY.arrowClearance);
    card.dataset.customImage = "true";
    card.updateConnectorGeometry();
    expect(Number(path.getAttribute("d").match(/V([^ ]+)$/)[1])).toBe(120 - FLOW_GEOMETRY.arrowClearance);
    expect(root.querySelectorAll("circle.particle")).toHaveLength(0);
    expect(root.querySelectorAll("path.particle")).toHaveLength(12);
  });
  it("keeps every route segment outside the image rectangle including overlapping panel anchors", () => {
    const canvas = { left: 0, top: 0, width: 1000, height: 600 };
    const inverter = { left: 400, right: 600, top: 120, bottom: 480, width: 200, height: 360 };
    for (const name of ["solar", "grid", "battery", "load"]) {
      const left = name === "solar" || name === "battery";
      const node = { left: left ? 0 : 700, right: left ? 300 : 1000, top: 160, height: 280 };
      const path = connectorPath(canvas, inverter, node, name);
      const numbers = path.match(/-?\d+(?:\.\d+)?/g).map(Number);
      const [fromX, fromY] = numbers;
      const endY = numbers.at(-1);
      const portX = numbers.at(-3);
      const upper = name === "solar" || name === "grid";
      expect(endY).toBe(upper ? inverter.top - FLOW_GEOMETRY.arrowClearance : inverter.bottom + FLOW_GEOMETRY.arrowClearance);
      // Every leg stays on an external lane or above/below the image; no arrow can be occluded.
      expect(left ? fromX < inverter.left : fromX > inverter.right).toBe(true);
      expect(upper ? fromY < inverter.top : fromY > inverter.bottom).toBe(true);
      expect(portX).toBeGreaterThan(inverter.left);
      expect(portX).toBeLessThan(inverter.right);
      expect(path).toContain(" Q");
    }
  });
  it("normalizes offset and scaled layouts without shrinking the physical arrow clearance", () => {
    const path = connectorPath({ left: 50, top: 25, width: 2000, height: 1200 },
      { left: 850, right: 1250, top: 265, bottom: 985, width: 400 },
      { right: 650, top: 105, height: 160 }, "solar");
    const points = path.match(/-?\d+(?:\.\d+)?/g).map(Number);
    expect(points[0]).toBe(300);
    expect(points[1]).toBeCloseTo(62.4);
    expect(points.at(-1)).toBe(116);
    expect(path).toContain(" Q460 ");
  });
  it("shows state-aware icons beside all five estimates, never in energy summaries", () => {
    const card = fixture({ battery_positive: "charge" });
    card.updateModel();
    const root = card.shadowRoot;
    expect(root.querySelectorAll(".forecast-icon svg")).toHaveLength(5);
    expect(root.querySelector('[data-forecast-icon="runtime"]').dataset.status).toBe("charging");
    expect(root.querySelector('[data-forecast-icon="50"]').dataset.status).toBe("target");
    expect(root.querySelector('[data-forecast-icon="75"]').dataset.status).toBe("target");
    expect(root.querySelector('[data-forecast-icon="95"]').dataset.status).toBe("warming");
    expect(root.querySelectorAll(".summary .forecast-icon")).toHaveLength(0);
    card.hassValue.states[card.config.entities.freshness].state = "off";
    card.updateModel();
    expect(root.querySelector('[data-forecast-icon="full"]').dataset.status).toBe("unavailable");
  });
});

describe("history period interactions", () => {
  it("does not carry yesterday's retained daily counter into a new day", () => {
    const card = fixture();
    card.hassValue.states[card.config.entities.solar_today] = { state: "99", last_updated: "2026-10-11T20:00:00Z" };
    card.updateModel();
    expect(card.history.has(card.config.entities.solar_today)).toBe(false);
    expect(card.shadowRoot.querySelector('[data-summary-value="solar"]').textContent).toBe("—");
  });
  it("uses accessible selected buttons and ignores out-of-order history responses", async () => {
    const card = fixture();
    const resolveRequests = [];
    card.hassValue.callApi = vi.fn(() => new Promise(resolve => resolveRequests.push(resolve)));
    card.hassValue.callWS = vi.fn(message => message.type === "recorder/get_statistics_metadata"
      ? Promise.resolve([{ statistic_id: "sensor.solar_today", has_sum: true, unit_of_measurement: "kWh" }])
      : new Promise(resolve => resolveRequests.push(resolve)));
    const first = card.loadHistoryIfNeeded();
    card.selectPeriod("week");
    card.selectPeriod("month");
    await Promise.resolve(); await Promise.resolve();
    expect(card.shadowRoot.querySelector('[data-period="month"]').getAttribute("aria-pressed")).toBe("true");
    expect(resolveRequests).toHaveLength(3);
    resolveRequests[2]({ "sensor.solar_today": [{ start: Date.parse("2026-10-12T08:00:00Z"), end: Date.parse("2026-10-12T09:00:00Z"), change: 3 }] });
    await Promise.resolve(); await Promise.resolve();
    expect(card.statisticsHistory.get("sensor.solar_today").total).toBe(3);
    resolveRequests[1]({ "sensor.solar_today": [{ start: Date.parse("2026-10-12T08:00:00Z"), end: Date.parse("2026-10-12T09:00:00Z"), change: 999 }] });
    resolveRequests[0]([]);
    await first;
    expect(card.statisticsHistory.get("sensor.solar_today").total).toBe(3);
    expect(card.period).toBe("month");
  });
  it("shows a recoverable history failure and reuses cached period responses", async () => {
    const card = fixture();
    card.hassValue.callApi = vi.fn().mockRejectedValueOnce(new Error("Recorder offline")).mockResolvedValue([]);
    await card.loadHistoryIfNeeded();
    expect(card.historyState.status).toBe("error");
    expect(card.shadowRoot.querySelector(".retry").hidden).toBe(false);
    await card.loadHistoryIfNeeded(true);
    expect(card.historyState.status).toBe("ready");
    card.historyKey = "";
    await card.loadHistoryIfNeeded();
    expect(card.hassValue.callApi).toHaveBeenCalledTimes(2);
    expect(card.shadowRoot.querySelector(".retry").hidden).toBe(true);
  });
});
