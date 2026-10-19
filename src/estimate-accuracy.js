/** @fileoverview Frozen, qualified prediction feedback. No estimator retuning or equipment writes. */

/** Session-only by default; persisted completed outcomes are bounded to 90 days/200 events. */
export const ACCURACY_LIMITS=Object.freeze({maxEvents:200,maxAge:90*86400000,horizonMs:30*60000,maxSession:7*86400000,model:"net-taper-v1",maxBytes:100000});

/** @param {string} value Local identity. @returns {string} Stable noncryptographic namespace hash, not anonymization/security. */
export function identityHash(value){let hash=2166136261;for(const char of value)hash=Math.imul(hash^char.charCodeAt(0),16777619);return (hash>>>0).toString(16);}

/** @param {string} user HA user ID. @param {string} card Explicit card/system identity. @returns {string} Local-only user/card storage key. */
export function accuracyNamespace(user,card){return `powerflo:accuracy:v1:${identityHash(user)}:${identityHash(card)}`;}

/**
 * Computes cohort-specific timing minutes or fixed-horizon SOC percentage points.
 * @param {Object[]} events Completed qualified outcomes.
 * @param {string} kind charge/reserve/soc.
 * @param {number} target SOC threshold or horizon minutes.
 * @param {string|null} cohort Optional current system/model cohort.
 * @returns {Object} Honest collecting or summary state, including sample count.
 */
export function accuracySummary(events,kind,target,cohort=null){
 const rows=events.filter(x=>x.kind===kind&&x.target===target&&(!cohort||x.cohort===cohort));
 if(!rows.length)return {status:"collecting",count:0,mae:null,bias:null,latest:null};
 return {status:"ready",count:rows.length,mae:rows.reduce((s,x)=>s+Math.abs(x.error),0)/rows.length,bias:rows.reduce((s,x)=>s+x.error,0)/rows.length,latest:rows.at(-1)};
}

/** Collects one frozen prediction per target per uninterrupted decision session. */
export class EstimateAccuracy{
 /** Initializes bounded evidence, excluded-session status and prediction lifecycle. */
 constructor(){this.events=[];this.pending=new Map();this.last=null;this.completed=new Set();this.lastExclusion="";this.session="";}
 /** Clears outcomes and pending predictions, without changing live estimates. */
 clear(){this.events=[];this.pause();this.lastExclusion="";}
 /** Stops collection on detach/hidden state; later data cannot fill an unobserved gap. */
 pause(){this.pending.clear();this.last=null;this.completed.clear();this.session="";}
 /** @param {number} now Current time. @returns {boolean} Whether evidence expired; raw browser storage is pruned on the next active access. */
 prune(now){const count=this.events.length;this.events=this.events.filter(x=>x.observedAt<=now&&now-x.observedAt<=ACCURACY_LIMITS.maxAge).slice(-ACCURACY_LIMITS.maxEvents);return count!==this.events.length;}
 /** @param {string} data Untrusted local JSON. @param {number} now Current time. Restores only strict completed outcomes, never active predictions. */
 restore(data,now){
  try{
   if(typeof data!=="string"||data.length>ACCURACY_LIMITS.maxBytes)return;
   const rows=JSON.parse(data);if(!Array.isArray(rows))return;
   this.events=rows.filter(x=>["charge","reserve","soc"].includes(x?.kind)&&typeof x.cohort==="string"&&x.cohort.length<=100&&x.model===ACCURACY_LIMITS.model&&[x.target,x.error,x.observedAt,x.predictedAt,x.uncertaintyMs].every(v=>typeof v==="number"&&Number.isFinite(v))&&x.target>=0&&x.target<=100&&Math.abs(x.error)<100000&&x.uncertaintyMs>=0&&x.uncertaintyMs<=300000&&x.observedAt<=now&&now-x.observedAt<=ACCURACY_LIMITS.maxAge).slice(-ACCURACY_LIMITS.maxEvents).map(({kind,target,error,cohort,model,predictedAt,observedAt,uncertaintyMs})=>({kind,target,error,cohort,model,predictedAt,observedAt,uncertaintyMs}));
  }catch{this.events=[];}
 }
 /** @param {Object} sample Qualified telemetry and frozen estimates. @returns {boolean} Whether completed evidence changed. */
 observe(sample){
  const s=sample;
  this.prune(s.now);
  // A BMS may stop on the same fresh report that reaches a configured target/reserve.
  const terminal=s.mode==="static"&&this.last&&[...this.pending.values()].some(p=>p.kind==="charge"?s.soc>=p.target:p.kind==="reserve"&&s.soc<=p.target);
  const valid=s.fresh&&[s.time,s.now,s.soc,s.capacity,s.rateWatts,s.maxGap].every(Number.isFinite)&&s.capacity>0&&s.soc>=0&&s.soc<=100&&s.time<=s.now&&s.now-s.time<=s.maxGap&&(["charging","discharging"].includes(s.mode)||terminal);
  const session=JSON.stringify([s.cohort,s.regime,terminal?this.last.mode:s.mode]);
  const gap=this.last&&(s.time-this.last.time>s.maxGap||s.time<this.last.time);
  if(!valid||gap||(this.session&&this.session!==session)){
   if(this.pending.size)this.lastExclusion=!valid?"Telemetry stale, unavailable or direction changed":gap?"Telemetry gap":"Configuration or source regime changed";
   this.pause();
   // A censoring report is not also a new decision point; wait for the next qualified report.
   return false;
  }
  if(this.last&&s.time===this.last.time)return false;
  this.session=session;
  let changed=false;
  for(const [key,p] of this.pending){
   if(s.time-p.started>ACCURACY_LIMITS.maxSession){this.pending.delete(key);this.completed.add(key);this.lastExclusion="Observation horizon expired";continue;}
   const crossed=p.kind==="charge"?s.soc>=p.target:p.kind==="reserve"?s.soc<=p.target:s.time>=p.predictedAt;
   if(!crossed)continue;
   const error=p.kind==="soc"?s.soc-p.expectedSoc:(s.time-p.predictedAt)/60000;
   this.events.push({kind:p.kind,target:p.target,cohort:s.cohort,model:ACCURACY_LIMITS.model,error,predictedAt:p.predictedAt,observedAt:s.time,uncertaintyMs:s.time-this.last.time});
   this.pending.delete(key);this.completed.add(key);changed=true;
  }
  if(terminal){this.pause();return changed;}
  const predictions=s.mode==="charging"?(s.targets??[]).filter(p=>Number.isFinite(p.hours)&&p.hours>0&&s.soc<p.target).map(p=>({kind:"charge",target:p.target,hours:p.hours})):
   [{kind:"soc",target:30,hours:.5,expectedSoc:s.soc-s.rateWatts/1000*.5/s.capacity*100},...(Number.isFinite(s.runtimeHours)&&s.runtimeHours>0&&s.soc>s.reserve?[{kind:"reserve",target:s.reserve,hours:s.runtimeHours}]:[])];
  for(const p of predictions){const key=`${p.kind}:${p.target}`;if(!this.pending.has(key)&&!this.completed.has(key))this.pending.set(key,{...p,started:s.time,predictedAt:s.time+p.hours*3600000});}
  this.last=s;
  this.events=this.events.filter(x=>s.now-x.observedAt<=ACCURACY_LIMITS.maxAge).slice(-ACCURACY_LIMITS.maxEvents);
  return changed;
 }
}
