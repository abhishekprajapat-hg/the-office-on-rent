import React from "react";
import DeductionValueInput from "./DeductionValueInput";
import { fieldClass } from "./salaryUi";

const DAY_RULES = [
  { key: "absent", label: "Absent", hint: "No check-in, and no leave was asked for" },
  { key: "unapprovedLeave", label: "Unapproved leave", hint: "Absent on a day whose leave request is pending or was rejected" },
  { key: "halfDay", label: "Half day", hint: "Worked less than a full day, or marked Half Day" },
  { key: "unpaidLeave", label: "Unpaid leave", hint: "Approved leave of the Unpaid type" },
  { key: "paidLeave", label: "Paid leave", hint: "Approved casual, sick, emergency or other leave, and days marked Leave by an admin" },
];

const countInputClass = `${fieldClass} w-20 text-right font-mono`;

/*
 * What each kind of day costs, and the late check-in rule. The same fields
 * serve the company's rules and one person's own amounts, so both read alike.
 * `form` is the shape toRulesForm makes; the caller owns saving.
 */
export default function AttendanceRuleFields({ form, onFieldChange, onRuleChange, disabled }) {
  return (
    <>
      <fieldset>
        <legend className="text-[13.5px] font-semibold text-slate-900">Each day</legend>
        <p className="mt-0.5 text-[12.5px] text-slate-500">
          What each such day costs: a fixed amount in rupees, a percentage of the monthly salary, or days of pay. 0 means no deduction.
        </p>
        <div className="mt-2.5 divide-y divide-slate-100 rounded-lg border border-slate-200">
          {DAY_RULES.map((rule) => (
            <div key={rule.key} className="flex flex-wrap items-center gap-3 px-3.5 py-2.5">
              <span className="min-w-[200px] flex-1">
                <span className="block text-[13px] font-semibold text-slate-800">{rule.label}</span>
                <span className="block text-[12px] text-slate-500">{rule.hint}</span>
              </span>
              <DeductionValueInput rule={form[rule.key]} onChange={(next) => onRuleChange(rule.key, next)} disabled={disabled} label={rule.label} />
            </div>
          ))}
        </div>
      </fieldset>

      <fieldset>
        <legend className="text-[13.5px] font-semibold text-slate-900">Late check-ins</legend>
        <p className="mt-0.5 text-[12.5px] text-slate-500">Counted on the days the attendance page marks a check-in late.</p>
        <div className="mt-2.5 flex flex-wrap items-center gap-2 rounded-lg border border-slate-200 px-3.5 py-3 text-[13px] text-slate-700">
          <span>The first</span>
          <input type="number" min="0" max="31" step="1" value={form.lateGraceCount} onChange={(event) => onFieldChange("lateGraceCount", event.target.value)} disabled={disabled} className={countInputClass} aria-label="Free late check-ins per month" />
          <span>in a month are free. After that, for every</span>
          <input type="number" min="1" max="31" step="1" value={form.lateEveryCount} onChange={(event) => onFieldChange("lateEveryCount", event.target.value)} disabled={disabled} className={countInputClass} aria-label="Late check-ins per deduction" />
          <span>late check-ins, take off</span>
          <DeductionValueInput rule={form.late} onChange={(next) => onRuleChange("late", next)} disabled={disabled} label="Late check-in deduction" />
        </div>
      </fieldset>
    </>
  );
}
