import { cn } from "./utils";

const positions = {
  bottom:
    "left-1/2 top-[calc(100%+0.5rem)] -translate-x-1/2",
  right:
    "left-[calc(100%+0.5rem)] top-1/2 -translate-y-1/2",
};

const Tooltip = ({ label, children, className, side = "bottom" }) => (
  <span className={cn("group/tooltip relative inline-flex", className)}>
    {children}
    <span
      className={cn(
        "pointer-events-none absolute z-50 hidden whitespace-nowrap rounded-lg border border-slate-200 bg-white px-2 py-1 text-[10px] font-semibold text-slate-700 opacity-0 shadow-lg transition",
        "group-hover/tooltip:block group-hover/tooltip:opacity-100 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200",
        positions[side] || positions.bottom,
      )}
    >
      {label}
    </span>
  </span>
);

export default Tooltip;
