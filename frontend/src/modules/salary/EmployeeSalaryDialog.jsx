import React, { useCallback, useEffect, useRef, useState } from "react";
import { Loader2 } from "lucide-react";
import Modal from "../../components/ui/Modal";
import {
  addEmployeeDeduction,
  getUserSalary,
  removeEmployeeDeduction,
  setUserSalary,
  updateEmployeeDeduction,
} from "../../services/salaryService";
import { isDeleteApprovalPending } from "../../services/deleteRequestService";
import { toErrorMessage } from "../../utils/errorMessage";
import SalaryBreakdown from "./SalaryBreakdown";
import CustomDeductionsEditor from "./CustomDeductionsEditor";
import EmployeeRulesEditor from "./EmployeeRulesEditor";
import { fieldClass, primaryButtonClass } from "./salaryUi";
import { formatMonthLabel, formatRupees } from "./salaryFormat";

/*
 * One team member's pay, opened from the team list: this month's breakdown,
 * the form to set or change the salary, and every figure it has had.
 *
 * A change takes effect from a month, not from now: a raise from November
 * leaves October's figures as they were.
 */
export default function EmployeeSalaryDialog({ user, monthKey, focusForm = false, onClose, onSaved }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [amount, setAmount] = useState("");
  const [effectiveFrom, setEffectiveFrom] = useState(monthKey);
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState("");
  const amountRef = useRef(null);

  // Stable: Modal re-runs its focus handling whenever onClose changes.
  const onCloseRef = useRef(onClose);
  useEffect(() => { onCloseRef.current = onClose; }, [onClose]);
  const savingRef = useRef(false);
  const close = useCallback(() => {
    if (!savingRef.current) onCloseRef.current();
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const payload = await getUserSalary(user._id, { month: monthKey });
      setData(payload);
      setAmount((current) => current || (payload.latestMonthlySalary != null ? String(payload.latestMonthlySalary) : ""));
    } catch (loadError) {
      setError(toErrorMessage(loadError, "Failed to load salary"));
    } finally {
      setLoading(false);
    }
  }, [monthKey, user._id]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    if (focusForm && !loading) amountRef.current?.focus();
  }, [focusForm, loading]);

  const submit = async (event) => {
    event.preventDefault();
    if (savingRef.current) return;
    const value = Number(amount);
    if (!amount.trim() || !Number.isFinite(value) || value < 0) {
      setFormError("Enter the monthly salary in rupees");
      return;
    }
    savingRef.current = true;
    setSaving(true);
    setFormError("");
    try {
      const result = await setUserSalary(user._id, { monthlySalary: value, effectiveFrom, note: note.trim() });
      setNote("");
      await load();
      onSaved?.(result?.message || "Salary saved");
    } catch (saveError) {
      setFormError(toErrorMessage(saveError, "Failed to save salary"));
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  };

  const revisions = Array.isArray(data?.revisions) ? data.revisions : [];
  const firstName = String(user.name || "").trim().split(/\s+/)[0] || "this person";

  /*
   * A change to this person's deductions changes this month's figures, so the
   * dialog reloads to show the new breakdown, and the team list behind it is
   * told to refresh as well.
   */
  const afterDeductionChange = async (result, fallback) => {
    await load();
    onSaved?.(result?.message || fallback);
  };
  const addDeduction = async (payload) => {
    await afterDeductionChange(await addEmployeeDeduction(user._id, payload), "Deduction added");
  };
  const updateDeduction = async (item, payload) => {
    await afterDeductionChange(await updateEmployeeDeduction(user._id, item._id, payload), "Deduction updated");
  };
  // A manager's removal waits for an admin; nothing changes until then.
  const removeDeduction = async (item) => {
    const result = await removeEmployeeDeduction(user._id, item._id);
    if (isDeleteApprovalPending(result)) onSaved?.(result.message);
    else await afterDeductionChange(result, "Deduction removed");
  };

  return (
    <Modal
      open
      size="lg"
      title={user.name || "Employee"}
      description={`Salary for ${formatMonthLabel(monthKey)}`}
      onClose={close}
    >
      {loading && !data ? (
        <div className="flex items-center gap-2 py-10 text-[13px] text-slate-500">
          <Loader2 size={15} className="animate-spin" /> Loading salary…
        </div>
      ) : error ? (
        <p role="alert" className="rounded-lg border border-rose-200 bg-rose-50 p-3 text-[13px] text-rose-700">{error}</p>
      ) : (
        <div className="space-y-5">
          {data?.salary ? (
            <SalaryBreakdown salary={data.salary} />
          ) : (
            <p className="rounded-lg border border-dashed border-slate-300 bg-slate-50 p-4 text-[13px] text-slate-600">
              No salary is set for {formatMonthLabel(monthKey)}. Set one below and this month&apos;s deductions will show here.
            </p>
          )}

          <form onSubmit={submit} className="rounded-lg border border-slate-200 p-4">
            <h3 className="text-[13.5px] font-semibold text-slate-900">
              {data?.latestMonthlySalary != null ? "Change salary" : "Set salary"}
            </h3>
            <div className="mt-3 grid gap-3 sm:grid-cols-[1fr_auto]">
              <label className="block text-[12.5px] font-semibold text-slate-600">
                Monthly salary (₹)
                <input
                  ref={amountRef}
                  type="number"
                  inputMode="decimal"
                  min="0"
                  step="1"
                  value={amount}
                  disabled={saving}
                  onChange={(event) => setAmount(event.target.value)}
                  placeholder="e.g. 30000"
                  className={`${fieldClass} mt-1 w-full font-mono`}
                />
              </label>
              <label className="block text-[12.5px] font-semibold text-slate-600">
                Effective from
                <input
                  type="month"
                  required
                  value={effectiveFrom}
                  disabled={saving}
                  onChange={(event) => setEffectiveFrom(event.target.value)}
                  className={`${fieldClass} mt-1 w-full`}
                />
              </label>
            </div>
            <label className="mt-3 block text-[12.5px] font-semibold text-slate-600">
              Note <span className="font-normal text-slate-400">(optional, only admins and managers see it)</span>
              <input
                type="text"
                maxLength={240}
                value={note}
                disabled={saving}
                onChange={(event) => setNote(event.target.value)}
                placeholder="e.g. Annual raise"
                className={`${fieldClass} mt-1 w-full font-normal`}
              />
            </label>
            {formError ? <p role="alert" className="mt-3 text-[12.5px] text-rose-700">{formError}</p> : null}
            <div className="mt-3 flex items-center justify-between gap-3">
              <p className="text-[12px] text-slate-500">Months before {formatMonthLabel(effectiveFrom)} keep their old figure.</p>
              <button type="submit" disabled={saving} className={primaryButtonClass}>
                {saving ? <Loader2 size={14} className="animate-spin" /> : null}
                Save salary
              </button>
            </div>
          </form>

          {data?.companyRules ? (
            <EmployeeRulesEditor
              // Remounted after each save, so the form starts from what is stored.
              key={data.deductionRules?.updatedAt || "company-rules"}
              userId={user._id}
              firstName={firstName}
              companyRules={data.companyRules}
              deductionRules={data.deductionRules}
              onSaved={(message) => afterDeductionChange({ message }, "Deductions saved")}
            />
          ) : null}

          <div>
            <h3 className="text-[13.5px] font-semibold text-slate-900">Other deductions for {firstName}</h3>
            <p className="mb-2 mt-0.5 text-[12px] text-slate-500">
              Only for {firstName}, on top of the company&apos;s rules - an advance being recovered, a loan, a one-off fine.
            </p>
            <CustomDeductionsEditor
              items={Array.isArray(data?.deductions) ? data.deductions : []}
              monthKey={monthKey}
              emptyText={`Nothing extra is deducted from ${firstName}'s salary.`}
              onAdd={addDeduction}
              onUpdate={updateDeduction}
              onRemove={removeDeduction}
            />
          </div>

          {revisions.length ? (
            <div>
              <h3 className="text-[13.5px] font-semibold text-slate-900">Salary history</h3>
              <ul className="mt-2 divide-y divide-slate-100 rounded-lg border border-slate-200 text-[13px]">
                {revisions.map((revision, index) => (
                  <li key={`${revision.effectiveFrom}-${revision.setAt || index}`} className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5 px-3 py-2">
                    <span className="font-mono font-semibold tabular-nums text-slate-900">{formatRupees(revision.monthlySalary)}</span>
                    <span className="text-slate-600">from {formatMonthLabel(revision.effectiveFrom)}</span>
                    <span className="ml-auto text-[12px] text-slate-500">
                      {revision.setByName ? `Set by ${revision.setByName}` : "Set"}
                      {revision.setAt ? ` on ${new Date(revision.setAt).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}` : ""}
                    </span>
                    {revision.note ? <span className="basis-full text-[12px] text-slate-500">{revision.note}</span> : null}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </div>
      )}
    </Modal>
  );
}
