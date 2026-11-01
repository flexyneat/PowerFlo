/** @fileoverview Provisional grid evidence must not masquerade as a confirmed relay state. */
import {describe,it,expect} from "vitest";
import {normalizeConfig} from "../src/config.js";
import {deriveModel} from "../src/state-model.js";

/** @param {number|string} voltage Reported volts. @param {number|string} power Reported watts. @param {Object} options Extra configuration. @returns {Object} Derived telemetry. */
function model(voltage,power,options={}) {
  const config=normalizeConfig({grid_status_fallback:true,entities:{freshness:"binary_sensor.fresh",grid_voltage:"sensor.voltage",grid_power:"sensor.power"},...options});
  const states={"binary_sensor.fresh":{state:"on"},"sensor.voltage":{state:String(voltage),last_reported:new Date().toISOString()},"sensor.power":{state:String(power),last_reported:new Date().toISOString()}};
  return deriveModel(states,config,{grid:"stopped",battery:"stopped"});
}
describe("provisional grid evidence",()=>{
  it("keeps a zero-import grid available at normal fresh voltage",()=>{
    const value=model(240,0);expect(value.connected).toBe(true);expect(value.gridStatusBasis).toBe("voltage-based");expect(value.grid).toBe("static");
  });
  it("requires low voltage and low power to suspect outage",()=>{
    expect(model(12,0).connected).toBe(false);
    expect(model(12,500).connected).toBe(null);
    expect(model(150,0).connected).toBe(null);
    expect(model("unavailable",0).connected).toBe(null);
    expect(model(-1,0).connected).toBe(null);
  });
  it("rejects stale/future evidence, gates stale power, and preserves explicit signal priority",()=>{
    const config=normalizeConfig({grid_status_fallback:true,entities:{freshness:"binary_sensor.fresh",grid_voltage:"sensor.v",grid_power:"sensor.p",grid_connected:"binary_sensor.relay"}});
    const now=new Date().toISOString(),old=new Date(Date.now()-120000).toISOString();
    const states={"binary_sensor.fresh":{state:"on"},"sensor.v":{state:"240",last_reported:now},"sensor.p":{state:"500",last_reported:old}};
    const derive=()=>deriveModel(states,config,{grid:"stopped",battery:"stopped"});
    expect(derive().connected).toBe(true);expect(derive().grid).toBe("unavailable");expect(derive().flows.grid).toBe("stopped");
    states["sensor.v"].last_reported=old;expect(derive().connected).toBe(null);
    states["sensor.v"].last_reported=new Date(Date.now()+120000).toISOString();expect(derive().connected).toBe(null);
    states["sensor.v"].last_reported=now;states["binary_sensor.relay"]={state:"off"};
    expect(derive().connected).toBe(false);expect(derive().gridStatusBasis).toBe("relay signal");
    delete states["binary_sensor.relay"];states["binary_sensor.fresh"].state="off";expect(derive().connected).toBe(null);
  });
  it("does not trust unverified power alone or silently enable inference",()=>{
    expect(model("unavailable",500).connected).toBe(null);
    expect(model("unavailable",500,{grid_power_verified:true}).connected).toBe(true);
    expect(model(240,0,{grid_status_fallback:false}).connected).toBe(null);
  });
});
