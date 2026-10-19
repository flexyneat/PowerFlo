/** @fileoverview Native card-editor-only mapping guide; explicit review/save, no equipment control. */
import {normalizeConfig} from "./config.js";
import {SETUP_ROLES,mappingCheck,entitySuggestions} from "./entity-setup.js";

/** Holds an isolated draft until the user explicitly saves it to HA's card editor. */
export class SetupGuide{
  /** @param {Function} save Accepts reviewed display config only. */
  constructor(save){
    this.save=save;this.states={};this.element=document.createElement("details");this.element.className="setup-guide";
    const summary=document.createElement("summary");summary.textContent="Guided entity setup";this.body=document.createElement("div");this.element.append(summary,this.body);this.configure(normalizeConfig());
  }
  /** @param {Object} config Actual card config; resets the draft after real external edits. */
  configure(config){this.saved=config;this.draft=normalizeConfig({...config,entities:{...config.entities}});this.step=1;this.confirmed=false;this.render();}
  /** @param {Object} hass HA context; does not steal focus when telemetry updates. */
  updateHass(hass){this.states=hass?.states??{};if(!this.element.contains(this.element.getRootNode().activeElement))this.render();}
  /** @returns {Array} Required-role compatibility results. */
  checks(){return SETUP_ROLES.map(role=>({role,id:this.draft.entities[role],...mappingCheck(role,this.draft.entities[role],this.states,this.draft.entities)}));}
  /** @returns {boolean} Representation checks only; user confirmation is additionally required for save. */
  compatible(){return this.checks().every(x=>["compatible","requires-confirmation"].includes(x.status));}
  /** @param {string} text Label. @param {string} marker Stable data attribute. @param {Function} action Click callback. @returns {HTMLButtonElement} Button. */
  button(text,marker,action){const b=document.createElement("button");b.type="button";b.textContent=text;b.setAttribute(marker,"");b.addEventListener("click",action);return b;}
  /** @param {string} key Config key. @param {string} label Label. @param {Array} options Value/label tuples. @returns {HTMLElement} Sign convention selector. */
  signField(key,label,options){
    const wrap=document.createElement("label"),select=document.createElement("select");wrap.textContent=label;
    for(const [value,text] of options){const o=document.createElement("option");o.value=value;o.textContent=text;select.append(o);}select.value=this.draft[key];select.addEventListener("change",()=>{this.draft[key]=select.value;this.confirmed=false;this.render();});wrap.append(select);return wrap;
  }
  /** Renders text safely, using static markup only for the guide's fixed skeleton. */
  render(){
    this.body.replaceChildren();const status=document.createElement("p");status.dataset.guideStep="";status.textContent=`${this.step} of 3 · ${["Select entities","Check mappings","Review configuration"][this.step-1]}`;this.body.append(status);
    const hint=document.createElement("p");hint.className="hint";hint.textContent="Suggestions are not device discovery or proof of physical role. 0 W does not prove grid disconnection. Optional mappings can remain empty. Existing manual/YAML configuration remains available.";this.body.append(hint);
    if(this.step===1){
      for(const role of SETUP_ROLES){
        const label=document.createElement("label"),input=document.createElement("input"),list=document.createElement("datalist");label.textContent=role.replaceAll("_"," ");input.value=this.draft.entities[role];input.dataset.guideRole=role;
        list.id=`pf-guide-${role}`;input.setAttribute("list",list.id);
        for(const id of entitySuggestions(role,this.states)){const option=document.createElement("option");option.value=id;option.label=String(this.states[id]?.attributes?.friendly_name??id);list.append(option);}
        input.addEventListener("input",()=>{this.draft.entities[role]=input.value.trim();this.confirmed=false;});label.append(input,list);this.body.append(label);
      }
    }else{
      const results=document.createElement("ul");results.className="setup-results";
      for(const x of this.checks()){
        const item=document.createElement("li");item.dataset.mappingState=x.status;item.textContent=`${x.role.replaceAll("_"," ")}: ${x.id||"unmapped"} — ${x.message}`;results.append(item);
      }this.body.append(results);
      if(this.step===2){
        this.body.append(this.signField("battery_positive","Positive battery power",[["discharge","Discharging"],["charge","Charging"]]),this.signField("grid_positive","Positive grid power",[["import","Importing"],["export","Exporting"]]));
        const label=document.createElement("label"),confirm=document.createElement("input");confirm.type="checkbox";confirm.dataset.guideConfirm="";confirm.checked=this.confirmed;
        label.append(confirm,document.createTextNode("I independently confirmed these entity roles and both power sign conventions. Do not interrupt live wiring to check."));confirm.addEventListener("change",()=>{this.confirmed=confirm.checked;this.body.querySelector("[data-guide-next]").disabled=!this.compatible()||!this.confirmed;});this.body.append(label);
      }else{
        const summary=document.createElement("p");summary.textContent=`Ready to pass this display configuration to HA. Positive battery: ${this.draft.battery_positive}; positive grid: ${this.draft.grid_positive}. Existing optional mappings, ratings and appearance are preserved. The dashboard's own Save action still applies.`;this.body.append(summary);
        const capabilities=document.createElement("p");capabilities.textContent=`Mapping coverage: ${this.checks().filter(x=>["compatible","requires-confirmation"].includes(x.status)).length}/${SETUP_ROLES.length} required roles. Optional MPPT powers: ${[1,2,3].filter(i=>this.draft.entities[`pv${i}_power`]).length}/3; daily energy counters: ${["solar","grid","load","battery"].filter(k=>this.draft.entities[`${k}_today`]).length}/4. These are mapping counts, not verified Recorder/statistics availability.`;this.body.append(capabilities);
      }
    }
    const nav=document.createElement("div");nav.className="guide-actions";
    if(this.step>1)nav.append(this.button("Back","data-guide-back",()=>{this.step--;this.render();this.focusStep();}));
    if(this.step<3){const next=this.button("Next","data-guide-next",()=>{this.step++;this.render();this.focusStep();});next.disabled=this.step===2&&(!this.compatible()||!this.confirmed);nav.append(next);}
    else{const save=this.button("Save reviewed mappings","data-guide-save",()=>{if(this.compatible()&&this.confirmed)this.save(normalizeConfig(this.draft));});save.disabled=!this.compatible()||!this.confirmed;nav.append(save);}
    nav.append(this.button("Cancel draft","data-guide-cancel",()=>{this.configure(this.saved);this.focusStep();}));this.body.append(nav);
  }
  /** Moves focus to the new step heading so keyboard users retain context. */
  focusStep(){const p=this.body.querySelector("[data-guide-step]");p.tabIndex=-1;p.focus();}
}
