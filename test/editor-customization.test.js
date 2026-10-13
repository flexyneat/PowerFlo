/** @fileoverview Integration-independent identity/nameplate fields in the native editor. */
import { describe, expect, it } from "vitest";
import { PowerFloEditor } from "../src/editor.js";

if (!customElements.get("test-system-editor")) customElements.define("test-system-editor",PowerFloEditor);
describe("system customization",()=>{
  it("exposes model, ratings, battery size and solar size and publishes validated changes",()=>{
    const editor=new PowerFloEditor(); editor.setConfig({inverter_model:"Model X",inverter_capacity_kw:8,battery_capacity_kwh:20,solar_capacity_kw:9.6});
    for (const key of ["inverter_name","inverter_model","inverter_capacity_kw","battery_capacity_kwh","solar_capacity_kw","image_upload"])
      expect(editor.shadowRoot.querySelector(`[data-path="${key}"]`)).not.toBeNull();
    let changed; editor.addEventListener("config-changed",event=>{changed=event.detail.config;});
    const input=editor.shadowRoot.querySelector('[data-path="solar_capacity_kw"]'); input.value="12.8";
    input.dispatchEvent(new Event("change",{bubbles:true}));
    expect(changed.solar_capacity_kw).toBe(12.8); expect(changed.inverter_model).toBe("Model X");
  });
});
