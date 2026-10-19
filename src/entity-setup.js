/** @fileoverview Conservative entity suggestions; no device discovery, writes or automatic polarity. */
import {booleanState,numericState} from "./state-model.js";
/** Required roles handled by the guide; optional fields remain in the existing editor. */
export const SETUP_ROLES=Object.freeze(["freshness","inverter_status","grid_connected","solar_power","battery_soc","battery_power","grid_power","load_power"]);
/** @param {string} role Semantic role. @param {string} id Entity ID. @param {Object} states HA states. @param {Object} mappings Other roles. @returns {Object} Compatibility, not physical commissioning evidence. */
export function mappingCheck(role,id,states,mappings){
  if(!id)return {status:"unmapped",message:"Needs mapping"};
  if(Object.entries(mappings).some(([key,value])=>key!==role&&value===id))return {status:"duplicate",message:"Use a distinct entity for this role"};
  const e=states[id];if(!e||["unknown","unavailable",""].includes(e.state))return {status:"unavailable",message:"Entity unavailable"};
  if(["freshness","grid_connected"].includes(role))return booleanState(states,id)!==null&&id.startsWith("binary_sensor.")?{status:"compatible",message:"Boolean representation compatible; confirm physical role"}:{status:"incompatible-unit",message:"Use an explicit connection/freshness binary sensor, not watts"};
  if(role==="inverter_status")return {status:"compatible",message:"Status text mapped; confirm its operating-state meaning"};
  const unit=role==="battery_soc"?"%":"W";
  if(e.attributes?.unit_of_measurement!==unit)return {status:"incompatible-unit",message:`Requires ${unit}; no automatic conversion`};
  const value=numericState(states,id);
  if(value===null||(role==="battery_soc"&&(value<0||value>100))||(["load_power","solar_power"].includes(role)&&value<0))return {status:"invalid-value",message:"Value outside valid range"};
  return ["battery_power","grid_power"].includes(role)?{status:"requires-confirmation",message:"Confirm sign against an independently observed condition"}:{status:"compatible",message:"Value and unit compatible; confirm physical role"};
}
/** @param {string} role Semantic role. @param {Object} states HA states. @returns {string[]} At most 100 suggestions, never silently selected. */
export function entitySuggestions(role,states){return Object.keys(states).filter(id=>["compatible","requires-confirmation"].includes(mappingCheck(role,id,states,{}).status)).sort((a,b)=>Number(b.includes(role))-Number(a.includes(role))||a.localeCompare(b)).slice(0,100);}
