import React from "react";
import { Plus, Trash2 } from "lucide-react";
import { fieldClass, secondaryButtonClass } from "../salary/salaryUi";
import { ISSUE_CATEGORY_OPTIONS } from "./dailyReportFormValue";

/*
 * The fields of one daily report form. Used for filing today's report and
 * for a manager's correction, so both look and validate the same.
 *
 * value = { counts: {key: string}, notes: {key: string}, issues: [] }
 */

const STATUSES = ["PENDING", "RESOLVED", "ESCALATED"];
const PRIORITIES = ["LOW", "MEDIUM", "HIGH"];
const titleCase = (s) => s.charAt(0) + s.slice(1).toLowerCase();

const newIssue = () => ({ category: "MAINTENANCE", description: "", location: "", actionTaken: "", status: "PENDING", priority: "MEDIUM" });

const DailyReportForm = ({ form, value, onChange, errorField, disabled = false }) => {
  if (!form) return null;
  const counts = form.fields.filter((f) => f.kind === "count");
  const texts = form.fields.filter((f) => f.kind === "text");
  const setCount = (key, v) => onChange({ ...value, counts: { ...value.counts, [key]: v.replace(/[^\d]/g, "") } });
  const setNote = (key, v) => onChange({ ...value, notes: { ...value.notes, [key]: v } });
  const setIssue = (index, patch) => onChange({ ...value, issues: value.issues.map((i, n) => (n === index ? { ...i, ...patch } : i)) });

  return (
    <div className="space-y-5">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {counts.map((f) => (
          <label key={f.key} className="block">
            <span className="text-[13px] font-semibold text-slate-800">{f.label}</span>
            <input
              type="text"
              inputMode="numeric"
              value={value.counts[f.key] ?? ""}
              onChange={(e) => setCount(f.key, e.target.value)}
              placeholder="0"
              disabled={disabled}
              aria-invalid={errorField === f.key || undefined}
              className={`${fieldClass} mt-1 w-full font-mono text-[15px] ${errorField === f.key ? "border-rose-400 ring-2 ring-rose-100" : ""}`}
            />
            {f.help ? <span className="mt-1 block text-[12px] leading-snug text-slate-500">{f.help}</span> : null}
          </label>
        ))}
      </div>

      {texts.map((f) => (
        <label key={f.key} className="block">
          <span className="text-[13px] font-semibold text-slate-800">{f.label} <span className="font-normal text-slate-400">(optional)</span></span>
          <textarea
            value={value.notes[f.key] ?? ""}
            onChange={(e) => setNote(f.key, e.target.value)}
            rows={2}
            maxLength={1000}
            disabled={disabled}
            placeholder={f.help}
            className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-[13px] text-slate-700 outline-none transition focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
          />
        </label>
      ))}

      {form.hasIssues ? (
        <div className={`rounded-xl border p-4 ${errorField === "issues" ? "border-rose-300" : "border-slate-200"}`}>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <p className="text-[13px] font-semibold text-slate-800">Issues handled today</p>
              <p className="text-[12px] text-slate-500">Wi-Fi, AC, electricity, plumbing, cleaning complaints, pantry, member requests…</p>
            </div>
            <button type="button" className={secondaryButtonClass} onClick={() => onChange({ ...value, issues: [...value.issues, newIssue()] })} disabled={disabled}>
              <Plus size={14} /> Add issue
            </button>
          </div>
          {value.issues.length === 0 ? <p className="mt-3 text-[12.5px] text-slate-500">No issues added. That's fine if there were none.</p> : null}
          <div className="mt-3 space-y-3">
            {value.issues.map((issue, index) => (
              <div key={index} className="grid gap-2 rounded-lg bg-slate-50 p-3 md:grid-cols-6">
                <select className={`${fieldClass} md:col-span-2`} value={issue.category} onChange={(e) => setIssue(index, { category: e.target.value })} aria-label="Category" disabled={disabled}>
                  {ISSUE_CATEGORY_OPTIONS.map((c) => <option key={c.key} value={c.key}>{c.label}</option>)}
                </select>
                <input className={`${fieldClass} md:col-span-3`} value={issue.description} onChange={(e) => setIssue(index, { description: e.target.value })} placeholder="What happened" aria-label="Description" disabled={disabled} />
                <button type="button" onClick={() => onChange({ ...value, issues: value.issues.filter((_, n) => n !== index) })} className="inline-flex h-9 items-center justify-center rounded-lg text-slate-400 hover:bg-rose-50 hover:text-rose-600" aria-label="Remove issue" disabled={disabled}>
                  <Trash2 size={15} />
                </button>
                <input className={`${fieldClass} md:col-span-2`} value={issue.location} onChange={(e) => setIssue(index, { location: e.target.value })} placeholder="Location (e.g. Cabin 12)" aria-label="Location" disabled={disabled} />
                <input className={`${fieldClass} md:col-span-2`} value={issue.actionTaken} onChange={(e) => setIssue(index, { actionTaken: e.target.value })} placeholder="Action taken" aria-label="Action taken" disabled={disabled} />
                <select className={fieldClass} value={issue.status} onChange={(e) => setIssue(index, { status: e.target.value })} aria-label="Status" disabled={disabled}>
                  {STATUSES.map((s) => <option key={s} value={s}>{titleCase(s)}</option>)}
                </select>
                <select className={fieldClass} value={issue.priority} onChange={(e) => setIssue(index, { priority: e.target.value })} aria-label="Priority" disabled={disabled}>
                  {PRIORITIES.map((s) => <option key={s} value={s}>{titleCase(s)} priority</option>)}
                </select>
              </div>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
};

export default DailyReportForm;
