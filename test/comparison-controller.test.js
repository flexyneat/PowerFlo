/** @fileoverview Authenticated read boundaries, cancellation, cache, gaps and equivalent-window totals. */
import {beforeEach,afterEach,it,expect,vi} from "vitest";
import {ComparisonController} from "../src/comparison-controller.js";
import {loadComparisonHistory,dailyComparisonSeries,comparisonRanges} from "../src/comparison.js";
import {normalizeConfig} from "../src/config.js";
/** @returns {Object} Explicit energy mappings and synthetic Recorder/WS. */
function fixture(){
 const entities=Object.fromEntries(["solar","grid","load","battery"].map(n=>[`${n}_today`,`sensor.${n}`]));
 const config=normalizeConfig({entities}),hass={config:{time_zone:"UTC"},states:Object.fromEntries(Object.values(entities).map(id=>[id,{attributes:{unit_of_measurement:"kWh"}}]))};
 hass.callApi=vi.fn(async(method,path)=>{const u=new URL(path,"https://fixture.invalid"),start=Date.parse(decodeURIComponent(u.pathname.split('/').at(-1))),end=Date.parse(u.searchParams.get("end_time")),current=new Date(end).getUTCDate()===19;return Object.values(entities).map(id=>Array.from({length:13},(_,i)=>({entity_id:id,state:String((current?12.4:10.8)*i/12),last_updated:new Date(start+(end-start)*i/12).toISOString()})));});
 hass.callWS=vi.fn(async m=>m.type==="recorder/get_statistics_metadata"?m.statistic_ids.map(id=>({statistic_id:id,has_sum:true,unit_class:"energy"})):Object.fromEntries(m.statistic_ids.map(id=>{const rows=[];for(let t=Date.parse(m.start_time);t+3600000<=Date.parse(m.end_time);t+=3600000)rows.push({start:t,end:t+3600000,change:1});return [id,rows];})));
 return {config,hass};
}
beforeEach(()=>{vi.useFakeTimers();vi.setSystemTime(new Date("2026-10-19T11:00:00Z"));});
afterEach(()=>vi.useRealTimers());
it("loads/caches equivalent bounded daily windows, invalidates contexts and deduplicates refreshes",async()=>{
 const {config,hass}=fixture(),c=new ComparisonController(vi.fn());c.enabled=true;await c.refresh(hass,config,"today");
 expect(c.status).toBe("ready");expect(c.results.get("solar").delta).toBeCloseTo(1.6);
 await c.refresh(hass,config,"today");expect(hass.callApi).toHaveBeenCalledTimes(2);
 c.disconnect();await c.refresh(hass,config,"today");expect(hass.callApi).toHaveBeenCalledTimes(2);
 await c.refresh(hass,config,"week");expect(c.results.get("grid").status).toBe("ready");expect(hass.callWS).toHaveBeenCalledTimes(4);
 await c.refresh({...hass,config:{time_zone:"Africa/Lagos"}},config,"today");expect(hass.callApi).toHaveBeenCalledTimes(4);
 c.reset();expect(c.results.size).toBe(0);expect(c.cache.size).toBe(0);
});
it("discards late periods/configs and disabled results",async()=>{
 const {config,hass}=fixture(),c=new ComparisonController(vi.fn());c.enabled=true;const resolves=[];
 hass.callApi=vi.fn(()=>new Promise(r=>{resolves.push(r);}));const pending=c.refresh(hass,config,"today");
 c.reset();for(const resolve of resolves)resolve([]);await pending;
 expect(c.results.size).toBe(0);expect(c.status).toBe("idle");
 c.enabled=false;await c.refresh(hass,config,"week");expect(hass.callWS).not.toHaveBeenCalled();
});
it("retries explicit errors no more than once per minute and never falls back to unfiltered reads",async()=>{
 const {config,hass}=fixture(),c=new ComparisonController(vi.fn());c.enabled=true;hass.callApi=vi.fn(async()=>{throw Error("denied");});
 await c.refresh(hass,config,"today");expect(c.status).toBe("error");
 await c.refresh(hass,config,"today",true);await c.refresh(hass,config,"today",true);expect(hass.callApi).toHaveBeenCalledTimes(4);
 vi.advanceTimersByTime(60000);await c.refresh(hass,config,"today",true);expect(hass.callApi).toHaveBeenCalledTimes(6);
 const empty=normalizeConfig();expect(await loadComparisonHistory(hass,[],comparisonRanges("today",new Date(),"UTC").current)).toEqual(new Map());
 await c.refresh(hass,empty,"today");expect(c.results.get("solar").status).not.toBe("ready");
});
it("ignores unsolicited IDs, preserves unavailable gaps, rejects resets, and withholds mismatched endpoints",async()=>{
 const {config,hass}=fixture(),r=comparisonRanges("today",new Date(),"UTC");
 hass.callApi=vi.fn(async()=>[[{entity_id:"sensor.unrequested",state:"5",last_updated:r.current.end.toISOString()}],null,[{entity_id:"sensor.solar",state:"0",last_updated:r.current.start.toISOString()},null,{state:"unavailable",last_updated:new Date(+r.current.start+1000).toISOString()},{state:"2",last_updated:r.current.end.toISOString()},{entity_id:"sensor.evil",state:"999",last_updated:r.current.end.toISOString()}]]);
 const m=await loadComparisonHistory(hass,["sensor.solar",""],r.current);expect(m.size).toBe(1);expect(m.get("sensor.solar")).toHaveLength(3);
 const s=dailyComparisonSeries(m.get("sensor.solar"),r.current,"kWh");expect(s.partial).toBe(true);expect(s.points[1].breakBefore).toBe(true);
 const c=new ComparisonController(vi.fn());c.enabled=true;await c.refresh(hass,config,"today");expect(c.results.get("solar").delta).toBeNull();
});
it("does not request invalid-zone or incompatible DST windows",async()=>{
 const {config,hass}=fixture(),c=new ComparisonController(vi.fn());c.enabled=true;
 await c.refresh({...hass,config:{}},config,"today");expect(c.status).toBe("unavailable");expect(hass.callApi).not.toHaveBeenCalled();
 vi.setSystemTime(new Date("2026-03-08T16:00:00Z"));await c.refresh({...hass,config:{time_zone:"America/New_York"}},config,"today");expect(c.status).toBe("unavailable");
});
