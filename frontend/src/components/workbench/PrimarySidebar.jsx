import { NavLink, useLocation } from "react-router-dom";
import { ChevronLeft, ChevronRight, LogOut, Moon, Sun, X } from "lucide-react";
import { IconButton, cn } from "../ui";
import {
  getActiveSectionId,
  getDrawerMenuGroups,
  getVisibleMenuGroups,
} from "./workbenchNavigation";

const PrimarySidebar = ({
  userRole,
  user,
  theme,
  onToggleTheme,
  onLogout,
  collapsed,
  onToggleCollapsed,
  mobileOpen,
  onMobileClose,
}) => {
  const location = useLocation();
  const activeSectionId = getActiveSectionId(location.pathname, userRole, user);
  const desktopGroups = getVisibleMenuGroups(activeSectionId, userRole, user);
  const drawerGroups = getDrawerMenuGroups(userRole, user);

  const renderNavGroups = (groups, isCollapsed = false) => (
    <nav aria-label="Section navigation" className="custom-scrollbar min-h-0 flex-1 overflow-y-auto p-3">
      {groups.map((group) => (
        <div key={group.group} className="mb-4 last:mb-0">
          <p
            className={cn(
              "mb-2 px-2 text-[10px] font-bold uppercase tracking-[0.16em] text-slate-400 dark:text-slate-500",
              isCollapsed && "md:sr-only",
            )}
          >
            {group.group}
          </p>
          <div className="space-y-1">
            {group.items.map((item) => {
              const Icon = item.icon;
              return (
                <NavLink
                  key={item.path}
                  to={item.path}
                  onClick={onMobileClose}
                  className={({ isActive }) =>
                    cn(
                      "group flex h-10 items-center gap-2 rounded-xl border px-2 text-sm font-semibold outline-none transition",
                      "focus-visible:ring-2 focus-visible:ring-blue-500/40",
                      isCollapsed && "md:justify-center md:px-0",
                      isActive
                        ? "border-blue-200 bg-blue-50 text-blue-700 dark:border-blue-500/30 dark:bg-blue-500/10 dark:text-blue-200"
                        : "border-transparent text-slate-600 hover:border-slate-200 hover:bg-slate-100 hover:text-slate-950 dark:text-slate-400 dark:hover:border-slate-700 dark:hover:bg-slate-900 dark:hover:text-slate-100",
                    )
                  }
                >
                  <Icon aria-hidden="true" className="shrink-0" size={17} />
                  <span className={cn("truncate", isCollapsed && "md:sr-only")}>{item.label}</span>
                </NavLink>
              );
            })}
          </div>
        </div>
      ))}
    </nav>
  );

  const sidebar = (groups, { mobile = false } = {}) => (
    <aside
      className={cn(
        "flex h-full shrink-0 flex-col border-r border-slate-200 bg-white/95 shadow-crm-soft backdrop-blur-xl dark:border-slate-800 dark:bg-slate-950/95",
        "transition-[width,transform] duration-200",
        mobile ? "w-72" : collapsed ? "md:w-16" : "md:w-64",
      )}
    >
      <div className="flex h-14 items-center justify-between gap-2 border-b border-slate-100 px-3 dark:border-slate-800">
        <div className={cn("min-w-0 flex-1", !mobile && collapsed && "md:hidden")}>
          <p className="truncate text-[11px] font-extrabold uppercase tracking-[0.08em] text-[#009FA8]">
            The Office On Rent
          </p>
          <p className="truncate text-xs font-semibold text-slate-500 dark:text-slate-400">
            CRM Workbench
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <IconButton
            icon={theme === "dark" ? Sun : Moon}
            label={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
            size="sm"
            onClick={onToggleTheme}
            className={mobile ? "" : "md:hidden"}
          />
          {!mobile ? (
            <IconButton
              icon={collapsed ? ChevronRight : ChevronLeft}
              label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
              size="sm"
              onClick={onToggleCollapsed}
              className="hidden md:inline-flex"
            />
          ) : null}
          <IconButton
            icon={X}
            label="Close navigation"
            size="sm"
            onClick={onMobileClose}
            className={mobile ? "" : "md:hidden"}
          />
        </div>
      </div>

      {groups.length > 0 ? (
        renderNavGroups(groups, !mobile && collapsed)
      ) : (
        <div className="flex flex-1 items-center px-5 text-sm font-semibold text-slate-500 dark:text-slate-400">
          No extra tabs available
        </div>
      )}

      <div className={cn("border-t border-slate-100 p-3 dark:border-slate-800", !mobile && "hidden")}>
        <button
          type="button"
          onClick={onLogout}
          className="flex h-10 w-full items-center gap-2 rounded-xl border border-rose-200 bg-rose-50 px-3 text-sm font-bold text-rose-700 outline-none transition hover:bg-rose-100 focus-visible:ring-2 focus-visible:ring-rose-500/30 dark:border-rose-500/30 dark:bg-rose-500/10 dark:text-rose-200"
        >
          <LogOut aria-hidden="true" size={17} />
          <span>Logout</span>
        </button>
      </div>
    </aside>
  );

  return (
    <>
      <div className="hidden md:block">{sidebar(desktopGroups)}</div>
      {mobileOpen ? (
        <div className="fixed inset-0 z-[80] md:hidden">
          <button
            type="button"
            aria-label="Close navigation"
            className="absolute inset-0 bg-slate-950/40 backdrop-blur-[2px]"
            onClick={onMobileClose}
          />
          <div className="relative h-full">{sidebar(drawerGroups, { mobile: true })}</div>
        </div>
      ) : null}
    </>
  );
};

export default PrimarySidebar;
