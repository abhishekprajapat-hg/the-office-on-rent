import React from "react";
import { Check, ChevronDown, ChevronUp } from "lucide-react";

/*
 * Form parts in the CRM Web Glass form style ("New Project Form" design):
 * 46px fields with a 1.5px edge and a soft focus ring, 13px labels, choice
 * cards, pick chips, a soft group box and a collapsible group. Theme-aware.
 */

export const FormLabel = ({ children, required, className = "" }) => (
  <span className={`text-[13px] font-medium ${className}`} style={{ color: "var(--g-mut)" }}>
    {children}{required ? " *" : ""}
  </span>
);

export const FormField = ({ label, required, error, hint, wide, className = "", children }) => (
  <label className={`flex min-w-0 flex-col gap-1.5 ${wide ? "col-span-full" : ""} ${className}`}>
    {label ? <FormLabel required={required}>{label}</FormLabel> : null}
    {children}
    {error ? <span className="text-[11.5px]" style={{ color: "var(--g-bad)" }}>{error}</span>
      : hint ? <span className="text-[11.5px]" style={{ color: "var(--g-fnt)" }}>{hint}</span> : null}
  </label>
);

/* Input with an optional leading icon / prefix and trailing unit. */
export const FormInput = ({ icon: Icon, prefix, suffix, error, big = false, className = "", ...rest }) => (
  <span className={`gl-field flex items-center gap-2 px-3.5 ${big ? "h-[50px]" : "h-[46px]"} ${error ? "is-error" : ""} ${className}`}>
    {Icon ? <Icon size={16} style={{ color: "var(--g-fnt)" }} aria-hidden="true" /> : null}
    {prefix ? <span className={big ? "text-[15px]" : "text-[13px]"} style={{ color: "var(--g-mut)" }}>{prefix}</span> : null}
    <input data-bare-input className={`h-full min-w-0 flex-1 border-0 bg-transparent outline-none ${big ? "text-[16px] font-medium" : "text-[14px]"}`} style={{ color: "var(--g-ink)" }} {...rest} />
    {suffix ? <span className="whitespace-nowrap text-[12px]" style={{ color: "var(--g-fnt)" }}>{suffix}</span> : null}
  </span>
);

/* Large tappable cards for a single choice (category, status...). */
export const ChoiceCards = ({ options, value, onChange, error, columns = "minmax(150px,1fr)" }) => (
  <div className="grid gap-2" style={{ gridTemplateColumns: `repeat(auto-fit, ${columns})` }} role="radiogroup">
    {options.map((o) => {
      const on = value === o.value;
      return (
        <button
          key={o.value}
          type="button"
          role="radio"
          aria-checked={on}
          onClick={() => onChange(o.value)}
          className="flex items-center gap-2.5 rounded-[14px] px-3.5 py-3 text-left transition-all duration-200"
          style={on
            ? { background: "var(--g-bs)", border: "1.5px solid var(--g-b)" }
            : { background: "var(--g-glassHi)", border: `1.5px solid ${error ? "var(--g-bad)" : "var(--g-edge, var(--g-line))"}` }}
        >
          {o.icon ? (
            <span className="grid h-[34px] w-[34px] shrink-0 place-items-center rounded-[11px] transition" style={on ? { background: "var(--g-bfill, var(--g-b))", color: "#fff" } : { background: "var(--g-track)", color: "var(--g-mut)" }}>
              {React.createElement(o.icon, { size: 17 })}
            </span>
          ) : o.dot ? <i className="h-[9px] w-[9px] shrink-0 rounded-full" style={{ background: o.dot }} /> : null}
          <span className="flex min-w-0 flex-1 flex-col">
            <span className="text-[14px] font-semibold" style={{ color: on ? "var(--g-b)" : "var(--g-ink)" }}>{o.label}</span>
            {o.sub ? <span className="truncate text-[11.5px]" style={{ color: "var(--g-mut)" }}>{o.sub}</span> : null}
          </span>
        </button>
      );
    })}
  </div>
);

/* Chips: single (toggle off by clicking again when allowClear) or multi. */
export const PickChips = ({ options, value, onChange, multi = false, round = false, allowClear = false, error }) => (
  <div className="flex flex-wrap gap-1.5">
    {options.map((o) => {
      const on = multi ? (value || []).includes(o.value) : value === o.value;
      const next = () => {
        if (multi) onChange(on ? value.filter((v) => v !== o.value) : [...(value || []), o.value]);
        else onChange(on && allowClear ? "" : o.value);
      };
      return (
        <button
          key={o.value}
          type="button"
          aria-pressed={on}
          onClick={next}
          className={`flex items-center gap-1.5 px-3.5 text-[13px] font-medium transition-all duration-150 ${round ? "h-9 rounded-full" : "h-[38px] rounded-xl"}`}
          style={on
            ? { background: "var(--g-bs)", color: "var(--g-b)", border: `${round ? 1 : 1.5}px solid var(--g-b)` }
            : { background: "var(--g-glassHi)", color: "var(--g-ink)", border: `${round ? 1 : 1.5}px solid ${error ? "var(--g-bad)" : "var(--g-edge, var(--g-line))"}` }}
        >
          {on && multi ? <Check size={14} strokeWidth={2.6} /> : o.icon ? React.createElement(o.icon, { size: 15 }) : null}
          {o.label}
        </button>
      );
    })}
  </div>
);

/* A soft grouped box with a titled header. */
export const FormGroup = ({ icon: Icon, title, aside, children, className = "" }) => (
  <div className={`flex flex-col gap-2.5 rounded-2xl p-4 ${className}`} style={{ background: "var(--g-glass2)", border: "1px solid var(--g-edge, var(--g-line))" }}>
    {title ? (
      <div className="flex items-center gap-2">
        {Icon ? <Icon size={16} style={{ color: "var(--g-b)" }} /> : null}
        <span className="flex-1 text-[14px] font-semibold">{title}</span>
        {aside ? <span className="text-[11.5px]" style={{ color: "var(--g-mut)" }}>{aside}</span> : null}
      </div>
    ) : null}
    {children}
  </div>
);

/* A collapsible group (header row toggles the body). */
export const FormCollapsible = ({ icon: Icon, title, hint, open, onToggle, children }) => (
  <div className="flex flex-col gap-2.5">
    <button type="button" onClick={onToggle} aria-expanded={open} className="gl-field flex items-center gap-2.5 px-4 py-3.5 text-left">
      {Icon ? <Icon size={17} style={{ color: "var(--g-b)" }} /> : null}
      <span className="flex-1 text-[14px] font-semibold">{title}</span>
      {hint ? <span className="text-[12px]" style={{ color: "var(--g-mut)" }}>{hint}</span> : null}
      {open ? <ChevronUp size={16} style={{ color: "var(--g-mut)" }} /> : <ChevronDown size={16} style={{ color: "var(--g-mut)" }} />}
    </button>
    {open ? <div className="gl-step-in">{children}</div> : null}
  </div>
);

/* Review card: titled list of label / value rows with an Edit link. */
export const ReviewGroup = ({ title, onEdit, rows }) => (
  <div className="flex flex-col rounded-2xl px-4 py-1" style={{ background: "var(--g-glassHi)", border: "1px solid var(--g-edge, var(--g-line))" }}>
    <div className="flex items-center gap-2 pb-1.5 pt-2.5">
      <span className="flex-1 text-[13.5px] font-semibold">{title}</span>
      {onEdit ? <button type="button" onClick={onEdit} className="text-[12.5px] font-medium" style={{ color: "var(--g-b)" }}>Edit</button> : null}
    </div>
    {rows.map(([label, value]) => (
      <div key={label} className="flex gap-3 py-2" style={{ borderTop: "1px solid var(--g-div)" }}>
        <span className="flex-1 text-[13px]" style={{ color: "var(--g-mut)" }}>{label}</span>
        <span className="text-right text-[13px] font-medium" style={{ color: value ? "var(--g-ink)" : "var(--g-fnt)" }}>{value || "Not added"}</span>
      </div>
    ))}
  </div>
);
