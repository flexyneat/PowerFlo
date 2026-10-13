/** @fileoverview Read-only Recorder outage reconstruction with freshness coverage and bounded requests. */
import { historyPath } from "./history.js";
import { booleanState } from "./state-model.js";
import { OutageSession } from "./insights.js";

/**
 * Reconstructs observed outages from connection AND freshness history; unknown periods are gaps.
 * @param {Object} hass Authenticated HA frontend.
 * @param {Object} entities Mapped grid_connected/freshness entity IDs.
 * @param {number} now End epoch milliseconds.
 * @returns {Promise<Object>} At most 50 outage observations for the trailing 24 hours, with coverage label.
 */
export async function loadOutageHistory(hass,entities,now){
  const start=now-86400000,ids=[entities.grid_connected,entities.freshness];
  // An empty Recorder filter can request unrelated entities; fail closed before any network call.
  if(ids.some(id=>typeof id!=="string"||!id.trim())||ids[0]===ids[1])throw new Error("Map distinct connection and freshness entities");
  const rows=await hass.callApi("get",historyPath(ids,new Date(start),new Date(now)));
  if(!Array.isArray(rows))throw new Error("Invalid Recorder history response");
  const points=[];
  for(const series of rows){
    if(!Array.isArray(series))continue;
    const id=series.find(row=>row.entity_id)?.entity_id;
    if(!ids.includes(id))continue;
    for(const row of series){const time=Date.parse(row.last_changed??row.last_updated??"");
      if(Number.isFinite(time)&&time<=now)points.push({time:Math.max(start,time),key:id===ids[0]?"connected":"fresh",value:booleanState({sample:{state:row.state}},"sample")});}
  }
  points.sort((a,b)=>a.time-b.time);
  const state={connected:null,fresh:null},events=new OutageSession();
  for(let i=0;i<points.length;){const time=points[i].time;
    while(i<points.length&&points[i].time===time){state[points[i].key]=points[i].value;i++;}
    events.observe(time,state.fresh===true?state.connected:null);
  }
  return {events:events.events,coverage:points.length?"Observed Recorder samples; gaps/leading intervals may be partial":"No Recorder coverage"};
}
