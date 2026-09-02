import { memo } from "react";
import { Menu, Search } from "lucide-react";
import { Breadcrumbs } from "../crm";
import { IconButton, cn } from "../ui";
import ThemeSwitch from "./ThemeSwitch";

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
 * The single context bar. Title and breadcrumb on the left, global search in the
 * middle-right, then the page's own actions. Replaces the old TopNavigation
 * section rail, which the grouped sidebar now covers.
 *
 * The search box is presentational in this phase; it is wired in Phase 6.
 */
const AppTopCommandBar = ({
  pageHeader,
  theme,
  onToggleTheme,
  onMenuOpen,
  searchPlaceholder = "Search...",
  actions,
  className,
}) => {
  const title = titleOf(pageHeader);

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

      <div
        className={cn(
          "ml-auto hidden min-w-[190px] items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1.5",
          "text-[12.5px] text-slate-500 lg:flex dark:border-slate-700 dark:bg-slate-950 dark:text-slate-400",
        )}
      >
        <Search aria-hidden="true" size={14} className="shrink-0" />
        <span className="truncate">{searchPlaceholder}</span>
        <kbd className="ml-auto shrink-0 rounded border border-b-2 border-slate-200 bg-white px-1.5 font-mono text-[10px] text-slate-500 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-400">
          &#8984;K
        </kbd>
      </div>

      <div className={cn("flex shrink-0 items-center gap-2", "lg:ml-0 ml-auto")}>
        {actions}
        <ThemeSwitch
          checked={theme === "dark"}
          label={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
          onChange={onToggleTheme}
          size="header"
        />
      </div>
    </header>
  );
};

export default memo(AppTopCommandBar);
