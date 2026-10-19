/** @fileoverview Conservative equivalent-local-calendar history comparisons; never extrapolates energy. */
import {periodRange} from "./period-history.js";
import {historyPath} from "./history.js";

/** @param {Date} date Instant. @param {string} zone HA zone. @returns {number} Wall-clock components encoded in UTC, not an instant. */
function wall(date,zone){
 const p=Object.fromEntries(new Intl.DateTimeFormat("en-CA",{timeZone:zone,year:"numeric",month:"2-digit",day:"2-digit",hour:"2-digit",minute:"2-digit",second:"2-digit",hourCycle:"h23"}).formatToParts(date).map(x=>[x.type,x.value]));
 return Date.UTC(+p.year,+p.month-1,+p.day,+p.hour,+p.minute,+p.second);
}
/** @param {number} shape Wall-clock encoding. @param {string} zone Zone. @returns {Date|null} Exact local instant; rejects nonexistent clocks. */
function instant(shape,zone){let candidate=shape;for(let i=0;i<4;i++)candidate+=shape-wall(new Date(candidate),zone);return wall(new Date(candidate),zone)===shape?new Date(candidate):null;}
/** @param {string} period Today/rolling week/month. @param {Date} now Instant. @param {string} zone HA zone. @returns {Object} Comparable ranges or explicit unavailable state. */
export function comparisonRanges(period,now,zone){
 try{
  if(!zone||!["today","week","month"].includes(period))throw Error("zone");
  const base=periodRange(period,now,zone),end=new Date(wall(now,zone));
  if(period!=="today")end.setUTCMinutes(0,0,0);
  const currentStart=wall(base.start,zone);let currentEnd=end.getTime(),referenceStart,referenceEnd,note="";
  if(period==="month"){
   const year=end.getUTCFullYear(),month=end.getUTCMonth(),last=new Date(Date.UTC(year,month,0)).getUTCDate();
   const day=Math.min(end.getUTCDate(),last);
   if(day!==end.getUTCDate()){end.setUTCDate(day);currentEnd=end.getTime();note="Limited to common calendar dates; current total remains unchanged.";}
   referenceStart=Date.UTC(year,month-1,1);referenceEnd=Date.UTC(year,month-1,day,end.getUTCHours());
  }else{const shift=(period==="week"?7:1)*86400000;referenceStart=currentStart-shift;referenceEnd=currentEnd-shift;}
  const current={start:instant(currentStart,zone),end:instant(currentEnd,zone)},reference={start:instant(referenceStart,zone),end:instant(referenceEnd,zone)};
  if(!current.start||!current.end||!reference.start||!reference.end||current.end<=current.start||reference.end<=reference.start)return {status:"unavailable",note:"No completed comparable window yet"};
  // Refuse distorted overlays across different DST offsets instead of stretching or inventing an hour.
  if(current.end-current.start!==reference.end-reference.start)return {status:"unavailable",note:"DST windows differ; comparison unavailable (no time stretching)"};
  return {status:"ready",current,reference,note,label:period==="today"?"yesterday":period==="week"?"previous 7-day window":"previous month",offset:current.start-reference.start};
 }catch{return {status:"unavailable",note:"Valid Home Assistant time zone needed"};}
}
/** @param {Object[]} points Reference observations. @param {Object} ranges Equivalent ranges. @returns {Object[]} Reference positioned at equivalent elapsed instants; never rescales time. */
export function alignReference(points,ranges){return ranges.status==="ready"?points.map(p=>({...p,time:p.time+ranges.offset})):[];}
/** @param {Object|null} current Qualified series. @param {Object|null} reference Qualified reference. @returns {Object} Explicit delta state. */
export function comparisonResult(current,reference){
 if(!Number.isFinite(current?.total)||!Number.isFinite(reference?.total))return {status:"unavailable",delta:null,percent:null};
 if(current.partial||reference.partial)return {status:"partial",delta:null,percent:null};
 const delta=current.total-reference.total;return {status:"ready",delta,percent:reference.total===0?null:100*delta/reference.total};
}
/** @param {Object[]} samples Single-local-day energy counter samples. @param {Object} range Requested boundaries. @param {string} unit Energy units. @returns {Object} Gap/reset-aware cumulative observations, not fabricated midnight data. */
export function dailyComparisonSeries(samples,range,unit){
 const factor={Wh:.001,kWh:1,MWh:1000}[unit];if(!factor)return {points:[],total:null,partial:true};
 const ordered=samples.filter(p=>Number.isFinite(p.time)&&p.time>=+range.start&&p.time<=+range.end).sort((a,b)=>a.time-b.time),points=[];
 let interrupted=false,invalid=false;
 for(const p of ordered){if(!Number.isFinite(p.value)||p.value<0){interrupted=true;invalid=true;continue;}points.push({...p,value:p.value*factor,...(interrupted?{breakBefore:true}:{})});interrupted=false;}
 let partial=points.length<2||points[0].time-+range.start>3600000||+range.end-points.at(-1).time>3600000;
 partial=partial||invalid;
 for(let i=1;i<points.length;i++)if(points[i].value<points[i-1].value||points[i].time-points[i-1].time>7200000){points[i].breakBefore=true;partial=true;}
 return {points,total:points.at(-1)?.value??null,partial};
}

/** @param {Object} hass Authenticated context. @param {string[]} ids Explicit energy mappings. @param {Object} range One local-day window. @returns {Promise<Map>} Numeric and null-gap samples; unrequested response IDs are ignored. */
export async function loadComparisonHistory(hass,ids,range){
 const filtered=[...new Set(ids.filter(Boolean))];if(!filtered.length)return new Map();
 const rows=await hass.callApi("get",historyPath(filtered,range.start,range.end)),result=new Map();
 for(const series of Array.isArray(rows)?rows:[]){
  if(!Array.isArray(series))continue;const id=series.find(r=>r?.entity_id)?.entity_id;if(!filtered.includes(id))continue;
  const points=[];
  for(const row of series){if(!row||row.entity_id&&row.entity_id!==id)continue;const time=Date.parse(row.last_updated??row.last_changed??""),value=typeof row.state==="string"&&row.state.trim()!==""?Number(row.state):NaN;if(Number.isFinite(time))points.push({time,value:Number.isFinite(value)?value:null});}
  result.set(id,points.slice(-10000));
 }return result;
}
