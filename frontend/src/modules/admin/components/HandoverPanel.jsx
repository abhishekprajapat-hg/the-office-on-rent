import React, { useCallback, useEffect, useState } from "react";
import { ArrowRightLeft, History, Loader2 } from "lucide-react";
import api from "../../../services/api";
import { toErrorMessage } from "../../../utils/errorMessage";

const KINDS = [
  { key: "leads", label: "Open leads" },
  { key: "tasks", label: "Open tasks" },
  { key: "brokers", label: "Broker relationships" },
  { key: "inventory", label: "Inventory they look after" },
];
const titleCase = (s) => String(s || "").replaceAll("_", " ").toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase());

/*
 * Requirements 16 Oct 2026, section 10: when someone moves segment or role,
 * their open work is handed to a named colleague - never silently orphaned -
 * and the change history shows what applied when.
 */
const HandoverPanel = ({ userId, users = [], roleHistory = [], isDark, highlight }) => {
  const [data, setData] = useState(null);
  const [toUserId, setToUserId] = useState("");
  const [include, setInclude] = useState(["leads", "tasks", "brokers", "inventory"]);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  const load = useCallback(async () => {
    try { setData((await api.get(`/users/${userId}/open-records`)).data); } catch { setData(null); }
  }, [userId]);
  useEffect(() => { load(); }, [load]);

  const submit = async () => {
    if (!toUserId) { setMessage("Choose who takes over"); return; }
    setBusy(true); setMessage("");
    try {
      const out = (await api.post(`/users/${userId}/handover`, { toUserId, include, note })).data;
      setMessage(`Handed to ${out.to.name}: ${out.moved.leads} leads, ${out.moved.tasks} tasks, ${out.moved.brokers} brokers, ${out.moved.inventory} inventory.`);
      await load();
    } catch (e) {
      setMessage(toErrorMessage(e, "Handover failed"));
    } finally {
      setBusy(false);
    }
  };

  const box = isDark ? "border-slate-700 bg-slate-900/70 text-slate-100" : "border-slate-200 bg-white text-slate-800";
  const field = `rounded-lg border px-2.5 py-1.5 text-xs ${isDark ? "border-slate-700 bg-slate-950 text-slate-100" : "border-slate-300 bg-white text-slate-800"}`;
  const counts = data?.counts || {};
  const total = (counts.leads || 0) + (counts.tasks || 0) + (counts.brokers || 0) + (counts.inventory || 0);
  const candidates = users.filter((u) => String(u._id) !== String(userId) && u.isActive !== false && u.role !== "CHANNEL_PARTNER");

  return (
    <div className={`col-span-2 space-y-3 rounded-xl border p-3 ${box} ${highlight && total ? "ring-2 ring-amber-300" : ""}`}>
      <div className="flex items-center gap-2">
        <ArrowRightLeft size={14} className="text-blue-600" />
        <p className="text-xs font-semibold">Open work &amp; handover</p>
      </div>
      {highlight && total ? <p className="text-[11px] font-semibold text-amber-700">Role or segment changed - decide who takes over the open work below.</p> : null}
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {KINDS.map((k) => (
          <label key={k.key} className={`flex items-center gap-2 rounded-lg border p-2 text-[11.5px] ${isDark ? "border-slate-700" : "border-slate-200"}`}>
            <input type="checkbox" checked={include.includes(k.key)} onChange={(e) => setInclude((list) => (e.target.checked ? [...list, k.key] : list.filter((x) => x !== k.key)))} />
            <span>{k.label}<span className="block font-mono text-[14px] font-bold">{data ? counts[k.key] || 0 : "…"}</span></span>
          </label>
        ))}
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <select className={field} value={toUserId} onChange={(e) => setToUserId(e.target.value)} aria-label="Hand over to">
          <option value="">Hand over to…</option>
          {candidates.map((u) => <option key={u._id} value={u._id}>{u.name} · {titleCase(u.role)}{u.roleType ? ` · ${titleCase(u.roleType)}` : ""}</option>)}
        </select>
        <input className={`${field} min-w-[180px] flex-1`} placeholder="Note (optional)" value={note} onChange={(e) => setNote(e.target.value)} maxLength={300} />
        <button type="button" onClick={submit} disabled={busy || !total} className="inline-flex items-center gap-1 rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-50">
          {busy ? <Loader2 size={12} className="animate-spin" /> : null} Hand over
        </button>
      </div>
      {message ? <p className="text-[11px] font-semibold">{message}</p> : null}
      {roleHistory.length ? (
        <div>
          <p className="mb-1 flex items-center gap-1 text-[11px] font-semibold text-slate-500"><History size={12} /> Role &amp; segment history</p>
          <ul className="space-y-1 text-[11px]">
            {roleHistory.map((h, i) => (
              <li key={i} className={isDark ? "text-slate-300" : "text-slate-600"}>
                <strong>{new Date(h.effectiveFrom || h.changedAt).toLocaleDateString("en-IN")}</strong>: {titleCase(h.previousRole)} · {titleCase(h.previousRoleType)} → {titleCase(h.role)} · {titleCase(h.roleType)}{h.note ? ` (${h.note})` : ""}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
};

export default HandoverPanel;
