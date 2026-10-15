import { api } from "./client";
import type { User } from "./types";

export type AccessProfile = {
  permissions: string[];
  enforcePageAccess: boolean;
  /* An employee-level page selection; only then does a page grant widen what a role may do (checkRoleOrPageAction). */
  hasExplicitPageOverride?: boolean;
};

// These routes are still restricted to management by their APIs.
const ROLE_ONLY_PAGES = new Set(["admin_team", "admin_notifications", "admin_console", "admin_meta_ads", "settings"]);

export const getMyAccess = async (): Promise<AccessProfile> => {
  const { data } = await api.get<{ access?: AccessProfile }>("/access/me");
  if (!data?.access || !Array.isArray(data.access.permissions)) throw new Error("Unable to load page access");
  return data.access;
};

export const canPage = (access: AccessProfile | null, page: string) =>
  Boolean(access?.permissions.includes(`page.${page}.view`));

export const canPageAction = (access: AccessProfile | null, page: string, action: string) =>
  Boolean(access?.permissions.includes(`page.${page}.${action}`));

export const canOpenPage = (user: User | null, access: AccessProfile | null, page: string) => {
  if (!user || !canPage(access, page)) return false;
  if (ROLE_ONLY_PAGES.has(page) && user.role !== "ADMIN" && user.role !== "MANAGER") return false;
  if (user.role === "CHANNEL_PARTNER" && ["inventory", "projects"].includes(page) && !user.canViewInventory) return false;
  if (user.role !== "ADMIN" && page === "coworking_booking" && !access?.permissions.includes("cabins.view")) return false;
  if (user.role !== "ADMIN" && page === "coworking_clients" && !access?.permissions.includes("clients.view")) return false;
  return true;
};

/* A page action granted to this person explicitly, which opens routes outside their role (server checkRoleOrPageAction). */
export const hasExplicitGrant = (access: AccessProfile | null | undefined, page: string, action: string) =>
  Boolean(access?.hasExplicitPageOverride ?? access?.enforcePageAccess) && Boolean(access?.permissions.includes(`page.${page}.${action}`));

/* Admins and managers, or an explicit grant - the rule for project and inventory writes. */
export const canManagePage = (user: User | null, access: AccessProfile | null, page: string, action: string) =>
  user?.role === "ADMIN" || user?.role === "MANAGER" || hasExplicitGrant(access, page, action);

export const canDoPageAction = (user: User | null, access: AccessProfile | null, page: string, action: string) =>
  canOpenPage(user, access, page) && canPageAction(access, page, action);
