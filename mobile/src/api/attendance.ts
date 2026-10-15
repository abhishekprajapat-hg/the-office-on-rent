import { api } from "./client";
import type { AttendanceDay } from "./types";

export type AttendancePolicy = {
  timezone?: string;
  shiftStartMinutes?: number;
  shiftEndMinutes?: number;
  graceMinutes?: number;
  geofenceEnabled?: boolean;
  allowCheckoutDuringBreak?: boolean;
};

export type AttendanceSummary = {
  presentDays?: number;
  lateDays?: number;
  absentDays?: number;
  leaveDays?: number;
  attendancePercent?: number;
  punctualityPercent?: number;
  totalWorkedMinutes?: number;
};

export type GeoPoint = { latitude: number; longitude: number; accuracy?: number | null };

export const getMyAttendance = async (params: { from?: string; to?: string; limit?: number } = {}) => {
  const res = await api.get("/attendance/me", { params });
  return {
    today: (res.data?.today || null) as AttendanceDay | null,
    policy: (res.data?.policy || null) as AttendancePolicy | null,
    summary: (res.data?.summary || {}) as AttendanceSummary,
    days: (Array.isArray(res.data?.attendance) ? res.data.attendance : []) as AttendanceDay[],
    timezone: String(res.data?.timezone || ""),
  };
};

const act = async (path: string, body: Record<string, unknown>) => {
  const res = await api.post(path, body);
  return { message: String(res.data?.message || ""), today: (res.data?.attendance || null) as AttendanceDay | null };
};

export const checkIn = (location: GeoPoint | null) => act("/attendance/check-in", location ? { location } : {});
export const checkOut = (location: GeoPoint | null) => act("/attendance/check-out", location ? { location } : {});
export const startBreak = (breakType: string) => act("/attendance/break/start", { breakType });
export const endBreak = () => act("/attendance/break/end", {});

export type LeaveBalance = { available: number; used: number; pending: number; accrued: number; monthlyAccrual: number };

export const LEAVE_TYPES = [
  { key: "CASUAL", label: "Casual" },
  { key: "SICK", label: "Sick" },
  { key: "EMERGENCY", label: "Emergency" },
  { key: "UNPAID", label: "Unpaid" },
  { key: "OTHER", label: "Other" },
] as const;

export type LeaveRequest = {
  _id: string;
  fromDate?: string;
  toDate?: string;
  totalDays?: number;
  leaveType?: string;
  reason?: string;
  status?: "PENDING" | "APPROVED" | "REJECTED" | "CANCELLED" | string;
  reviewNote?: string;
  createdAt?: string;
};

export const getLeaveBalance = async () => {
  const res = await api.get<LeaveBalance>("/attendance/leave-balance/my");
  return res.data || null;
};

export const getMyLeaveRequests = async () => {
  const res = await api.get<{ leaveRequests: LeaveRequest[] }>("/attendance/leave-requests/my");
  return res.data?.leaveRequests || [];
};

/* Dates are calendar days, YYYY-MM-DD, as the server stores them. */
export const applyLeave = async (payload: { fromDate: string; toDate: string; leaveType: string; reason: string }) => {
  const res = await api.post("/attendance/leave-requests", payload);
  return res.data;
};

/* ---------------------------------------------------------------- team -- */

export type TeamAttendanceRow = {
  user: { _id: string; name: string; role?: string; profileImageUrl?: string };
  attendance: AttendanceDay & { isOnBreak?: boolean };
};

export type TeamAttendanceSummary = {
  totalUsers: number;
  checkedIn: number;
  checkedOut: number;
  activeLogins: number;
  onBreak: number;
  leave: number;
  weekOff: number;
  absent: number;
};

/* GET /attendance/daily - managers and admins: everyone in scope for one day. */
export const getTeamAttendance = async (date?: string) => {
  const res = await api.get("/attendance/daily", { params: date ? { date } : {} });
  return {
    summary: (res.data?.summary || null) as TeamAttendanceSummary | null,
    rows: (Array.isArray(res.data?.attendance) ? res.data.attendance : []) as TeamAttendanceRow[],
  };
};

/* ---------------------------------------------------------- violations -- */

export type Violation = {
  _id: string;
  userId: string;
  userName?: string;
  date: string;
  month: string;
  kind: "REJECTED_LEAVE" | "UNINFORMED" | string;
  active: boolean;
  ordinal: number;
  level: "RECORDED" | "WARNING" | "MANAGEMENT_REVIEW" | string;
  excused?: boolean;
  history?: { action: string; note?: string; at?: string }[];
};

export type ViolationReport = {
  month: string;
  violations: Violation[];
  summaries: { userId: string; name: string; rejectedLeave: number; uninformed: number; rejectedLevel: string; uninformedLevel: string }[];
  policyNote?: string;
};

/* GET /attendance/violations?month=YYYY-MM - your own, or your team's for a manager. */
export const getViolations = async (month: string) => {
  const res = await api.get<ViolationReport>("/attendance/violations", { params: { month } });
  return res.data;
};

/* PATCH /attendance/violations/:id - managers record a warning, review or excuse. */
export const reviewViolation = async (id: string, action: "WARNING_ISSUED" | "MANAGEMENT_REVIEW" | "EXCUSED", note: string) => {
  const res = await api.patch(`/attendance/violations/${id}`, { action, note: note.trim() });
  return res.data;
};

/* ------------------------------------------------- team administration -- */
/* Web: AttendanceHub (team view), AttendanceDayStatusDialog, BreakCorrectionDialog, AttendanceOfficesPanel. Admins and managers, for people in their scope. */

export type MemberAttendance = {
  user: { _id: string; name: string; email?: string; role?: string; profileImageUrl?: string } | null;
  policy: AttendancePolicy | null;
  summary: AttendanceSummary;
  days: AttendanceDay[];
  timezone: string;
};

/* GET /attendance/users/:id?from&to - one person's days, absences and approved leave filled in. */
export const getMemberAttendance = async (userId: string, params: { from: string; to: string }) => {
  const res = await api.get(`/attendance/users/${userId}`, { params });
  return {
    user: res.data?.user || null,
    policy: res.data?.policy || null,
    summary: res.data?.summary || {},
    days: Array.isArray(res.data?.attendance) ? res.data.attendance : [],
    timezone: String(res.data?.timezone || ""),
  } as MemberAttendance;
};

/* PATCH /attendance/users/:id/:date/status - PRESENT, HALF_DAY, ABSENT, LEAVE or WEEK_OFF, with an optional note. */
export const setMemberDayStatus = async (userId: string, date: string, status: string, note = "") => {
  const res = await api.patch(`/attendance/users/${userId}/${date}/status`, { status, note: note.trim() });
  return { message: String(res.data?.message || "Attendance status updated"), day: (res.data?.attendance || null) as AttendanceDay | null };
};

/* POST /attendance/users/:id/break - start or end their break as of now (today, checked in, not out). */
export const manageMemberBreak = async (userId: string, action: "START" | "END", breakType?: string) => {
  const res = await api.post(`/attendance/users/${userId}/break`, { action, ...(action === "START" ? { breakType: breakType || "UTILITY" } : {}) });
  return { message: String(res.data?.message || "Break updated"), day: (res.data?.attendance || null) as AttendanceDay | null };
};

/*
 * PATCH /attendance/users/:id/:date/breaks - add a missed break (sessionIndex null) or correct one.
 * expectedUpdatedAt is the day's updatedAt as loaded; the server answers 409 if it has changed since.
 */
export const correctMemberBreak = async (
  userId: string,
  date: string,
  payload: { sessionIndex: number | null; startAt: string; endAt: string | null; reason: string; expectedUpdatedAt?: string | null },
) => {
  const res = await api.patch(`/attendance/users/${userId}/${date}/breaks`, { ...payload, reason: payload.reason.trim() });
  return { message: String(res.data?.message || "Break saved"), day: (res.data?.attendance || null) as AttendanceDay | null };
};

export type Office = { _id?: string; name: string; latitude: number | string; longitude: number | string; radiusMeters?: number; userIds?: string[] };
export type OfficeUser = { _id: string; name: string; role?: string; profileImageUrl?: string };

/* GET /attendance/offices - offices beyond the main one, and who the viewer may allow at them. */
export const getOffices = async () => {
  const res = await api.get("/attendance/offices");
  return {
    offices: (Array.isArray(res.data?.offices) ? res.data.offices : []) as Office[],
    assignableUsers: (Array.isArray(res.data?.assignableUsers) ? res.data.assignableUsers : []) as OfficeUser[],
  };
};

/* PUT /attendance/offices - replaces the whole list; a manager only changes access for their own team. */
export const saveOffices = async (offices: Office[]) => {
  const res = await api.put("/attendance/offices", { offices });
  return {
    message: String(res.data?.message || "Offices updated"),
    offices: (Array.isArray(res.data?.offices) ? res.data.offices : []) as Office[],
    assignableUsers: (Array.isArray(res.data?.assignableUsers) ? res.data.assignableUsers : []) as OfficeUser[],
  };
};

/* GET /attendance/leave-balance/:id - someone else's leave balance. */
export const getMemberLeaveBalance = async (userId: string) => {
  const res = await api.get<LeaveBalance>(`/attendance/leave-balance/${userId}`);
  return res.data || null;
};
