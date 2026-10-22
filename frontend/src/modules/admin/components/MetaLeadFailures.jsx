import React, { useCallback, useEffect, useState } from "react";
import { AlertTriangle, CheckCircle2, Loader2 } from "lucide-react";
import { getMetaLeadFailures, resolveMetaLeadFailure } from "../../../services/leadService";
import { toErrorMessage } from "../../../utils/errorMessage";

/*
 * Meta Ads leads the CRM couldn't create, kept for reconciliation
 * (requirements 16 Oct 2026, section 08). A later successful retry closes a
 * row by itself; otherwise mark it reconciled once handled.
 */
const MetaLeadFailures = ({ isDark }) => {
  const [data, setData] = useState(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState("");

  const load = useCallback(async () => {
    try { setData(await getMetaLeadFailures()); setError(""); } catch (e) { setError(toErrorMessage(e, "Couldn't load Meta failures")); }
  }, []);
  useEffect(() => { load(); }, [load]);

  const resolve = async (row) => {
    setBusy(row._id);
    try { await resolveMetaLeadFailure(row._id, "Reconciled by hand"); await load(); } catch (e) { setError(toErrorMessage(e, "Couldn't update")); } finally { setBusy(""); }
  };

  const box = isDark ? "border-slate-700 bg-slate-900/70 text-slate-100" : "border-slate-200 bg-white text-slate-800";
  return (
    <section className={`rounded-2xl border p-4 ${box}`}>
      <div className="flex items-center gap-2">
        {data?.openCount ? <AlertTriangle size={16} className="text-amber-500" /> : <CheckCircle2 size={16} className="text-emerald-500" />}
        <h3 className="text-sm font-semibold">Meta leads that failed ({data?.openCount ?? "…"} open)</h3>
      </div>
      {error ? <p className="mt-2 text-xs text-rose-600">{error}</p> : null}
      <ul className="mt-3 space-y-2 text-xs">
        {(data?.failures || []).map((row) => (
          <li key={row._id} className={`rounded-lg border p-2.5 ${isDark ? "border-slate-700" : "border-slate-200"}`}>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="font-mono">{row.metaLeadId || "(no lead id)"} · {row.kind.replaceAll("_", " ").toLowerCase()} · {row.attempts} attempt(s)</span>
              <button type="button" disabled={busy === row._id} onClick={() => resolve(row)} className="inline-flex items-center gap-1 rounded-md border border-slate-300 px-2 py-1 font-semibold">
                {busy === row._id ? <Loader2 size={11} className="animate-spin" /> : null} Mark reconciled
              </button>
            </div>
            <p className="mt-1 break-all text-slate-500">{row.error}</p>
            <p className="text-slate-400">Last try {new Date(row.lastAttemptAt).toLocaleString("en-IN")}</p>
          </li>
        ))}
        {data && !data.failures?.length ? <li className="text-slate-500">Nothing failed. Every Meta lead reached the CRM.</li> : null}
      </ul>
    </section>
  );
};

export default MetaLeadFailures;
