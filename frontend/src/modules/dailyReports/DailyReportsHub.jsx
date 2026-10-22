import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import {
  AlertTriangle, CalendarDays, CheckCircle2, ClipboardCheck, Clock, Download, FileSpreadsheet,
  History, Loader2, LogOut, Pencil, RefreshCw, Users,
} from "lucide-react";
import { usePermissions } from "../../context/usePermissions";
import { toErrorMessage } from "../../utils/errorMessage";
import ToastNotice from "../../components/ui/ToastNotice";
import Modal from "../../components/ui/Modal";
import { TabButton, Tabs } from "../../components/ui/Tabs";
import { cardClass, fieldClass, primaryButtonClass, secondaryButtonClass, SectionHeader, StatCard } from "../salary/salaryUi";
import DailyReportForm from "./DailyReportForm";
import LeadResponseReport from "./LeadResponseReport";
import { emptyFormValue, findFormProblem, toPayload, valueFromReport } from "./dailyReportFormValue";
import {
  amendDailyReport, getDailyReportDayStatus, getDailyReportSummary, getMyDailyReportToday, submitDailyReport,
} from "../../services/dailyReportService";
import { columnsFor, downloadDailyReportsPdf, downloadDailyReportsXlsx, formatDateKey, periodLabel } from "./dailyReportExport";

const readStoredUser = () => {
  try { return JSON.parse(localStorage.getItem("user") || "{}") || {}; } catch { return {}; }
};
const roleLabel = (role) => String(role || "").replaceAll("_", " ").toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase());
const segmentLabel = (s) => (s ? s.charAt(0) + s.slice(1).toLowerCase() : "");
const todayIst = () => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata" }).format(new Date());
const monthBounds = (month) => {
  const [y, m] = month.split("-").map(Number);
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return { from: `${month}-01`, to: `${month}-${String(last).padStart(2, "0")}` };
};

/* ------------------------------------------------------ today's report -- */

const TodayReport = ({ onToast, fromCheckout }) => {
  const navigate = useNavigate();
  const [data, setData] = useState(null);
  const [value, setValue] = useState(null);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [errorField, setErrorField] = useState("");
  const [justSubmitted, setJustSubmitted] = useState(false);

  const load = useCallback(async () => {
    try {
      const payload = await getMyDailyReportToday();
      setData(payload);
      setValue(payload.report ? valueFromReport(payload.form, payload.report) : emptyFormValue(payload.form));
      setEditing(!payload.report);
    } catch (error) {
      onToast({ type: "error", message: toErrorMessage(error, "Couldn't load your report") });
    }
  }, [onToast]);

  useEffect(() => { load(); }, [load]);

  if (!data) {
    return <div className="flex items-center gap-2 p-8 text-[13px] text-slate-500"><Loader2 size={15} className="animate-spin" /> Loading…</div>;
  }
  if (!data.required) {
    return (
      <section className={`${cardClass} p-6 text-[13px] text-slate-600`}>
        Your role doesn't file a daily report. Use the History and Team tabs to see your team's reports.
      </section>
    );
  }

  const submit = async (event) => {
    event.preventDefault();
    const problem = findFormProblem(data.form, value);
    if (problem) {
      setErrorField(problem.field);
      onToast({ type: "error", message: problem.message });
      return;
    }
    setErrorField("");
    setSaving(true);
    try {
      if (data.report) {
        await amendDailyReport(data.report._id, toPayload(value));
        onToast({ type: "success", message: "Report updated" });
      } else {
        await submitDailyReport(toPayload(value));
        setJustSubmitted(true);
        onToast({ type: "success", message: "Daily report submitted" });
      }
      await load();
    } catch (error) {
      setErrorField(error?.response?.data?.field || "");
      onToast({ type: "error", message: toErrorMessage(error, "Couldn't save the report") });
    } finally {
      setSaving(false);
    }
  };

  const submitted = Boolean(data.report);

  return (
    <div className="space-y-4">
      {fromCheckout && !submitted ? (
        <div className="flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 p-4 text-[13px] text-amber-900">
          <AlertTriangle size={18} className="mt-0.5 shrink-0" />
          <p><strong>You haven't submitted your daily report.</strong> Please submit it before checking out.</p>
        </div>
      ) : null}
      {submitted && (fromCheckout || justSubmitted) ? (
        <div className="flex flex-wrap items-center gap-3 rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-[13px] text-emerald-900">
          <CheckCircle2 size={18} className="shrink-0" />
          <p className="flex-1">Report submitted. You can check out now.</p>
          <button type="button" className={primaryButtonClass} onClick={() => navigate("/attendance")}>
            <LogOut size={14} /> Go to check out
          </button>
        </div>
      ) : null}

      <form onSubmit={submit} className={cardClass}>
        <SectionHeader
          icon={ClipboardCheck}
          tone={submitted ? "green" : "blue"}
          title={`Daily report - ${formatDateKey(data.reportDate)}`}
          subtitle={`${data.form.label} form${submitted ? ` · submitted ${new Date(data.report.submittedAt).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" })}` : " · takes about 2 minutes. Zero is a fine answer."}`}
        >
          {submitted && !editing ? (
            <button type="button" className={secondaryButtonClass} onClick={() => setEditing(true)}><Pencil size={14} /> Edit</button>
          ) : null}
        </SectionHeader>
        <div className="p-5">
          <DailyReportForm form={data.form} value={value} onChange={setValue} errorField={errorField} disabled={submitted && !editing} />
          {data.report?.amendments?.length ? (
            <p className="mt-4 text-[12px] text-slate-500">Edited {data.report.amendments.length} time(s); earlier values are kept in the history.</p>
          ) : null}
        </div>
        {(!submitted || editing) ? (
          <div className="flex flex-wrap justify-end gap-2 border-t border-slate-100 px-5 py-3.5">
            {submitted ? (
              <button type="button" className={secondaryButtonClass} onClick={() => { setEditing(false); setValue(valueFromReport(data.form, data.report)); }}>Cancel</button>
            ) : null}
            <button type="submit" className={primaryButtonClass} disabled={saving}>
              {saving ? <Loader2 size={14} className="animate-spin" /> : <CheckCircle2 size={14} />}
              {submitted ? "Save changes" : "Submit report"}
            </button>
          </div>
        ) : null}
      </form>
    </div>
  );
};

/* ------------------------------------------------------------- history -- */

const CorrectionDialog = ({ employee, day, forms, onClose, onSaved, onToast }) => {
  const form = forms.find((f) => f.key === day.formKey);
  const [value, setValue] = useState(() => valueFromReport(form, day));
  const [reason, setReason] = useState("");
  const [saving, setSaving] = useState(false);
  const [errorField, setErrorField] = useState("");

  const save = async () => {
    const problem = findFormProblem(form, value);
    if (problem) { setErrorField(problem.field); onToast({ type: "error", message: problem.message }); return; }
    if (!reason.trim()) { setErrorField("reason"); onToast({ type: "error", message: "Add a reason for the correction" }); return; }
    setSaving(true);
    try {
      await amendDailyReport(day._id, { ...toPayload(value), reason });
      onToast({ type: "success", message: "Report corrected" });
      onSaved();
    } catch (error) {
      setErrorField(error?.response?.data?.field || "");
      onToast({ type: "error", message: toErrorMessage(error, "Couldn't correct the report") });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      open
      size="xl"
      title={`Correct ${employee.user?.name || ""}'s report`}
      description={`${formatDateKey(day.reportDate)} · the old values are kept in the history`}
      onClose={onClose}
      footer={(
        <div className="flex justify-end gap-2">
          <button type="button" className={secondaryButtonClass} onClick={onClose}>Cancel</button>
          <button type="button" className={primaryButtonClass} onClick={save} disabled={saving}>
            {saving ? <Loader2 size={14} className="animate-spin" /> : null} Save correction
          </button>
        </div>
      )}
    >
      <DailyReportForm form={form} value={value} onChange={setValue} errorField={errorField} />
      <label className="mt-4 block">
        <span className="text-[13px] font-semibold text-slate-800">Reason for correction</span>
        <input className={`${fieldClass} mt-1 w-full ${errorField === "reason" ? "border-rose-400" : ""}`} value={reason} onChange={(e) => setReason(e.target.value)} maxLength={500} placeholder="e.g. Site visit count entered wrongly" />
      </label>
    </Modal>
  );
};

const EmployeeBlock = ({ employee, forms, canCorrect, onCorrect }) => {
  const cols = columnsFor(employee, forms);
  return (
    <section className={cardClass}>
      <div className="flex flex-wrap items-center gap-3 border-b border-slate-100 px-5 py-3">
        <div className="min-w-0 flex-1">
          <p className="text-[14px] font-semibold text-slate-900">{employee.user?.name}</p>
          <p className="text-[12px] text-slate-500">{roleLabel(employee.user?.role)} · {segmentLabel(employee.user?.roleType)}</p>
        </div>
        <span className="rounded-full bg-emerald-50 px-2.5 py-1 text-[12px] font-semibold text-emerald-700">{employee.daysSubmitted} reported</span>
        {employee.missingDates.length ? (
          <span className="rounded-full bg-rose-50 px-2.5 py-1 text-[12px] font-semibold text-rose-700" title={employee.missingDates.map(formatDateKey).join(", ")}>
            {employee.missingDates.length} missing
          </span>
        ) : null}
      </div>
      {employee.days.length ? (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] border-collapse text-[12.5px]">
            <thead>
              <tr className="bg-slate-50 text-left text-[11.5px] font-semibold uppercase tracking-wide text-slate-500">
                <th className="px-3 py-2">Date</th>
                {cols.counts.map((f) => <th key={f.key} className="px-3 py-2 text-right">{f.label}</th>)}
                {cols.texts.map((f) => <th key={f.key} className="px-3 py-2">{f.label}</th>)}
                {cols.hasIssues ? <th className="px-3 py-2">Issues</th> : null}
                {canCorrect ? <th className="px-3 py-2" aria-label="Actions" /> : null}
              </tr>
            </thead>
            <tbody>
              {employee.days.map((d) => (
                <tr key={d._id} className="border-t border-slate-100 align-top">
                  <td className="whitespace-nowrap px-3 py-2 font-mono text-slate-700">
                    {formatDateKey(d.reportDate)}{d.amended ? <span className="ml-1 text-amber-600" title="Corrected after submission">*</span> : null}
                  </td>
                  {cols.counts.map((f) => <td key={f.key} className="px-3 py-2 text-right font-mono tabular-nums">{d.counts?.[f.key] ?? "–"}</td>)}
                  {cols.texts.map((f) => <td key={f.key} className="max-w-[260px] px-3 py-2 text-slate-600">{d.notes?.[f.key] || ""}</td>)}
                  {cols.hasIssues ? (
                    <td className="max-w-[320px] px-3 py-2 text-slate-600">
                      {(d.issues || []).map((i, n) => (
                        <div key={n}>{roleLabel(i.category)}: {i.description} <span className="text-slate-400">({roleLabel(i.status)}, {roleLabel(i.priority)})</span></div>
                      ))}
                    </td>
                  ) : null}
                  {canCorrect ? (
                    <td className="px-3 py-2 text-right">
                      <button type="button" className="text-[12px] font-semibold text-blue-700 hover:underline" onClick={() => onCorrect(employee, d)}>Correct</button>
                    </td>
                  ) : null}
                </tr>
              ))}
              <tr className="border-t-2 border-slate-200 bg-slate-50 font-semibold">
                <td className="px-3 py-2">Total</td>
                {cols.counts.map((f) => <td key={f.key} className="px-3 py-2 text-right font-mono tabular-nums">{employee.totals?.[f.key] ?? 0}</td>)}
                <td colSpan={cols.texts.length + (cols.hasIssues ? 1 : 0) + (canCorrect ? 1 : 0)} />
              </tr>
              <tr className="bg-slate-50 text-slate-600">
                <td className="px-3 py-2" title="Average per day with a submitted report">Avg / day reported</td>
                {cols.counts.map((f) => <td key={f.key} className="px-3 py-2 text-right font-mono tabular-nums">{employee.averages?.[f.key] ?? "–"}</td>)}
                <td colSpan={cols.texts.length + (cols.hasIssues ? 1 : 0) + (canCorrect ? 1 : 0)} />
              </tr>
            </tbody>
          </table>
        </div>
      ) : (
        <p className="px-5 py-4 text-[13px] text-slate-500">No reports in this period.</p>
      )}
      {employee.missingDates.length ? (
        <p className="border-t border-slate-100 px-5 py-2.5 text-[12px] text-rose-700">
          Checked in but no report: {employee.missingDates.map(formatDateKey).join(", ")}
        </p>
      ) : null}
    </section>
  );
};

const HistoryView = ({ isManager, onToast }) => {
  const today = todayIst();
  const [mode, setMode] = useState("month");
  const [day, setDay] = useState(today);
  const [range, setRange] = useState({ from: today.slice(0, 8) + "01", to: today });
  const [month, setMonth] = useState(today.slice(0, 7));
  const [filters, setFilters] = useState({ userId: "", role: "", roleType: "" });
  const [people, setPeople] = useState([]);
  const [summary, setSummary] = useState(null);
  const [loading, setLoading] = useState(false);
  const [correcting, setCorrecting] = useState(null);
  const [downloading, setDownloading] = useState("");

  const period = useMemo(() => {
    if (mode === "day") return { from: day, to: day };
    if (mode === "range") return range;
    return monthBounds(month);
  }, [mode, day, range, month]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = { ...period, ...Object.fromEntries(Object.entries(filters).filter(([, v]) => v)) };
      const data = await getDailyReportSummary(params);
      setSummary(data);
      if (!filters.userId && !filters.role && !filters.roleType) {
        setPeople(data.employees.map((e) => e.user).filter(Boolean));
      }
    } catch (error) {
      onToast({ type: "error", message: toErrorMessage(error, "Couldn't load reports") });
    } finally {
      setLoading(false);
    }
  }, [period, filters, onToast]);

  useEffect(() => { load(); }, [load]);

  const download = async (kind) => {
    if (!summary) return;
    setDownloading(kind);
    try {
      const name = `daily-reports-${summary.from}_${summary.to}`;
      if (kind === "pdf") await downloadDailyReportsPdf(summary, `${name}.pdf`);
      else await downloadDailyReportsXlsx(summary, `${name}.xlsx`);
    } catch (error) {
      onToast({ type: "error", message: toErrorMessage(error, "Download failed") });
    } finally {
      setDownloading("");
    }
  };

  const totals = useMemo(() => (summary?.employees || []).reduce(
    (acc, e) => ({ reported: acc.reported + e.daysSubmitted, missing: acc.missing + e.missingDates.length }),
    { reported: 0, missing: 0 },
  ), [summary]);

  return (
    <div className="space-y-4">
      <section className={cardClass}>
        <SectionHeader icon={History} tone="violet" title={isManager ? "Report history" : "My report history"} subtitle={summary ? periodLabel(summary.from, summary.to) : ""}>
          <div className="ml-auto flex flex-wrap gap-2">
            <button type="button" className={secondaryButtonClass} onClick={() => download("pdf")} disabled={!summary || Boolean(downloading)}>
              {downloading === "pdf" ? <Loader2 size={14} className="animate-spin" /> : <Download size={14} />} PDF
            </button>
            <button type="button" className={secondaryButtonClass} onClick={() => download("xlsx")} disabled={!summary || Boolean(downloading)}>
              {downloading === "xlsx" ? <Loader2 size={14} className="animate-spin" /> : <FileSpreadsheet size={14} />} Excel
            </button>
          </div>
        </SectionHeader>
        <div className="flex flex-wrap items-end gap-3 px-5 py-4">
          <label className="block">
            <span className="text-[12px] font-semibold text-slate-500">Period</span>
            <select className={`${fieldClass} mt-1 block`} value={mode} onChange={(e) => setMode(e.target.value)}>
              <option value="day">Single day</option>
              <option value="month">Calendar month</option>
              <option value="range">Custom range</option>
            </select>
          </label>
          {mode === "day" ? (
            <label className="block"><span className="text-[12px] font-semibold text-slate-500">Date</span>
              <input type="date" className={`${fieldClass} mt-1 block`} value={day} max={today} onChange={(e) => e.target.value && setDay(e.target.value)} /></label>
          ) : null}
          {mode === "month" ? (
            <label className="block"><span className="text-[12px] font-semibold text-slate-500">Month</span>
              <input type="month" className={`${fieldClass} mt-1 block`} value={month} max={today.slice(0, 7)} onChange={(e) => e.target.value && setMonth(e.target.value)} /></label>
          ) : null}
          {mode === "range" ? (
            <>
              <label className="block"><span className="text-[12px] font-semibold text-slate-500">From</span>
                <input type="date" className={`${fieldClass} mt-1 block`} value={range.from} max={range.to} onChange={(e) => e.target.value && setRange((r) => ({ ...r, from: e.target.value }))} /></label>
              <label className="block"><span className="text-[12px] font-semibold text-slate-500">To</span>
                <input type="date" className={`${fieldClass} mt-1 block`} value={range.to} min={range.from} max={today} onChange={(e) => e.target.value && setRange((r) => ({ ...r, to: e.target.value }))} /></label>
            </>
          ) : null}
          {isManager ? (
            <>
              <label className="block"><span className="text-[12px] font-semibold text-slate-500">Employee</span>
                <select className={`${fieldClass} mt-1 block max-w-[200px]`} value={filters.userId} onChange={(e) => setFilters((f) => ({ ...f, userId: e.target.value }))}>
                  <option value="">Everyone</option>
                  {people.map((p) => <option key={p._id} value={p._id}>{p.name}</option>)}
                </select></label>
              <label className="block"><span className="text-[12px] font-semibold text-slate-500">Role</span>
                <select className={`${fieldClass} mt-1 block`} value={filters.role} onChange={(e) => setFilters((f) => ({ ...f, role: e.target.value }))}>
                  <option value="">All roles</option>
                  {["MANAGER", "EXECUTIVE", "INSIDE_EXECUTIVE", "FIELD_EXECUTIVE", "PRODUCTION_EXECUTIVE", "COMMUNITY_MANAGER", "COWORKING_ADMIN"].map((r) => <option key={r} value={r}>{roleLabel(r)}</option>)}
                </select></label>
              <label className="block"><span className="text-[12px] font-semibold text-slate-500">Segment</span>
                <select className={`${fieldClass} mt-1 block`} value={filters.roleType} onChange={(e) => setFilters((f) => ({ ...f, roleType: e.target.value }))}>
                  <option value="">All segments</option>
                  {["COMMERCIAL", "RESIDENTIAL", "COWORKING", "BOTH"].map((s) => <option key={s} value={s}>{segmentLabel(s)}</option>)}
                </select></label>
            </>
          ) : null}
          <button type="button" className={`${secondaryButtonClass} ml-auto`} onClick={load} disabled={loading} aria-label="Refresh">
            {loading ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}
          </button>
        </div>
      </section>

      {summary && isManager ? (
        <div className="grid gap-3 sm:grid-cols-3">
          <StatCard icon={Users} tone="blue" label="Employees" value={summary.employees.length} />
          <StatCard icon={CheckCircle2} tone="green" label="Reports submitted" value={totals.reported} />
          <StatCard icon={AlertTriangle} tone="rose" label="Missing reports" value={totals.missing} hint="Days checked in without a report" />
        </div>
      ) : null}

      {summary ? (
        summary.employees.length ? summary.employees.map((e) => (
          <EmployeeBlock
            key={e.user?._id}
            employee={e}
            forms={summary.forms}
            canCorrect={isManager}
            onCorrect={(employee, d) => setCorrecting({ employee, day: d })}
          />
        )) : <section className={`${cardClass} p-6 text-[13px] text-slate-500`}>Nobody matches these filters.</section>
      ) : (
        <div className="flex items-center gap-2 p-8 text-[13px] text-slate-500"><Loader2 size={15} className="animate-spin" /> Loading…</div>
      )}

      {correcting ? (
        <CorrectionDialog
          employee={correcting.employee}
          day={correcting.day}
          forms={summary.forms}
          onToast={onToast}
          onClose={() => setCorrecting(null)}
          onSaved={() => { setCorrecting(null); load(); }}
        />
      ) : null}
    </div>
  );
};

/* ---------------------------------------------------------- team status -- */

const STATE_STYLE = {
  SUBMITTED: { label: "Submitted", cls: "bg-emerald-50 text-emerald-700" },
  MISSING: { label: "Missing", cls: "bg-rose-50 text-rose-700" },
  PENDING: { label: "Still working", cls: "bg-amber-50 text-amber-700" },
  NOT_CHECKED_IN: { label: "Not checked in", cls: "bg-slate-100 text-slate-500" },
};

const TeamStatus = ({ onToast }) => {
  const [date, setDate] = useState(todayIst());
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [state, setState] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try { setData(await getDailyReportDayStatus({ date })); } catch (error) {
      onToast({ type: "error", message: toErrorMessage(error, "Couldn't load team status") });
    } finally { setLoading(false); }
  }, [date, onToast]);
  useEffect(() => { load(); }, [load]);

  const rows = (data?.rows || []).filter((r) => !state || r.state === state);

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-4">
        {Object.entries(STATE_STYLE).map(([key, s]) => (
          <button key={key} type="button" onClick={() => setState(state === key ? "" : key)} className={`text-left ${state === key ? "ring-2 ring-blue-300 rounded-xl" : ""}`}>
            <StatCard icon={key === "SUBMITTED" ? CheckCircle2 : key === "MISSING" ? AlertTriangle : key === "PENDING" ? Clock : Users} tone={key === "SUBMITTED" ? "green" : key === "MISSING" ? "rose" : key === "PENDING" ? "amber" : "slate"} label={s.label} value={data?.counts?.[key] || 0} />
          </button>
        ))}
      </div>
      <section className={cardClass}>
        <SectionHeader icon={CalendarDays} tone="blue" title="Team reports for the day" subtitle={formatDateKey(date)}>
          <input type="date" className={`${fieldClass} ml-auto`} value={date} max={todayIst()} onChange={(e) => e.target.value && setDate(e.target.value)} />
          <button type="button" className={secondaryButtonClass} onClick={load} disabled={loading} aria-label="Refresh">
            {loading ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}
          </button>
        </SectionHeader>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[560px] text-[13px]">
            <thead>
              <tr className="bg-slate-50 text-left text-[11.5px] font-semibold uppercase tracking-wide text-slate-500">
                <th className="px-4 py-2">Employee</th><th className="px-4 py-2">Role</th><th className="px-4 py-2">Status</th><th className="px-4 py-2">Submitted</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.user._id} className="border-t border-slate-100">
                  <td className="px-4 py-2.5 font-semibold text-slate-800">{r.user.name}</td>
                  <td className="px-4 py-2.5 text-slate-500">{roleLabel(r.user.role)} · {segmentLabel(r.user.roleType)}</td>
                  <td className="px-4 py-2.5"><span className={`rounded-full px-2.5 py-1 text-[12px] font-semibold ${STATE_STYLE[r.state].cls}`}>{STATE_STYLE[r.state].label}</span></td>
                  <td className="px-4 py-2.5 font-mono text-slate-500">{r.report ? new Date(r.report.submittedAt).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" }) : "–"}</td>
                </tr>
              ))}
              {!rows.length ? <tr><td colSpan={4} className="px-4 py-6 text-center text-slate-500">{loading ? "Loading…" : "Nobody here."}</td></tr> : null}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
};

/* ---------------------------------------------------------------- page -- */

const DailyReportsHub = () => {
  const { role: contextRole } = usePermissions();
  const role = String(contextRole || readStoredUser().role || "").toUpperCase();
  const isManager = role === "ADMIN" || role === "MANAGER";
  const [searchParams] = useSearchParams();
  const fromCheckout = searchParams.get("from") === "checkout";
  const [toast, setToast] = useState(null);
  const onToast = useCallback((t) => { setToast({ ...t, key: Date.now() }); }, []);

  const tabs = useMemo(() => {
    const list = [];
    if (role !== "ADMIN") list.push({ id: "today", label: "Today's report" });
    list.push({ id: "history", label: isManager ? "History & downloads" : "My history" });
    if (isManager) list.push({ id: "team", label: "Team status" });
    if (isManager) list.push({ id: "response", label: "Lead response time" });
    return list;
  }, [role, isManager]);
  const [tab, setTab] = useState(() => (fromCheckout || role !== "ADMIN" ? "today" : "history"));
  const active = tabs.some((t) => t.id === tab) ? tab : tabs[0].id;

  return (
    // ui-page-shell is what scrolls: the workspace gives each page a fixed
    // height and expects the page to scroll inside it.
    <div className="ui-page-shell custom-scrollbar space-y-4 bg-slate-50/70 text-slate-900">
      {toast ? <ToastNotice key={toast.key} message={toast.message} type={toast.type} /> : null}
      <Tabs>
        {tabs.map((t) => <TabButton key={t.id} active={active === t.id} onClick={() => setTab(t.id)}>{t.label}</TabButton>)}
        {active === "today" ? <Link to="/attendance" className="ml-auto text-[12.5px] font-semibold text-blue-700 hover:underline">Attendance</Link> : null}
      </Tabs>
      {active === "today" ? <TodayReport onToast={onToast} fromCheckout={fromCheckout} /> : null}
      {active === "history" ? <HistoryView isManager={isManager} onToast={onToast} /> : null}
      {active === "team" ? <TeamStatus onToast={onToast} /> : null}
      {active === "response" ? <LeadResponseReport onToast={onToast} /> : null}
    </div>
  );
};

export default DailyReportsHub;
