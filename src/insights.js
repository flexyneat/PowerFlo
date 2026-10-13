/** @fileoverview Bounded, read-only insight models; ranges and source attribution are scenarios, not guarantees. */

/** @param {Object} result Ready ETA. @param {number} variation Relative observed rate variation. @returns {Object|null} Inverse-rate scenario band, never a statistical confidence interval. */
export function estimateBand(result,variation=0) {
  if(result.status!=="ready"||!Number.isFinite(result.hours)||result.hours<0)return null;
  const spread=Math.min(.75,Math.max(.1,Number.isFinite(variation)?variation:.5));
  return {low:result.hours/(1+spread),high:result.hours/(1-spread)};
}

/** @param {number|null} soc Current SOC. @param {number} reserve Reserve SOC. @param {number} capacity kWh. @param {number} efficiency Assumed DC-to-AC efficiency. @param {Object} loads AC watts. @returns {Object} Conditional hours per load scenario; no load growth/solar assumed. */
export function loadRuntimes(soc,reserve,capacity,efficiency,loads) {
  const valid=[soc,reserve,capacity,efficiency].every(Number.isFinite)&&soc>=0&&soc<=100&&reserve>=0&&reserve<=100&&capacity>0&&efficiency>0&&efficiency<=1;
  const energy=valid?capacity*Math.max(0,soc-reserve)/100*efficiency:null;
  return Object.fromEntries(Object.entries(loads).map(([name,watts])=>[name,energy!==null&&Number.isFinite(watts)&&watts>0?energy*1000/watts:null]));
}

/** @param {number|null} watts Fresh PV output. @param {number} kwp Installed nameplate. @returns {number|null} Instantaneous nameplate utilization, not conversion efficiency. */
export function solarUtilization(watts,kwp){return Number.isFinite(watts)&&watts>=0&&Number.isFinite(kwp)&&kwp>0?watts/(kwp*10):null;}

/** @param {Object} counters Period kWh for production/import/discharge. @param {boolean} verified User-confirmed roles. @returns {Object|null} Gross proportions; storage cycling can double-count energy, not routed-load attribution. */
export function grossEnergyMix(counters,verified){
  const values={solar:counters.solar,grid:counters.grid,battery:counters.battery};
  if(verified!==true||!Object.values(values).every(x=>Number.isFinite(x)&&x>=0))return null;
  const total=Object.values(values).reduce((a,b)=>a+b,0);if(total<=0)return null;
  return {total,shares:Object.fromEntries(Object.entries(values).map(([k,x])=>[k,x/total]))};
}

/** @param {Object} model Fresh aggregate state. @param {Object} config Sign conventions. @returns {Object|null} Indicative supply proportions and AC/DC residual, not measured routed energy. */
export function supplyMix(model,config) {
  const v=model.values;
  if(model.dataState!=="fresh"||model.connected===null||![v.solarPower,v.batteryPower,v.gridPower,v.loadPower].every(Number.isFinite))return null;
  const battery=v.batteryPower*(config.battery_positive==="discharge"?1:-1);
  const grid=model.connected?v.gridPower*(config.grid_positive==="import"?1:-1):0;
  const sources={solar:Math.max(0,v.solarPower),grid:Math.max(0,grid),battery:Math.max(0,battery)};
  const total=Object.values(sources).reduce((a,b)=>a+b,0);
  if(total===0)return null;
  return {shares:Object.fromEntries(Object.entries(sources).map(([name,w])=>[name,w/total])),
    residual:total-Math.max(0,v.loadPower)-Math.max(0,-battery)-Math.max(0,-grid)};
}

/** Session-only observed taper fitting; does not persist personal telemetry or claim battery characterization. */
export class TaperSession {
  /** Initializes bounded observations. */
  constructor(){this.samples=[];}
  /** @param {Object} sample Timestamped net-charge/SOC/source reading. @returns {void} Ignores duplicates and unstable source supply; telemetry gaps end learning. */
  observe(sample){
    const last=this.samples.at(-1);
    if(!sample.fresh||![sample.time,sample.soc,sample.watts,sample.supply].every(Number.isFinite)||sample.soc<0||sample.soc>100||sample.watts<=0||sample.supply<=0){this.samples=[];return;}
    if(last&&(sample.time<last.time||sample.time-last.time>60000||sample.soc<last.soc-1))this.samples=[];
    const previous=this.samples.at(-1);
    if(previous&&(sample.time<=previous.time||Math.abs(sample.supply-previous.supply)/previous.supply>.1))return;
    // Stable generation alone is insufficient: a household load change can mimic battery taper.
    if(previous&&Number.isFinite(sample.load)&&Number.isFinite(previous.load)&&Math.abs(sample.load-previous.load)/Math.max(100,previous.load)>.1)return;
    this.samples.push({...sample});if(this.samples.length>1024)this.samples.shift();
  }
  /** @param {number} start Configured upper SOC band start. @returns {number|null} Fitted full-SOC rate ratio once three observations exist in each band. */
  floor(start){
    const low=this.samples.filter(x=>x.soc<start),high=this.samples.filter(x=>x.soc>=Math.max(95,start+1));
    if(low.length<3||high.length<3)return null;
    const baseline=low.reduce((a,x)=>a+x.watts,0)/low.length;
    const values=high.map(x=>1-(1-x.watts/baseline)*(100-start)/(x.soc-start));
    return Math.max(.05,Math.min(1,values.reduce((a,b)=>a+b,0)/values.length));
  }
}

/** Bounded observed outage intervals; unknown telemetry cannot fabricate a precise restoration. */
export class OutageSession {
  /** Initializes session event state. */
  constructor(){this.events=[];this.previous=null;this.lastTime=null;}
  /** @param {number} time Epoch milliseconds. @param {boolean|null} connected Fresh known connection, or unknown. @returns {void} Unknown closes coverage, not a confirmed restoration. */
  observe(time,connected){
    if(!Number.isFinite(time)||this.lastTime!==null&&time<=this.lastTime)return;
    const active=this.events.at(-1);
    if(active&&active.end===null&&connected!==false){active.end=time;active.partial=active.partial||connected===null;}
    if(connected===false&&this.previous!==false)this.events.push({start:time,end:null,partial:this.previous===null});
    if(this.events.length>50)this.events.shift();this.previous=connected;this.lastTime=time;
  }
}

const REQUIRED={freshness:null,inverter_status:null,grid_connected:null,solar_power:"W",battery_soc:"%",battery_power:"W",grid_power:"W",load_power:"W"};
/** @param {Object} states HA states. @param {Object} config Entity map/age limit. @param {number} now Epoch milliseconds. @returns {Object[]} Actionable diagnostics; static daily counters are not misclassified as stale live sensors. */
export function inspectEntities(states,config,now){
  const issues=[];
  for(const [name,unit] of Object.entries(REQUIRED)){
    const id=config.entities[name],entity=states[id];
    if(!id){issues.push({code:"missing",name,message:`Map ${name}`});continue;}
    if(!entity||["unknown","unavailable",""].includes(entity.state)){issues.push({code:"unknown",name,message:`${name}: unavailable reading`});continue;}
    if(unit&&!Number.isFinite(Number(entity.state))){issues.push({code:"invalid",name,message:`${name}: expected numeric ${unit}`});continue;}
    const time=Date.parse(entity.last_reported??entity.last_updated??"");
    // Binary/status entities legitimately publish only transitions; their last change is not a heartbeat.
    if(unit&&(!Number.isFinite(time)||time>now||now-time>config.runtime_max_sample_age_seconds*1000))issues.push({code:"stale",name,message:`${name}: timestamp missing, future or old`});
    if(name==="battery_soc"&&(Number(entity.state)<0||Number(entity.state)>100))issues.push({code:"invalid",name,message:"battery_soc: expected 0–100%"});
    const actual=entity.attributes?.unit_of_measurement;
    if(unit&&actual!==unit)issues.push({code:"unit",name,message:`${name}: verify ${unit} (reported ${actual??"no unit"})`});
  }
  return issues;
}
