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
