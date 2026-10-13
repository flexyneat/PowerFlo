/** @fileoverview Demo-only outage scenarios and accessible system-first theme behavior. */
import { describe, expect, it, vi } from "vitest";
import { demoScenario, initializeTheme } from "../demo/controls.js";

describe("demo controls", () => {
  it("models an outage with fresh disconnected grid and battery-backed load", () => {
    expect(demoScenario("offgrid", "connected")).toMatchObject({freshness:"on",grid_connected:"off",grid_power:0,grid_voltage:0,grid_frequency:0,solar_power:0,pv1_power:0,pv2_power:0,pv3_power:0,battery_power:3000,load_power:3000});
  });
  it("restores connected readings and solar channels after an outage", () => {
    expect(demoScenario("charging", "connected")).toMatchObject({grid_connected:"on",grid_voltage:230.4,solar_power:4820,pv1_power:1620,battery_power:-2000});
    expect(demoScenario("static", "unknown")).toMatchObject({grid_connected:"unavailable",battery_power:0});
    expect(demoScenario("discharging", "stale")).toMatchObject({freshness:"off",battery_power:512});
  });
  it("follows the system initially, then only toggles light and dark", () => {
    const root=document.createElement("div"),button=document.createElement("button");
    button.innerHTML='<svg data-theme-icon="light"></svg><svg data-theme-icon="dark"></svg>';
    const media={matches:false,addEventListener:vi.fn()};
    initializeTheme(root,button,media);
    expect(root.dataset.themeMode).toBe("auto");expect(root.dataset.theme).toBe("light");
    expect(button.getAttribute("aria-label")).toBe("Switch to dark mode");
    media.matches=true;media.addEventListener.mock.calls[0][1]();
    expect(root.dataset.theme).toBe("dark");
    button.click();expect(root.dataset.themeMode).toBe("manual");expect(root.dataset.theme).toBe("light");
    media.addEventListener.mock.calls[0][1]();expect(root.dataset.theme).toBe("light");
    button.click();expect(root.dataset.theme).toBe("dark");
    expect(button.querySelector('[data-theme-icon="light"]').hasAttribute("hidden")).toBe(false);
    expect(button.querySelector('[data-theme-icon="dark"]').hasAttribute("hidden")).toBe(true);
    button.click();
    expect(button.querySelector('[data-theme-icon="dark"]').hasAttribute("hidden")).toBe(false);
    expect(button.querySelector('[data-theme-icon="light"]').hasAttribute("hidden")).toBe(true);
  });
});
