import React, { useState } from "react";
import { Loader2 } from "lucide-react";
import { assignHierarchyTarget } from "../../services/targetService";
import { toErrorMessage } from "../../utils/errorMessage";

const FIELDS = [
  ["dealsTarget", "Deals closed"],
  ["revenueTarget", "Revenue ₹"],
  ["leadsTarget", "Leads"],
  ["siteVisitTarget", "Site visits"],
  ["productionTarget", "Production output (posts)"],
];
const input = "h-9 w-full rounded-lg border border-slate-300 bg-white px-2.5 text-[13px]";
const roleLabel = (r) => String(r || "").replaceAll("_", " ").toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase());

/*
 * Managers set each person's own monthly target (requirements 16 Oct 2026,
 * 3.1). Changing a target keeps who changed it, when and the old value; the
 * Performance score's 40% target part is measured against it.
 */
const TargetAssignPanel = ({ month, people = [], outgoing = [], onSaved }) => {
  const [userId, setUserId] = useState("");
  const [values, setValues] = useState({});
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  const pick = (id) => {
    setUserId(id);
    const existing = outgoing.find((t) => String(t.assignedTo?._id) === String(id));
    setValues(existing ? Object.fromEntries(FIELDS.map(([k]) => [k, String(existing[k] || "")])) : {});
    setNotes(existing?.notes || "");
    setMessage("");
  };

  const save = async () => {
    if (!userId) { setMessage("Choose who the target is for"); return; }
    setBusy(true); setMessage("");
    try {
      const payload = { assignedToId: userId, month, notes, ...Object.fromEntries(FIELDS.map(([k]) => [k, Number(values[k] || 0)])) };
      const out = await assignHierarchyTarget(payload);
      setMessage(out.message || "Target saved");
      onSaved?.();
    } catch (e) {
      setMessage(toErrorMessage(e, "Couldn't save the target"));
    } finally {
      setBusy(false);
    }
  };

  const current = outgoing.find((t) => String(t.assignedTo?._id) === String(userId));

  return (
    <div className="targets-card" style={{ marginTop: 16 }}>
      <div className="targets-card-h"><h4>Set a target · {month}</h4></div>
      <div className="targets-card-b space-y-3">
        <select className={input} value={userId} onChange={(e) => pick(e.target.value)} aria-label="Employee">
          <option value="">Choose an employee…</option>
          {people.map((p) => <option key={p._id} value={p._id}>{p.name} · {roleLabel(p.role)}</option>)}
        </select>
        <div className="grid gap-2 sm:grid-cols-3">
          {FIELDS.map(([key, label]) => (
            <label key={key} className="text-[11.5px] text-slate-500">{label}
              <input className={`${input} mt-0.5`} inputMode="numeric" value={values[key] || ""} onChange={(e) => setValues((v) => ({ ...v, [key]: e.target.value.replace(/[^\d]/g, "") }))} placeholder="0" />
            </label>
          ))}
          <label className="text-[11.5px] text-slate-500 sm:col-span-3">Notes
            <input className={`${input} mt-0.5`} value={notes} onChange={(e) => setNotes(e.target.value)} maxLength={500} />
          </label>
        </div>
        <div className="flex items-center gap-2">
          <button type="button" onClick={save} disabled={busy} className="inline-flex items-center gap-1 rounded-lg bg-blue-600 px-3 py-1.5 text-[12.5px] font-semibold text-white disabled:opacity-60">
            {busy ? <Loader2 size={13} className="animate-spin" /> : null} Save target
          </button>
          {message ? <span className="text-[12px] font-semibold text-slate-600">{message}</span> : null}
        </div>
        {current?.history?.length ? (
          <div>
            <p className="text-[11.5px] font-semibold text-slate-500">Change history</p>
            <ul className="mt-1 space-y-0.5 text-[11.5px] text-slate-600">
              {current.history.map((h, i) => (
                <li key={i}>{new Date(h.at).toLocaleString("en-IN")} · {h.byName || "Someone"}{h.previous ? ` changed it (was ${FIELDS.filter(([k]) => h.previous[k]).map(([k, l]) => `${l} ${h.previous[k]}`).join(", ") || "empty"})` : " set it"}</li>
              ))}
            </ul>
          </div>
        ) : null}
      </div>
    </div>
  );
};

export default TargetAssignPanel;
