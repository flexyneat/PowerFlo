/**
 * @fileoverview Immutable visual and motion tokens for PowerFlo.
 */

/**
 * Design tokens used by every PowerFlo component.
 * @type {Readonly<Record<string, string>>}
 */
export const TOKENS = Object.freeze({
  // Transparent surfaces let the dashboard supply its own wallpaper or theme canvas.
  surface: "transparent",
  surfaceRaised: "transparent",
  surfaceSubtle: "transparent",
  elevation: "none",
  // Resolve theme colors at the token boundary so every nested label inherits them.
  text: "var(--primary-text-color, CanvasText)",
  textMuted: "var(--secondary-text-color, CanvasText)",
  border: "var(--divider-color, currentColor)",
  borderStrong: "var(--ha-card-border-color, var(--divider-color, currentColor))",
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
  forecastIconSize: "2.5rem",
  iconLg: "7rem",
  touch: "2.75rem",
  cardMinHeight: "34rem",
  labelSize: "0.75rem",
  bodySize: "0.875rem",
  valueSize: "clamp(1.8rem, 3.8cqi, 3.4rem)",
  titleSize: "clamp(1.5rem, 3cqi, 2.5rem)",
  durationInstant: "100ms",
  durationMicro: "200ms",
  durationStandard: "320ms",
  easeOut: "cubic-bezier(0.22, 1, 0.36, 1)",
  easeInOut: "cubic-bezier(0.65, 0, 0.35, 1)",
  particleSize: "0.4rem",
  lineWidth: "0.16rem",
  chevronWidth: "2.25",
  chartHeight: "3.1rem",
  chartPanelHeight: "11rem",
  chartLineWidth: "1.75",
  chartFillOpacity: "0.09",
  flowOpacity: "0.8",
  stoppedOpacity: "0.25",
  headingTracking: "-0.025em",
  microTracking: "0.06em",
  weightRegular: "450",
  weightMedium: "600",
  weightStrong: "750",
  lineHeightTight: "1.1",
  lineHeightBody: "1.4",
  inverterWidth: "12rem",
  artWidth: "22rem",
  topologyHeight: "30rem",
  socSize: "5.5rem",
  socStrokeWidth: "5",
  forecastSize: "clamp(1.15rem, 1.65cqi, 1.65rem)",
  forecastMinHeight: "8rem",
  periodValueSize: "clamp(1.2rem, 2cqi, 1.8rem)",
  focusWidth: "0.125rem",
  productInk: "oklch(0.21 0.015 240)",
  secondaryValueSize: "clamp(1.4rem, 2.6cqi, 2.4rem)",
  nodeTitleSize: "clamp(1rem, 1.6cqi, 1.4rem)",
  inverterNameSize: "clamp(1.2rem, 2.2cqi, 1.9rem)",
  inverterCaptionSize: "clamp(.7rem, .95cqi, .9rem)",
  productCopyTop: "calc(50% - var(--pf-art-width) * 0.33)",
  cursorWidth: "1",
});

/** Container-query breakpoints, separate from semantic CSS properties. */
export const BREAKPOINTS = Object.freeze({ compact: "58rem", narrow: "34rem" });

/** Normalized connector canvas and inverter attachment positions. */
export const FLOW_GEOMETRY = Object.freeze({ width: 1000, height: 600, arrowClearance: 8, cornerRadius: 18, leftPort: 0.3, rightPort: 0.7, sourceUpper: 0.28, sourceLower: 0.72 });

/** Measured nontransparent bounds of the bundled PNG; uploaded art uses its full box. */
export const DEFAULT_ART_BOUNDS = Object.freeze({ left: 144 / 1145, top: 140 / 1374, right: 1002 / 1145, bottom: 1251 / 1374 });

/**
 * Converts tokens into CSS custom properties scoped to the card.
 * @returns {string} CSS custom-property declarations.
 */
export function tokenDeclarations() {
  return Object.entries(TOKENS)
    .map(([key, value]) => `--pf-${key.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`)}:${value};`)
    .join("");
}
