/** @fileoverview Opt-in bounded comparison reads, guarded against detached/config/period responses. */
import {comparisonRanges,dailyComparisonSeries,comparisonResult,alignReference,loadComparisonHistory} from "./comparison.js";
import {loadEnergyStatistics} from "./statistics.js";
const NAMES=Object.freeze(["solar","grid","load","battery"]);
/** Owns only previous-period presentation; never writes card configuration or equipment. */
export class ComparisonController{
 /** @param {Function} changed Re-render callback after request state changes. */
 constructor(changed){this.changed=changed;this.enabled=false;this.revision=0;this.cache=new Map();this.reset();}
 /** Invalidates all contexts while retaining the user's local comparison toggle. */
 reset(){this.revision++;this.key="";this.status="idle";this.results=new Map();this.range=null;this.lastRetry=null;this.cache.clear();}
 /** Cancels late reads without discarding cached data or starting another read. */
 disconnect(){this.revision++;this.key="";this.status="idle";}
 /** @param {Object} hass Authenticated context. @param {Object} config Safe config. @param {string} period Selected period. @param {boolean} force Explicit retry. @returns {Promise<void>} Bounded two-window reads only when opted in. */
 async refresh(hass,config,period,force=false){
  if(!this.enabled||!hass||document.hidden)return;
  if(force){if(this.lastRetry!==null&&Date.now()-this.lastRetry<60000)return;this.lastRetry=Date.now();}
  const zone=hass.config?.time_zone,ids=NAMES.map(n=>period==="today"?config.entities[`${n}_today`]:config.statistics[n]||config.entities[`${n}_today`]);
  const key=`${zone}|${period}|${ids.join("|")}|${ids.map(id=>hass.states?.[id]?.attributes?.unit_of_measurement??"").join("|")}|${Math.floor(Date.now()/600000)}`;
  if(this.key===key&&!force)return;
  this.key=key;const revision=++this.revision;this.results=new Map();
  const range=comparisonRanges(period,new Date(),zone);this.range=range;
  if(range.status!=="ready"){this.status="unavailable";this.changed();return;}
  if(!force&&this.cache.has(key)){Object.assign(this,this.cache.get(key));this.changed();return;}
  this.status="loading";this.changed();
  try{
   const loader=period==="today"?loadComparisonHistory:loadEnergyStatistics;
   const [current,reference]=await Promise.all([loader(hass,ids,range.current),loader(hass,ids,range.reference)]);
   if(revision!==this.revision||!this.enabled)return;
   this.results=new Map(NAMES.map((name,i)=>{
    const id=ids[i],unit=hass.states?.[id]?.attributes?.unit_of_measurement;
    const c=period==="today"?dailyComparisonSeries(current.get(id)??[],range.current,unit):current.get(id);
    const r=period==="today"?dailyComparisonSeries(reference.get(id)??[],range.reference,unit):reference.get(id);
    // Numeric deltas need the same completed coverage end, not just superficially similar totals.
    const endsMatch=period==="today"?c?.points?.length&&r?.points?.length&&Math.abs(c.points.at(-1).time-r.points.at(-1).time-range.offset)<=60000:c?.end&&r?.end&&c.end-r.end===range.offset;
    const result=endsMatch?comparisonResult(c,r):{status:"partial",delta:null,percent:null};
    return [name,{...result,current:c,reference:r,points:alignReference(r?.points??[],range)}];
   }));
   this.status="ready";this.cache.set(key,{results:this.results,range,status:"ready"});
   while(this.cache.size>3)this.cache.delete(this.cache.keys().next().value);
  }catch{if(revision!==this.revision)return;this.status="error";}
  this.changed();
 }
}
