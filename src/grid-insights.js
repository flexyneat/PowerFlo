/** @fileoverview Qualified live-session export observations and explicit standby measurement provenance. */

/** Session-lifetime only; no unbounded sample log and no equipment writes. */
export class ExportSession{
 /** Initializes bounded aggregate state. */
 constructor(){this.previous=null;this.runMs=0;this.counted=false;this.snapshot={status:"collecting",coverageMs:0,exportKwh:0,events:0};}
 /** @param {Object} sample Signed watts, connection, freshness and real report timestamp. @param {Object} config Validated configuration. @returns {Object} Session aggregates and current evidence state. */
 observe(sample,config){
  const s=this.snapshot;
  if(!config.grid_power_verified){this.previous=null;this.runMs=0;this.counted=false;s.status="unverified";return s;}
  const {time,now,watts,connected,fresh}=sample,maxGap=config.runtime_max_sample_age_seconds*1000;
  if(!fresh||connected!==true||!Number.isFinite(time)||!Number.isFinite(watts)||time>now||now-time>maxGap){this.previous=null;this.runMs=0;this.counted=false;s.status="unavailable";return s;}
  const exported=config.grid_positive==="export"?watts:-watts,isExport=exported>config.export_threshold_w;
  if(this.previous&&time<this.previous.time){this.previous=null;this.runMs=0;this.counted=false;s.status="collecting";return s;}
  if(this.previous&&time===this.previous.time)return s;
  const gap=this.previous?time-this.previous.time:0;
  if(gap>0&&gap<=maxGap){
   s.coverageMs+=gap;
   if(isExport&&this.previous.isExport){this.runMs+=gap;s.exportKwh+=(exported+this.previous.exported)/2*gap/3600000000;}
   else{this.runMs=0;this.counted=false;}
  }else{this.runMs=0;this.counted=false;}
  if(!isExport){this.runMs=0;this.counted=false;}
  if(this.runMs>=config.export_duration_seconds*1000&&!this.counted){s.events++;this.counted=true;}
  this.previous={time,exported,isExport};s.status=this.counted?"sustained":isExport?"pending":"observing";return {...s};
 }
}
/** @param {Object} states HA entities. @param {Object} config Validated measurement scope or manual assumption. @param {number} now Instant ms. @returns {Object} Informational only; never added to existing efficiency assumptions. */
export function standbyObservation(states,config,now){
 const e=states[config.entities.inverter_standby_power],time=Date.parse(e?.last_reported??e?.last_updated??""),unit=e?.attributes?.unit_of_measurement;
 const value=typeof e?.state==="string"&&e.state.trim()!==""?Number(e.state):NaN;
 if(config.standby_measurement_verified&&Number.isFinite(time)&&time<=now&&now-time<=config.runtime_max_sample_age_seconds*1000&&Number.isFinite(value)&&value>=0&&["W","kW"].includes(unit)){
  const watts=value*(unit==="kW"?1000:1);return {status:"measured",watts,dailyKwh:watts*24/1000};
 }
 if(Number.isFinite(config.standby_assumed_w))return {status:"assumed",watts:config.standby_assumed_w,dailyKwh:config.standby_assumed_w*24/1000};
 return {status:"unassessed",watts:null,dailyKwh:null};
}
