import React, { useCallback, useEffect, useMemo, useState } from "react";
import { ListPlus, Loader2, Scale } from "lucide-react";
import {
  addCompanyDeduction,
  getPayrollPolicy,
  removeCompanyDeduction,
  updateCompanyDeduction,
  updatePayrollPolicy,
} from "../../services/salaryService";
import { isDeleteApprovalPending } from "../../services/deleteRequestService";
import { toErrorMessage } from "../../utils/errorMessage";
import { cardClass, fieldClass, primaryButtonClass, SectionHeader } from "./salaryUi";
import AttendanceRuleFields from "./AttendanceRuleFields";
import CustomDeductionsEditor from "./CustomDeductionsEditor";
import {
  isRulesFormChanged,
  rulesFormToPayload,
  toRulesForm,
} from "./salaryFormat";

const countInputClass = `${fieldClass} w-20 text-right font-mono`;

/*
 * The company's rules for turning attendance into deductions. They are applied
 * when a salary is looked at, not stored with it, so a change shows up at once
 * on every month - past ones included.
 */
export default function DeductionRulesPanel({ onSaved }) {
  const [saved, setSaved] = useState(null);
  const [form, setForm] = useState(null);
  const [customDeductions, setCustomDeductions] = useState([]);
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
      setForm(toRulesForm(payload.policy));
      setCustomDeductions(Array.isArray(payload.customDeductions) ? payload.customDeductions : []);
      setMeta({ updatedAt: payload.updatedAt, updatedByName: payload.updatedByName, isDefault: payload.isDefault });
    } catch (loadError) {
      setError(toErrorMessage(loadError, "Failed to load the deduction rules"));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const dirty = useMemo(() => isRulesFormChanged(form, saved), [form, saved]);

  // Each save answers with the whole list, so the screen shows what is stored.
  const addDeduction = async (payload) => {
    const result = await addCompanyDeduction(payload);
    setCustomDeductions(result.customDeductions || []);
    onSaved?.(result.message || "Deduction added");
  };
  const updateDeduction = async (item, payload) => {
    const result = await updateCompanyDeduction(item._id, payload);
    setCustomDeductions(result.customDeductions || []);
    onSaved?.(result.message || "Deduction updated");
  };
  // A manager's removal waits for an admin; the deduction stays until then.
  const removeDeduction = async (item) => {
    const result = await removeCompanyDeduction(item._id);
    if (!isDeleteApprovalPending(result)) setCustomDeductions(result.customDeductions || []);
    onSaved?.(result.message || "Deduction removed");
  };

  const changeField = (field, value) => setForm((current) => ({ ...current, [field]: value }));
  const changeRule = (key, next) => setForm((current) => ({ ...current, [key]: next }));

  const submit = async (event) => {
    event.preventDefault();
    if (!form) return;
    const { payload, error: formError } = rulesFormToPayload(form);
    if (formError) {
      setError(formError);
      return;
    }
    setSaving(true);
    setError("");
    try {
      const result = await updatePayrollPolicy(payload);
      setSaved(result.policy);
      setForm(toRulesForm(result.policy));
      setMeta({ updatedAt: result.updatedAt, updatedByName: result.updatedByName, isDefault: false });
      onSaved?.(result.message || "Deduction rules saved");
    } catch (saveError) {
      setError(toErrorMessage(saveError, "Failed to save the deduction rules"));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-4">
      <section className={cardClass}>
        <SectionHeader
          icon={Scale}
          tone="violet"
          title="Deduction rules"
          subtitle="How attendance turns into salary deductions - for everybody whose manager has not set their own amounts"
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
              <p className="mt-0.5 text-[12.5px] text-slate-500">Used by any rule below that is in days of pay.</p>
              <div className="mt-2.5 flex flex-wrap items-center gap-2 text-[13px] text-slate-700">
                <span>Monthly salary divided by</span>
                <select value={form.perDayBasis} onChange={(event) => changeField("perDayBasis", event.target.value)} disabled={saving} className={fieldClass}>
                  <option value="CALENDAR_DAYS">the days in that month (28–31)</option>
                  <option value="WORKING_DAYS">the working days in that month</option>
                  <option value="FIXED_DAYS">a fixed number of days</option>
                </select>
                {form.perDayBasis === "FIXED_DAYS" ? (
                  <>
                    <input type="number" min="1" max="31" step="1" value={form.fixedDaysPerMonth} onChange={(event) => changeField("fixedDaysPerMonth", event.target.value)} disabled={saving} className={countInputClass} aria-label="Days per month" />
                    <span>days</span>
                  </>
                ) : null}
              </div>
            </fieldset>

            <AttendanceRuleFields form={form} onFieldChange={changeField} onRuleChange={changeRule} disabled={saving} />

            <p className="rounded-lg border border-amber-200 bg-amber-50 px-3.5 py-2.5 text-[12.5px] text-amber-800">
              Rules apply to every salary as soon as they are saved, including months already past. Anyone with their own amounts - set from their salary on the Team salaries tab - keeps those instead.
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
                  <button type="button" onClick={() => { setForm(toRulesForm(saved)); setError(""); }} disabled={saving} className="rounded-lg px-3 py-2 text-[13px] font-semibold text-slate-600 hover:bg-slate-100">
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

      {form ? (
        <section className={cardClass}>
          <SectionHeader
            icon={ListPlus}
            tone="blue"
            title="Other deductions for everybody"
            subtitle="Named deductions every employee with a salary pays, such as PF or professional tax"
          />
          <div className="p-5">
            <CustomDeductionsEditor
              items={customDeductions}
              emptyText="No other deductions yet. Add one for things like PF, ESI or professional tax."
              onAdd={addDeduction}
              onUpdate={updateDeduction}
              onRemove={removeDeduction}
            />
            <p className="mt-3 text-[12px] text-slate-500">
              Deductions for one person only - an advance being recovered, say - are added from that person&apos;s salary on the Team salaries tab.
            </p>
          </div>
        </section>
      ) : null}
    </div>
  );
}
