/** @fileoverview Conditional overnight row and ephemeral what-if editor; never mutates live configuration. */
import {nextDeadline,readinessEstimate,buildLoadProfile,profileDemand,loadReadinessHistory,READINESS_LIMITS} from "./readiness.js";
import {numericState} from "./state-model.js";
import {demandSummary} from "./load-trend.js";
import {formatRuntime} from "./runtime.js";

/** Presentation controller scoped to one card, including revision-guarded historical reads. */
export class ReadinessPanel{
  /** Creates trusted static markup and native keyboard-operable controls. */
  constructor(){
    this.element=document.createElement("section");this.element.className="readiness";this.element.setAttribute("aria-label","Overnight readiness");
    this.element.innerHTML='<div class="readiness-row"><strong data-night-title>Overnight readiness</strong><div><span class="node-meta">Morning SOC</span><strong data-night-soc>—</strong></div><div><span class="node-meta">Minimum reserve</span><strong data-night-reserve>—</strong></div><span data-night-status></span><button type="button" data-explore aria-expanded="false">Explore scenario</button></div><p class="readiness-basis" data-night-basis></p><details data-night-details><summary>Readiness assumptions</summary><p data-night-assumptions></p><p data-night-history></p><button type="button" data-night-retry>Retry demand history</button></details><details data-simulation><summary>What-if load simulator · simulation only</summary><p>Baseline follows live readings. Scenario changes are temporary and never change installed capacity, reserve or equipment settings.</p><div class="scenario-fields"></div><p class="scenario-result" data-scenario-result role="status" aria-live="polite"></p><p>Extra watts mean average demand, not compressor starting watts. This energy estimate does not assess surge or electrical safety. Hypothetical capacity starts at the current SOC.</p><button type="button" data-reset-scenario>Reset scenario</button></details>';
    this.element.querySelector('[data-night-details] summary').textContent="Preparedness details";
    const facts=document.createElement("dl");facts.className="preparedness-facts";
    for(const [key,label] of [["available","Usable above reserve"],["demand","Demand until deadline"],["margin","Conditional energy margin"],["telemetry","Telemetry"],["power","BMS / surge capability"]]){const term=document.createElement("dt"),value=document.createElement("dd");term.textContent=label;value.dataset.preparedness=key;facts.append(term,value);}
    this.element.querySelector('[data-night-details] summary').after(facts);
    for(const [key,label,type] of [["extra","Extra average demand (W)","number"],["capacity","Hypothetical total battery (kWh)","number"],["reserve","Scenario reserve SOC (%)","number"],["deadline","Scenario morning deadline","time"]]){
      const wrap=document.createElement("label"),input=document.createElement("input");wrap.textContent=label;input.type=type;input.dataset.scenario=key;
      if(type==="number"){input.min="0";input.max=key==="reserve"?"100":key==="capacity"?"10000":"1000000";input.step="any";}
      wrap.append(input);this.element.querySelector(".scenario-fields").append(wrap);input.addEventListener("input",()=>this.updateScenario());
    }
    const simulation=this.element.querySelector("[data-simulation]"),assumptions=this.element.querySelector("[data-night-details]"),explore=this.element.querySelector("[data-explore]");
    simulation.id="powerflo-simulation";explore.setAttribute("aria-controls",simulation.id);
    explore.addEventListener("click",()=>{simulation.open=!simulation.open;if(simulation.open)simulation.querySelector("input").focus();});
    simulation.addEventListener("toggle",()=>{explore.setAttribute("aria-expanded",String(simulation.open));if(simulation.open)assumptions.open=false;else if(simulation.contains(this.element.getRootNode().activeElement))explore.focus();});
    assumptions.addEventListener("toggle",()=>{if(assumptions.open)simulation.open=false;});
    this.element.querySelector("[data-reset-scenario]").addEventListener("click",()=>this.resetScenario());
    this.element.querySelector("[data-night-retry]").addEventListener("click",()=>{if(this.lastFetch!==null&&Date.now()-this.lastFetch<60000){this.text("[data-night-history]","History unavailable; retry is available after one minute");return;}this.lastFetch=null;this.load(this.hass,this.config);});
    this.revision=0;this.reset();
  }
  /** Resets on real configuration changes, invalidating outstanding reads. */
  reset(){this.revision++;this.profile=null;this.loading=false;this.lastFetch=null;this.historyStatus="Not loaded";this.config=null;this.deadlineCache=new Map();this.baseline=null;this.demandCache=null;}
  /** Prevents late responses from affecting a detached card. */
  disconnect(){this.revision++;if(this.loading)this.lastFetch=null;this.loading=false;}
  /** @param {string} selector Trusted selector. @param {string} value Plain text. */
  text(selector,value){this.element.querySelector(selector).textContent=value;}
  /** Restores scenario defaults, without emitting config-changed. */
  resetScenario(){if(!this.config)return;for(const [key,value] of Object.entries({extra:0,capacity:this.config.battery_capacity_kwh,reserve:this.config.battery_reserve_soc,deadline:this.config.readiness_deadline}))this.element.querySelector(`[data-scenario="${key}"]`).value=String(value);this.updateScenario();}
  /** @param {Object} hass HA context. @param {Object} config Saved card config. Loads only a single three-day load entity, at most hourly. */
  async load(hass,config){
    if(!hass?.callApi||!config?.readiness_enabled||config.readiness_average_w!==null||this.loading||document.hidden||this.lastFetch!==null&&Date.now()-this.lastFetch<READINESS_LIMITS.refreshMs)return;
    const id=config.entities.load_power,unit=hass.states?.[id]?.attributes?.unit_of_measurement;if(!id||!unit||!hass.config?.time_zone)return;
    const revision=++this.revision;this.lastFetch=Date.now();this.loading=true;this.historyStatus="Loading three-day protected-load history";
    try{const samples=await loadReadinessHistory(hass,id,this.lastFetch,unit);if(revision!==this.revision)return;this.profile=buildLoadProfile(samples,this.lastFetch,hass.config.time_zone);this.demandCache=null;this.historyStatus="Three-day local-time profile; each required half-hour needs sufficient coverage on at least two dates";}
    catch{if(revision!==this.revision)return;this.profile=null;this.historyStatus="History unavailable; explicit fallback remains in use";}
    finally{if(revision===this.revision){this.loading=false;if(this.hass&&this.model)this.update(this.hass,this.config,this.model,this.samples);}}
  }
  /** @param {number} now Epoch ms. @param {string} clock HH:mm. @returns {number|null} Minute-cached deadline; bounded to two clocks. */
  deadline(now,clock){const key=`${Math.floor(now/60000)}:${clock}:${this.hass.config?.time_zone}`;if(!this.deadlineCache.has(key)){if(this.deadlineCache.size>2)this.deadlineCache.clear();this.deadlineCache.set(key,nextDeadline(now,clock,this.hass.config?.time_zone));}return this.deadlineCache.get(key);}
  /** @param {number} end Deadline. @returns {Object} Observed/manual/fallback demand with explicit provenance. */
  demand(end){
    if(this.config.readiness_average_w!==null)return {watts:this.config.readiness_average_w,basis:"manual average demand"};
    const key=`${Math.floor(Date.now()/60000)}:${end}:${this.profile?.asOf}`;
    if(this.demandCache?.key!==key)this.demandCache={key,value:profileDemand(this.profile,Date.now(),end,this.config.readiness_min_coverage)};
    const historical=this.demandCache.value;if(historical)return {...historical,basis:`three-day matching-time profile (${Math.floor(historical.coverage*100)}% minimum coverage)`};
    const recent=demandSummary(this.samples);if(recent.coverage>=this.config.readiness_min_coverage)return {watts:recent.averageWatts,basis:"recent 15-minute average fallback, not an overnight profile"};
    const e=this.hass.states[this.config.entities.load_power],time=Date.parse(e?.last_reported??e?.last_updated??""),value=numericState(this.hass.states,this.config.entities.load_power),unit=e?.attributes?.unit_of_measurement;
    return {watts:Number.isFinite(time)&&time<=Date.now()&&Date.now()-time<=this.config.runtime_max_sample_age_seconds*1000&&value!==null&&value>=0&&["W","kW"].includes(unit)?value*(unit==="kW"?1000:1):null,basis:"current load fallback, not an overnight profile"};
  }
  /** @param {number|null} end Deadline. @returns {Object} Shared readiness/simulation input contract. */
  inputs(end){
    const e=this.hass.states[this.config.entities.battery_soc],time=Date.parse(e?.last_reported??e?.last_updated??""),fresh=this.model.dataState==="fresh"&&Number.isFinite(time)&&time<=Date.now()&&Date.now()-time<=this.config.runtime_max_sample_age_seconds*1000;
    const demand=end===null?{watts:null,basis:"configure a valid HA time zone"}:this.demand(end);
    return {soc:e?.attributes?.unit_of_measurement==="%"?numericState(this.hass.states,this.config.entities.battery_soc):null,capacity:this.config.battery_capacity_kwh,reserve:this.config.battery_reserve_soc,efficiency:this.config.runtime_load_efficiency,hours:end===null?null:(end-Date.now())/3600000,fresh,...demand};
  }
  /** @param {Object} hass HA context. @param {Object} config Config. @param {Object} model Live projection. @param {Array} samples Recent load observations. */
  update(hass,config,model,samples=[]){
    if(!hass||!config)return;const changed=this.config!==config;this.hass=hass;this.config=config;this.model=model;this.samples=samples;this.element.hidden=!config.readiness_enabled;if(!config.readiness_enabled)return;
    this.element.dataset.preparedness=config.preparedness_enabled?"visible":"hidden";
    for(const selector of ['.readiness-row','[data-night-basis]','[data-night-details]'])this.element.querySelector(selector).hidden=!config.preparedness_enabled;
    const end=this.deadline(Date.now(),config.readiness_deadline),input=this.inputs(end),result=readinessEstimate(input);this.baseline=result;
    const clock=end===null?config.readiness_deadline:new Intl.DateTimeFormat(undefined,{timeZone:hass.config.time_zone,hour:"numeric",minute:"2-digit",hour12:config.clock_format!=="24"}).format(end);
    const day=end===null?null:new Intl.DateTimeFormat("en-CA",{timeZone:hass.config.time_zone,year:"numeric",month:"2-digit",day:"2-digit"});
    this.text("[data-night-title]",`Until ${day&&day.format(end)!==day.format(Date.now())?"tomorrow, ":""}${clock}`);this.text("[data-night-soc]",Number.isFinite(result.morningSoc)?`${Math.round(result.morningSoc)}%`:"—");this.text("[data-night-reserve]",`${config.battery_reserve_soc}%`);
    this.text("[data-night-status]",result.status==="ready"?`${formatRuntime(input.hours)} covered`:result.status==="at-risk"?(input.soc<input.reserve?"Already below reserve":`Reserve shortfall ${result.shortfallKwh.toFixed(2)} kWh`):result.status==="stale"?"Fresh SOC / telemetry needed":"Estimate unavailable");this.element.dataset.readiness=result.status;
    if(result.status==="ready")this.text('[data-night-status]',`Energy margin ${(result.availableKwh-result.demandKwh).toFixed(2)} kWh`);
    for(const [key,value] of Object.entries({available:result.availableKwh,demand:result.demandKwh,margin:result.availableKwh-result.demandKwh}))this.text(`[data-preparedness="${key}"]`,Number.isFinite(value)?`${key==="margin"&&value>=0?"+":""}${value.toFixed(2)} kWh`:"Not assessed");
    this.text('[data-preparedness="telemetry"]',input.fresh?"Fresh":"Fresh SOC / telemetry needed");
    this.text('[data-preparedness="power"]',"Not assessed · energy coverage is not a surge or backup guarantee");
    this.text("[data-night-basis]",`${model.connected===false?"If grid remains off":"If grid fails now"} · no future solar or grid charge · ${input.basis}${Number.isFinite(input.watts)?` · ${(input.watts/1000).toFixed(2)} kW`:""}`);
    this.text("[data-night-assumptions]",`${(config.runtime_load_efficiency*100).toFixed(0)}% effective usable-energy assumption including losses/overhead once. Reserve is a planning threshold, not shutdown. Capacity/future demand are assumptions, not a backup guarantee. HA time zone: ${hass.config?.time_zone??"unavailable"}.`);this.text("[data-night-history]",this.historyStatus);this.element.querySelector("[data-night-retry]").hidden=!this.historyStatus.startsWith("History unavailable");
    if(changed)this.resetScenario();else this.updateScenario();
  }
  /** Validates scenario inputs without mutating baseline, config or HA entities. */
  updateScenario(){
    if(!this.config||!this.model)return;
    const c=Object.fromEntries([...this.element.querySelectorAll("[data-scenario]")].map(e=>[e.dataset.scenario,e])),number=k=>c[k].value.trim()===""?NaN:Number(c[k].value);
    const extra=number("extra"),capacity=number("capacity"),reserve=number("reserve"),end=this.deadline(Date.now(),c.deadline.value);
    if(!Number.isFinite(extra)||extra<0||extra>1000000||!Number.isFinite(capacity)||capacity<=0||capacity>10000||!Number.isFinite(reserve)||reserve<0||reserve>100||end===null){this.scenarioResult=null;this.text("[data-scenario-result]","Enter valid extra average watts, positive capacity, 0–100% reserve and a local deadline.");return;}
    const input=this.inputs(end),baseline=readinessEstimate(input),scenario=readinessEstimate({...input,watts:input.watts===null?null:input.watts+extra,capacity,reserve});this.scenarioResult=scenario;
    if(!["ready","at-risk"].includes(scenario.status)){this.text("[data-scenario-result]","Simulation unavailable: need fresh SOC, known demand and a valid HA time zone.");return;}
    const runtime=scenario.runtimeHours===null?"No draw at assumed load":formatRuntime(scenario.runtimeHours);
    this.text("[data-scenario-result]",`Same-deadline baseline ${baseline.morningSoc.toFixed(0)}% → scenario ${scenario.morningSoc.toFixed(0)}% morning SOC. ${runtime} to scenario reserve. ${scenario.status==="at-risk"?`${scenario.shortfallKwh.toFixed(2)} kWh shortfall above reserve`:`${Math.max(0,scenario.morningSoc-reserve).toFixed(1)} percentage points above reserve`}. Simulation only; live configuration unchanged.`);
  }
}
