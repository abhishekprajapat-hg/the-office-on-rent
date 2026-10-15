import type { AttendanceDay } from "../api/types";

/*
 * What an admin or manager may set on somebody's day. The server accepts
 * exactly these five (attendance.controller MANUAL_ATTENDANCE_STATUSES);
 * keep the two lists in step, as web's attendanceStatus.js does.
 */
export const MANUAL_STATUSES = [
  { key: "PRESENT", label: "Present" },
  { key: "HALF_DAY", label: "Half day" },
  { key: "ABSENT", label: "Absent" },
  { key: "LEAVE", label: "Leave" },
  { key: "WEEK_OFF", label: "Week off" },
] as const;

/* None of these is a day worked, so the server drops the day's check-in, check-out and breaks. */
const CLEARS_CHECK_IN = new Set(["ABSENT", "LEAVE", "WEEK_OFF"]);
export const statusClearsCheckIn = (status?: string) => CLEARS_CHECK_IN.has(String(status || "").toUpperCase());

/* Any day up to today can be corrected; a future day is left to leave requests. Keys are YYYY-MM-DD. */
export const canSetStatusOn = (dateKey?: string, todayKey?: string) => Boolean(dateKey) && Boolean(todayKey) && String(dateKey) <= String(todayKey);

/* A day covered by an approved leave request comes back with a synthetic "leave:" id. */
export const isLeaveRequestDay = (day?: AttendanceDay | null) => String(day?._id || "").startsWith("leave:");

/* Breaks can only be corrected on a day with a check-in (server rule). */
export const canCorrectBreaks = (day?: AttendanceDay | null) => Boolean(day?.checkInAt);

/* Start/end a break as of now: checked in today, not checked out. */
export const canManageBreakNow = (day?: AttendanceDay | null) => Boolean(day?.checkInAt) && !day?.checkOutAt;

/* Today's date key in a timezone (en-CA formats YYYY-MM-DD); an unknown zone falls back to the device's. */
export const todayKeyIn = (timezone?: string, now = new Date()) => {
  try {
    return new Intl.DateTimeFormat("en-CA", { timeZone: timezone || undefined, year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
  } catch {
    return new Intl.DateTimeFormat("en-CA", { year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
  }
};

/* A time of day picked on a phone, placed on the attendance date (device calendar). */
export const atTimeOn = (dateKey: string, time: Date) => {
  const [y, m, d] = dateKey.split("-").map(Number);
  return new Date(y!, m! - 1, d!, time.getHours(), time.getMinutes(), 0, 0);
};

export type TeamFilter = "all" | "in" | "break" | "out" | "absent" | "leave";

/* Which bucket of the team day a row falls in (web AttendanceHub status filter). */
export const teamBucket = (day: (AttendanceDay & { isOnBreak?: boolean }) | null | undefined): Exclude<TeamFilter, "all"> => {
  const status = String(day?.status || "").toUpperCase();
  if (status === "LEAVE" || status === "ON_LEAVE" || status === "WEEK_OFF") return "leave";
  if (day?.checkInAt && !day.checkOutAt) return day.isOnBreak ? "break" : "in";
  if (day?.checkOutAt) return "out";
  if (status === "PRESENT" || status === "HALF_DAY") return "out";
  return "absent";
};
