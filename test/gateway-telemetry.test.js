/** @fileoverview Optional gateway sensor coverage, unit and stale-data contracts. */
import {describe,it,expect} from "vitest";
import {normalizeConfig} from "../src/config.js";
import {gatewayTelemetry,telemetryText} from "../src/gateway-telemetry.js";
import {PowerFloCard} from "../src/card.js";
import {PowerFloEditor} from "../src/editor.js";
if(!customElements.get("telemetry-test-card"))customElements.define("telemetry-test-card",PowerFloCard);
if(!customElements.get("telemetry-test-editor"))customElements.define("telemetry-test-editor",PowerFloEditor);

const now=Date.parse("2026-10-23T10:00:00Z");
/** @param {string} state Reading. @param {string} unit HA unit. @param {number} age Age in ms. @returns {Object} HA fixture. */
function reading(state,unit,age=0){return {state,attributes:{unit_of_measurement:unit},last_updated:new Date(now-age).toISOString()};}
describe("optional gateway telemetry",()=>{
  it("provides editor mappings for all previously uncovered sensor roles",()=>{
    const config=normalizeConfig();
    for(const key of ["ac_temperature","dc_temperature","grid_l2_voltage","inverter_output_power","external_ct_power_candidate","battery_charge_today","grid_export_today","solar_total","grid_import_total","grid_export_total","battery_charge_total","battery_discharge_total"])expect(config.entities[key]).toBe("");
  });
  it("keeps output and CT candidates separate from load/flow roles and normalizes units",()=>{
    const config=normalizeConfig({entities:{inverter_output_power:"sensor.output",external_ct_power_candidate:"sensor.ct",ac_temperature:"sensor.ac"}});
    const rows=gatewayTelemetry({"sensor.output":reading("1.2","kW"),"sensor.ct":reading("-20","W"),"sensor.ac":reading("104","°F")},config,now).electrical;
    expect(rows.find(x=>x.key==="inverter_output_power").value).toBe(1200);
    expect(rows.find(x=>x.key==="ac_temperature").value).toBe(40);
    expect(rows.find(x=>x.key==="external_ct_power_candidate").label).toContain("candidate");
    expect(config.entities.load_power).toBe("");expect(config.entities.grid_power).toBe("");
  });
  it("never turns missing, wrong-unit, unknown or stale instantaneous values into zero",()=>{
    const config=normalizeConfig({entities:{ac_temperature:"sensor.ac",dc_temperature:"sensor.dc",grid_l2_voltage:"sensor.l2",inverter_output_power:"sensor.output"}});
    const result=gatewayTelemetry({"sensor.ac":reading("unknown","°C"),"sensor.dc":reading("24","W"),"sensor.l2":reading("230","V",900000)},config,now);
    expect(result.electrical.every(x=>x.value===null)).toBe(true);
    expect(result.electrical.find(x=>x.key==="grid_l2_voltage").status).toBe("Stale");
  });
  it("shows old counters as reported snapshots, not fresh power or recomputed period totals",()=>{
    const config=normalizeConfig({entities:{battery_charge_today:"sensor.charge",grid_export_total:"sensor.export"}});
    const result=gatewayTelemetry({"sensor.charge":reading("1500","Wh",3600000),"sensor.export":reading("2","MWh",86400000)},config,now);
    expect(result.daily[0].value).toBe(1.5);expect(result.daily[0].status).toBe("Reported snapshot");
    expect(result.lifetime[0].value).toBe(2000);expect(result.lifetime[0].reportedAt).toBe(now-86400000);
    expect(gatewayTelemetry({},normalizeConfig(),now).electrical).toEqual([]);
  });
  it("rejects future reports and negative energy, formats text without HTML parsing",()=>{
    const config=normalizeConfig({entities:{battery_charge_today:"sensor.charge",grid_export_total:"sensor.export"}});
    const rows=gatewayTelemetry({"sensor.charge":reading("-1","kWh"),"sensor.export":reading("2","kWh",-1000)},config,now);
    expect(rows.daily[0].value).toBeNull();expect(rows.lifetime[0].value).toBeNull();
    expect(telemetryText([],"UTC")).toContain("Optional");
    expect(telemetryText(rows.daily,"UTC",false)).toContain("Unavailable");
    expect(telemetryText(rows.lifetime,"UTC")).not.toContain("Invalid Date");
  });
  it("exposes editor fields and read-only optional snapshots without replacing estimates",()=>{
    const required=Object.fromEntries(["freshness","inverter_status","grid_connected","solar_power","battery_soc","battery_power","grid_power","load_power"].map(key=>[key,`sensor.${key}`]));
    const card=new PowerFloCard();card.setConfig({entities:{...required,ac_temperature:"sensor.ac",battery_charge_today:"sensor.charge"}});
    const age=now-Date.now();
    card.hassValue={config:{time_zone:"UTC"},states:{"sensor.ac":reading("42","°C",age),"sensor.charge":reading("4.2","kWh",age)}};
    card.updateModel();
    expect(card.shadowRoot.querySelector('[data-gateway-telemetry="electrical"]').textContent).toContain("42.00 °C");
    expect(card.shadowRoot.querySelector('[data-gateway-telemetry="daily"]').textContent).toContain("Reported snapshot");
    expect(card.shadowRoot.querySelector('[data-meta="battery-target"]')).not.toBeNull();
    expect(card.shadowRoot.querySelector('[data-meta="battery-full"]')).not.toBeNull();
    const editor=new PowerFloEditor();editor.setConfig(card.config);
    expect(editor.shadowRoot.querySelector('[data-path="entities.solar_total"]')).not.toBeNull();
    expect(editor.shadowRoot.querySelector('[data-path="entities.grid_l2_voltage"]')).not.toBeNull();
  });
});
