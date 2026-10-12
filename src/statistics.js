/** @fileoverview Read-only HA 2026.10 long-term energy statistics with explicit coverage. */
const ENERGY_UNITS = new Set(["Wh", "kWh", "MWh", "GWh", "J", "kJ", "MJ", "GJ"]);

/**
 * Fetches validated energy statistics and requests server conversion to kWh.
 * @param {Object} hass Authenticated frontend context exposing callWS.
 * @param {string[]} ids Statistic IDs, in caller-defined domain order.
 * @param {{start: Date, end: Date}} range Exact local-period boundaries.
 * @returns {Promise<Map<string, Object>>} Series and missing/invalid metadata states.
 */
export async function loadEnergyStatistics(hass, ids, range) {
  const unique = [...new Set(ids.filter(Boolean))];
  if (!unique.length) return new Map();
  if (typeof hass.callWS !== "function") throw new Error("Statistics WebSocket API unavailable");
  const metadata = await hass.callWS({ type: "recorder/get_statistics_metadata", statistic_ids: unique });
  const valid = new Set((Array.isArray(metadata) ? metadata : []).filter(m => m && m.has_sum === true
    && (m.unit_class === "energy" || ENERGY_UNITS.has(m.unit_of_measurement)
      || ENERGY_UNITS.has(m.statistics_unit_of_measurement))).map(m => m.statistic_id));
  const eligible = unique.filter(id => valid.has(id));
  const response = eligible.length ? await hass.callWS({ type: "recorder/statistics_during_period",
    start_time: range.start.toISOString(), end_time: range.end.toISOString(), statistic_ids: eligible,
    period: "hour", types: ["change"], units: { energy: "kWh" } }) : {};
  return new Map(unique.map(id => [id, valid.has(id) ? statisticsSeries(response?.[id], range) :
    { points: [], total: null, status: "missing", partial: true, end: null, message: "Choose an energy statistic with sum support" }]));
}

/**
 * Converts hourly change rows into cumulative energy without reconstructing sensor resets.
 * @param {unknown} rawRows HA statistics response rows (timestamps in milliseconds).
 * @param {{start: Date, end: Date}} range Requested boundaries.
 * @returns {Object} Numeric points, covered-hour total, and completeness state.
 */
export function statisticsSeries(rawRows, range) {
  const rows = (Array.isArray(rawRows) ? rawRows : []).filter(row => row && Number.isFinite(row.start)
    && Number.isFinite(row.end) && row.end > row.start).sort((a, b) => a.start - b.start);
  const points = [];
  let total = 0;
  let previousEnd = range.start.getTime();
  let partial = false;
  const seen = new Set();
  // Only completed whole hours are authoritative; never extrapolate the unfinished hour.
  const expectedEnd = Math.floor(range.end.getTime() / 3_600_000) * 3_600_000;
  for (const row of rows) {
    if (row.start < range.start.getTime() || row.end > expectedEnd || seen.has(row.start)) continue;
    seen.add(row.start);
    if (!Number.isFinite(row.change) || row.change < 0) { partial = true; continue; }
    if (row.start !== previousEnd) partial = true;
    if (!points.length) points.push({ time: row.start, value: 0 });
    total += row.change;
    points.push({ time: row.end, value: total });
    previousEnd = row.end;
  }
  if (previousEnd < expectedEnd) partial = true;
  return { points, total: points.length ? total : null, status: points.length ? "ready" : "empty",
    partial, end: points.at(-1)?.time ?? null, message: points.length ? "Long-term statistics" : "No completed energy statistics" };
}
