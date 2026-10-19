/** @fileoverview Frozen prediction, censored-session and bounded local evidence tests. */
import {describe,it,expect} from "vitest";
import {EstimateAccuracy,accuracySummary,accuracyNamespace} from "../src/estimate-accuracy.js";
const now=Date.parse("2026-10-19T11:00:00Z");
/** @param {Object} overrides Values. @returns {Object} Qualified fresh reading. */
function sample(overrides={}){return {time:now,now,soc:90,mode:"charging",fresh:true,cohort:"system-a",regime:"on-grid:solar",capacity:16,reserve:20,targets:[{target:95,hours:1/60}],runtimeHours:null,rateWatts:2000,maxGap:60000,...overrides};}
describe("estimate feedback",()=>{
 it("scores qualified terminal full/reserve crossings even when the BMS stops on that report",()=>{
  const c=new EstimateAccuracy();c.observe(sample({soc:99,targets:[{target:100,hours:1/60}]}));c.observe(sample({soc:100,mode:"static",time:now+60000,now:now+60000,rateWatts:0}));expect(accuracySummary(c.events,"charge",100).count).toBe(1);expect(c.pending.size).toBe(0);
  c.pause();c.observe(sample({soc:21,mode:"discharging",runtimeHours:1/60,targets:[]}));c.observe(sample({soc:20,mode:"static",time:now+60000,now:now+60000,rateWatts:0}));expect(accuracySummary(c.events,"reserve",20).count).toBe(1);
 });
 it("starts collecting, freezes predictions and scores a first target crossing with interval uncertainty",()=>{
  const c=new EstimateAccuracy();expect(accuracySummary(c.events,"charge",95).status).toBe("collecting");
  c.observe(sample());c.observe(sample({time:now+30000,now:now+30000,soc:94,targets:[{target:95,hours:8}]}));
  c.observe(sample({time:now+60000,now:now+60000,soc:95}));
  const s=accuracySummary(c.events,"charge",95);expect(s.count).toBe(1);expect(s.bias).toBe(0);expect(s.mae).toBe(0);expect(c.events[0].uncertaintyMs).toBe(30000);
  c.observe(sample({time:now+90000,now:now+90000,soc:96}));expect(c.events).toHaveLength(1);
 });
 it("censors config, regime, direction and stale gaps instead of scoring them zero",()=>{
  for(const update of [{cohort:"changed"},{regime:"off-grid"},{mode:"discharging"},{fresh:false},{time:now+120000,now:now+120000}]){
   const c=new EstimateAccuracy();c.observe(sample());c.observe(sample({...update,soc:95}));expect(c.events).toHaveLength(0);expect(c.lastExclusion).toBeTruthy();
  }
 });
 it("keeps 30-minute SOC feedback separate from reserve-arrival timing",()=>{
  const c=new EstimateAccuracy();
  for(let i=0;i<=30;i++)c.observe(sample({time:now+i*60000,now:now+i*60000,soc:80-i*.1,mode:"discharging",targets:[],rateWatts:960,runtimeHours:10}));
  const s=accuracySummary(c.events,"soc",30);expect(s.count).toBe(1);expect(s.mae).toBeCloseTo(0);expect(accuracySummary(c.events,"reserve",20).count).toBe(0);
 });
 it("bounds retention, rejects invalid persisted values and namespaces by HA user and card",()=>{
  const c=new EstimateAccuracy();c.restore('[{"kind":"charge","error":0}]',now);expect(c.events).toEqual([]);
  expect(accuracyNamespace("user-a","card-a")).not.toBe(accuracyNamespace("user-b","card-a"));
  c.observe(sample());c.clear();expect(c.pending.size).toBe(0);expect(c.events).toEqual([]);
 });
});
