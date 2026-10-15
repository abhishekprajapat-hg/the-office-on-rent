import { api } from "./client";

export type Grade = { key: "EXCELLENT" | "GOOD" | "AVERAGE" | "NEEDS_IMPROVEMENT" | string; label: string } | null;

export type PerformancePart = {
  score: number;
  grade: Grade;
  weight: number;
  effectiveWeight: number;
  metrics: Record<string, unknown>;
} | null;

export type Performance = {
  score: number | null;
  grade: Grade;
  parts: { attendance: PerformancePart; tasks: PerformancePart; sales: PerformancePart };
};

export type MyPerformance = {
  month: string;
  methodology?: { weights?: Record<string, number>; conversionBenchmarkPercent?: number; revenuePerClosed?: number };
  user?: { _id: string; name: string };
  performance: Performance;
};

export type TeamPerformanceRow = { user: { _id: string; name: string; role?: string; profileImageUrl?: string }; performance: Performance };

/* GET /performance/me?month=YYYY-MM - admins are not scored (403). */
export const getMyPerformance = async (month: string) => {
  const res = await api.get<MyPerformance>("/performance/me", { params: { month } });
  return res.data;
};

/* GET /performance/team - managers/admins: everyone they look after. */
export const getTeamPerformance = async (month: string) => {
  const res = await api.get<{ month: string; rows: TeamPerformanceRow[] }>("/performance/team", { params: { month } });
  return res.data?.rows || [];
};

/* GET /performance/users/:id?month - a teammate's score (admins, and managers for their team). */
export const getUserPerformance = async (userId: string, month: string) => {
  const res = await api.get<MyPerformance>(`/performance/users/${userId}`, { params: { month } });
  return res.data;
};
