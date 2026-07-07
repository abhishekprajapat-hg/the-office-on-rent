import { Link, useLocation } from "react-router-dom";
import { Menu } from "lucide-react";
import { IconButton, Tooltip, cn } from "../ui";
import {
  TOP_NAV_SECTION_IDS,
  getActiveSectionId,
  getSectionTarget,
  getVisibleSections,
} from "./workbenchNavigation";

const TopNavigation = ({
  userRole,
  user,
  unreadAlerts = 0,
  onMenuOpen,
}) => {
  const location = useLocation();
  const visibleSections = getVisibleSections(userRole, user);
  const activeSectionId = getActiveSectionId(location.pathname, userRole, user);
  const sections = TOP_NAV_SECTION_IDS
    .map((sectionId) => visibleSections.find((section) => section.id === sectionId))
    .filter(Boolean);

  return (
    <nav
      aria-label="Primary navigation"
      className="shrink-0 border-b border-slate-200 bg-white/95 px-3 py-2 shadow-sm backdrop-blur-xl dark:border-slate-800 dark:bg-slate-950/95 sm:px-4 md:hidden"
    >
      <div className="flex items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-1 overflow-x-auto scrollbar-hide">
          {sections.map((section) => {
            const Icon = section.icon;
            const target = getSectionTarget(section.id, userRole, user);
            const isActive = section.id === activeSectionId;
            const showAlert = section.id === "admin" && unreadAlerts > 0;

            return (
              <Tooltip key={section.id} label={section.label}>
                <Link
                  to={target}
                  aria-label={section.label}
                  className={cn(
                    "relative inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border outline-none transition",
                    "focus-visible:ring-2 focus-visible:ring-blue-500/40",
                    isActive
                      ? "border-blue-200 bg-blue-50 text-blue-700 shadow-sm dark:border-blue-500/30 dark:bg-blue-500/10 dark:text-blue-200"
                      : "border-transparent text-slate-500 hover:border-slate-200 hover:bg-slate-100 hover:text-slate-950 dark:text-slate-400 dark:hover:border-slate-700 dark:hover:bg-slate-900 dark:hover:text-slate-100",
                  )}
                >
                  <Icon aria-hidden="true" size={19} strokeWidth={isActive ? 2.4 : 1.9} />
                  {showAlert ? (
                    <span className="absolute right-1 top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-rose-500 px-1 text-[9px] font-bold text-white">
                      {unreadAlerts > 99 ? "99+" : unreadAlerts}
                    </span>
                  ) : null}
                </Link>
              </Tooltip>
            );
          })}
        </div>

        <Tooltip label="More">
          <IconButton
            icon={Menu}
            label="Open sidebar"
            size="md"
            onClick={onMenuOpen}
            className="border-slate-200 bg-white text-slate-700 hover:border-blue-200 hover:bg-blue-50 hover:text-blue-700 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300"
          />
        </Tooltip>
      </div>
    </nav>
  );
};

export default TopNavigation;
