/** @fileoverview Battery-side runtime estimation using bounded time-weighted samples. */

/** Minimum observed discharge interval before displaying an estimate. */
const MINIMUM_COVERAGE_MS = 30_000;

/**
 * @typedef {{status: "ready", hours: number, averageWatts: number, coverageMs: number} |
 * {status: "warming" | "charging" | "static" | "unavailable" | "reserve"}} RuntimeEstimate
 */

/** Rolling estimator for a continuous, fresh discharge session. */
export class BatteryRuntimeEstimator {
  /** Creates an empty sampling window. */
  constructor() {
    this.samples = [];
  }

  /** Discards history when the discharge session or configuration changes. */
  reset() {
    this.samples = [];
  }

  /**
   * Observes one battery sample and estimates time to the configured reserve.
   * @param {Object} input Normalized battery-domain observation.
   * @param {number} input.now Current epoch milliseconds.
   * @param {number} input.sampleTime Power entity last_updated, epoch milliseconds.
   * @param {number | null} input.power Battery-side discharge magnitude in W.
   * @param {number | null} input.soc Current SOC, percent.
   * @param {string} input.mode Derived battery mode.
   * @param {boolean} input.fresh Whether the gateway reports fresh telemetry.
   * @param {number} input.capacityKwh Installed effective capacity in kWh.
   * @param {number} input.reserveSoc Estimate stopping point, percent.
   * @param {number} input.windowMs Rolling averaging window.
   * @param {number} input.maxAgeMs Maximum allowed sample age or observation gap.
   * @returns {RuntimeEstimate} Explicit estimate lifecycle state.
   */
  observe({ now, sampleTime, power, soc, mode, fresh, capacityKwh, reserveSoc, windowMs, maxAgeMs }) {
    const valid = fresh && Number.isFinite(now) && Number.isFinite(sampleTime)
      && sampleTime <= now && now - sampleTime <= maxAgeMs
      && Number.isFinite(soc) && soc >= 0 && soc <= 100
      && Number.isFinite(power) && Number.isFinite(capacityKwh) && capacityKwh > 0
      && Number.isFinite(reserveSoc) && reserveSoc >= 0 && reserveSoc <= 100
      && Number.isFinite(windowMs) && windowMs >= MINIMUM_COVERAGE_MS
      && Number.isFinite(maxAgeMs) && maxAgeMs > 0;
    if (!valid || mode === "unavailable") {
      this.reset();
      return { status: "unavailable" };
    }
    if (mode === "charging" || mode === "static") {
      this.reset();
      return { status: mode };
    }
    if (mode !== "discharging" || power <= 0) {
      this.reset();
      return { status: "unavailable" };
    }
    if (soc <= reserveSoc) {
      this.reset();
      return { status: "reserve" };
    }
    let last = this.samples.at(-1);
    // A gap or clock reversal ends the session; never integrate across an outage in telemetry.
    if (last && (sampleTime < last.time || sampleTime - last.time > maxAgeMs)) {
      this.reset();
      last = undefined;
    }
    if (!last || sampleTime > last.time) this.samples.push({ time: sampleTime, watts: power });
    const start = now - windowMs;
    // Keep the sample spanning the left boundary so partial intervals retain their correct weight.
    while (this.samples.length > 1 && this.samples[1].time <= start) this.samples.shift();
    let weightedWattsMs = 0;
    let coverageMs = 0;
    for (let index = 0; index < this.samples.length; index += 1) {
      const sample = this.samples[index];
      const from = Math.max(start, sample.time);
      const to = this.samples[index + 1]?.time ?? now;
      const duration = Math.max(0, to - from);
      weightedWattsMs += sample.watts * duration;
      coverageMs += duration;
    }
    if (coverageMs < MINIMUM_COVERAGE_MS) return { status: "warming" };
    const averageWatts = weightedWattsMs / coverageMs;
    const remainingKwh = capacityKwh * (soc - reserveSoc) / 100;
    return { status: "ready", hours: remainingKwh / (averageWatts / 1000), averageWatts, coverageMs };
  }
}

/**
 * Formats an estimated duration to whole minutes without infinity or negative times.
 * @param {number} hours Estimated hours.
 * @returns {string} Human-readable approximate duration.
 */
export function formatRuntime(hours) {
  if (!Number.isFinite(hours) || hours < 0) return "Unavailable";
  const minutes = Math.floor(hours * 60);
  if (minutes < 1) return "Less than 1 min";
  return `${Math.floor(minutes / 60)} h ${minutes % 60} min`;
}
