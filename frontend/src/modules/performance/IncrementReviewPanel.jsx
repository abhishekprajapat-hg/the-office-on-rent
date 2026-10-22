import React, { useCallback, useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { createIncrementReview, getPerformanceHistory, listIncrementReviews, updateIncrementReview } from "../../services/performanceService";
import { toErrorMessage } from "../../utils/errorMessage";
import { formatMonthLabel } from "../salary/salaryFormat";
import { gradeStyle } from "./performanceFormat";

const field = "h-9 rounded-lg border border-slate-300 bg-white px-2.5 text-[13px]";
const DECISIONS = ["PENDING", "APPROVED", "REJECTED", "DEFERRED"];
const titleCase = (s) => String(s || "").charAt(0) + String(s || "").slice(1).toLowerCase();

/*
 * Score history and increment reviews for one person (requirements 16 Oct
 * 2026, 3.4). Admin and Manager only. The review records a decision; it
 * never changes the salary - an approved increment is applied as a salary
 * revision on the Salary page.
 */
const IncrementReviewPanel = ({ user, month }) => {
  const [history, setHistory] = useState(null);
  const [reviews, setReviews] = useState([]);
  const [draft, setDraft] = useState({ periodFrom: "", periodTo: month, decision: "PENDING", incrementType: "PERCENT", incrementValue: "", effectiveDate: "", notes: "" });
  const [busy, setBusy] = useState("");
  const [message, setMessage] = useState("");

  const load = useCallback(async () => {
    try {
      const [h, r] = await Promise.all([getPerformanceHistory(user._id, { months: 6, to: month }), listIncrementReviews({ userId: user._id })]);
      setHistory(h.history || []);
      setReviews(r.reviews || []);
      setDraft((d) => ({ ...d, periodFrom: d.periodFrom || (h.history?.[0]?.month || month) }));
    } catch (e) {
      setMessage(toErrorMessage(e, "Couldn't load history"));
    }
  }, [user._id, month]);
  useEffect(() => { load(); }, [load]);

  const save = async () => {
    setBusy("new"); setMessage("");
    try {
      await createIncrementReview({ userId: user._id, ...draft, incrementValue: draft.incrementValue === "" ? null : Number(draft.incrementValue) });
      setMessage("Review saved");
      await load();
    } catch (e) { setMessage(toErrorMessage(e, "Couldn't save the review")); } finally { setBusy(""); }
  };
  const decide = async (review, decision) => {
    setBusy(review._id); setMessage("");
    try {
      await updateIncrementReview(review._id, { decision });
      await load();
    } catch (e) { setMessage(toErrorMessage(e, "Couldn't update")); } finally { setBusy(""); }
  };

  return (
    <div className="mt-5 space-y-4 border-t border-slate-100 pt-4">
      <section>
        <p className="text-[13px] font-semibold text-slate-900">Last 6 months</p>
        {!history ? <p className="mt-2 flex items-center gap-2 text-[12.5px] text-slate-500"><Loader2 size={13} className="animate-spin" /> Loading…</p> : (
          <div className="mt-2 flex items-end gap-2">
            {history.map((h) => (
              <div key={h.month} className="flex flex-1 flex-col items-center gap-1">
                <span className={`font-mono text-[12px] font-bold ${gradeStyle(h.grade).ink}`}>{h.score ?? "–"}</span>
                <span className={`w-full rounded-t ${gradeStyle(h.grade).bar}`} style={{ height: `${Math.max(4, (h.score || 0) * 0.8)}px` }} />
                <span className="text-[10.5px] text-slate-500">{formatMonthLabel(h.month).slice(0, 3)}</span>
              </div>
            ))}
          </div>
        )}
      </section>

      <section>
        <p className="text-[13px] font-semibold text-slate-900">Increment reviews</p>
        <p className="text-[12px] text-slate-500">The score is an input; the decision is yours. Nothing here changes the salary - apply an approved increment on the Salary page.</p>
        <ul className="mt-2 space-y-2">
          {reviews.map((r) => (
            <li key={r._id} className="rounded-lg border border-slate-200 p-2.5 text-[12.5px]">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span><strong>{formatMonthLabel(r.periodFrom)} – {formatMonthLabel(r.periodTo)}</strong> · average score {r.scoreSnapshot?.averageScore ?? "–"}</span>
                <select className={field} value={r.decision} disabled={busy === r._id} onChange={(e) => decide(r, e.target.value)} aria-label="Decision">
                  {DECISIONS.map((d) => <option key={d} value={d}>{titleCase(d)}</option>)}
                </select>
              </div>
              <p className="text-slate-600">
                {r.incrementValue !== null && r.incrementValue !== undefined ? `${r.incrementType === "PERCENT" ? `${r.incrementValue}%` : `₹${Number(r.incrementValue).toLocaleString("en-IN")}`} increment` : "No increment set"}
                {r.effectiveDate ? ` from ${r.effectiveDate}` : ""} · reviewer {r.reviewer?.name || "–"}
              </p>
              {r.notes ? <p className="text-slate-500">{r.notes}</p> : null}
            </li>
          ))}
          {!reviews.length ? <li className="text-[12.5px] text-slate-400">No reviews yet.</li> : null}
        </ul>
        <div className="mt-3 grid gap-2 rounded-lg bg-slate-50 p-3 sm:grid-cols-3">
          <label className="text-[11.5px] text-slate-500">From<input type="month" className={`${field} mt-0.5 w-full`} value={draft.periodFrom} onChange={(e) => setDraft((d) => ({ ...d, periodFrom: e.target.value }))} /></label>
          <label className="text-[11.5px] text-slate-500">To<input type="month" className={`${field} mt-0.5 w-full`} value={draft.periodTo} onChange={(e) => setDraft((d) => ({ ...d, periodTo: e.target.value }))} /></label>
          <label className="text-[11.5px] text-slate-500">Decision<select className={`${field} mt-0.5 w-full`} value={draft.decision} onChange={(e) => setDraft((d) => ({ ...d, decision: e.target.value }))}>{DECISIONS.map((d) => <option key={d} value={d}>{titleCase(d)}</option>)}</select></label>
          <label className="text-[11.5px] text-slate-500">Increment<div className="mt-0.5 flex gap-1"><input inputMode="decimal" className={`${field} w-full`} value={draft.incrementValue} onChange={(e) => setDraft((d) => ({ ...d, incrementValue: e.target.value.replace(/[^\d.]/g, "") }))} /><select className={field} value={draft.incrementType} onChange={(e) => setDraft((d) => ({ ...d, incrementType: e.target.value }))}><option value="PERCENT">%</option><option value="AMOUNT">₹</option></select></div></label>
          <label className="text-[11.5px] text-slate-500">Effective date<input type="date" className={`${field} mt-0.5 w-full`} value={draft.effectiveDate} onChange={(e) => setDraft((d) => ({ ...d, effectiveDate: e.target.value }))} /></label>
          <label className="text-[11.5px] text-slate-500">Notes<input className={`${field} mt-0.5 w-full`} value={draft.notes} onChange={(e) => setDraft((d) => ({ ...d, notes: e.target.value }))} maxLength={2000} /></label>
          <div className="flex items-center gap-2 sm:col-span-3">
            <button type="button" onClick={save} disabled={busy === "new"} className="inline-flex items-center gap-1 rounded-lg bg-blue-600 px-3 py-1.5 text-[12.5px] font-semibold text-white disabled:opacity-60">{busy === "new" ? <Loader2 size={13} className="animate-spin" /> : null} Save review</button>
            {message ? <span className="text-[12px] font-semibold text-slate-600">{message}</span> : null}
          </div>
        </div>
      </section>
    </div>
  );
};

export default IncrementReviewPanel;
