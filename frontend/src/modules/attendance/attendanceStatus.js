/*
 * What an admin may set on somebody's day, and when they may still change it.
 *
 * Kept out of AttendanceHub so it can be imported without dragging a screen's
 * worth of component in - and because Fast Refresh only works for files that
 * export components alone.
 */

// The backend accepts exactly these three (attendance.controller rejects
// anything else with "status must be PRESENT, HALF_DAY, or ABSENT"), so this
// list and that check have to stay in step.
export const MANUAL_ATTENDANCE_STATUS_OPTIONS = [
  { label: "Present", value: "PRESENT" },
  { label: "Half Day", value: "HALF_DAY" },
  { label: "Absent", value: "ABSENT" },
];

const ATTENDANCE_SOURCE_MANUAL = "MANUAL";

/**
 * Whether this row's status can still be changed from the dropdown.
 *
 * Checking in is not the only way a row acquires a status: an admin can set one
 * on somebody who never checked in at all. Gating the control on checkInAt
 * alone left exactly those rows offering "Mark Present" for ever, with no way
 * back - so a status set by mistake could not be corrected, which is the case
 * where being able to correct it matters most.
 *
 * A row nobody has touched keeps the one-click shortcut instead: a dropdown is
 * the wrong control when there is only one sensible thing to do.
 */
export const canEditAttendanceStatus = (attendance) => Boolean(attendance?.checkInAt)
  || String(attendance?.source || "").toUpperCase() === ATTENDANCE_SOURCE_MANUAL;
