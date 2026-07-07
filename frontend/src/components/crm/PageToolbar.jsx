import { cn } from "../ui";

const PageToolbar = ({
  title,
  description,
  eyebrow,
  actions,
  filters,
  className,
  children,
}) => (
  <section
    className={cn(
      "rounded-2xl border border-slate-200 bg-white/95 p-4 shadow-crm-card dark:border-slate-700 dark:bg-slate-900/90",
      className,
    )}
  >
    <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
      <div className="min-w-0">
        {eyebrow ? (
          <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-blue-600 dark:text-blue-300">
            {eyebrow}
          </p>
        ) : null}
        {title ? (
          <h1 className="mt-1 truncate text-xl font-bold text-slate-950 dark:text-slate-100">{title}</h1>
        ) : null}
        {description ? <p className="mt-1 max-w-3xl text-sm text-slate-500 dark:text-slate-400">{description}</p> : null}
      </div>
      {actions ? <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div> : null}
    </div>
    {filters || children ? (
      <div className="mt-4 flex flex-col gap-3 border-t border-slate-100 pt-4 dark:border-slate-800">
        {filters ? <div className="flex flex-wrap items-center gap-2">{filters}</div> : null}
        {children}
      </div>
    ) : null}
  </section>
);

export default PageToolbar;
