/** @fileoverview Forecast confidence, solar/taper milestones, statistics and chart inspection tests. */
import { describe, expect, it, vi } from "vitest";
import { estimateConfidence, projectCharge, taperFactor } from "../src/charge-model.js";
import { loadEnergyStatistics, statisticsSeries } from "../src/statistics.js";
import { nearestObservation } from "../src/chart-inspection.js";

/**
 * Supplies deterministic charge projection inputs.
 * @param {Object} overrides Scenario overrides.
 * @returns {Object} Forecast input.
 */
function scenario(overrides = {}) {
  return { rate: { status: "ready", averageWatts: 2000, coverageMs: 300000, sampleCount: 10, variation: 0.05, ageMs: 5000 },
    soc: 40, target: 50, capacityKwh: 32.14, solarWatts: 4000, gridImportWatts: 0,
    forecastSolarWatts: null, solarHours: 8, taperStart: 90, taperFloor: 0.2, ...overrides };
}

describe("solar-aware charge projection", () => {
  it("uses observed net charge without adding solar twice", () => {
    expect(projectCharge(scenario()).hours).toBeCloseTo(1.607);
    expect(projectCharge(scenario({ target: 75 })).hours).toBeCloseTo(5.6245);
    expect(projectCharge(scenario({ soc: 85, target: 50 })).status).toBe("target");
  });
  it("slows after the configured high-SOC taper begins", () => {
    const flat = projectCharge(scenario({ soc: 85, target: 100, taperFloor: 1 }));
    const taper = projectCharge(scenario({ soc: 85, target: 100 }));
    expect(taper.hours).toBeGreaterThan(flat.hours);
    expect(taper.tapered).toBe(true);
    expect(taperFactor(100, 90, 0.2)).toBeCloseTo(0.2);
  });
  it("accounts for forecast reduction and solar ending, rather than forecasting overnight sunlight", () => {
    expect(projectCharge(scenario({ solarHours: 0.5 })).status).toBe("solar-limited");
    const lowered = projectCharge(scenario({ forecastSolarWatts: 2000 }));
    expect(lowered.hours).toBeCloseTo(3.214);
    const mixed = projectCharge(scenario({ solarHours: 0.5, gridImportWatts: 4000 }));
    expect(mixed.hours).toBeGreaterThan(1.607);
    expect(mixed.status).toBe("ready");
  });
  it("rejects bad inputs, stale data, zero supply, and paused sessions", () => {
    expect(projectCharge(scenario({ soc: null })).status).toBe("unavailable");
    expect(projectCharge(scenario({ taperFloor: 0 })).status).toBe("unavailable");
    expect(projectCharge(scenario({ rate: { status: "unavailable" }, soc: 100 })).status).toBe("unavailable");
    expect(projectCharge(scenario({ rate: { status: "static" } })).status).toBe("static");
    expect(projectCharge(scenario({ forecastSolarWatts: 0 })).status).toBe("solar-limited");
    expect(projectCharge(scenario({ rate: { status: "ready", averageWatts: 0.1 } })).status).toBe("solar-limited");
    expect(projectCharge(scenario({ rate: { status: "ready", averageWatts: Number.NaN } })).status).toBe("unavailable");
  });
});

describe("confidence", () => {
  it("uses coverage, age and variability, and caps modeled forecasts", () => {
    const rate = scenario().rate;
    expect(estimateConfidence(rate, 300000).level).toBe("High");
    expect(estimateConfidence(rate, 300000, true).level).toBe("Moderate");
    expect(estimateConfidence({ ...rate, variation: 0.5 }, 300000).level).toBe("Limited");
    expect(estimateConfidence({ ...rate, coverageMs: 90000 }, 300000).level).toBe("Moderate");
    expect(estimateConfidence({ status: "warming" }, 300000).level).toBe("Unavailable");
  });
});

describe("long-term energy statistics", () => {
  const range = { start: new Date(0), end: new Date(9000000) };
  it("sums authoritative hourly changes, excludes the unfinished hour and ignores duplicates", () => {
    const result = statisticsSeries([{ start: 0, end: 3600000, change: 2 }, { start: 3600000, end: 7200000, change: 3 },
      { start: 3600000, end: 7200000, change: 100 }, { start: 7200000, end: 10800000, change: 8 }], range);
    expect(result.total).toBe(5);
    expect(result.partial).toBe(false);
    expect(result.end).toBe(7200000);
  });
  it("marks invalid changes, missing intervals and unavailable history honestly", () => {
    expect(statisticsSeries([{ start: 3600000, end: 7200000, change: 3 }], range).partial).toBe(true);
    expect(statisticsSeries([{ start: 0, end: 3600000, change: null }], range).total).toBeNull();
    expect(statisticsSeries([{ start: 0, end: 3600000, change: -1 }], range).total).toBeNull();
    expect(statisticsSeries(null, range).status).toBe("empty");
  });
  it("validates energy metadata and only sends read-only WebSocket commands", async () => {
    const callWS = vi.fn().mockResolvedValueOnce([{ statistic_id: "sensor.energy", has_sum: true, unit_of_measurement: "Wh" },
      { statistic_id: "sensor.temperature", has_sum: true, unit_of_measurement: "°C" }])
      .mockResolvedValueOnce({ "sensor.energy": [{ start: 0, end: 3600000, change: 2 }] });
    const result = await loadEnergyStatistics({ callWS }, ["sensor.energy", "sensor.temperature"], range);
    expect(result.get("sensor.energy").total).toBe(2);
    expect(result.get("sensor.temperature").status).toBe("missing");
    expect(callWS.mock.calls[1][0]).toMatchObject({ type: "recorder/statistics_during_period", period: "hour", types: ["change"], units: { energy: "kWh" }, statistic_ids: ["sensor.energy"] });
    expect(await loadEnergyStatistics({}, [], range)).toEqual(new Map());
    await expect(loadEnergyStatistics({}, ["sensor.energy"], range)).rejects.toThrow("WebSocket");
  });
});

describe("interactive charts", () => {
  it("returns a real nearest observation, never an interpolated fabricated value", () => {
    const points = [{ time: 0, value: 2 }, { time: 100, value: 9 }];
    expect(nearestObservation(points, 60)).toBe(points[1]);
    expect(nearestObservation([{ time: 0, value: 1 }, { time: 20, value: 2 }, { time: 100, value: 9 }], 75).value).toBe(9);
    expect(nearestObservation(points, 10)).toBe(points[0]);
    expect(nearestObservation([], 60)).toBeNull();
    expect(nearestObservation(points, Number.NaN)).toBeNull();
  });
});
