/**
 * @fileoverview Immutable visual and motion tokens for PowerFlo.
 */

/**
 * Design tokens used by every PowerFlo component.
 * @type {Readonly<Record<string, string>>}
 */
export const TOKENS = Object.freeze({
  surface: "oklch(0.19 0.025 245)",
  surfaceRaised: "oklch(0.23 0.026 245)",
  surfaceSubtle: "oklch(0.215 0.022 245)",
  text: "oklch(0.96 0.008 245)",
  textMuted: "oklch(0.76 0.025 245)",
  border: "oklch(0.52 0.045 245 / 0.42)",
  borderStrong: "oklch(0.65 0.06 245 / 0.64)",
  solar: "oklch(0.82 0.17 82)",
  grid: "oklch(0.73 0.16 235)",
  battery: "oklch(0.72 0.17 305)",
  load: "oklch(0.78 0.18 150)",
  live: "oklch(0.79 0.2 148)",
  warning: "oklch(0.8 0.17 70)",
  fault: "oklch(0.67 0.22 28)",
  focus: "oklch(0.8 0.15 235)",
  space1: "0.25rem",
  space2: "0.5rem",
  space3: "0.75rem",
  space4: "1rem",
  space6: "1.5rem",
  space8: "2rem",
  radiusSm: "0.5rem",
  radiusMd: "0.75rem",
  radiusLg: "1rem",
  borderWidth: "0.0625rem",
  iconSm: "1.25rem",
  iconMd: "2rem",
  iconLg: "5rem",
  touch: "2.75rem",
  cardMinHeight: "34rem",
  labelSize: "0.75rem",
  bodySize: "0.875rem",
  valueSize: "clamp(1.45rem, 2.8cqi, 2.4rem)",
  titleSize: "clamp(1.25rem, 2.6cqi, 2rem)",
  durationInstant: "100ms",
  durationMicro: "200ms",
  durationStandard: "320ms",
  easeOut: "cubic-bezier(0.22, 1, 0.36, 1)",
  easeInOut: "cubic-bezier(0.65, 0, 0.35, 1)",
  particleSize: "0.4rem",
  lineWidth: "0.16rem",
  chartHeight: "3.1rem",
});

/**
 * Converts tokens into CSS custom properties scoped to the card.
 * @returns {string} CSS custom-property declarations.
 */
export function tokenDeclarations() {
  return Object.entries(TOKENS)
    .map(([key, value]) => `--pf-${key.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`)}:${value};`)
    .join("");
}
