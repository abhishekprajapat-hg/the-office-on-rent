import React from "react";

/*
 * The attendance page's visual vocabulary - an icon in a soft tinted square
 * beside every heading - so salary reads as part of the same workspace.
 */

export const cardClass = "rounded-xl border border-slate-200 bg-white shadow-[0_1px_2px_rgba(16,24,40,0.04)]";
export const cardHeaderClass = "flex flex-wrap items-center gap-3 border-b border-slate-100 px-5 py-3.5";
export const fieldClass = "h-9 rounded-lg border border-slate-300 bg-white px-3 text-[13px] font-semibold text-slate-700 outline-none transition focus:border-blue-400 focus:ring-2 focus:ring-blue-100";
export const secondaryButtonClass = "inline-flex items-center justify-center gap-2 rounded-lg border border-slate-300 bg-white px-3 py-2 text-[13px] font-semibold text-slate-700 shadow-sm transition hover:border-blue-300 hover:bg-blue-50 hover:text-blue-700 disabled:cursor-not-allowed disabled:opacity-60";
export const primaryButtonClass = "inline-flex items-center justify-center gap-2 rounded-lg border border-blue-600 bg-blue-600 px-3.5 py-2 text-[13px] font-semibold text-white shadow-sm transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60";

const TONES = {
  blue: "bg-blue-50 text-blue-600",
  green: "bg-emerald-50 text-emerald-600",
  amber: "bg-amber-50 text-amber-600",
  rose: "bg-rose-50 text-rose-600",
  violet: "bg-violet-50 text-violet-600",
  slate: "bg-slate-100 text-slate-500",
};

export const IconBox = ({ icon, tone = "blue", boxSize = "h-9 w-9", iconSize = 17 }) => {
  const Glyph = icon;
  return (
    <span className={`grid ${boxSize} shrink-0 place-items-center rounded-lg ${TONES[tone] || TONES.blue}`}>
      <Glyph size={iconSize} aria-hidden="true" />
    </span>
  );
};

export const SectionHeader = ({ icon, tone, title, subtitle, children }) => (
  <div className={cardHeaderClass}>
    <IconBox icon={icon} tone={tone} />
    <div className="min-w-0 flex-1">
      <h4 className="text-[14px] font-semibold leading-tight text-slate-900">{title}</h4>
      {subtitle ? <p className="mt-0.5 text-[13px] text-slate-500">{subtitle}</p> : null}
    </div>
    {children}
  </div>
);

export const StatCard = ({ icon, tone, label, value, hint }) => (
  <div className={`${cardClass} flex items-start gap-3 p-4`}>
    <IconBox icon={icon} tone={tone} />
    <div className="min-w-0">
      <p className="text-[12.5px] font-medium text-slate-500">{label}</p>
      <p className="mt-0.5 truncate font-mono text-[20px] font-bold tabular-nums text-slate-900">{value}</p>
      {hint ? <p className="mt-0.5 text-[12px] text-slate-500">{hint}</p> : null}
    </div>
  </div>
);
