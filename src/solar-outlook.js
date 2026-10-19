/** @fileoverview Bounded, read-only HA Energy and hourly weather forecast adapters. */

/** Forecast cadence and normalization bounds, independent of inverter sample freshness. */
export const FORECAST_LIMITS=Object.freeze({hour:3600000,refresh:3600000,maxAge:7200000,maxRows:384,maxSources:12,maxSpan:3600000,timeout:15000,actualRefresh:300000,actualGap:900000,actualPoints:3000});

/** @param {unknown} value Candidate number. @returns {boolean} Strict finite numeric boundary. */
function finite(value){return typeof value==="number"&&Number.isFinite(value);}

/**
 * Normalizes explicit interval energy/mean power, never treating a daily total as a curve.
 * @param {Object[]} rows Explicit start/end/value/unit intervals.
 * @param {string} source Selected source key.
 * @param {number} receivedAt Local receipt time, not provider issue time.
 * @returns {Object[]} Canonical intervals with kWh and mean W.
 */
export function normalizeIntervals(rows,source,receivedAt){
 if(!Array.isArray(rows))return [];
 return rows.slice(0,FORECAST_LIMITS.maxRows).flatMap(row=>{
  const start=typeof row?.start==="number"?row.start:Date.parse(row?.start),end=typeof row?.end==="number"?row.end:Date.parse(row?.end);
  const duration=end-start,value=row?.value,unit=row?.unit;
  if(!finite(start)||!finite(end)||duration<=0||duration>FORECAST_LIMITS.maxSpan||!finite(value)||value<0||!["Wh","kWh","W","kW"].includes(unit))return [];
  const kwh=unit==="Wh"?value/1000:unit==="kWh"?value:value*(unit==="W"?.001:1)*duration/FORECAST_LIMITS.hour;
  return [{start,end,kwh,watts:kwh*1000*FORECAST_LIMITS.hour/duration,source,receivedAt,issuedAt:null}];
 }).sort((a,b)=>a.start-b.start);
}

/**
 * Reads HA's start-keyed wh_hours; terminal/unbounded and >1h gaps are withheld.
 * @param {Object} response Energy forecast response, keyed by config entry ID.
 * @param {string[]} selected Explicitly selected array keys; empty means no aggregation.
 * @param {number} receivedAt Receipt time.
 * @returns {Object[]} Canonical, source-preserving interval energy.
 */
export function energyForecastIntervals(response,selected,receivedAt){
 return selected.slice(0,FORECAST_LIMITS.maxSources).flatMap(source=>{
  const hours=response?.[source]?.wh_hours;
  if(!hours||typeof hours!=="object"||Array.isArray(hours))return [];
  const entries=Object.entries(hours).map(([time,value])=>({time:Date.parse(time),value})).filter(x=>finite(x.time)).sort((a,b)=>a.time-b.time).slice(0,FORECAST_LIMITS.maxRows+1);
  return normalizeIntervals(entries.slice(0,-1).map((row,i)=>({start:row.time,end:entries[i+1].time,value:row.value,unit:"Wh"})),source,receivedAt);
 });
}

/**
 * Integrates only covered forecast slices; partial intervals use uniform mean-power assumption.
 * @param {Object[]} intervals Canonical forecasts.
 * @param {number} start Window start.
 * @param {number} end Window end.
 * @returns {Object} Forecast PV energy and union coverage, never battery-charge energy.
 */
export function forecastWindow(intervals,start,end){
 let kwh=0,partialInterval=false;const spans=[];
 for(const row of intervals){const a=Math.max(start,row.start),b=Math.min(end,row.end);if(b<=a)continue;kwh+=row.kwh*(b-a)/(row.end-row.start);spans.push([a,b]);partialInterval ||= a!==row.start||b!==row.end;}
 spans.sort((a,b)=>a[0]-b[0]);let coveredMs=0,last=-Infinity;
 for(const [a,b] of spans){coveredMs+=Math.max(0,b-Math.max(a,last));last=Math.max(last,b);}
 return {kwh:spans.length?kwh:null,coveredMs,partialInterval};
}

/** @param {Promise<unknown>} promise Read request. @returns {Promise<unknown>} Bounded request, never a blocked permanent loading state. */
export function boundedRead(promise){let timer;return Promise.race([promise,new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error("Forecast read timed out")),FORECAST_LIMITS.timeout);})]).finally(()=>clearTimeout(timer));}

/** Lazy on-demand forecast controller using only HA's existing authenticated read channels. */
export class ForecastController{
 /** @param {Function} changed Render notification callback. */
 constructor(changed){this.changed=changed;this.revision=0;this.status="idle";this.weatherStatus="idle";this.response={};this.weather=[];this.intervals=[];this.selected=[];this.receivedAt=null;this.lastAttempt=null;this.connection=null;this.unsubscribe=null;this.key="";this.suspended=true;}
 /** Releases active/pending subscriptions and prevents late response attachment. */
 disconnect(){this.revision++;this.unsubscribe?.();this.unsubscribe=null;this.suspended=true;if(this.status==="loading"){this.status="idle";this.lastAttempt=null;}}
 /** @param {string[]} keys Explicit UI-local selection. Re-normalizes without a provider/API request. */
 select(keys){this.selected=[...new Set(keys)].filter(x=>Object.hasOwn(this.response,x)).slice(0,FORECAST_LIMITS.maxSources);this.intervals=energyForecastIntervals(this.response,this.selected,this.receivedAt);this.changed();}
 /**
  * Fetches on open/refresh cadence; retries are bounded and stale requests cannot win.
  * @param {Object} hass Existing HA context.
  * @param {Object} config Card forecast settings.
  * @param {boolean} force Explicit retry.
  * @returns {Promise<void>} Settled reads; independent weather/solar errors remain visible.
  */
 async start(hass,config,force=false){
  if(!hass)return;
  const key=JSON.stringify([config.solar_forecast_sources,config.weather_entity,hass.user?.id]);
  const changed=key!==this.key||this.connection!==hass.connection;
  if(changed){this.disconnect();this.key=key;this.connection=hass.connection;this.response={};this.intervals=[];this.weather=[];this.receivedAt=null;this.selected=[...(config.solar_forecast_sources??[])];this.lastAttempt=null;}
  if(!force&&!changed&&this.lastAttempt!==null&&Date.now()-this.lastAttempt<FORECAST_LIMITS.refresh){
   if(this.suspended){this.suspended=false;await this.subscribeWeather(hass,config.weather_entity,++this.revision);this.changed();}
   return;
  }
  if(!changed&&this.status==="loading")return;
  this.suspended=false;
  const revision=++this.revision;this.lastAttempt=Date.now();this.status="loading";this.changed();
  // Replacing a weather subscription must release the old one, including on retry.
  this.unsubscribe?.();this.unsubscribe=null;
  const weather=this.subscribeWeather(hass,config.weather_entity,revision);
  try{
   if(typeof hass.callWS!=="function")throw Error("HA Energy read channel unavailable");
   const response=await boundedRead(hass.callWS({type:"energy/solar_forecast"}));
   if(revision!==this.revision)return;
   if(!response||typeof response!=="object"||Array.isArray(response))throw Error("Unsupported Energy forecast response");
   this.response=Object.fromEntries(Object.entries(response).filter(([,row])=>row?.wh_hours&&typeof row.wh_hours==="object").slice(0,FORECAST_LIMITS.maxSources));
   this.receivedAt=Date.now();this.status="ready";this.intervals=energyForecastIntervals(this.response,this.selected,this.receivedAt);
  }catch{if(revision===this.revision){this.status="error";this.intervals=[];}}
  finally{if(revision===this.revision)this.changed();}
  await weather;
 }
 /** @param {Object} hass HA connection. @param {string} entity Weather entity. @param {number} revision Request generation. @returns {Promise<void>} Subscription setup. */
 async subscribeWeather(hass,entity,revision){
  const supported=hass.states?.[entity]?.attributes?.supported_features;
  this.weatherStatus=!entity?"unconfigured":!(Number(supported)&2)?"unsupported":"loading";
  if(this.weatherStatus!=="loading")return;
  try{
   const pending=hass.connection.subscribeMessage(event=>{
    if(revision!==this.revision||event?.type!=="hourly")return;
    this.weather=Array.isArray(event.forecast)?event.forecast.filter(x=>Number.isFinite(Date.parse(x?.datetime))).slice(0,FORECAST_LIMITS.maxRows):[];
    this.weatherReceivedAt=Date.now();this.weatherStatus=this.weather.length?"ready":"empty";this.changed();
   },{type:"weather/subscribe_forecast",forecast_type:"hourly",entity_id:entity});
   // A delayed setup after timeout or detach still has to unsubscribe when it eventually resolves.
   let expired=false;
   pending.then(unsub=>{if(expired||revision!==this.revision)unsub();},()=>{});
   try{const unsub=await boundedRead(pending);if(revision===this.revision)this.unsubscribe=unsub;}
   catch{expired=true;throw Error("Weather read unavailable");}
  }catch{if(revision===this.revision){this.weatherStatus="error";this.weather=[];this.changed();}}
 }
}
