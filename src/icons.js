/** @fileoverview Detailed inline vector topology icons, with no remote icon dependencies. */

/** @returns {string} Three-column solar array with panel and mounting detail. */
export function solarIcon() {
  return topologyIcon('M14 10h13L17 51H4ZM31 10h13L34 51H21ZM48 10h13L51 51H38Z', 'M14 10h13L17 51H4ZM31 10h13L34 51H21ZM48 10h13L51 51H38ZM11 24h13M7 38h13M28 24h13M24 38h13M45 24h13M41 38h13M24 55h16M32 55v6');
}

/** @returns {string} Transmission tower with lattice and insulator detail. */
export function gridIcon() {
  return topologyIcon('M32 5 17 58h30Z', 'M32 5 17 58M32 5l15 53M12 58h40M27 13h10M25 23h14M22 35h20M19 47h26M26 18 14 24h36L38 18M23 29 7 36h50L41 29M14 24v6M50 24v6M7 36v6M57 36v6M25 23l17 12M39 23 22 35M22 35l23 12M42 35 19 47M19 47l28 11M45 47 17 58');
}

/** @returns {string} Protected home with a separately colored shield. */
export function loadIcon() {
  return topologyIcon('M12 29 29 13l18 16v26H12ZM49 29l12 6v12c0 8-5 12-12 15-7-3-12-7-12-15V35Z', 'M5 32 29 10l24 22M12 26v29h26M23 55V39h12v16M39 18V8h8v17M49 29l12 6v12c0 8-5 12-12 15-7-3-12-7-12-15V35ZM44 44l4 4 7-9');
}

/** @returns {string} Three-module battery cabinet with status LEDs and translucent cell windows. */
export function batteryBankIcon() {
  return topologyIcon('M19 15h20v8H19ZM19 30h20v8H19ZM19 45h20v8H19Z', 'M12 8h40v51H12ZM16 8V4h32v4M12 25h40M12 41h40M9 59h46v3H9ZM19 15h20v8H19ZM19 30h20v8H19ZM19 45h20v8H19ZM44 17h4M44 32h4M44 47h4');
}

/**
 * Applies the shared optical frame and token-driven two-tone treatment to all topology icons.
 * @param {string} tone Trusted SVG fill geometry.
 * @param {string} lines Trusted SVG outline geometry.
 * @returns {string} Local decorative vector markup.
 */
function topologyIcon(tone, lines) {
  return `<svg viewBox="0 0 64 64" aria-hidden="true"><path class="icon-tone" d="${tone}"/><path class="icon-lines" d="${lines}"/></svg>`;
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
