import React from "react";
import { ArrowDownRight, ArrowUpRight } from "lucide-react";
import { Card, cn } from "../ui";

const trendStyles = {
  up: "text-emerald-700 bg-emerald-50 border-emerald-200 dark:text-emerald-200 dark:bg-emerald-500/10 dark:border-emerald-500/30",
  down: "text-rose-700 bg-rose-50 border-rose-200 dark:text-rose-200 dark:bg-rose-500/10 dark:border-rose-500/30",
  neutral: "text-slate-600 bg-slate-100 border-slate-200 dark:text-slate-300 dark:bg-slate-800 dark:border-slate-700",
};

const MetricCard = ({
  title,
  value,
  helper,
  icon: Icon,
  trend,
  trendLabel,
  onClick,
  className,
}) => {
  const Component = onClick ? "button" : "div";
  const trendTone = trend === "up" || trend === "down" ? trend : "neutral";
  const TrendIcon = trendTone === "down" ? ArrowDownRight : ArrowUpRight;

  return (
    <Card
      interactive={Boolean(onClick)}
      className={cn(
        "group relative overflow-hidden p-4 text-left",
        onClick && "w-full cursor-pointer focus-within:ring-2 focus-within:ring-blue-500/40",
        className,
      )}
    >
      <Component
        type={onClick ? "button" : undefined}
        onClick={onClick}
        className={cn("block w-full text-left outline-none", onClick && "focus-visible:ring-0")}
      >
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="truncate text-[11px] font-bold uppercase tracking-[0.14em] text-slate-500 dark:text-slate-400">
              {title}
            </p>
            <p className="mt-3 text-2xl font-bold leading-none text-slate-950 dark:text-slate-100 sm:text-3xl">
              {value}
            </p>
          </div>
          {Icon ? (
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl border border-slate-200 bg-slate-50 text-slate-600 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-300">
              <Icon aria-hidden="true" size={18} />
            </div>
          ) : null}
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          {trendLabel ? (
            <span className={cn("inline-flex items-center gap-1 rounded-full border px-2 py-1 text-[10px] font-bold", trendStyles[trendTone])}>
              <TrendIcon aria-hidden="true" size={12} />
              {trendLabel}
            </span>
          ) : null}
          {helper ? <p className="text-xs text-slate-500 dark:text-slate-400">{helper}</p> : null}
        </div>
      </Component>
    </Card>
  );
};

export default MetricCard;
