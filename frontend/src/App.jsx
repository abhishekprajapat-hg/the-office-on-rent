import React, { useState, lazy, Suspense, useMemo, useEffect, useRef, useCallback } from "react";
import { Routes, Route, useLocation, useNavigate, Navigate } from "react-router-dom";
import api from "./services/api";
import ErrorBoundary from "./components/ErrorBoundary";
import { ChatNotificationProvider } from "./context/chatNotificationProvider";
import PermissionProvider from "./context/PermissionProvider";
import CoworkingPermissionGate from "./components/coworking/CoworkingPermissionGate";
import { updateMyLiveLocation } from "./services/userService";
import BackToTopButton from "./components/layout/BackToTopButton";
import Loader from "./components/layout/Loader";
import RouteLoadingSkeleton from "./components/layout/RouteLoadingSkeleton";
import {
  applySystemSettingsToDocument,
  getSessionTimeoutMs,
  readSystemSettings,
  SYSTEM_SETTINGS_UPDATED_EVENT,
} from "./utils/systemSettings";

/* =======================
   LAZY IMPORTS
======================= */
const WorkbenchShell = lazy(() => import("./components/workbench/WorkbenchShell"));
const Login = lazy(() => import("./components/auth/Login"));
const AdminRequestAlertToast = lazy(() => import("./components/layout/AdminRequestAlertToast"));

const ManagerDashboard = lazy(() => import("./modules/manager/ManagerDashboard"));
const ExecutiveDashboard = lazy(() => import("./modules/executive/ExecutiveDashboard"));
const FieldDashboard = lazy(() => import("./modules/field/FieldDashboard"));
const ProductionExecutiveDashboard = lazy(() => import("./modules/production/ProductionExecutiveDashboard"));
const TeamManager = lazy(() => import("./modules/admin/TeamManager"));
const UserDetailsEditor = lazy(() => import("./modules/admin/UserDetailsEditor"));
const AdminNotifications = lazy(() => import("./modules/admin/AdminNotifications"));
const AdminCommandConsole = lazy(() => import("./modules/admin/AdminCommandConsole"));
const AdminMetaAdsPanel = lazy(() => import("./modules/admin/AdminMetaAdsPanel"));
const TeamChat = lazy(() => import("./modules/chat/TeamChat"));
const ChatMessageAlertToast = lazy(() => import("./components/layout/ChatMessageAlertToast"));
const FollowUpReminderToast = lazy(() => import("./components/layout/FollowUpReminderToast"));

const LeadsMatrix = lazy(() => import("./modules/leads/LeadsMatrix"));
const AssetVault = lazy(() => import("./modules/inventory/AssetVault"));
const InventoryDetails = lazy(() => import("./modules/inventory/InventoryDetails"));
const Projects = lazy(() => import("./modules/inventory/Projects"));
const ProjectDetails = lazy(() => import("./modules/inventory/ProjectDetails"));
const FinancialCore = lazy(() => import("./modules/finance/FinancialCore"));
const FieldOps = lazy(() => import("./modules/field/FieldOps"));
const IntelligenceReports = lazy(() => import("./modules/reports/IntelligenceReports"));
const RoleLeaderboard = lazy(() => import("./modules/reports/RoleLeaderboard"));
const MasterSchedule = lazy(() => import("./modules/calendar/MasterSchedule"));
const AttendanceHub = lazy(() => import("./modules/attendance/AttendanceHub"));
const SystemSettings = lazy(() => import("./modules/admin/SystemSettings"));
const DataUseNotice = lazy(() => import("./modules/legal/DataUseNotice"));
const ServiceTermsNotice = lazy(() => import("./modules/legal/ServiceTermsNotice"));
const Performance = lazy(() => import("./modules/reports/Performance"));
const UserProfile = lazy(() => import("./modules/profile/UserProfile"));
const SharedInventoryView = lazy(() => import("./modules/inventory/SharedInventoryView"));
const TaskManager = lazy(() => import("./modules/tasks/TaskManager"));

const CoworkingDashboard = lazy(() => import("./modules/coworking/CoworkingDashboard"));
const CoworkingProperties = lazy(() => import("./modules/coworking/Properties"));
const CoworkingFloors = lazy(() => import("./modules/coworking/Floors"));
const CoworkingCabins = lazy(() => import("./modules/coworking/Cabins"));
const CoworkingSeats = lazy(() => import("./modules/coworking/Seats"));
const CoworkingClients = lazy(() => import("./modules/coworking/Clients"));
const CoworkingBookings = lazy(() => import("./modules/coworking/Bookings"));
const CoworkingContracts = lazy(() => import("./modules/coworking/Contracts"));
const CoworkingBilling = lazy(() => import("./modules/coworking/Billing"));
const CoworkingPayments = lazy(() => import("./modules/coworking/Payments"));
const CoworkingExpenses = lazy(() => import("./modules/coworking/Expenses"));
const CoworkingMeetingRooms = lazy(() => import("./modules/coworking/MeetingRooms"));
const CoworkingVisitors = lazy(() => import("./modules/coworking/Visitors"));
const CoworkingTickets = lazy(() => import("./modules/coworking/Tickets"));
const CoworkingAssets = lazy(() => import("./modules/coworking/Assets"));
const CoworkingReports = lazy(() => import("./modules/coworking/Reports"));
const CoworkingNotifications = lazy(() => import("./modules/coworking/Notifications"));
const CoworkingUsers = lazy(() => import("./modules/coworking/Users"));
const CoworkingRoles = lazy(() => import("./modules/coworking/Roles"));
const CoworkingSettings = lazy(() => import("./modules/coworking/Settings"));
const CoworkingAuditLogs = lazy(() => import("./modules/coworking/AuditLogs"));

const EARTH_RADIUS_METERS = 6371000;
const LOCATION_SYNC_MIN_INTERVAL_MS = 30000;
const LOCATION_SYNC_MIN_DISTANCE_METERS = 30;
const PUBLIC_ROUTE_PREFIXES = [
  "/privacy-policy",
  "/terms-and-conditions",
  "/data-use-notice",
  "/service-terms",
  "/shared",
];
const FORCE_LIGHT_ROUTE_PREFIXES = [
  "/login",
  "/privacy-policy",
  "/terms-and-conditions",
  "/data-use-notice",
  "/service-terms",
  "/shared",
];
const MANAGEMENT_ROLES = ["MANAGER"];
const PRODUCTION_ROLES = ["PRODUCTION_EXECUTIVE", "COMMUNITY_MANAGER"];
const COWORKING_ROLES = ["ADMIN", "MANAGER", "COWORKING_ADMIN"];
const COWORKING_PAGE_LABELS = {
  dashboard: "Dashboard",
  properties: "Properties",
  floors: "Floors",
  cabins: "Cabins",
  seats: "Seats",
  clients: "Clients",
  bookings: "Bookings",
  contracts: "Contracts",
  billing: "Billing",
  payments: "Payments",
  expenses: "Expenses",
  "meeting-rooms": "Meeting Rooms",
  visitors: "Visitors",
  tickets: "Tickets",
  assets: "Assets",
  reports: "Reports",
  notifications: "Notifications",
  users: "Users",
  roles: "Roles",
  settings: "Settings",
  "audit-logs": "Audit Logs",
};
const CHAT_REFRESH_FALLBACK_ROLES = ["EXECUTIVE", "FIELD_EXECUTIVE", ...PRODUCTION_ROLES];
const ROLE_LABELS = {
  ADMIN: "Admin",
  MANAGER: "Manager",
  EXECUTIVE: "Executive",
  FIELD_EXECUTIVE: "Field Executive",
  PRODUCTION_EXECUTIVE: "Production Executive",
  COMMUNITY_MANAGER: "Community Manager",
  CHANNEL_PARTNER: "Channel Partner",
  COWORKING_ADMIN: "Coworking admin",
};

const isProductionRole = (role) => PRODUCTION_ROLES.includes(role);

const resolveHomeHeader = (userRole) => {
  switch (userRole) {
    case "ADMIN":
      return {
        title: "Admin Command Center",
        subtitle: "System visibility, alerts and operational controls",
        scopeLabel: "Home",
      };
    case "MANAGER":
      return {
        title: "Management Command Center",
        subtitle: "Portfolio progress, team activity and execution signals",
        scopeLabel: "Home",
      };
    case "EXECUTIVE":
      return {
        title: "Executive Command Center",
        subtitle: "Lead priorities, pending actions and daily delivery focus",
        scopeLabel: "My Desk",
      };
    case "FIELD_EXECUTIVE":
      return {
        title: "Field Command Center",
        subtitle: "Ground movement, follow-up tasks and site visit execution",
        scopeLabel: "Route Desk",
      };
    case "PRODUCTION_EXECUTIVE":
      return {
        title: "Production Command Center",
        subtitle: "Tasks, deadlines, attendance and internal collaboration",
        scopeLabel: "Production Desk",
      };
    case "COMMUNITY_MANAGER":
      return {
        title: "Community Command Center",
        subtitle: "Tasks, attendance, communication and community operations",
        scopeLabel: "Community Desk",
      };
    default:
      return {
        title: "Workspace Command Center",
        subtitle: "Operational overview and daily execution snapshot",
        scopeLabel: "Home",
      };
  }
};

const resolvePageHeader = (pathname, userRole) => {
  if (!pathname) return null;
  if (pathname === "/" || pathname === "/dashboard") return resolveHomeHeader(userRole);

  if (pathname.startsWith("/leads") || pathname.startsWith("/my-leads")) {
    return {
      title: "Leads Command Center",
      subtitle: "Pipeline tracking, follow-up discipline and conversion flow",
      scopeLabel: "Pipeline",
    };
  }

  if (pathname.startsWith("/inventory")) {
    return pathname === "/inventory"
      ? {
          title: "Inventory Command Center",
          subtitle: "Asset health, approval flow and portfolio readiness",
          scopeLabel: "Empire",
        }
      : {
          title: "Property Command Center",
          subtitle: "Detailed property context, status and execution actions",
          scopeLabel: "Property Detail",
        };
  }

  if (pathname.startsWith("/finance")) {
    return {
      title: "Finance Command Center",
      subtitle: "Revenue posture, collections and financial performance",
      scopeLabel: "Finance",
    };
  }

  if (pathname.startsWith("/reports")) {
    return {
      title: "Reports Command Center",
      subtitle: "Funnel analytics, team performance and business intelligence",
      scopeLabel: "Reports",
    };
  }

  if (pathname.startsWith("/leaderboard")) {
    return {
      title: "Leaderboard Command Center",
      subtitle: "Role-level ranking, peer comparison and conversion momentum",
      scopeLabel: "Leaderboard",
    };
  }

  if (pathname.startsWith("/calendar")) {
    return {
      title: "Schedule Command Center",
      subtitle: "Meetings, reminders and execution timeline visibility",
      scopeLabel: "Schedule",
    };
  }

  if (pathname.startsWith("/attendance")) {
    return {
      title: "Attendance Command Center",
      subtitle: "Daily check-in, work-hour tracking and team attendance visibility",
      scopeLabel: "Attendance",
    };
  }

  if (pathname.startsWith("/admin/notifications")) {
    return {
      title: "Alerts Command Center",
      subtitle: "Pending approvals, escalation signals and manager actions",
      scopeLabel: "Alerts",
    };
  }

  if (pathname.startsWith("/admin/users")) {
    return {
      title: "Access Command Center",
      subtitle: "Team permissions, role governance and account controls",
      scopeLabel: "Access",
    };
  }

  if (pathname.startsWith("/admin/console")) {
    return {
      title: "Console Command Center",
      subtitle: "Run commands to inspect platform data and jump across modules",
      scopeLabel: "Console",
    };
  }

  if (pathname.startsWith("/admin/meta-ads")) {
    return {
      title: "Meta Ads Command Center",
      subtitle: "Configure page integration and monitor lead subscription sync",
      scopeLabel: "Meta Ads",
    };
  }

  if (pathname.startsWith("/settings")) {
    return {
      title: "System Command Center",
      subtitle: "Platform policy, session controls and runtime configuration",
      scopeLabel: "System",
    };
  }

  if (pathname.startsWith("/targets")) {
    if (isProductionRole(userRole)) {
      return {
        title: "Performance Command Center",
        subtitle: "Task completion, pending work and productivity signals",
        scopeLabel: "Performance",
      };
    }

    return {
      title: "Targets Command Center",
      subtitle: "Goal pacing, conversion momentum and ownership tracking",
      scopeLabel: "Targets",
    };
  }

  if (pathname.startsWith("/coworking")) {
    const segment = pathname.split("/")[2] || "dashboard";
    const pageLabel = COWORKING_PAGE_LABELS[segment] || "Coworking";
    return {
      title: `Coworking ${pageLabel}`,
      subtitle: "Coworking space, client and billing management",
      scopeLabel: "Coworking",
      breadcrumbs: [
        { label: "Coworking", path: "/coworking/dashboard" },
        { label: pageLabel },
      ],
    };
  }

  if (pathname.startsWith("/profile")) {
    return {
      title: "Profile Command Center",
      subtitle: "Identity details, account metadata and personal settings",
      scopeLabel: "Profile",
    };
  }

  return null;
};

const toRadians = (degrees) => (degrees * Math.PI) / 180;

const calculateDistanceMeters = (aLat, aLng, bLat, bLng) => {
  const dLat = toRadians(bLat - aLat);
  const dLng = toRadians(bLng - aLng);
  const lat1 = toRadians(aLat);
  const lat2 = toRadians(bLat);

  const haversine =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.sin(dLng / 2) * Math.sin(dLng / 2) * Math.cos(lat1) * Math.cos(lat2);
  const arc = 2 * Math.atan2(Math.sqrt(haversine), Math.sqrt(1 - haversine));
  return EARTH_RADIUS_METERS * arc;
};

/* =======================
   MAIN APP
======================= */
export default function App() {
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [userRole, setUserRole] = useState(null);
  const [sessionReady, setSessionReady] = useState(false);
  const [systemSettingsVersion, setSystemSettingsVersion] = useState(0);
  const [theme, setTheme] = useState(() => {
    const storedTheme = localStorage.getItem("theme");
    return storedTheme === "dark" ? "dark" : "light";
  });
  const inactivityTimerRef = useRef(null);
  const sessionTimeoutMsRef = useRef(
    getSessionTimeoutMs(readSystemSettings().security.sessionTimeoutMinutes),
  );
  const locationSyncStateRef = useRef({
    inFlight: false,
    lastSentAt: 0,
    lastLat: null,
    lastLng: null,
  });
  const chatRefreshGuardHandledRef = useRef(false);

  const location = useLocation();
  const navigate = useNavigate();
  const authUser = useMemo(() => {
    try {
      return JSON.parse(localStorage.getItem("user") || "{}");
    } catch {
      return {};
    }
  }, [isLoggedIn, userRole]);

  const isPublicPage = PUBLIC_ROUTE_PREFIXES.some((prefix) =>
    location.pathname.startsWith(prefix),
  );
  const isForcedLightPage = FORCE_LIGHT_ROUTE_PREFIXES.some((prefix) =>
    location.pathname.startsWith(prefix),
  );
  const isChatPage = location.pathname === "/chat";
  const canChannelPartnerViewInventory =
    userRole === "CHANNEL_PARTNER" && Boolean(authUser?.canViewInventory);
  const shouldLockDocumentScroll = isLoggedIn && !isPublicPage;
  const routeViewportClass = shouldLockDocumentScroll
    ? "min-h-0 flex-1 overflow-hidden"
    : "";

  useEffect(() => {
    if (!shouldLockDocumentScroll) {
      document.body.style.overflowY = "";
      document.documentElement.style.overflowY = "";
      return undefined;
    }

    const previousBodyOverflowY = document.body.style.overflowY;
    const previousHtmlOverflowY = document.documentElement.style.overflowY;
    document.body.style.overflowY = "hidden";
    document.documentElement.style.overflowY = "hidden";

    return () => {
      document.body.style.overflowY = previousBodyOverflowY;
      document.documentElement.style.overflowY = previousHtmlOverflowY;
    };
  }, [shouldLockDocumentScroll]);

  /* 🔥 Restore session after refresh */
  useEffect(() => {
    const token = localStorage.getItem("token");
    const role = localStorage.getItem("role");

    if (token && role) {
      // api.defaults.headers.common["Authorization"] = `Bearer ${token}`;
      setIsLoggedIn(true);
      setUserRole(role);
    }

    setSessionReady(true);
  }, []);

  useEffect(() => {
    const root = document.documentElement;
    const activeTheme = isForcedLightPage ? "light" : theme;

    if (isForcedLightPage && theme !== "light") {
      setTheme("light");
    }

    root.classList.remove("theme-light", "theme-dark");
    root.classList.add(activeTheme === "dark" ? "theme-dark" : "theme-light");
    localStorage.setItem("theme", activeTheme);
  }, [isForcedLightPage, theme]);

  const performInactivityLogout = useCallback(() => {
    localStorage.removeItem("token");
    localStorage.removeItem("refreshToken");
    localStorage.removeItem("role");
    localStorage.removeItem("user");
    delete api.defaults.headers.common.Authorization;
    setIsLoggedIn(false);
    setUserRole(null);
    navigate("/login");
  }, [navigate]);

  const resetInactivityTimer = useCallback(() => {
    if (inactivityTimerRef.current) {
      clearTimeout(inactivityTimerRef.current);
      inactivityTimerRef.current = null;
    }

    if (!isLoggedIn || isPublicPage) return;

    inactivityTimerRef.current = setTimeout(() => {
      performInactivityLogout();
    }, sessionTimeoutMsRef.current);
  }, [isLoggedIn, isPublicPage, performInactivityLogout]);

  useEffect(() => {
    const applyRuntimeSystemSettings = () => {
      const settings = readSystemSettings();
      sessionTimeoutMsRef.current = getSessionTimeoutMs(settings.security.sessionTimeoutMinutes);
      applySystemSettingsToDocument(settings);
      setSystemSettingsVersion((prev) => prev + 1);
    };

    applyRuntimeSystemSettings();
    window.addEventListener(SYSTEM_SETTINGS_UPDATED_EVENT, applyRuntimeSystemSettings);
    window.addEventListener("storage", applyRuntimeSystemSettings);

    return () => {
      window.removeEventListener(SYSTEM_SETTINGS_UPDATED_EVENT, applyRuntimeSystemSettings);
      window.removeEventListener("storage", applyRuntimeSystemSettings);
    };
  }, []);

  useEffect(() => {
    if (chatRefreshGuardHandledRef.current) return;
    if (!sessionReady || !isLoggedIn) return;
    if (location.pathname !== "/chat") return;
    if (!CHAT_REFRESH_FALLBACK_ROLES.includes(String(userRole || ""))) return;
    if (typeof window === "undefined") return;

    const navigationEntry = window.performance
      ?.getEntriesByType?.("navigation")
      ?.find?.((entry) => entry && typeof entry.type === "string");
    const legacyNavigationType = window.performance?.navigation?.type;
    const isReloadNavigation =
      navigationEntry?.type === "reload" || legacyNavigationType === 1;
    if (!isReloadNavigation) return;

    const isMobileViewport =
      window.matchMedia?.("(max-width: 767px)")?.matches
      ?? window.innerWidth <= 767;
    if (!isMobileViewport) return;

    chatRefreshGuardHandledRef.current = true;
    navigate("/", { replace: true });
  }, [isLoggedIn, location.pathname, navigate, sessionReady, userRole]);

  useEffect(() => {
    resetInactivityTimer();
  }, [resetInactivityTimer, systemSettingsVersion]);

  useEffect(() => {
    if (!isLoggedIn || isPublicPage) {
      if (inactivityTimerRef.current) {
        clearTimeout(inactivityTimerRef.current);
        inactivityTimerRef.current = null;
      }
      return undefined;
    }

    const activityEvents = [
      "click",
      "keydown",
      "touchstart",
      "scroll",
      "visibilitychange",
    ];

    const onActivity = () => {
      if (document.visibilityState && document.visibilityState === "hidden") return;
      resetInactivityTimer();
    };

    activityEvents.forEach((eventName) =>
      window.addEventListener(eventName, onActivity, { passive: true }));

    return () => {
      activityEvents.forEach((eventName) => window.removeEventListener(eventName, onActivity));
      if (inactivityTimerRef.current) {
        clearTimeout(inactivityTimerRef.current);
        inactivityTimerRef.current = null;
      }
    };
  }, [isLoggedIn, isPublicPage, resetInactivityTimer]);

  useEffect(() => {
    if (!isLoggedIn || userRole !== "FIELD_EXECUTIVE") return undefined;
    if (typeof navigator === "undefined" || !navigator.geolocation) return undefined;

    let alive = true;
    locationSyncStateRef.current = {
      inFlight: false,
      lastSentAt: 0,
      lastLat: null,
      lastLng: null,
    };

    const sendLocationUpdate = async (coords) => {
      if (!alive) return;

      const latitude = Number(coords?.latitude);
      const longitude = Number(coords?.longitude);
      if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return;

      const now = Date.now();
      const state = locationSyncStateRef.current;
      const hasPrevious = Number.isFinite(state.lastLat) && Number.isFinite(state.lastLng);

      let movedDistance = Number.POSITIVE_INFINITY;
      if (hasPrevious) {
        movedDistance = calculateDistanceMeters(
          state.lastLat,
          state.lastLng,
          latitude,
          longitude,
        );
      }

      const intervalSinceLastSend = now - Number(state.lastSentAt || 0);
      const shouldSend =
        !hasPrevious ||
        intervalSinceLastSend >= LOCATION_SYNC_MIN_INTERVAL_MS ||
        movedDistance >= LOCATION_SYNC_MIN_DISTANCE_METERS;

      if (!shouldSend || state.inFlight) return;

      state.inFlight = true;
      try {
        await updateMyLiveLocation({
          lat: latitude,
          lng: longitude,
          accuracy: Number.isFinite(coords?.accuracy) ? Number(coords.accuracy) : null,
          heading: Number.isFinite(coords?.heading) ? Number(coords.heading) : null,
          speed: Number.isFinite(coords?.speed) ? Number(coords.speed) : null,
        });

        state.lastLat = latitude;
        state.lastLng = longitude;
        state.lastSentAt = now;
      } catch {
        // Keep background sync silent to avoid blocking app flow.
      } finally {
        state.inFlight = false;
      }
    };

    const locationOptions = {
      enableHighAccuracy: true,
      maximumAge: 15000,
      timeout: 20000,
    };

    navigator.geolocation.getCurrentPosition(
      (position) => {
        sendLocationUpdate(position.coords);
      },
      () => {
        // Geolocation can be denied; keep app usable without location streaming.
      },
      locationOptions,
    );

    const watchId = navigator.geolocation.watchPosition(
      (position) => {
        sendLocationUpdate(position.coords);
      },
      () => {
        // Geolocation can be denied; keep app usable without location streaming.
      },
      locationOptions,
    );

    return () => {
      alive = false;
      if (watchId !== null && watchId !== undefined) {
        navigator.geolocation.clearWatch(watchId);
      }
    };
  }, [isLoggedIn, userRole]);

  /* 🔥 Dashboard by role */
  const DashboardByRole = useMemo(() => {
    switch (userRole) {
      case "ADMIN":
        return <ManagerDashboard theme={theme} />;
      case "MANAGER":
        return <ManagerDashboard theme={theme} />;
      case "EXECUTIVE":
        return <ExecutiveDashboard />;
      case "FIELD_EXECUTIVE":
        return <FieldDashboard />;
      case "PRODUCTION_EXECUTIVE":
      case "COMMUNITY_MANAGER":
        return <ProductionExecutiveDashboard />;
      case "CHANNEL_PARTNER":
        return <Navigate to="/leads" />;
      case "COWORKING_ADMIN":
        return <Navigate to="/coworking/dashboard" />;
      default:
        return <Navigate to="/login" />;
    }
  }, [userRole, theme]);

  /* 🔥 Logout */
  const handleLogout = useCallback(async () => {
    const refreshToken = localStorage.getItem("refreshToken");

    try {
      await api.post("/auth/logout", {
        refreshToken: refreshToken || undefined,
      });
    } catch {
      // Logout should always clear local session, even if network call fails.
    }

    localStorage.removeItem("token");
    localStorage.removeItem("refreshToken");
    localStorage.removeItem("role");
    localStorage.removeItem("user");
    delete api.defaults.headers.common["Authorization"];
    setIsLoggedIn(false);
    setUserRole(null);
    navigate("/login");
  }, [navigate]);

  const canAccess = useCallback(
    (allowedRoles) => userRole === "ADMIN" || allowedRoles.includes(userRole),
    [userRole],
  );

  const toggleTheme = useCallback(() => {
    setTheme((prev) => (prev === "dark" ? "light" : "dark"));
  }, []);

  const pageHeader = useMemo(
    () => resolvePageHeader(location.pathname, userRole),
    [location.pathname, userRole],
  );
  const roleLabel = ROLE_LABELS[userRole] || userRole || "Workspace";
  const appRoutes = useMemo(() => (
    <Routes>
      <Route path="/" element={DashboardByRole} />
      <Route path="/dashboard" element={DashboardByRole} />
      <Route
        path="/leads"
        element={canAccess(["ADMIN", ...MANAGEMENT_ROLES, "EXECUTIVE", "FIELD_EXECUTIVE", "CHANNEL_PARTNER"]) ? <LeadsMatrix /> : <Navigate to="/" />}
      />
      <Route
        path="/leads/:leadId"
        element={canAccess(["ADMIN", ...MANAGEMENT_ROLES, "EXECUTIVE", "FIELD_EXECUTIVE", "CHANNEL_PARTNER"]) ? <LeadsMatrix /> : <Navigate to="/" />}
      />
      <Route
        path="/my-leads"
        element={
          canAccess(["EXECUTIVE", "FIELD_EXECUTIVE"]) ? <LeadsMatrix /> : <Navigate to="/" />
        }
      />
      <Route
        path="/my-leads/:leadId"
        element={canAccess(["EXECUTIVE", "FIELD_EXECUTIVE"]) ? <LeadsMatrix /> : <Navigate to="/" />}
      />
      <Route
        path="/inventory"
        element={(
          canAccess(["ADMIN", ...MANAGEMENT_ROLES, "EXECUTIVE", "FIELD_EXECUTIVE", "CHANNEL_PARTNER"])
          && (userRole !== "CHANNEL_PARTNER" || canChannelPartnerViewInventory)
        ) ? <AssetVault /> : <Navigate to="/" />}
      />
      <Route
        path="/inventory/:id"
        element={(
          canAccess(["ADMIN", ...MANAGEMENT_ROLES, "EXECUTIVE", "FIELD_EXECUTIVE", "CHANNEL_PARTNER"])
          && (userRole !== "CHANNEL_PARTNER" || canChannelPartnerViewInventory)
        ) ? <InventoryDetails /> : <Navigate to="/" />}
      />
      <Route
        path="/projects"
        element={(
          canAccess(["ADMIN", ...MANAGEMENT_ROLES, "EXECUTIVE", "FIELD_EXECUTIVE", "CHANNEL_PARTNER"])
          && (userRole !== "CHANNEL_PARTNER" || canChannelPartnerViewInventory)
        ) ? <Projects /> : <Navigate to="/" />}
      />
      <Route
        path="/projects/:id"
        element={(
          canAccess(["ADMIN", ...MANAGEMENT_ROLES, "EXECUTIVE", "FIELD_EXECUTIVE", "CHANNEL_PARTNER"])
          && (userRole !== "CHANNEL_PARTNER" || canChannelPartnerViewInventory)
        ) ? <ProjectDetails /> : <Navigate to="/" />}
      />
      <Route
        path="/finance"
        element={canAccess([
          ...MANAGEMENT_ROLES,
          "EXECUTIVE",
          "FIELD_EXECUTIVE",
          "CHANNEL_PARTNER",
        ]) ? <FinancialCore /> : <Navigate to="/" />}
      />
      <Route
        path="/map"
        element={canAccess(["ADMIN", ...MANAGEMENT_ROLES, "FIELD_EXECUTIVE"]) ? <FieldOps /> : <Navigate to="/" />}
      />
      <Route
        path="/reports"
        element={canAccess(["ADMIN", "MANAGER"]) ? <IntelligenceReports /> : <Navigate to="/" />}
      />
      <Route
        path="/leaderboard"
        element={canAccess(["ADMIN", ...MANAGEMENT_ROLES, "EXECUTIVE", "FIELD_EXECUTIVE", "CHANNEL_PARTNER"]) ? <RoleLeaderboard /> : <Navigate to="/" />}
      />
      <Route
        path="/calendar"
        element={canAccess(["ADMIN", ...MANAGEMENT_ROLES, "EXECUTIVE", "FIELD_EXECUTIVE"]) ? <MasterSchedule /> : <Navigate to="/" />}
      />
      <Route
        path="/tasks"
        element={
          canAccess(["ADMIN", ...MANAGEMENT_ROLES, "EXECUTIVE", "FIELD_EXECUTIVE", ...PRODUCTION_ROLES])
            ? <TaskManager theme={theme} />
            : <Navigate to="/" />
        }
      />
      <Route
        path="/attendance"
        element={canAccess(["ADMIN", ...MANAGEMENT_ROLES, "EXECUTIVE", "FIELD_EXECUTIVE", ...PRODUCTION_ROLES, "CHANNEL_PARTNER"]) ? <AttendanceHub /> : <Navigate to="/" />}
      />
      <Route
        path="/admin/notifications"
        element={["ADMIN", "MANAGER"].includes(userRole) ? <AdminNotifications /> : <Navigate to="/" />}
      />
      <Route
        path="/admin/users"
        element={canAccess(["ADMIN", ...MANAGEMENT_ROLES]) ? <TeamManager theme={theme} /> : <Navigate to="/" />}
      />
      <Route
        path="/admin/users/:userId"
        element={["ADMIN", "MANAGER"].includes(userRole) ? <UserDetailsEditor theme={theme} /> : <Navigate to="/" />}
      />
      <Route
        path="/admin/console"
        element={["ADMIN", "MANAGER"].includes(userRole) ? <AdminCommandConsole /> : <Navigate to="/" />}
      />
      <Route
        path="/admin/meta-ads"
        element={["ADMIN", "MANAGER"].includes(userRole) ? <AdminMetaAdsPanel theme={theme} /> : <Navigate to="/" />}
      />
      <Route
        path="/settings"
        element={canAccess(["ADMIN", "MANAGER"]) ? <SystemSettings /> : <Navigate to="/" />}
      />
      <Route
        path="/targets"
        element={
          isProductionRole(userRole)
            ? <ProductionExecutiveDashboard mode="performance" />
            : canAccess(["ADMIN", ...MANAGEMENT_ROLES, "EXECUTIVE", "FIELD_EXECUTIVE"])
              ? <Performance />
              : <Navigate to="/" />
        }
      />
      <Route
        path="/chat"
        element={
          canAccess(["ADMIN", ...MANAGEMENT_ROLES, "EXECUTIVE", "FIELD_EXECUTIVE", ...PRODUCTION_ROLES])
            ? <TeamChat theme={theme} />
            : <Navigate to="/" />
        }
      />
      <Route
        path="/profile"
        element={
          canAccess([
            "ADMIN",
            ...MANAGEMENT_ROLES,
            "EXECUTIVE",
            "FIELD_EXECUTIVE",
            ...PRODUCTION_ROLES,
            "CHANNEL_PARTNER",
          ])
            ? <UserProfile />
            : <Navigate to="/" />
        }
      />
      <Route
        path="/coworking"
        element={<Navigate to="/coworking/dashboard" replace />}
      />
      <Route
        path="/coworking/dashboard"
        element={canAccess(COWORKING_ROLES) ? (
          <CoworkingPermissionGate permission="dashboard.view"><CoworkingDashboard /></CoworkingPermissionGate>
        ) : <Navigate to="/" />}
      />
      <Route
        path="/coworking/properties"
        element={canAccess(COWORKING_ROLES) ? (
          <CoworkingPermissionGate permission="properties.view"><CoworkingProperties /></CoworkingPermissionGate>
        ) : <Navigate to="/" />}
      />
      <Route
        path="/coworking/floors"
        element={canAccess(COWORKING_ROLES) ? <CoworkingFloors /> : <Navigate to="/" />}
      />
      <Route
        path="/coworking/cabins"
        element={canAccess(COWORKING_ROLES) ? (
          <CoworkingPermissionGate permission="cabins.view"><CoworkingCabins /></CoworkingPermissionGate>
        ) : <Navigate to="/" />}
      />
      <Route
        path="/coworking/seats"
        element={canAccess(COWORKING_ROLES) ? (
          <CoworkingPermissionGate permission="seats.view"><CoworkingSeats /></CoworkingPermissionGate>
        ) : <Navigate to="/" />}
      />
      <Route
        path="/coworking/clients"
        element={canAccess(COWORKING_ROLES) ? (
          <CoworkingPermissionGate permission="clients.view"><CoworkingClients /></CoworkingPermissionGate>
        ) : <Navigate to="/" />}
      />
      <Route
        path="/coworking/bookings"
        element={canAccess(COWORKING_ROLES) ? (
          <CoworkingPermissionGate permission="bookings.view"><CoworkingBookings /></CoworkingPermissionGate>
        ) : <Navigate to="/" />}
      />
      <Route
        path="/coworking/contracts"
        element={canAccess(COWORKING_ROLES) ? (
          <CoworkingPermissionGate permission="contracts.view"><CoworkingContracts /></CoworkingPermissionGate>
        ) : <Navigate to="/" />}
      />
      <Route
        path="/coworking/billing"
        element={canAccess(COWORKING_ROLES) ? (
          <CoworkingPermissionGate permission="billing.view"><CoworkingBilling /></CoworkingPermissionGate>
        ) : <Navigate to="/" />}
      />
      <Route
        path="/coworking/payments"
        element={canAccess(COWORKING_ROLES) ? (
          <CoworkingPermissionGate permission="payments.view"><CoworkingPayments /></CoworkingPermissionGate>
        ) : <Navigate to="/" />}
      />
      <Route
        path="/coworking/expenses"
        element={canAccess(COWORKING_ROLES) ? (
          <CoworkingPermissionGate permission="expenses.view"><CoworkingExpenses /></CoworkingPermissionGate>
        ) : <Navigate to="/" />}
      />
      <Route
        path="/coworking/meeting-rooms"
        element={canAccess(COWORKING_ROLES) ? <CoworkingMeetingRooms /> : <Navigate to="/" />}
      />
      <Route
        path="/coworking/visitors"
        element={canAccess(COWORKING_ROLES) ? <CoworkingVisitors /> : <Navigate to="/" />}
      />
      <Route
        path="/coworking/tickets"
        element={canAccess(COWORKING_ROLES) ? <CoworkingTickets /> : <Navigate to="/" />}
      />
      <Route
        path="/coworking/assets"
        element={canAccess(COWORKING_ROLES) ? <CoworkingAssets /> : <Navigate to="/" />}
      />
      <Route
        path="/coworking/reports"
        element={canAccess(COWORKING_ROLES) ? (
          <CoworkingPermissionGate permission="reports.view"><CoworkingReports /></CoworkingPermissionGate>
        ) : <Navigate to="/" />}
      />
      <Route
        path="/coworking/notifications"
        element={canAccess(COWORKING_ROLES) ? <CoworkingNotifications /> : <Navigate to="/" />}
      />
      <Route
        path="/coworking/users"
        element={canAccess(COWORKING_ROLES) ? (
          <CoworkingPermissionGate permission="users.view"><CoworkingUsers /></CoworkingPermissionGate>
        ) : <Navigate to="/" />}
      />
      <Route
        path="/coworking/roles"
        element={canAccess(COWORKING_ROLES) ? (
          <CoworkingPermissionGate permission="roles.view"><CoworkingRoles /></CoworkingPermissionGate>
        ) : <Navigate to="/" />}
      />
      <Route
        path="/coworking/settings"
        element={canAccess(COWORKING_ROLES) ? <CoworkingSettings /> : <Navigate to="/" />}
      />
      <Route
        path="/coworking/audit-logs"
        element={canAccess(COWORKING_ROLES) ? (
          <CoworkingPermissionGate permission="audit_logs.view"><CoworkingAuditLogs /></CoworkingPermissionGate>
        ) : <Navigate to="/" />}
      />
      <Route path="/privacy-policy" element={<DataUseNotice />} />
      <Route path="/terms-and-conditions" element={<ServiceTermsNotice />} />
      <Route path="/data-use-notice" element={<DataUseNotice />} />
      <Route path="/service-terms" element={<ServiceTermsNotice />} />
      <Route path="/shared/inventory/:shareToken" element={<SharedInventoryView />} />
      <Route path="/portal/*" element={<Navigate to="/" replace />} />
    </Routes>
  ), [
    DashboardByRole,
    canAccess,
    canChannelPartnerViewInventory,
    theme,
    userRole,
  ]);

  if (!sessionReady && !isPublicPage) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-void text-slate-400 text-sm" aria-busy="true" aria-live="polite">
        <div className="flex items-center gap-3 rounded-full border border-slate-200 bg-white px-4 py-3 text-slate-900 shadow-sm">
          <Loader />
          <span>Restoring session...</span>
        </div>
      </div>
    );
  }

  return (
    <div
      className={`workspace-app flex relative bg-void overflow-x-hidden ${
        isChatPage ? "h-dvh overflow-hidden" : "min-h-screen"
      }`}
    >

      <PermissionProvider enabled={isLoggedIn && !isPublicPage} userRole={userRole}>
      <ChatNotificationProvider enabled={isLoggedIn && !isPublicPage}>
        <ErrorBoundary>
          <Suspense fallback={<RouteLoadingSkeleton compact={isPublicPage} />}>
            <Routes>

          {/* ================= LOGIN ROUTES ================= */}

          <Route
            path="/login"
            element={
              !sessionReady
                ? <RouteLoadingSkeleton compact />
                : isLoggedIn
                ? <Navigate to="/" />
                : <Login portal="GENERAL" onLogin={(role) => {
                    setUserRole(role);
                    setIsLoggedIn(true);
                  }} />
            }
          />

          <Route
            path="/login/admin"
            element={
              !sessionReady
                ? <RouteLoadingSkeleton compact />
                : isLoggedIn
                ? <Navigate to="/" />
                : <Login portal="ADMIN" onLogin={(role) => {
                    setUserRole(role);
                    setIsLoggedIn(true);
                  }} />
            }
          />

          {/* ================= PROTECTED APP ================= */}

          <Route
            path="/*"
            element={
              isLoggedIn || isPublicPage ? (
                isPublicPage ? (
                  <main className="workspace-main relative min-h-0 flex flex-1 flex-col overflow-hidden app-page-bg">
                    <div className={routeViewportClass}>
                      {appRoutes}
                    </div>
                  </main>
                ) : (
                  <>
                    <WorkbenchShell
                      userRole={userRole}
                      user={authUser}
                      roleLabel={roleLabel}
                      theme={theme}
                      onToggleTheme={toggleTheme}
                      onLogout={handleLogout}
                      pageHeader={pageHeader}
                      isChatPage={isChatPage}
                      shouldLockDocumentScroll={shouldLockDocumentScroll}
                    >
                      {appRoutes}
                    </WorkbenchShell>
                    <ChatMessageAlertToast />
                    <FollowUpReminderToast enabled={isLoggedIn && !isPublicPage} />
                    {["ADMIN", "MANAGER"].includes(userRole) ? (
                      <AdminRequestAlertToast userRole={userRole} />
                    ) : null}
                  </>
                )
              ) : (
                <Navigate to="/login" />
              )
            }
          />

            </Routes>
          </Suspense>
        </ErrorBoundary>
        <BackToTopButton />
      </ChatNotificationProvider>
      </PermissionProvider>
    </div>
  );
}
