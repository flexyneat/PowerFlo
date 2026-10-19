/** @fileoverview Truthful numeric typography and gap-aware recorded chart geometry. */
import { CHART_GEOMETRY } from "./tokens.js";

/**
 * Separates a reading from its typographic unit without interpreting it as markup.
 * @param {number|null|undefined} value Actual numeric reading.
 * @param {string} unit Display unit.
 * @param {number} digits Decimal precision.
 * @returns {{number:string,unit:string}} Text-only presentation parts.
 */
export function readingParts(value, unit, digits = 1) {
  return Number.isFinite(value) ? { number: value.toFixed(digits), unit } : { number: "—", unit: "" };
}

/**
 * Projects an actual recorded point onto the shared padded chart scale.
 * @param {Object} point Actual observation.
 * @param {Object[]} points Complete series defining the y scale.
 * @param {{start:Date,end:Date}} range Fixed period boundaries.
 * @param {{min:number,max:number}} [scale] Cached shared extent for linear-time rendering.
 * @returns {{x:number,y:number}} Coordinates on a 100×36 SVG canvas.
 */
export function chartCoordinates(point, points, range, scale = chartScale(points)) {
  const { min, max } = scale;
  const span = Math.max(1e-9, max - min);
  return { x: (point.time - range.start.getTime()) / Math.max(1, range.end.getTime() - range.start.getTime()) * CHART_GEOMETRY.width,
    y: CHART_GEOMETRY.height - CHART_GEOMETRY.padding - (point.value - min) / span * (CHART_GEOMETRY.height - 2 * CHART_GEOMETRY.padding) };
}

/** @param {Object[]} points Actual observations. @returns {{min:number,max:number}} Shared extent. */
function chartScale(points) {
  let min = Infinity; let max = -Infinity;
  for (const sample of points) { min = Math.min(min, sample.value); max = Math.max(max, sample.value); }
  if (!points.length) { min = 0; max = 0; }
  return { min, max };
}

/**
 * Builds linear paths through recorded points, never inventing intermediate measurements.
 * @param {Object[]} points Ordered observations; breakBefore marks missing coverage.
 * @param {{start:Date,end:Date}} range Fixed local-period boundaries.
 * @param {Object[]} [scalePoints] Shared observations for current and optional reference y-axis.
 * @returns {{line:string,area:string}} Disjoint line/fill paths respecting missing intervals.
 */
export function chartPaths(points, range, scalePoints = points) {
  if (points.length < 2) return { line: "", area: "" };
  const segments = []; let segment = [];
  for (const point of points) {
    if (point.breakBefore && segment.length) { segments.push(segment); segment = []; }
    segment.push(point);
  }
  if (segment.length) segments.push(segment);
  const lines = []; const areas = [];
  const scale = chartScale(scalePoints);
  for (const group of segments) {
    if (group.length < 2) continue;
    const projected = group.map(point => chartCoordinates(point, points, range, scale));
    const line = projected.map((p, index) => `${index ? "L" : "M"}${p.x.toFixed(2)} ${p.y.toFixed(2)}`).join(" ");
    lines.push(line);
    areas.push(`${line} L${projected.at(-1).x.toFixed(2)} ${CHART_GEOMETRY.height} L${projected[0].x.toFixed(2)} ${CHART_GEOMETRY.height} Z`);
  }
  return { line: lines.join(" "), area: areas.join(" ") };
}
