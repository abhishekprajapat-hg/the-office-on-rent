import React from "react";
import { cn } from "./utils";

const variants = {
  primary:
    "border-blue-600 bg-blue-600 text-white shadow-crm-soft hover:border-blue-700 hover:bg-blue-700 focus-visible:ring-blue-500",
  secondary:
    "border-slate-300 bg-white text-slate-800 shadow-crm-soft hover:border-slate-400 hover:bg-slate-50 focus-visible:ring-blue-500",
  ghost:
    "border-transparent bg-transparent text-slate-600 hover:bg-slate-100 hover:text-slate-950 focus-visible:ring-blue-500",
  danger:
    "border-rose-600 bg-rose-600 text-white shadow-crm-soft hover:border-rose-700 hover:bg-rose-700 focus-visible:ring-rose-500",
  success:
    "border-emerald-600 bg-emerald-600 text-white shadow-crm-soft hover:border-emerald-700 hover:bg-emerald-700 focus-visible:ring-emerald-500",
};

const sizes = {
  sm: "h-8 rounded-xl px-3 text-xs",
  md: "h-10 rounded-xl px-4 text-sm",
  lg: "h-11 rounded-2xl px-5 text-sm",
};

const Button = React.forwardRef(
  (
    {
      as: Component = "button",
      type = "button",
      variant = "primary",
      size = "md",
      className,
      leftIcon: LeftIcon,
      rightIcon: RightIcon,
      children,
      disabled,
      ...props
    },
    ref,
  ) => (
    <Component
      ref={ref}
      type={Component === "button" ? type : undefined}
      disabled={Component === "button" ? disabled : undefined}
      aria-disabled={Component !== "button" && disabled ? true : undefined}
      className={cn(
        "inline-flex shrink-0 items-center justify-center gap-2 border font-semibold outline-none transition",
        "focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-white",
        "disabled:cursor-not-allowed disabled:opacity-60",
        "dark:focus-visible:ring-offset-slate-950",
        variants[variant] || variants.primary,
        sizes[size] || sizes.md,
        className,
      )}
      {...props}
    >
      {LeftIcon ? <LeftIcon aria-hidden="true" size={16} /> : null}
      {children}
      {RightIcon ? <RightIcon aria-hidden="true" size={16} /> : null}
    </Component>
  ),
);

Button.displayName = "Button";

export default Button;
