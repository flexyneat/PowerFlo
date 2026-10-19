/** @fileoverview Phase 2 progressive disclosure and read-only UI regressions. */
import {beforeEach,afterEach,describe,it,expect,vi} from "vitest";
import {PowerFloCard} from "../src/card.js";
import {PowerFloEditor} from "../src/editor.js";
import {DEFAULT_CONFIG} from "../src/config.js";
if(!customElements.get("phase2-test-card"))customElements.define("phase2-test-card",PowerFloCard);
if(!customElements.get("phase2-test-editor"))customElements.define("phase2-test-editor",PowerFloEditor);
/** @param {Object} options Overrides. @returns {PowerFloCard} Unattached deterministic card. */
function fixture(options={}){
 const entities=Object.fromEntries(Object.keys(DEFAULT_CONFIG.entities).map(k=>[k,`sensor.${k}`]));
 const card=new PowerFloCard();card.setConfig({entities,battery_capacity_kwh:16,readiness_average_w:450,...options});
 const values={freshness:"on",inverter_status:"normal",grid_connected:"on",battery_soc:85,battery_power:-2000,load_power:3000,grid_power:240};
 card.hassValue={config:{time_zone:"UTC"},states:Object.fromEntries(Object.entries(entities).map(([k,id])=>[id,{state:String(values[k]??0),last_updated:new Date().toISOString(),attributes:{unit_of_measurement:k==="battery_soc"?"%":k.endsWith("_today")?"kWh":k.endsWith("_power")?"W":undefined}}]))};
 card.updateModel();return card;
}
beforeEach(()=>{vi.useFakeTimers();vi.setSystemTime(new Date("2026-10-19T11:00:00Z"));vi.stubGlobal("matchMedia",()=>({matches:true,addEventListener(){},removeEventListener(){}}));});
afterEach(()=>{vi.useRealTimers();vi.unstubAllGlobals();});
describe("Phase 2 UI",()=>{
 it("shows explained energy adequacy without replacing both charge estimates",()=>{
  const c=fixture(),r=c.shadowRoot;
  expect(r.querySelector('[data-preparedness="available"]').textContent).toBe("9.36 kWh");
  expect(r.querySelector('[data-preparedness="demand"]').textContent).toBe("8.55 kWh");
  expect(r.querySelector('[data-preparedness="margin"]').textContent).toBe("+0.81 kWh");
  expect(r.querySelector('[data-preparedness="power"]').textContent).toContain("Not assessed");
  expect(r.querySelector('[data-meta="battery-target"]')).not.toBeNull();expect(r.querySelector('[data-meta="battery-full"]')).not.toBeNull();
 });
 it("hides preparedness independently, preserving simulator and battery estimates",()=>{
  const c=fixture({preparedness_enabled:false}),r=c.shadowRoot;
  expect(r.querySelector('[data-night-details]').hidden).toBe(true);expect(r.querySelector('.readiness-row').hidden).toBe(true);
  expect(r.querySelector('[data-simulation]').hidden).toBe(false);expect(r.querySelector('.readiness').dataset.preparedness).toBe("hidden");
  expect(r.querySelector('[data-meta="battery-full"]')).not.toBeNull();
 });
 it("uses one kWh scale for Wh daily counters and their comparison overlays",()=>{
  const c=fixture(),id=c.config.entities.solar_today;
  c.hassValue.states[id].state="12400";c.hassValue.states[id].attributes.unit_of_measurement="Wh";
  c.updateModel();expect(c.shadowRoot.querySelector('[data-summary-value="solar"]').textContent).toBe("12.4 kWh");
  expect(c.chartSeries.get("solar").at(-1).value).toBe(12.4);
 });
 it("opens Grid insights on demand, displays missing evidence honestly and returns focus on Escape",()=>{
  const c=fixture();document.body.append(c);const r=c.shadowRoot,button=r.querySelector('[data-grid-insights-toggle]');
  button.click();expect(r.querySelector('.grid-insights').open).toBe(true);
  expect(r.querySelector('[data-export-status]').textContent).toContain("Verify");expect(r.querySelector('[data-standby-status]').textContent).toContain("Not assessed");
  r.querySelector('.grid-insights').dispatchEvent(new KeyboardEvent("keydown",{key:"Escape",bubbles:true}));
  expect(r.querySelector('.grid-insights').open).toBe(false);expect(r.activeElement).toBe(button);c.remove();
 });
 it("never fetches comparison while off, then requests only mapped energy IDs and cancels late results",async()=>{
  const c=fixture(),api=vi.fn(async()=>[]);c.hassValue.callApi=api;
  await c.comparison.refresh(c.hassValue,c.config,"today");expect(api).not.toHaveBeenCalled();
  const toggle=c.shadowRoot.querySelector('[data-compare]');toggle.checked=true;toggle.dispatchEvent(new Event("change"));await Promise.resolve();await Promise.resolve();
  expect(api).toHaveBeenCalledTimes(2);expect(api.mock.calls.every(x=>x[0]==="get"&&x[1].includes("filter_entity_id="))).toBe(true);
  toggle.checked=false;toggle.dispatchEvent(new Event("change"));expect(c.comparison.enabled).toBe(false);
  expect(c.shadowRoot.querySelector('[data-reference-path="solar"]').getAttribute("d")).toBe("");
 });
 it("exposes new settings through standard HA config events only",()=>{
  const c=fixture(),editor=new PowerFloEditor();editor.setConfig(c.config);const events=[];editor.addEventListener("config-changed",e=>events.push(e.detail.config));
  const control=editor.shadowRoot.querySelector('[data-path="preparedness_enabled"]');control.value="false";control.dispatchEvent(new Event("change",{bubbles:true}));
  expect(events[0].preparedness_enabled).toBe(false);expect(events[0].readiness_enabled).toBe(true);
 });
});
