import React, { useMemo } from "react";
import { AlertTriangle, CheckCircle2, Clock3, Loader2, Trash2, XCircle } from "lucide-react";

/*
 * Bulk delete, start to finish, in one dialog:
 *   confirm  -> what will be deleted and what will be skipped (and why)
 *   running  -> "10 of 100 done · 90 remaining", live counts, Stop
 *   done     -> how many were deleted, and every lead that was not, with the reason
 *
 * run = {
 *   phase: "confirm" | "running" | "done",
 *   needsApproval,            // a Manager's delete becomes an Admin approval request
 *   items: [{ id, name, phone, status, message }],
 *            status: PENDING | DELETED | APPROVAL | NOT_DELETED | STOPPED
 *   current,                  // name of the lead being processed
 *   waitSeconds,              // > 0 while waiting out the server's rate limit
 *   stopRequested, stopped,
 * }
 */

const isNotDeleted = (item) => item.status === "NOT_DELETED" || item.status === "STOPPED";

const BulkDeleteDialog = ({ run, onConfirm, onStop, onClose }) => {
  const counts = useMemo(() => {
    const next = { total: run.items.length, PENDING: 0, DELETED: 0, APPROVAL: 0, NOT_DELETED: 0, STOPPED: 0 };
    run.items.forEach((item) => { next[item.status] = (next[item.status] || 0) + 1; });
    return next;
  }, [run.items]);
  // Leads skipped before starting (closed deals) are known up front; the rest are worked through.
  const toProcess = run.items.filter((item) => !item.preSkipped).length;
  const processed = run.items.filter((item) => !item.preSkipped && item.status !== "PENDING").length;
  const remaining = Math.max(0, toProcess - processed);
  const percent = toProcess ? Math.round((processed / toProcess) * 100) : 100;
  const notDeleted = run.items.filter(isNotDeleted);
  const reasons = useMemo(() => {
    const byReason = new Map();
    notDeleted.forEach((item) => byReason.set(item.message, (byReason.get(item.message) || 0) + 1));
    return [...byReason.entries()].sort((a, b) => b[1] - a[1]);
  }, [notDeleted]);
  const verb = run.needsApproval ? "Sent for approval" : "Deleted";
  const doneCount = run.needsApproval ? counts.APPROVAL : counts.DELETED;

  const tile = (label, value, tone) => (
    <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 dark:border-slate-700 dark:bg-slate-950">
      <span className={`block text-xl font-bold ${tone}`}>{value}</span>
      <span className="block text-[11px] font-semibold text-slate-500 dark:text-slate-400">{label}</span>
    </div>
  );

  const notDeletedList = (title, reasonHeading = "Why it was not deleted") => (notDeleted.length ? (
    <div className="space-y-2">
      <div className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2.5 text-sm text-rose-900 dark:border-rose-500/30 dark:bg-rose-500/10 dark:text-rose-100">
        <p className="flex items-center gap-2 font-semibold"><AlertTriangle size={15} /> {title}</p>
        <ul className="mt-1.5 space-y-1 text-xs">
          {reasons.map(([reason, count]) => (
            <li key={reason}><span className="font-semibold">{count} ×</span> {reason}</li>
          ))}
        </ul>
      </div>
      <div className="max-h-56 overflow-auto rounded-xl border border-slate-200 dark:border-slate-700">
        <table className="w-full text-left text-xs">
          <thead className="sticky top-0 bg-slate-100 text-slate-500 dark:bg-slate-900 dark:text-slate-400">
            <tr>
              <th className="px-2.5 py-2 font-semibold uppercase tracking-[0.06em]">Lead</th>
              <th className="px-2.5 py-2 font-semibold uppercase tracking-[0.06em]">Phone</th>
              <th className="px-2.5 py-2 font-semibold uppercase tracking-[0.06em]">{reasonHeading}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 text-slate-700 dark:divide-slate-800 dark:text-slate-200">
            {notDeleted.map((item) => (
              <tr key={item.id} className="align-top">
                <td className="px-2.5 py-2 font-semibold">{item.name || "Lead"}</td>
                <td className="whitespace-nowrap px-2.5 py-2">{item.phone || "-"}</td>
                <td className="px-2.5 py-2 text-rose-700 dark:text-rose-300">{item.message}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  ) : null);

  let title = "";
  let body = null;
  let footer = null;

  if (run.phase === "confirm") {
    const willProcess = toProcess;
    title = run.needsApproval
      ? `Ask an Admin to delete ${willProcess} lead${willProcess === 1 ? "" : "s"}?`
      : `Delete ${willProcess} lead${willProcess === 1 ? "" : "s"}?`;
    body = (
      <div className="space-y-3">
        {willProcess ? (
          <p className="text-sm text-slate-600 dark:text-slate-300">
            {run.needsApproval
              ? "Each lead stays until an Admin approves its delete request."
              : "They are removed permanently with their activity and diary notes. This cannot be undone."}
          </p>
        ) : (
          <p className="text-sm text-slate-600 dark:text-slate-300">None of the selected leads can be deleted.</p>
        )}
        {notDeletedList(`${notDeleted.length} lead${notDeleted.length === 1 ? "" : "s"} will be skipped`, "Why it will be skipped")}
      </div>
    );
    footer = (
      <>
        <button type="button" onClick={onClose} className="h-10 flex-1 rounded-lg bg-slate-100 text-sm font-semibold text-slate-700 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700">
          {willProcess ? "Cancel" : "Close"}
        </button>
        {willProcess ? (
          <button type="button" onClick={onConfirm} className="inline-flex h-10 flex-1 items-center justify-center gap-2 rounded-lg bg-rose-600 text-sm font-semibold text-white hover:bg-rose-700">
            <Trash2 size={15} /> {run.needsApproval ? `Request delete of ${willProcess}` : `Delete ${willProcess} lead${willProcess === 1 ? "" : "s"}`}
          </button>
        ) : null}
      </>
    );
  } else if (run.phase === "running") {
    title = run.needsApproval ? "Sending delete requests…" : "Deleting leads…";
    body = (
      <div className="space-y-3">
        <div>
          <div className="mb-1.5 flex items-baseline justify-between text-sm">
            <span className="font-semibold text-slate-900 dark:text-slate-100">{processed} of {toProcess} done</span>
            <span className="text-slate-500 dark:text-slate-400">{remaining} remaining · {percent}%</span>
          </div>
          <div className="h-2.5 overflow-hidden rounded-full bg-slate-200 dark:bg-slate-800">
            <div className="h-full rounded-full bg-rose-500 transition-[width] duration-300" style={{ width: `${percent}%` }} />
          </div>
        </div>
        <div className="grid grid-cols-3 gap-2">
          {tile(verb, doneCount, "text-emerald-700 dark:text-emerald-300")}
          {tile("Not deleted", counts.NOT_DELETED, "text-rose-700 dark:text-rose-300")}
          {tile("Remaining", remaining, "text-slate-900 dark:text-slate-100")}
        </div>
        <p className="flex items-center gap-2 overflow-hidden text-xs text-slate-500 dark:text-slate-400">
          {run.waitSeconds ? <Clock3 size={14} className="shrink-0" /> : <Loader2 size={14} className="shrink-0 animate-spin" />}
          {run.waitSeconds
            ? `The server asked us to slow down. Waiting ${run.waitSeconds}s, then continuing…`
            : run.stopRequested
              ? "Stopping after this lead…"
              : run.current ? `Now: ${run.current}` : "Starting…"}
        </p>
      </div>
    );
    footer = (
      <button type="button" onClick={onStop} disabled={run.stopRequested} className="h-10 flex-1 rounded-lg bg-slate-100 text-sm font-semibold text-slate-700 hover:bg-slate-200 disabled:opacity-60 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700">
        {run.stopRequested ? "Stopping…" : "Stop"}
      </button>
    );
  } else {
    title = run.stopped ? "Deletion stopped" : run.needsApproval ? "Delete requests sent" : "Deletion finished";
    body = (
      <div className="space-y-3">
        <p className={`flex items-start gap-2 rounded-xl border px-3 py-2.5 text-sm ${
          notDeleted.length
            ? "border-amber-200 bg-amber-50 text-amber-900 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-100"
            : "border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-200"
        }`}
        >
          {notDeleted.length ? <XCircle size={16} className="mt-0.5 shrink-0" /> : <CheckCircle2 size={16} className="mt-0.5 shrink-0" />}
          <span>
            {run.needsApproval
              ? `${counts.APPROVAL} of ${counts.total} sent to an Admin for approval`
              : `${counts.DELETED} of ${counts.total} deleted`}
            {counts.DELETED && run.needsApproval ? ` · ${counts.DELETED} deleted` : ""}
            {notDeleted.length ? ` · ${notDeleted.length} not deleted (reasons below)` : ""}
          </span>
        </p>
        <div className="grid grid-cols-3 gap-2">
          {tile("Selected", counts.total, "text-slate-900 dark:text-slate-100")}
          {tile(verb, doneCount, "text-emerald-700 dark:text-emerald-300")}
          {tile("Not deleted", notDeleted.length, "text-rose-700 dark:text-rose-300")}
        </div>
        {notDeletedList("Why some leads were not deleted")}
      </div>
    );
    footer = (
      <button type="button" onClick={onClose} className="h-10 flex-1 rounded-lg bg-slate-900 text-sm font-semibold text-white hover:bg-slate-800 dark:bg-cyan-600 dark:hover:bg-cyan-500">
        Done
      </button>
    );
  }

  return (
    <div className="fixed inset-0 z-[120] flex items-center justify-center bg-slate-950/50 p-4" role="presentation">
      <div role="dialog" aria-modal="true" aria-label={title} className="flex max-h-[92vh] w-full max-w-2xl flex-col rounded-2xl border border-slate-200 bg-white p-5 shadow-2xl dark:border-slate-700 dark:bg-slate-900">
        <h2 className="text-lg font-bold text-slate-900 dark:text-slate-100">{title}</h2>
        <div className="mt-3 flex-1 overflow-y-auto">{body}</div>
        <div className="mt-4 flex gap-2">{footer}</div>
      </div>
    </div>
  );
};

export default BulkDeleteDialog;
