import React from "react";
import { AlertOctagon, RefreshCw } from "lucide-react";
import Button from "./Button";
import { cn } from "./utils";

const ErrorState = ({
  title = "Something went wrong",
  description = "We couldn't load this data. Please try again.",
  actionLabel = "Retry",
  onAction,
  className,
}) => (
  <div
    className={cn(
      "rounded-2xl border border-rose-200 bg-rose-50 px-4 py-8 text-center text-sm text-rose-700",
      "dark:border-rose-500/30 dark:bg-rose-500/10 dark:text-rose-200",
      className,
    )}
  >
    <div className="mx-auto mb-3 flex h-10 w-10 items-center justify-center rounded-2xl border border-rose-200 bg-white text-rose-500 dark:border-rose-500/30 dark:bg-slate-950">
      <AlertOctagon aria-hidden="true" size={18} />
    </div>
    <p className="font-semibold">{title}</p>
    {description ? <p className="mx-auto mt-1 max-w-sm text-xs leading-5 opacity-90">{description}</p> : null}
    {actionLabel && onAction ? (
      <Button className="mt-4" size="sm" variant="danger" leftIcon={RefreshCw} onClick={onAction}>
        {actionLabel}
      </Button>
    ) : null}
  </div>
);

export default ErrorState;
