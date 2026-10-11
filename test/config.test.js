/**
 * @fileoverview Configuration security and normalization tests.
 */

import { describe, expect, it } from "vitest";
import { DEFAULT_CONFIG, normalizeConfig, safeImageSource, validateConfig } from "../src/config.js";

describe("safeImageSource", () => {
  it("accepts local, HA image, and safe raster data sources", () => {
    expect(safeImageSource("/local/inverter.webp")).toBe("/local/inverter.webp");
    expect(safeImageSource("/api/image/serve/abc/original")).toBe("/api/image/serve/abc/original");
    expect(safeImageSource("data:image/png;base64,AA==")).toBe("data:image/png;base64,AA==");
  });

  it("rejects active, insecure, and SVG sources", () => {
    expect(safeImageSource("javascript:alert(1)")).toBe("");
    expect(safeImageSource("http://example.com/a.png")).toBe("");
    expect(safeImageSource("https://example.com/a.png")).toBe("");
    expect(safeImageSource("data:image/svg+xml;base64,PHN2Zz4=")).toBe("");
  });
});

describe("normalizeConfig", () => {
  it("merges entity mappings and clamps flow thresholds", () => {
    const config = normalizeConfig({
      title: "X".repeat(100),
      flow_threshold_w: 35,
      flow_release_w: 99,
      entities: { battery_power: "sensor.battery_power" },
    });
    expect(config.title).toHaveLength(60);
    expect(config.flow_threshold_w).toBe(35);
    expect(config.flow_release_w).toBe(35);
    expect(config.entities.battery_power).toBe("sensor.battery_power");
    expect(config.entities.grid_power).toBe(DEFAULT_CONFIG.entities.grid_power);
  });

  it("uses explicit polarity and clock settings", () => {
    const config = normalizeConfig({ battery_positive: "charge", grid_positive: "export", clock_format: "24" });
    expect(config.battery_positive).toBe("charge");
    expect(config.grid_positive).toBe("export");
    expect(config.clock_format).toBe("24");
  });

  it("uses numeric fallbacks for invalid values", () => {
    const config = normalizeConfig({ inverter_capacity_kw: "invalid", battery_capacity_kwh: -5 });
    expect(config.inverter_capacity_kw).toBe(DEFAULT_CONFIG.inverter_capacity_kw);
    expect(config.battery_capacity_kwh).toBe(0.1);
  });
});

describe("validateConfig", () => {
  it("names every missing required entity", () => {
    const errors = validateConfig(normalizeConfig());
    expect(errors).toContain("Missing required entity: battery_power");
    expect(errors).toContain("Missing required entity: grid_power");
  });

  it("accepts a complete required mapping", () => {
    const entities = Object.fromEntries(Object.keys(DEFAULT_CONFIG.entities).map((key) => [key, `sensor.${key}`]));
    expect(validateConfig(normalizeConfig({ entities }))).toEqual([]);
  });

  it("reports an invalid raw hysteresis relationship", () => {
    const entities = Object.fromEntries(Object.keys(DEFAULT_CONFIG.entities).map((key) => [key, `sensor.${key}`]));
    const config = { ...normalizeConfig({ entities }), flow_threshold_w: 20, flow_release_w: 40 };
    expect(validateConfig(config)).toContain("Flow release threshold must not exceed activation threshold");
  });
});
