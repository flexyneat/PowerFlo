/** @fileoverview Recent demand parsing, bounded coverage and time-weighted statistics. */
import { describe, expect, it, vi } from "vitest";
import { demandSummary, parseDemandHistory, loadDemandHistory } from "../src/load-trend.js";

describe("recent protected-load demand", () => {
  it("weights actual intervals rather than the number of samples", () => {
    const result = demandSummary([{time:0,value:1000},{time:30_000,value:3000},{time:90_000,value:2000}], 120_000, 120_000, 60_000);
    expect(result.averageWatts).toBe(2250); expect(result.peakWatts).toBe(3000);
    expect(result.coverage).toBe(1); expect(result.points).toHaveLength(3);
  });
  it("does not carry readings across missing intervals or invent zero demand", () => {
    const result = demandSummary([{time:0,value:1000},{time:120_000,value:null},{time:180_000,value:3000}],240_000,240_000,60_000);
    expect(result.averageWatts).toBe(2000); expect(result.coverage).toBe(.5);
    expect(result.points[1].breakBefore).toBe(true);
  });
  it("clips a boundary seed and rejects future samples", () => {
    const result = demandSummary([{time:40_000,value:1000},{time:100_000,value:2000},{time:160_000,value:9999}],150_000,60_000,60_000);
    expect(result.averageWatts).toBeCloseTo(1833.3333); expect(result.peakWatts).toBe(2000);
    expect(result.points.every(p=>p.time>=90_000 && p.time<=150_000)).toBe(true);
  });
  it("keeps actual zero load and unknown histories distinct", () => {
    expect(demandSummary([{time:0,value:0}],30_000,30_000,60_000).averageWatts).toBe(0);
    expect(demandSummary([{time:0,value:null}],30_000,30_000,60_000).averageWatts).toBe(null);
    expect(demandSummary([],30_000).peakWatts).toBe(null);
  });
  it("does not report a current endpoint as a measured interval average", () => {
    const result=demandSummary([{time:30_000,value:1500}],30_000,30_000);
    expect(result.averageWatts).toBe(null); expect(result.peakWatts).toBe(1500);
  });
  it("excludes an expired pre-window spike from the window peak", () => {
    const result=demandSummary([{time:0,value:9999},{time:60_000,value:1000}],120_000,60_000,60_000);
    expect(result.peakWatts).toBe(1000);
  });
  it("preserves unavailable markers, validates units, and bounds parsed input", () => {
    const rows=[[{entity_id:"sensor.load",state:"1000",last_changed:new Date(0).toISOString()},
      {state:"unavailable",last_changed:new Date(10_000).toISOString()},
      {state:"",last_changed:new Date(20_000).toISOString()},
      {state:"-10",last_changed:new Date(30_000).toISOString()},
      {state:"3000",last_changed:new Date(40_000).toISOString()}]];
    expect(parseDemandHistory(rows,"sensor.load","W").map(p=>p.value)).toEqual([1000,null,null,null,3000]);
    expect(parseDemandHistory(rows,"sensor.load","kW")[0].value).toBe(1_000_000);
    expect(parseDemandHistory(rows,"sensor.load","V")).toEqual([]);
    expect(parseDemandHistory(null,"sensor.load","W")).toEqual([]);
    expect(parseDemandHistory([[{entity_id:"sensor.other",state:"20",last_changed:new Date(0).toISOString()}]],"sensor.load","W")).toEqual([]);
  });
  it("loads only the mapped power entity through an authenticated GET", async () => {
    const hass={callApi:vi.fn(async()=>[])};
    await loadDemandHistory(hass,"sensor.load",new Date(900_000),"W");
    expect(hass.callApi.mock.calls[0][0]).toBe("get");
    expect(hass.callApi.mock.calls[0][1]).toContain("filter_entity_id=sensor.load");
  });
});
