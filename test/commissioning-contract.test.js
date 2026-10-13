/** @fileoverview Public gateway profile and documentation privacy/read-only release contracts. */
// @vitest-environment node
import {readFile} from "node:fs/promises";
import {describe,it,expect} from "vitest";
describe("Waveshare commissioning contract",()=>{
  it("keeps ESP32 UART direction control and excludes inverter writes/unsafe secret storage",async()=>{
    const yaml=await readFile(new URL("../waveshare-readonly.yaml",import.meta.url),"utf8");
    expect(yaml).toMatch(/tx_pin: GPIO17/);expect(yaml).toMatch(/rx_pin: GPIO18/);
    expect(yaml.slice(yaml.indexOf("\nuart:"),yaml.indexOf("\nmodbus:"))).toContain("flow_control_pin: GPIO21");
    expect(yaml.slice(yaml.indexOf("\nmodbus:"),yaml.indexOf("\nmodbus_controller:"))).not.toContain("flow_control_pin");
    expect(yaml).not.toMatch(/^(switch|number|select|button|web_server):/m);
    expect(yaml).not.toMatch(/write_register|write_multiple|on_client_disconnected|queue_command/);
    expect(yaml).toContain("key: !secret deye_gateway_api_key");
    expect(yaml).toContain("force_update: true");expect(yaml).toContain("last_battery_ms");expect(yaml).toContain("last_grid_ms");
    const guide=await readFile(new URL("../waveshare-commissioning-guide.html",import.meta.url),"utf8");
    expect(guide).toContain("exact-firmware");expect(guide).toContain("commissioning");
    // Use generic patterns: a privacy test must not itself commit a real device serial or personal identity.
    expect(guide).not.toMatch(/\/Users\/|[a-z0-9._%+-]+@yahoo\.[a-z.]+|\b\d{10}\b/i);
  });
});
