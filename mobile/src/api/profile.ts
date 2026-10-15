import { api } from "./client";

export type Profile = {
  _id: string;
  employeeCode?: string;
  name: string;
  email: string;
  phone?: string;
  role: string;
  profileImageUrl?: string;
  department?: string;
  branch?: string;
  shiftTiming?: string;
  joiningDate?: string | null;
  parentId?: { _id: string; name: string; role?: string; profileImageUrl?: string; email?: string; phone?: string } | null;
  manager?: { _id: string; name: string; email?: string; phone?: string; role?: string } | null;
  employeeId?: string;
  customRoleName?: string;
  isActive?: boolean;
  lastLoginAt?: string | null;
  createdAt?: string | null;
  /* Role-based numbers from the server (assignedLeads, openLeads, teamMembers...). */
  summary?: Record<string, number>;
};

export const getMyProfile = async () => {
  const res = await api.get<{ profile: Profile; summary?: Record<string, number> }>("/users/profile");
  return res.data?.profile ? { ...res.data.profile, summary: res.data.summary || {} } : null;
};

export const updateMyProfile = async (payload: { name?: string; phone?: string; profileImageUrl?: string }) => {
  const res = await api.patch<{ profile?: Profile; user?: Profile }>("/users/profile", payload);
  return res.data?.profile || res.data?.user || null;
};
