import React, { useState } from "react";
import { Loader2, Pencil, Plus, Trash2 } from "lucide-react";
import { toErrorMessage } from "../../utils/errorMessage";
import DeductionValueInput from "./DeductionValueInput";
import { fieldClass, primaryButtonClass, secondaryButtonClass } from "./salaryUi";
import { currentMonthKey, deductionStatus, describeDeductionCost, describeDeductionSchedule } from "./salaryFormat";

const STATUS_CHIPS = {
  upcoming: { label: "Not started", className: "border-blue-200 bg-blue-50 text-blue-700" },
  ended: { label: "Ended", className: "border-slate-200 bg-slate-100 text-slate-500" },
};

const emptyForm = (monthKey) => ({
  name: "",
  rule: { unit: "AMOUNT", value: "" },
  frequency: "MONTHLY",
  fromMonth: monthKey,
  toMonth: "",
});

const toForm = (item) => ({
  name: item.name,
  rule: { unit: item.unit, value: String(item.value) },
  frequency: item.frequency,
  fromMonth: item.fromMonth,
  toMonth: item.frequency === "ONCE" ? "" : item.toMonth || "",
});

/*
 * The form for one named deduction: what it is called, what it costs, and when
 * it applies - every month (optionally until a month) or one month only.
 */
const DeductionForm = ({ initial, submitLabel, onSubmit, onCancel }) => {
  const [form, setForm] = useState(initial);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const set = (field) => (value) => setForm((current) => ({ ...current, [field]: value }));

  const submit = async (event) => {
    event.preventDefault();
    const value = Number(form.rule.value);
    if (!form.name.trim()) return setError("Give the deduction a name");
    if (String(form.rule.value).trim() === "" || !Number.isFinite(value) || value <= 0) {
      return setError("Enter how much to deduct - more than 0");
    }
    if (!form.fromMonth) return setError("Choose the month");
    setSaving(true);
    setError("");
    try {
      await onSubmit({
        name: form.name.trim(),
        unit: form.rule.unit,
        value,
        frequency: form.frequency,
        fromMonth: form.fromMonth,
        toMonth: form.frequency === "ONCE" ? form.fromMonth : form.toMonth,
      });
    } catch (submitError) {
      setError(toErrorMessage(submitError, "Failed to save the deduction"));
      setSaving(false);
    }
    return undefined;
  };

  const frequencyButton = (value, label) => (
    <button
      type="button"
      onClick={() => set("frequency")(value)}
      aria-pressed={form.frequency === value}
      disabled={saving}
      className={`h-8 rounded-md px-3 text-[12.5px] font-semibold transition ${
        form.frequency === value ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-800"
      }`}
    >
      {label}
    </button>
  );

  return (
    <form onSubmit={submit} className="space-y-3 rounded-lg border border-blue-200 bg-blue-50/40 p-3.5">
      <div className="flex flex-wrap items-end gap-3">
        <label className="block min-w-[200px] flex-1 text-[12.5px] font-semibold text-slate-600">
          Name
          <input
            type="text"
            value={form.name}
            maxLength={60}
            disabled={saving}
            onChange={(event) => set("name")(event.target.value)}
            placeholder="e.g. PF, Professional tax, Advance recovery"
            className={`${fieldClass} mt-1 w-full font-normal`}
            autoFocus
          />
        </label>
        <div className="text-[12.5px] font-semibold text-slate-600">
          Deduct
          <div className="mt-1">
            <DeductionValueInput rule={form.rule} onChange={set("rule")} disabled={saving} label={form.name || "Deduction"} />
          </div>
        </div>
      </div>

      <div className="flex flex-wrap items-end gap-3">
        <div className="text-[12.5px] font-semibold text-slate-600">
          How often
          <div className="mt-1 inline-flex rounded-lg border border-slate-200 bg-slate-100 p-0.5">
            {frequencyButton("MONTHLY", "Every month")}
            {frequencyButton("ONCE", "One month only")}
          </div>
        </div>
        <label className="block text-[12.5px] font-semibold text-slate-600">
          {form.frequency === "ONCE" ? "Month" : "From"}
          <input
            type="month"
            required
            value={form.fromMonth}
            disabled={saving}
            onChange={(event) => set("fromMonth")(event.target.value)}
            className={`${fieldClass} mt-1 block`}
          />
        </label>
        {form.frequency === "MONTHLY" ? (
          <label className="block text-[12.5px] font-semibold text-slate-600">
            Until <span className="font-normal text-slate-400">(optional)</span>
            <input
              type="month"
              value={form.toMonth}
              min={form.fromMonth || undefined}
              disabled={saving}
              onChange={(event) => set("toMonth")(event.target.value)}
              className={`${fieldClass} mt-1 block`}
            />
          </label>
        ) : null}
      </div>

      {error ? <p role="alert" className="text-[12.5px] text-rose-700">{error}</p> : null}

      <div className="flex justify-end gap-2">
        <button type="button" onClick={onCancel} disabled={saving} className="rounded-lg px-3 py-2 text-[13px] font-semibold text-slate-600 hover:bg-slate-100">
          Cancel
        </button>
        <button type="submit" disabled={saving} className={primaryButtonClass}>
          {saving ? <Loader2 size={14} className="animate-spin" /> : null}
          {submitLabel}
        </button>
      </div>
    </form>
  );
};

/*
 * A list of named deductions with add, edit and remove - the company's, on the
 * rules tab, and one person's, in their salary dialog. The caller does the
 * saving; this owns only which row is open.
 */
export default function CustomDeductionsEditor({
  items = [],
  monthKey = currentMonthKey(),
  emptyText,
  onAdd,
  onUpdate,
  onRemove,
}) {
  const [editing, setEditing] = useState(null);
  const [confirmingId, setConfirmingId] = useState(null);
  const [removingId, setRemovingId] = useState(null);
  const [removeError, setRemoveError] = useState("");

  const remove = async (item) => {
    setRemovingId(String(item._id));
    setRemoveError("");
    try {
      await onRemove(item);
      setConfirmingId(null);
    } catch (error) {
      setRemoveError(toErrorMessage(error, "Failed to remove the deduction"));
    } finally {
      setRemovingId(null);
    }
  };

  return (
    <div className="space-y-2.5">
      {items.length ? (
        <ul className="divide-y divide-slate-100 rounded-lg border border-slate-200">
          {items.map((item) => {
            const id = String(item._id);
            if (editing === id) {
              return (
                <li key={id} className="p-2">
                  <DeductionForm
                    initial={toForm(item)}
                    submitLabel="Save changes"
                    onSubmit={async (payload) => { await onUpdate(item, payload); setEditing(null); }}
                    onCancel={() => setEditing(null)}
                  />
                </li>
              );
            }
            const chip = STATUS_CHIPS[deductionStatus(item, monthKey)];
            return (
              <li key={id} className="flex flex-wrap items-center gap-3 px-3.5 py-2.5">
                <div className="min-w-[180px] flex-1">
                  <p className="flex flex-wrap items-center gap-2 text-[13px] font-semibold text-slate-800">
                    {item.name}
                    {chip ? (
                      <span className={`rounded-full border px-2 py-0.5 text-[10.5px] font-semibold ${chip.className}`}>{chip.label}</span>
                    ) : null}
                  </p>
                  <p className="text-[12px] text-slate-500">
                    <span className="font-mono font-semibold text-slate-700">{describeDeductionCost(item)}</span>
                    {" · "}
                    {describeDeductionSchedule(item)}
                  </p>
                </div>
                {confirmingId === id ? (
                  <span className="flex items-center gap-2 text-[12.5px] text-slate-600">
                    Remove {item.name}?
                    <button
                      type="button"
                      onClick={() => remove(item)}
                      disabled={removingId === id}
                      className="inline-flex items-center gap-1.5 rounded-lg border border-rose-600 bg-rose-600 px-3 py-1.5 font-semibold text-white hover:bg-rose-700 disabled:opacity-60"
                    >
                      {removingId === id ? <Loader2 size={13} className="animate-spin" /> : null}
                      Remove
                    </button>
                    <button type="button" onClick={() => setConfirmingId(null)} disabled={removingId === id} className="rounded-lg px-2 py-1.5 font-semibold text-slate-600 hover:bg-slate-100">
                      Keep
                    </button>
                  </span>
                ) : (
                  <span className="flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() => { setEditing(id); setConfirmingId(null); }}
                      className="grid h-8 w-8 place-items-center rounded-lg text-slate-500 transition hover:bg-slate-100 hover:text-blue-700"
                      aria-label={`Edit ${item.name}`}
                      title="Edit"
                    >
                      <Pencil size={14} />
                    </button>
                    <button
                      type="button"
                      onClick={() => { setConfirmingId(id); setRemoveError(""); }}
                      className="grid h-8 w-8 place-items-center rounded-lg text-slate-500 transition hover:bg-rose-50 hover:text-rose-700"
                      aria-label={`Remove ${item.name}`}
                      title="Remove"
                    >
                      <Trash2 size={14} />
                    </button>
                  </span>
                )}
              </li>
            );
          })}
        </ul>
      ) : editing !== "new" ? (
        <p className="rounded-lg border border-dashed border-slate-300 bg-slate-50 px-4 py-3 text-[12.5px] text-slate-500">{emptyText}</p>
      ) : null}

      {removeError ? <p role="alert" className="text-[12.5px] text-rose-700">{removeError}</p> : null}

      {editing === "new" ? (
        <DeductionForm
          initial={emptyForm(monthKey)}
          submitLabel="Add deduction"
          onSubmit={async (payload) => { await onAdd(payload); setEditing(null); }}
          onCancel={() => setEditing(null)}
        />
      ) : (
        <button type="button" onClick={() => { setEditing("new"); setConfirmingId(null); }} className={`${secondaryButtonClass} h-8 py-0`}>
          <Plus size={14} /> Add deduction
        </button>
      )}
    </div>
  );
}
