import { memo } from "react";
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
}) => {
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

      <div className="flex min-w-0 items-center gap-2">
        {pageHeader?.breadcrumbs?.length ? (
          <Breadcrumbs items={pageHeader.breadcrumbs} className="hidden lg:flex" />
        ) : null}
        <h1
          className="truncate text-sm font-semibold tracking-[-0.018em] text-slate-900 dark:text-slate-50"
          title={title}
        >
          {title}
        </h1>
      </div>

      <div className="ml-auto flex shrink-0 items-center gap-2">
        {actions}
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
