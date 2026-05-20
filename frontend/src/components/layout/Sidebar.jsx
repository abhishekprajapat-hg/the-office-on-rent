import React from "react";
import { NavLink } from "react-router-dom";
import {
  Home,
  Users,
  Building2,
  Map,
  LogOut,
  PieChart,
  Settings,
  ClipboardList,
  Calendar,
  Navigation,
  ShieldCheck,
  Briefcase,
  Moon,
  Sun,
  MessageSquare,
  UserCircle2,
  Trophy,
  Bell,
  Megaphone,
  TerminalSquare,
  UserCheck,
} from "lucide-react";
import { motion as Motion } from "framer-motion";
import { useChatNotifications } from "../../context/useChatNotifications";

const MENU_CONFIG = {
  super_admin: [{ name: "Platform", icon: ShieldCheck, path: "/super-admin" }],
  admin: [
    { name: "Home", icon: Home, path: "/dashboard" },
    { name: "Pipeline", icon: Users, path: "/leads" },
    { name: "Attendance", icon: UserCheck, path: "/attendance" },
    { name: "Schedule", icon: Calendar, path: "/calendar" },
    { name: "Finance", icon: PieChart, path: "/finance" },
    { name: "Reports", icon: ClipboardList, path: "/reports" },
    { name: "Leaderboard", icon: Trophy, path: "/leaderboard" },
    { name: "Chat", icon: MessageSquare, path: "/chat" },
    { name: "Alerts", icon: Bell, path: "/admin/notifications" },
    { name: "Meta Ads", icon: Megaphone, path: "/admin/meta-ads" },
    { name: "Console", icon: TerminalSquare, path: "/admin/console" },
    { name: "Empire", icon: Building2, path: "/inventory" },
    { name: "Field Ops", icon: Map, path: "/map" },
    { name: "Targets", icon: PieChart, path: "/targets" },
    { name: "Profile", icon: UserCircle2, path: "/profile" },
    { name: "Access", icon: ShieldCheck, path: "/admin/users" },
    { name: "System", icon: Settings, path: "/settings" },
  ],
  manager: [
    { name: "Home", icon: Home, path: "/dashboard" },
    { name: "Schedule", icon: Calendar, path: "/calendar" },
    { name: "Attendance", icon: UserCheck, path: "/attendance" },
    { name: "Finance", icon: PieChart, path: "/finance" },
    { name: "Pipeline", icon: Users, path: "/leads" },
    { name: "Inventory", icon: Building2, path: "/inventory" },
    { name: "Field Ops", icon: Map, path: "/map" },
    { name: "Chat", icon: MessageSquare, path: "/chat" },
    { name: "Reports", icon: ClipboardList, path: "/reports" },
    { name: "Leaderboard", icon: Trophy, path: "/leaderboard" },
    { name: "Targets", icon: PieChart, path: "/targets" },
    { name: "Access", icon: ShieldCheck, path: "/admin/users" },
    { name: "Profile", icon: UserCircle2, path: "/profile" },
    { name: "System", icon: Settings, path: "/settings" },
  ],
  executive: [
    { name: "My Desk", icon: Briefcase, path: "/dashboard" },
    { name: "My Leads", icon: Users, path: "/my-leads" },
    { name: "Attendance", icon: UserCheck, path: "/attendance" },
    { name: "Inventory", icon: Building2, path: "/inventory" },
    { name: "Finance", icon: PieChart, path: "/finance" },
    { name: "Chat", icon: MessageSquare, path: "/chat" },
    { name: "Schedule", icon: Calendar, path: "/calendar" },
    { name: "Targets", icon: PieChart, path: "/targets" },
    { name: "Leaderboard", icon: Trophy, path: "/leaderboard" },
    { name: "Profile", icon: UserCircle2, path: "/profile" },
  ],
  field_agent: [
    { name: "Route", icon: Map, path: "/dashboard" },
    { name: "My Leads", icon: Users, path: "/my-leads" },
    { name: "Attendance", icon: UserCheck, path: "/attendance" },
    { name: "Inventory", icon: Building2, path: "/inventory" },
    { name: "Finance", icon: PieChart, path: "/finance" },
    { name: "Chat", icon: MessageSquare, path: "/chat" },
    { name: "Field Ops", icon: Navigation, path: "/map" },
    { name: "Schedule", icon: Calendar, path: "/calendar" },
    { name: "Targets", icon: PieChart, path: "/targets" },
    { name: "Leaderboard", icon: Trophy, path: "/leaderboard" },
    { name: "Profile", icon: UserCircle2, path: "/profile" },
  ],
  partner: [{ name: "Profile", icon: UserCircle2, path: "/profile" }],
};

const Sidebar = ({ userRole = "manager", onLogout, theme = "light", onToggleTheme }) => {
  const isDark = theme === "dark";
  const { adminRequestUnread } = useChatNotifications();
  const storedUser = (() => {
    try {
      return JSON.parse(localStorage.getItem("user") || "{}");
    } catch {
      return {};
    }
  })();
  const canChannelPartnerViewInventory = Boolean(storedUser?.canViewInventory);
  const roleKeyMap = {
    SUPER_ADMIN: "super_admin",
    ADMIN: "admin",
    MANAGER: "manager",
    ASSISTANT_MANAGER: "manager",
    TEAM_LEADER: "manager",
    EXECUTIVE: "executive",
    FIELD_EXECUTIVE: "field_agent",
    CHANNEL_PARTNER: "partner",
  };
  const normalizedRole = roleKeyMap[userRole] || "manager";
  const partnerMenu = [
    { name: "Pipeline", icon: Users, path: "/leads" },
    { name: "Attendance", icon: UserCheck, path: "/attendance" },
    ...(canChannelPartnerViewInventory
      ? [{ name: "Inventory", icon: Building2, path: "/inventory" }]
      : []),
    { name: "Finance", icon: PieChart, path: "/finance" },
    { name: "Leaderboard", icon: Trophy, path: "/leaderboard" },
    { name: "Profile", icon: UserCircle2, path: "/profile" },
  ];
  const currentMenu =
    normalizedRole === "partner"
      ? partnerMenu
      : (MENU_CONFIG[normalizedRole] || MENU_CONFIG.manager);
  const hasAdminAlerts = userRole === "ADMIN" && adminRequestUnread > 0;

  return (
    <Motion.aside
      initial={{ x: -80, opacity: 0 }}
      animate={{ x: 0, opacity: 1 }}
      transition={{ duration: 0.35 }}
      className={`fixed left-0 top-0 h-full w-20 sm:w-24 z-50 flex flex-col items-center py-3 sm:py-4 backdrop-blur-2xl border-r transition-colors ${
        isDark
          ? "bg-gradient-to-b from-slate-950/95 via-slate-900/90 to-slate-950/95 border-cyan-300/20 shadow-[0_0_80px_rgba(34,211,238,0.12)]"
          : "bg-gradient-to-b from-white/95 via-slate-100/90 to-white/95 border-slate-300/60 shadow-[0_0_40px_rgba(15,23,42,0.08)]"
      }`}
    >
      <div className="absolute inset-0 pointer-events-none">
        <div
          className={`absolute top-0 left-0 right-0 h-32 bg-gradient-to-b to-transparent ${
            isDark ? "from-cyan-300/10" : "from-sky-200/40"
          }`}
        />
      </div>

      <nav
        className="flex flex-col items-center gap-1.5 sm:gap-2 w-full px-2 sm:px-2.5 flex-1 overflow-y-auto overflow-x-visible"
      >
        {currentMenu.map((item) => (
          <NavLink
            key={item.path}
            to={item.path}
            className="group relative flex items-center justify-center w-full overflow-visible"
          >
            {({ isActive }) => (
              <div className="relative flex items-center justify-center w-10 h-10 sm:w-11 sm:h-11">
                {isActive ? (
                  <Motion.div
                    layoutId="activeRail"
                    className={`absolute inset-0 rounded-2xl border ${
                      isDark
                        ? "bg-cyan-300/15 border-cyan-200/40 shadow-[0_0_24px_rgba(34,211,238,0.35)]"
                        : "bg-sky-100 border-sky-300/70 shadow-[0_0_18px_rgba(56,189,248,0.35)]"
                    }`}
                    transition={{ type: "spring", stiffness: 300, damping: 30 }}
                  />
                ) : null}
                {isActive ? (
                  <div
                    className={`absolute -left-2.5 w-1 h-6 sm:h-7 rounded-r-full ${
                      isDark
                        ? "bg-cyan-300 shadow-[0_0_20px_rgba(34,211,238,0.7)]"
                        : "bg-sky-500 shadow-[0_0_16px_rgba(14,165,233,0.55)]"
                    }`}
                  />
                ) : null}
                <div
                  className={`relative z-10 transition-all duration-300 ${
                    isActive
                      ? isDark
                        ? "text-cyan-200 scale-110"
                        : "text-sky-600 scale-110"
                      : isDark
                        ? "text-slate-400 group-hover:text-cyan-100 group-hover:scale-110"
                        : "text-slate-500 group-hover:text-sky-500 group-hover:scale-110"
                  }`}
                >
                  <item.icon size={18} strokeWidth={isActive ? 2.05 : 1.85} />
                </div>
                {item.path === "/admin/notifications" && hasAdminAlerts ? (
                  <span
                    className={`absolute -top-1 -right-1 min-w-[16px] h-4 px-1 rounded-full text-[9px] font-bold flex items-center justify-center ${
                      isDark ? "bg-rose-500 text-white" : "bg-rose-600 text-white"
                    }`}
                  >
                    {adminRequestUnread > 99 ? "99+" : adminRequestUnread}
                  </span>
                ) : null}
                <div className="hidden sm:block absolute left-full ml-2.5 opacity-0 group-hover:opacity-100 transition-all duration-200 translate-x-[-6px] group-hover:translate-x-0 pointer-events-none z-[70]">
                  <div
                    className={`px-3 py-1.5 rounded-md shadow-xl backdrop-blur-md border ${
                      isDark
                        ? "bg-slate-900/95 border-cyan-200/30"
                        : "bg-white/95 border-slate-300/70"
                    }`}
                  >
                    <span
                      className={`text-[10px] font-display tracking-[0.2em] uppercase whitespace-nowrap ${
                        isDark ? "text-cyan-100" : "text-slate-700"
                      }`}
                    >
                      {item.name}
                    </span>
                  </div>
                </div>
              </div>
            )}
          </NavLink>
        ))}
      </nav>

      <div className="w-full flex flex-col items-center justify-center gap-1.5 sm:gap-2 pt-2">
        <button
          onClick={onToggleTheme}
          className={`w-10 h-10 sm:w-11 sm:h-11 rounded-xl flex items-center justify-center border transition-all duration-300 ${
            isDark
              ? "text-slate-300 hover:text-cyan-200 hover:bg-cyan-300/10 border-cyan-200/20 hover:border-cyan-200/40"
              : "text-slate-600 hover:text-sky-600 hover:bg-sky-200/40 border-slate-300/70 hover:border-sky-300/80"
          }`}
          title={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
        >
          {theme === "dark" ? <Sun size={16} strokeWidth={1.9} /> : <Moon size={16} strokeWidth={1.9} />}
        </button>
        <button
          onClick={onLogout}
          className={`w-10 h-10 sm:w-11 sm:h-11 rounded-xl flex items-center justify-center border transition-all duration-300 ${
            isDark
              ? "text-slate-400 hover:text-rose-300 hover:bg-rose-400/10 border-transparent hover:border-rose-300/30"
              : "text-slate-500 hover:text-rose-500 hover:bg-rose-100 border-transparent hover:border-rose-300/70"
          }`}
          title="Disconnect System"
        >
          <LogOut size={18} strokeWidth={1.8} />
        </button>
      </div>
    </Motion.aside>
  );
};

export default Sidebar;
