/*
 * What an admin may set on somebody's day, and when they may still change it.
 *
 * Kept out of AttendanceHub so it can be imported without dragging a screen's
 * worth of component in - and because Fast Refresh only works for files that
 * export components alone.
 */

// The backend accepts exactly these five (attendance.controller's
// MANUAL_ATTENDANCE_STATUSES rejects anything else), so this list and that one
// have to stay in step.
export const MANUAL_ATTENDANCE_STATUS_OPTIONS = [
  { label: "Present", value: "PRESENT" },
  { label: "Half Day", value: "HALF_DAY" },
  { label: "Absent", value: "ABSENT" },
  { label: "Leave", value: "LEAVE" },
  // A weekly off on a day that is not the company's - works Sunday, off Tuesday.
  { label: "Week Off (WO)", value: "WEEK_OFF" },
];

/*
 * None is a day worked, so the server drops whatever check-in, check-out and
 * breaks the day had. Worth saying before somebody clicks Save on a day that
 * has them.
 */
const STATUSES_CLEARING_CHECK_IN = new Set(["ABSENT", "LEAVE", "WEEK_OFF"]);

export const statusClearsCheckIn = (status) =>
  STATUSES_CLEARING_CHECK_IN.has(String(status || "").toUpperCase());

const ATTENDANCE_SOURCE_MANUAL = "MANUAL";

/**
 * The value a row's status dropdown shows - "" for the "Set Status" prompt.
 *
 * Every row gets the dropdown, absent ones included. An absent row used to get
 * a one-click "Mark Present" instead, which hid Half Day and Leave on exactly
 * the rows that most often need one of them.
 *
 * A day nobody has touched comes back from the server as ABSENT, but nobody
 * chose that. Showing "Absent" in its dropdown would make it look the same as a
 * row an admin really did mark absent, so it shows the prompt. A row somebody
 * checked in on, or an admin set, shows its status when it is one on offer.
 */
export const manualStatusSelectValue = (attendance) => {
  const touched = Boolean(attendance?.checkInAt)
    || String(attendance?.source || "").toUpperCase() === ATTENDANCE_SOURCE_MANUAL;
  const status = String(attendance?.status || "").toUpperCase();
  return touched && MANUAL_ATTENDANCE_STATUS_OPTIONS.some((option) => option.value === status)
    ? status
    : "";
};

/**
 * Today as YYYY-MM-DD in the company's attendance timezone.
 *
 * The calendar lets a day be set up to and including today, and "today" is the
 * server's: the browser's own date can be a day out for somebody travelling,
 * and the attendance date keys are in the company's zone. en-CA formats as
 * YYYY-MM-DD. An unknown zone falls back to the browser's.
 */
export const todayDateKey = (timezone, now = new Date()) => {
  try {
    return new Intl.DateTimeFormat("en-CA", {
      timeZone: timezone || undefined,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(now);
  } catch {
    return new Intl.DateTimeFormat("en-CA", { year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
  }
};

/**
 * Whether a calendar day can have its status set: any day up to today.
 *
 * Correcting the past is the point. A future day is left alone - marking
 * somebody present in advance means nothing, and planned time off already has
 * its own route through a leave request.
 */
export const canSetAttendanceOnDate = (dateKey, todayKey) =>
  Boolean(dateKey) && Boolean(todayKey) && String(dateKey) <= String(todayKey);
