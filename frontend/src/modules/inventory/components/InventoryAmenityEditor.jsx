import React, { useState } from "react";
import { Plus, X } from "lucide-react";

// Stored in the type's free-form details as "|"-joined strings, which the
// server keeps as-is (it caps each value at 500 characters).
const SEPARATOR = "|";
const MAX_CUSTOM = 20;
const MAX_LABEL = 40;
const splitList = (value) => String(value || "").split(SEPARATOR).map((item) => item.trim()).filter(Boolean);

/*
 * The amenity ticks for a property type, where the user can also remove a
 * built-in amenity that doesn't apply and add their own.
 */
const InventoryAmenityEditor = ({ fields = [], subtypeData = {}, onChange, checkboxClass, inputClass }) => {
  const [draft, setDraft] = useState("");
  const [error, setError] = useState("");
  const removed = new Set(splitList(subtypeData.removedAmenities));
  const custom = splitList(subtypeData.customAmenities);
  const visible = fields.filter((field) => !removed.has(field.key));

  const removeBuiltIn = (key) => {
    onChange(key, false);
    onChange("removedAmenities", [...removed, key].join(SEPARATOR));
  };
  const removeCustom = (label) => onChange("customAmenities", custom.filter((item) => item !== label).join(SEPARATOR));

  const addAmenity = () => {
    const label = draft.replace(/\|/g, " ").trim().slice(0, MAX_LABEL);
    if (!label) return;
    const lower = label.toLowerCase();
    const builtIn = fields.find((field) => field.label.toLowerCase() === lower);
    if (builtIn) {
      // Re-adding a removed built-in amenity brings it back, ticked.
      onChange("removedAmenities", [...removed].filter((key) => key !== builtIn.key).join(SEPARATOR));
      onChange(builtIn.key, true);
    } else if (custom.some((item) => item.toLowerCase() === lower)) {
      setError("Already in the list");
      return;
    } else if (custom.length >= MAX_CUSTOM) {
      setError(`You can add up to ${MAX_CUSTOM} amenities`);
      return;
    } else {
      onChange("customAmenities", [...custom, label].join(SEPARATOR));
    }
    setDraft("");
    setError("");
  };

  return (
    <div className="space-y-2 sm:col-span-2">
      <div className="text-[13px] font-medium text-[var(--g-mut)]">Amenities</div>
      <div className="flex flex-wrap gap-2">
        {visible.map((field) => (
          <span key={field.key} className={`${checkboxClass} !pr-1.5`}>
            <label className="inline-flex cursor-pointer items-center gap-2">
              <input
                type="checkbox"
                checked={Boolean(subtypeData[field.key])}
                onChange={(event) => onChange(field.key, event.target.checked)}
                className="h-3.5 w-3.5 rounded border-slate-300 text-emerald-600 focus:ring-emerald-500"
              />
              {field.label}
            </label>
            <button type="button" onClick={() => removeBuiltIn(field.key)} aria-label={`Remove ${field.label}`} className="rounded p-0.5 text-slate-400 hover:bg-rose-50 hover:text-rose-600">
              <X size={13} />
            </button>
          </span>
        ))}
        {custom.map((label) => (
          <span key={label} className={`${checkboxClass} !pr-1.5`}>
            <span className="inline-flex items-center gap-2">
              <input type="checkbox" checked readOnly disabled className="h-3.5 w-3.5 rounded border-slate-300 text-emerald-600" />
              {label}
            </span>
            <button type="button" onClick={() => removeCustom(label)} aria-label={`Remove ${label}`} className="rounded p-0.5 text-slate-400 hover:bg-rose-50 hover:text-rose-600">
              <X size={13} />
            </button>
          </span>
        ))}
      </div>
      <div className="flex gap-2">
        <input
          type="text"
          value={draft}
          maxLength={MAX_LABEL}
          onChange={(e) => { setDraft(e.target.value); setError(""); }}
          onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addAmenity(); } }}
          placeholder="Add an amenity, e.g. Lawn"
          aria-label="New amenity"
          className={`${inputClass} flex-1`}
        />
        <button type="button" onClick={addAmenity} className="inline-flex shrink-0 items-center gap-1 rounded-xl border border-dashed border-slate-300 px-3 text-[12.5px] font-semibold text-emerald-700 hover:bg-emerald-50">
          <Plus size={14} /> Add amenity
        </button>
      </div>
      {error ? <p className="text-[11.5px] text-rose-600">{error}</p> : null}
    </div>
  );
};

export default InventoryAmenityEditor;
