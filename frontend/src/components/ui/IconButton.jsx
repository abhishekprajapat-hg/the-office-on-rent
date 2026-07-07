import React from "react";
import { cn } from "./utils";

const sizes = {
  sm: "h-8 w-8 rounded-lg",
  md: "h-10 w-10 rounded-xl",
  lg: "h-11 w-11 rounded-2xl",
};

const IconButton = React.forwardRef(
  ({ icon: Icon, label, size = "md", className, children, type = "button", ...props }, ref) => (
    <button
      ref={ref}
      type={type}
      aria-label={label}
      title={label}
      className={cn(
        "inline-flex shrink-0 items-center justify-center border border-slate-300 bg-white text-slate-700 outline-none transition",
        "hover:border-blue-300 hover:bg-blue-50 hover:text-blue-700 focus-visible:ring-2 focus-visible:ring-blue-500/50",
        "disabled:cursor-not-allowed disabled:opacity-60 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300",
        sizes[size] || sizes.md,
        className,
      )}
      {...props}
    >
      {Icon ? <Icon aria-hidden="true" size={17} /> : children}
    </button>
  ),
);

IconButton.displayName = "IconButton";

export default IconButton;
