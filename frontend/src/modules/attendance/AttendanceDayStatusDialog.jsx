import React, { useCallback, useEffect, useRef, useState } from "react";
import { AlertTriangle } from "lucide-react";
import Modal from "../../components/ui/Modal";
import Button from "../../components/ui/Button";
import { updateUserAttendanceStatus } from "../../services/attendanceService";
import { toErrorMessage } from "../../utils/errorMessage";
import { MANUAL_ATTENDANCE_STATUS_OPTIONS, statusClearsCheckIn } from "./attendanceStatus";

const OPTION_TONES = {
  PRESENT: "border-emerald-500 bg-emerald-50 text-emerald-800 dark:bg-emerald-500/15 dark:text-emerald-200",
  HALF_DAY: "border-blue-500 bg-blue-50 text-blue-800 dark:bg-blue-500/15 dark:text-blue-200",
  ABSENT: "border-rose-500 bg-rose-50 text-rose-800 dark:bg-rose-500/15 dark:text-rose-200",
  LEAVE: "border-teal-500 bg-teal-50 text-teal-800 dark:bg-teal-500/15 dark:text-teal-200",
};

const DOT_TONES = {
  PRESENT: "bg-emerald-500",
  HALF_DAY: "bg-blue-500",
  ABSENT: "bg-rose-500",
  LEAVE: "bg-teal-500",
};

const formatLongDate = (dateKey) => {
  const [year, month, day] = String(dateKey || "").split("-").map((part) => Number.parseInt(part, 10));
  if (!year || !month || !day) return dateKey || "";
  return new Date(year, month - 1, day).toLocaleDateString("en-IN", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });
};

const formatStatus = (status) => {
  const normalized = String(status || "").toUpperCase();
  const option = MANUAL_ATTENDANCE_STATUS_OPTIONS.find((row) => row.value === normalized);
  if (option) return option.label;
  if (!normalized) return "No record";
  return normalized.charAt(0) + normalized.slice(1).toLowerCase().replaceAll("_", " ");
};

/*
 * Set one day's status for one person, from their attendance calendar.
 *
 * The daily board already does this for a single date; this is the same call
 * reached from a month view, which is where somebody is when they notice last
 * Tuesday is wrong. The server keeps who changed it and when, plus the note.
 */
export default function AttendanceDayStatusDialog({ userId, userName, dateKey, row, onClose, onSaved }) {
  const [status, setStatus] = useState("");
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const currentStatus = String(row?.status || "").toUpperCase();
  const hasRecord = Boolean(row) && row.source !== "NO_RECORD";
  const hasCheckIn = Boolean(row?.checkInAt);
  // A day covered by an approved leave request comes back with a synthetic id.
  const fromLeaveRequest = String(row?._id || "").startsWith("leave:");

  /*
   * Stable on purpose: Modal re-runs its focus effect whenever onClose changes,
   * and a fresh function each render would pull focus out of the note field on
   * every keystroke.
   */
  const savingRef = useRef(false);
  const onCloseRef = useRef(onClose);
  useEffect(() => { onCloseRef.current = onClose; }, [onClose]);
  const close = useCallback(() => {
    if (!savingRef.current) onCloseRef.current();
  }, []);

  const submit = async () => {
    if (!status || savingRef.current) return;
    savingRef.current = true;
    setSaving(true);
    setError("");
    try {
      const result = await updateUserAttendanceStatus(userId, dateKey, { status, note: note.trim() });
      onSaved(result);
    } catch (saveError) {
      setError(toErrorMessage(saveError, "Failed to update attendance status"));
      savingRef.current = false;
      setSaving(false);
    }
  };

  return (
    <Modal
      open
      size="sm"
      title="Set attendance"
      description={`${userName || "Employee"} · ${formatLongDate(dateKey)}`}
      onClose={close}
      footer={(
        <>
          <Button variant="secondary" onClick={close} disabled={saving}>Cancel</Button>
          <Button onClick={submit} disabled={!status || saving}>
            {saving ? "Saving…" : "Save status"}
          </Button>
        </>
      )}
    >
      <p className="text-[13px] text-slate-500 dark:text-slate-400">
        Currently:{" "}
        <span className="font-semibold text-slate-800 dark:text-slate-100">
          {hasRecord ? formatStatus(currentStatus) : "No record"}
        </span>
      </p>

      <div role="radiogroup" aria-label="Attendance status" className="mt-3 grid grid-cols-2 gap-2">
        {MANUAL_ATTENDANCE_STATUS_OPTIONS.map((option) => {
          const selected = status === option.value;
          return (
            <button
              key={option.value}
              type="button"
              role="radio"
              aria-checked={selected}
              disabled={saving}
              onClick={() => setStatus(option.value)}
              className={`flex h-11 items-center gap-2 rounded-lg border px-3 text-left text-[13px] font-semibold transition disabled:opacity-60 ${
                selected
                  ? OPTION_TONES[option.value]
                  : "border-slate-200 bg-white text-slate-700 hover:border-slate-300 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
              }`}
            >
              <span aria-hidden="true" className={`h-2 w-2 shrink-0 rounded-full ${DOT_TONES[option.value]}`} />
              {option.label}
              {hasRecord && currentStatus === option.value ? (
                <span className="ml-auto text-[10px] font-medium uppercase tracking-wide opacity-60">Current</span>
              ) : null}
            </button>
          );
        })}
      </div>

      {hasCheckIn && statusClearsCheckIn(status) ? (
        <p className="mt-3 flex gap-2 rounded-lg border border-amber-200 bg-amber-50 p-2.5 text-[12px] text-amber-800 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-200">
          <AlertTriangle aria-hidden="true" size={14} className="mt-0.5 shrink-0" />
          This removes the check-in, check-out and breaks recorded for this day.
        </p>
      ) : null}

      {fromLeaveRequest ? (
        <p className="mt-3 rounded-lg border border-slate-200 bg-slate-50 p-2.5 text-[12px] text-slate-600 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300">
          This day is covered by an approved leave request. Changing it here does not cancel the request or return the leave balance.
        </p>
      ) : null}

      <label className="mt-3 block text-[13px] font-semibold text-slate-700 dark:text-slate-200">
        Note <span className="font-normal text-slate-400">(optional)</span>
        <textarea
          value={note}
          maxLength={240}
          rows={2}
          disabled={saving}
          onChange={(event) => setNote(event.target.value)}
          placeholder="Why the change - saved with the record"
          className="mt-1 w-full resize-none rounded-lg border border-slate-300 bg-white px-3 py-2 text-[13px] font-normal text-slate-900 outline-none focus:border-blue-500 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
        />
      </label>

      {error ? (
        <p role="alert" className="mt-3 rounded-lg border border-rose-200 bg-rose-50 p-2.5 text-[12px] text-rose-700 dark:border-rose-500/30 dark:bg-rose-500/10 dark:text-rose-200">
          {error}
        </p>
      ) : null}
    </Modal>
  );
}
