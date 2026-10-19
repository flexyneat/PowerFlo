/** @fileoverview Conditional no-grid/no-solar energy estimates and bounded local-time demand profiles. */
import {historyPath} from "./history.js";
/** Bounds on Recorder reads, retained points and trustworthy held samples. */
export const READINESS_LIMITS=Object.freeze({days:3,refreshMs:3600000,holdMs:60000,maxRows:30000});
/** @param {string} zone HA IANA zone. @returns {Intl.DateTimeFormat} Local calendar formatter. */
function formatter(zone){if(!zone)throw new Error("HA time zone unavailable");return new Intl.DateTimeFormat("en-CA",{timeZone:zone,year:"numeric",month:"2-digit",day:"2-digit",hour:"2-digit",minute:"2-digit",hourCycle:"h23"});}
/** @param {Intl.DateTimeFormat} f Formatter. @param {number} t Epoch ms. @returns {Object} Calendar parts and half-hour bucket. */
function parts(f,t){const p=Object.fromEntries(f.formatToParts(new Date(t)).map(x=>[x.type,x.value]));return {date:`${p.year}-${p.month}-${p.day}`,year:+p.year,month:+p.month,day:+p.day,minute:+p.hour*60+(+p.minute),bucket:+p.hour*2+Math.floor(+p.minute/30)};}
/** @param {number} now Epoch ms. @param {string} clock HH:mm. @param {string} zone HA zone. @returns {number|null} Next local deadline; DST gaps use first valid minute after requested clock. */
export function nextDeadline(now,clock,zone){
  if(!Number.isFinite(now)||!/^([01]\d|2[0-3]):[0-5]\d$/.test(clock))return null;
  try{const f=formatter(zone),p=parts(f,now),[h,m]=clock.split(":").map(Number),minute=h*60+m;
    const target=new Date(Date.UTC(p.year,p.month-1,p.day+(p.minute>=minute?1:0))).toISOString().slice(0,10);
    for(let t=Math.floor(now/60000)*60000+60000;t<=now+27*3600000;t+=60000){const q=parts(f,t);if(q.date===target&&q.minute>=minute)return t;}
  }catch{/* Invalid zones cannot silently use the browser's calendar. */}return null;
}
/** @param {Object} x SOC %, capacity kWh, reserve %, effective efficiency, AC watts, hours, fresh. @returns {Object} Conditional energy adequacy, never power/surge certification. */
export function readinessEstimate(x){
  if(!x.fresh)return {status:"stale"};
  const {soc,capacity,reserve,efficiency,watts,hours}=x;
  if(![soc,capacity,reserve,efficiency,watts,hours].every(Number.isFinite)||soc<0||soc>100||capacity<=0||reserve<0||reserve>100||efficiency<=0||efficiency>1||watts<0||hours<=0||hours>27)return {status:"unavailable"};
  // Effective efficiency includes overhead once. Do not subtract losses a second time.
  const availableKwh=capacity*Math.max(0,soc-reserve)/100*efficiency,demandKwh=watts*hours/1000;
  const shortfallKwh=Math.max(0,demandKwh-availableKwh),rawSoc=soc-100*demandKwh/(capacity*efficiency);
  return {status:soc<reserve||shortfallKwh>1e-9?"at-risk":"ready",morningSoc:Math.max(0,Math.min(100,rawSoc)),availableKwh,demandKwh,shortfallKwh,runtimeHours:soc<=reserve?0:watts>0?availableKwh/(watts/1000):null};
}
/** @param {Array} samples W observations including null gaps. @param {number} now Epoch ms. @param {string} zone HA zone. @returns {Object} Three-day half-hour local-time buckets. */
export function buildLoadProfile(samples,now,zone){
  const f=formatter(zone),start=now-READINESS_LIMITS.days*86400000,bins=Array.from({length:48},()=>({energy:0,covered:0,expected:0,dates:new Set()}));
  for(let t=start;t<now;t+=60000)bins[parts(f,t).bucket].expected+=Math.min(t+60000,now)-t;
  const ordered=[...new Map(samples.filter(p=>Number.isFinite(p.time)&&p.time<=now).map(p=>[p.time,p])).values()].sort((a,b)=>a.time-b.time).slice(-READINESS_LIMITS.maxRows);
  for(const [i,p] of ordered.entries()){
    if(!Number.isFinite(p.value)||p.value<0)continue;
    const end=Math.min(now,ordered[i+1]?.time??now,p.time+READINESS_LIMITS.holdMs);
    for(let t=Math.max(start,p.time);t<end;){const stop=Math.min(end,(Math.floor(t/60000)+1)*60000),q=parts(f,t),b=bins[q.bucket];b.covered+=stop-t;b.energy+=(stop-t)*p.value;b.dates.add(q.date);t=stop;}
  }return {bins,zone,asOf:now};
}
/** @param {Object} profile Historical buckets. @param {number} start Epoch ms. @param {number} end Deadline. @param {number} minimum Per-bucket coverage gate. @returns {Object|null} Matching-time average only when all buckets qualify. */
export function profileDemand(profile,start,end,minimum){
  if(!profile||!Number.isFinite(minimum)||minimum<=0||minimum>1||end<=start||end-start>27*3600000||start-profile.asOf>READINESS_LIMITS.refreshMs*2)return null;
  const f=formatter(profile.zone);let energy=0,coverage=1;
  for(let t=start;t<end;){const stop=Math.min(end,(Math.floor(t/60000)+1)*60000),b=profile.bins[parts(f,t).bucket];if(!b||!b.expected||!b.covered||b.dates.size<2||b.covered/b.expected<minimum)return null;energy+=(stop-t)*b.energy/b.covered;coverage=Math.min(coverage,b.covered/b.expected);t=stop;}
  return {watts:energy/(end-start),coverage};
}
/** @param {Object} hass Authenticated HA context. @param {string} id Load sensor. @param {number} now Epoch ms. @param {string} unit W/kW. @returns {Promise<Array>} One bounded, filtered read; no entity IDs means no request. */
export async function loadReadinessHistory(hass,id,now,unit){
  if(!/^sensor\.[a-z0-9_]+$/.test(id)||!["W","kW"].includes(unit))throw new Error("Map a valid protected-load power sensor");
  const rows=await hass.callApi("get",historyPath([id],new Date(now-READINESS_LIMITS.days*86400000),new Date(now))),points=[];
  for(const series of Array.isArray(rows)?rows:[]){if(!Array.isArray(series)||series.find(r=>r?.entity_id)?.entity_id!==id)continue;
    for(const r of series){if(!r||(r.entity_id&&r.entity_id!==id))continue;const time=Date.parse(r.last_updated??r.last_changed??""),value=typeof r.state==="string"&&r.state.trim()!==""?Number(r.state):NaN;if(Number.isFinite(time)&&time<=now)points.push({time,value:Number.isFinite(value)&&value>=0?value*(unit==="kW"?1000:1):null});}
  }return points.sort((a,b)=>a.time-b.time).slice(-READINESS_LIMITS.maxRows);
}
