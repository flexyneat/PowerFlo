/** @fileoverview Transparent confidence heuristics and solar-aware, SOC-taper charge projections. */

/**
 * Grades observed-data quality, not a calibrated probability of ETA correctness.
 * @param {Object} rate Rate-estimator result.
 * @param {number} windowMs Configured averaging window.
 * @param {boolean} modeled Whether future taper/source assumptions are used.
 * @returns {{level: string, detail: string}} Explainable confidence label.
 */
export function estimateConfidence(rate, windowMs, modeled = false) {
  if (rate.status !== "ready") return { level: "Unavailable", detail: "Collect fresh continuous samples first" };
  const seconds = Math.round(rate.coverageMs / 1000);
  const age = Math.round(rate.ageMs / 1000);
  let level = rate.coverageMs >= windowMs * 0.8 && rate.sampleCount >= 3 && rate.variation < 0.15 && rate.ageMs <= 15_000 ? "High" :
    rate.coverageMs >= 60_000 && rate.variation < 0.35 && rate.ageMs <= 30_000 ? "Moderate" : "Limited";
  if (modeled && level === "High") level = "Moderate";
  return { level, detail: `${seconds}s observed · ${age}s sample age · ${Math.round(rate.variation * 100)}% rate variation${modeled ? " · Assumed taper and future solar" : ""}` };
}

/**
 * Evaluates an explicit, configurable linear taper assumption across the upper SOC band.
 * @param {number} soc SOC, percent.
 * @param {number} start Taper starting SOC.
 * @param {number} floor Minimum ratio at 100% SOC.
 * @returns {number} Relative charging-power ceiling.
 */
export function taperFactor(soc, start, floor) {
  return soc <= start ? 1 : Math.max(floor, 1 - (1 - floor) * (soc - start) / (100 - start));
}

/**
 * Projects charging to a milestone using current measured net power, source mix, and taper.
 * Solar is already in net charging power; only future reductions adjust that rate.
 * @param {Object} input Forecast assumptions and measurements.
 * @param {Object} input.rate Independent smoothed charging result.
 * @param {number} input.soc Current SOC.
 * @param {number} input.target Target SOC.
 * @param {number} input.capacityKwh Effective battery capacity.
 * @param {number | null} input.solarWatts Smoothed/observed solar production.
 * @param {number | null} input.gridImportWatts Nonnegative grid import.
 * @param {number | null} input.forecastSolarWatts Optional forecast average solar power.
 * @param {number} input.solarHours Horizon for assuming current/forecast solar supply.
 * @param {number} input.taperStart Assumed taper starting SOC.
 * @param {number} input.taperFloor Assumed ratio at 100%.
 * @returns {Object} Milestone forecast, or a clear lifecycle/solar-limited state.
 */
export function projectCharge({ rate, soc, target, capacityKwh, solarWatts, gridImportWatts,
  forecastSolarWatts = null, solarHours, taperStart, taperFloor }) {
  if (!Number.isFinite(soc) || soc < 0 || soc > 100 || !Number.isFinite(target) || target < 1 || target > 100)
    return { status: "unavailable" };
  if (rate.status === "unavailable") return { status: "unavailable" };
  if (soc >= target) return { status: "target" };
  if (rate.status !== "ready") return { status: rate.status };
  if (!Number.isFinite(rate.averageWatts) || rate.averageWatts <= 0) return { status: "unavailable" };
  if (![capacityKwh, solarHours, taperStart, taperFloor].every(Number.isFinite) || capacityKwh <= 0
    || solarHours < 0 || taperStart < 0 || taperStart >= 100 || taperFloor <= 0 || taperFloor > 1)
    return { status: "unavailable" };
  const pv = Number.isFinite(solarWatts) ? Math.max(0, solarWatts) : 0;
  const grid = Number.isFinite(gridImportWatts) ? Math.max(0, gridImportWatts) : 0;
  // Source proportions are an explicit approximation, not a claim to measure routed PV energy.
  const solarShare = pv + grid > 0 ? pv / (pv + grid) : 0;
  const futureRatio = pv > 0 && Number.isFinite(forecastSolarWatts) ? Math.max(0, Math.min(1, forecastSolarWatts / pv)) : 1;
  const initialFactor = taperFactor(soc, taperStart, taperFloor);
  let hours = 0;
  let cursor = soc;
  while (cursor < target) {
    const next = Math.min(target, cursor + 0.25);
    const taper = Math.min(1, taperFactor((cursor + next) / 2, taperStart, taperFloor) / initialFactor);
    const solarAvailable = hours < solarHours;
    const supplyRatio = 1 - solarShare + (solarAvailable ? solarShare * futureRatio : 0);
    const watts = rate.averageWatts * taper * supplyRatio;
    if (watts <= 1) return { status: "solar-limited", solarShare };
    const energy = capacityKwh * (next - cursor) / 100;
    const stepHours = energy / (watts / 1000);
    // Split the final daylight step so solar cannot spill past the stated horizon.
    if (solarAvailable && hours + stepHours > solarHours && solarShare > 0) {
      const daylightEnergy = Math.max(0, solarHours - hours) * watts / 1000;
      const nightWatts = rate.averageWatts * taper * (1 - solarShare);
      if (nightWatts <= 1) return { status: "solar-limited", solarShare };
      hours = solarHours + (energy - daylightEnergy) / (nightWatts / 1000);
    } else hours += stepHours;
    if (hours > 168) return { status: "solar-limited", solarShare };
    cursor = next;
  }
  return { status: "ready", hours, solarShare, solarHours, tapered: target > taperStart,
    modeled: true, basis: forecastSolarWatts === null ? "Current solar held to horizon" : "Forecast solar capped to current supply" };
}
