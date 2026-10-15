import { api } from "./client";
import type { TeamUser } from "./users";

/* Admin console: page access, user admin edits, attendance rules, company and Meta settings. */

export type CrmPage = { key: string; label: string; group?: string; path?: string; actions: string[]; alwaysAccessible?: boolean };
export type PageGrant = { pageKey: string; actions: string[] };
export type PageAccess = {
  pages: CrmPage[];
  pageKeys: string[];
  pageAccess: PageGrant[];
  usesRoleDefaults: boolean;
  role: string;
  canEdit: boolean;
  canGrantDelete: boolean;
  editBlockedReason?: string;
  currentDeleteGrants?: string[];
  deleteNeedsApproval?: boolean;
};

export const getPageAccess = async (userId: string) => (await api.get<PageAccess>(`/access/users/${userId}/pages`)).data;
/* `null` puts the person back on their role's defaults. */
export const setPageAccess = async (userId: string, pageAccess: PageGrant[] | null) => (await api.patch<PageAccess>(`/access/users/${userId}/pages`, { pageAccess })).data;

export type AdminUserPatch = Partial<{
  name: string;
  email: string;
  phone: string;
  role: string;
  isActive: boolean;
  department: string;
  branch: string;
  employeeId: string;
  password: string;
  mustChangePassword: boolean;
  canViewInventory: boolean;
  /* A role the company named; null takes the person off it. The server applies the role's base role and category. */
  customRoleId: string | null;
  roleType: "COMMERCIAL" | "RESIDENTIAL" | "BOTH" | "COWORKING";
  /* Their manager (or, for a manager, the admin they report to). */
  reportingToId: string | null;
  shiftTiming: string;
  monthlyTarget: number;
  brokerageConfig: { mode: "FLAT" | "PERCENTAGE"; value: number; notes: string };
}>;
export const updateUserByAdmin = async (userId: string, patch: AdminUserPatch) => (await api.patch(`/users/admin/${userId}`, patch)).data;

export const createUser = async (payload: { name: string; email: string; phone: string; role: string; password: string; parentId?: string }) =>
  (await api.post("/users/create", payload)).data;

export type AttendancePolicy = {
  timezone?: string;
  shiftStartMinutes: number;
  shiftEndMinutes: number;
  graceMinutes: number;
  halfDayMinutes: number;
  fullDayMinutes: number;
  weeklyOffDays: number[];
  allowCheckoutDuringBreak?: boolean;
  geofenceEnabled?: boolean;
  officeRadiusMeters?: number;
  offices?: { name: string; latitude: number; longitude: number; radiusMeters?: number }[];
  notes?: string;
};
export const getAttendancePolicy = async () => (await api.get<{ policy: AttendancePolicy }>("/attendance/policy")).data?.policy;
export const updateAttendancePolicy = async (patch: Partial<AttendancePolicy>) => (await api.patch<{ policy: AttendancePolicy }>("/attendance/policy", patch)).data?.policy;

export type CompanySettings = { id: string; name: string; legalName?: string; subdomain?: string; customDomain?: string; status?: string; settings?: Record<string, unknown> };
export type Subscription = { plan?: { name?: string; code?: string } | null; status?: string; currentPeriodEnd?: string; [key: string]: unknown };
export const getCompanySettings = async () => (await api.get<{ company: CompanySettings; subscription: Subscription | null }>("/client/saas/tenant/settings")).data;
export const updateCompanySettings = async (patch: { name?: string; settings?: Record<string, unknown> }) => (await api.patch("/client/saas/tenant/settings", patch)).data;

export type MetaIntegration = {
  pageIds: string[];
  accessTokenConfigured: boolean;
  accessTokenPreview?: string;
  webhook?: Record<string, string>;
  readiness?: { status?: string; isReady?: boolean; message?: string; totalPages?: number; readyPages?: number; syncErrorMessage?: string; lastCheckedAt?: string };
};
export const getMetaIntegration = async () => (await api.get<{ integration: MetaIntegration }>("/client/saas/tenant/meta")).data?.integration;
export const updateMetaIntegration = async (payload: { pageIds: string[]; accessToken?: string }) =>
  (await api.patch<{ integration: MetaIntegration }>("/client/saas/tenant/meta", payload)).data?.integration;

/* --------------------------------------------------------- custom roles -- */
/* Web: TeamManager "Roles". A name plus the built-in role it behaves as; admins and managers. */

export type BusinessCategory = "COMMERCIAL" | "RESIDENTIAL" | "COWORKING" | "BOTH";
export type CustomRole = { _id: string; name: string; baseRole: string; businessCategory: BusinessCategory; description?: string };

export const getRoleCatalogue = async () =>
  (await api.get<{ businessCategories: BusinessCategory[]; baseRoles: string[] }>("/roles/catalogue")).data;
export const listCustomRoles = async () => (await api.get<{ roles: CustomRole[] }>("/roles")).data?.roles || [];
export const createCustomRole = async (payload: { name: string; baseRole: string; businessCategory: BusinessCategory; description?: string }) =>
  (await api.post<{ role: CustomRole; message?: string }>("/roles", payload)).data;
/* Only an admin may change baseRole; leave it out to keep it. */
export const updateCustomRole = async (id: string, payload: { name: string; baseRole?: string; businessCategory?: BusinessCategory }) =>
  (await api.patch<{ role: CustomRole; message?: string; usersUpdated?: number }>(`/roles/${id}`, payload)).data;
/* Refused (409) while anyone holds the role; a manager's delete becomes an approval request (202). */
export const deleteCustomRole = async (id: string) => {
  const res = await api.delete<{ message?: string; approvalRequired?: boolean }>(`/roles/${id}`);
  return { pendingApproval: res.status === 202 || Boolean(res.data?.approvalRequired), message: res.data?.message || "Role deleted" };
};

export type AdminProfileView = {
  profile: TeamUser & { parentId?: { _id: string; name: string; role?: string } | string | null; employeeCode?: string; partnerCode?: string | null };
  performance: {
    totalLeads?: number;
    closedLeads?: number;
    conversionRate?: number;
    dueFollowUpsToday?: number;
    overdueFollowUps?: number;
    siteVisits?: number;
    directReports?: number;
    achievedTarget?: number;
  } | null;
};

/* GET /users/:id/profile - admins and managers: the full record, reporting manager filled in, with lead numbers. */
export const getUserProfile = async (userId: string) => {
  const res = await api.get(`/users/${userId}/profile`);
  return { profile: res.data?.profile || null, performance: res.data?.performance || null } as AdminProfileView;
};
