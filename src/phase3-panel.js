/** @fileoverview Progressive solar outlook and local battery-accuracy detail, without equipment controls. */
import {ForecastController,FORECAST_LIMITS,forecastWindow,boundedRead} from "./solar-outlook.js";
import {EstimateAccuracy,accuracySummary,accuracyNamespace,identityHash} from "./estimate-accuracy.js";
import {startOfDay,historyPath} from "./history.js";
import {chartPaths,chartCoordinates} from "./presentation.js";

/** @param {Element} root Scoped root. @param {string} selector Selector. @param {string} text Untrusted content rendered as text. */
function set(root,selector,text){root.querySelector(selector).textContent=text;}

/**
 * Preserves unavailable report boundaries and marks conservative >15min observation gaps.
 * @param {unknown} response Filtered Recorder response.
 * @param {string} id Solar entity only.
 * @param {string} unit Verified current W/kW scope; unit changes require re-commissioning.
 * @param {number} start Window start.
 * @param {number} end Window end.
 * @returns {Object[]} Gap-aware measured power; never holds or extrapolates missing reports.
 */
export function solarHistoryPoints(response,id,unit,start,end){
 if(!Array.isArray(response))return [];
 const series=response.find(rows=>Array.isArray(rows)&&rows.some(row=>row?.entity_id===id))??[],points=[];let broken=true,last=null;
 for(const row of series.slice(-FORECAST_LIMITS.actualPoints)){
  const time=Date.parse(row?.last_updated??row?.last_changed??""),value=typeof row?.state==="string"&&row.state.trim()!==""?Number(row.state):NaN;
  if(!Number.isFinite(time)||time<start||time>end||!Number.isFinite(value)||value<0){broken=true;continue;}
  if(last!==null&&time<=last){broken=true;continue;}
  points.push({time,value:value*(unit==="kW"?1000:1),breakBefore:broken||(last!==null&&time-last>FORECAST_LIMITS.actualGap)});last=time;broken=false;
 }
 return points;
}

/**
 * Creates a solar-only mean-power step trace on a shared W scale, with genuine gaps.
 * @param {Object[]} intervals Canonical source intervals.
 * @param {number} start Display start.
 * @param {number} end Display end.
 * @param {number} maximum Common actual/forecast W ceiling.
 * @returns {string} Safe numeric SVG path; no smoothing or gap interpolation.
 */
export function forecastStepPath(intervals,start,end,maximum){
 const cuts=[...new Set(intervals.flatMap(r=>[Math.max(start,r.start),Math.min(end,r.end)]).filter(t=>t>=start&&t<=end))].sort((a,b)=>a-b);
 let path="";
 for(let i=0;i<cuts.length-1;i++){const a=cuts[i],b=cuts[i+1],rows=intervals.filter(r=>r.start<=a&&r.end>=b);if(!rows.length||b<=a)continue;
  const watts=rows.reduce((s,r)=>s+r.watts,0),position=t=>chartCoordinates({time:t,value:watts},[],{start:new Date(start),end:new Date(end)},{min:0,max:maximum}),x=t=>position(t).x,y=position(a).y;
  path+=`M${x(a).toFixed(3)} ${y.toFixed(3)}H${x(b).toFixed(3)} `;
 }
 return path;
}

/** Phase 3 UI controller; render-only DOM helpers never dispatch HA service actions. */
export class Phase3Panel{
 /** @param {Object} card Existing custom element; owns all lifecycle and domain estimates. */
 constructor(card){
  this.card=card;this.root=card.shadowRoot;this.forecast=new ForecastController(()=>this.renderSolar());this.accuracy=new EstimateAccuracy();this.day="today";this.actual=[];this.actualState="idle";this.actualRevision=0;this.actualFetch=null;this.remember=false;this.storageKey="";this.storageMessage="";this.active=false;
  const link=document.createElement("button");link.type="button";link.className="solar-outlook-link";link.dataset.solarOutlookToggle="";link.textContent="Solar outlook ›";link.setAttribute("aria-expanded","false");link.setAttribute("aria-controls","powerflo-solar-outlook");this.root.querySelector('.solar').append(link);
  const detail=document.createElement("section");detail.className="solar-outlook";detail.id="powerflo-solar-outlook";detail.hidden=true;
  detail.innerHTML='<header class="outlook-header"><h2 tabindex="-1">Solar outlook</h2><button type="button" data-outlook-close aria-label="Close Solar outlook">Close</button></header><p data-forecast-status role="status"></p><fieldset class="forecast-sources"><legend>Forecast arrays · select only this system</legend><div data-forecast-sources></div><p>Selections here last for this card session. Copy the IDs into card settings to retain them. No Home Assistant Energy preferences are changed.</p></fieldset><div class="outlook-period" role="group" aria-label="Solar outlook day"><button type="button" data-outlook-day="today" aria-pressed="true">Today</button><button type="button" data-outlook-day="tomorrow" aria-pressed="false">Tomorrow</button><button type="button" data-outlook-refresh>Refresh</button></div><p data-forecast-energy></p><p class="outlook-legend">Solid: measured PV power · dashed steps: forecast interval mean power. Forecast is PV production, not battery charging.</p><svg class="outlook-chart" viewBox="0 0 100 36" preserveAspectRatio="none" role="img" aria-label="Measured solar power and forecast interval mean power"><path data-solar-actual></path><path data-solar-forecast></path><line data-solar-now y1="0" y2="36"></line></svg><div class="outlook-axis"><span data-solar-start></span><span data-solar-now-label></span><span data-solar-end></span></div><label class="forecast-inspector">Inspect forecast time<input data-outlook-cursor type="range" min="0" max="1000" value="500"></label><output data-outlook-inspection aria-live="polite"></output><p data-solar-provenance></p><h3>Weather context</h3><p data-weather-status></p><div class="weather-hours" data-weather-hours></div><p data-weather-attribution></p><p>Weather already informs the PV provider upstream. No second cloud/rain correction is applied. The battery target/full estimates and conservative outage baseline keep their existing calculation basis.</p>';
  this.root.querySelector('.powerflo-insights').after(detail);this.detail=detail;this.link=link;
  link.addEventListener("click",()=>{detail.hidden=!detail.hidden;link.setAttribute("aria-expanded",String(!detail.hidden));if(!detail.hidden){detail.querySelector("h2").focus();this.refresh();}else this.forecast.disconnect();});
  detail.querySelector('[data-outlook-close]').addEventListener("click",()=>this.close());
  detail.addEventListener("keydown",e=>{if(e.key==="Escape"){e.preventDefault();this.close();}});
  detail.querySelector('[data-outlook-refresh]').addEventListener("click",()=>this.refresh(true));
  for(const button of detail.querySelectorAll('[data-outlook-day]'))button.addEventListener("click",()=>{this.day=button.dataset.outlookDay;this.renderSolar();});
  detail.querySelector('[data-outlook-cursor]').addEventListener("input",()=>this.renderInspection());
  const accuracy=document.createElement("section");accuracy.className="accuracy-detail";
  accuracy.innerHTML='<h3>Estimate accuracy</h3><p data-accuracy-status role="status"></p><dl class="accuracy-facts"></dl><p data-accuracy-exclusion></p><label class="accuracy-remember"><input type="checkbox" data-accuracy-remember>Remember on this browser</label><button type="button" data-accuracy-clear>Clear local evidence</button><p data-accuracy-storage></p><p>Only qualified outcomes observed while this card is visible count. Timing error = observed minus frozen predicted time; positive means later. SOC feedback is a separate 30-minute check in percentage points, not proof of all-night runtime. Report intervals bound crossing uncertainty. No estimates are automatically retuned.</p>';
  this.root.querySelector('.estimate-details').append(accuracy);this.accuracyElement=accuracy;
  accuracy.querySelector('[data-accuracy-remember]').addEventListener("change",event=>{this.remember=event.target.checked;this.persist();this.renderAccuracy();});
  accuracy.querySelector('[data-accuracy-clear]').addEventListener("click",()=>{this.accuracy.clear();try{if(this.storageKey)localStorage.removeItem(this.storageKey);}catch{this.storageMessage="Browser storage is unavailable; session evidence cleared.";}this.renderAccuracy();});
  this.configure();
 }
 /** Closes detail and restores the initiating keyboard focus. */
 close(){this.detail.hidden=true;this.link.setAttribute("aria-expanded","false");this.forecast.disconnect();this.link.focus();}
 /** Resets request/accuracy state when the card's configuration changes. */
 configure(){
  this.forecast.disconnect();this.actualRevision++;this.actual=[];this.actualFetch=null;this.actualState="idle";this.accuracy=new EstimateAccuracy();this.cohort="";this.storageKey="";this.remember=false;this.storageMessage="";
  this.link.hidden=!this.card.config.solar_outlook_enabled;if(this.link.hidden){this.detail.hidden=true;this.link.setAttribute("aria-expanded","false");}
  this.accuracyElement.hidden=!this.card.config.estimate_accuracy_enabled;this.renderAccuracy();
 }
 /** Stops reads and pending evidence when detached, backgrounded or off-screen. */
 disconnect(){this.active=false;this.forecast.disconnect();this.actualRevision++;this.actualFetch=null;this.actualState="idle";this.accuracy.pause();}
 /** @returns {boolean} Whether requests/collection can run without hidden background work. */
 available(){return this.card.isConnected&&this.card.visible&&!document.hidden;}
 /** @param {boolean} force Explicit user retry. @returns {Promise<void>} Independent forecast and measured-power reads. */
 async refresh(force=false){
  if(!this.available()||this.detail.hidden||!this.card.config.solar_outlook_enabled)return;
  this.active=true;const hass=this.card.hassValue;if(!hass)return;
  await Promise.all([this.forecast.start(hass,this.card.config,force),this.loadActual(force)]);
 }
 /** @param {boolean} force Explicit retry. @returns {Promise<void>} Targeted recorded solar power, independent of energy counters. */
 async loadActual(force=false){
  const now=Date.now();if(this.actualState==="loading"||(!force&&this.actualFetch!==null&&now-this.actualFetch<FORECAST_LIMITS.actualRefresh))return;
  this.actualFetch=now;const revision=++this.actualRevision,hass=this.card.hassValue,id=this.card.config.entities.solar_power,unit=hass.states?.[id]?.attributes?.unit_of_measurement;
  this.actualState="loading";this.renderSolar();
  try{
   if(!["W","kW"].includes(unit)||typeof hass.callApi!=="function")throw Error("Measured power unavailable");
   const range={start:startOfDay(new Date(now),hass.config?.time_zone??"UTC"),end:new Date(now)};
   const result=await boundedRead(hass.callApi("get",historyPath([id],range.start,range.end)));if(revision!==this.actualRevision)return;
   this.actual=solarHistoryPoints(result,id,unit,range.start.getTime(),now);this.actualState=this.actual.length?"ready":"empty";
  }catch{if(revision===this.actualRevision){this.actual=[];this.actualState="error";}}
  if(revision===this.actualRevision)this.renderSolar();
 }
 /** @returns {Object} Selected local-calendar day boundaries, including DST. */
 range(){const zone=this.card.hassValue?.config?.time_zone??"UTC",today=startOfDay(new Date(),zone).getTime(),tomorrow=startOfDay(new Date(today+36*3600000),zone).getTime(),start=this.day==="today"?today:tomorrow;return {start,end:startOfDay(new Date(start+36*3600000),zone).getTime()};}
 /** @param {number} time Epoch ms. @returns {string} HA-zone clock label. */
 clock(time){return new Intl.DateTimeFormat(undefined,{timeZone:this.card.hassValue?.config?.time_zone??"UTC",hour:"numeric",minute:"2-digit",hour12:this.card.config.clock_format!=="24"}).format(time);}
 /** Updates solar-only charts, provenance, coverage and independent weather context. */
 renderSolar(){
  const root=this.detail,c=this.forecast;if(!root)return;
  const now=Date.now(),stale=c.receivedAt!==null&&now-c.receivedAt>FORECAST_LIMITS.maxAge,rows=stale||c.status!=="ready"?[]:c.intervals;
  set(root,'[data-forecast-status]',c.status==="error"?"Solar forecast unavailable. Check Energy forecast association, then refresh. Live readings and battery estimates are unaffected.":stale?"Forecast receipt is over 2 hours old; forecast withheld.":c.status==="loading"?"Loading HA Energy solar forecast…":!Object.keys(c.response).length?"No forecast arrays found. Select your PV forecast under Settings → Dashboards → Energy → Solar panels.":!c.selected.length?"Select the matching array source(s) below. Unselected arrays are never added automatically.":!rows.length?"Selected sources have no bounded forecast intervals.":"Forecast from selected HA Energy arrays · issue time not supplied by this API");
  const sources=root.querySelector('[data-forecast-sources]'),keys=Object.keys(c.response),signature=JSON.stringify(keys);
  if(sources.dataset.signature!==signature){sources.replaceChildren();sources.dataset.signature=signature;for(const key of keys){const label=document.createElement("label"),input=document.createElement("input"),text=document.createElement("span");input.type="checkbox";input.checked=c.selected.includes(key);input.value=key;text.textContent=key;input.addEventListener("change",()=>{const chosen=[...sources.querySelectorAll('input:checked')].map(x=>x.value);c.select(chosen);});label.append(input,text);sources.append(label);}}
  for(const button of root.querySelectorAll('[data-outlook-day]'))button.setAttribute("aria-pressed",String(button.dataset.outlookDay===this.day));
  const range=this.range(),start=Math.max(now,range.start),energy=forecastWindow(rows,start,range.end),actual=this.day==="today"?this.actual.filter(x=>x.time<=now):[];
  set(root,'[data-forecast-energy]',energy.kwh===null?"Remaining PV energy unavailable":`${energy.kwh.toFixed(1)} kWh forecast PV over ${(energy.coveredMs/3600000).toFixed(1)} covered hours${energy.partialInterval?" · partial interval prorated":""}. Missing periods are not zero.`);
  const maximum=Math.max(1,...actual.map(x=>x.value),...rows.map(x=>rows.filter(y=>y.start<=x.start&&y.end>x.start).reduce((s,y)=>s+y.watts,0)));
  const paths=chartPaths(actual,{start:new Date(range.start),end:new Date(range.end)},[{time:range.start,value:0},{time:range.end,value:maximum}]);
  root.querySelector('[data-solar-actual]').setAttribute("d",paths.line);
  root.querySelector('[data-solar-forecast]').setAttribute("d",forecastStepPath(rows,range.start,range.end,maximum));
  for(const control of sources.querySelectorAll('input'))control.checked=c.selected.includes(control.value);
  const line=root.querySelector('[data-solar-now]'),visible=now>=range.start&&now<=range.end;line.setAttribute("visibility",visible?"visible":"hidden");const x=(now-range.start)/(range.end-range.start)*100;line.setAttribute("x1",String(x));line.setAttribute("x2",String(x));
  set(root,'[data-solar-start]',this.clock(range.start));set(root,'[data-solar-end]',this.clock(range.end));set(root,'[data-solar-now-label]',visible?`Now · ${this.clock(now)}`:"Tomorrow");
  set(root,'[data-solar-provenance]',`Source: HA Energy solar forecast · selected ${c.selected.length} array(s). ${c.receivedAt===null?"Not received":`Received ${this.clock(c.receivedAt)}`}; provider issue time unknown. Start-keyed Wh intervals use the next timestamp as their end; terminal and >1h unbounded intervals are omitted. Multiple-source totals may have partial array coverage. Measured PV: ${this.actualState}.`);
  const entity=this.card.hassValue?.states?.[this.card.config.weather_entity],weatherStale=c.weatherReceivedAt&&now-c.weatherReceivedAt>FORECAST_LIMITS.maxAge;
  set(root,'[data-weather-status]',c.weatherStatus==="ready"&&!weatherStale?"Hourly weather context · not a second PV derating":weatherStale?"Weather receipt over 2 hours old":"Hourly weather unavailable · configure a weather entity supporting hourly forecasts");
  const weather=root.querySelector('[data-weather-hours]');weather.replaceChildren();
  if(!weatherStale&&c.weatherStatus==="ready")for(const row of c.weather.filter(x=>Date.parse(x.datetime)+FORECAST_LIMITS.hour>start&&Date.parse(x.datetime)<range.end).slice(0,8)){
   const item=document.createElement("div");const time=document.createElement("time"),conditions=document.createElement("span");time.textContent=this.clock(Date.parse(row.datetime));conditions.textContent=[typeof row.condition==="string"?row.condition.replaceAll("-"," "):"Condition unknown",typeof row.temperature==="number"&&Number.isFinite(row.temperature)?`${row.temperature} ${entity?.attributes?.temperature_unit??""}`:null,typeof row.precipitation_probability==="number"?`${row.precipitation_probability}% rain probability`:null].filter(Boolean).join(" · ");item.append(time,conditions);weather.append(item);
  }
  set(root,'[data-weather-attribution]',String(entity?.attributes?.attribution??"Weather supplied by the configured Home Assistant integration. Provider issue time not supplied."));this.renderInspection();
 }
 /** Renders the keyboard/touch forecast time inspector without extrapolating outside coverage. */
 renderInspection(){
  const range=this.range(),time=range.start+(range.end-range.start)*Number(this.detail.querySelector('[data-outlook-cursor]').value)/1000,c=this.forecast;
  const valid=c.status==="ready"&&c.receivedAt!==null&&Date.now()-c.receivedAt<=FORECAST_LIMITS.maxAge;
  const rows=valid?c.intervals.filter(x=>x.start<=time&&x.end>time):[],power=rows.reduce((s,r)=>s+r.watts,0);
  set(this.detail,'[data-outlook-inspection]',`${this.clock(time)} · ${rows.length?`${(power/1000).toFixed(2)} kW forecast interval mean · ${new Set(rows.map(r=>r.source)).size}/${c.selected.length} selected arrays covered`:"No forecast coverage"}`);
 }
 /** @param {Object} model Domain state. @param {Object} input Timestamp-qualified estimator input. @param {Function} projection Existing unchanged charge projection. @param {Object} runtime Runtime result. Collects only visible reports. */
 observe(model,input,projection,runtime){
  if(!this.available()||!this.card.config.estimate_accuracy_enabled){this.accuracy.pause();return;}
  const config=this.card.config,hass=this.card.hassValue,cohort=identityHash(JSON.stringify([config.battery_capacity_kwh,config.battery_charge_target_soc,config.battery_reserve_soc,config.charge_taper_start_soc,config.charge_taper_floor_ratio,config.use_learned_taper,config.runtime_window_minutes,config.battery_positive,config.grid_positive,config.solar_projection_hours,config.entities]));this.cohort=cohort;
  const key=hass.user?.id?accuracyNamespace(hass.user.id,JSON.stringify([new URL(globalThis.location.href).origin,config.accuracy_storage_key,config.entities.battery_soc,config.entities.battery_power])):"";
  if(this.storageKey!==key){this.accuracy=new EstimateAccuracy();this.storageKey=key;this.remember=false;try{const saved=key?localStorage.getItem(key):null;if(saved){this.accuracy.restore(saved,input.now);this.remember=true;this.persist();}}catch{this.storageMessage="Browser storage unavailable; session-only collection continues.";}}
  const e=hass.states[config.entities.battery_soc],time=Date.parse(e?.last_reported??e?.last_updated??""),targets=[...new Set([50,75,95,100,config.battery_charge_target_soc])].map(target=>({target,hours:projection(target).hours}));
  const expired=this.accuracy.prune(input.now);
  const changed=this.accuracy.observe({time,now:input.now,soc:input.soc,mode:input.mode,fresh:input.fresh&&model.connected!==null,cohort,regime:`${model.connected}:${(model.values.solarPower??0)>config.flow_threshold_w?"solar":"no-solar"}:${model.grid}`,capacity:input.capacityKwh,reserve:input.reserveSoc,targets,runtimeHours:runtime.hours,rateWatts:runtime.averageWatts??input.power,maxGap:input.maxAgeMs});
  if((changed||expired)&&this.remember)this.persist();this.renderAccuracy();
 }
 /** Writes only bounded completed outcomes after explicit local consent, never HA credentials or settings. */
 persist(){try{if(!this.storageKey){this.remember=false;this.storageMessage="A signed-in HA user is required for user-isolated browser retention.";}else if(this.remember){localStorage.setItem(this.storageKey,JSON.stringify(this.accuracy.events));this.storageMessage="";}else{localStorage.removeItem(this.storageKey);this.storageMessage="";}}catch{this.remember=false;this.storageMessage="Browser storage unavailable; evidence remains session-only.";}}
 /** Updates qualified evidence cohorts and the explicit local retention controls. */
 renderAccuracy(){
  const root=this.accuracyElement;if(!root)return;
  set(root,'[data-accuracy-status]',this.accuracy.events.length?"Qualified outcomes · current system/model cohort":"Collecting qualified outcomes · no accuracy claim yet");
  const facts=root.querySelector('.accuracy-facts');facts.replaceChildren();
  const milestones=[...new Set([this.card.config.battery_charge_target_soc,95,100])].map(target=>["charge",target,target===100?"Charge to full":`Charge to ${target}%`]);
  for(const [kind,target,title] of [...milestones,["reserve",this.card.config.battery_reserve_soc,"Runtime to reserve"],["soc",30,"30-minute SOC check"]]){
   const result=accuracySummary(this.accuracy.events,kind,target,this.cohort||null),dt=document.createElement("dt"),dd=document.createElement("dd");dt.textContent=title;
   const unit=kind==="soc"?"pp":"min";
   dd.textContent=result.count?`${result.count} outcomes · mean absolute error ${result.mae.toFixed(1)} ${unit} · bias ${result.bias>=0?"+":""}${result.bias.toFixed(1)} ${unit}${kind==="soc"?"":` · latest crossing bracket ${(result.latest.uncertaintyMs/60000).toFixed(1)} min`}`:"Collecting · insufficient evidence";facts.append(dt,dd);
  }
  set(root,'[data-accuracy-exclusion]',this.accuracy.lastExclusion?`Latest excluded session: ${this.accuracy.lastExclusion}`:"Only uninterrupted, fresh, same-regime sessions are scored. Unreached targets are not successes.");
  root.querySelector('[data-accuracy-remember]').checked=this.remember;
  set(root,'[data-accuracy-storage]',this.storageMessage||`${this.remember?"Remembered on this browser":"Session-only · remember off"}. At most 200 outcomes / 90 days; no background collection or multi-device aggregation.`);
 }
}
