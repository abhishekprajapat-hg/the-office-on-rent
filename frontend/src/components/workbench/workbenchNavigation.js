import {
  BarChart3,
  Bell,
  Briefcase,
  Building,
  Building2,
  Calendar,
  CheckSquare,
  ClipboardList,
  Home,
  Layers,
  LayoutGrid,
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
const PRODUCTION_ROLES = ["PRODUCTION_EXECUTIVE", "COMMUNITY_MANAGER"];
const PARTNER_ROLES = ["CHANNEL_PARTNER"];
const COWORKING_ROLES = ["ADMIN", "MANAGER", "COWORKING_ADMIN"];

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
    match: ["/inventory", "/map", "/projects"],
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
    id: "coworking",
    label: "Coworking",
    icon: Building,
    match: ["/coworking"],
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
  "leads",
  "inventory",
  "finance",
  "reports",
  "calendar",
  "chat",
  "coworking",
  "admin",
  "settings",
];

export const WORKBENCH_MENU = {
  dashboard: [
    {
      group: "Workspace",
      items: [
        { label: "Home", path: "/dashboard", icon: Home, roles: [...SALES_ROLES, ...PRODUCTION_ROLES, ...PARTNER_ROLES] },
        { label: "Tasks", path: "/tasks", icon: CheckSquare, roles: [...SALES_ROLES, ...PRODUCTION_ROLES] },
        { label: "Attendance", path: "/attendance", icon: UserCheck, roles: [...SALES_ROLES, ...PRODUCTION_ROLES, ...PARTNER_ROLES] },
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
        { label: "Projects", path: "/projects", icon: Briefcase, roles: [...SALES_ROLES, ...PARTNER_ROLES], requiresInventoryAccessForPartner: true },
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
        { label: "Performance", path: "/targets", icon: Target, roles: PRODUCTION_ROLES },
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
        { label: "Team Chat", path: "/chat", icon: MessageSquare, roles: [...SALES_ROLES, ...PRODUCTION_ROLES] },
      ],
    },
  ],
  coworking: [
    {
      group: "Spaces",
      items: [
        { label: "Booking Board", path: "/coworking/booking-board", icon: LayoutGrid, roles: COWORKING_ROLES, permission: "cabins.view" },
        { label: "Clients", path: "/coworking/clients", icon: Users, roles: COWORKING_ROLES, permission: "clients.view" },
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
        { label: "Profile", path: "/profile", icon: UserCircle2, roles: [...SALES_ROLES, ...PRODUCTION_ROLES, ...PARTNER_ROLES] },
      ],
    },
  ],
};

// ---------------------------------------------------------------------------
// Sidebar model: five groups plus Coworking, replacing the icon-rail-plus-menu
// split. Items are looked up out of WORKBENCH_MENU by path rather than being
// redeclared, so every roles array, permission and partner-inventory flag is
// literally the same data this file already exported. Grouping and labels
// change here; who can see what does not.
// ---------------------------------------------------------------------------

const ALL_MENU_ITEMS = Object.values(WORKBENCH_MENU)
  .flat()
  .flatMap((group) => group.items);

const itemsAtPath = (path) => ALL_MENU_ITEMS.filter((item) => item.path === path);

/**
 * One sidebar entry per path. Where a path was declared more than once - /targets
 * is "Targets" for sales and "Performance" for production - the roles are unioned,
 * which reproduces the previous combined visibility exactly.
 */
const navItem = (path, overrides = {}) => {
  const matches = itemsAtPath(path);
  if (!matches.length) throw new Error(`workbenchNavigation: no menu item for ${path}`);
  const roles = [...new Set(matches.flatMap((item) => item.roles))];
  return { ...matches[0], roles, ...overrides };
};

const coworkingItems = (WORKBENCH_MENU.coworking || []).flatMap((group) => group.items);

export const SIDEBAR_GROUPS = [
  {
    group: "Work",
    items: [
      navItem("/dashboard", { label: "Home", icon: Home }),
      navItem("/tasks", { label: "Tasks" }),
      navItem("/calendar", { label: "Calendar" }),
      navItem("/attendance", { label: "Attendance" }),
    ],
  },
  {
    group: "Sales",
    items: [
      navItem("/leads", { label: "Pipeline" }),
      navItem("/my-leads", { label: "My Leads" }),
      navItem("/inventory", { label: "Inventory" }),
      navItem("/projects", { label: "Projects", icon: Layers }),
      navItem("/map", { label: "Field Ops" }),
    ],
  },
  {
    group: "Business",
    items: [
      navItem("/finance", { label: "Finance" }),
      navItem("/reports", { label: "Reports" }),
      navItem("/leaderboard", { label: "Leaderboard" }),
      navItem("/targets", { label: "Targets" }),
    ],
  },
  {
    group: "Team",
    items: [navItem("/chat", { label: "Chat" })],
  },
  {
    group: "Admin",
    items: [
      navItem("/admin/users", { label: "Team", icon: Users }),
      navItem("/admin/console", { label: "Console", icon: ShieldCheck }),
      navItem("/admin/meta-ads", { label: "Meta Ads" }),
      navItem("/admin/notifications", { label: "Notifications" }),
      navItem("/settings", { label: "Settings" }),
    ],
  },
  {
    // Not among the redesign five, but 24 live permission-gated routes.
    // Dropping the group would remove access, which this phase must not do.
    group: "Coworking",
    items: coworkingItems,
  },
];

export const roleCanSeeItem = (item, userRole, user = {}) => {
  if (!item?.roles?.includes(userRole)) return false;
  if (
    item.requiresInventoryAccessForPartner &&
    userRole === "CHANNEL_PARTNER" &&
    !user?.canViewInventory
  ) {
    return false;
  }
  if (item.permission && userRole !== "ADMIN") {
    const permissions = Array.isArray(user?.permissions) ? user.permissions : null;
    // Permissions haven't loaded yet (null) — don't hide the item mid-fetch,
    // avoid nav flicker; the route itself still gates on load via
    // CoworkingPermissionGate. Once loaded, enforce the real list.
    if (permissions && !permissions.includes(item.permission)) return false;
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

/**
 * Profile lives in the sidebar footer chip rather than a nav group, matching the
 * redesign. Exported so the footer can gate it on exactly the roles it always had.
 */
export const PROFILE_ITEM = navItem("/profile");

/** Groups for the collapsed two-layer shell: everything the role can reach, at once. */
export const getVisibleSidebarGroups = (userRole, user = {}) =>
  SIDEBAR_GROUPS.map((group) => ({
    ...group,
    items: group.items.filter((item) => roleCanSeeItem(item, userRole, user)),
  })).filter((group) => group.items.length > 0);
