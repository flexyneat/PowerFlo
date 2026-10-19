/** @fileoverview Test-first conservative comparison and export/standby evidence contracts. */
import {describe,it,expect} from "vitest";
import {comparisonRanges,comparisonResult,dailyComparisonSeries,alignReference} from "../src/comparison.js";
import {ExportSession,standbyObservation} from "../src/grid-insights.js";
import {normalizeConfig} from "../src/config.js";

describe("equivalent local comparison windows",()=>{
 it("compares today with yesterday at the same HA local clock",()=>{
  const r=comparisonRanges("today",new Date("2026-10-19T10:30:00Z"),"Africa/Lagos");
  expect(r.reference.start.toISOString()).toBe("2026-10-17T23:00:00.000Z");
  expect(r.reference.end.toISOString()).toBe("2026-10-18T10:30:00.000Z");
  expect(r.current.end.toISOString()).toBe("2026-10-19T10:30:00.000Z");
  expect(alignReference([{time:r.reference.end.getTime(),value:3}],r)[0].time).toBe(r.current.end.getTime());
 });
 it("keeps rolling week semantics and completed-hour statistics",()=>{
  const r=comparisonRanges("week",new Date("2026-10-19T10:30:00Z"),"UTC");
  expect(r.current.start.toISOString()).toBe("2026-10-13T00:00:00.000Z");
  expect(r.reference.start.toISOString()).toBe("2026-10-06T00:00:00.000Z");
  expect(r.reference.end.toISOString()).toBe("2026-10-12T10:00:00.000Z");
 });
 it("clips long months to the common calendar date and refuses DST-distorted comparisons",()=>{
  const r=comparisonRanges("month",new Date("2026-03-31T10:30:00Z"),"UTC");
  expect(r.current.end.toISOString()).toBe("2026-03-28T10:00:00.000Z");
  expect(r.reference.end.toISOString()).toBe("2026-02-28T10:00:00.000Z");
  expect(r.note).toContain("common");
  expect(comparisonRanges("today",new Date("2026-03-08T16:00:00Z"),"America/New_York").status).toBe("unavailable");
 });
 it("does not turn missing, partial, invalid or zero baselines into misleading percentages",()=>{
  expect(comparisonResult({total:12.4,partial:false},{total:10.8,partial:false}).delta).toBeCloseTo(1.6);
  expect(comparisonResult({total:0,partial:false},{total:0,partial:false}).percent).toBeNull();
  for(const x of [null,{total:null},{total:5,partial:true}])expect(comparisonResult(x,{total:1,partial:false}).status).not.toBe("ready");
 });
 it("converts Wh, breaks unexpected resets/gaps and never invents midnight samples",()=>{
  const range={start:new Date(0),end:new Date(3600000)};
  const samples=[{time:0,value:0},{time:1800000,value:1000},{time:3600000,value:1500}];
  expect(dailyComparisonSeries(samples,range,"Wh").total).toBe(1.5);
  const reset=dailyComparisonSeries([{time:0,value:2},{time:1800000,value:1}],range,"kWh");
  expect(reset.partial).toBe(true);expect(reset.points[1].breakBefore).toBe(true);
  expect(dailyComparisonSeries(samples,range,"W").total).toBeNull();
  expect(dailyComparisonSeries([{time:3000000,value:5}],range,"kWh").partial).toBe(true);
 });
});

describe("session export evidence",()=>{
 it("qualifies continuous export only after duration, with no duplicate timestamp accumulation",()=>{
  const s=new ExportSession(),config=normalizeConfig({grid_power_verified:true,export_threshold_w:50,export_duration_seconds:60});
  const push=(time,watts=-100,connected=true,fresh=true)=>s.observe({time,now:time,watts,connected,fresh},config);
  expect(push(0).events).toBe(0);push(30000);expect(push(60000).events).toBe(1);
  expect(push(60000).coverageMs).toBe(60000);expect(push(90000).events).toBe(1);
  expect(push(90000).exportKwh).toBeCloseTo(.0025);
 });
 it("requires verified polarity and interrupts on stale/disconnected/chatter/gaps",()=>{
  const s=new ExportSession(),c=normalizeConfig({export_duration_seconds:60});
  expect(s.observe({time:0,now:0,watts:-100,connected:true,fresh:true},c).status).toBe("unverified");
  c.grid_power_verified=true;
  for(const x of [{time:0},{time:30000},{time:60000,connected:false},{time:90000},{time:120000,watts:0},{time:150000},{time:250000}])s.observe({now:x.time,watts:-100,connected:true,fresh:true,...x},c);
  expect(s.snapshot.events).toBe(0);expect(s.snapshot.coverageMs).toBe(90000);
  expect(s.observe({time:260000,now:360000,watts:-100,connected:true,fresh:true},c).status).toBe("unavailable");
 });
 it("supports opposite configured polarity and resets duration on timestamp rollback",()=>{
  const s=new ExportSession(),c=normalizeConfig({grid_power_verified:true,grid_positive:"export",export_duration_seconds:30});
  s.observe({time:30000,now:30000,watts:100,connected:true,fresh:true},c);
  expect(s.observe({time:0,now:30000,watts:100,connected:true,fresh:true},c).status).toBe("collecting");
  expect(s.observe({time:60000,now:60000,watts:100,connected:true,fresh:true},c).events).toBe(0);
  expect(s.observe({time:90000,now:90000,watts:100,connected:true,fresh:true},c).events).toBe(1);
 });
});

describe("standby and backward-compatible options",()=>{
 it("never uses an AC/DC residual or counts manual overhead twice",()=>{
  const c=normalizeConfig();expect(c.preparedness_enabled).toBe(true);expect(c.grid_power_verified).toBe(false);
  expect(standbyObservation({},c,0).status).toBe("unassessed");
  expect(standbyObservation({},normalizeConfig({standby_assumed_w:45}),0)).toMatchObject({status:"assumed",watts:45,dailyKwh:1.08});
  expect(normalizeConfig({standby_assumed_w:"oops"}).standby_assumed_w).toBeNull();
 });
 it("requires explicitly verified inverter-only idle measurement and fresh canonical units",()=>{
  const c=normalizeConfig({standby_measurement_verified:true,entities:{inverter_standby_power:"sensor.idle"}});
  const states={"sensor.idle":{state:"0.05",last_updated:new Date(0).toISOString(),attributes:{unit_of_measurement:"kW"}}};
  expect(standbyObservation(states,c,0)).toMatchObject({status:"measured",watts:50,dailyKwh:1.2});
  expect(standbyObservation(states,c,61000).status).toBe("unassessed");
  expect(standbyObservation(states,normalizeConfig({entities:c.entities}),0).status).toBe("unassessed");
 });
});
