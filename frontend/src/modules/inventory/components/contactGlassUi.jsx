import React from "react";
import { TONE, field, toneForId, initialsOf } from "./contactGlassTokens";

/*
 * Small building blocks for the Broker / Owner Database screens (CRM Web
 * Glass "Broker Database" design). Colours come from the glass tokens, so the
 * screens follow the chosen colour theme and light/dark mode.
 */

export const Pill = ({ tone = "mute", children, className = "", dot = false }) => (
  <span className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-1 text-[11.5px] font-semibold ${className}`} style={{ color: TONE[tone][0], background: TONE[tone][1] }}>
    {dot ? <i className="h-[7px] w-[7px] rounded-full" style={{ background: TONE[tone][0] }} /> : null}
    {children}
  </span>
);

export const Avatar = ({ name, id, size = 46, radius = 15, text = 15 }) => {
  const tone = toneForId(id || name);
  return (
    <span className="grid shrink-0 place-items-center font-semibold" style={{ width: size, height: size, borderRadius: radius, fontSize: text, background: TONE[tone][1], color: TONE[tone][0] }}>
      {initialsOf(name)}
    </span>
  );
};

export const IconTile = ({ icon: Icon, tone = "a", size = 40, radius = 13, iconSize = 19 }) => (
  <span className="grid shrink-0 place-items-center" style={{ width: size, height: size, borderRadius: radius, background: TONE[tone][1], color: TONE[tone][0] }}>
    {Icon ? React.createElement(Icon, { size: iconSize }) : null}
  </span>
);

export const PrimaryButton = ({ children, className = "", style, ...rest }) => (
  <button type="button" className={`inline-flex h-10 items-center justify-center gap-2 rounded-xl px-4 text-[13.5px] font-semibold text-white transition disabled:opacity-60 ${className}`} style={{ background: "var(--g-bfill, var(--g-b))", boxShadow: "0 6px 16px var(--g-bglow, rgba(37,73,214,.3))", ...style }} {...rest}>
    {children}
  </button>
);

export const GhostButton = ({ children, className = "", style, ...rest }) => (
  <button type="button" className={`inline-flex h-10 items-center justify-center gap-2 rounded-xl px-3.5 text-[13.5px] font-medium transition hover:brightness-[1.03] disabled:opacity-60 ${className}`} style={{ ...field, ...style }} {...rest}>
    {children}
  </button>
);

// A row of pick buttons (single or multi select).
export const PickButtons = ({ options, value, onChange, multi = false, round = false, toneFor }) => (
  <div className="flex flex-wrap gap-1.5">
    {options.map((o) => {
      const on = multi ? (value || []).includes(o.value) : value === o.value;
      const tone = toneFor ? toneFor(o.value) : "a";
      const [fg, bg] = TONE[tone === "mute" ? "a" : tone];
      return (
        <button
          key={o.value}
          type="button"
          aria-pressed={on}
          onClick={() => onChange(multi ? (on ? value.filter((v) => v !== o.value) : [...(value || []), o.value]) : o.value)}
          className={`inline-flex h-9 items-center gap-1.5 px-3 text-[12.5px] font-medium transition ${round ? "rounded-full" : "rounded-[11px]"}`}
          style={on ? { background: bg, color: fg, border: `1.5px solid ${fg}` } : { ...field, borderWidth: 1.5 }}
        >
          {toneFor ? <i className="h-[7px] w-[7px] rounded-full" style={{ background: TONE[tone][0] }} /> : null}
          {o.icon ? React.createElement(o.icon, { size: 14 }) : null}
          {o.label}
        </button>
      );
    })}
  </div>
);
