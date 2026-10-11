/**
 * @fileoverview Original inline SVG icons used by the live topology.
 */

/**
 * Returns an accessible-hidden solar array icon.
 * @returns {string} Trusted static SVG markup.
 */
export function solarIcon() {
  return `<svg viewBox="0 0 64 64" aria-hidden="true"><g fill="none" stroke="currentColor" stroke-width="3" stroke-linejoin="round"><path d="M9 12h46l-5 35H14z"/><path d="M24 12 21 47M40 12l3 35M11 29h42M8 47h48M32 47v9"/></g></svg>`;
}

/**
 * Returns an accessible-hidden transmission tower icon.
 * @returns {string} Trusted static SVG markup.
 */
export function gridIcon() {
  return `<svg viewBox="0 0 64 64" aria-hidden="true"><g fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M32 7 19 57M32 7l13 50M14 57h36M20 22h24M16 33h32M23 45h18M24 22l8 8 8-8M21 34l11 9 11-9"/></g></svg>`;
}

/**
 * Returns an accessible-hidden protected-load icon.
 * @returns {string} Trusted static SVG markup.
 */
export function loadIcon() {
  return `<svg viewBox="0 0 64 64" aria-hidden="true"><g fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="m8 31 24-21 18 16M14 27v27h24M25 54V38h12"/><path d="M48 31c4 3 8 3 10 3v9c0 7-4 12-10 15-6-3-10-8-10-15v-9c2 0 6 0 10-3Z"/></g></svg>`;
}

/**
 * Returns an accessible-hidden paired Fidus-style cabinet icon.
 * @returns {string} Trusted static SVG markup.
 */
export function batteryBankIcon() {
  return `<svg viewBox="0 0 76 64" aria-hidden="true"><g fill="none" stroke="currentColor" stroke-width="2.4" stroke-linejoin="round"><path d="M6 7h28v51H6zM42 7h28v51H42zM4 58h32v4H4zM40 58h32v4H40z"/><path d="M10 15h20v9H10zM10 27h20v9H10zM10 39h20v9H10zM46 15h20v9H46zM46 27h20v9H46zM46 39h20v9H46z"/><path d="M18 11h5M54 11h5" class="status"/><path d="M34 54h8"/></g></svg>`;
}

/**
 * Returns a trusted static inverter fallback icon.
 * @returns {string} Trusted static SVG markup.
 */
export function inverterIcon() {
  return `<svg viewBox="0 0 80 96" aria-hidden="true"><g fill="none" stroke="currentColor" stroke-width="2.4" stroke-linejoin="round"><rect x="9" y="4" width="62" height="80" rx="5"/><rect x="29" y="34" width="22" height="15" rx="2"/><path d="M17 65h46M24 84v8M40 84v8M56 84v8"/></g></svg>`;
}
