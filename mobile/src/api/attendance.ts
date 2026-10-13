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
