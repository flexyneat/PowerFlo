/** @fileoverview Integration checks for runtime text, polarity, and configuration reset. */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PowerFloCard } from "../src/card.js";
import { DEFAULT_CONFIG } from "../src/config.js";

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
