import React from "react";
import { CheckSquare, Target, UserCheck } from "lucide-react";
import { IconBox } from "../salary/salaryUi";
import { describePart, gradeStyle, PART_LABELS } from "./performanceFormat";

const PART_ICONS = { attendance: UserCheck, tasks: CheckSquare, sales: Target };
const PART_TONES = { attendance: "green", tasks: "violet", sales: "blue" };

const NOT_APPLICABLE = {
  attendance: "No working day has passed yet this month.",
  tasks: "No task was due this month, so tasks do not count.",
  sales: "No leads or targets this month, so sales do not count.",
};

export const ScoreBar = ({ score, grade }) => (
  <span className="block h-1.5 w-full overflow-hidden rounded-full bg-slate-100">
    <span className={`block h-full rounded-full ${gradeStyle(grade).bar}`} style={{ width: `${score ?? 0}%` }} />
  </span>
);

export const GradeChip = ({ grade }) => (
  <span className={`inline-flex rounded-full border px-2 py-0.5 text-[11px] font-semibold ${gradeStyle(grade).chip}`}>
    {grade?.label || "Not scored"}
  </span>
);

/*
 * One person's month: the overall score, then each part with its score, the
 * share of the total it carried, and the figures behind it.
 */
export default function PerformanceBreakdown({ performance }) {
  if (!performance) return null;
  const { score, grade, parts } = performance;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-4 rounded-xl border border-slate-200 bg-slate-50/60 p-4">
        <div>
          <p className="text-[12px] font-medium text-slate-500">Overall score</p>
          <p className={`font-mono text-[34px] font-bold leading-none tabular-nums ${gradeStyle(grade).ink}`}>
            {score ?? "–"}
            {score !== null ? <span className="text-[16px] text-slate-400">/100</span> : null}
          </p>
        </div>
        <div className="min-w-[160px] flex-1 space-y-2">
          <GradeChip grade={grade} />
          <ScoreBar score={score} grade={grade} />
          {score === null ? (
            <p className="text-[12px] text-slate-500">Nothing to score yet this month - no working days, tasks or leads.</p>
          ) : null}
        </div>
      </div>

      <div className="grid gap-3 lg:grid-cols-3">
        {Object.keys(PART_LABELS).map((key) => {
          const part = parts?.[key];
          return (
            <section key={key} className="rounded-xl border border-slate-200 bg-white p-4">
              <div className="flex items-center gap-3">
                <IconBox icon={PART_ICONS[key]} tone={part ? PART_TONES[key] : "slate"} boxSize="h-8 w-8" iconSize={15} />
                <div className="min-w-0 flex-1">
                  <p className="text-[13px] font-semibold text-slate-900">{PART_LABELS[key]}</p>
                  <p className="text-[11.5px] text-slate-500">
                    {part ? `${part.effectiveWeight}% of the overall score` : "Not counted this month"}
                  </p>
                </div>
                <span className={`font-mono text-[20px] font-bold tabular-nums ${part ? gradeStyle(part.grade).ink : "text-slate-300"}`}>
                  {part ? part.score : "–"}
                </span>
              </div>
              {part ? (
                <>
                  <div className="mt-3"><ScoreBar score={part.score} grade={part.grade} /></div>
                  <dl className="mt-3 space-y-1.5 text-[12.5px]">
                    {describePart(key, part).map(([label, value]) => (
                      <div key={label} className="flex justify-between gap-3">
                        <dt className="text-slate-500">{label}</dt>
                        <dd className="text-right font-medium text-slate-800">{value}</dd>
                      </div>
                    ))}
                  </dl>
                </>
              ) : (
                <p className="mt-3 text-[12.5px] text-slate-500">{NOT_APPLICABLE[key]}</p>
              )}
            </section>
          );
        })}
      </div>
    </div>
  );
}
