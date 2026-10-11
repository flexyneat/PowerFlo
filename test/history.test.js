/**
 * @fileoverview History API, timezone, parsing, and sparkline tests.
 */

import { describe, expect, it, vi } from "vitest";
import { appendHistoryPoint, downsample, historyPath, loadTodayHistory, parseHistory, sparklinePath, startOfDay } from "../src/history.js";

describe("startOfDay", () => {
  it("returns Lagos local midnight", () => {
    expect(startOfDay(new Date("2026-10-11T12:00:00Z"), "Africa/Lagos").toISOString()).toBe("2026-10-10T23:00:00.000Z");
  });

  it("handles a daylight-saving timezone", () => {
    expect(startOfDay(new Date("2026-07-04T18:00:00Z"), "America/New_York").toISOString()).toBe("2026-07-04T04:00:00.000Z");
  });
});

describe("history helpers", () => {
  it("creates a filtered lightweight API path", () => {
    const path = historyPath(["sensor.solar", "sensor.grid"], new Date("2026-10-10T23:00:00Z"), new Date("2026-10-11T08:00:00Z"));
    expect(path).toContain("history/period/");
    expect(path).toContain("filter_entity_id=sensor.solar%2Csensor.grid");
    expect(path).toContain("minimal_response=");
    expect(path).toContain("no_attributes=");
  });

  it("parses minimal history rows and drops invalid samples", () => {
    const parsed = parseHistory([[{
      entity_id: "sensor.solar",
      state: "0",
      last_changed: "2026-10-11T00:00:00Z",
    }, {
      state: "12.4",
      last_changed: "2026-10-11T08:00:00Z",
    }, {
      state: "unavailable",
      last_changed: "2026-10-11T08:01:00Z",
    }]]);
    expect(parsed.get("sensor.solar")).toHaveLength(2);
    expect(parsed.get("sensor.solar")[1].value).toBe(12.4);
  });

  it("ignores series that never identify an entity", () => {
    expect(parseHistory([[{ state: "1", last_changed: "2026-10-11T00:00:00Z" }]])).toEqual(new Map());
  });

  it("downsamples and creates deterministic paths", () => {
    const points = Array.from({ length: 20 }, (_, index) => ({ time: index * 1000, value: index }));
    expect(downsample(points, 5)).toHaveLength(5);
    expect(sparklinePath(points.slice(0, 3))).toMatch(/^M0.00 36.00 L50.00 18.00 L100.00 0.00$/);
    expect(sparklinePath([])).toBe("");
  });

  it("appends changed live values and suppresses duplicate bursts", () => {
    const initial = [{ time: 1_000, value: 4 }];
    expect(appendHistoryPoint(initial, { time: 2_000, value: 4 })).toEqual(initial);
    expect(appendHistoryPoint(initial, { time: 2_000, value: 5 })).toEqual([
      ...initial,
      { time: 2_000, value: 5 },
    ]);
  });

  it("replaces equal timestamps, rejects out-of-order data, and caps memory", () => {
    expect(appendHistoryPoint([{ time: 1_000, value: 4 }], { time: 1_000, value: 5 })).toEqual([{ time: 1_000, value: 5 }]);
    expect(appendHistoryPoint([{ time: 2_000, value: 4 }], { time: 1_000, value: 5 })).toEqual([{ time: 2_000, value: 4 }]);
    const points = [{ time: 1_000, value: 1 }, { time: 2_000, value: 2 }];
    expect(appendHistoryPoint(points, { time: 3_000, value: 3 }, 0, 2)).toEqual([
      { time: 2_000, value: 2 },
      { time: 3_000, value: 3 },
    ]);
    expect(appendHistoryPoint(points, { time: Number.NaN, value: 3 })).toEqual(points);
  });

  it("loads history through the authenticated Home Assistant client", async () => {
    const callApi = vi.fn().mockResolvedValue([[{
      entity_id: "sensor.solar",
      state: "1",
      last_changed: "2026-10-11T00:00:00Z",
    }]]);
    const result = await loadTodayHistory({ callApi, config: { time_zone: "Africa/Lagos" } }, ["sensor.solar", "sensor.solar"], new Date("2026-10-11T08:00:00Z"));
    expect(callApi).toHaveBeenCalledOnce();
    expect(result.get("sensor.solar")).toHaveLength(1);
  });

  it("returns no history without configured entities", async () => {
    const callApi = vi.fn();
    expect(await loadTodayHistory({ callApi, config: {} }, [])).toEqual(new Map());
    expect(callApi).not.toHaveBeenCalled();
  });
});
