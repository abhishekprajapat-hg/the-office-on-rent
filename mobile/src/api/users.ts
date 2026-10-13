import { api } from "./client";

export type TeamUser = {
  _id: string;
  name: string;
  email?: string;
  phone?: string;
  role: string;
  isActive?: boolean;
  profileImageUrl?: string;
  parentId?: { _id: string; name: string } | string | null;
  designation?: string;
  department?: string;
  branch?: string;
};

/* Everyone the caller may see (their company for an admin, their team for a manager). */
export const listUsers = async (params: Record<string, string | number> = {}) => {
  const res = await api.get<{ users: TeamUser[] }>("/users", { params: { limit: 200, ...params } });
  return res.data?.users || [];
};

/* A field executive's live position, which the server checks when a site visit is marked. */
export const updateMyLiveLocation = async (point: { lat: number; lng: number; accuracy?: number | null }) => {
  const res = await api.patch("/users/location", point);
  return res.data;
};
