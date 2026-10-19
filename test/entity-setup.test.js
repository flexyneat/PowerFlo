/** @fileoverview Guided setup rejects guessing units, roles and power signs. */
import {describe,it,expect} from "vitest";
import {mappingCheck,entitySuggestions} from "../src/entity-setup.js";
describe("guided entity validation",()=>{
  const states={"sensor.load":{state:"1200",attributes:{unit_of_measurement:"W",friendly_name:"Protected load"}},"sensor.other":{state:"1.2",attributes:{unit_of_measurement:"kW"}},"binary_sensor.grid":{state:"off",attributes:{}},"sensor.soc":{state:"95",attributes:{unit_of_measurement:"%"}}};
  it("requires the card's canonical watts and valid SOC, never silent conversion",()=>{
    expect(mappingCheck("load_power","sensor.load",states,{}).status).toBe("compatible");
    expect(mappingCheck("load_power","sensor.other",states,{}).status).toBe("incompatible-unit");
    expect(mappingCheck("battery_soc","sensor.soc",states,{}).status).toBe("compatible");
    expect(mappingCheck("battery_soc","sensor.bad",{"sensor.bad":{state:"101",attributes:{unit_of_measurement:"%"}}},{}).status).toBe("invalid-value");
  });
  it("keeps a zero power reading distinct from explicit grid connection",()=>{
    expect(mappingCheck("grid_connected","sensor.load",states,{}).status).not.toBe("compatible");
    expect(mappingCheck("grid_connected","binary_sensor.grid",states,{}).status).toBe("compatible");
    expect(mappingCheck("battery_power","sensor.load",states,{}).status).toBe("requires-confirmation");
  });
  it("flags missing, unknown, duplicate and nonfinite mappings",()=>{
    expect(mappingCheck("load_power","",states,{}).status).toBe("unmapped");
    expect(mappingCheck("load_power","sensor.missing",states,{}).status).toBe("unavailable");
    expect(mappingCheck("load_power","sensor.load",states,{grid_power:"sensor.load"}).status).toBe("duplicate");
    expect(mappingCheck("load_power","sensor.bad",{"sensor.bad":{state:"NaN",attributes:{unit_of_measurement:"W"}}},{}).status).toBe("invalid-value");
  });
  it("suggests candidates without automatically choosing same-unit entities",()=>{
    expect(entitySuggestions("load_power",states)).toContain("sensor.load");
    expect(entitySuggestions("load_power",states)).not.toContain("sensor.other");
    expect(entitySuggestions("grid_connected",states)).toEqual(["binary_sensor.grid"]);
  });
});
