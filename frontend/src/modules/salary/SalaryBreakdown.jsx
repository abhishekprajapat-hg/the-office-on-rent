import React from "react";
import { describeCoverage, describePerDay, formatRupees, formatShortDate } from "./salaryFormat";

const LINE_TONES = {
  absent: "bg-rose-500",
  unapprovedLeave: "bg-orange-500",
  halfDay: "bg-blue-500",
  unpaidLeave: "bg-violet-500",
  paidLeave: "bg-teal-500",
  late: "bg-amber-500",
  beforeJoining: "bg-slate-400",
};

const MAX_DATES_SHOWN = 8;

const Figure = ({ label, value, tone = "text-slate-900", emphasis = false }) => (
  <div className={`rounded-lg border px-3.5 py-3 ${emphasis ? "border-emerald-200 bg-emerald-50/60" : "border-slate-200 bg-slate-50/60"}`}>
    <p className="text-[12px] font-medium text-slate-500">{label}</p>
    <p className={`mt-0.5 font-mono font-bold tabular-nums ${emphasis ? "text-[22px]" : "text-[18px]"} ${tone}`}>{value}</p>
  </div>
);

/*
 * One person's month: what they earn, what attendance has taken off it so far,
 * and why - a line for every kind of day, with its rule and the dates it hit.
 * Lines that cost nothing still show, muted, so the rules are never a surprise.
 */
export default function SalaryBreakdown({ salary }) {
  if (!salary) return null;
  const lines = Array.isArray(salary.lines) ? salary.lines : [];
  const anyDeduction = lines.some((line) => line.amount > 0);

  return (
    <div className="space-y-4">
      <div className="grid gap-2.5 sm:grid-cols-3">
        <Figure label="Monthly salary" value={formatRupees(salary.monthlySalary)} />
        <Figure label="Deducted so far" value={formatRupees(salary.totalDeduction)} tone={salary.totalDeduction > 0 ? "text-rose-700" : "text-slate-900"} />
        <Figure label="Salary after deductions" value={formatRupees(salary.netSalary)} tone="text-emerald-700" emphasis />
      </div>

      <p className="flex flex-wrap gap-x-4 gap-y-1 text-[12.5px] text-slate-500">
        <span>
          Per day <span className="font-semibold text-slate-700">{formatRupees(salary.perDayRate)}</span>
          {" "}({describePerDay(salary)})
        </span>
        <span>Counted: <span className="font-semibold text-slate-700">{describeCoverage(salary)}</span></span>
      </p>

      <div className="overflow-x-auto rounded-lg border border-slate-200">
        <table className="min-w-full border-separate border-spacing-0 text-[13px]">
          <thead>
            <tr className="bg-slate-50 text-left text-[11px] font-bold uppercase tracking-[0.07em] text-slate-500">
              <th className="border-b border-slate-200 px-3 py-2">Reason</th>
              <th className="border-b border-slate-200 px-3 py-2 text-right">Count</th>
              <th className="border-b border-slate-200 px-3 py-2">Rule</th>
              <th className="border-b border-slate-200 px-3 py-2 text-right">Deduction</th>
            </tr>
          </thead>
          <tbody>
            {lines.map((line) => {
              // A named deduction has no count of days; it is muted only when it costs nothing.
              const muted = line.custom ? !line.amount : !line.count;
              const dates = Array.isArray(line.dates) ? line.dates : [];
              return (
                <tr key={line.key} className={muted ? "text-slate-400" : "text-slate-700"}>
                  <td className="border-b border-slate-100 px-3 py-2 align-top">
                    <span className="flex items-center gap-2 font-semibold">
                      <span aria-hidden="true" className={`h-2 w-2 shrink-0 rounded-full ${muted ? "bg-slate-300" : line.custom ? "bg-fuchsia-500" : LINE_TONES[line.key] || "bg-slate-400"}`} />
                      {line.label}
                      {line.custom ? (
                        <span className="rounded-full border border-slate-200 bg-white px-1.5 py-px text-[10.5px] font-medium text-slate-500">
                          {line.scope === "EMPLOYEE" ? "Personal" : "Everybody"}
                        </span>
                      ) : null}
                    </span>
                    {dates.length && line.key !== "beforeJoining" ? (
                      <span className="mt-1 block pl-4 text-[11.5px] font-normal text-slate-500">
                        {dates.slice(0, MAX_DATES_SHOWN).map(formatShortDate).join(", ")}
                        {dates.length > MAX_DATES_SHOWN ? ` +${dates.length - MAX_DATES_SHOWN} more` : ""}
                      </span>
                    ) : null}
                    {line.key === "late" && line.count > line.chargeableCount ? (
                      <span className="mt-0.5 block pl-4 text-[11.5px] font-normal text-slate-500">
                        {line.count - line.chargeableCount} free this month
                      </span>
                    ) : null}
                  </td>
                  <td className="border-b border-slate-100 px-3 py-2 text-right align-top font-mono tabular-nums">{line.custom ? "–" : line.count}</td>
                  <td className="border-b border-slate-100 px-3 py-2 align-top text-[12.5px]">{line.rule}</td>
                  <td className={`border-b border-slate-100 px-3 py-2 text-right align-top font-mono font-semibold tabular-nums ${line.amount > 0 ? "text-rose-700" : ""}`}>
                    {line.amount > 0 ? `− ${formatRupees(line.amount)}` : formatRupees(0)}
                  </td>
                </tr>
              );
            })}
          </tbody>
          <tfoot>
            <tr className="bg-slate-50 font-semibold text-slate-800">
              <td className="px-3 py-2" colSpan={3}>Total deducted</td>
              <td className={`px-3 py-2 text-right font-mono tabular-nums ${salary.totalDeduction > 0 ? "text-rose-700" : ""}`}>
                {salary.totalDeduction > 0 ? `− ${formatRupees(salary.totalDeduction)}` : formatRupees(0)}
              </td>
            </tr>
          </tfoot>
        </table>
      </div>

      {!anyDeduction && !salary.isFutureMonth ? (
        <p className="text-[12.5px] text-emerald-700">Nothing has been deducted this month so far.</p>
      ) : null}
    </div>
  );
}
