/** @fileoverview Display and editor stylesheet entrypoints. */
import { BREAKPOINTS, tokenDeclarations } from "./tokens.js";
import { displayStyles } from "./display-styles.js";
import { phase1Styles } from "./phase1-styles.js";

/** @returns {string} Unified display stylesheet. */
export function cardStyles() { return displayStyles()+phase1Styles(); }

/**
 * Returns theme-aware visual editor styles.
 * @returns {string} Trusted scoped stylesheet.
 */
export function editorStyles() {
  return `:host{${tokenDeclarations()}display:block;color:var(--pf-text);font-family:var(--ha-font-family,system-ui,sans-serif)}*{box-sizing:border-box}.editor,fieldset{display:grid;gap:var(--pf-space3)}.editor{padding:var(--pf-space4)}fieldset{margin:0;padding:var(--pf-space4);border:var(--pf-border-width) solid var(--pf-border);border-radius:var(--pf-radius-md)}legend{font-weight:var(--pf-weight-medium)}.field{display:grid;grid-template-columns:1fr 1fr;gap:var(--pf-space3);align-items:center}input,select{min-height:var(--pf-touch);inline-size:100%;padding:var(--pf-space2);background:var(--card-background-color,Canvas);color:inherit;border:var(--pf-border-width) solid var(--pf-border);border-radius:var(--pf-radius-sm);font:inherit}input:focus-visible,select:focus-visible{outline:var(--pf-focus-width) solid var(--pf-focus);outline-offset:var(--pf-space1)}.hint{color:var(--pf-text-muted);font-size:var(--pf-label-size)}.error{color:var(--pf-fault)}@media(max-width:${BREAKPOINTS.narrow}){.field{grid-template-columns:1fr}}`;
}
