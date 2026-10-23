/** @fileoverview Optional read-only gateway snapshots; never substitutes diagnostic roles into flows. */
import {numericState} from "./state-model.js";

/** Optional sensor groups. Existing daily aliases retain their original meanings. */
export const GATEWAY_GROUPS=Object.freeze({
  electrical:Object.freeze([
    ["ac_temperature","AC temperature","°C"],
    ["dc_temperature","DC temperature","°C"],
    ["grid_l2_voltage","Grid L2 register voltage (verify role)","V"],
    ["inverter_output_power","Inverter output (not protected load)","W"],
    ["external_ct_power_candidate","External CT register 171 candidate (unvalidated)","W"],
  ]),
  daily:Object.freeze([
    ["solar_today","PV production","kWh"],
    ["grid_today","Grid import","kWh"],
    ["grid_export_today","Grid export","kWh"],
    ["battery_charge_today","Battery charge","kWh"],
    ["battery_today","Battery discharge","kWh"],
  ]),
  lifetime:Object.freeze([
    ["solar_total","PV production","kWh"],
    ["grid_import_total","Grid import","kWh"],
    ["grid_export_total","Grid export","kWh"],
    ["battery_charge_total","Battery charge","kWh"],
    ["battery_discharge_total","Battery discharge","kWh"],
  ]),
});

/** @param {number|null} value Raw reading. @param {string} source HA unit. @param {string} target Display unit. @returns {number|null} Normalized value or unavailable. */
function convert(value,source,target){
  if(value===null)return null;
  if(source===target)return value;
  if(target==="°C"&&source==="°F")return (value-32)*5/9;
  const factors=target==="kWh"?{Wh:.001,MWh:1000}:target==="W"?{kW:1000}:{};
  return Object.hasOwn(factors,source)?value*factors[source]:null;
}

/**
 * Reads mapped optional sensors independently of primary-role completeness.
 * Instantaneous readings require recent timestamps. Counters retain their report
 * timestamp, not a fabricated live value or a derived Week/Month total.
 * @param {Object} states HA states. @param {Object} config Normalized card config.
 * @param {number} now Current epoch ms. @returns {Object} Grouped safe numeric rows.
 */
export function gatewayTelemetry(states,config,now=Date.now()){
  return Object.fromEntries(Object.entries(GATEWAY_GROUPS).map(([group,fields])=>[group,fields.filter(([key])=>config.entities[key]).map(([key,label,unit])=>{
    const id=config.entities[key],entity=states[id];
    const time=Date.parse(entity?.last_reported??entity?.last_updated??"");
    const reportedAt=Number.isFinite(time)&&time<=now?time:null;
    const stale=group==="electrical"&&reportedAt!==null&&now-reportedAt>config.runtime_max_sample_age_seconds*1000;
    let value=convert(numericState(states,id),entity?.attributes?.unit_of_measurement,unit);
    if(reportedAt===null||stale||(unit==="kWh"&&value<0))value=null;
    return {key,label,unit,value,reportedAt,status:stale?"Stale":value===null?"Unavailable":group==="electrical"?"Recent report":"Reported snapshot"};
  })]));
}

/** @param {Array} rows Safe numeric rows. @param {string} timeZone HA timezone. @param {boolean} hour12 12-hour time preference. @returns {string} Plain text only, including report times for counters. */
export function telemetryText(rows,timeZone,hour12=true){
  if(!rows.length)return "Optional — map these sensors in the card editor.";
  return rows.map(row=>{
    const value=row.value===null?"—":`${row.value.toFixed(row.unit==="W"?0:2)} ${row.unit}`;
    const stamp=row.reportedAt===null?"":` · ${new Intl.DateTimeFormat(undefined,{timeZone,year:"numeric",month:"short",day:"numeric",hour:"numeric",minute:"2-digit",hour12}).format(new Date(row.reportedAt))}`;
    return `${row.label}: ${value} · ${row.status}${stamp}`;
  }).join("\n");
}
