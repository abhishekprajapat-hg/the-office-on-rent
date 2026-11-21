import React, { useCallback, useEffect, useMemo, useState } from "react";
import { AlertTriangle, BadgeCheck, CalendarCheck, Gauge, Loader2, Plus, RotateCcw, Send, SlidersHorizontal, Trash2, Wallet, X } from "lucide-react";
import {
  finalisePayrollRun,
  getKpiIncentive,
  listPayrollRuns,
  previewPayrollRun,
  reopenPayrollRun,
  resendPayrollRun,
  setKpiIncentive,
} from "../../services/salaryService";
import { toErrorMessage } from "../../utils/errorMessage";
import { cardClass, fieldClass, primaryButtonClass, secondaryButtonClass, SectionHeader, StatCard } from "./salaryUi";
import { formatMonthLabel, formatRupees } from "./salaryFormat";

/*
 * Payroll (admin): finalise a finished month. The sheet starts from the Salary page's
 * figures - attendance, late marks, leave, named deductions - and the KPI incentive; the
 * admin can type over each person's salary, KPI score and incentive for the month, and
 * enter PF / ESI / professional tax / TDS (optional: blank = none) and other additions or
 * deductions. Frozen as a version and sent to BillStack's books.
 */

const previousMonthKey = (now = new Date()) => {
  const d = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
};

const th = "border-b border-slate-200 px-3 py-2.5";
const td = "border-b border-slate-100 px-3 py-2.5";
const num = "whitespace-nowrap text-right font-mono tabular-nums";
const dash = <span className="text-slate-300">–</span>;
const show = (value) => (value ? value : dash);
const money = (value) => (Number(value) ? formatRupees(value) : dash);

const BILLSTACK_TEXT = {
  SENT: { label: "In BillStack", tone: "text-emerald-700 bg-emerald-50" },
  FAILED: { label: "Not sent", tone: "text-rose-700 bg-rose-50" },
  NOT_SENT: { label: "Not sent", tone: "text-amber-700 bg-amber-50" },
  OFF: { label: "BillStack off", tone: "text-slate-600 bg-slate-100" },
};

/* ------------------------------------------------------- admin's edits -- */

const STATUTORY = [
  { field: "pf", label: "PF" },
  { field: "esi", label: "ESI" },
  { field: "pt", label: "Professional tax" },
  { field: "tds", label: "TDS on salary" },
];
const hasValue = (value) => value !== undefined && value !== null && String(value).trim() !== "";

// What is sent: only the fields that are filled in.
const toPayload = (edits) => {
  const out = {};
  Object.entries(edits).forEach(([userId, edit]) => {
    const clean = {};
    ["monthlySalary", "kpiScore", "incentive", ...STATUTORY.map((s) => s.field)].forEach((field) => {
      if (hasValue(edit[field])) clean[field] = String(edit[field]).trim();
    });
    if (edit.items?.length) clean.items = edit.items;
    if (Object.keys(clean).length) out[userId] = clean;
  });
  return out;
};
const fromSaved = (saved = {}) => {
  const out = {};
  Object.entries(saved || {}).forEach(([userId, edit]) => {
    const next = {};
    Object.entries(edit || {}).forEach(([field, value]) => { next[field] = field === "items" ? value : String(value); });
    out[userId] = next;
  });
  return out;
};

// A figure the admin can type over; the CRM's own figure shows greyed until then.
const EditCell = ({ value, placeholder, onCommit, disabled, label, title }) => {
  const [text, setText] = useState(value ?? "");
  const [shown, setShown] = useState(value);
  if (shown !== value) { setShown(value); setText(value ?? ""); }
  const set = hasValue(value);
  const commit = () => { if (String(text).trim() !== String(value ?? "").trim()) onCommit(String(text).trim()); };
  return (
    <span className="inline-flex items-center gap-1">
      <input
        value={text}
        onChange={(e) => setText(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => { if (e.key === "Enter") e.currentTarget.blur(); if (e.key === "Escape") { setText(value ?? ""); } }}
        inputMode="decimal"
        placeholder={placeholder}
        disabled={disabled}
        aria-label={label}
        title={title}
        className={`${fieldClass} h-8 w-24 px-2 text-right font-mono tabular-nums placeholder:font-normal placeholder:text-slate-400 disabled:bg-slate-50 ${set ? "border-blue-400 bg-blue-50 text-blue-800" : ""}`}
      />
      {set && !disabled ? (
        <button type="button" onClick={() => onCommit("")} className="text-slate-400 hover:text-rose-600" aria-label={`Clear ${label}`} title="Back to the CRM's figure"><X size={13} /></button>
      ) : null}
    </span>
  );
};

const MoreEditor = ({ row, edit, onApply, onClose }) => {
  const [stat, setStat] = useState(() => Object.fromEntries(STATUTORY.map((s) => [s.field, edit[s.field] ?? ""])));
  const [draft, setDraft] = useState(edit.items?.length ? edit.items : []);
  const set = (index, patch) => setDraft((list) => list.map((item, i) => (i === index ? { ...item, ...patch } : item)));
  const apply = () => onApply({
    ...stat,
    items: draft.filter((item) => item.label.trim() || Number(item.amount)).map((item) => ({ ...item, label: item.label.trim(), amount: Number(item.amount) })),
  });
  return (
    <div className="space-y-3 rounded-lg border border-blue-200 bg-blue-50/40 p-3">
      <div>
        <p className="text-[13px] font-semibold text-slate-700">Deductions for {row.name} this month</p>
        <p className="text-[12px] text-slate-500">Optional - leave blank if not applicable. Taken off the pay only when entered.</p>
      </div>
      <div className="flex flex-wrap gap-3">
        {STATUTORY.map((s) => (
          <label key={s.field} className="flex flex-col gap-1 text-[12px] font-semibold text-slate-600">
            {s.label}
            <input value={stat[s.field]} onChange={(e) => setStat((v) => ({ ...v, [s.field]: e.target.value }))} inputMode="decimal" placeholder="None" aria-label={`${s.label} for ${row.name}`} className={`${fieldClass} w-32 text-right font-mono placeholder:font-normal placeholder:text-slate-400`} />
          </label>
        ))}
      </div>
      <div className="space-y-2">
        <p className="text-[12px] font-semibold text-slate-600">Other additions or deductions</p>
        {draft.map((item, index) => (
          <div key={index} className="flex flex-wrap items-center gap-2">
            <select value={item.kind} onChange={(e) => set(index, { kind: e.target.value })} className={`${fieldClass} w-36`} aria-label="Addition or deduction">
              <option value="ADDITION">Add to pay</option>
              <option value="DEDUCTION">Take off pay</option>
            </select>
            <input value={item.label} onChange={(e) => set(index, { label: e.target.value })} placeholder="Bonus, arrears, fine…" maxLength={60} className={`${fieldClass} w-56 font-normal`} aria-label="What it is" />
            <input value={item.amount} onChange={(e) => set(index, { amount: e.target.value })} inputMode="decimal" placeholder="Amount" className={`${fieldClass} w-28 text-right font-mono`} aria-label="Amount" />
            <button type="button" onClick={() => setDraft((list) => list.filter((_, i) => i !== index))} className="text-slate-400 hover:text-rose-600" aria-label="Remove"><Trash2 size={15} /></button>
          </div>
        ))}
        <button type="button" className={secondaryButtonClass} onClick={() => setDraft((list) => [...list, { kind: "ADDITION", label: "", amount: "" }])} disabled={draft.length >= 10}><Plus size={14} /> Add a line</button>
      </div>
      <div className="flex flex-wrap gap-2 border-t border-blue-100 pt-3">
        <button type="button" className={primaryButtonClass} onClick={apply}>Apply</button>
        <button type="button" className={secondaryButtonClass} onClick={onClose}><X size={14} /> Close</button>
      </div>
    </div>
  );
};

/* -------------------------------------------------------- kpi settings -- */

const KpiIncentiveCard = ({ onSaved, onError }) => {
  const [form, setForm] = useState(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    getKpiIncentive().then((data) => setForm(data.kpiIncentive)).catch((error) => onError(toErrorMessage(error, "Failed to load the KPI incentive")));
  }, [onError]);

  if (!form) return null;
  const setBand = (index, patch) => setForm((f) => ({ ...f, bands: f.bands.map((b, i) => (i === index ? { ...b, ...patch } : b)) }));
  const save = async () => {
    setSaving(true);
    try {
      const data = await setKpiIncentive({ ...form, bands: form.bands.map((b) => ({ minScore: Number(b.minScore), value: Number(b.value) })) });
      setForm(data.kpiIncentive);
      onSaved("KPI incentive saved");
    } catch (error) {
      onError(toErrorMessage(error, "Failed to save the KPI incentive"));
    } finally {
      setSaving(false);
    }
  };

  return (
    <section className={cardClass}>
      <SectionHeader icon={Gauge} tone="violet" title="KPI incentive" subtitle="Added to pay when a month is finalised, from the Performance page's score" />
      <div className="space-y-3 px-5 py-4 text-[13px] text-slate-700">
        <label className="flex items-center gap-2 font-semibold">
          <input type="checkbox" checked={form.enabled} onChange={(e) => setForm((f) => ({ ...f, enabled: e.target.checked }))} />
          Pay a KPI incentive
        </label>
        <div className="flex flex-wrap items-center gap-2">
          <span>Based on</span>
          <select value={form.scoreOn} onChange={(e) => setForm((f) => ({ ...f, scoreOn: e.target.value }))} className={`${fieldClass} w-64`}>
            <option value="TARGET">the target score (leads, visits, deals…)</option>
            <option value="OVERALL">the overall KPI score</option>
          </select>
          <span>paid as</span>
          <select value={form.unit} onChange={(e) => setForm((f) => ({ ...f, unit: e.target.value }))} className={`${fieldClass} w-48`}>
            <option value="PERCENT">% of monthly salary</option>
            <option value="AMOUNT">a fixed amount (₹)</option>
          </select>
        </div>
        {form.scoreOn === "OVERALL" ? (
          <p className="flex items-start gap-1.5 text-[12.5px] text-amber-700"><AlertTriangle size={14} className="mt-0.5 shrink-0" /> The overall score includes attendance and punctuality, which already cut the salary - late marks would count twice.</p>
        ) : null}
        <div className="space-y-1.5">
          {form.bands.map((band, index) => (
            <div key={index} className="flex flex-wrap items-center gap-2">
              <span>Score</span>
              <input value={band.minScore} onChange={(e) => setBand(index, { minScore: e.target.value })} inputMode="decimal" className={`${fieldClass} w-20 text-right font-mono`} aria-label="From score" />
              <span>and above:</span>
              <input value={band.value} onChange={(e) => setBand(index, { value: e.target.value })} inputMode="decimal" className={`${fieldClass} w-24 text-right font-mono`} aria-label="Incentive" />
              <span>{form.unit === "PERCENT" ? "% of salary" : "₹"}</span>
              <button type="button" onClick={() => setForm((f) => ({ ...f, bands: f.bands.filter((_, i) => i !== index) }))} className="text-slate-400 hover:text-rose-600" aria-label="Remove band"><Trash2 size={15} /></button>
            </div>
          ))}
          <button type="button" className={secondaryButtonClass} onClick={() => setForm((f) => ({ ...f, bands: [...f.bands, { minScore: "", value: "" }] }))} disabled={form.bands.length >= 10}><Plus size={14} /> Add a band</button>
        </div>
        <p className="text-[12.5px] text-slate-500">The highest band reached is paid. Nobody gets an incentive without a score (or, on the target score, without a target set for the month).</p>
        <button type="button" className={primaryButtonClass} onClick={save} disabled={saving}>{saving ? <Loader2 size={14} className="animate-spin" /> : null} Save</button>
      </div>
    </section>
  );
};

/* ---------------------------------------------------------------- page -- */

export default function PayrollRunPanel({ onError, onSuccess }) {
  const [month, setMonth] = useState(previousMonthKey());
  const [sheet, setSheet] = useState(null);
  const [edits, setEdits] = useState({});
  const [editing, setEditing] = useState("");
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState("");
  const [runs, setRuns] = useState({ runs: [], billstackEnabled: false });

  const loadRuns = useCallback(async () => {
    try {
      setRuns(await listPayrollRuns());
    } catch (error) {
      onError(toErrorMessage(error, "Failed to load finalised months"));
    }
  }, [onError]);

  const loadSheet = useCallback(async (nextEdits) => {
    setLoading(true);
    try {
      const data = await previewPayrollRun({ month, edits: toPayload(nextEdits) });
      setSheet(data);
      return data;
    } catch (error) {
      onError(toErrorMessage(error, "Failed to work out the month"));
      return null;
    } finally {
      setLoading(false);
    }
  }, [month, onError]);

  // A month opens with what the admin set on its last version (a reopened month starts
  // from the same changes; a finalised one shows them).
  const openMonth = useCallback(async () => {
    setEditing("");
    setEdits({});
    const data = await loadSheet({});
    const saved = fromSaved(data?.lastEdits);
    if (Object.keys(saved).length) {
      setEdits(saved);
      await loadSheet(saved);
    }
  }, [loadSheet]);

  useEffect(() => { loadRuns(); }, [loadRuns]);
  useEffect(() => { openMonth(); }, [openMonth]);

  // One change at a time; if the server refuses it the sheet goes back to how it was.
  const changeEdit = async (userId, patch) => {
    const before = edits;
    const merged = { ...(edits[userId] || {}), ...patch };
    const next = { ...edits, [userId]: merged };
    if (!Object.values(merged).some((v) => (Array.isArray(v) ? v.length : hasValue(v)))) delete next[userId];
    setEdits(next);
    if (!(await loadSheet(next))) setEdits(before);
  };

  const finalise = async () => {
    if (!window.confirm(`Finalise ${formatMonthLabel(month)} for ${sheet.totals.employees} people, net ${formatRupees(sheet.totals.net)}? It is frozen and sent to BillStack.`)) return;
    setBusy("finalise");
    try {
      const { run } = await finalisePayrollRun({ month, edits: toPayload(edits) });
      onSuccess(run.billstack?.status === "SENT" ? `${formatMonthLabel(month)} finalised and sent to BillStack` : `${formatMonthLabel(month)} finalised${run.billstack?.lastError ? ` - not sent: ${run.billstack.lastError}` : ""}`);
      await Promise.all([loadRuns(), openMonth()]);
    } catch (error) {
      onError(toErrorMessage(error, "Failed to finalise the month"));
    } finally {
      setBusy("");
    }
  };

  const resend = async (run) => {
    setBusy(run._id);
    try {
      const { run: after } = await resendPayrollRun(run._id);
      if (after.billstack?.status === "SENT") onSuccess("Sent to BillStack"); else onError(after.billstack?.lastError || "Not sent");
      await loadRuns();
    } catch (error) {
      onError(toErrorMessage(error, "Failed to send"));
    } finally {
      setBusy("");
    }
  };

  const reopen = async (run) => {
    const reason = window.prompt(`Reopen ${run.monthLabel} v${run.version}? Say what needs correcting:`);
    if (!reason) return;
    setBusy(run._id);
    try {
      await reopenPayrollRun(run._id, reason);
      onSuccess(`${run.monthLabel} reopened - correct it and finalise again (v${run.version + 1})`);
      await Promise.all([loadRuns(), openMonth()]);
    } catch (error) {
      onError(toErrorMessage(error, "Failed to reopen"));
    } finally {
      setBusy("");
    }
  };

  const rows = useMemo(() => sheet?.rows || [], [sheet]);
  const totals = sheet?.totals || {};
  const warnings = useMemo(() => rows.flatMap((row) => (row.warnings || []).map((w) => `${row.name}: ${w}`)), [rows]);
  const canFinalise = sheet && sheet.monthComplete && !sheet.finalised && rows.length && !busy;

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard icon={CalendarCheck} tone="blue" label="People paid" value={String(totals.employees || 0)} hint={sheet?.withoutSalary?.length ? `${sheet.withoutSalary.length} without a salary set` : formatMonthLabel(month)} />
        <StatCard icon={Wallet} tone="blue" label="Gross" value={formatRupees(totals.gross)} hint={`after ${formatRupees(totals.attendanceDeduction)} attendance cuts`} />
        <StatCard icon={Gauge} tone="violet" label="Incentives and additions" value={formatRupees(totals.additions)} hint={sheet?.kpiIncentive?.enabled ? "KPI incentive is on" : "KPI incentive is off"} />
        <StatCard icon={BadgeCheck} tone="green" label="Net pay" value={formatRupees(totals.net)} hint={`after ${formatRupees(totals.deductions)} deductions`} />
      </div>

      <section className={cardClass}>
        <SectionHeader icon={CalendarCheck} tone="blue" title="Finalise a month" subtitle="Filled in from the Salary and Performance pages - type over a salary, KPI score or incentive to change it for this month">
          <input type="month" value={month} onChange={(e) => e.target.value && setMonth(e.target.value)} className={`${fieldClass} ml-auto`} aria-label="Month" />
        </SectionHeader>

        {sheet?.finalised ? (
          <p className="mx-5 mt-3 rounded-lg bg-emerald-50 px-3 py-2 text-[13px] text-emerald-800">
            {formatMonthLabel(month)} is finalised (v{sheet.finalised.version}{sheet.finalised.finalisedByName ? `, by ${sheet.finalised.finalisedByName}` : ""}). To change it, reopen it below. The figures here are today's, for comparison.
          </p>
        ) : sheet && !sheet.monthComplete ? (
          <p className="mx-5 mt-3 rounded-lg bg-amber-50 px-3 py-2 text-[13px] text-amber-800">{formatMonthLabel(month)} is not over yet; it can be finalised after its last day.</p>
        ) : null}
        {warnings.length ? (
          <ul className="mx-5 mt-3 space-y-1 rounded-lg bg-amber-50 px-3 py-2 text-[13px] text-amber-800">
            {warnings.map((w) => <li key={w} className="flex items-start gap-1.5"><AlertTriangle size={14} className="mt-0.5 shrink-0" /> {w}</li>)}
          </ul>
        ) : null}

        <div className="overflow-x-auto px-1 py-2">
          <table className="min-w-full border-separate border-spacing-0 text-[13.5px]">
            <thead>
              <tr className="bg-slate-50 text-left text-[11px] font-bold uppercase tracking-[0.06em] text-slate-500">
                <th className={th}>Employee</th>
                <th className={`${th} text-right`} title="This month's salary. Blank = the salary set on the Salary page">Salary</th>
                <th className={`${th} text-right`} title="Absent / half days / unpaid, unapproved or extra leave">Absent · ½ · leave</th>
                <th className={`${th} text-right`} title="Late marks (charged after the grace)">Late</th>
                <th className={`${th} text-right`}>Attendance cut</th>
                <th className={`${th} text-right`} title="KPI score for the month. Blank = the Performance page's score">KPI score</th>
                <th className={`${th} text-right`} title="Incentive for the month. Blank = what the KPI incentive rule gives">Incentive</th>
                <th className={`${th} text-right`} title="Bonus, arrears and other additions">Other additions</th>
                <th className={`${th} text-right`} title="PF / ESI / professional tax / TDS if entered, named deductions and others">Deductions</th>
                <th className={`${th} text-right`}>Net pay</th>
                <th className={th}><span className="sr-only">More</span></th>
              </tr>
            </thead>
            <tbody>
              {loading && !sheet ? (
                <tr><td colSpan={11} className="px-3 py-10 text-center text-slate-500"><Loader2 size={15} className="mr-2 inline animate-spin" /> Working out the month…</td></tr>
              ) : !rows.length ? (
                <tr><td colSpan={11} className="px-3 py-10 text-center text-slate-500">Nobody has a salary set for this month{sheet?.withoutSalary?.length ? " - enter one below" : ""}.</td></tr>
              ) : rows.map((row) => {
                const a = row.attendance || {};
                const leave = Number(a.unpaidLeave || 0) + Number(a.unapprovedLeave || 0) + Number(a.leaveBeyondEntitlement || 0);
                const incentiveLines = (row.additions || []).filter((x) => x.key === "kpi" || x.key === "incentive");
                const otherAdditions = (row.additions || []).filter((x) => x.key !== "kpi" && x.key !== "incentive").reduce((s, x) => s + x.amount, 0);
                const own = edits[row.userId] || {};
                const computed = row.computed || {};
                const moreCount = STATUTORY.filter((s) => hasValue(own[s.field])).length + (own.items?.length || 0);
                const locked = Boolean(sheet?.finalised);
                return (
                  <React.Fragment key={row.userId}>
                    <tr className="hover:bg-slate-50/70">
                      <td className={td}>
                        <p className="font-semibold text-slate-800">{row.name}</p>
                        <p className="text-[12px] text-slate-500">{[row.department, row.email].filter(Boolean).join(" · ")}</p>
                      </td>
                      <td className={`${td} text-right`}>
                        <EditCell
                          value={own.monthlySalary}
                          placeholder={computed.monthlySalary ? formatRupees(computed.monthlySalary) : "Salary"}
                          onCommit={(value) => changeEdit(row.userId, { monthlySalary: value })}
                          disabled={locked}
                          label={`Salary for ${row.name}`}
                          title={hasValue(own.monthlySalary) && computed.monthlySalary ? `Salary page: ${formatRupees(computed.monthlySalary)}` : "From the Salary page; type to change for this month"}
                        />
                      </td>
                      <td className={`${td} ${num}`}>{show(a.absent)} · {show(a.halfDay)} · {show(leave)}</td>
                      <td className={`${td} ${num}`}>{a.late ? `${a.late}${a.lateCharged !== a.late ? ` (${a.lateCharged})` : ""}` : dash}</td>
                      <td className={`${td} ${num} text-rose-700`} title={(row.attendanceLines || []).map((x) => `${x.label}: ${x.amount}`).join("\n")}>{money(row.attendanceDeduction)}</td>
                      <td className={`${td} text-right`}>
                        <EditCell
                          value={own.kpiScore}
                          placeholder={computed.kpiScore ?? "–"}
                          onCommit={(value) => changeEdit(row.userId, { kpiScore: value })}
                          disabled={locked}
                          label={`KPI score for ${row.name}`}
                          title={`${row.kpi?.grade ? `${row.kpi.grade}. ` : ""}Performance page: ${computed.kpiScore ?? "no score"}${row.kpi?.targetScore != null ? `, target score ${row.kpi.targetScore}` : ""}`}
                        />
                      </td>
                      <td className={`${td} text-right`}>
                        <EditCell
                          value={own.incentive}
                          placeholder={computed.incentive != null ? formatRupees(computed.incentive) : "None"}
                          onCommit={(value) => changeEdit(row.userId, { incentive: value })}
                          disabled={locked}
                          label={`Incentive for ${row.name}`}
                          title={incentiveLines.length ? incentiveLines.map((x) => `${x.label}: ${x.rule}`).join("\n") : sheet?.kpiIncentive?.enabled ? "The KPI rule gives nothing this month; type an amount to pay one" : "KPI incentive rule is off; type an amount to pay one"}
                        />
                      </td>
                      <td className={`${td} ${num} text-emerald-700`}>{money(otherAdditions)}</td>
                      <td className={`${td} ${num} text-rose-700`} title={(row.deductions || []).map((x) => `${x.label}: ${x.amount}`).join("\n")}>{money(row.totalDeduction)}</td>
                      <td className={`${td} ${num} font-bold`}>{formatRupees(row.net)}</td>
                      <td className={td}>
                        <button type="button" className={`${secondaryButtonClass} whitespace-nowrap`} onClick={() => setEditing(editing === row.userId ? "" : row.userId)} disabled={locked} title="PF, ESI, professional tax, TDS and other additions or deductions">
                          <SlidersHorizontal size={14} /> {moreCount ? `Deductions & more (${moreCount})` : "Deductions & more"}
                        </button>
                      </td>
                    </tr>
                    {editing === row.userId ? (
                      <tr><td colSpan={11} className="px-3 py-2"><MoreEditor row={row} edit={own} onApply={(patch) => { setEditing(""); changeEdit(row.userId, patch); }} onClose={() => setEditing("")} /></td></tr>
                    ) : null}
                  </React.Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
        {sheet?.withoutSalary?.length ? (
          <div className="mx-5 mb-3 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2.5">
            <p className="text-[12.5px] font-semibold text-slate-600">No salary set on the Salary page - enter one to pay them this month:</p>
            <div className="mt-2 flex flex-wrap gap-x-5 gap-y-2">
              {sheet.withoutSalary.map((person) => (
                <span key={person.userId} className="inline-flex items-center gap-2 text-[13px] text-slate-700">
                  {person.name}
                  <EditCell value={edits[person.userId]?.monthlySalary} placeholder="Salary" onCommit={(value) => changeEdit(person.userId, { monthlySalary: value })} disabled={Boolean(sheet?.finalised)} label={`Salary for ${person.name}`} />
                </span>
              ))}
            </div>
          </div>
        ) : null}
        <div className="flex flex-wrap items-center gap-3 border-t border-slate-100 px-5 py-3">
          <button type="button" className={primaryButtonClass} onClick={finalise} disabled={!canFinalise}>
            {busy === "finalise" ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
            Finalise {formatMonthLabel(month)}{runs.billstackEnabled ? " and send to BillStack" : ""}
          </button>
          {!runs.billstackEnabled ? <span className="text-[12.5px] text-slate-500">BillStack is not connected: the month is finalised here only.</span> : null}
        </div>
      </section>

      <section className={cardClass}>
        <SectionHeader icon={BadgeCheck} tone="green" title="Finalised months" subtitle="Each correction is a new version; BillStack takes it while nothing of the month is paid there" />
        <div className="overflow-x-auto px-1 py-2">
          <table className="min-w-full border-separate border-spacing-0 text-[13.5px]">
            <thead>
              <tr className="bg-slate-50 text-left text-[11px] font-bold uppercase tracking-[0.06em] text-slate-500">
                <th className={th}>Month</th>
                <th className={th}>Status</th>
                <th className={`${th} text-right`}>People</th>
                <th className={`${th} text-right`}>Net pay</th>
                <th className={th}>BillStack</th>
                <th className={th}><span className="sr-only">Actions</span></th>
              </tr>
            </thead>
            <tbody>
              {!runs.runs.length ? (
                <tr><td colSpan={6} className="px-3 py-8 text-center text-slate-500">No month has been finalised yet.</td></tr>
              ) : runs.runs.map((run) => {
                const bs = BILLSTACK_TEXT[run.billstack?.status] || BILLSTACK_TEXT.NOT_SENT;
                return (
                  <tr key={run._id}>
                    <td className={td}><p className="font-semibold">{run.monthLabel} <span className="text-slate-500">v{run.version}</span></p><p className="text-[12px] text-slate-500">{run.finalisedByName} · {run.finalisedAt ? new Date(run.finalisedAt).toLocaleString("en-IN") : ""}</p></td>
                    <td className={td}>{run.status === "FINALISED" ? "Finalised" : <span title={run.reopenReason}>Reopened{run.reopenedByName ? ` by ${run.reopenedByName}` : ""}</span>}</td>
                    <td className={`${td} ${num}`}>{run.totals?.employees}</td>
                    <td className={`${td} ${num}`}>{formatRupees(run.totals?.net)}</td>
                    <td className={td}>
                      <span className={`rounded-md px-2 py-0.5 text-[12px] font-semibold ${bs.tone}`}>{bs.label}</span>
                      {run.billstack?.lastError ? <p className="mt-1 max-w-xs text-[12px] text-rose-700">{run.billstack.lastError}</p> : null}
                    </td>
                    <td className={`${td} space-x-2 whitespace-nowrap text-right`}>
                      {run.status === "FINALISED" && runs.billstackEnabled && run.billstack?.status !== "SENT" ? (
                        <button type="button" className={secondaryButtonClass} onClick={() => resend(run)} disabled={busy === run._id}><Send size={14} /> Send again</button>
                      ) : null}
                      {run.status === "FINALISED" ? (
                        <button type="button" className={secondaryButtonClass} onClick={() => reopen(run)} disabled={busy === run._id}><RotateCcw size={14} /> Reopen</button>
                      ) : null}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      <KpiIncentiveCard onSaved={(m) => { onSuccess(m); loadSheet(edits); }} onError={onError} />
    </div>
  );
}
