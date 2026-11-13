import React, { useMemo, useState } from "react";
import { AlertTriangle, CheckCircle2, Clock3, Download, FileWarning, Loader2, RefreshCw, Search, UserCheck, XCircle } from "lucide-react";

/*
 * Bulk lead upload: what is going to happen (file check, before upload) and
 * what happened (report, after upload) - row by row, with the reason for every
 * row that was not created.
 *
 * report = the POST /leads/bulk response plus { skipped, fileName, sheetLabel, uploadedAt }:
 *   results[]  one per uploaded row: { row, sourceRow, sheetName, name, phone,
 *              status CREATED|UPDATED|FAILED, leadStatus, assignedTo, message }
 *   skipped[]  rows the file reader could not use: { sheetName, sourceRow, name, phone, reason }
 */

const RESULT_META = {
  CREATED: { label: "Created", light: "bg-emerald-50 text-emerald-700 ring-emerald-200", dark: "bg-emerald-500/15 text-emerald-300 ring-emerald-500/30" },
  UPDATED: { label: "Updated", light: "bg-sky-50 text-sky-700 ring-sky-200", dark: "bg-sky-500/15 text-sky-300 ring-sky-500/30" },
  FAILED: { label: "Failed", light: "bg-rose-50 text-rose-700 ring-rose-200", dark: "bg-rose-500/15 text-rose-300 ring-rose-500/30" },
  SKIPPED: { label: "Skipped", light: "bg-amber-50 text-amber-800 ring-amber-200", dark: "bg-amber-500/15 text-amber-300 ring-amber-500/30" },
};
const FILTERS = ["ALL", "CREATED", "UPDATED", "FAILED", "SKIPPED"];
const MAX_VISIBLE_ROWS = 300;

const prettyStatus = (value) => String(value || "")
  .replace(/_/g, " ")
  .toLowerCase()
  .replace(/\b\w/g, (letter) => letter.toUpperCase());

const describeSheetRow = (row) => {
  if (!row?.sourceRow) return row?.sheetName ? `Sheet "${row.sheetName}"` : "-";
  return row.sheetName && row.sheetName !== "CSV" ? `${row.sheetName} · row ${row.sourceRow}` : `Row ${row.sourceRow}`;
};

// Excel opens a UTF-8 CSV correctly only with a byte-order mark.
const BOM = String.fromCharCode(0xfeff);

const csvCell = (value) => {
  const text = String(value ?? "");
  return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
};

const buildReportRows = (report) => {
  const uploaded = (Array.isArray(report?.results) ? report.results : []).map((row) => ({ ...row, key: `r-${row.row}` }));
  const skipped = (Array.isArray(report?.skipped) ? report.skipped : []).map((row, index) => ({
    key: `s-${index}`,
    sheetName: row.sheetName,
    sourceRow: row.sourceRow,
    name: row.name,
    phone: row.phone,
    status: "SKIPPED",
    leadStatus: "",
    assignedTo: "",
    message: `Not uploaded: ${row.reason}`,
  }));
  // Sheet order, then spreadsheet row order; whole-sheet notes go last.
  return [...uploaded, ...skipped].sort((a, b) => {
    if (Boolean(a.sourceRow) !== Boolean(b.sourceRow)) return a.sourceRow ? -1 : 1;
    const sheetA = String(a.sheetName || "");
    const sheetB = String(b.sheetName || "");
    if (sheetA !== sheetB) return sheetA.localeCompare(sheetB);
    return (a.sourceRow || 0) - (b.sourceRow || 0);
  });
};

const downloadReportCsv = (rows, report) => {
  const header = ["Sheet", "Row", "Name", "Phone", "Result", "Lead status", "Assigned to", "Details"];
  const lines = [header, ...rows.map((row) => [
    row.sheetName || "",
    row.sourceRow || "",
    row.name || "",
    row.phone || "",
    RESULT_META[row.status]?.label || row.status,
    prettyStatus(row.leadStatus),
    row.assignedTo || "",
    row.message || "",
  ])].map((line) => line.map(csvCell).join(","));
  const blob = new Blob([`${BOM}${lines.join("\r\n")}`], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  const base = String(report?.fileName || "bulk-upload").replace(/\.[^.]+$/, "").replace(/[^\w-]+/g, "_");
  link.href = url;
  link.download = `${base}-upload-report.csv`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
};

const Badge = ({ status, isDark }) => {
  const meta = RESULT_META[status] || RESULT_META.FAILED;
  return (
    <span className={`inline-flex whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] font-semibold ring-1 ${isDark ? meta.dark : meta.light}`}>
      {meta.label}
    </span>
  );
};

/* Before upload: how many rows are ready and which ones will be left out. */
export const BulkUploadFileCheck = ({ isDark, readyCount = null, skipped = [], parseError = "" }) => {
  if (readyCount === null && !parseError && !skipped.length) return null;
  const rowsOnly = skipped.filter((row) => row.sourceRow);
  const sheetNotes = skipped.filter((row) => !row.sourceRow);
  const tone = parseError
    ? (isDark ? "border-rose-500/40 bg-rose-500/10 text-rose-200" : "border-rose-200 bg-rose-50 text-rose-800")
    : skipped.length
      ? (isDark ? "border-amber-500/40 bg-amber-500/10 text-amber-100" : "border-amber-200 bg-amber-50 text-amber-900")
      : (isDark ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-200" : "border-emerald-200 bg-emerald-50 text-emerald-800");

  return (
    <div className={`rounded-xl border px-3 py-2.5 text-sm ${tone}`}>
      <p className="flex items-start gap-2 font-semibold">
        {parseError ? <XCircle size={16} className="mt-0.5 shrink-0" /> : skipped.length ? <AlertTriangle size={16} className="mt-0.5 shrink-0" /> : <CheckCircle2 size={16} className="mt-0.5 shrink-0" />}
        <span>
          {parseError || `${readyCount} row${readyCount === 1 ? "" : "s"} ready to upload`}
          {!parseError && rowsOnly.length ? ` · ${rowsOnly.length} row${rowsOnly.length === 1 ? "" : "s"} will be skipped` : ""}
          {!parseError && sheetNotes.length ? ` · ${sheetNotes.length} sheet${sheetNotes.length === 1 ? "" : "s"} not read` : ""}
        </span>
      </p>
      {skipped.length ? (
        <ul className="mt-2 max-h-40 space-y-1 overflow-y-auto pl-6 text-xs font-normal">
          {skipped.slice(0, 100).map((row, index) => (
            <li key={index}>
              <span className="font-semibold">{describeSheetRow(row)}</span>
              {row.name ? ` · ${row.name}` : ""} - {row.reason}
            </li>
          ))}
          {skipped.length > 100 ? <li>…and {skipped.length - 100} more (all are listed in the report after upload)</li> : null}
        </ul>
      ) : null}
    </div>
  );
};

/*
 * During upload: rows go to the server in batches, so progress is real -
 * "150 of 1,000 rows done", live counts, and a Stop that finishes the batch
 * in flight and leaves the rest unsent.
 *
 * progress = { total, done, created, updated, failed, batchFrom, batchTo,
 *              waitSeconds, stopRequested }
 */
export const BulkUploadProgress = ({ isDark, progress, onStop }) => {
  const total = Math.max(0, Number(progress?.total || 0));
  const done = Math.min(total, Math.max(0, Number(progress?.done || 0)));
  const remaining = Math.max(0, total - done);
  const percent = total ? Math.round((done / total) * 100) : 0;
  const muted = isDark ? "text-slate-400" : "text-slate-500";
  const panel = isDark ? "border-slate-700 bg-slate-950 text-slate-200" : "border-slate-200 bg-slate-50 text-slate-800";
  const tiles = [
    { label: "New leads", value: progress?.created || 0, tone: isDark ? "text-emerald-300" : "text-emerald-700" },
    { label: "Existing updated", value: progress?.updated || 0, tone: isDark ? "text-sky-300" : "text-sky-700" },
    { label: "Failed", value: progress?.failed || 0, tone: isDark ? "text-rose-300" : "text-rose-700" },
    { label: "Remaining", value: remaining, tone: isDark ? "text-slate-100" : "text-slate-900" },
  ];

  return (
    <div className="space-y-4 py-2">
      <div>
        <div className="mb-1.5 flex items-baseline justify-between gap-3 text-sm">
          <span className={`font-semibold ${isDark ? "text-slate-100" : "text-slate-900"}`}>
            {done.toLocaleString("en-IN")} of {total.toLocaleString("en-IN")} rows done
          </span>
          <span className={muted}>{remaining.toLocaleString("en-IN")} remaining · {percent}%</span>
        </div>
        <div className={`h-3 overflow-hidden rounded-full ${isDark ? "bg-slate-800" : "bg-slate-200"}`}>
          <div className="h-full rounded-full bg-cyan-500 transition-[width] duration-300" style={{ width: `${percent}%` }} />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {tiles.map((tile) => (
          <div key={tile.label} className={`rounded-xl border px-3 py-2 ${panel}`}>
            <span className={`block text-xl font-bold ${tile.tone}`}>{tile.value.toLocaleString("en-IN")}</span>
            <span className={`block text-[11px] font-semibold ${muted}`}>{tile.label}</span>
          </div>
        ))}
      </div>

      <p className={`flex items-center gap-2 overflow-hidden text-xs ${muted}`}>
        {progress?.waitSeconds ? <Clock3 size={14} className="shrink-0" /> : <Loader2 size={14} className="shrink-0 animate-spin" />}
        {progress?.waitSeconds
          ? `The server asked us to slow down. Waiting ${progress.waitSeconds}s, then continuing…`
          : progress?.stopRequested
            ? "Stopping after this batch…"
            : progress?.batchFrom
              ? `Saving rows ${progress.batchFrom.toLocaleString("en-IN")}–${progress.batchTo.toLocaleString("en-IN")} of ${total.toLocaleString("en-IN")} and assigning them…`
              : "Starting…"}
      </p>

      <p className={`text-xs ${muted}`}>Keep this window open until the upload finishes. The full report opens here when it is done.</p>

      <button
        type="button"
        onClick={onStop}
        disabled={progress?.stopRequested}
        className={`h-10 w-full rounded-lg text-sm font-semibold disabled:opacity-60 ${isDark ? "bg-slate-800 text-slate-200 hover:bg-slate-700" : "bg-slate-100 text-slate-700 hover:bg-slate-200"}`}
      >
        {progress?.stopRequested ? "Stopping…" : "Stop upload"}
      </button>
    </div>
  );
};

/* After upload: everything that happened, row by row. */
const BulkUploadReport = ({ isDark, report, onUploadAnother, onClose }) => {
  const [filter, setFilter] = useState("ALL");
  const [query, setQuery] = useState("");
  const allRows = useMemo(() => buildReportRows(report), [report]);
  const counts = useMemo(() => {
    const next = { ALL: allRows.length, CREATED: 0, UPDATED: 0, FAILED: 0, SKIPPED: 0 };
    allRows.forEach((row) => { next[row.status] = (next[row.status] || 0) + 1; });
    return next;
  }, [allRows]);
  const failureReasons = useMemo(() => {
    const byReason = new Map();
    allRows
      .filter((row) => row.status === "FAILED" || row.status === "SKIPPED")
      .forEach((row) => {
        const reason = row.status === "SKIPPED" ? row.message.replace(/^Not uploaded: /, "") : row.message || "Failed";
        // Group "Same phone number as row 12" style messages under one heading.
        const key = reason.replace(/row \d+( of "[^"]*")?/g, "an earlier row").replace(/"[^"]*" is not a valid/, "Not a valid");
        byReason.set(key, (byReason.get(key) || 0) + 1);
      });
    return [...byReason.entries()].sort((a, b) => b[1] - a[1]);
  }, [allRows]);
  const visibleRows = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return allRows.filter((row) => (filter === "ALL" || row.status === filter)
      && (!needle || [row.name, row.phone, row.message, row.assignedTo, row.sheetName, row.sourceRow]
        .some((value) => String(value ?? "").toLowerCase().includes(needle))));
  }, [allRows, filter, query]);

  const sheetsNotRead = allRows.filter((row) => row.status === "SKIPPED" && !row.sourceRow).length;
  const skippedRowCount = counts.SKIPPED - sheetsNotRead;
  const assignment = report?.assignment || {};
  const muted = isDark ? "text-slate-400" : "text-slate-500";
  const panel = isDark ? "border-slate-700 bg-slate-950 text-slate-200" : "border-slate-200 bg-slate-50 text-slate-800";
  const tiles = [
    { key: "ALL", label: "Rows in file", value: counts.ALL - sheetsNotRead, tone: isDark ? "text-slate-100" : "text-slate-900" },
    { key: "CREATED", label: "New leads", value: counts.CREATED, tone: isDark ? "text-emerald-300" : "text-emerald-700" },
    { key: "UPDATED", label: "Existing updated", value: counts.UPDATED, tone: isDark ? "text-sky-300" : "text-sky-700" },
    { key: "FAILED", label: "Failed", value: counts.FAILED, tone: isDark ? "text-rose-300" : "text-rose-700" },
    {
      key: "SKIPPED",
      label: sheetsNotRead ? `Skipped rows · ${sheetsNotRead} sheet${sheetsNotRead === 1 ? "" : "s"} not read` : "Skipped (not uploaded)",
      value: skippedRowCount,
      tone: isDark ? "text-amber-300" : "text-amber-700",
    },
  ];
  const modeLabel = assignment.mode === "SELF"
    ? "New leads were assigned to you"
    : assignment.mode === "USER"
      ? "Assigned to one person"
      : "Auto-assigned by workload";

  return (
    <div className="space-y-3">
      <div className={`text-xs ${muted}`}>
        {report?.fileName ? <span className="font-semibold">{report.fileName}</span> : "Pasted CSV"}
        {report?.sheetLabel ? ` · ${report.sheetLabel} sheet` : ""}
        {report?.uploadedAt ? ` · uploaded ${new Date(report.uploadedAt).toLocaleString()}` : ""}
      </div>

      {report?.stopped ? (
        <p className={`rounded-xl border px-3 py-2 text-sm ${isDark ? "border-amber-500/30 bg-amber-500/10 text-amber-100" : "border-amber-200 bg-amber-50 text-amber-900"}`}>
          You stopped the upload. Rows that were not sent are listed as Skipped - upload the file again to add them (rows already saved are updated, not duplicated).
        </p>
      ) : null}

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
        {tiles.map((tile) => (
          <button
            key={tile.key}
            type="button"
            onClick={() => setFilter(tile.key)}
            className={`rounded-xl border px-3 py-2 text-left transition ${panel} ${filter === tile.key ? "ring-2 ring-cyan-500/60" : ""}`}
          >
            <span className={`block text-xl font-bold ${tile.tone}`}>{tile.value}</span>
            <span className={`block text-[11px] font-semibold ${muted}`}>{tile.label}</span>
          </button>
        ))}
      </div>

      {Number(report?.createdCount || 0) > 0 ? (
        <div className={`rounded-xl border px-3 py-2.5 text-sm ${panel}`}>
          <p className="flex items-center gap-2 font-semibold"><UserCheck size={15} /> {modeLabel}</p>
          {Array.isArray(assignment.byUser) && assignment.byUser.length ? (
            <div className="mt-2 flex flex-wrap gap-1.5">
              {assignment.byUser.map((row) => (
                <span key={row.userId || row.name} className={`rounded-full px-2.5 py-1 text-xs font-semibold ${isDark ? "bg-slate-800 text-slate-200" : "bg-white text-slate-700 ring-1 ring-slate-200"}`}>
                  {row.name} · {row.count}
                </span>
              ))}
            </div>
          ) : null}
          {(assignment.unassigned || []).map((row) => (
            <p key={row.reason} className={`mt-2 text-xs ${isDark ? "text-amber-300" : "text-amber-800"}`}>
              {row.count} left unassigned: {row.message}. Assign them from the Unassigned tab.
            </p>
          ))}
          {assignment.pendingCount ? (
            <p className={`mt-2 text-xs ${muted}`}>{assignment.pendingCount} more are still being assigned in the background. Refresh in a minute.</p>
          ) : null}
        </div>
      ) : null}

      {failureReasons.length ? (
        <div className={`rounded-xl border px-3 py-2.5 text-sm ${isDark ? "border-rose-500/30 bg-rose-500/10 text-rose-100" : "border-rose-200 bg-rose-50 text-rose-900"}`}>
          <p className="flex items-center gap-2 font-semibold"><FileWarning size={15} /> Why rows were not added</p>
          <ul className="mt-1.5 space-y-1 text-xs">
            {failureReasons.slice(0, 8).map(([reason, count]) => (
              <li key={reason}><span className="font-semibold">{count} ×</span> {reason}</li>
            ))}
          </ul>
        </div>
      ) : null}

      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <div className="flex flex-wrap gap-1.5">
          {FILTERS.map((key) => (
            <button
              key={key}
              type="button"
              onClick={() => setFilter(key)}
              className={`rounded-full px-3 py-1 text-xs font-semibold ${
                filter === key
                  ? (isDark ? "bg-cyan-600 text-white" : "bg-slate-900 text-white")
                  : (isDark ? "bg-slate-800 text-slate-300" : "bg-slate-100 text-slate-600")
              }`}
            >
              {key === "ALL" ? "All" : RESULT_META[key].label} {counts[key] || 0}
            </button>
          ))}
        </div>
        <label className={`flex h-9 flex-1 items-center gap-2 rounded-lg border px-2.5 ${isDark ? "border-slate-700 bg-slate-950" : "border-slate-300 bg-white"}`}>
          <Search size={14} className={muted} />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search name, phone, reason, row…"
            className={`w-full bg-transparent text-sm outline-none ${isDark ? "text-slate-200 placeholder:text-slate-500" : "text-slate-700 placeholder:text-slate-400"}`}
          />
        </label>
      </div>

      <div className={`max-h-[42vh] overflow-auto rounded-xl border ${isDark ? "border-slate-700" : "border-slate-200"}`}>
        <table className="w-full min-w-[760px] text-left text-xs">
          <thead className={`sticky top-0 ${isDark ? "bg-slate-900 text-slate-400" : "bg-slate-100 text-slate-500"}`}>
            <tr>
              {["Row", "Name", "Phone", "Result", "Lead status", "Assigned to", "Details"].map((heading) => (
                <th key={heading} className="px-2.5 py-2 font-semibold uppercase tracking-[0.06em]">{heading}</th>
              ))}
            </tr>
          </thead>
          <tbody className={isDark ? "divide-y divide-slate-800 text-slate-200" : "divide-y divide-slate-100 text-slate-700"}>
            {visibleRows.slice(0, MAX_VISIBLE_ROWS).map((row) => (
              <tr key={row.key} className="align-top">
                <td className={`whitespace-nowrap px-2.5 py-2 ${muted}`}>{describeSheetRow(row)}</td>
                <td className="px-2.5 py-2 font-semibold">{row.name || "-"}</td>
                <td className="whitespace-nowrap px-2.5 py-2">{row.phone || "-"}</td>
                <td className="px-2.5 py-2"><Badge status={row.status} isDark={isDark} /></td>
                <td className="whitespace-nowrap px-2.5 py-2">{prettyStatus(row.leadStatus) || "-"}</td>
                <td className="whitespace-nowrap px-2.5 py-2">{row.assignedTo || "-"}</td>
                <td className={`px-2.5 py-2 ${row.status === "FAILED" ? (isDark ? "text-rose-300" : "text-rose-700") : row.status === "SKIPPED" ? (isDark ? "text-amber-300" : "text-amber-800") : ""}`}>
                  {row.message || "-"}
                </td>
              </tr>
            ))}
            {!visibleRows.length ? (
              <tr><td colSpan={7} className={`px-2.5 py-6 text-center ${muted}`}>No rows match.</td></tr>
            ) : null}
          </tbody>
        </table>
      </div>
      {visibleRows.length > MAX_VISIBLE_ROWS ? (
        <p className={`text-xs ${muted}`}>Showing the first {MAX_VISIBLE_ROWS} of {visibleRows.length}. Download the report to see every row.</p>
      ) : null}

      <div className="flex flex-col gap-2 sm:flex-row">
        <button
          type="button"
          onClick={() => downloadReportCsv(allRows, report)}
          className={`inline-flex h-10 flex-1 items-center justify-center gap-2 rounded-lg border text-sm font-semibold ${isDark ? "border-slate-700 text-slate-200 hover:bg-slate-800" : "border-slate-300 text-slate-700 hover:bg-slate-50"}`}
        >
          <Download size={15} /> Download report (CSV)
        </button>
        <button
          type="button"
          onClick={onUploadAnother}
          className={`inline-flex h-10 flex-1 items-center justify-center gap-2 rounded-lg text-sm font-semibold ${isDark ? "bg-slate-800 text-slate-200 hover:bg-slate-700" : "bg-slate-100 text-slate-700 hover:bg-slate-200"}`}
        >
          <RefreshCw size={15} /> Upload another file
        </button>
        <button
          type="button"
          onClick={onClose}
          className={`h-10 flex-1 rounded-lg text-sm font-semibold text-white ${isDark ? "bg-cyan-600 hover:bg-cyan-500" : "bg-slate-900 hover:bg-cyan-600"}`}
        >
          Done
        </button>
      </div>
    </div>
  );
};

export default BulkUploadReport;
