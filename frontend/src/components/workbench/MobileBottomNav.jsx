import { Link, useLocation } from "react-router-dom";
import { MoreHorizontal } from "lucide-react";
import { cn } from "../ui";
import { getActiveSectionId, getVisibleMenuGroups, getVisibleSections } from "./workbenchNavigation";

const getSectionTarget = (sectionId, userRole, user) => {
  const groups = getVisibleMenuGroups(sectionId, userRole, user);
  return groups[0]?.items[0]?.path || "/dashboard";
};

const DEFAULT_PRIORITY_SECTIONS = ["leads", "inventory", "chat", "calendar"];
const PRODUCTION_PRIORITY_SECTIONS = ["dashboard", "reports", "chat", "settings"];

const MobileBottomNav = ({
  userRole,
  user,
  unreadAlerts = 0,
  onMore,
}) => {
  const location = useLocation();
  const sections = getVisibleSections(userRole, user);
  const activeSectionId = getActiveSectionId(location.pathname, userRole, user);
  const prioritySectionIds =
    userRole === "PRODUCTION_EXECUTIVE"
      ? PRODUCTION_PRIORITY_SECTIONS
      : DEFAULT_PRIORITY_SECTIONS;
  const priority = prioritySectionIds
    .map((id) => sections.find((section) => section.id === id))
    .filter(Boolean)
    .slice(0, 4);
  const priorityIds = priority.map((section) => section.id);
  const moreActive = !priorityIds.includes(activeSectionId);

  return (
    <nav
      aria-label="Mobile workbench"
      className="shrink-0 border-b border-slate-200 bg-white/95 px-2 py-1.5 shadow-sm backdrop-blur-xl dark:border-slate-800 dark:bg-slate-950/95 md:hidden"
    >
      <div className="mx-auto grid max-w-md grid-cols-5 gap-1">
        {priority.map((section) => {
          const Icon = section.icon;
          const active = section.id === activeSectionId;
          const showAlert = section.id === "admin" && unreadAlerts > 0;

          return (
            <Link
              key={section.id}
              to={getSectionTarget(section.id, userRole, user)}
              className={cn(
                "relative flex min-w-0 flex-col items-center justify-center gap-0.5 rounded-2xl px-1 py-1 text-[10px] font-bold outline-none transition",
                "focus-visible:ring-2 focus-visible:ring-blue-500/40",
                active
                  ? "bg-blue-50 text-blue-700 dark:bg-blue-500/10 dark:text-blue-200"
                  : "text-slate-500 hover:bg-slate-100 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-slate-900 dark:hover:text-slate-100",
              )}
            >
              <Icon aria-hidden="true" size={18} />
              <span className="max-w-full truncate">{section.label}</span>
              {showAlert ? (
                <span className="absolute right-2 top-1 h-2 w-2 rounded-full bg-rose-500" />
              ) : null}
            </Link>
          );
        })}
        <button
          type="button"
          onClick={onMore}
          className={cn(
            "relative flex min-w-0 flex-col items-center justify-center gap-0.5 rounded-2xl px-1 py-1 text-[10px] font-bold outline-none transition",
            "focus-visible:ring-2 focus-visible:ring-blue-500/40",
            moreActive
              ? "bg-blue-50 text-blue-700 dark:bg-blue-500/10 dark:text-blue-200"
              : "text-slate-500 hover:bg-slate-100 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-slate-900 dark:hover:text-slate-100",
          )}
        >
          <MoreHorizontal aria-hidden="true" size={18} />
          <span>More</span>
          {unreadAlerts > 0 ? (
            <span className="absolute right-2 top-1 h-2 w-2 rounded-full bg-rose-500" />
          ) : null}
        </button>
      </div>
    </nav>
  );
};

export default MobileBottomNav;
