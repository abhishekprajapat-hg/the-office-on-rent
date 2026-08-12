import { memo } from "react";
import { Breadcrumbs } from "../crm";
import ThemeSwitch from "./ThemeSwitch";

const normalizeHeaderTitle = (pageHeader = {}) => {
  const rawTitle = String(pageHeader?.title || "Workspace").trim();
  const cleanTitle = rawTitle
    .replace(/\s+Command\s+Center$/i, "")
    .replace(/\s+Dashboard$/i, "")
    .trim();

  if (pageHeader?.scopeLabel === "Empire" || cleanTitle.toLowerCase() === "inventory") {
    return ["ASSET", "VAULT"];
  }

  const words = cleanTitle
    .replace(/[-_]+/g, " ")
    .split(/\s+/)
    .map((word) => word.trim())
    .filter(Boolean);

  if (words.length === 0) return ["WORKSPACE", ""];
  if (words.length === 1) return [words[0].toUpperCase(), ""];

  return [
    words.slice(0, -1).join(" ").toUpperCase(),
    words[words.length - 1].toUpperCase(),
  ];
};

const AppTopCommandBar = ({
  pageHeader,
  theme,
  onToggleTheme,
}) => {
  const [titleLead, titleAccent] = normalizeHeaderTitle(pageHeader);
  const title = titleAccent ? `${titleLead} ${titleAccent}` : titleLead;

  return (
    <header className="shrink-0 bg-slate-50/50 px-3 py-1.5 sm:px-4 sm:py-3 lg:px-6">
      <div className="flex min-w-0 items-center justify-between gap-4">
        <div className="min-w-0">
          {pageHeader?.breadcrumbs?.length ? (
            <Breadcrumbs items={pageHeader.breadcrumbs} className="mb-1" />
          ) : null}
          <h1
            className="font-display max-w-full truncate text-xl font-semibold leading-tight tracking-normal text-slate-800 sm:text-4xl sm:tracking-widest"
            title={title}
          >
            <span>{titleLead}</span>
            {titleAccent ? (
              <span className="text-emerald-600"> {titleAccent}</span>
            ) : null}
            </h1>
        </div>
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
