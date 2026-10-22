import React, { useCallback, useEffect, useState } from "react";
import { Clock, Loader2, RefreshCw } from "lucide-react";
import { getLeadTouchReport } from "../../services/leadService";
import { toErrorMessage } from "../../utils/errorMessage";
import { cardClass, fieldClass, secondaryButtonClass, SectionHeader, StatCard } from "../salary/salaryUi";

const fmt = (m) => {
  if (m === null || m === undefined) return "–";
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60);
  return h < 24 ? `${h} h ${m % 60} min` : `${Math.floor(h / 24)} d ${h % 24} h`;
};
const todayIst = () => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata" }).format(new Date());
const daysAgo = (n) => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata" }).format(new Date(Date.now() - n * 86400000));

/*
 * How fast leads are first touched, per employee (requirements 16 Oct 2026,
 * section 08). A touch is a logged call or a message sent.
 */
const LeadResponseReport = ({ onToast }) => {
  const [range, setRange] = useState({ from: daysAgo(30), to: todayIst() });
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try { setData(await getLeadTouchReport(range)); } catch (e) {
      onToast({ type: "error", message: toErrorMessage(e, "Couldn't load lead response times") });
    } finally { setLoading(false); }
  }, [range, onToast]);
  useEffect(() => { load(); }, [load]);

  const t = data?.totals || {};
  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-4">
        <StatCard icon={Clock} tone="blue" label="Leads arrived" value={t.leads ?? "–"} />
        <StatCard icon={Clock} tone="green" label="Touched" value={t.touched ?? "–"} />
        <StatCard icon={Clock} tone="rose" label="Untouched" value={t.untouched ?? "–"} />
        <StatCard icon={Clock} tone="slate" label="Logged by hand / from CRM / verified" value={`${t.manualTouches ?? 0} / ${t.crmActionTouches ?? 0} / ${t.verifiedTouches ?? 0}`} />
      </div>
      <section className={cardClass}>
        <SectionHeader icon={Clock} tone="violet" title="Lead response time" subtitle="Time from a lead arriving in the CRM to its first logged call or message">
          <input type="date" className={`${fieldClass} ml-auto`} value={range.from} max={range.to} onChange={(e) => e.target.value && setRange((r) => ({ ...r, from: e.target.value }))} />
          <input type="date" className={fieldClass} value={range.to} min={range.from} max={todayIst()} onChange={(e) => e.target.value && setRange((r) => ({ ...r, to: e.target.value }))} />
          <button type="button" className={secondaryButtonClass} onClick={load} disabled={loading} aria-label="Refresh">{loading ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}</button>
        </SectionHeader>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[620px] text-[13px]">
            <thead><tr className="bg-slate-50 text-left text-[11.5px] font-semibold uppercase tracking-wide text-slate-500">
              <th className="px-4 py-2">Employee</th><th className="px-4 py-2 text-right">Leads</th><th className="px-4 py-2 text-right">Touched</th><th className="px-4 py-2 text-right">Untouched</th><th className="px-4 py-2 text-right">Average</th><th className="px-4 py-2 text-right">Median</th><th className="px-4 py-2 text-right">Within 15 min</th>
            </tr></thead>
            <tbody>
              {(data?.rows || []).map((r) => (
                <tr key={String(r.userId || "unassigned")} className="border-t border-slate-100">
                  <td className="px-4 py-2.5 font-semibold text-slate-800">{r.user?.name || "Unassigned"}</td>
                  <td className="px-4 py-2.5 text-right font-mono">{r.leads}</td>
                  <td className="px-4 py-2.5 text-right font-mono">{r.touched}</td>
                  <td className={`px-4 py-2.5 text-right font-mono ${r.untouched ? "text-rose-600" : ""}`}>{r.untouched}</td>
                  <td className="px-4 py-2.5 text-right">{fmt(r.averageMinutes)}</td>
                  <td className="px-4 py-2.5 text-right">{fmt(r.medianMinutes)}</td>
                  <td className="px-4 py-2.5 text-right font-mono">{r.within15Minutes}</td>
                </tr>
              ))}
              {data && !data.rows?.length ? <tr><td colSpan={7} className="px-4 py-6 text-center text-slate-500">No leads arrived in this period.</td></tr> : null}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
};

export default LeadResponseReport;
