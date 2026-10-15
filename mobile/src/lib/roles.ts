import type { UserRole } from "../api/types";

export const ROLE_LABELS: Record<UserRole, string> = {
  ADMIN: "Admin",
  MANAGER: "Manager",
  INSIDE_EXECUTIVE: "Inside Executive",
  EXECUTIVE: "Executive",
  FIELD_EXECUTIVE: "Field Executive",
  PRODUCTION_EXECUTIVE: "Production Executive",
  COMMUNITY_MANAGER: "Community Manager",
  CHANNEL_PARTNER: "Channel Partner",
  COWORKING_ADMIN: "Coworking Admin",
};

export const roleLabel = (role?: string) => ROLE_LABELS[role as UserRole] || role || "Member";

export const isManagement = (role?: string) => role === "ADMIN" || role === "MANAGER";

/*
 * Which bottom tabs a role gets. Mirrors who the web app sends where:
 * channel partners land on leads, coworking admins never work the pipeline.
 * The server still has the final say on every request; this only avoids
 * showing a tab that would answer "no access".
 */
export const canUseLeads = (role?: string) => role !== "COWORKING_ADMIN" && role !== "PRODUCTION_EXECUTIVE";
/* Mirrors inventory.routes.js; a channel partner also needs the per-user inventory switch. */
export const canUseInventory = (role?: string, canViewInventory?: boolean) =>
  ["ADMIN", "MANAGER", "EXECUTIVE", "FIELD_EXECUTIVE"].includes(String(role)) || (role === "CHANNEL_PARTNER" && Boolean(canViewInventory));
export const canUseTasks = (role?: string) => role !== "CHANNEL_PARTNER";
/*
 * Personal check-in. Admins audit attendance and the server refuses to let
 * them mark their own ("Admin users audit attendance..."), so they get no
 * check-in UI at all; their team view belongs to the admin module.
 */
export const canMarkAttendance = (role?: string) => role !== "CHANNEL_PARTNER" && role !== "ADMIN";
