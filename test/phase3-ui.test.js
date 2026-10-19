/** @fileoverview Solar/accuracy progressive disclosure, keyboard, privacy and lifecycle regressions. */
import {beforeEach,afterEach,describe,it,expect,vi} from "vitest";
import {PowerFloCard} from "../src/card.js";
import {PowerFloEditor} from "../src/editor.js";
import {DEFAULT_CONFIG,normalizeConfig} from "../src/config.js";
import {forecastStepPath,solarHistoryPoints} from "../src/phase3-panel.js";
import {chartPaths} from "../src/presentation.js";
import {connectorPath} from "../src/connector-geometry.js";
if(!customElements.get("phase3-card"))customElements.define("phase3-card",PowerFloCard);
if(!customElements.get("phase3-editor"))customElements.define("phase3-editor",PowerFloEditor);
const now=Date.parse("2026-10-19T11:00:00Z");
/** @param {Object} options Config overrides. @returns {PowerFloCard} Read-only fixture. */
function fixture(options={}){
 const entities=Object.fromEntries(Object.keys(DEFAULT_CONFIG.entities).map(k=>[k,`sensor.${k}`]));
 const c=new PowerFloCard();c.setConfig({entities,solar_forecast_sources:["roof"],weather_entity:"weather.home",battery_capacity_kwh:16,...options});
 const values={freshness:"on",inverter_status:"normal",grid_connected:"on",battery_soc:85,battery_power:-2000,load_power:3000,grid_power:240};
 c.hassValue={user:{id:"test-user"},config:{time_zone:"UTC"},states:Object.fromEntries(Object.entries(entities).map(([k,id])=>[id,{state:String(values[k]??0),last_updated:new Date(now).toISOString(),attributes:{unit_of_measurement:k==="battery_soc"?"%":k.endsWith("_today")?"kWh":k.endsWith("_power")?"W":undefined}}])),callService:vi.fn(),callApi:vi.fn(async()=>[]),callWS:vi.fn(async()=>({roof:{wh_hours:Object.fromEntries([0,1,2].map(i=>[new Date(now+i*3600000).toISOString(),1000]))}})),connection:{subscribeMessage:vi.fn(async callback=>{callback({type:"hourly",forecast:[{datetime:new Date(now).toISOString(),temperature:28,condition:"sunny"}]});return vi.fn();})}};
 c.hassValue.states["weather.home"]={attributes:{supported_features:2,temperature_unit:"°C",attribution:"Test weather"}};c.updateModel();return c;
}
beforeEach(()=>{vi.useFakeTimers();vi.setSystemTime(now);vi.stubGlobal("matchMedia",()=>({matches:true,addEventListener(){},removeEventListener(){}}));localStorage.clear();});
afterEach(()=>{document.body.replaceChildren();vi.useRealTimers();vi.unstubAllGlobals();});
describe("Phase 3 user journeys",()=>{
 it("reads no forecast until opened, preserves both estimates and restores keyboard focus",async()=>{
  const c=fixture();document.body.append(c);expect(c.hassValue.callWS).not.toHaveBeenCalled();
  const root=c.shadowRoot;root.querySelector('[data-solar-outlook-toggle]').click();await vi.waitFor(()=>expect(root.querySelector('[data-forecast-energy]').textContent).toContain("2.0 kWh"));
  expect(c.hassValue.callWS).toHaveBeenCalledWith({type:"energy/solar_forecast"});expect(c.hassValue.callService).not.toHaveBeenCalled();
  expect(root.querySelector('[data-forecast-energy]').textContent).toContain("2.0 kWh");expect(root.querySelector('[data-weather-hours]').textContent).toContain("28 °C");
  expect(root.querySelector('[data-meta="battery-target"]')).not.toBeNull();expect(root.querySelector('[data-meta="battery-full"]')).not.toBeNull();
  root.querySelector('.solar-outlook').dispatchEvent(new KeyboardEvent("keydown",{key:"Escape",bubbles:true}));expect(root.activeElement).toBe(root.querySelector('[data-solar-outlook-toggle]'));expect(c.phase3.detail.hidden).toBe(true);
 });
 it("uses explicit source selection and labels missing data instead of forecasting from weather",async()=>{
  const c=fixture({solar_forecast_sources:[]});document.body.append(c);c.phase3.detail.hidden=false;await c.phase3.refresh();await Promise.resolve();
  expect(c.phase3.detail.textContent).toContain("Select the matching array");const checkbox=c.phase3.detail.querySelector('[data-forecast-sources] input');checkbox.focus();checkbox.checked=true;checkbox.dispatchEvent(new Event("change"));expect(c.shadowRoot.activeElement).toBe(checkbox);
  expect(c.phase3.forecast.selected).toEqual(["roof"]);expect(c.hassValue.callWS).toHaveBeenCalledTimes(1);
  c.phase3.detail.querySelector('[data-outlook-day="tomorrow"]').click();expect(c.phase3.detail.querySelector('[data-solar-now]').getAttribute("visibility")).toBe("hidden");
  expect(c.phase3.detail.querySelector('[data-forecast-energy]').textContent).toContain("unavailable");
 });
 it("keeps unknown fields safe as text, reports failures, and supports retry",async()=>{
  const c=fixture();c.hassValue.callWS=vi.fn(async()=>{throw Error("offline");});document.body.append(c);c.phase3.detail.hidden=false;await c.phase3.refresh();await Promise.resolve();
  expect(c.phase3.detail.textContent).toContain("Solar forecast unavailable");c.phase3.detail.querySelector('[data-outlook-refresh]').click();await Promise.resolve();expect(c.hassValue.callWS).toHaveBeenCalledTimes(2);
  c.phase3.forecast.status="ready";c.phase3.forecast.weatherStatus="ready";c.phase3.forecast.weather=[{datetime:new Date(now).toISOString(),condition:'<img src=x onerror=alert(1)>'}];c.phase3.renderSolar();expect(c.phase3.detail.querySelector('img')).toBeNull();
 });
 it("retains no browser data by default, saves only on consent and clears without altering estimates",()=>{
  const c=fixture();document.body.append(c);c.updateModel();expect(localStorage.length).toBe(0);
  const checkbox=c.phase3.accuracyElement.querySelector('[data-accuracy-remember]');checkbox.checked=true;checkbox.dispatchEvent(new Event("change"));expect(localStorage.length).toBe(1);
  c.phase3.accuracyElement.querySelector('[data-accuracy-clear]').click();expect(localStorage.length).toBe(0);expect(c.phase3.accuracy.events).toEqual([]);
  checkbox.checked=false;checkbox.dispatchEvent(new Event("change"));expect(localStorage.length).toBe(0);
 });
 it("isolates users, handles unavailable storage and censors hidden collection",()=>{
  const c=fixture();document.body.append(c);c.updateModel();const first=c.phase3.storageKey;c.hassValue.user.id="other-user";c.updateModel();expect(c.phase3.storageKey).not.toBe(first);
  const storage=vi.spyOn(localStorage,"setItem").mockImplementation(()=>{throw Error("denied");});c.phase3.remember=true;c.phase3.persist();expect(c.phase3.remember).toBe(false);expect(c.phase3.storageMessage).toContain("unavailable");storage.mockRestore();
  c.visible=false;c.updateModel();expect(c.phase3.accuracy.pending.size).toBe(0);c.phase3.disconnect();expect(c.phase3.active).toBe(false);
 });
 it("rewrites expired browser evidence on restore rather than retaining stale raw records",()=>{
  const c=fixture();document.body.append(c);c.updateModel();const key=c.phase3.storageKey;
  localStorage.setItem(key,JSON.stringify([{kind:"charge",target:95,error:1,cohort:"old",model:"net-taper-v1",predictedAt:0,observedAt:now-100*86400000,uncertaintyMs:1000}]));
  c.phase3.storageKey="";c.updateModel();expect(JSON.parse(localStorage.getItem(key))).toEqual([]);
 });
 it("normalizes controls and emits normal HA configuration events without equipment actions",()=>{
  const normalized=normalizeConfig({solar_forecast_sources:"roof, roof, bad!",weather_entity:"sensor.not_weather"});expect(normalized.solar_forecast_sources).toEqual(["roof"]);expect(normalized.weather_entity).toBe("");
  const editor=new PowerFloEditor();editor.setConfig(fixture().config);const events=[];editor.addEventListener("config-changed",e=>events.push(e.detail.config));
  const control=editor.shadowRoot.querySelector('[data-path="solar_outlook_enabled"]');control.value="false";control.dispatchEvent(new Event("change",{bubbles:true}));expect(events[0].solar_outlook_enabled).toBe(false);
  const c=fixture({solar_outlook_enabled:false,estimate_accuracy_enabled:false});expect(c.phase3.link.hidden).toBe(true);expect(c.phase3.accuracyElement.hidden).toBe(true);
 });
 it("draws interval steps without bridging gaps",()=>{
  const rows=[{start:0,end:1,watts:100},{start:2,end:3,watts:100}];const path=forecastStepPath(rows,0,4,100);expect((path.match(/M/g)??[])).toHaveLength(2);expect(path).not.toContain("NaN");
 });
 it("aligns actual/forecast timestamps and means on one scale",()=>{
  const line=forecastStepPath([{start:6,end:9,watts:50}],0,24,100),actual=chartPaths([{time:6,value:50},{time:9,value:50}],{start:new Date(0),end:new Date(24)},[{value:0},{value:100}]).line;
  expect(line).toMatch(/^M25\.000 18\.000H37\.500/);expect(actual).toMatch(/^M25\.00 18\.00 L37\.50 18\.00/);
 });
 it("preserves explicit unavailable and large gaps in measured solar",()=>{
  const rows=[0,1000,2000,3000,4000,2000000].map((t,i)=>({entity_id:"sensor.pv",state:i===2?"unavailable":"100",last_changed:new Date(now+t).toISOString()}));
  const points=solarHistoryPoints([rows],"sensor.pv","W",now,now+3000000);expect(points.map(x=>x.breakBefore)).toEqual([true,false,true,false,true]);
 });
 it("bounds hung Recorder reads and does not accept late detached responses",async()=>{
  const c=fixture();document.body.append(c);c.phase3.detail.hidden=false;c.hassValue.callApi=vi.fn(()=>new Promise(()=>{}));
  const request=c.phase3.loadActual(true);await vi.advanceTimersByTimeAsync(15001);await request;expect(c.phase3.actualState).toBe("error");
  let finish;c.hassValue.callApi=vi.fn(()=>new Promise(resolve=>{finish=resolve;}));const pending=c.phase3.loadActual(true);c.phase3.disconnect();finish([]);await pending;expect(c.phase3.actualState).toBe("idle");
 });
 it("routes lower flow lines outside the inverter caption",()=>{
  const p=connectorPath({left:0,top:0,width:1000,height:600},{left:430,right:570,top:150,bottom:350,width:140,height:200,caption:{left:400,right:600,top:370,bottom:420}},{right:330,left:0,top:350,height:220},"battery");
  expect(p).toContain("Q392");expect(p).toContain("V329");expect(p).toMatch(/H422$/);
 });
});
