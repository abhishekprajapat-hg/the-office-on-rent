/*
 * Reading a date-time a person typed, in the timezone they typed it in.
 *
 * A browser's <input type="datetime-local"> hands over "2026-10-12T12:00" -
 * a wall-clock time with no zone. `new Date()` reads a string like that in the
 * timezone of whatever machine runs it. On a developer's laptop in India that
 * is IST and everything looks right; on the VPS, which runs in UTC, the same
 * 12:00 became 12:00 UTC and showed back to the user as 5:30 PM. So a string
 * without a zone is read in the company's timezone instead, explicitly.
 *
 * Anything that already says where it is - an ISO string ending in Z or an
 * offset, a Date, a timestamp - is taken as it is: it is unambiguous.
 */

const DEFAULT_TIMEZONE = String(
  process.env.LEAD_TIMEZONE || process.env.ATTENDANCE_TIMEZONE || "Asia/Kolkata",
).trim() || "Asia/Kolkata";

// "YYYY-MM-DDTHH:mm", optional seconds and fraction, "T" or a space, and no zone.
const ZONELESS_DATE_TIME = /^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})(?::(\d{2})(?:\.(\d{1,3})\d*)?)?$/;

/** Milliseconds the zone is ahead of UTC at `instant`. */
const zoneOffsetMs = (instant, timeZone) => {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(instant);
  const get = (type) => Number(parts.find((part) => part.type === type)?.value);
  const asUtc = Date.UTC(get("year"), get("month") - 1, get("day"), get("hour"), get("minute"), get("second"));
  return asUtc - (instant.getTime() - instant.getMilliseconds());
};

/**
 * @param {*} value what the client sent
 * @param {string} [timeZone] the zone a zone-less wall-clock time is in
 * @returns {Date|null} null for empty input; an Invalid Date for garbage, so
 *   callers keep their existing "is this a valid date" checks
 */
const parseZonedDateInput = (value, timeZone = DEFAULT_TIMEZONE) => {
  if (value === undefined || value === null || value === "") return null;
  if (value instanceof Date) return value;
  if (typeof value === "number") return new Date(value);

  const text = String(value).trim();
  const match = ZONELESS_DATE_TIME.exec(text);
  if (!match) return new Date(text);

  const [, y, mo, d, h, mi, s = "0", ms = "0"] = match;
  const wallClockAsUtc = Date.UTC(Number(y), Number(mo) - 1, Number(d), Number(h), Number(mi), Number(s), Number(ms.padEnd(3, "0")));

  let zone = timeZone;
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: zone });
  } catch {
    zone = DEFAULT_TIMEZONE;
  }

  // Shift by the zone's offset, then once more with the offset at the result:
  // the second pass is what keeps a time near a DST change correct.
  let result = wallClockAsUtc - zoneOffsetMs(new Date(wallClockAsUtc), zone);
  result = wallClockAsUtc - zoneOffsetMs(new Date(result), zone);
  return new Date(result);
};

module.exports = { parseZonedDateInput, DEFAULT_TIMEZONE };
