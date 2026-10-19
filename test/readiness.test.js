/** @fileoverview Readiness energy, local calendar, historical coverage and read-only request contracts. */
import {describe,it,expect,vi} from "vitest";
import {nextDeadline,readinessEstimate,buildLoadProfile,profileDemand,loadReadinessHistory} from "../src/readiness.js";
describe("overnight readiness",()=>{
  const input={soc:95,capacity:16,reserve:20,efficiency:.9,watts:1200,hours:8,fresh:true};
  it("models one battery and the extra-average-load scenario without double counting losses",()=>{
    const baseline=readinessEstimate(input);
    expect(baseline.status).toBe("ready");expect(baseline.morningSoc).toBeCloseTo(28.333);
    expect(baseline.availableKwh).toBeCloseTo(10.8);expect(baseline.runtimeHours).toBeCloseTo(9);
    expect(readinessEstimate({...input,watts:1300}).morningSoc).toBeCloseTo(22.778);
    expect(readinessEstimate({...input,capacity:32,watts:1300}).morningSoc).toBeCloseTo(58.889);
    expect(input.capacity).toBe(16);
  });
  it("retains a shortfall even when physical SOC display clamps at zero",()=>{
    expect(readinessEstimate({...input,watts:3000})).toMatchObject({status:"at-risk",morningSoc:0});
    expect(readinessEstimate({...input,watts:3000}).shortfallKwh).toBeCloseTo(13.2);
    expect(readinessEstimate({...input,soc:10,watts:0})).toMatchObject({status:"at-risk",runtimeHours:0});
    expect(readinessEstimate({...input,watts:0})).toMatchObject({status:"ready",morningSoc:95,runtimeHours:null});
    expect(readinessEstimate({...input,hours:9}).status).toBe("ready");
  });
  it.each([{soc:null},{capacity:0},{watts:NaN},{watts:-1},{hours:0},{reserve:101},{efficiency:0},{soc:101},{capacity:Infinity}])("fails closed for invalid energy inputs %j",change=>{
    expect(readinessEstimate({...input,...change}).status).toBe("unavailable");
  });
  it("never presents stale data as readiness",()=>expect(readinessEstimate({...input,fresh:false}).status).toBe("stale"));
});
describe("HA local deadline",()=>{
  it("uses the HA zone and rolls forward when today's deadline passed",()=>{
    expect(nextDeadline(Date.parse("2026-10-19T21:00:00Z"),"06:00","Africa/Lagos")).toBe(Date.parse("2026-10-20T05:00:00Z"));
    expect(nextDeadline(Date.parse("2026-10-20T05:00:00Z"),"06:00","Africa/Lagos")).toBe(Date.parse("2026-10-21T05:00:00Z"));
  });
  it("uses real elapsed hours through spring and autumn DST",()=>{
    const spring=Date.parse("2026-03-08T03:00:00Z"),fall=Date.parse("2026-11-01T02:00:00Z");
    expect((nextDeadline(spring,"06:00","America/New_York")-spring)/3600000).toBe(7);
    expect((nextDeadline(fall,"06:00","America/New_York")-fall)/3600000).toBe(9);
    expect(nextDeadline(spring,"02:30","America/New_York")).toBe(Date.parse("2026-03-08T07:00:00Z"));
  });
  it("refuses malformed clocks and unknown zones",()=>{
    expect(nextDeadline(Date.now(),"99:00","UTC")).toBeNull();
    expect(nextDeadline(Date.now(),"06:00","Mars/Unknown")).toBeNull();
  });
});
describe("representative historical demand",()=>{
  it("matches time of day and rejects insufficient coverage rather than inventing zero",()=>{
    const now=Date.parse("2026-10-19T22:00:00Z"),samples=[];
    for(let t=now-3*86400000;t<=now;t+=60000)samples.push({time:t,value:new Date(t).getUTCHours()<6?800:1200});
    const profile=buildLoadProfile(samples,now,"UTC");
    expect(profileDemand(profile,now,now+8*3600000,.8).watts).toBeCloseTo(900);
    expect(profileDemand(buildLoadProfile([],now,"UTC"),now,now+8*3600000,.8)).toBeNull();
    expect(profileDemand(profile,now,now+8*3600000,NaN)).toBeNull();
  });
  it("preserves explicit gaps and caps an isolated sample hold",()=>{
    const now=Date.now();const p=buildLoadProfile([{time:now-3*86400000,value:900},{time:now-2*86400000,value:null}],now,"UTC");
    expect(profileDemand(p,now,now+3600000,.8)).toBeNull();
  });
  it("filters a bounded history read before making any API request",async()=>{
    const hass={callApi:vi.fn(async()=>[])};
    await expect(loadReadinessHistory(hass,"",Date.now(),"W")).rejects.toThrow();expect(hass.callApi).not.toHaveBeenCalled();
    await loadReadinessHistory(hass,"sensor.load",Date.now(),"W");
    expect(hass.callApi).toHaveBeenCalledWith("get",expect.stringContaining("filter_entity_id=sensor.load"));
    await expect(loadReadinessHistory(hass,"sensor.load",Date.now(),"A")).rejects.toThrow();
  });
  it("parses kW, excludes other entities and preserves unknown intervals",async()=>{
    const now=Date.now(),hass={callApi:vi.fn(async()=>[[{entity_id:"sensor.other",state:"300",last_changed:new Date(now).toISOString()}],[{entity_id:"sensor.load",state:"1.2",last_changed:new Date(now-60000).toISOString()},{state:"unavailable",last_changed:new Date(now).toISOString()},{state:"9",last_changed:"bad"}]])};
    const points=await loadReadinessHistory(hass,"sensor.load",now,"kW");expect(points.map(p=>p.value)).toEqual([1200,null]);
  });
});
