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
  parentId?: { _id: string; name: string; role?: string; profileImageUrl?: string } | null;
};

export const getMyProfile = async () => {
  const res = await api.get<{ profile: Profile }>("/users/profile");
  return res.data?.profile || null;
};

export const updateMyProfile = async (payload: { name?: string; phone?: string; profileImageUrl?: string }) => {
  const res = await api.patch<{ profile?: Profile; user?: Profile }>("/users/profile", payload);
  return res.data?.profile || res.data?.user || null;
};
