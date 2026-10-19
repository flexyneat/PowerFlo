/** @fileoverview Forecast interval normalization and read-only lifecycle acceptance tests. */
import {describe,it,expect,vi} from "vitest";
import {normalizeIntervals,energyForecastIntervals,forecastWindow,ForecastController} from "../src/solar-outlook.js";
const hour=3600000,now=Date.parse("2026-10-19T11:00:00Z");
describe("solar forecast boundaries",()=>{
 it("normalizes explicit energy and power units using real interval durations",()=>{
  const rows=[{start:now,end:now+hour/2,value:500,unit:"Wh"},{start:now+hour/2,end:now+hour,value:2,unit:"kW"}];
  expect(normalizeIntervals(rows,"roof",now).map(x=>[x.kwh,x.watts])).toEqual([[.5,1000],[1,2000]]);
  expect(normalizeIntervals([{...rows[0],unit:"bananas"},{...rows[0],value:null}],"roof",now)).toEqual([]);
 });
 it("uses start-keyed wh_hours without inventing missing or final intervals",()=>{
  const map=Object.fromEntries([0,1,3,4].map((i)=>[new Date(now+i*hour).toISOString(),1000]));
  const rows=energyForecastIntervals({roof:{wh_hours:map},other:{wh_hours:map}},["roof"],now);
  expect(rows).toHaveLength(2);expect(rows.every(x=>x.source==="roof")).toBe(true);
  expect(energyForecastIntervals({roof:{wh_hours:map}},[],now)).toEqual([]);
 });
 it("clips the current interval proportionally, preserves gaps and handles offset/DST timestamps",()=>{
  const rows=normalizeIntervals([{start:"2026-10-25T02:00:00+02:00",end:"2026-10-25T02:00:00+01:00",value:1000,unit:"Wh"}],"roof",Date.parse("2026-10-25T00:00:00Z"));
  expect(rows[0].watts).toBe(1000);
  const result=forecastWindow(rows,rows[0].start+hour/2,rows[0].end);
  expect(result.kwh).toBe(.5);expect(result.partialInterval).toBe(true);
  expect(forecastWindow([],now,now+hour).kwh).toBeNull();
 });
 it("reads all HA Energy forecasts but selects only explicit sources and unsubscribes late weather subscriptions",async()=>{
  let finish;const unsub=vi.fn();const hass={states:{"weather.home":{attributes:{supported_features:2}}},callWS:vi.fn(async()=>({roof:{wh_hours:{}}})),connection:{subscribeMessage:vi.fn(()=>new Promise(resolve=>{finish=resolve;}))}};
  const c=new ForecastController(vi.fn());const pending=c.start(hass,{solar_forecast_sources:["roof"],weather_entity:"weather.home"});
  await Promise.resolve();expect(hass.callWS).toHaveBeenCalledWith({type:"energy/solar_forecast"});
  expect(hass.connection.subscribeMessage.mock.calls[0][1]).toEqual({type:"weather/subscribe_forecast",forecast_type:"hourly",entity_id:"weather.home"});
  c.disconnect();finish(unsub);await pending;expect(unsub).toHaveBeenCalledOnce();
 });
 it("keeps errors explicit and does not create hourly weather from unsupported entities",async()=>{
  const hass={callWS:vi.fn(async()=>{throw Error("offline");}),states:{"weather.home":{attributes:{supported_features:1}}},connection:{subscribeMessage:vi.fn()}};
  const c=new ForecastController(vi.fn());await c.start(hass,{weather_entity:"weather.home",solar_forecast_sources:[]});
  expect(c.status).toBe("error");expect(c.weatherStatus).toBe("unsupported");expect(hass.connection.subscribeMessage).not.toHaveBeenCalled();
 });
 it("preserves session source selection across close/reopen without repeated Energy reads",async()=>{
  const hass={callWS:vi.fn(async()=>({roof:{wh_hours:{}},garage:{wh_hours:{}}})),states:{},connection:{}};
  const c=new ForecastController(vi.fn()),config={solar_forecast_sources:[],weather_entity:""};await c.start(hass,config);c.select(["roof"]);c.disconnect();await c.start(hass,config);
  expect(c.selected).toEqual(["roof"]);expect(hass.callWS).toHaveBeenCalledTimes(1);
 });
});
