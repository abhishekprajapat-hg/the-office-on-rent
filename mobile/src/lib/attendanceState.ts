import type { AttendanceDay } from "../api/types";
import type { Tone } from "../theme/tokens";

export type DayPhase = "not_started" | "working" | "on_break" | "done";

/* Where today's attendance stands, from the record /attendance/me returns. */
export const dayPhase = (today: AttendanceDay | null | undefined): DayPhase => {
  if (!today?.checkInAt) return "not_started";
  if (today.checkOutAt) return "done";
  const openBreak = (today.breakSessions || []).some((session) => session.startAt && !session.endAt);
  return today.isOnBreak || today.activeBreakStartedAt || openBreak ? "on_break" : "working";
};

/* When the running break began, if one is running. */
export const breakStartedAt = (today: AttendanceDay | null | undefined) =>
  today?.activeBreakStartedAt || (today?.breakSessions || []).find((session) => session.startAt && !session.endAt)?.startAt || null;

/*
 * Minutes worked so far. The server's workedMinutes is only final after
 * check-out, so a live day is counted from check-in minus finished breaks
 * and any break still running.
 */
export const workedMinutesSoFar = (today: AttendanceDay | null | undefined, now = new Date()) => {
  if (!today?.checkInAt) return 0;
  if (today.checkOutAt && typeof today.workedMinutes === "number") return today.workedMinutes;
  const end = today.checkOutAt ? new Date(today.checkOutAt) : now;
  const gross = (end.getTime() - new Date(today.checkInAt).getTime()) / 60000;
  const sessions = [...(today.breakSessions || [])];
  // A running break the server reports only through activeBreakStartedAt.
  if (today.activeBreakStartedAt && !sessions.some((session) => session.startAt && !session.endAt)) {
    sessions.push({ startAt: today.activeBreakStartedAt, endAt: null });
  }
  const breaks = sessions.reduce((sum, session) => {
    if (!session.startAt) return sum;
    const stop = session.endAt ? new Date(session.endAt) : end;
    return sum + Math.max(0, (stop.getTime() - new Date(session.startAt).getTime()) / 60000);
  }, 0);
  return Math.max(0, Math.round(gross - breaks));
};

export const PHASE_LABEL: Record<DayPhase, string> = {
  not_started: "Not checked in",
  working: "Working",
  on_break: "On break",
  done: "Checked out",
};

export const BREAK_TYPES = [
  { key: "TEA", label: "Tea" },
  { key: "LUNCH", label: "Lunch" },
  { key: "COFFEE", label: "Coffee" },
  { key: "UTILITY", label: "Other" },
] as const;

const DAY_STATUS: Record<string, { label: string; tone: Tone }> = {
  PRESENT: { label: "Present", tone: "success" },
  ON_TIME: { label: "On time", tone: "success" },
  LATE: { label: "Late", tone: "warning" },
  HALF_DAY: { label: "Half day", tone: "warning" },
  ABSENT: { label: "Absent", tone: "danger" },
  LEAVE: { label: "Leave", tone: "info" },
  ON_LEAVE: { label: "Leave", tone: "info" },
  WEEK_OFF: { label: "Week off", tone: "neutral" },
  HOLIDAY: { label: "Holiday", tone: "neutral" },
  PENDING: { label: "In progress", tone: "primary" },
  CHECKED_IN: { label: "In progress", tone: "primary" },
};

export const dayStatusMeta = (day: AttendanceDay) => {
  const key = String(day.status || "").toUpperCase();
  if (key === "PRESENT" && day.isLateCheckIn) return DAY_STATUS.LATE!;
  return DAY_STATUS[key] || { label: key ? key.replace(/_/g, " ").toLowerCase().replace(/^\w/, (c) => c.toUpperCase()) : "—", tone: "neutral" as Tone };
};

/* "600" minutes after midnight -> "10:00 AM". */
export const minutesToClock = (minutes?: number) => {
  if (typeof minutes !== "number" || !Number.isFinite(minutes)) return "";
  const h = Math.floor(minutes / 60) % 24;
  const m = String(minutes % 60).padStart(2, "0");
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${m} ${h < 12 ? "AM" : "PM"}`;
};

/* YYYY-MM-DD in the device's own calendar, which is what the API's date filters expect. */
export const isoDay = (date: Date) =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;

/* Inclusive day count between two YYYY-MM-DD strings; 0 when the range is backwards. */
export const daySpan = (from: string, to: string) => {
  const start = Date.UTC(+from.slice(0, 4), +from.slice(5, 7) - 1, +from.slice(8, 10));
  const end = Date.UTC(+to.slice(0, 4), +to.slice(5, 7) - 1, +to.slice(8, 10));
  return end < start ? 0 : Math.round((end - start) / 86400000) + 1;
};
