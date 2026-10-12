/** @fileoverview Local-calendar periods and daily-reset energy history reconstruction. */
import { historyPath, parseHistory, startOfDay } from "./history.js";

/** @typedef {"today" | "week" | "month"} HistoryPeriod */

/**
 * Extracts local calendar components without using the browser timezone.
 * @param {Date} date Instant.
 * @param {string} timeZone Home Assistant timezone.
 * @returns {{year: number, month: number, day: number}} Local calendar date.
 */
function calendarDate(date, timeZone) {
  const parts = Object.fromEntries(new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" })
    .formatToParts(date).map(({ type, value }) => [type, value]));
  return { year: Number(parts.year), month: Number(parts.month), day: Number(parts.day) };
}

/**
 * Finds midnight for a specific local date, accounting for offset changes.
 * @param {number} shape UTC milliseconds encoding the requested calendar date.
 * @param {string} timeZone IANA timezone.
 * @returns {Date} Local midnight instant.
 */
function midnight(shape, timeZone) {
  let candidate = shape;
  const formatter = new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23" });
  for (let pass = 0; pass < 3; pass += 1) {
    const p = Object.fromEntries(formatter.formatToParts(new Date(candidate)).map(({ type, value }) => [type, value]));
    candidate += shape - Date.UTC(Number(p.year), Number(p.month) - 1, Number(p.day), Number(p.hour), Number(p.minute), Number(p.second));
  }
  return new Date(candidate);
}

/**
 * Defines Today, last seven local calendar days, or current month to date.
 * @param {HistoryPeriod} period Selected period.
 * @param {Date} now Current instant.
 * @param {string} timeZone Home Assistant timezone.
 * @returns {{start: Date, end: Date, expectedDays: number}} Period boundaries.
 */
export function periodRange(period, now, timeZone) {
  const { year, month, day } = calendarDate(now, timeZone);
  const shape = Date.UTC(year, month - 1, period === "month" ? 1 : period === "week" ? day - 6 : day);
  return { start: period === "today" ? startOfDay(now, timeZone) : midnight(shape, timeZone), end: now,
    expectedDays: period === "week" ? 7 : period === "month" ? day : 1 };
}

/**
 * Loads only mapped daily-energy counters for one period.
 * @param {Object} hass Authenticated Home Assistant frontend.
 * @param {string[]} ids Entity IDs.
 * @param {{start: Date, end: Date}} range Selected boundaries.
 * @returns {Promise<Map<string, import('./history.js').HistoryPoint[]>>} Recorder samples.
 */
export async function loadPeriodHistory(hass, ids, range) {
  const filtered = [...new Set(ids.filter(Boolean))];
  if (!filtered.length) return new Map();
  const response = await hass.callApi("get", historyPath(filtered, range.start, range.end));
  return parseHistory(Array.isArray(response) ? response : []);
}

/**
 * Reconstructs recorded cumulative energy by summing observed daily maxima.
 * @param {import('./history.js').HistoryPoint[]} input Daily-reset counter samples.
 * @param {{start: Date, end: Date, expectedDays: number}} range Period boundaries.
 * @param {string} timeZone Home Assistant timezone.
 * @returns {{points: import('./history.js').HistoryPoint[], total: number | null, partial: boolean, days: number}} Observed energy and coverage.
 */
export function periodEnergy(input, range, timeZone) {
  const formatter = new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" });
  const samples = input.filter(p => Number.isFinite(p.time) && Number.isFinite(p.value) && p.value >= 0
    && p.time >= range.start.getTime() && p.time <= range.end.getTime()).sort((a, b) => a.time - b.time);
  const daily = new Map();
  const points = [];
  let completed = 0;
  let previousDay = "";
  for (const sample of samples) {
    const day = formatter.format(new Date(sample.time));
    if (previousDay && day !== previousDay) completed += daily.get(previousDay);
    const maximum = Math.max(daily.get(day) ?? 0, sample.value);
    daily.set(day, maximum);
    points.push({ time: sample.time, value: completed + maximum });
    previousDay = day;
  }
  return { points, total: points.at(-1)?.value ?? null, partial: daily.size < range.expectedDays,
    days: daily.size };
}
