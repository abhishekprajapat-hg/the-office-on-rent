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
}) => {
  const [titleLead, titleAccent] = normalizeHeaderTitle(pageHeader);

  return (
    <header className="shrink-0 bg-slate-50/50 px-3 py-3 sm:px-4 lg:px-6">
      <div className="flex flex-col gap-3 xl:flex-row xl:items-end xl:justify-between">
        <div className="flex min-w-0 items-start">
          <div className="min-w-0">
            <h1 className="font-display text-3xl text-slate-800 tracking-widest sm:text-4xl">
              {titleLead}
              {titleAccent ? <span className="text-emerald-600"> {titleAccent}</span> : null}
            </h1>
          </div>
        </div>
      </div>
    </header>
  );
};

export default AppTopCommandBar;
