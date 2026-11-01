/** @fileoverview Read-only recent-demand history with bounded, time-weighted coverage. */
import { historyPath } from "./history.js";

/** Recent-power window, refresh pacing and bounded client memory. */
export const DEMAND_LIMITS = Object.freeze({ windowMs: 900_000, refreshMs: 60_000, holdMs: 60_000, maximumPoints: 2000 });

/**
 * Converts Recorder rows to watts, retaining unknown states as explicit gaps.
 * @param {unknown} rows Recorder response.
 * @param {string} entityId Configured protected-load power entity.
 * @param {string} unit Sensor unit; absent legacy unit is treated as configured watts.
 * @param {Object|null} current Fresh current-state endpoint, already converted to watts.
 * @returns {Array<{time:number,value:number|null}>} Sorted bounded observations.
 */
export function parseDemandHistory(rows, entityId, unit = "W", current = null) {
  if (!Array.isArray(rows) || !["W", "kW"].includes(unit)) return [];
  const points = new Map();
  for (const series of rows) {
    if (!Array.isArray(series) || series.find(row => row?.entity_id)?.entity_id !== entityId) continue;
    for (const row of series) {
      if (!row || (row.entity_id && row.entity_id !== entityId)) continue;
      const time = Date.parse(row.last_updated ?? row.last_changed ?? "");
      if (!Number.isFinite(time)) continue;
      const raw = typeof row.state === "string" && row.state.trim() !== "" ? Number(row.state) : NaN;
      const watts = raw * (unit === "kW" ? 1000 : 1);
      points.set(time, { time, value: Number.isFinite(watts) && watts >= 0 ? watts : null });
    }
  }
  if(current && Number.isFinite(current.time) && Number.isFinite(current.value) && current.value>=0) points.set(current.time,current);
  const ordered=[...points.values()].sort((a,b)=>a.time-b.time).slice(-DEMAND_LIMITS.maximumPoints);
  // Recorder stores state transitions, not a polling log: silence between rows is not a dropout.
  return ordered.map((point,index)=>({...point,...(ordered[index+1] ? {recordedUntil:ordered[index+1].time} : {})}));
}

/**
 * Loads only recent protected-load power through HA's existing authenticated read API.
 * @param {Object} hass Home Assistant frontend context.
 * @param {string} entityId Mapped protected-load power entity.
 * @param {Date} now Window end.
 * @param {string} unit Current sensor power unit.
 * @returns {Promise<Array>} Validated observations, including gap markers.
 */
export async function loadDemandHistory(hass, entityId, now = new Date(), unit = "W") {
  const rows = await hass.callApi("get", historyPath([entityId],new Date(now.getTime()-DEMAND_LIMITS.windowMs),now));
  const state=hass.states?.[entityId];
  const time=Date.parse(state?.last_reported ?? state?.last_updated ?? "");
  const value=typeof state?.state==="string" && state.state.trim()!=="" ? Number(state.state)*(unit==="kW"?1000:1) : NaN;
  // A fresh endpoint closes a transition-only final interval; stale/future states cannot do so.
  const current=Number.isFinite(time) && time<=now.getTime() && now.getTime()-time<=DEMAND_LIMITS.holdMs
    && Number.isFinite(value) && value>=0 ? {time,value} : null;
  return parseDemandHistory(rows,entityId,unit,current);
}

/**
 * Summarizes recorded power without filling unknown time with zero or indefinite holds.
 * Recorded states hold to their next recorded transition (including unavailable).
 * Unconfirmed trailing/live observations remain bounded by maxHoldMs.
 * @param {Array} samples Numeric observations and explicit null gap markers.
 * @param {number} now Window end in epoch milliseconds.
 * @param {number} windowMs Requested window duration.
 * @param {number} maxHoldMs Maximum trustworthy held-state interval.
 * @returns {Object} Average/peak watts, measured coverage and gap-aware graph points.
 */
export function demandSummary(samples, now = Date.now(), windowMs = DEMAND_LIMITS.windowMs, maxHoldMs = DEMAND_LIMITS.holdMs) {
  const start = now - windowMs;
  const ordered = [...new Map(samples.filter(p=>Number.isFinite(p.time) && p.time<=now)
    .map(p=>[p.time,p])).values()].sort((a,b)=>a.time-b.time);
  let energy = 0; let covered = 0; let peakWatts = null; let lastEnd = null;
  const points = [];
  let recordedEnd=null; let recordedValue=null;
  for (const [index,sample] of ordered.entries()) {
    if (!Number.isFinite(sample.value) || sample.value<0) { recordedEnd=null; recordedValue=null; continue; }
    if(Number.isFinite(sample.recordedUntil) && sample.recordedUntil>sample.time) {
      recordedEnd=sample.recordedUntil; recordedValue=sample.value;
    } else if(sample.value!==recordedValue || sample.time>=recordedEnd) { recordedEnd=null; recordedValue=null; }
    // Identical live reports inside a recorded interval must not shorten that interval.
    const bound=recordedEnd ?? sample.time+maxHoldMs;
    const end = Math.min(now,ordered[index+1]?.time ?? now,bound);
    const begin = Math.max(start,sample.time);
    if (end<begin || (end===begin && sample.time<begin)) continue;
    const duration=Math.max(0,end-begin);
    covered+=duration; energy+=duration*sample.value;
    peakWatts=peakWatts===null ? sample.value : Math.max(peakWatts,sample.value);
    points.push({time:begin,value:sample.value,...(lastEnd!==null && begin>lastEnd ? {breakBefore:true} : {})});
    // Draw the complete bounded hold, not just its start (which left false visual holes).
    if (end > begin) points.push({time:end,value:sample.value});
    lastEnd=end;
  }
  return {averageWatts:covered ? energy/covered : null,peakWatts,coverage:Math.min(1,covered/windowMs),
    coverageMs:covered,points,range:{start:new Date(start),end:new Date(now)}};
}
