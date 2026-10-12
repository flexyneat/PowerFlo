/** @fileoverview Tests for time-weighted discharge runtime and invalidation. */
import { describe, expect, it } from "vitest";
import { BatteryRuntimeEstimator, formatRuntime } from "../src/runtime.js";

/**
 * Builds a fresh runtime observation in the battery's normalized domain.
 * @param {number} time Observation time, milliseconds.
 * @param {number} power Battery discharge watts.
 * @param {Object} overrides Observation overrides.
 * @returns {Object} Estimator input.
 */
function observation(time, power = 512, overrides = {}) {
  return { now: time, sampleTime: time, power, soc: 85, mode: "discharging", fresh: true,
    capacityKwh: 32.14, reserveSoc: 20, windowMs: 300_000, maxAgeMs: 60_000, ...overrides };
}

describe("BatteryRuntimeEstimator", () => {
  it("warms up then computes energy divided by average battery-side power", () => {
    const estimator = new BatteryRuntimeEstimator();
    expect(estimator.observe(observation(0)).status).toBe("warming");
    const result = estimator.observe(observation(30_000));
    expect(result.status).toBe("ready");
    expect(result.hours).toBeCloseTo(40.802734375);
    expect(result.averageWatts).toBe(512);
  });
  it("weights elapsed time rather than sample counts", () => {
    const estimator = new BatteryRuntimeEstimator();
    estimator.observe(observation(0, 1000));
    estimator.observe(observation(10_000, 2000));
    const result = estimator.observe(observation(30_000, 2000));
    expect(result.averageWatts).toBeCloseTo(5000 / 3);
  });
  it("clips the average to the window while preserving its boundary sample", () => {
    const estimator = new BatteryRuntimeEstimator();
    estimator.observe(observation(0, 1000));
    estimator.observe(observation(30_000, 2000));
    const result = estimator.observe(observation(60_000, 3000, { windowMs: 40_000 }));
    expect(result.averageWatts).toBe(1750);
  });
  it("does not resample unrelated updates and invalidates old telemetry", () => {
    const estimator = new BatteryRuntimeEstimator();
    estimator.observe(observation(0));
    estimator.observe(observation(30_000));
    expect(estimator.observe(observation(40_000, 512, { sampleTime: 30_000 })).status).toBe("ready");
    expect(estimator.samples).toHaveLength(2);
    expect(estimator.observe(observation(100_000, 512, { sampleTime: 30_000 })).status).toBe("unavailable");
  });
  it("resets after charging, static, or stale data", () => {
    for (const overrides of [{ mode: "charging" }, { mode: "static" }, { fresh: false }]) {
      const estimator = new BatteryRuntimeEstimator();
      estimator.observe(observation(0));
      estimator.observe(observation(30_000));
      expect(estimator.observe(observation(40_000, 512, overrides)).status).not.toBe("ready");
      expect(estimator.observe(observation(50_000)).status).toBe("warming");
    }
  });
  it("restarts its window after a telemetry gap", () => {
    const estimator = new BatteryRuntimeEstimator();
    estimator.observe(observation(0));
    expect(estimator.observe(observation(90_000)).status).toBe("warming");
  });
  it("reports reserve reached and rejects invalid SOC/power", () => {
    const estimator = new BatteryRuntimeEstimator();
    expect(estimator.observe(observation(0, 512, { soc: 19 })).status).toBe("reserve");
    for (const overrides of [{ soc: null }, { soc: 101 }, { power: 0 }, { sampleTime: Number.NaN }]) {
      expect(estimator.observe(observation(1, 512, overrides)).status).toBe("unavailable");
    }
  });
});

describe("formatRuntime", () => {
  it("formats finite estimates without inventing precision", () => {
    expect(formatRuntime(40.802734375)).toBe("40 h 48 min");
    expect(formatRuntime(0.001)).toBe("Less than 1 min");
    expect(formatRuntime(1)).toBe("1 h 0 min");
    expect(formatRuntime(Number.POSITIVE_INFINITY)).toBe("Unavailable");
  });
});
