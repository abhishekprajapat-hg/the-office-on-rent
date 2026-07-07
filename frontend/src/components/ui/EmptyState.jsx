import React from "react";
import { Inbox } from "lucide-react";
import Button from "./Button";
import { cn } from "./utils";

const EmptyState = ({
  title = "Nothing here yet",
  description,
  text,
  icon: Icon = Inbox,
  actionLabel,
  onAction,
  className,
}) => (
  <div
    className={cn(
      "rounded-2xl border border-dashed border-slate-300 bg-slate-50 px-4 py-8 text-center text-sm text-slate-500",
      "dark:border-slate-700 dark:bg-slate-900/70 dark:text-slate-400",
      className,
    )}
  >
    <div className="mx-auto mb-3 flex h-10 w-10 items-center justify-center rounded-2xl border border-slate-200 bg-white text-slate-400 dark:border-slate-700 dark:bg-slate-950">
      {React.createElement(Icon, { "aria-hidden": "true", size: 18 })}
    </div>
    <p className="font-semibold text-slate-800 dark:text-slate-100">{text || title}</p>
    {description ? <p className="mx-auto mt-1 max-w-sm text-xs leading-5">{description}</p> : null}
    {actionLabel && onAction ? (
      <Button className="mt-4" size="sm" onClick={onAction}>
        {actionLabel}
      </Button>
    ) : null}
  </div>
);

export default EmptyState;
