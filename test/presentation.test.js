/** @fileoverview Test-first checks for typography, truthful chart geometry, and coherent icons. */
import { describe, expect, it } from "vitest";
import { readingParts, chartCoordinates, chartPaths } from "../src/presentation.js";
import { solarIcon, gridIcon, batteryBankIcon, loadIcon } from "../src/icons.js";
import { statisticsSeries } from "../src/statistics.js";

describe("refined presentation", () => {
  it("separates readable unit suffixes without converting unknown readings into zero", () => {
    expect(readingParts(4.82, "kW", 2)).toEqual({ number: "4.82", unit: "kW" });
    expect(readingParts(0, "%", 0)).toEqual({ number: "0", unit: "%" });
    for (const value of [null, undefined, NaN, Infinity]) expect(readingParts(value, "kWh")).toEqual({ number: "—", unit: "" });
  });
  it("places an actual observation on the same padded scale as its graph", () => {
    const points = [{ time: 0, value: 0 }, { time: 50, value: 5 }, { time: 100, value: 10 }];
    const range = { start: new Date(0), end: new Date(100) };
    expect(chartCoordinates(points[1], points, range)).toEqual({ x: 50, y: 18 });
    expect(chartCoordinates(points[2], points, range)).toEqual({ x: 100, y: 2 });
    expect(chartPaths(points, range).line).toContain("L50.00 18.00");
  });
  it("does not join or fill across missing statistics intervals", () => {
    const points = [{ time: 0, value: 0 }, { time: 25, value: 3 }, { time: 75, value: 5, breakBefore: true }, { time: 100, value: 8 }];
    const result = chartPaths(points, { start: new Date(0), end: new Date(100) });
    expect(result.line.match(/M/g)).toHaveLength(2);
    expect(result.area.match(/Z/g)).toHaveLength(2);
    expect(result.line).not.toContain("L75.00");
  });
  it("marks a real recorder gap before graph construction without inventing energy", () => {
    const hour = 3_600_000;
    const range = { start:new Date(0),end:new Date(4*hour) };
    const series = statisticsSeries([{start:0,end:hour,change:1},{start:2*hour,end:3*hour,change:2},{start:3*hour,end:4*hour,change:1}],range);
    expect(series.total).toBe(4);
    expect(series.partial).toBe(true);
    expect(series.points[2].breakBefore).toBe(true);
    expect(chartPaths(series.points,range).line.match(/M/g)).toHaveLength(2);
  });
  it("handles empty and flat histories without invalid coordinates", () => {
    const range = { start: new Date(0), end: new Date(100) };
    expect(chartPaths([], range)).toEqual({ line: "", area: "" });
    expect(chartPaths([{ time: 0, value: 0 }, { time: 100, value: 0 }], range).line).not.toContain("NaN");
  });
  it("gives every topology icon the same frame, weight, and restrained two-tone treatment", () => {
    for (const factory of [solarIcon, gridIcon, batteryBankIcon, loadIcon]) {
      const wrapper = document.createElement("div"); wrapper.innerHTML = factory();
      expect(wrapper.querySelector("svg").getAttribute("viewBox")).toBe("0 0 64 64");
      expect(wrapper.querySelector(".icon-lines")).not.toBeNull();
      expect(wrapper.querySelector(".icon-tone")).not.toBeNull();
      expect(wrapper.querySelector("svg").getAttribute("aria-hidden")).toBe("true");
    }
  });
});
