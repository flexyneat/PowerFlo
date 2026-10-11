/**
 * @fileoverview Recorder-history loading and SVG sparkline geometry.
 */

/**
 * @typedef {Object} HistoryPoint
 * @property {number} time Epoch milliseconds.
 * @property {number} value Numeric entity value.
 */

/**
 * Finds local midnight in the Home Assistant timezone.
 * @param {Date} now Current timestamp.
 * @param {string} timeZone IANA timezone from Home Assistant.
 * @returns {Date} Midnight represented as a Date.
 */
export function startOfDay(now, timeZone) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  const values = Object.fromEntries(parts.map(({ type, value }) => [type, value]));
  const desiredUtcShape = Date.UTC(Number(values.year), Number(values.month) - 1, Number(values.day), 0, 0, 0);
  let candidate = desiredUtcShape;
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  });
  // Two corrections handle timezones whose UTC offset changes around the target date.
  for (let pass = 0; pass < 2; pass += 1) {
    const observed = Object.fromEntries(formatter.formatToParts(new Date(candidate)).map(({ type, value }) => [type, value]));
    const observedUtcShape = Date.UTC(Number(observed.year), Number(observed.month) - 1, Number(observed.day), Number(observed.hour), Number(observed.minute), Number(observed.second));
    candidate += desiredUtcShape - observedUtcShape;
  }
  return new Date(candidate);
}

/**
 * Builds the documented Recorder history API path.
 * @param {string[]} entityIds Entity IDs to load.
 * @param {Date} start Start time.
 * @param {Date} end End time.
 * @returns {string} Relative Home Assistant API path.
 */
export function historyPath(entityIds, start, end) {
  const encodedStart = encodeURIComponent(start.toISOString());
  const query = new URLSearchParams({
    filter_entity_id: entityIds.join(","),
    end_time: end.toISOString(),
    minimal_response: "",
    no_attributes: "",
  });
  return `history/period/${encodedStart}?${query.toString()}`;
}

/**
 * Parses Home Assistant history response rows into numeric points.
 * @param {Array<Array<{entity_id?: string; state?: string; last_changed?: string; last_updated?: string}>>} rows API rows.
 * @returns {Map<string, HistoryPoint[]>} Entity history by entity ID.
 */
export function parseHistory(rows) {
  const result = new Map();
  for (const series of rows) {
    let entityId = series.find((item) => item.entity_id)?.entity_id;
    if (!entityId) continue;
    const points = [];
    for (const item of series) {
      entityId = item.entity_id ?? entityId;
      const value = Number(item.state);
      const timestamp = Date.parse(item.last_updated ?? item.last_changed ?? "");
      if (Number.isFinite(value) && Number.isFinite(timestamp)) points.push({ time: timestamp, value });
    }
    result.set(entityId, points);
  }
  return result;
}

/**
 * Appends a live value to Recorder history without flooding the sparkline.
 * @param {HistoryPoint[]} points Existing chronological points.
 * @param {HistoryPoint} point Current entity value.
 * @param {number} minimumIntervalMs Minimum interval for unchanged values.
 * @param {number} maximumPoints Hard memory cap before rendering downsampling.
 * @returns {HistoryPoint[]} Updated chronological points.
 */
export function appendHistoryPoint(points, point, minimumIntervalMs = 5_000, maximumPoints = 2_000) {
  if (!Number.isFinite(point.time) || !Number.isFinite(point.value)) return [...points];
  const output = [...points];
  const last = output.at(-1);
  if (last && point.time < last.time) return output;
  if (last && point.time === last.time) {
    output[output.length - 1] = point;
    return output;
  }
  // Retain state changes immediately while suppressing identical high-frequency samples.
  if (last && point.value === last.value && point.time - last.time < minimumIntervalMs) return output;
  output.push(point);
  return output.slice(-maximumPoints);
}

/**
 * Downsamples points into time buckets while preserving first and last samples.
 * @param {HistoryPoint[]} points Raw points.
 * @param {number} targetCount Desired maximum point count.
 * @returns {HistoryPoint[]} Downsampled points.
 */
export function downsample(points, targetCount) {
  if (points.length <= targetCount || targetCount < 3) return [...points];
  const output = [points[0]];
  const bucketSize = (points.length - 2) / (targetCount - 2);
  for (let index = 0; index < targetCount - 2; index += 1) {
    const start = Math.floor(1 + index * bucketSize);
    const end = Math.min(points.length - 1, Math.floor(1 + (index + 1) * bucketSize));
    const bucket = points.slice(start, Math.max(start + 1, end));
    const representative = bucket.reduce((best, point) => point.value > best.value ? point : best, bucket[0]);
    output.push(representative);
  }
  output.push(points.at(-1));
  return output;
}

/**
 * Converts points into an SVG path within a normalized view box.
 * @param {HistoryPoint[]} points Numeric points.
 * @param {number} width View-box width.
 * @param {number} height View-box height.
 * @returns {string} SVG path data or an empty string.
 */
export function sparklinePath(points, width = 100, height = 36) {
  if (points.length < 2) return "";
  const times = points.map((point) => point.time);
  const values = points.map((point) => point.value);
  const minTime = Math.min(...times);
  const maxTime = Math.max(...times);
  const minValue = Math.min(...values);
  const maxValue = Math.max(...values);
  const timeSpan = Math.max(1, maxTime - minTime);
  const valueSpan = Math.max(1e-9, maxValue - minValue);
  return points.map((point, index) => {
    const x = ((point.time - minTime) / timeSpan) * width;
    const y = height - ((point.value - minValue) / valueSpan) * height;
    return `${index === 0 ? "M" : "L"}${x.toFixed(2)} ${y.toFixed(2)}`;
  }).join(" ");
}

/**
 * Loads today's history for configured entities using Home Assistant authentication.
 * @param {{callApi: (method: string, path: string) => Promise<unknown>; config: {time_zone?: string}}} hass Home Assistant object.
 * @param {string[]} entityIds Entity IDs.
 * @param {Date} [now] Current time.
 * @returns {Promise<Map<string, HistoryPoint[]>>} Parsed history.
 */
export async function loadTodayHistory(hass, entityIds, now = new Date()) {
  const filtered = [...new Set(entityIds.filter(Boolean))];
  if (!filtered.length) return new Map();
  const start = startOfDay(now, hass.config.time_zone ?? Intl.DateTimeFormat().resolvedOptions().timeZone);
  const response = await hass.callApi("get", historyPath(filtered, start, now));
  return parseHistory(Array.isArray(response) ? response : []);
}
