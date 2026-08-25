import {
  Armchair,
  BarChart3,
  Bell,
  Boxes,
  Briefcase,
  Building,
  Building2,
  CalendarCheck,
  Calendar,
  CheckSquare,
  ClipboardList,
  CreditCard,
  DoorOpen,
  FileSignature,
  Home,
  Layers,
  Map,
  Megaphone,
  MessageSquare,
  PieChart,
  Presentation,
  Receipt,
  Settings,
  ShieldCheck,
  Target,
  TerminalSquare,
  Ticket,
  Trophy,
  UserCheck,
  UserCircle2,
  UserCog,
  Users,
  Wallet,
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
        { label: "Dashboard", path: "/coworking/dashboard", icon: Home, roles: COWORKING_ROLES, permission: "dashboard.view" },
        { label: "Properties", path: "/coworking/properties", icon: Building2, roles: COWORKING_ROLES, permission: "properties.view" },
        { label: "Floors", path: "/coworking/floors", icon: Layers, roles: COWORKING_ROLES },
        { label: "Cabins", path: "/coworking/cabins", icon: DoorOpen, roles: COWORKING_ROLES, permission: "cabins.view" },
        { label: "Seats", path: "/coworking/seats", icon: Armchair, roles: COWORKING_ROLES, permission: "seats.view" },
      ],
    },
    {
      group: "Clients & Bookings",
      items: [
        { label: "Clients", path: "/coworking/clients", icon: Users, roles: COWORKING_ROLES, permission: "clients.view" },
        { label: "Bookings", path: "/coworking/bookings", icon: CalendarCheck, roles: COWORKING_ROLES, permission: "bookings.view" },
        { label: "Contracts", path: "/coworking/contracts", icon: FileSignature, roles: COWORKING_ROLES, permission: "contracts.view" },
      ],
    },
    {
      group: "Finance",
      items: [
        { label: "Billing", path: "/coworking/billing", icon: Receipt, roles: COWORKING_ROLES, permission: "billing.view" },
        { label: "Payments", path: "/coworking/payments", icon: CreditCard, roles: COWORKING_ROLES, permission: "payments.view" },
        { label: "Expenses", path: "/coworking/expenses", icon: Wallet, roles: COWORKING_ROLES, permission: "expenses.view" },
      ],
    },
    {
      group: "Operations",
      items: [
        { label: "Meeting Rooms", path: "/coworking/meeting-rooms", icon: Presentation, roles: COWORKING_ROLES, permission: "meeting_rooms.view" },
        { label: "Visitors", path: "/coworking/visitors", icon: UserCheck, roles: COWORKING_ROLES, permission: "visitors.view" },
        { label: "Tickets", path: "/coworking/tickets", icon: Ticket, roles: COWORKING_ROLES, permission: "tickets.view" },
        { label: "Assets", path: "/coworking/assets", icon: Boxes, roles: COWORKING_ROLES, permission: "assets.view" },
      ],
    },
    {
      group: "Insights",
      items: [
        { label: "Reports", path: "/coworking/reports", icon: BarChart3, roles: COWORKING_ROLES, permission: "reports.view" },
        { label: "Notifications", path: "/coworking/notifications", icon: Bell, roles: COWORKING_ROLES, permission: "notifications.view" },
      ],
    },
    {
      group: "Administration",
      items: [
        { label: "Users", path: "/coworking/users", icon: UserCog, roles: COWORKING_ROLES, permission: "users.view" },
        { label: "Roles", path: "/coworking/roles", icon: ShieldCheck, roles: COWORKING_ROLES, permission: "roles.view" },
        { label: "Settings", path: "/coworking/settings", icon: Settings, roles: COWORKING_ROLES, permission: "settings.view" },
        { label: "Audit Logs", path: "/coworking/audit-logs", icon: ClipboardList, roles: COWORKING_ROLES, permission: "audit_logs.view" },
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
