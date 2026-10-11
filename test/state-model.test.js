/**
 * @fileoverview Domain-state and true-flow direction tests.
 */

import { describe, expect, it } from "vitest";
import { normalizeConfig } from "../src/config.js";
import { batteryMode, booleanState, deriveModel, flowDirection, gridMode, numericState, powerPolarity, textState } from "../src/state-model.js";

const config = normalizeConfig({
  entities: {
    freshness: "binary_sensor.fresh",
    inverter_status: "sensor.status",
    grid_connected: "binary_sensor.grid",
    solar_power: "sensor.solar",
    battery_soc: "sensor.soc",
    battery_power: "sensor.battery",
    grid_power: "sensor.grid",
    load_power: "sensor.load",
  },
});

/**
 * Creates a state object.
 * @param {string | number} state State value.
 * @returns {{state: string}} Home Assistant-like state.
 */
function entity(state) {
  return { state: String(state) };
}

describe("state readers", () => {
  const states = { "sensor.number": entity("42.5"), "sensor.text": entity(" Normal "), "binary_sensor.on": entity("on") };
  it("reads available values", () => {
    expect(numericState(states, "sensor.number")).toBe(42.5);
    expect(textState(states, "sensor.text")).toBe("normal");
    expect(booleanState(states, "binary_sensor.on")).toBe(true);
  });
  it("does not convert missing values to zero", () => {
    expect(numericState(states, "sensor.missing")).toBeNull();
    expect(textState({ x: entity("unavailable") }, "x")).toBeNull();
    expect(booleanState({ x: entity("maybe") }, "x")).toBeNull();
  });
});

describe("hysteresis and modes", () => {
  it("holds active polarity until the release threshold", () => {
    expect(powerPolarity(45, "stopped", 40, 20)).toBe("positive");
    expect(powerPolarity(25, "positive", 40, 20)).toBe("positive");
    expect(powerPolarity(10, "positive", 40, 20)).toBe("stopped");
    expect(powerPolarity(-45, "stopped", 40, 20)).toBe("negative");
    expect(powerPolarity(null, "positive", 40, 20)).toBe("stopped");
  });

  it("maps configurable battery polarity to dynamic status", () => {
    expect(batteryMode("positive", "discharge")).toBe("discharging");
    expect(batteryMode("negative", "discharge")).toBe("charging");
    expect(batteryMode("positive", "charge")).toBe("charging");
    expect(batteryMode("stopped", "charge")).toBe("static");
    expect(batteryMode("positive", "charge", false)).toBe("unavailable");
  });

  it("maps grid polarity and connection state", () => {
    expect(gridMode("positive", "import", true)).toBe("importing");
    expect(gridMode("negative", "import", true)).toBe("exporting");
    expect(gridMode("positive", "export", true)).toBe("exporting");
    expect(gridMode("stopped", "import", true)).toBe("static");
    expect(gridMode("positive", "import", false)).toBe("disconnected");
    expect(gridMode("positive", "import", true, false)).toBe("unavailable");
  });

  it("maps every true power-flow direction", () => {
    expect(flowDirection("solar", "producing")).toBe("forward");
    expect(flowDirection("battery", "discharging")).toBe("forward");
    expect(flowDirection("battery", "charging")).toBe("reverse");
    expect(flowDirection("grid", "importing")).toBe("forward");
    expect(flowDirection("grid", "exporting")).toBe("reverse");
    expect(flowDirection("load", "powered")).toBe("reverse");
    expect(flowDirection("grid", "static")).toBe("stopped");
  });
});

describe("deriveModel", () => {
  it("derives discharge/import flows from fresh live values", () => {
    const states = {
      "binary_sensor.fresh": entity("on"),
      "sensor.status": entity("normal"),
      "binary_sensor.grid": entity("on"),
      "sensor.solar": entity(4820),
      "sensor.soc": entity(85),
      "sensor.battery": entity(512),
      "sensor.grid": entity(240),
      "sensor.load": entity(450),
    };
    const model = deriveModel(states, config, { battery: "stopped", grid: "stopped" });
    expect(model.battery).toBe("discharging");
    expect(model.grid).toBe("importing");
    expect(model.flows).toEqual({ solar: "forward", battery: "forward", grid: "forward", load: "reverse" });
  });

  it("reverses the battery arrow while charging", () => {
    const states = {
      "binary_sensor.fresh": entity("on"),
      "sensor.status": entity("normal"),
      "binary_sensor.grid": entity("on"),
      "sensor.solar": entity(0),
      "sensor.soc": entity(85),
      "sensor.battery": entity(-1500),
      "sensor.grid": entity(1700),
      "sensor.load": entity(200),
    };
    const model = deriveModel(states, config, { battery: "stopped", grid: "stopped" });
    expect(model.battery).toBe("charging");
    expect(model.flows.battery).toBe("reverse");
  });

  it("stops all unavailable flows when freshness expires", () => {
    const states = {
      "binary_sensor.fresh": entity("off"),
      "sensor.status": entity("normal"),
      "binary_sensor.grid": entity("on"),
      "sensor.solar": entity(4820),
      "sensor.battery": entity(512),
      "sensor.grid": entity(240),
      "sensor.load": entity(450),
    };
    const model = deriveModel(states, config, { battery: "positive", grid: "positive" });
    expect(model.dataState).toBe("stale");
    expect(model.battery).toBe("unavailable");
    expect(model.flows).toEqual({ solar: "stopped", battery: "stopped", grid: "stopped", load: "stopped" });
  });
});
