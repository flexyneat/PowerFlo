/** @fileoverview Public gateway profile and documentation privacy/read-only release contracts. */
// @vitest-environment node
import {readFile} from "node:fs/promises";
import {describe,it,expect} from "vitest";
describe("Waveshare commissioning contract",()=>{
  it("distinguishes confirmed firmware identity from unvalidated register semantics",async()=>{
    // An identity screenshot must never silently select a scale or certify a register map.
    for(const file of ["README.md","waveshare-commissioning-guide.html","waveshare-readonly.yaml"]){
      const content=await readFile(new URL(`../${file}`,import.meta.url),"utf8");
      for(const identity of ["A028-1727","0000-C382","0201"])expect(content).toContain(identity);
      expect(content).toContain("Firmware identity confirmed");
      expect(content).toContain("register semantics awaiting live validation");
    }
  });
  it("keeps ESP32 UART direction control and excludes inverter writes/unsafe secret storage",async()=>{
    const yaml=await readFile(new URL("../waveshare-readonly.yaml",import.meta.url),"utf8");
    expect(yaml).toMatch(/tx_pin: GPIO17/);expect(yaml).toMatch(/rx_pin: GPIO18/);
    expect(yaml.slice(yaml.indexOf("\nuart:"),yaml.indexOf("\nmodbus:"))).toContain("flow_control_pin: GPIO21");
    expect(yaml.slice(yaml.indexOf("\nmodbus:"),yaml.indexOf("\nmodbus_controller:"))).not.toContain("flow_control_pin");
    expect(yaml).not.toMatch(/^(switch|number|select|button):/m);
    expect(yaml).not.toMatch(/write_register|write_multiple|on_client_disconnected|queue_command/);
    expect(yaml).toContain("key: !secret deye_gateway_api_key");
    expect(yaml).toContain("force_update: true");expect(yaml).toContain("last_battery_ms");expect(yaml).toContain("last_grid_ms");
    const guide=await readFile(new URL("../waveshare-commissioning-guide.html",import.meta.url),"utf8");
    expect(guide).toContain("exact-firmware");expect(guide).toContain("commissioning");
    // Use generic patterns: a privacy test must not itself commit a real device serial or personal identity.
    expect(guide).not.toMatch(/\/Users\/|[a-z0-9._%+-]+@yahoo\.[a-z.]+|\b\d{10}\b/i);
  });
  it("protects recovery Wi-Fi and local diagnostics without regular web firmware upload",async()=>{
    const yaml=await readFile(new URL("../waveshare-readonly.yaml",import.meta.url),"utf8");
    const wifi=yaml.slice(yaml.indexOf("\nwifi:"),yaml.indexOf("\napi:"));
    expect(wifi).toContain("ap_timeout: 90s");expect(wifi).toContain("password: !secret deye_gateway_ap_password");
    expect(yaml).toMatch(/^captive_portal:/m);
    const web=yaml.slice(yaml.indexOf("\nweb_server:"),yaml.indexOf("\nsafe_mode:"));
    for(const required of ["port: 80","version: 3","local: true","include_internal: false","log: false","ota: false","type: digest","username: !secret deye_gateway_web_username","password: !secret deye_gateway_web_password"])expect(web).toContain(required);
    expect(yaml).not.toMatch(/^\s*- platform: web_server/m);
    const secrets=await readFile(new URL("../secrets.example.yaml",import.meta.url),"utf8");
    for(const name of ["deye_gateway_ap_password","deye_gateway_web_username","deye_gateway_web_password"])expect(secrets).toContain(`${name}:`);
  });
  it("documents HTTP and recovery-portal upload risks and requires physical acceptance",async()=>{
    const guide=await readFile(new URL("../waveshare-commissioning-guide.html",import.meta.url),"utf8");
    for(const text of ["192.168.4.1","90 seconds","Digest","not HTTPS","captive portal","firmware upload","Not flashed","not explicitly restricted to the AP interface","bypasses web authentication"])expect(guide).toContain(text);
    expect(guide).not.toContain("no fallback access point and no web server");
  });
});
