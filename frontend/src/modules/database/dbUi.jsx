import React, { useEffect } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import { FNT, MUT, TONE, field, glassCard } from "../inventory/components/contactGlassTokens";

/*
 * Small shared pieces for the Database and Enterprise Leasing screens. They
 * use the same glass tokens as the Owner / Broker Database, so the new pages
 * follow the chosen colour theme and light / dark mode.
 */

export const Panel = ({ title, icon: Icon, action, children, className = "", bodyClass = "p-4" }) => (
  <section className={`overflow-hidden rounded-[20px] ${className}`} style={glassCard}>
    {title ? (
      <header className="flex flex-wrap items-center gap-2.5 px-4 py-3" style={{ borderBottom: "1px solid var(--g-div)" }}>
        {Icon ? <Icon size={17} style={{ color: "var(--g-b)" }} /> : null}
        <span className="min-w-0 flex-1 text-[15px] font-semibold">{title}</span>
        {action}
      </header>
    ) : null}
    <div className={bodyClass}>{children}</div>
  </section>
);

export const Label = ({ children, hint }) => (
  <span className="mb-1 block text-[12px] font-medium" style={MUT}>{children}{hint ? <span className="ml-1 font-normal" style={FNT}>{hint}</span> : null}</span>
);

export const Input = ({ label, hint, className = "", ...rest }) => (
  <label className={`block ${className}`}>
    {label ? <Label hint={hint}>{label}</Label> : null}
    <input className="h-10 w-full rounded-xl px-3 text-[13.5px] outline-none focus:ring-2 focus:ring-blue-400/40" style={field} {...rest} />
  </label>
);

export const TextArea = ({ label, hint, className = "", ...rest }) => (
  <label className={`block ${className}`}>
    {label ? <Label hint={hint}>{label}</Label> : null}
    <textarea className="min-h-[70px] w-full rounded-xl px-3 py-2 text-[13.5px] outline-none focus:ring-2 focus:ring-blue-400/40" style={field} {...rest} />
  </label>
);

export const Select = ({ label, hint, options: opts = [], placeholder, className = "", ...rest }) => (
  <label className={`block ${className}`}>
    {label ? <Label hint={hint}>{label}</Label> : null}
    <select className="h-10 w-full rounded-xl px-3 text-[13.5px] outline-none" style={field} {...rest}>
      {placeholder !== undefined ? <option value="">{placeholder}</option> : null}
      {opts.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
    </select>
  </label>
);

export const Check = ({ label, checked, onChange }) => (
  <label className="inline-flex cursor-pointer items-center gap-2 text-[13px]">
    <input type="checkbox" className="h-4 w-4" checked={Boolean(checked)} onChange={(e) => onChange(e.target.checked)} />
    {label}
  </label>
);

export const Btn = ({ children, tone = "ghost", className = "", style, ...rest }) => {
  const styles = tone === "primary"
    ? { background: "var(--g-bfill, var(--g-b))", color: "#fff", boxShadow: "0 6px 16px var(--g-bglow, rgba(37,73,214,.3))" }
    : tone === "danger" ? { background: TONE.bad[1], color: TONE.bad[0] } : field;
  return (
    <button type="button" className={`inline-flex h-9 items-center justify-center gap-1.5 whitespace-nowrap rounded-xl px-3 text-[13px] font-semibold transition hover:brightness-[1.04] disabled:opacity-50 ${className}`} style={{ ...styles, ...style }} {...rest}>
      {children}
    </button>
  );
};

export const Tag = ({ tone = "mute", children }) => (
  <span className="inline-flex items-center whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] font-semibold" style={{ color: TONE[tone][0], background: TONE[tone][1] }}>{children}</span>
);

export const Stat = ({ label, value, tone = "a", note }) => (
  <div className="rounded-2xl p-3" style={glassCard}>
    <div className="text-[11.5px] font-medium" style={MUT}>{label}</div>
    <div className="mt-1 text-[19px] font-semibold" style={{ color: TONE[tone][0] }}>{value}</div>
    {note ? <div className="mt-0.5 text-[11px]" style={FNT}>{note}</div> : null}
  </div>
);

export const Empty = ({ children }) => <div className="px-2 py-6 text-center text-[13px]" style={FNT}>{children}</div>;

export const ErrorLine = ({ message }) => (message ? <div className="rounded-xl px-3 py-2 text-[13px]" style={{ background: TONE.bad[1], color: TONE.bad[0] }}>{message}</div> : null);

/* A dialog. It carries aria-modal so the follow-up reminder steps aside while it is open. */
export const Modal = ({ title, onClose, children, footer, width = 640 }) => {
  useEffect(() => {
    const onKey = (e) => { if (e.key === "Escape") onClose?.(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  return createPortal(
    <div className="fixed inset-0 z-[70] flex items-end justify-center bg-black/40 p-0 sm:items-center sm:p-4" role="dialog" aria-modal="true" aria-label={title}>
      <div className="flex max-h-[92vh] w-full flex-col overflow-hidden rounded-t-[22px] sm:rounded-[22px]" style={{ maxWidth: width, background: "var(--g-modal, var(--g-glassHi))", border: "1px solid var(--g-line)", color: "var(--g-ink)", boxShadow: "var(--g-shadow)" }}>
        <header className="flex items-center gap-2 px-4 py-3" style={{ borderBottom: "1px solid var(--g-div)" }}>
          <span className="flex-1 text-[15.5px] font-semibold">{title}</span>
          <button type="button" aria-label="Close" onClick={onClose} className="grid h-8 w-8 place-items-center rounded-lg" style={field}><X size={16} /></button>
        </header>
        <div className="flex-1 overflow-y-auto p-4">{children}</div>
        {footer ? <footer className="flex flex-wrap justify-end gap-2 px-4 py-3" style={{ borderTop: "1px solid var(--g-div)" }}>{footer}</footer> : null}
      </div>
    </div>,
    document.body,
  );
};

/* A plain table that turns into cards on phones. */
export const Table = ({ columns, rows, rowKey = (r) => r._id, onRow, empty = "Nothing yet" }) => {
  if (!rows?.length) return <Empty>{empty}</Empty>;
  return (
    <>
      <div className="hidden overflow-x-auto md:block">
        <table className="w-full text-left text-[13px]">
          <thead>
            <tr style={MUT}>{columns.map((c) => <th key={c.key} className={`whitespace-nowrap px-3 py-2 font-medium ${c.right ? "text-right" : ""}`}>{c.label}</th>)}</tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={rowKey(r)} onClick={onRow ? () => onRow(r) : undefined} className={onRow ? "cursor-pointer hover:brightness-[1.03]" : ""} style={{ borderTop: "1px solid var(--g-div)" }}>
                {columns.map((c) => <td key={c.key} className={`px-3 py-2 align-top ${c.right ? "text-right" : ""}`}>{c.render ? c.render(r) : r[c.key]}</td>)}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="flex flex-col gap-2 md:hidden">
        {rows.map((r) => (
          <div key={rowKey(r)} onClick={onRow ? () => onRow(r) : undefined} className="rounded-2xl p-3" style={{ ...field, cursor: onRow ? "pointer" : undefined }}>
            {columns.map((c) => (
              <div key={c.key} className="flex items-start justify-between gap-3 py-0.5 text-[13px]">
                <span style={MUT}>{c.label}</span>
                <span className="min-w-0 text-right">{c.render ? c.render(r) : r[c.key]}</span>
              </div>
            ))}
          </div>
        ))}
      </div>
    </>
  );
};
