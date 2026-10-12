/** @fileoverview Non-interpolating shared chart inspection. */

/**
 * Finds the closest actual observation, preserving its timestamp and measurement.
 * @param {{time: number, value: number}[]} points Ordered recorded samples.
 * @param {number} time Requested cursor timestamp.
 * @returns {{time: number, value: number} | null} Closest recorded point.
 */
export function nearestObservation(points, time) {
  if (!points.length || !Number.isFinite(time)) return null;
  let low = 0;
  let high = points.length - 1;
  while (low < high) {
    const middle = Math.floor((low + high) / 2);
    if (points[middle].time < time) low = middle + 1;
    else high = middle;
  }
  const before = points[Math.max(0, low - 1)];
  const after = points[low];
  return Math.abs(before.time - time) <= Math.abs(after.time - time) ? before : after;
}
