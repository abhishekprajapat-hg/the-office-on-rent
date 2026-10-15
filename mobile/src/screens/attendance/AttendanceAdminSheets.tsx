import React, { useEffect, useState } from "react";
import { StyleSheet, View } from "react-native";
import { correctMemberBreak, setMemberDayStatus } from "../../api/attendance";
import { errorMessage } from "../../api/client";
import type { AttendanceDay } from "../../api/types";
import { DateTimeField } from "../../components/DateTimeField";
import { MANUAL_STATUSES, atTimeOn, isLeaveRequestDay, statusClearsCheckIn } from "../../lib/attendanceAdmin";
import { dayStatusMeta } from "../../lib/attendanceState";
import { formatDayLong, formatTime } from "../../lib/format";
import { useTheme } from "../../theme/ThemeProvider";
import { Button, Chip, Field, InlineError, Sheet, Text } from "../../ui";

export type DayTarget = { userId: string; name: string; date: string; day: AttendanceDay | null };

const dayOf = (key: string) => new Date(`${key}T00:00:00`);

/* Set one day's status for one person (web: AttendanceDayStatusDialog). The server keeps who changed it, when, and the note. */
export const DayStatusSheet = ({ target, onClose, onSaved }: { target: DayTarget | null; onClose: () => void; onSaved: (message: string) => void }) => {
  const { colors } = useTheme();
  const [status, setStatus] = useState("");
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setStatus("");
    setNote("");
    setError(null);
  }, [target]);

  const day = target?.day;
  const hasRecord = Boolean(day) && day?.source !== "NO_RECORD";
  const current = String(day?.status || "").toUpperCase();

  const save = async () => {
    if (!target || !status) return;
    setSaving(true);
    setError(null);
    try {
      const result = await setMemberDayStatus(target.userId, target.date, status, note);
      onSaved(result.message);
      onClose();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Sheet
      visible={Boolean(target)}
      title="Set attendance"
      subtitle={target ? `${target.name} · ${formatDayLong(dayOf(target.date))}` : undefined}
      onClose={onClose}
      footer={
        <>
          <InlineError message={error} />
          <Button label="Save status" loading={saving} disabled={!status} onPress={save} />
        </>
      }
    >
      <Text variant="small" color="muted">
        Currently: <Text variant="smallStrong">{hasRecord && day ? dayStatusMeta(day).label : "No record"}</Text>
      </Text>
      <View style={styles.chips}>
        {MANUAL_STATUSES.map((option) => (
          <Chip
            key={option.key}
            label={hasRecord && current === option.key ? `${option.label} · current` : option.label}
            selected={status === option.key}
            onPress={() => setStatus(option.key)}
          />
        ))}
      </View>
      {day?.checkInAt && statusClearsCheckIn(status) ? (
        <Text variant="small" color={colors.warning}>
          This removes the check-in, check-out and breaks recorded for this day.
        </Text>
      ) : null}
      {isLeaveRequestDay(day) ? (
        <Text variant="small" color="muted">
          This day is covered by an approved leave request. Changing it here does not cancel the request or return the leave balance.
        </Text>
      ) : null}
      <Field label="Note (optional)" value={note} onChangeText={setNote} placeholder="Why the change — saved with the record" multiline maxLength={240} />
    </Sheet>
  );
};

/*
 * Add a missed break or correct one (web: BreakCorrectionDialog). Times are
 * picked as times of day on the attendance date; every change records who,
 * when and why.
 */
export const BreakCorrectionSheet = ({ target, onClose, onSaved }: { target: DayTarget | null; onClose: () => void; onSaved: (message: string) => void }) => {
  const [index, setIndex] = useState<number | null>(null);
  const [startAt, setStartAt] = useState<Date | null>(null);
  const [endAt, setEndAt] = useState<Date | null>(null);
  const [reason, setReason] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const day = target?.day;
  const sessions = day?.breakSessions || [];

  const pick = (next: number | null) => {
    setIndex(next);
    const session = next === null ? null : sessions[next];
    setStartAt(session?.startAt ? new Date(session.startAt) : null);
    setEndAt(session?.endAt ? new Date(session.endAt) : null);
    setError(null);
  };

  useEffect(() => {
    pick(null);
    setReason("");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [target]);

  const save = async () => {
    if (!target || !day) return;
    if (!startAt) return setError("Pick when the break started.");
    if (day.checkOutAt && !endAt) return setError("Pick when the break ended — the day is already checked out.");
    if (!reason.trim()) return setError("Say why this break is being added or corrected.");
    const start = atTimeOn(target.date, startAt);
    const end = endAt ? atTimeOn(target.date, endAt) : null;
    if (end && end <= start) return setError("The break has to end after it starts.");
    setSaving(true);
    setError(null);
    try {
      const result = await correctMemberBreak(target.userId, target.date, {
        sessionIndex: index,
        startAt: start.toISOString(),
        endAt: end ? end.toISOString() : null,
        reason,
        expectedUpdatedAt: day.updatedAt,
      });
      onSaved(result.message);
      onClose();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Sheet
      visible={Boolean(target)}
      title="Manage breaks"
      subtitle={target ? `${target.name} · ${formatDayLong(dayOf(target.date))}` : undefined}
      onClose={onClose}
      footer={
        <>
          <InlineError message={error} />
          <Button label={index === null ? "Add break" : "Save correction"} loading={saving} onPress={save} />
        </>
      }
    >
      <View style={styles.chips}>
        <Chip label="Add missed break" selected={index === null} onPress={() => pick(null)} />
        {sessions.map((session, i) => (
          <Chip
            key={i}
            label={`Break ${i + 1} · ${formatTime(session.startAt)}–${session.endAt ? formatTime(session.endAt) : "now"}`}
            selected={index === i}
            onPress={() => pick(i)}
          />
        ))}
      </View>
      <DateTimeField label="Started" mode="time" icon="time-outline" value={startAt} onChange={setStartAt} />
      <DateTimeField label={day?.checkOutAt ? "Ended" : "Ended (leave empty if still on it)"} mode="time" icon="time-outline" value={endAt} onChange={setEndAt} clearable={!day?.checkOutAt} />
      <Text variant="tiny" color="faint">
        Checked in {formatTime(day?.checkInAt)}
        {day?.checkOutAt ? ` · out ${formatTime(day.checkOutAt)}` : ""}. The break has to sit inside the working day.
      </Text>
      <Field label="Reason" value={reason} onChangeText={setReason} placeholder="Why this break needs adding or correcting" multiline maxLength={240} />
      {day?.breakAudit?.length ? (
        <View style={styles.audit}>
          <Text variant="smallStrong">Correction history</Text>
          {[...day.breakAudit].reverse().slice(0, 5).map((entry, i) => (
            <Text key={i} variant="tiny" color="muted">
              {entry.actorName || "Manager"} · break {(entry.sessionIndex ?? 0) + 1}: {entry.reason}
            </Text>
          ))}
        </View>
      ) : null}
    </Sheet>
  );
};

const styles = StyleSheet.create({
  chips: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  audit: { gap: 3 },
});
