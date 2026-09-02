import { memo, useCallback, useMemo } from "react";
import { NavLink } from "react-router-dom";
import { ChevronLeft, ChevronRight, LogOut, X } from "lucide-react";
import { IconButton, Tooltip, cn } from "../ui";
import BrandLogo from "../common/BrandLogo";
import { PROFILE_ITEM, getVisibleSidebarGroups, roleCanSeeItem } from "./workbenchNavigation";

const initialsOf = (user) => {
  const name = String(user?.name || user?.fullName || user?.email || "").trim();
  if (!name) return "??";
  const parts = name.split(/[\s@._-]+/).filter(Boolean);
  return (parts.length > 1 ? parts[0][0] + parts[1][0] : name.slice(0, 2)).toUpperCase();
};

const PrimarySidebar = ({
  userRole,
  user,
  roleLabel,
  onLogout,
  collapsed,
  onToggleCollapsed,
  mobileOpen,
  onMobileClose,
  unreadChats = 0,
  unreadAlerts = 0,
}) => {
  const groups = useMemo(() => getVisibleSidebarGroups(userRole, user), [userRole, user]);
  const canSeeProfile = useMemo(
    () => roleCanSeeItem(PROFILE_ITEM, userRole, user),
    [userRole, user],
  );

  const badgeFor = useCallback(
    (path) => {
      if (path === "/chat") return unreadChats;
      if (path === "/admin/notifications") return unreadAlerts;
      return 0;
    },
    [unreadAlerts, unreadChats],
  );

  const renderNav = useCallback(
    (isCollapsed) => (
      <nav aria-label="Workbench navigation" className="custom-scrollbar min-h-0 flex-1 overflow-y-auto py-3">
        {groups.map((group) => (
          <div key={group.group} className="mb-3 last:mb-0">
            <p
              className={cn(
                "px-3 pb-0.5 pt-3 text-[10px] font-bold uppercase tracking-[0.11em] text-slate-500 dark:text-slate-400",
                isCollapsed && "md:sr-only",
              )}
            >
              {group.group}
            </p>
            {group.items.map((item) => {
              const Icon = item.icon;
              const badge = badgeFor(item.path);

              return (
                <NavLink
                  key={`${group.group}-${item.path}`}
                  to={item.path}
                  end={item.path === "/dashboard"}
                  onClick={onMobileClose}
                  className={({ isActive }) =>
                    cn(
                      "relative mx-2 my-px flex items-center gap-2.5 rounded-md px-2.5 py-[7px]",
                      "text-[12.8px] font-medium outline-none transition",
                      "focus-visible:ring-2 focus-visible:ring-blue-500/40",
                      isCollapsed && "md:justify-center md:px-0",
                      isActive
                        ? "bg-blue-50 font-semibold text-blue-700 dark:bg-blue-500/10 dark:text-blue-200"
                        : "text-slate-600 hover:bg-slate-50 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-slate-100",
                    )
                  }
                >
                  {({ isActive }) => (
                    <>
                      {/* 3px accent on the left edge of the active item. */}
                      {isActive ? (
                        <span
                          aria-hidden="true"
                          className="absolute -left-2 bottom-[7px] top-[7px] w-[3px] rounded-r-[3px] bg-blue-600 dark:bg-blue-400"
                        />
                      ) : null}
                      <Icon aria-hidden="true" className="shrink-0" size={16} strokeWidth={1.9} />
                      <span className={cn("truncate", isCollapsed && "md:sr-only")}>{item.label}</span>
                      {badge > 0 ? (
                        <span
                          className={cn(
                            "ml-auto flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-rose-50 px-1.5",
                            "text-[10.5px] font-bold text-rose-600 dark:bg-rose-500/15 dark:text-rose-300",
                            isCollapsed && "md:absolute md:right-1 md:top-1 md:ml-0 md:h-4 md:min-w-4 md:px-1 md:text-[9px]",
                          )}
                        >
                          {badge > 99 ? "99+" : badge}
                        </span>
                      ) : null}
                    </>
                  )}
                </NavLink>
              );
            })}
          </div>
        ))}
      </nav>
    ),
    [badgeFor, groups, onMobileClose],
  );

  const sidebar = useCallback(
    ({ mobile = false } = {}) => {
      const isCollapsed = !mobile && collapsed;

      return (
        <aside
          className={cn(
            "flex h-full shrink-0 flex-col border-r border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900",
            "transition-[width,transform] duration-200",
            mobile ? "w-72" : isCollapsed ? "md:w-16" : "md:w-[206px]",
          )}
        >
          <div className="flex h-14 items-center gap-2 px-3">
            <div className="brand-logo-frame flex h-8 w-9 shrink-0 items-center justify-center rounded-md border border-slate-200 bg-white p-0.5 dark:border-slate-700">
              <BrandLogo className="h-full w-full" />
            </div>
            <div className={cn("min-w-0 flex-1", isCollapsed && "md:hidden")}>
              <p className="truncate text-[13px] font-semibold leading-tight text-slate-900 dark:text-slate-50">
                Office on Rent
              </p>
              <p className="truncate text-[10.5px] font-medium text-slate-500 dark:text-slate-400">
                {roleLabel || "CRM Workbench"}
              </p>
            </div>
            <div className="flex shrink-0 items-center gap-1">
              {!mobile ? (
                <IconButton
                  icon={collapsed ? ChevronRight : ChevronLeft}
                  label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
                  size="sm"
                  onClick={onToggleCollapsed}
                  className="hidden border-transparent bg-transparent md:inline-flex"
                />
              ) : (
                <IconButton icon={X} label="Close navigation" size="sm" onClick={onMobileClose} />
              )}
            </div>
          </div>

          {groups.length > 0 ? (
            renderNav(isCollapsed)
          ) : (
            <div className="flex flex-1 items-center px-4 text-[12.8px] font-semibold text-rose-600 dark:text-rose-400">
              No accessible routes for this role.
            </div>
          )}

          <div className="mt-auto border-t border-slate-200 p-2 dark:border-slate-800">
            <div className={cn("flex items-center gap-2", isCollapsed && "md:flex-col md:gap-1")}>
              {canSeeProfile ? (
                <NavLink
                  to="/profile"
                  onClick={onMobileClose}
                  className={({ isActive }) =>
                    cn(
                      "flex min-w-0 flex-1 items-center gap-2.5 rounded-md p-1.5 outline-none transition",
                      "focus-visible:ring-2 focus-visible:ring-blue-500/40",
                      isActive
                        ? "bg-blue-50 dark:bg-blue-500/10"
                        : "hover:bg-slate-50 dark:hover:bg-slate-800",
                      isCollapsed && "md:flex-none md:justify-center",
                    )
                  }
                >
                  <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-blue-100 text-[10.5px] font-bold text-blue-700 dark:bg-blue-500/20 dark:text-blue-200">
                    {initialsOf(user)}
                  </span>
                  <span className={cn("min-w-0 flex-1 text-left", isCollapsed && "md:sr-only")}>
                    <span className="block truncate text-[12.5px] font-semibold leading-tight text-slate-900 dark:text-slate-100">
                      {user?.name || user?.email || "My profile"}
                    </span>
                    <span className="block truncate text-[10.5px] text-slate-500 dark:text-slate-400">
                      {roleLabel || userRole}
                    </span>
                  </span>
                </NavLink>
              ) : (
                <span className="min-w-0 flex-1" />
              )}
              <Tooltip label="Logout" side="right">
                <IconButton
                  icon={LogOut}
                  label="Logout"
                  size="sm"
                  onClick={onLogout}
                  className="border-transparent bg-transparent text-slate-500 hover:bg-rose-50 hover:text-rose-600 dark:hover:bg-rose-500/10 dark:hover:text-rose-300"
                />
              </Tooltip>
            </div>
          </div>
        </aside>
      );
    },
    [canSeeProfile, collapsed, groups.length, onLogout, onMobileClose, onToggleCollapsed, renderNav, roleLabel, user, userRole],
  );

  return (
    <>
      <div className="hidden md:block">{sidebar()}</div>
      {mobileOpen ? (
        <div className="fixed inset-0 z-[80] md:hidden">
          <button
            type="button"
            aria-label="Close navigation"
            className="absolute inset-0 bg-slate-950/40 backdrop-blur-[2px]"
            onClick={onMobileClose}
          />
          <div className="relative h-full">{sidebar({ mobile: true })}</div>
        </div>
      ) : null}
    </>
  );
};

export default memo(PrimarySidebar);
