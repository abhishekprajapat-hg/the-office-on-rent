/*
 * Bulk lead upload in batches (13 Nov 2026).
 *
 * The sheet goes to POST /leads/bulk in small batches so the upload window can
 * show real progress ("150 of 1,000 rows done") and each request stays well
 * inside the server's 60 s limit. Results from every batch are merged into one
 * report, the same shape a single request returns.
 *
 * The same phone twice in one file is a duplicate even when the two rows land
 * in different batches, so duplicates are found across the whole file first
 * (the sheet reader has already normalised phones to 10 digits).
 *
 * Pure: no React, no network of its own - `send` does the request.
 */

export const BULK_UPLOAD_BATCH_SIZE = 50;

const describeRow = (row) => (row?.sourceRow
  ? `row ${row.sourceRow}${row.sheetName ? ` of "${row.sheetName}"` : ""}`
  : "an earlier row");

const rowOutcome = (row, status, message) => ({
  sourceRow: row?.sourceRow || null,
  sheetName: row?.sheetName || "",
  name: row?.name || "",
  phone: row?.phone || "",
  status,
  leadStatus: "",
  assignedTo: "",
  message,
});

/**
 * @param rows        parsed sheet rows
 * @param assignment  { mode, userId } for Admin / Manager, or null
 * @param send        (batchRows, assignment) => Promise<bulk upload response>
 * @param retry       (action, onWait) => Promise - wraps send (rate-limit waits)
 * @param onProgress  (patch) => void - { total, done, created, updated, failed, batchFrom, batchTo, waitSeconds }
 * @param shouldStop  () => boolean - checked before each batch
 * @param describeError (error) => string
 */
export const runBulkUploadInBatches = async ({
  rows = [],
  assignment = null,
  send,
  retry = (action) => action(),
  onProgress = () => {},
  shouldStop = () => false,
  describeError = (error) => error?.message || "the server did not accept this batch",
  batchSize = BULK_UPLOAD_BATCH_SIZE,
}) => {
  const results = [];
  const uniqueRows = [];
  const firstRowByPhone = new Map();
  rows.forEach((row) => {
    const phoneKey = String(row?.phone || "");
    const first = phoneKey ? firstRowByPhone.get(phoneKey) : null;
    if (first) {
      results.push(rowOutcome(row, "FAILED", `Duplicate: same phone number as ${describeRow(first)} in this file`));
      return;
    }
    if (phoneKey) firstRowByPhone.set(phoneKey, row);
    uniqueRows.push(row);
  });

  const totals = { created: 0, updated: 0, failed: results.length };
  const createdIds = [];
  const updatedPhones = [];
  const byUser = new Map();
  const unassignedByReason = new Map();
  const assignmentSummary = { mode: assignment?.mode || "SELF", assignedCount: 0, unassignedCount: 0, pendingCount: 0, byUser: [], unassigned: [] };
  const stoppedRows = [];
  let done = results.length;

  onProgress({ total: rows.length, done, created: 0, updated: 0, failed: totals.failed, waitSeconds: 0 });

  for (let start = 0; start < uniqueRows.length; start += batchSize) {
    const batch = uniqueRows.slice(start, start + batchSize);
    if (shouldStop()) {
      uniqueRows.slice(start).forEach((row) => stoppedRows.push({
        sheetName: row.sheetName || "",
        sourceRow: row.sourceRow || null,
        name: row.name || "",
        phone: row.phone || "",
        reason: "You stopped the upload before this row was sent",
      }));
      break;
    }
    onProgress({ batchFrom: done + 1, batchTo: Math.min(done + batch.length, rows.length), waitSeconds: 0 });

    try {
      const response = await retry(
        () => send(batch, assignment),
        (seconds) => onProgress({ waitSeconds: seconds }),
      );
      const batchRows = Array.isArray(response?.results) ? response.results : [];
      results.push(...batchRows);
      // Failures the server could not tie to a row (rare) are kept too.
      (Array.isArray(response?.failures) ? response.failures : [])
        .filter((failure) => failure?.row === "unknown")
        .forEach((failure) => results.push(rowOutcome({}, "FAILED", failure.message || "Failed")));
      totals.created += Number(response?.createdCount || 0);
      totals.updated += Number(response?.updatedCount || 0);
      totals.failed += batchRows.filter((row) => row.status === "FAILED").length;
      createdIds.push(...(response?.createdIds || []));
      updatedPhones.push(...(response?.updatedPhones || []));

      const batchAssignment = response?.assignment || {};
      if (batchAssignment.mode) assignmentSummary.mode = batchAssignment.mode;
      assignmentSummary.assignedCount += Number(batchAssignment.assignedCount || 0);
      assignmentSummary.unassignedCount += Number(batchAssignment.unassignedCount || 0);
      assignmentSummary.pendingCount += Number(batchAssignment.pendingCount || 0);
      (batchAssignment.byUser || []).forEach((row) => {
        const key = String(row.userId || row.name);
        const current = byUser.get(key) || { ...row, count: 0 };
        current.count += Number(row.count || 0);
        byUser.set(key, current);
      });
      (batchAssignment.unassigned || []).forEach((row) => {
        const current = unassignedByReason.get(row.reason) || { ...row, count: 0 };
        current.count += Number(row.count || 0);
        unassignedByReason.set(row.reason, current);
      });
    } catch (error) {
      // A batch the server did not accept: its rows are reported, the rest go on.
      const message = `Not saved: ${describeError(error)}`;
      batch.forEach((row) => results.push(rowOutcome(row, "FAILED", message)));
      totals.failed += batch.length;
    }

    done += batch.length;
    onProgress({ done, created: totals.created, updated: totals.updated, failed: totals.failed, waitSeconds: 0 });
  }

  assignmentSummary.byUser = [...byUser.values()].sort((a, b) => b.count - a.count || String(a.name).localeCompare(String(b.name)));
  assignmentSummary.unassigned = [...unassignedByReason.values()];
  // Each row needs a unique number for the report.
  results.forEach((row, index) => { row.row = index + 1; });

  return {
    totalRows: rows.length,
    createdCount: totals.created,
    updatedCount: totals.updated,
    failedCount: totals.failed,
    createdIds,
    updatedPhones,
    results,
    failures: results.filter((row) => row.status === "FAILED"),
    assignment: assignmentSummary,
    stoppedRows,
  };
};
