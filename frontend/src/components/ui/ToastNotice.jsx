import React from "react";
import { createPortal } from "react-dom";
import { AlertCircle, CheckCircle2, Info, XCircle } from "lucide-react";

const TOAST_STYLES = {
  error: {
    icon: XCircle,
    className: "border-rose-200 bg-rose-600 text-white shadow-rose-950/20",
  },
  success: {
    icon: CheckCircle2,
    className: "border-emerald-200 bg-emerald-600 text-white shadow-emerald-950/20",
  },
  warning: {
    icon: AlertCircle,
    className: "border-amber-200 bg-amber-500 text-white shadow-amber-950/20",
  },
  info: {
    icon: Info,
    className: "border-sky-200 bg-sky-600 text-white shadow-sky-950/20",
  },
};

const ToastNotice = ({
  message,
  type = "info",
  position = "top-right",
  className = "",
}) => {
  if (!message) return null;

  const config = TOAST_STYLES[type] || TOAST_STYLES.info;
  const Icon = config.icon;
  const positionClass =
    position === "bottom-right"
      ? "bottom-4"
      : "top-4";

  const toast = (
    <div
      className={`pointer-events-none fixed inset-x-3 ${positionClass} z-[9999] flex sm:inset-x-auto sm:right-4`}
      role={type === "error" ? "alert" : "status"}
      aria-live={type === "error" ? "assertive" : "polite"}
    >
      <div
        className={`pointer-events-auto flex w-full max-w-sm items-start gap-2 rounded-2xl border px-3 py-2.5 text-sm font-semibold shadow-2xl sm:px-4 ${config.className} ${className}`}
      >
        <Icon size={17} className="mt-0.5 shrink-0" />
        <span className="min-w-0 break-words">{message}</span>
      </div>
    </div>
  );

  if (typeof document === "undefined") return toast;
  return createPortal(toast, document.body);
};

export default ToastNotice;
