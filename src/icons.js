/** @fileoverview Detailed inline vector topology icons, with no remote icon dependencies. */

/** @returns {string} Three-column solar array with panel and mounting detail. */
export function solarIcon() {
  return `<svg viewBox="0 0 120 120" aria-hidden="true"><g fill="none" stroke="currentColor" stroke-width="3" stroke-linejoin="round"><path d="M24 16h24L31 96H7zM56 16h24L63 96H39zM88 16h24L95 96H71z"/><path d="M18 42h24M13 69h24M50 42h24M45 69h24M82 42h24M77 69h24M47 100h24M59 97v17"/></g></svg>`;
}

/** @returns {string} Transmission tower with lattice and insulator detail. */
export function gridIcon() {
  return `<svg viewBox="0 0 120 140" aria-hidden="true"><g fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M60 9 25 128M60 9l35 119M17 128h86M49 21h22M43 43h34M37 66h46M31 92h58M46 31 26 44h68L74 31M41 54 14 69h92L79 54M26 44v11M94 44v11M14 69v11M106 69v11M43 44l34 22M77 44 43 66M37 66l46 26M83 66 37 92M31 92l58 36M89 92l-58 36"/></g></svg>`;
}

/** @returns {string} Protected home with a separately colored shield. */
export function loadIcon() {
  return `<svg viewBox="0 0 120 120" aria-hidden="true"><g fill="none" stroke="var(--pf-text)" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round"><path d="m8 57 48-43 40 35M17 51v55h59M43 106V75h24v31M75 28V12h14v28"/></g><path d="M92 53c9 7 18 8 23 9v21c0 16-8 28-23 34-15-6-23-18-23-34V62c5-1 14-2 23-9Z" fill="none" stroke="var(--pf-load)" stroke-width="3.2" stroke-linejoin="round"/></svg>`;
}

/** @returns {string} Three-module battery cabinet with status LEDs and translucent cell windows. */
export function batteryBankIcon() {
  return `<svg viewBox="0 0 110 140" aria-hidden="true"><g fill="none" stroke="var(--pf-text-muted)" stroke-width="2.5" stroke-linejoin="round"><path d="M10 10h88v120H10zM17 10V5h75v5M10 49h88M10 89h88M7 131h94v5H7z"/><path d="M16 20v18M16 60v18M16 100v18M23 25h48v17H23zM23 65h48v17H23zM23 105h48v17H23z"/></g><g fill="currentColor" fill-opacity=".65"><rect x="25" y="27" width="44" height="13" rx="2"/><rect x="25" y="67" width="44" height="13" rx="2"/><rect x="25" y="107" width="44" height="13" rx="2"/></g><g stroke="var(--pf-live)" stroke-width="2"><path d="M81 26h8M81 66h8M81 106h8"/></g></svg>`;
}

/**
 * Illustrates an estimate's state without relying on color or motion alone.
 * @param {string} status Ready, target, charging, warming, unavailable, or paused state.
 * @param {number|null} target SOC milestone, or null for runtime.
 * @returns {string} Trusted decorative battery and status-badge SVG.
 */
export function forecastIcon(status, target = null) {
  const level = target === null ? 0.5 : Math.max(0, Math.min(1, target / 100));
  if (status === "charging") return `<svg viewBox="0 0 48 48" aria-hidden="true"><g fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"><path d="M19 7V3h10v4M13 7h22v36H13Z"/><path d="m26 13-9 13h8l-3 12 11-16h-9Z"/></g></svg>`;
  if (status === "target" || status === "reserve") return `<svg viewBox="0 0 48 48" aria-hidden="true"><circle cx="24" cy="24" r="18" fill="none" stroke="currentColor" stroke-width="2"/><path d="m15 24 6 6 12-13" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
  if (status === "ready" || status === "warming") return `<svg viewBox="0 0 48 48" aria-hidden="true"><circle cx="24" cy="24" r="18" fill="none" stroke="var(--pf-border)" stroke-width="2"/><circle cx="24" cy="24" r="18" fill="none" stroke="currentColor" stroke-width="2" stroke-dasharray="${113.1 * level} 113.1" transform="rotate(-90 24 24)"/><path d="M24 14v11l7 4" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
  const fillHeight = 22 * level;
  const badges = {
    "solar-limited": '<circle cx="35" cy="35" r="5"/><path d="M35 25v-3M35 45v-3M25 35h-3M45 35h-3M28 28l-2-2M42 42l-2-2M42 28l2-2M26 42l2-2"/>',
    unavailable: '<circle cx="35" cy="35" r="9"/><path d="M35 29v7M35 40v1"/>',
  };
  const badge = badges[status] ?? '<circle cx="35" cy="35" r="9"/><path d="M32 31v8M38 31v8"/>';
  return `<svg viewBox="0 0 48 48" aria-hidden="true"><g fill="none" stroke="var(--pf-text-muted)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 7V3h10v4M9 7h20v35H9Z"/></g><rect x="13" y="${38 - fillHeight}" width="12" height="${fillHeight}" rx="1" fill="currentColor" fill-opacity=".35"/><g fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">${badge}</g></svg>`;
}
