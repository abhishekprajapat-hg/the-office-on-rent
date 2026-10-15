import type { IconName } from "../ui/Icon";
import { canOpenPage, type AccessProfile } from "../api/access";
import type { User } from "../api/types";

/*
 * "Home by Role" design: each role gets its own home and its own four tabs
 * in the floating glass bar, plus a round action button beside it.
 */
export type HomeKind = "admin" | "manager" | "sales" | "field" | "community" | "production" | "partner";

export const homeKindFor = (role?: string): HomeKind => {
  switch (role) {
    case "ADMIN":
      return "admin";
    case "MANAGER":
      return "manager";
    case "FIELD_EXECUTIVE":
      return "field";
    case "COMMUNITY_MANAGER":
      return "production";
    case "COWORKING_ADMIN":
      return "community";
    case "PRODUCTION_EXECUTIVE":
      return "production";
    case "CHANNEL_PARTNER":
      return "partner";
    default:
      return "sales"; // EXECUTIVE, INSIDE_EXECUTIVE
  }
};

export type TabName = "Home" | "Leads" | "Tasks" | "Attendance" | "TeamTab" | "ApprovalsTab" | "VisitsTab" | "BookingsTab" | "ClientsTab" | "ListingsTab" | "More";
export type TabSpec = { name: TabName; label: string; icon: IconName };

const HOME: TabSpec = { name: "Home", label: "Home", icon: "home" };
const MORE: TabSpec = { name: "More", label: "More", icon: "grid" };

/* The four tabs the design shows for each role (icons are the filled names; inactive uses "-outline"). */
export const ROLE_TABS: Record<HomeKind, TabSpec[]> = {
  admin: [HOME, { name: "TeamTab", label: "Team", icon: "people" }, { name: "ApprovalsTab", label: "Approvals", icon: "checkmark-done" }, MORE],
  manager: [HOME, { name: "Leads", label: "Leads", icon: "people" }, { name: "TeamTab", label: "Team", icon: "stats-chart" }, MORE],
  sales: [HOME, { name: "Leads", label: "Leads", icon: "people" }, { name: "Tasks", label: "Tasks", icon: "checkbox" }, MORE],
  partner: [HOME, { name: "Leads", label: "Leads", icon: "people" }, MORE],
  field: [HOME, { name: "VisitsTab", label: "Visits", icon: "map" }, { name: "Tasks", label: "Tasks", icon: "checkbox" }, MORE],
  community: [HOME, { name: "BookingsTab", label: "Bookings", icon: "calendar" }, { name: "ClientsTab", label: "Clients", icon: "briefcase" }, MORE],
  production: [HOME, { name: "Tasks", label: "Tasks", icon: "checkbox" }, { name: "Attendance", label: "Attendance", icon: "finger-print" }, MORE],
};

/* The round button beside the bar. */
export const ROLE_FAB: Record<HomeKind, { icon: IconName; label: string }> = {
  admin: { icon: "search", label: "Search" },
  manager: { icon: "add", label: "Create" },
  sales: { icon: "add", label: "Create" },
  partner: { icon: "add", label: "Add lead" },
  field: { icon: "camera", label: "Site photo" },
  community: { icon: "add", label: "New booking" },
  production: { icon: "add", label: "New task" },
};

/* Tabs a role reaches from More rather than the bar (still registered so links keep working). */
const tabPage = (tab: TabName, user: User | null) => ({
  Leads: user?.role === "EXECUTIVE" || user?.role === "FIELD_EXECUTIVE" ? "my_leads" : "leads",
  Tasks: "tasks",
  Attendance: "attendance",
  TeamTab: user?.role === "ADMIN" ? "admin_team" : "tasks",
  ApprovalsTab: "admin_console",
  VisitsTab: "field_ops",
  BookingsTab: "coworking_booking",
  ClientsTab: "coworking_clients",
  ListingsTab: "inventory",
})[tab as Exclude<TabName, "Home" | "More">];

export const tabsFor = (kind: HomeKind, user: User | null, access: AccessProfile | null) =>
  ROLE_TABS[kind].filter((tab) => tab.name === "Home" || tab.name === "More" || canOpenPage(user, access, tabPage(tab.name, user)));

export const tabsShown = (kind: HomeKind, user: User | null, access: AccessProfile | null) => new Set(tabsFor(kind, user, access).map((tab) => tab.name));
