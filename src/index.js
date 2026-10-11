/**
 * @fileoverview PowerFlo custom-card registration entry point.
 */

import { PowerFloCard } from "./card.js";
import { PowerFloEditor } from "./editor.js";

if (!customElements.get("powerflo-card-editor")) customElements.define("powerflo-card-editor", PowerFloEditor);
if (!customElements.get("powerflo-card")) customElements.define("powerflo-card", PowerFloCard);

window.customCards = window.customCards ?? [];
window.customCards.push({
  type: "powerflo-card",
  name: "PowerFlo Card",
  description: "Live, read-only Deye inverter power flow with truthful direction and freshness.",
  preview: true,
  documentationURL: "https://github.com/flexyneat/PowerFlo",
});
