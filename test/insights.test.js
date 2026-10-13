/** @fileoverview Tests for read-only v0.4 insights, truthful gaps and guarded session learning. */
import { describe,it,expect } from "vitest";
import { estimateBand,loadRuntimes,supplyMix,grossEnergyMix,solarUtilization,TaperSession,OutageSession,inspectEntities } from "../src/insights.js";
import { normalizeConfig } from "../src/config.js";
describe("read-only insights",()=>{
  it("requires verified energy counter meanings and refuses missing or negative energy",()=>{
    expect(grossEnergyMix({solar:4,grid:1,battery:1},false)).toBeNull();
    expect(grossEnergyMix({solar:4,grid:1,battery:1},true).shares.solar).toBeCloseTo(2/3);
    expect(grossEnergyMix({solar:4,grid:null,battery:1},true)).toBeNull();
    expect(grossEnergyMix({solar:4,grid:-1,battery:1},true)).toBeNull();
  });
  it("uses variation scenarios rather than fake probabilistic confidence",()=>{
    expect(estimateBand({status:"ready",hours:2},.2)).toEqual({low:2/1.2,high:2/.8});
    expect(estimateBand({status:"target"},.2)).toBeNull();
    expect(estimateBand({status:"ready",hours:Infinity},.2)).toBeNull();
  });
  it("estimates reserve-limited AC load scenarios and refuses unknown/zero load",()=>{
    expect(loadRuntimes(80,20,10,.9,{current:1000,average:2000,peak:null})).toEqual({current:5.4,average:2.7,peak:null});
    expect(loadRuntimes(10,20,10,.9,{current:1000})).toEqual({current:0});
    expect(loadRuntimes(null,20,10,.9,{current:1000})).toEqual({current:null});
  });
  it("does not count charging/export as supply or stale snapshots as a source mix",()=>{
    const model={dataState:"fresh",connected:true,values:{solarPower:2000,gridPower:-300,batteryPower:-200,loadPower:1400}};
    const config=normalizeConfig();expect(supplyMix(model,config).shares).toEqual({solar:1,grid:0,battery:0});
    expect(supplyMix({...model,dataState:"stale"},config)).toBeNull();
    expect(solarUtilization(null,10)).toBeNull();expect(solarUtilization(2000,10)).toBe(20);
  });
  it("learns only after enough distinct stable-source low/high SOC observations",()=>{
    const learner=new TaperSession();
    for(let i=1;i<=3;i++)learner.observe({time:i*10000,soc:80+i,watts:2000,supply:5000,fresh:true});
    for(let i=4;i<=6;i++)learner.observe({time:i*10000,soc:96,watts:1100,supply:5000,fresh:true});
    expect(learner.floor(90)).toBeCloseTo(.25);
    learner.observe({time:70000,soc:96,watts:100,supply:1000,fresh:true});
    expect(learner.floor(90)).toBeCloseTo(.25);
    learner.observe({time:80000,soc:96,watts:800,supply:5000,fresh:false});expect(learner.floor(90)).toBeNull();
    learner.observe({time:90000,soc:101,watts:2000,supply:5000,fresh:true});expect(learner.samples).toEqual([]);
  });
  it("records observed disconnects/restoration without spanning unknown gaps",()=>{
    const events=new OutageSession();events.observe(1,true);events.observe(100,false);events.observe(200,false);events.observe(300,true);
    expect(events.events).toEqual([{start:100,end:300,partial:false}]);
    events.observe(400,false);events.observe(500,null);events.observe(600,true);
    expect(events.events[1]).toEqual({start:400,end:500,partial:true});
  });
  it("reports missing mappings, unknown values and stale samples without turning them into zero",()=>{
    const config=normalizeConfig({entities:{battery_power:"sensor.b",battery_soc:"sensor.s"}});
    const result=inspectEntities({"sensor.b":{state:"unavailable"},"sensor.s":{state:"85",last_updated:new Date(1).toISOString()}},config,100000);
    expect(result.some(x=>x.code==="missing")).toBe(true);expect(result.some(x=>x.code==="unknown")).toBe(true);expect(result.some(x=>x.code==="stale")).toBe(true);
    const flags=normalizeConfig({entities:{freshness:"flag",grid_connected:"grid"}});
    expect(inspectEntities({flag:{state:"on",last_updated:new Date(0).toISOString()},grid:{state:"off",last_updated:new Date(0).toISOString()}},flags,100000).some(x=>x.code==="stale")).toBe(false);
  });
});
