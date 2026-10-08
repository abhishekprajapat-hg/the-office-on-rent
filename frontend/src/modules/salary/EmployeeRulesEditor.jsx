import React, { useState } from "react";
import { Loader2 } from "lucide-react";
import { setEmployeeRules } from "../../services/salaryService";
import { toErrorMessage } from "../../utils/errorMessage";
import AttendanceRuleFields from "./AttendanceRuleFields";
import { primaryButtonClass, secondaryButtonClass } from "./salaryUi";
import { rulesFormToPayload, summarizeRules, toRulesForm } from "./salaryFormat";

const PER_PERSON_FIELDS = ["absent", "unapprovedLeave", "halfDay", "unpaidLeave", "paidLeave", "late", "lateGraceCount", "lateEveryCount"];

/*
 * How much comes off one person's salary for each absent day, half day, leave
 * and late check-in. Either the company's rules, or amounts set for this
 * person alone - "₹1,000 for each absent day, ₹500 for a half day" - by an
 * admin or their manager.
 *
 * The caller remounts this (by key) after a save, so it always starts from
 * what is stored.
 */
export default function EmployeeRulesEditor({ userId, firstName, companyRules, deductionRules, onSaved }) {
  const hasOwn = Boolean(deductionRules);
  const [mode, setMode] = useState(hasOwn ? "own" : "company");
  // Own amounts start from what is saved, or from the company's rules the
  // first time - the per-day basis always being the company's.
  const [form, setForm] = useState(() => toRulesForm({ ...companyRules, ...(deductionRules || {}) }));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const changeField = (field, value) => setForm((current) => ({ ...current, [field]: value }));
  const changeRule = (key, next) => setForm((current) => ({ ...current, [key]: next }));

  const save = async (payload) => {
    setSaving(true);
    setError("");
    try {
      const result = await setEmployeeRules(userId, payload);
      await onSaved?.(result?.message || "Deductions saved");
    } catch (saveError) {
      setError(toErrorMessage(saveError, "Failed to save the deductions"));
    } finally {
      setSaving(false);
    }
  };

  const saveOwn = (event) => {
    event.preventDefault();
    const { payload, error: formError } = rulesFormToPayload(form);
    if (formError) {
      setError(formError);
      return;
    }
    save(Object.fromEntries(PER_PERSON_FIELDS.map((field) => [field, payload[field]])));
  };

  const modeButton = (value, label) => (
    <button
      type="button"
      onClick={() => { setMode(value); setError(""); }}
      aria-pressed={mode === value}
      disabled={saving}
      className={`h-8 rounded-md px-3 text-[12.5px] font-semibold transition ${
        mode === value ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-800"
      }`}
    >
      {label}
    </button>
  );

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h3 className="text-[13.5px] font-semibold text-slate-900">Attendance deductions for {firstName}</h3>
          <p className="mt-0.5 text-[12px] text-slate-500">
            How much comes off {firstName}&apos;s salary for each absent day, half day, leave and late check-in.
          </p>
        </div>
        <div className="inline-flex rounded-lg border border-slate-200 bg-slate-100 p-0.5">
          {modeButton("company", "Company rules")}
          {modeButton("own", `Set ${firstName}'s own`)}
        </div>
      </div>

      {mode === "company" ? (
        <div className="mt-3 rounded-lg border border-slate-200 p-3.5">
          <dl className="grid gap-x-6 gap-y-1.5 text-[12.5px] sm:grid-cols-2">
            {summarizeRules(companyRules).map((row) => (
              <div key={row.key} className="flex justify-between gap-3">
                <dt className="text-slate-500">{row.label}</dt>
                <dd className="text-right font-medium text-slate-800">{row.text}</dd>
              </div>
            ))}
          </dl>
          {hasOwn ? (
            <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 pt-3">
              <p className="text-[12px] text-amber-700">{firstName} has own amounts now. Save to switch back to the company&apos;s rules.</p>
              <button type="button" onClick={() => save({ useCompanyRules: true })} disabled={saving} className={secondaryButtonClass}>
                {saving ? <Loader2 size={14} className="animate-spin" /> : null}
                Use company rules
              </button>
            </div>
          ) : (
            <p className="mt-3 border-t border-slate-100 pt-3 text-[12px] text-slate-500">
              These are the company&apos;s rules, from the Deduction rules tab. Choose &quot;Set {firstName}&apos;s own&quot; to give {firstName} different amounts.
            </p>
          )}
        </div>
      ) : (
        <form onSubmit={saveOwn} className="mt-3 space-y-5 rounded-lg border border-blue-200 bg-blue-50/30 p-3.5">
          <AttendanceRuleFields form={form} onFieldChange={changeField} onRuleChange={changeRule} disabled={saving} />
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-[12px] text-slate-500">
              {hasOwn && deductionRules.updatedByName
                ? `Last set by ${deductionRules.updatedByName}${deductionRules.updatedAt ? ` on ${new Date(deductionRules.updatedAt).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}` : ""}. `
                : ""}
              Only {firstName}&apos;s salary uses these.
            </p>
            <button type="submit" disabled={saving} className={primaryButtonClass}>
              {saving ? <Loader2 size={14} className="animate-spin" /> : null}
              Save {firstName}&apos;s deductions
            </button>
          </div>
        </form>
      )}

      {error ? <p role="alert" className="mt-2 text-[12.5px] text-rose-700">{error}</p> : null}
    </div>
  );
}
