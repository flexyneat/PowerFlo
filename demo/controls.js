/** @fileoverview Demo-only controls; never changes inverter or Home Assistant settings. */

/**
 * Returns simulated instantaneous readings for a battery/grid scenario.
 * @param {string} mode Charging, discharging, static or offgrid.
 * @param {string} grid Connected, disconnected, unknown or stale.
 * @returns {Object} Fresh fixture values; Off-Grid overrides the grid selection.
 */
export function demoScenario(mode,grid) {
  const outage=mode==="offgrid",disconnected=outage||grid==="disconnected";
  const solar=mode==="discharging"||outage ? 0 : 4820;
  return {freshness:outage||grid!=="stale" ? "on" : "off",
    grid_connected:disconnected ? "off" : grid==="unknown" ? "unavailable" : "on",
    grid_power:disconnected ? 0 : 240,grid_voltage:disconnected ? 0 : 230.4,grid_frequency:disconnected ? 0 : 50,
    solar_power:solar,pv1_power:solar ? 1620 : 0,pv2_power:solar ? 1580 : 0,pv3_power:solar ? 1620 : 0,
    battery_power:outage ? 3000 : mode==="charging" ? -2000 : mode==="discharging" ? 512 : 0,
    load_power:3000};
}

/**
 * Follows system appearance until the user explicitly toggles light/dark.
 * @param {HTMLElement} root Theme variable host.
 * @param {HTMLButtonElement} button Native, keyboard-operable toggle.
 * @param {MediaQueryList} media System dark-mode preference.
 * @returns {void}
 */
export function initializeTheme(root,button,media) {
  root.dataset.themeMode="auto";
  /** Synchronizes appearance and describes the next button action, not an ambiguous current state. */
  function sync() {
    if(root.dataset.themeMode==="auto") root.dataset.theme=media.matches ? "dark" : "light";
    const next=root.dataset.theme==="dark" ? "light" : "dark";
    const label=`Switch to ${next} mode`;
    button.setAttribute("aria-label",label);button.title=label;
    // SVG is not HTMLElement: update the actual attribute consumed by CSS, not an expando property.
    for(const icon of button.querySelectorAll("[data-theme-icon]")) icon.toggleAttribute("hidden",icon.dataset.themeIcon!==next);
  }
  media.addEventListener("change",sync);
  button.addEventListener("click",()=>{
    // Once selected, subsequent system changes must not override the user's choice.
    root.dataset.themeMode="manual";
    root.dataset.theme=root.dataset.theme==="dark" ? "light" : "dark";
    sync();
  });
  sync();
}
