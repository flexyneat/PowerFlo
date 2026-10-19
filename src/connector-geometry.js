/** @fileoverview Image-safe orthogonal routes for reversible live power flows. */
import { FLOW_GEOMETRY } from "./tokens.js";

/**
 * Places the outage cross halfway along the clear horizontal grid lane, above the artwork.
 * @param {Object} canvas Topology rectangle.
 * @param {Object} inverter Visible artwork rectangle.
 * @param {Object} node Grid panel rectangle.
 * @returns {{x:number,y:number}} Position in the normalized SVG canvas.
 */
export function gridDisconnectPoint(canvas,inverter,node) {
  const portX=inverter.left+inverter.width*FLOW_GEOMETRY.rightPort;
  const endY=inverter.top-FLOW_GEOMETRY.arrowClearance;
  const laneY=Math.min(node.top+node.height*FLOW_GEOMETRY.sourceUpper,endY-FLOW_GEOMETRY.cornerRadius);
  return {x:((node.left+portX)/2-canvas.left)/canvas.width*FLOW_GEOMETRY.width,
    y:(laneY-canvas.top)/canvas.height*FLOW_GEOMETRY.height};
}

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
  if(!upper&&inverter.caption){
    // Lower flows approach the enclosure sides, not the caption underneath it.
    const endX=left?inverter.left-gap:inverter.right+gap;
    const sideY=inverter.bottom-inverter.height*FLOW_GEOMETRY.lowerSideInset;
    const laneX=left?Math.min(endX,inverter.caption.left-gap):Math.max(endX,inverter.caption.right+gap);
    const bend=Math.min(FLOW_GEOMETRY.cornerRadius,Math.abs(laneX-fromX)/2,Math.abs(fromY-sideY)/2,Math.abs(endX-laneX)/2);
    return `M${x(fromX)} ${y(fromY)} H${x(laneX-horizontalDirection*bend)} Q${x(laneX)} ${y(fromY)} ${x(laneX)} ${y(fromY-bend)} V${y(sideY+bend)} Q${x(laneX)} ${y(sideY)} ${x(laneX+horizontalDirection*bend)} ${y(sideY)} H${x(endX)}`;
  }
  return `M${x(fromX)} ${y(fromY)} H${x(portX - horizontalDirection * radius)} Q${x(portX)} ${y(fromY)} ${x(portX)} ${y(fromY + verticalDirection * radius)} V${y(endY)}`;
}
