/*
 * Editors and views for a project's size-wise stock, PLCs, charge rows and
 * nearby market rates (requirements 3 Nov 2026, 4.2-4.5).
 */
import React from "react";
import { Plus, Trash2 } from "lucide-react";
import {
  CHARGE_BASIS_OPTIONS, CHARGE_PRESET_OPTIONS, STANDARD_PLCS, areaFromDimension, sizeLabel, toDateInput,
} from "./projectStockFormat";

const cell = "gl-field h-[40px] w-full min-w-0 px-3 text-[13px]";
const MUT = { color: "var(--g-mut)" };

/* One editable row per item; columns wrap on a phone. */
const RowsEditor = ({ rows = [], onChange, columns, blankRow, addLabel, emptyText, extraActions = null, template }) => {
  const update = (i, patch) => onChange(rows.map((r, n) => (n === i ? { ...r, ...patch } : r)));
  return (
    <div className="flex flex-col gap-2">
      {rows.map((row, i) => (
        <div key={row._key || row._id || i} className="relative grid items-end gap-2 rounded-xl p-2.5 pr-10" style={{ gridTemplateColumns: template, background: "var(--g-glassHi)", border: "1px solid var(--g-edge, var(--g-line))" }}>
          {columns.map((col) => (
            <label key={col.key} className="flex min-w-0 flex-col gap-1">
              <span className="text-[11px] font-medium" style={MUT}>{col.label}</span>
              {col.render ? col.render(row, (patch) => update(i, patch)) : col.options ? (
                <select className={cell} value={row[col.key] ?? ""} onChange={(e) => update(i, { [col.key]: e.target.value })}>
                  {col.options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
              ) : (
                <input
                  className={cell}
                  type={col.type || "text"}
                  min={col.type === "number" ? "0" : undefined}
                  step={col.type === "number" ? "any" : undefined}
                  inputMode={col.type === "number" ? "decimal" : undefined}
                  placeholder={col.placeholder}
                  value={col.type === "date" ? toDateInput(row[col.key]) : (row[col.key] ?? "")}
                  onChange={(e) => update(i, col.onValue ? col.onValue(e.target.value, row) : { [col.key]: e.target.value })}
                />
              )}
            </label>
          ))}
          <button type="button" aria-label="Remove row" className="absolute right-1.5 top-1.5 grid h-8 w-8 place-items-center rounded-lg" style={{ color: "var(--g-bad)" }} onClick={() => onChange(rows.filter((_, n) => n !== i))}>
            <Trash2 size={15} />
          </button>
        </div>
      ))}
      {!rows.length && emptyText ? <p className="text-[12.5px]" style={MUT}>{emptyText}</p> : null}
      <div className="flex flex-wrap gap-2">
        <button type="button" className="gl-field inline-flex h-9 items-center gap-1.5 px-3 text-[12.5px] font-semibold" onClick={() => onChange([...rows, { ...blankRow, _key: `r${Date.now()}${Math.random()}` }])}>
          <Plus size={14} />{addLabel}
        </button>
        {extraActions}
      </div>
    </div>
  );
};

// Fields wrap two to a line on a phone; the delete button sits in the corner.
const ROW_TEMPLATE = "repeat(auto-fit, minmax(120px, 1fr))";

export const SizeInventoryEditor = ({ rows, onChange }) => (
  <RowsEditor
    rows={rows}
    onChange={onChange}
    template={ROW_TEMPLATE}
    addLabel="Add size"
    emptyText="No sizes yet. Add each size or dimension on offer, e.g. 20×40 or 1,140 sq ft."
    blankRow={{ dimension: "", areaSqft: "", total: "", available: "", sold: "" }}
    columns={[
      { key: "dimension", label: "Dimension (ft)", placeholder: "20x40",
        onValue: (value, row) => {
          const area = areaFromDimension(value);
          const prevAuto = areaFromDimension(row.dimension);
          // Fill the area from the dimension unless it was typed by hand.
          return { dimension: value, ...(area && (row.areaSqft === "" || row.areaSqft === null || Number(row.areaSqft) === prevAuto) ? { areaSqft: area } : {}) };
        } },
      { key: "areaSqft", label: "Area (sq ft)", type: "number", placeholder: "800" },
      { key: "total", label: "Total", type: "number", placeholder: "40" },
      { key: "available", label: "Available", type: "number", placeholder: "12" },
      { key: "sold", label: "Sold / reserved", type: "number", placeholder: "28" },
    ]}
  />
);

export const PlcOptionsEditor = ({ rows, onChange }) => {
  const have = new Set((rows || []).map((r) => String(r.name || "").trim().toLowerCase()));
  const missing = STANDARD_PLCS.filter((p) => !have.has(p.name.toLowerCase()));
  return (
    <RowsEditor
      rows={rows}
      onChange={onChange}
      template={ROW_TEMPLATE}
      addLabel="Add PLC"
      emptyText="No PLCs yet. A plot can have several at once (e.g. Garden + Corner)."
      blankRow={{ name: "", basis: "PERCENT", value: "", condition: "" }}
      extraActions={missing.length ? (
        <button type="button" className="gl-field inline-flex h-9 items-center gap-1.5 px-3 text-[12.5px] font-semibold" title={missing.map((p) => p.name).join(", ")}
          onClick={() => onChange([...(rows || []), ...missing.map((p, i) => ({ ...p, _key: `s${Date.now()}${i}` }))])}>
          <Plus size={14} />Add standard PLCs
        </button>
      ) : null}
      columns={[
        { key: "name", label: "PLC", placeholder: "Garden facing" },
        { key: "basis", label: "Charged as", options: CHARGE_BASIS_OPTIONS },
        { key: "value", label: "Value", type: "number", placeholder: "5" },
        { key: "condition", label: "Applies when", placeholder: "Faces the park" },
      ]}
    />
  );
};

export const ChargeItemsEditor = ({ rows, onChange }) => (
  <RowsEditor
    rows={rows}
    onChange={onChange}
    template="repeat(auto-fit, minmax(140px, 1fr))"
    addLabel="Add charge"
    emptyText="No charges yet. Add maintenance, club house, electricity, parking or any other charge."
    blankRow={{ key: "MAINTENANCE", label: "Maintenance", basis: "AMOUNT", value: "", note: "" }}
    columns={[
      { key: "key", label: "Charge", render: (row, set) => (
        <select className={cell} value={row.key || "OTHER"} onChange={(e) => {
          const preset = CHARGE_PRESET_OPTIONS.find((o) => o.value === e.target.value);
          set({ key: e.target.value, label: e.target.value === "OTHER" ? "" : preset?.label || "" });
        }}>
          {CHARGE_PRESET_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
      ) },
      { key: "label", label: "Name", placeholder: "e.g. Water connection" },
      { key: "basis", label: "Charged as", options: CHARGE_BASIS_OPTIONS },
      { key: "value", label: "Value", type: "number", placeholder: "75000" },
      { key: "note", label: "Note", placeholder: "One time" },
    ]}
  />
);

export const MarketRatesEditor = ({ rows, onChange }) => (
  <RowsEditor
    rows={rows}
    onChange={onChange}
    template={ROW_TEMPLATE}
    addLabel="Add nearby rate"
    emptyText="Reference only: rates of nearby projects or the local market, with a date and source."
    blankRow={{ place: "", rate: "", unit: "per sq ft", asOf: "", source: "" }}
    columns={[
      { key: "place", label: "Nearby project / area", placeholder: "Silver Springs" },
      { key: "rate", label: "Rate ₹", type: "number", placeholder: "3200" },
      { key: "unit", label: "Unit", placeholder: "per sq ft" },
      { key: "asOf", label: "As of", type: "date" },
      { key: "source", label: "Source", placeholder: "Site visit / broker" },
    ]}
  />
);

/* Size-wise availability on the project page; LIVE and MANUAL rows are labelled. */
export const SizeAvailabilityTable = ({ availability }) => {
  if (!availability || !availability.rows?.length) return null;
  const { rows, totals, hasLive, hasManual } = availability;
  return (
    <div className="flex flex-col gap-2">
      {/* Phones: one card per size (the app's mobile styles stack table cells). */}
      <div className="flex flex-col gap-2 sm:hidden">
        {rows.map((r, i) => (
          <div key={`m-${r.dimension}-${r.areaSqft}-${i}`} className="rounded-xl p-3" style={{ background: "var(--g-glassHi)", border: "1px solid var(--g-edge, var(--g-line))" }}>
            <div className="flex items-center justify-between gap-2">
              <span className="text-[13.5px] font-semibold">{sizeLabel(r)}</span>
              <span className="rounded-full px-2 py-0.5 text-[11px] font-semibold" style={r.source === "LIVE" ? { background: "var(--g-bs)", color: "var(--g-b)" } : { background: "var(--g-track)", color: "var(--g-mut)" }}>{r.source === "LIVE" ? "Live" : "Manual"}</span>
            </div>
            <div className="mt-2 grid grid-cols-4 gap-1 text-[12px]">
              {[["Available", r.soldOut ? "None left" : r.available, r.soldOut ? "var(--g-bad)" : "var(--g-ok)"], ["Total", r.total], ["On hold", r.source === "LIVE" ? r.onHold : "—"], ["Sold", r.sold]].map(([label, value, color]) => (
                <div key={label} className="flex flex-col">
                  <span className="font-semibold" style={color ? { color } : undefined}>{value}</span>
                  <span style={MUT}>{label}</span>
                </div>
              ))}
            </div>
            {r.unavailable ? <span className="mt-1 block text-[11.5px]" style={MUT}>{r.unavailable} unavailable</span> : null}
            {r.manual ? <span className="mt-1 block text-[11.5px]" style={MUT}>Typed on project: {r.manual.available} of {r.manual.total}</span> : null}
          </div>
        ))}
        <span className="text-[12.5px] font-semibold">All sizes: {totals.available} available of {totals.total}</span>
      </div>
      <div className="hidden overflow-x-auto sm:block">
        <table className="w-full min-w-[480px] text-left text-[13px]">
          <thead>
            <tr style={MUT}>
              {["Size", "Total", "Available", "On hold", "Sold", ...(totals.unavailable ? ["Unavailable"] : []), "Source"].map((h) => <th key={h} className="px-2 py-1.5 text-[11.5px] font-medium">{h}</th>)}
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={`${r.dimension}-${r.areaSqft}-${i}`} style={{ borderTop: "1px solid var(--g-div)" }}>
                <td className="px-2 py-2 font-medium">{sizeLabel(r)}</td>
                <td className="px-2 py-2">{r.total}</td>
                <td className="px-2 py-2 font-semibold" style={{ color: r.soldOut ? "var(--g-bad)" : "var(--g-ok)" }}>{r.soldOut ? "None left" : r.available}</td>
                <td className="px-2 py-2">{r.source === "LIVE" ? r.onHold : "—"}</td>
                <td className="px-2 py-2">{r.sold}</td>
                {totals.unavailable ? <td className="px-2 py-2">{r.source === "LIVE" ? r.unavailable || 0 : "—"}</td> : null}
                <td className="px-2 py-2">
                  <span className="rounded-full px-2 py-0.5 text-[11px] font-semibold" style={r.source === "LIVE" ? { background: "var(--g-bs)", color: "var(--g-b)" } : { background: "var(--g-track)", color: "var(--g-mut)" }}
                    title={r.source === "LIVE" ? "Counted from the individual plots / units in Inventory" : "Typed in on the project; no individual plots of this size are linked yet"}>
                    {r.source === "LIVE" ? "Live" : "Manual"}
                  </span>
                  {r.manual ? <span className="ml-1.5 text-[11px]" style={MUT} title="The figure typed on the project for this size, before plots were linked">typed: {r.manual.available}/{r.manual.total}</span> : null}
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr style={{ borderTop: "1px solid var(--g-div)" }} className="font-semibold">
              <td className="px-2 py-2">All sizes</td>
              <td className="px-2 py-2">{totals.total}</td>
              <td className="px-2 py-2">{totals.available}</td>
              <td className="px-2 py-2">{totals.onHold}</td>
              <td className="px-2 py-2">{totals.sold}</td>
              {totals.unavailable ? <td className="px-2 py-2">{totals.unavailable}</td> : null}
              <td />
            </tr>
          </tfoot>
        </table>
      </div>
      <span className="text-[11.5px]" style={{ color: "var(--g-fnt)" }}>
        {hasLive && hasManual
          ? `Live = counted from individual plots in Inventory (${totals.liveAvailable} available). Manual = typed on the project, aggregate only (${totals.manualAvailable} available): no exact plot is promised from these.`
          : hasLive ? "Counted live from the individual plots / units in Inventory." : "Typed on the project (aggregate only). No individual plots are linked yet, so no exact plot is promised from these figures."}
      </span>
    </div>
  );
};
