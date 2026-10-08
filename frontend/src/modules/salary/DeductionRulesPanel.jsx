import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Loader2, Scale } from "lucide-react";
import { getPayrollPolicy, updatePayrollPolicy } from "../../services/salaryService";
import { toErrorMessage } from "../../utils/errorMessage";
import { cardClass, fieldClass, primaryButtonClass, SectionHeader } from "./salaryUi";

const DAY_RULES = [
  { field: "absentDays", label: "Absent", hint: "No check-in, and no leave was asked for" },
  { field: "unapprovedLeaveDays", label: "Unapproved leave", hint: "Absent on a day whose leave request is pending or was rejected" },
  { field: "halfDayDays", label: "Half day", hint: "Worked less than a full day, or marked Half Day" },
  { field: "unpaidLeaveDays", label: "Unpaid leave", hint: "Approved leave of the Unpaid type" },
  { field: "paidLeaveDays", label: "Paid leave", hint: "Approved casual, sick, emergency or other leave, and days marked Leave by an admin" },
];

const NUMBER_FIELDS = [
  "fixedDaysPerMonth", "absentDays", "unapprovedLeaveDays", "halfDayDays", "unpaidLeaveDays",
  "paidLeaveDays", "lateGraceCount", "lateEveryCount", "lateDeductionValue",
];

const toForm = (policy) => Object.fromEntries(
  Object.entries(policy || {}).map(([key, value]) => [key, typeof value === "number" ? String(value) : value]),
);

const numberInputClass = `${fieldClass} w-20 text-right font-mono`;

/*
 * The company's rules for turning attendance into deductions. They are applied
 * when a salary is looked at, not stored with it, so a change shows up at once
 * on every month - past ones included.
 */
export default function DeductionRulesPanel({ onSaved }) {
  const [saved, setSaved] = useState(null);
  const [form, setForm] = useState(null);
  const [meta, setMeta] = useState({ updatedAt: null, updatedByName: "", isDefault: true });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const payload = await getPayrollPolicy();
      setSaved(payload.policy);
      setForm(toForm(payload.policy));
      setMeta({ updatedAt: payload.updatedAt, updatedByName: payload.updatedByName, isDefault: payload.isDefault });
    } catch (loadError) {
      setError(toErrorMessage(loadError, "Failed to load the deduction rules"));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const dirty = useMemo(() => {
    if (!saved || !form) return false;
    return Object.keys(saved).some((key) => String(saved[key]) !== String(form[key]));
  }, [form, saved]);

  const set = (field) => (event) => setForm((current) => ({ ...current, [field]: event.target.value }));

  const submit = async (event) => {
    event.preventDefault();
    if (!form) return;
    const payload = { perDayBasis: form.perDayBasis, lateDeductionUnit: form.lateDeductionUnit };
    for (const field of NUMBER_FIELDS) {
      if (String(form[field]).trim() === "") {
        setError("Fill in every rule - use 0 for no deduction");
        return;
      }
      payload[field] = Number(form[field]);
    }
    setSaving(true);
    setError("");
    try {
      const result = await updatePayrollPolicy(payload);
      setSaved(result.policy);
      setForm(toForm(result.policy));
      setMeta({ updatedAt: result.updatedAt, updatedByName: result.updatedByName, isDefault: false });
      onSaved?.(result.message || "Deduction rules saved");
    } catch (saveError) {
      setError(toErrorMessage(saveError, "Failed to save the deduction rules"));
    } finally {
      setSaving(false);
    }
  };

  return (
    <section className={cardClass}>
      <SectionHeader
        icon={Scale}
        tone="violet"
        title="Deduction rules"
        subtitle="How attendance turns into salary deductions, for everybody in the company"
      />
      {loading && !form ? (
        <div className="flex items-center gap-2 px-5 py-10 text-[13px] text-slate-500">
          <Loader2 size={15} className="animate-spin" /> Loading rules…
        </div>
      ) : !form ? (
        <p role="alert" className="m-5 rounded-lg border border-rose-200 bg-rose-50 p-3 text-[13px] text-rose-700">{error}</p>
      ) : (
        <form onSubmit={submit} className="space-y-6 p-5">
          <fieldset>
            <legend className="text-[13.5px] font-semibold text-slate-900">Per-day salary</legend>
            <p className="mt-0.5 text-[12.5px] text-slate-500">Every deduction below is counted in days of this pay.</p>
            <div className="mt-2.5 flex flex-wrap items-center gap-2 text-[13px] text-slate-700">
              <span>Monthly salary divided by</span>
              <select value={form.perDayBasis} onChange={set("perDayBasis")} disabled={saving} className={fieldClass}>
                <option value="CALENDAR_DAYS">the days in that month (28–31)</option>
                <option value="WORKING_DAYS">the working days in that month</option>
                <option value="FIXED_DAYS">a fixed number of days</option>
              </select>
              {form.perDayBasis === "FIXED_DAYS" ? (
                <>
                  <input type="number" min="1" max="31" step="1" value={form.fixedDaysPerMonth} onChange={set("fixedDaysPerMonth")} disabled={saving} className={numberInputClass} aria-label="Days per month" />
                  <span>days</span>
                </>
              ) : null}
            </div>
          </fieldset>

          <fieldset>
            <legend className="text-[13.5px] font-semibold text-slate-900">Each day</legend>
            <p className="mt-0.5 text-[12.5px] text-slate-500">Days of pay taken off for each such day. 0 means no deduction; 0.5 is half a day.</p>
            <div className="mt-2.5 divide-y divide-slate-100 rounded-lg border border-slate-200">
              {DAY_RULES.map((rule) => (
                <label key={rule.field} className="flex flex-wrap items-center gap-3 px-3.5 py-2.5">
                  <span className="min-w-[200px] flex-1">
                    <span className="block text-[13px] font-semibold text-slate-800">{rule.label}</span>
                    <span className="block text-[12px] text-slate-500">{rule.hint}</span>
                  </span>
                  <span className="flex items-center gap-2 text-[13px] text-slate-600">
                    <input type="number" min="0" max="5" step="0.25" value={form[rule.field]} onChange={set(rule.field)} disabled={saving} className={numberInputClass} />
                    days of pay
                  </span>
                </label>
              ))}
            </div>
          </fieldset>

          <fieldset>
            <legend className="text-[13.5px] font-semibold text-slate-900">Late check-ins</legend>
            <p className="mt-0.5 text-[12.5px] text-slate-500">Counted on the days the attendance page marks a check-in late.</p>
            <div className="mt-2.5 flex flex-wrap items-center gap-2 rounded-lg border border-slate-200 px-3.5 py-3 text-[13px] text-slate-700">
              <span>The first</span>
              <input type="number" min="0" max="31" step="1" value={form.lateGraceCount} onChange={set("lateGraceCount")} disabled={saving} className={numberInputClass} aria-label="Free late check-ins per month" />
              <span>in a month are free. After that, for every</span>
              <input type="number" min="1" max="31" step="1" value={form.lateEveryCount} onChange={set("lateEveryCount")} disabled={saving} className={numberInputClass} aria-label="Late check-ins per deduction" />
              <span>late check-ins, take off</span>
              <input
                type="number"
                min="0"
                max={form.lateDeductionUnit === "AMOUNT" ? 100000 : 5}
                step={form.lateDeductionUnit === "AMOUNT" ? 1 : 0.25}
                value={form.lateDeductionValue}
                onChange={set("lateDeductionValue")}
                disabled={saving}
                className={numberInputClass}
                aria-label="Late deduction"
              />
              <select value={form.lateDeductionUnit} onChange={set("lateDeductionUnit")} disabled={saving} className={fieldClass} aria-label="Late deduction unit">
                <option value="DAYS">days of pay</option>
                <option value="AMOUNT">rupees (₹)</option>
              </select>
            </div>
          </fieldset>

          <p className="rounded-lg border border-amber-200 bg-amber-50 px-3.5 py-2.5 text-[12.5px] text-amber-800">
            Rules apply to every salary as soon as they are saved, including months already past.
          </p>

          {error ? <p role="alert" className="text-[12.5px] text-rose-700">{error}</p> : null}

          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 pt-4">
            <p className="text-[12px] text-slate-500">
              {meta.isDefault
                ? "Using the default rules - nothing has been saved yet."
                : `Last changed${meta.updatedByName ? ` by ${meta.updatedByName}` : ""}${meta.updatedAt ? ` on ${new Date(meta.updatedAt).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}` : ""}.`}
            </p>
            <div className="flex gap-2">
              {dirty ? (
                <button type="button" onClick={() => setForm(toForm(saved))} disabled={saving} className="rounded-lg px-3 py-2 text-[13px] font-semibold text-slate-600 hover:bg-slate-100">
                  Discard changes
                </button>
              ) : null}
              <button type="submit" disabled={saving || (!dirty && !meta.isDefault)} className={primaryButtonClass}>
                {saving ? <Loader2 size={14} className="animate-spin" /> : null}
                Save rules
              </button>
            </div>
          </div>
        </form>
      )}
    </section>
  );
}
