import React, { useEffect } from "react";
import { X } from "lucide-react";
import { IconButton, cn } from "../ui";

const DetailDrawer = ({
  open,
  title,
  description,
  onClose,
  children,
  footer,
  className,
}) => {
  useEffect(() => {
    if (!open) return undefined;

    const onKeyDown = (event) => {
      if (event.key === "Escape") onClose?.();
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onClose, open]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[80] flex justify-end">
      <button
        type="button"
        aria-label="Close detail panel"
        className="absolute inset-0 bg-slate-950/35 backdrop-blur-[2px]"
        onClick={onClose}
      />
      <aside
        role="dialog"
        aria-modal="true"
        aria-labelledby={title ? "detail-drawer-title" : undefined}
        className={cn(
          "relative flex h-full w-full max-w-xl flex-col border-l border-slate-200 bg-white shadow-2xl outline-none dark:border-slate-700 dark:bg-slate-950",
          className,
        )}
      >
        <header className="flex items-start justify-between gap-3 border-b border-slate-100 p-4 dark:border-slate-800">
          <div className="min-w-0">
            {title ? (
              <h2 id="detail-drawer-title" className="truncate text-base font-bold text-slate-950 dark:text-slate-100">
                {title}
              </h2>
            ) : null}
            {description ? <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">{description}</p> : null}
          </div>
          <IconButton icon={X} label="Close detail panel" onClick={onClose} />
        </header>
        <div className="custom-scrollbar min-h-0 flex-1 overflow-y-auto p-4">{children}</div>
        {footer ? <footer className="border-t border-slate-100 p-4 dark:border-slate-800">{footer}</footer> : null}
      </aside>
    </div>
  );
};

export default DetailDrawer;
