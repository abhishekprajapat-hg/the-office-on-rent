import React, { useState } from "react";
import { CalendarDays, Loader2 } from "lucide-react";
import api from "../../../services/api";
import { toErrorMessage } from "../../../utils/errorMessage";

const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const todayKey = () => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata" }).format(new Date());

/*
 * This person's own weekly off (requirements 16 Oct 2026, 4.3) - e.g.
 * Production works Sunday and is off Monday. Applies from the chosen date;
 * earlier months keep the schedule they had. No days ticked = the company's
 * weekly off.
 */
const WeeklyOffEditor = ({ userId, schedule = [], isDark, onSaved }) => {
  const sorted = [...schedule].sort((a, b) => String(a.effectiveFrom).localeCompare(String(b.effectiveFrom)));
  const current = [...sorted].reverse().find((e) => e.effectiveFrom <= todayKey());
  const [days, setDays] = useState(current?.days || []);
  const [effectiveFrom, setEffectiveFrom] = useState(todayKey());
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  const save = async () => {
    setBusy(true); setMessage("");
    try {
      const out = (await api.put(`/users/${userId}/weekly-off`, { days, effectiveFrom })).data;
      setMessage("Weekly off saved");
      onSaved?.(out.user?.weeklyOffSchedule || []);
    } catch (e) {
      setMessage(toErrorMessage(e, "Couldn't save"));
    } finally {
      setBusy(false);
    }
  };

  const box = isDark ? "border-slate-700 bg-slate-950 text-slate-100" : "border-slate-200 bg-white text-slate-800";
  return (
    <div className={`col-span-2 space-y-2 rounded-xl border p-2.5 ${box}`}>
      <p className="flex items-center gap-1.5 text-xs font-semibold"><CalendarDays size={13} className="text-blue-600" /> Weekly off</p>
      <p className="text-[11px] text-slate-500">
        Now: {current ? (current.days.length ? current.days.map((d) => DAYS[d]).join(", ") : "company default") : "company default"}
        {sorted.length ? ` · ${sorted.length} change(s) on record` : ""}
      </p>
      <div className="flex flex-wrap gap-1.5">
        {DAYS.map((label, index) => {
          const on = days.includes(index);
          return (
            <button key={label} type="button" aria-pressed={on} onClick={() => setDays((list) => (on ? list.filter((d) => d !== index) : [...list, index].sort()))}
              className={`rounded-full border px-2.5 py-1 text-[11.5px] font-semibold ${on ? "border-blue-600 bg-blue-600 text-white" : "border-slate-300"}`}>{label}</button>
          );
        })}
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-[11px] text-slate-500">From</span>
        <input type="date" value={effectiveFrom} onChange={(e) => setEffectiveFrom(e.target.value)} className="rounded-lg border border-slate-300 px-2 py-1 text-xs" />
        <button type="button" onClick={save} disabled={busy || !effectiveFrom} className="inline-flex items-center gap-1 rounded-lg bg-blue-600 px-3 py-1 text-xs font-semibold text-white disabled:opacity-50">
          {busy ? <Loader2 size={12} className="animate-spin" /> : null} Save weekly off
        </button>
        {message ? <span className="text-[11px] font-semibold">{message}</span> : null}
      </div>
      <p className="text-[11px] text-slate-400">No days ticked = the company&apos;s weekly off. Working on a day off is recorded, not charged; any extra pay or comp-off follows company policy.</p>
    </div>
  );
};

export default WeeklyOffEditor;
