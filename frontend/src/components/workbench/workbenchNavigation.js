import {
  BarChart3,
  Bell,
  Briefcase,
  Building2,
  Calendar,
  CheckSquare,
  ClipboardList,
  Home,
  Map,
  Megaphone,
  MessageSquare,
  PieChart,
  Settings,
  ShieldCheck,
  Target,
  TerminalSquare,
  Trophy,
  UserCheck,
  UserCircle2,
  Users,
} from "lucide-react";

const MANAGEMENT_ROLES = ["ADMIN", "MANAGER"];
const SALES_ROLES = [...MANAGEMENT_ROLES, "EXECUTIVE", "FIELD_EXECUTIVE"];
const PARTNER_ROLES = ["CHANNEL_PARTNER"];

export const ACTIVITY_SECTIONS = [
  {
    id: "dashboard",
    label: "Dashboard",
    icon: Home,
    match: ["/", "/dashboard", "/tasks", "/attendance"],
  },
  {
    id: "leads",
    label: "Pipeline",
    icon: Users,
    match: ["/leads", "/my-leads"],
  },
  {
    id: "inventory",
    label: "Inventory",
    icon: Building2,
    match: ["/inventory", "/map"],
  },
  {
    id: "finance",
    label: "Finance",
    icon: PieChart,
    match: ["/finance"],
  },
  {
    id: "reports",
    label: "Reports",
    icon: ClipboardList,
    match: ["/reports", "/leaderboard", "/targets"],
  },
  {
    id: "calendar",
    label: "Calendar",
    icon: Calendar,
    match: ["/calendar"],
  },
  {
    id: "chat",
    label: "Chat",
    icon: MessageSquare,
    match: ["/chat"],
  },
  {
    id: "admin",
    label: "Admin",
    icon: ShieldCheck,
    match: ["/admin"],
  },
  {
    id: "settings",
    label: "Settings",
    icon: Settings,
    match: ["/settings", "/profile"],
  },
];

export const TOP_NAV_SECTION_IDS = [
  "dashboard",
  "leads",
  "inventory",
  "finance",
  "reports",
  "calendar",
  "chat",
  "admin",
  "settings",
];

export const WORKBENCH_MENU = {
  dashboard: [
    {
      group: "Workspace",
      items: [
        { label: "Home", path: "/dashboard", icon: Home, roles: [...SALES_ROLES, ...PARTNER_ROLES] },
        { label: "Tasks", path: "/tasks", icon: CheckSquare, roles: SALES_ROLES },
        { label: "Attendance", path: "/attendance", icon: UserCheck, roles: [...SALES_ROLES, ...PARTNER_ROLES] },
      ],
    },
  ],
  leads: [
    {
      group: "Pipeline",
      items: [
        { label: "Pipeline", path: "/leads", icon: Users, roles: ["ADMIN", "MANAGER", "CHANNEL_PARTNER"] },
        { label: "My Leads", path: "/my-leads", icon: Briefcase, roles: ["EXECUTIVE", "FIELD_EXECUTIVE"] },
      ],
    },
  ],
  inventory: [
    {
      group: "Assets",
      items: [
        { label: "Inventory", path: "/inventory", icon: Building2, roles: [...SALES_ROLES, ...PARTNER_ROLES], requiresInventoryAccessForPartner: true },
        { label: "Field Ops", path: "/map", icon: Map, roles: ["ADMIN", "MANAGER", "FIELD_EXECUTIVE"] },
      ],
    },
  ],
  finance: [
    {
      group: "Money",
      items: [
        { label: "Finance", path: "/finance", icon: PieChart, roles: ["ADMIN", "MANAGER", "EXECUTIVE", "FIELD_EXECUTIVE", "CHANNEL_PARTNER"] },
      ],
    },
  ],
  reports: [
    {
      group: "Intelligence",
      items: [
        { label: "Reports", path: "/reports", icon: BarChart3, roles: MANAGEMENT_ROLES },
        { label: "Leaderboard", path: "/leaderboard", icon: Trophy, roles: [...SALES_ROLES, ...PARTNER_ROLES] },
        { label: "Targets", path: "/targets", icon: Target, roles: SALES_ROLES },
      ],
    },
  ],
  calendar: [
    {
      group: "Schedule",
      items: [
        { label: "Calendar", path: "/calendar", icon: Calendar, roles: SALES_ROLES },
      ],
    },
  ],
  chat: [
    {
      group: "Collaboration",
      items: [
        { label: "Team Chat", path: "/chat", icon: MessageSquare, roles: SALES_ROLES },
      ],
    },
  ],
  admin: [
    {
      group: "Admin",
      items: [
        { label: "Alerts", path: "/admin/notifications", icon: Bell, roles: MANAGEMENT_ROLES },
        { label: "Access", path: "/admin/users", icon: ShieldCheck, roles: MANAGEMENT_ROLES },
        { label: "Console", path: "/admin/console", icon: TerminalSquare, roles: ["ADMIN", "MANAGER"] },
        { label: "Meta Ads", path: "/admin/meta-ads", icon: Megaphone, roles: ["ADMIN", "MANAGER"] },
      ],
    },
  ],
  settings: [
    {
      group: "Account",
      items: [
        { label: "Settings", path: "/settings", icon: Settings, roles: MANAGEMENT_ROLES },
        { label: "Profile", path: "/profile", icon: UserCircle2, roles: [...SALES_ROLES, ...PARTNER_ROLES] },
      ],
    },
  ],
};

export const roleCanSeeItem = (item, userRole, user = {}) => {
  if (!item?.roles?.includes(userRole)) return false;
  if (
    item.requiresInventoryAccessForPartner &&
    userRole === "CHANNEL_PARTNER" &&
    !user?.canViewInventory
  ) {
    return false;
  }
  return true;
};

export const getVisibleSections = (userRole, user = {}) =>
  ACTIVITY_SECTIONS.filter((section) =>
    (WORKBENCH_MENU[section.id] || []).some((group) =>
      group.items.some((item) => roleCanSeeItem(item, userRole, user)),
    ),
  );

export const getVisibleMenuGroups = (sectionId, userRole, user = {}) =>
  (WORKBENCH_MENU[sectionId] || [])
    .map((group) => ({
      ...group,
      items: group.items.filter((item) => roleCanSeeItem(item, userRole, user)),
    }))
    .filter((group) => group.items.length > 0);

export const getSectionTarget = (sectionId, userRole, user = {}) => {
  const groups = getVisibleMenuGroups(sectionId, userRole, user);
  return groups[0]?.items[0]?.path || "/dashboard";
};

export const getAllVisibleMenuGroups = (userRole, user = {}) =>
  getVisibleSections(userRole, user)
    .flatMap((section) =>
      (WORKBENCH_MENU[section.id] || []).map((group) => ({
        ...group,
        group: section.label,
        items: group.items.filter((item) => roleCanSeeItem(item, userRole, user)),
      })),
    )
    .filter((group) => group.items.length > 0);

export const getDrawerMenuGroups = (userRole, user = {}) => {
  const topNavTargets = new Set(
    TOP_NAV_SECTION_IDS.map((sectionId) => getSectionTarget(sectionId, userRole, user)),
  );

  return getVisibleSections(userRole, user)
    .flatMap((section) =>
      (WORKBENCH_MENU[section.id] || []).map((group) => ({
        ...group,
        group: section.label,
        items: group.items
          .filter((item) => roleCanSeeItem(item, userRole, user))
          .filter((item) => !topNavTargets.has(item.path)),
      })),
    )
    .filter((group) => group.items.length > 0);
};

export const getActiveSectionId = (pathname, userRole, user = {}) => {
  const visibleSections = getVisibleSections(userRole, user);
  const activeSection = visibleSections.find((section) =>
    section.match.some((path) => {
      if (path === "/") return pathname === "/";
      return pathname === path || pathname.startsWith(`${path}/`);
    }),
  );

  return activeSection?.id || visibleSections[0]?.id || "dashboard";
};
