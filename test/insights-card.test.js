/** @fileoverview Integrated insight presentation and native editor configuration checks. */
import {afterEach,beforeEach,describe,it,expect,vi} from "vitest";
import {PowerFloCard} from "../src/card.js";
import {DEFAULT_CONFIG,normalizeConfig} from "../src/config.js";
if(!customElements.get("test-insights-card"))customElements.define("test-insights-card",PowerFloCard);
beforeEach(()=>{vi.stubGlobal("matchMedia",()=>({matches:true,addEventListener(){},removeEventListener(){}}));});
afterEach(()=>vi.unstubAllGlobals());
describe("system insight integration",()=>{
  it("preserves both estimates while allowing expanded density and optional MPPT/BMS telemetry",()=>{
    const card=new PowerFloCard(),entities=Object.fromEntries(Object.keys(DEFAULT_CONFIG.entities).map(k=>[k,`sensor.${k}`]));
    card.setConfig({entities,density:"expanded",solar_capacity_kw:10});
    const values={freshness:"on",inverter_status:"normal",grid_connected:"on",battery_soc:80,battery_power:2000,grid_power:1000,solar_power:2000,load_power:3000,pv1_voltage:300,pv1_current:6,bms_charge_current_limit:100};
    card.hassValue={config:{time_zone:"UTC"},states:Object.fromEntries(Object.entries(entities).map(([k,id])=>[id,{state:String(values[k]??0),last_updated:new Date().toISOString(),attributes:{}}]))};
    card.updateModel();
    expect(card.shadowRoot.querySelector(".powerflo-insights").open).toBe(true);
    expect(card.shadowRoot.querySelector('[data-insight="solar"]').textContent).toContain("20.0%");
    expect(card.shadowRoot.querySelector('[data-insight="mppt"]').textContent).toContain("300.0 V");
    expect(card.shadowRoot.querySelector('[data-insight="limits"]').textContent).toContain("100.0 A");
    expect(card.shadowRoot.querySelector('[data-meta="battery-target"]')).not.toBeNull();
    expect(card.shadowRoot.querySelector('[data-meta="battery-full"]')).not.toBeNull();
    expect(card.shadowRoot.querySelector("select")).toBeNull();
  });
  it("normalizes opt-in/density/efficiency without coercing a false string to true",()=>{
    expect(normalizeConfig({density:"bad",use_learned_taper:"true",runtime_load_efficiency:2})).toMatchObject({density:"standard",use_learned_taper:false,runtime_load_efficiency:1});
    expect(normalizeConfig({density:"compact",use_learned_taper:true})).toMatchObject({density:"compact",use_learned_taper:true});
  });
  it("keeps session events on Recorder failure and throttles retry",async()=>{
    const card=new PowerFloCard(),entities=Object.fromEntries(Object.keys(DEFAULT_CONFIG.entities).map(k=>[k,`sensor.${k}`]));
    card.setConfig({entities});card.hassValue={callApi:vi.fn(async()=>{throw new Error("offline");})};
    card.outageSession.observe(Date.now()-100,true);card.outageSession.observe(Date.now()-50,false);
    await card.loadOutagesIfNeeded();expect(card.outageHistoryState).toContain("Unavailable");
    expect(card.outageSession.events).toHaveLength(1);await card.loadOutagesIfNeeded();expect(card.hassValue.callApi).toHaveBeenCalledTimes(1);
  });
});
