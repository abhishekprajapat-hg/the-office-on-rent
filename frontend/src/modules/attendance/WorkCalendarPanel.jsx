import React, { useState } from "react";
import { CalendarOff, Loader2, Plus, Save, Trash2 } from "lucide-react";
import { updateAttendancePolicy } from "../../services/attendanceService";
import { toErrorMessage } from "../../utils/errorMessage";

const toTime = (minutes) => (minutes === null || minutes === undefined ? "" : `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`);
const toMinutes = (time) => {
  const [h, m] = String(time || "").split(":").map(Number);
  return Number.isFinite(h) && Number.isFinite(m) ? h * 60 + m : null;
};

/*
 * Half-day cutoff and company holidays (requirements 16 Oct 2026, 4.2/4.4).
 * Saved with the rest of the attendance policy.
 */
const WorkCalendarPanel = ({ policy, onSaved, cardClass, cardHeaderClass, fieldClass, primaryButtonClass }) => {
  const [cutoff, setCutoff] = useState(toTime(policy?.halfDayCheckInCutoffMinutes ?? 840));
  const [holidays, setHolidays] = useState(() => (policy?.holidays || []).map((h) => ({ ...h })));
  const [draft, setDraft] = useState({ date: "", name: "" });
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");

  const save = async () => {
    setSaving(true); setMessage("");
    try {
      const result = await updateAttendancePolicy({ ...(policy || {}), halfDayCheckInCutoffMinutes: cutoff ? toMinutes(cutoff) : null, holidays });
      onSaved?.(result.policy || null);
      setMessage("Saved");
    } catch (error) {
      setMessage(toErrorMessage(error, "Couldn't save"));
    } finally {
      setSaving(false);
    }
  };

  const addHoliday = () => {
    if (!draft.date) return;
    setHolidays((list) => [...list.filter((h) => h.date !== draft.date), { date: draft.date, name: draft.name || "Holiday" }].sort((a, b) => a.date.localeCompare(b.date)));
    setDraft({ date: "", name: "" });
  };

  return (
    <section className={cardClass}>
      <div className={cardHeaderClass}>
        <CalendarOff size={16} className="text-blue-600" />
        <h4 className="flex-1 text-[14px] font-semibold text-slate-900">Half day &amp; holidays</h4>
      </div>
      <div className="space-y-4 p-5 text-[13px]">
        <label className="block">
          <span className="font-semibold text-slate-700">Half-day cutoff</span>
          <span className="mt-0.5 block text-[12px] text-slate-500">Checking in at or after this time makes the day a half day - and only a half day, never also a late check-in. Leave empty to switch off.</span>
          <input type="time" value={cutoff} onChange={(e) => setCutoff(e.target.value)} className={`${fieldClass} mt-1`} />
        </label>
        <div>
          <span className="font-semibold text-slate-700">Company holidays</span>
          <span className="mt-0.5 block text-[12px] text-slate-500">Paid days off for everyone: never counted as absent.</span>
          <div className="mt-2 flex flex-wrap gap-2">
            <input type="date" value={draft.date} onChange={(e) => setDraft((d) => ({ ...d, date: e.target.value }))} className={fieldClass} aria-label="Holiday date" />
            <input value={draft.name} onChange={(e) => setDraft((d) => ({ ...d, name: e.target.value }))} placeholder="Name (e.g. Diwali)" maxLength={80} className={`${fieldClass} flex-1`} />
            <button type="button" onClick={addHoliday} className="inline-flex items-center gap-1 rounded-lg border border-slate-300 px-3 text-[12.5px] font-semibold"><Plus size={13} /> Add</button>
          </div>
          <ul className="mt-2 space-y-1">
            {holidays.map((h) => (
              <li key={h.date} className="flex items-center justify-between rounded-md bg-slate-50 px-2.5 py-1.5">
                <span><span className="font-mono">{h.date}</span> · {h.name}</span>
                <button type="button" aria-label={`Remove ${h.name}`} onClick={() => setHolidays((list) => list.filter((x) => x.date !== h.date))} className="text-rose-500"><Trash2 size={13} /></button>
              </li>
            ))}
            {!holidays.length ? <li className="text-[12px] text-slate-400">No holidays added.</li> : null}
          </ul>
        </div>
        <div className="flex items-center justify-end gap-2">
          {message ? <span className="text-[12px] font-semibold text-slate-600">{message}</span> : null}
          <button type="button" onClick={save} disabled={saving} className={primaryButtonClass}>
            {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />} Save
          </button>
        </div>
      </div>
    </section>
  );
};

export default WorkCalendarPanel;
