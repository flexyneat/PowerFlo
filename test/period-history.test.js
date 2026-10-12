/** @fileoverview Calendar boundary and daily-reset energy reconstruction tests. */
import { describe, expect, it, vi } from "vitest";
import { loadPeriodHistory, periodEnergy, periodRange } from "../src/period-history.js";
import { sparklinePath } from "../src/history.js";

/**
 * Creates a deterministic Recorder point.
 * @param {string} timestamp ISO timestamp.
 * @param {number} value Daily-reset energy value.
 * @returns {{time: number, value: number}} Numeric point.
 */
function point(timestamp, value) { return { time: Date.parse(timestamp), value }; }

describe("periodRange", () => {
  it("uses Lagos local midnight, seven calendar days, and month to date", () => {
    const now = new Date("2026-10-12T10:00:00Z");
    expect(periodRange("today", now, "Africa/Lagos").start.toISOString()).toBe("2026-10-11T23:00:00.000Z");
    expect(periodRange("week", now, "Africa/Lagos").start.toISOString()).toBe("2026-10-05T23:00:00.000Z");
    expect(periodRange("month", now, "Africa/Lagos").start.toISOString()).toBe("2026-09-30T23:00:00.000Z");
    expect(periodRange("month", now, "Africa/Lagos").expectedDays).toBe(12);
  });
  it("handles week boundaries across daylight saving and month/year rollover", () => {
    const now = new Date("2026-11-03T18:00:00Z");
    expect(periodRange("week", now, "America/New_York").start.toISOString()).toBe("2026-10-28T04:00:00.000Z");
    expect(periodRange("month", new Date("2026-01-02T10:00:00Z"), "Pacific/Kiritimati").start.toISOString()).toBe("2025-12-31T10:00:00.000Z");
  });
});

describe("periodEnergy", () => {
  it("adds daily maxima once despite midnight resets and duplicate readings", () => {
    const range = { start: new Date("2026-10-10T00:00:00Z"), end: new Date("2026-10-12T12:00:00Z"), expectedDays: 3 };
    const result = periodEnergy([
      point("2026-10-10T10:00:00Z", 4), point("2026-10-10T23:00:00Z", 10),
      point("2026-10-11T00:00:00Z", 0), point("2026-10-11T23:00:00Z", 8),
      point("2026-10-12T00:00:00Z", 0), point("2026-10-12T12:00:00Z", 3),
    ], range, "UTC");
    expect(result.total).toBe(21);
    expect(result.points.map(p => p.value)).toEqual([4, 10, 10, 18, 18, 21]);
    expect(result.partial).toBe(false);
  });
  it("marks missing days as partial and excludes outside/invalid samples", () => {
    const range = periodRange("week", new Date("2026-10-12T10:00:00Z"), "UTC");
    const result = periodEnergy([point("2026-10-01T12:00:00Z", 100), point("2026-10-12T09:00:00Z", 3),
      point("2026-10-12T11:00:00Z", 100), { time: Number.NaN, value: 2 }, point("2026-10-12T09:30:00Z", -1)], range, "UTC");
    expect(result.total).toBe(3);
    expect(result.partial).toBe(true);
    expect(result.days).toBe(1);
    expect(periodEnergy([], range, "UTC").total).toBeNull();
  });
  it("uses fixed time-axis boundaries rather than inventing midnight data", () => {
    const range = { start: new Date(0), end: new Date(1000) };
    expect(sparklinePath([{ time: 500, value: 0 }, { time: 1000, value: 1 }], 100, 36, range))
      .toBe("M50.00 36.00 L100.00 0.00");
  });
});

describe("loadPeriodHistory", () => {
  it("filters mapped IDs and requests the selected start/end", async () => {
    const callApi = vi.fn().mockResolvedValue([]);
    const range = periodRange("week", new Date("2026-10-12T10:00:00Z"), "UTC");
    expect(await loadPeriodHistory({ callApi }, ["sensor.energy", "", "sensor.energy"], range)).toEqual(new Map());
    expect(callApi.mock.calls[0][1]).toContain("2026-10-06T00%3A00%3A00.000Z");
    expect(callApi.mock.calls[0][1]).toContain("end_time=");
    expect(await loadPeriodHistory({ callApi }, [], range)).toEqual(new Map());
    expect(callApi).toHaveBeenCalledOnce();
  });
});
