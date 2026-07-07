import { cn } from "./utils";

export const Tabs = ({ className, ...props }) => (
  <div className={cn("flex items-center gap-1 rounded-xl border border-slate-200 bg-slate-100 p-1 dark:border-slate-700 dark:bg-slate-900", className)} {...props} />
);

export const TabButton = ({ active = false, className, children, ...props }) => (
  <button
    type="button"
    aria-pressed={active}
    className={cn(
      "inline-flex h-8 items-center justify-center rounded-lg px-3 text-xs font-bold outline-none transition focus-visible:ring-2 focus-visible:ring-blue-500/50",
      active
        ? "bg-white text-blue-700 shadow-sm dark:bg-slate-800 dark:text-blue-200"
        : "text-slate-600 hover:bg-white/70 hover:text-slate-950 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-slate-100",
      className,
    )}
    {...props}
  >
    {children}
  </button>
);

export default Tabs;
