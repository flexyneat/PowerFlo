/** @fileoverview Image-safe orthogonal routes for reversible live power flows. */
import { FLOW_GEOMETRY } from "./tokens.js";

/**
 * Routes a rounded connector outside the visible art, with clearance for small chevrons.
 * @param {Object} canvas Topology client rectangle.
 * @param {Object} inverter Image client rectangle.
 * @param {Object} node Source panel client rectangle.
 * @param {string} name Solar, grid, battery, or load domain.
 * @returns {string} Normalized SVG path with a clear terminal arrowhead.
 */
export function connectorPath(canvas, inverter, node, name) {
  const left = name === "solar" || name === "battery";
  const upper = name === "solar" || name === "grid";
  const gap = FLOW_GEOMETRY.arrowClearance;
  const fromX = left ? node.right : node.left;
  const anchorY = node.top + node.height * (upper ? FLOW_GEOMETRY.sourceUpper : FLOW_GEOMETRY.sourceLower);
  const portX = inverter.left + inverter.width * (left ? FLOW_GEOMETRY.leftPort : FLOW_GEOMETRY.rightPort);
  const endY = upper ? inverter.top - gap : inverter.bottom + gap;
  // Align the horizontal lane outside the image, leaving a short, visible final approach.
  // Clamping the panel-side anchor avoids extra doglegs when the image overlaps its height.
  const fromY = upper ? Math.min(anchorY, endY - FLOW_GEOMETRY.cornerRadius) : Math.max(anchorY, endY + FLOW_GEOMETRY.cornerRadius);
  const horizontalDirection = left ? 1 : -1;
  const verticalDirection = upper ? 1 : -1;
  const radius = Math.min(FLOW_GEOMETRY.cornerRadius, Math.abs(portX - fromX) / 2, Math.abs(endY - fromY) / 2);
  const x = value => (value - canvas.left) / canvas.width * FLOW_GEOMETRY.width;
  const y = value => (value - canvas.top) / canvas.height * FLOW_GEOMETRY.height;
  return `M${x(fromX)} ${y(fromY)} H${x(portX - horizontalDirection * radius)} Q${x(portX)} ${y(fromY)} ${x(portX)} ${y(fromY + verticalDirection * radius)} V${y(endY)}`;
}
