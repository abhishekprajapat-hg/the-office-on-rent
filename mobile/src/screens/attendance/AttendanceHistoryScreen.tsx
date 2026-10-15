import React, { useState } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { getMyAttendance, getViolations, reviewViolation, type Violation } from "../../api/attendance";
import { errorMessage } from "../../api/client";
import { useUser } from "../../auth/AuthProvider";
import { MonthCalendar } from "../../components/MonthCalendar";
import { isoDay, minutesToClock } from "../../lib/attendanceState";
import { formatDayShort, formatTime, monthKeyOf, monthLabel, shiftMonth } from "../../lib/format";
import { isManagement } from "../../lib/roles";
import { useQuery } from "../../lib/useQuery";
import { useTheme } from "../../theme/ThemeProvider";
import type { Tone } from "../../theme/tokens";
import { Badge, Body, Button, Card, ErrorState, Field, GroupLabel, Icon, IconTile, InlineError, ListCard, Loading, MiniStat, Sheet, Text } from "../../ui";

const KIND_LABEL: Record<string, string> = { UNINFORMED: "Uninformed absence", REJECTED_LEAVE: "Absent after leave was rejected" };
const LEVEL: Record<string, { label: string; tone: Tone }> = {
  RECORDED: { label: "Recorded", tone: "neutral" },
  WARNING: { label: "Warning", tone: "warning" },
  MANAGEMENT_REVIEW: { label: "Management review", tone: "danger" },
};
const ACTIONS = [
  { key: "WARNING_ISSUED", label: "Warning issued" },
  { key: "MANAGEMENT_REVIEW", label: "Management review" },
  { key: "EXCUSED", label: "Excuse" },
] as const;

const dayOf = (key: string) => new Date(`${key}T00:00:00`);

/* Design 11: month calendar, summary, late check-ins and policy violations. Web: AttendanceHub + AttendanceViolations. */
export const AttendanceHistoryScreen = () => {
  const user = useUser();
  const { colors } = useTheme();
  const manager = isManagement(user.role);
  const current = monthKeyOf();
  const [month, setMonth] = useState(current);
  const [reviewing, setReviewing] = useState<Violation | null>(null);

  const { data, loading, error, refresh, refreshing } = useQuery(async () => {
    const [y, m] = month.split("-").map(Number);
    const from = new Date(y!, m! - 1, 1);
    const last = new Date(y!, m!, 0);
    const to = month === current ? new Date() : last;
    const [attendance, violations] = await Promise.all([
      user.role === "ADMIN" ? Promise.resolve(null) : getMyAttendance({ from: isoDay(from), to: isoDay(to), limit: 40 }),
      getViolations(month).catch(() => null),
    ]);
    return { attendance, violations };
  }, [month]);

  const [y, m] = month.split("-").map(Number);
  const policy = data?.attendance?.policy;
  const late = (data?.attendance?.days || []).filter((day) => day.isLateCheckIn || String(day.status).toUpperCase() === "LATE");
  const graceEnd = policy && typeof policy.shiftStartMinutes === "number" ? policy.shiftStartMinutes + (policy.graceMinutes || 0) : null;
  const minutesPast = (iso?: string | null) => {
    if (!iso || graceEnd === null) return null;
    const date = new Date(iso);
    return date.getHours() * 60 + date.getMinutes() - graceEnd;
  };
  const summary = data?.attendance?.summary;
  const violations = (data?.violations?.violations || []).filter((row) => row.active || manager);

  return (
    <Body refreshing={refreshing} onRefresh={refresh}>
      <Card style={styles.calendarCard}>
        <View style={styles.monthNav}>
          <Pressable accessibilityRole="button" accessibilityLabel="Previous month" hitSlop={10} onPress={() => setMonth(shiftMonth(month, -1))}>
            <Icon name="chevron-back" size={18} color={colors.textMuted} />
          </Pressable>
          <Text variant="bodyStrong" style={styles.monthTitle}>
            {monthLabel(month)}
          </Text>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Next month"
            hitSlop={10}
            disabled={month >= current}
            onPress={() => setMonth(shiftMonth(month, 1))}
            style={month >= current ? styles.disabled : undefined}
          >
            <Icon name="chevron-forward" size={18} color={colors.textMuted} />
          </Pressable>
        </View>
        {loading ? <Loading /> : <MonthCalendar bare days={data?.attendance?.days || []} month={new Date(y!, m! - 1, 1)} />}
      </Card>

      {error ? <ErrorState message={error} onRetry={refresh} /> : null}

      {summary ? (
        <View style={styles.stats}>
          <MiniStat value={summary.presentDays ?? 0} label="Present" tone="success" />
          <MiniStat value={summary.lateDays ?? 0} label="Late" tone="warning" />
          <MiniStat value={summary.leaveDays ?? 0} label="Leave" tone="primary" />
          <MiniStat value={summary.absentDays ?? 0} label="Absent" tone="danger" />
        </View>
      ) : null}

      {late.length ? (
        <>
          <GroupLabel>Late check-ins</GroupLabel>
          <ListCard>
            {late.map((day) => {
              const past = minutesPast(day.checkInAt);
              return (
                <View key={day.attendanceDate} style={styles.row}>
                  <IconTile icon="warning" tone="warning" />
                  <View style={styles.flex}>
                    <Text variant="bodyStrong" style={styles.rowTitle}>
                      Late check-in · {day.attendanceDate ? formatDayShort(dayOf(day.attendanceDate)) : ""}
                    </Text>
                    <Text variant="small" color="muted" style={styles.rowSub}>
                      {formatTime(day.checkInAt)}
                      {past && past > 0 ? ` · ${past} min past grace` : graceEnd !== null ? ` · grace ends ${minutesToClock(graceEnd)}` : ""}
                    </Text>
                  </View>
                </View>
              );
            })}
          </ListCard>
        </>
      ) : null}

      <GroupLabel>{manager ? "Team violations" : "Policy violations"}</GroupLabel>
      {violations.length ? (
        <ListCard>
          {violations.map((row) => {
            const level = LEVEL[row.level] || LEVEL.RECORDED!;
            return (
              <Pressable
                key={row._id}
                disabled={!manager}
                onPress={() => setReviewing(row)}
                accessibilityRole={manager ? "button" : undefined}
                style={({ pressed }) => [styles.row, pressed && { backgroundColor: colors.surfaceAlt }]}
              >
                <IconTile icon={row.kind === "REJECTED_LEAVE" ? "close-circle" : "alert-circle"} tone={row.excused ? "neutral" : "danger"} />
                <View style={styles.flex}>
                  <Text variant="bodyStrong" style={styles.rowTitle} numberOfLines={1}>
                    {manager && row.userName ? `${row.userName} · ` : ""}
                    {KIND_LABEL[row.kind] || row.kind}
                  </Text>
                  <Text variant="small" color="muted" style={styles.rowSub}>
                    {formatDayShort(dayOf(row.date))}
                    {row.ordinal ? ` · occurrence ${row.ordinal} this month` : ""}
                    {row.excused ? " · excused" : ""}
                  </Text>
                </View>
                <Badge label={level.label} tone={level.tone} />
              </Pressable>
            );
          })}
        </ListCard>
      ) : (
        <Card>
          <Text variant="small" color="muted">
            No violations in {monthLabel(month)}.
          </Text>
        </Card>
      )}
      {data?.violations?.policyNote ? (
        <Text variant="tiny" color="faint" style={styles.note}>
          {data.violations.policyNote}
        </Text>
      ) : null}

      <ReviewSheet violation={reviewing} onClose={() => setReviewing(null)} onDone={refresh} />
    </Body>
  );
};

/* Managers record what they did about a violation (web: AttendanceViolations review dialog). */
const ReviewSheet = ({ violation, onClose, onDone }: { violation: Violation | null; onClose: () => void; onDone: () => void }) => {
  const [action, setAction] = useState<(typeof ACTIONS)[number]["key"]>("WARNING_ISSUED");
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const save = async () => {
    if (!violation) return;
    if (!note.trim()) return setError("Add the management note.");
    setSaving(true);
    setError(null);
    try {
      await reviewViolation(violation._id, action, note);
      setNote("");
      onClose();
      onDone();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setSaving(false);
    }
  };
  return (
    <Sheet
      visible={Boolean(violation)}
      title="Review violation"
      subtitle={violation ? `${violation.userName || ""} · ${formatDayShort(dayOf(violation.date))}` : undefined}
      onClose={onClose}
      footer={
        <>
          <InlineError message={error} />
          <Button label="Save review" loading={saving} onPress={save} />
        </>
      }
    >
      <View style={styles.actions}>
        {ACTIONS.map((item) => (
          <Button key={item.key} size="sm" label={item.label} variant={action === item.key ? "soft" : "secondary"} onPress={() => setAction(item.key)} />
        ))}
      </View>
      <Field value={note} onChangeText={setNote} placeholder="Management note" multiline maxLength={1000} />
      {violation?.history?.length ? (
        <View style={styles.history}>
          {violation.history.slice(-4).map((entry, index) => (
            <Text key={index} variant="tiny" color="muted">
              {entry.action.replace(/_/g, " ").toLowerCase()}
              {entry.note ? ` — ${entry.note}` : ""}
            </Text>
          ))}
        </View>
      ) : null}
    </Sheet>
  );
};

const styles = StyleSheet.create({
  flex: { flex: 1, minWidth: 0 },
  calendarCard: { gap: 10, borderRadius: 20 },
  monthNav: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  monthTitle: { fontFamily: "PlusJakartaSans_800ExtraBold" },
  disabled: { opacity: 0.3 },
  stats: { flexDirection: "row", gap: 6 },
  row: { flexDirection: "row", alignItems: "center", gap: 12, padding: 12 },
  rowTitle: { fontSize: 13 },
  rowSub: { fontSize: 11.5 },
  note: { fontFamily: "PlusJakartaSans_400Regular", lineHeight: 15 },
  actions: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  history: { gap: 2 },
});
