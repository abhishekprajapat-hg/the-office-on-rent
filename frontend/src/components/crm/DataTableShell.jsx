import { EmptyState, Skeleton, cn } from "../ui";

const DataTableShell = ({
  title,
  description,
  actions,
  children,
  loading = false,
  empty = false,
  emptyTitle = "No records found",
  emptyDescription,
  className,
}) => (
  <section className={cn("overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-crm-card dark:border-slate-700 dark:bg-slate-900", className)}>
    {(title || description || actions) ? (
      <div className="flex flex-col gap-3 border-b border-slate-100 px-4 py-3 dark:border-slate-800 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          {title ? <h2 className="truncate text-sm font-bold text-slate-950 dark:text-slate-100">{title}</h2> : null}
          {description ? <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">{description}</p> : null}
        </div>
        {actions ? <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div> : null}
      </div>
    ) : null}
    <div className="custom-scrollbar overflow-x-auto">
      {loading ? (
        <div className="space-y-3 p-4" aria-busy="true" aria-live="polite">
          <Skeleton className="h-9 w-full" />
          <Skeleton className="h-9 w-full" />
          <Skeleton className="h-9 w-full" />
        </div>
      ) : empty ? (
        <EmptyState className="m-4" title={emptyTitle} description={emptyDescription} />
      ) : (
        children
      )}
    </div>
  </section>
);

export default DataTableShell;
