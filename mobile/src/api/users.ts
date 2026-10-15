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
  roleType?: string;
  shiftTiming?: string;
  monthlyTarget?: number;
  canViewInventory?: boolean;
  brokerageConfig?: { mode?: string; value?: number; notes?: string } | null;
  employeeId?: string;
  joiningDate?: string | null;
  lastLoginAt?: string | null;
  /* A role the company named, when the person is on one. */
  customRoleId?: string | { _id: string; name?: string } | null;
  customRoleName?: string;
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

/* POST /users/rebalance-executives - spreads open (and unassigned) leads evenly over the team. Managers and admins. */
export const rebalanceExecutives = async () => {
  const res = await api.post<{ message?: string; reassigned?: number; assigned?: number }>("/users/rebalance-executives");
  return res.data || {};
};

export type FieldLocation = {
  _id: string;
  name: string;
  phone?: string;
  role: string;
  profileImageUrl?: string;
  liveLocation?: { lat: number | null; lng: number | null; accuracy?: number | null; updatedAt?: string | null } | null;
  isLocationFresh?: boolean;
};

/* GET /users/field-locations - field executives' last shared positions (leadership roles). */
export const getFieldLocations = async () => {
  const res = await api.get<{ users: FieldLocation[]; staleMinutes?: number }>("/users/field-locations");
  return { users: res.data?.users || [], staleMinutes: res.data?.staleMinutes || null };
};
