/** @fileoverview Read-only Phase 1 integration, scenario isolation and editor review/save. */
import {beforeEach,afterEach,describe,it,expect,vi} from "vitest";
import {PowerFloCard} from "../src/card.js";
import {PowerFloEditor} from "../src/editor.js";
import {DEFAULT_CONFIG} from "../src/config.js";
import {ReadinessPanel} from "../src/readiness-panel.js";
import {normalizeConfig} from "../src/config.js";
if(!customElements.get("test-phase1-card"))customElements.define("test-phase1-card",PowerFloCard);
if(!customElements.get("test-phase1-editor"))customElements.define("test-phase1-editor",PowerFloEditor);
/** @returns {Object} Consistent one-battery/night fixture and canonical units. */
function fixture(){
 const entities=Object.fromEntries(Object.keys(DEFAULT_CONFIG.entities).map(k=>[k,["freshness","grid_connected"].includes(k)?`binary_sensor.${k}`:`sensor.${k}`]));
 const values={freshness:"on",grid_connected:"off",inverter_status:"normal",battery_soc:95,battery_power:1333,load_power:1200};
 const states=Object.fromEntries(Object.entries(entities).map(([k,id])=>[id,{state:String(values[k]??0),last_updated:new Date().toISOString(),attributes:{unit_of_measurement:k==="battery_soc"?"%":k.endsWith("power")?"W":undefined}}]));
 return {config:{entities,battery_capacity_kwh:16,readiness_average_w:1200},hass:{states,config:{time_zone:"UTC"}}};
}
beforeEach(()=>{vi.useFakeTimers();vi.setSystemTime(new Date("2026-10-19T22:00:00Z"));vi.stubGlobal("matchMedia",()=>({matches:true,addEventListener(){},removeEventListener(){}}));});
afterEach(()=>{vi.useRealTimers();vi.unstubAllGlobals();});
describe("readiness and simulator UI",()=>{
 it("labels next-day deadlines explicitly without depending on the browser zone",()=>{
  const f=fixture(),card=new PowerFloCard();card.setConfig(f.config);card.hassValue=f.hass;card.updateModel();
  expect(card.shadowRoot.querySelector('[data-night-title]').textContent).toContain("tomorrow");
  vi.setSystemTime(new Date("2026-10-20T01:00:00Z"));
  for(const state of Object.values(f.hass.states))state.last_updated=new Date().toISOString();card.updateModel();
  expect(card.shadowRoot.querySelector('[data-night-title]').textContent).not.toContain("tomorrow");
 });
 it("normalizes new configuration without converting unknown manual demand into zero",()=>{
  expect(normalizeConfig({readiness_average_w:"bad",readiness_deadline:"99:99"})).toMatchObject({readiness_average_w:null,readiness_deadline:"06:00"});
  expect(normalizeConfig({readiness_average_w:0,readiness_enabled:false})).toMatchObject({readiness_average_w:0,readiness_enabled:false});
 });
 it("preserves estimates and changes scenario only, including live refresh and reset",()=>{
  const f=fixture(),card=new PowerFloCard();card.setConfig(f.config);card.hassValue=f.hass;card.updateModel();
  expect(card.shadowRoot.querySelector('[data-night-soc]').textContent).toBe("28%");
  for(const key of ["battery-target","battery-full"])expect(card.shadowRoot.querySelector(`[data-meta="${key}"]`)).not.toBeNull();
  const input=card.shadowRoot.querySelector('[data-scenario="extra"]');input.value="100";input.dispatchEvent(new Event("input"));
  expect(card.shadowRoot.querySelector('[data-scenario-result]').textContent).toContain("scenario 23%");
  card.updateModel();expect(input.value).toBe("100");expect(card.config.battery_capacity_kwh).toBe(16);expect(card.config.battery_reserve_soc).toBe(20);
  card.shadowRoot.querySelector('[data-reset-scenario]').click();expect(input.value).toBe("0");
  expect(card.shadowRoot.querySelector('#mode,#grid-mode,.fixture-controls')).toBeNull();
 });
 it("invalidates results when SOC ages and supports hidden readiness",()=>{
  const f=fixture(),card=new PowerFloCard();card.setConfig(f.config);card.hassValue=f.hass;card.updateModel();
  vi.advanceTimersByTime(61000);card.updateModel();expect(card.shadowRoot.querySelector('[data-night-status]').textContent).toContain("Fresh");
  card.setConfig({...f.config,readiness_enabled:false});card.updateModel();expect(card.shadowRoot.querySelector('.readiness').hidden).toBe(true);
 });
 it("handles bad scenario inputs without changing installed capacity",()=>{
  const f=fixture(),card=new PowerFloCard();card.setConfig(f.config);card.hassValue=f.hass;card.updateModel();
  const input=card.shadowRoot.querySelector('[data-scenario="capacity"]');input.value="";input.dispatchEvent(new Event("input"));
  expect(card.shadowRoot.querySelector('[data-scenario-result]').textContent).toContain("Enter valid");expect(card.config.battery_capacity_kwh).toBe(16);
 });
});
describe("guided editor",()=>{
 it("blocks incompatible mappings and preserves the draft until cancel",()=>{
  const f=fixture(),editor=new PowerFloEditor();editor.hass=f.hass;editor.setConfig(f.config);
  const root=editor.shadowRoot,input=root.querySelector('[data-guide-role="load_power"]');input.value="sensor.absent";input.dispatchEvent(new Event("input"));
  root.querySelector('[data-guide-next]').click();const confirm=root.querySelector('[data-guide-confirm]');confirm.checked=true;confirm.dispatchEvent(new Event("change"));
  expect(root.querySelector('[data-guide-next]').disabled).toBe(true);root.querySelector('[data-guide-back]').click();expect(root.querySelector('[data-guide-role="load_power"]').value).toBe("sensor.absent");
  root.querySelector('[data-guide-cancel]').click();expect(root.querySelector('[data-guide-role="load_power"]').value).toBe(f.config.entities.load_power);
 });
 it("holds drafts until review/save, confirms roles and signs and preserves optional configuration",()=>{
  const f=fixture(),editor=new PowerFloEditor();editor.hass=f.hass;editor.setConfig(f.config);const events=[];editor.addEventListener("config-changed",e=>events.push(e.detail.config));
  const root=editor.shadowRoot;root.querySelector('[data-guide-next]').click();
  expect(root.querySelector('[data-guide-step]').textContent).toContain("2 of 3");
  const confirm=root.querySelector('[data-guide-confirm]');confirm.checked=true;confirm.dispatchEvent(new Event("change"));
  root.querySelector('[data-guide-next]').click();expect(events).toHaveLength(0);
  root.querySelector('[data-guide-save]').click();expect(events).toHaveLength(1);expect(events[0].entities).toEqual(f.config.entities);
  expect(events[0].battery_capacity_kwh).toBe(16);
 });
 it("renders malicious entity labels only as text and provides cancel without events",()=>{
  const f=fixture(),editor=new PowerFloEditor();editor.hass={...f.hass,states:{...f.hass.states,"sensor.evil":{state:"1",attributes:{unit_of_measurement:"W",friendly_name:'<img src=x onerror=alert(1)>'}}}};editor.setConfig(f.config);
  const spy=vi.fn();editor.addEventListener("config-changed",spy);editor.shadowRoot.querySelector('[data-guide-cancel]').click();expect(spy).not.toHaveBeenCalled();expect(editor.shadowRoot.querySelector("img")).toBeNull();
 });
});
describe("readiness history lifecycle",()=>{
 it("retains explicit fallback on Recorder failure, throttles reads and respects manual mode",async()=>{
  const f=fixture(),panel=new ReadinessPanel(),config=normalizeConfig({...f.config,readiness_average_w:null});f.hass.callApi=vi.fn(async()=>{throw Error("offline");});
  panel.update(f.hass,config,{dataState:"fresh",connected:false});await panel.load(f.hass,config);
  expect(panel.historyStatus).toContain("History unavailable");expect(panel.element.querySelector('[data-night-basis]').textContent).toContain("current load fallback");
  panel.element.querySelector('[data-night-retry]').click();await panel.load(f.hass,config);expect(f.hass.callApi).toHaveBeenCalledTimes(1);
  await panel.load(f.hass,normalizeConfig(f.config));expect(f.hass.callApi).toHaveBeenCalledTimes(1);
 });
 it("discards a superseded historical response and permits reconnect retry",async()=>{
  const f=fixture(),panel=new ReadinessPanel(),config=normalizeConfig({...f.config,readiness_average_w:null});let finish;
  f.hass.callApi=vi.fn(()=>new Promise(resolve=>{finish=resolve;}));panel.update(f.hass,config,{dataState:"fresh",connected:false});const pending=panel.load(f.hass,config);
  panel.disconnect();finish([]);await pending;expect(panel.profile).toBeNull();expect(panel.lastFetch).toBeNull();
 });
 it("accepts bounded history and marks a sparse profile as fallback rather than zero",async()=>{
  const f=fixture(),panel=new ReadinessPanel(),config=normalizeConfig({...f.config,readiness_average_w:null});f.hass.callApi=vi.fn(async()=>[]);panel.update(f.hass,config,{dataState:"fresh",connected:false});await panel.load(f.hass,config);
  expect(panel.profile).not.toBeNull();expect(panel.element.querySelector('[data-night-basis]').textContent).toContain("fallback");
 });
});
