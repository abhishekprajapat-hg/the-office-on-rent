import { memo } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import BrandLogo from "../common/BrandLogo";
import { Bell, User as UserIcon } from "lucide-react";
import { Menu, Moon, Sun } from "lucide-react";
import { Breadcrumbs } from "../crm";
import { IconButton, cn } from "../ui";

const titleOf = (pageHeader = {}) => {
  const raw = String(pageHeader?.title || "Workspace").trim();
  const clean = raw
    .replace(/\s+Command\s+Center$/i, "")
    .replace(/\s+Dashboard$/i, "")
    .trim();

  if (pageHeader?.scopeLabel === "Empire" || clean.toLowerCase() === "inventory") return "Inventory";
  return clean || "Workspace";
};

/**
 * The single context bar. Title and breadcrumb on the left, then the page's own
 * actions. Replaces the old TopNavigation section rail, which the grouped
 * sidebar now covers.
 */
const AppTopCommandBar = ({
  pageHeader,
  theme,
  onToggleTheme,
  onMenuOpen,
  actions,
  className,
  user,
  unreadAlerts = 0,
}) => {
  const location = useLocation();
  const navigate = useNavigate();
  const isTasks = location.pathname === "/tasks";
  const initials = String(user?.name || "").split(/\s+/).filter(Boolean).map(part => part[0]).slice(0, 2).join("").toUpperCase();
  const title = titleOf(pageHeader);
  const isDark = theme === "dark";

  return (
    <header
      className={cn(
        "flex h-12 shrink-0 items-center gap-3 border-b border-slate-200 bg-white px-3 sm:px-4",
        "dark:border-slate-800 dark:bg-slate-900",
        className,
      )}
    >
      <IconButton
        icon={Menu}
        label="Open navigation"
        size="sm"
        onClick={onMenuOpen}
        className="shrink-0 border-transparent bg-transparent md:hidden"
      />

      <BrandLogo className="h-9 w-12 shrink-0 rounded-lg border border-slate-200 p-1 md:hidden" />

      <div className="flex min-w-0 items-center gap-2">
        {pageHeader?.breadcrumbs?.length ? (
          <Breadcrumbs items={pageHeader.breadcrumbs} className="hidden lg:flex" />
        ) : null}
        <h1
          className="truncate text-sm font-semibold tracking-[-0.018em] text-slate-900 dark:text-slate-50"
          title={title}
        >
          {isTasks ? "Tasks" : title}
        </h1>
      </div>

      <div className="ml-auto flex shrink-0 items-center gap-2">
        {actions}
        <div className="flex items-center gap-2 md:hidden">
          {["ADMIN", "MANAGER"].includes(user?.role) && <button type="button" aria-label="Open notifications" onClick={() => navigate("/admin/notifications")} className="relative rounded-full p-2 text-slate-600 dark:text-slate-200">
            <Bell size={22} />
            {unreadAlerts > 0 && <span className="absolute right-1 top-1 h-2 w-2 rounded-full bg-red-500" />}
          </button>}
          <button type="button" aria-label="Open profile" onClick={() => navigate("/profile")} className="flex h-9 w-9 items-center justify-center rounded-full bg-indigo-50 font-bold text-indigo-700">{initials || <UserIcon />}</button>
        </div>
        <IconButton
          icon={isDark ? Sun : Moon}
          label={isDark ? "Switch to light mode" : "Switch to dark mode"}
          size="sm"
          onClick={onToggleTheme}
          aria-pressed={isDark}
          className="border-slate-300 bg-slate-50 text-slate-700 hover:border-blue-300 hover:bg-blue-50 hover:text-blue-700 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-200 dark:hover:border-blue-500/60 dark:hover:bg-blue-500/10 dark:hover:text-blue-200"
        />
      </div>
    </header>
  );
};

export default memo(AppTopCommandBar);
