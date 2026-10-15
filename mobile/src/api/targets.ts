import { api } from "./client";

export type LeaderboardRow = {
  userId: string;
  name: string;
  role: string;
  profileImageUrl?: string;
  totalLeads: number;
  closedLeads: number;
  siteVisits: number;
  conversionRate: number;
  isSelf: boolean;
  rank: number;
};

export type Leaderboard = {
  role: string;
  roleLabel: string;
  allowedRoleFilters: { value: string; label: string }[];
  windowDays: number;
  leaderboard: LeaderboardRow[];
};

/* GET /users/leaderboard - peers of one role, ranked by closures over a rolling window. */
export const getLeaderboard = async (params: { role?: string; windowDays?: number } = {}) => {
  const res = await api.get<Leaderboard>("/users/leaderboard", { params });
  return {
    role: res.data?.role || "",
    roleLabel: res.data?.roleLabel || "",
    allowedRoleFilters: res.data?.allowedRoleFilters || [],
    windowDays: Number(res.data?.windowDays || 30),
    leaderboard: res.data?.leaderboard || [],
  };
};

export type TargetView = {
  _id: string;
  month: string;
  leadsTarget: number;
  revenueTarget: number;
  siteVisitTarget: number;
  notes?: string;
  assignedBy?: { _id: string; name: string; roleLabel?: string } | null;
  assignedTo?: { _id: string; name: string; roleLabel?: string; profileImageUrl?: string } | null;
  achievements: { leadsAchieved: number; revenueAchieved: number; siteVisitsAchieved: number; closedDealsAchieved: number };
  progress: { leadsPercent: number; revenuePercent: number; siteVisitPercent: number };
};

export type MyTargets = {
  month: string;
  canAssign: boolean;
  assignableReports: { _id: string; name: string; role: string; roleLabel?: string; profileImageUrl?: string }[];
  myTarget: TargetView | null;
  incoming: TargetView[];
  outgoing: TargetView[];
};

export const getMyTargets = async (month?: string) => {
  const res = await api.get<MyTargets>("/targets/my", { params: month ? { month } : {} });
  return {
    month: res.data?.month || "",
    canAssign: Boolean(res.data?.canAssign),
    assignableReports: res.data?.assignableReports || [],
    myTarget: res.data?.myTarget || null,
    incoming: res.data?.incoming || [],
    outgoing: res.data?.outgoing || [],
  } as MyTargets;
};

/* POST /targets/assign - a manager sets a report's monthly targets. */
export const assignTarget = async (payload: { month: string; assignedToId: string; leadsTarget: number; revenueTarget: number; siteVisitTarget: number; notes?: string }) => {
  const res = await api.post<{ message?: string }>("/targets/assign", payload);
  return res.data || {};
};
