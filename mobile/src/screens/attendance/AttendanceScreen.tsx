import React, { useEffect, useRef, useState } from "react";
import { StyleSheet, View } from "react-native";
import { useNavigation } from "@react-navigation/native";
import { checkIn, checkOut, endBreak, getMyAttendance, startBreak, type GeoPoint } from "../../api/attendance";
import { errorMessage } from "../../api/client";
import {
  BREAK_TYPES,
  breakStartedAt,
  dayPhase,
  dayStatusMeta,
  isoDay,
  minutesToClock,
  PHASE_LABEL,
  workedMinutesSoFar,
} from "../../lib/attendanceState";
import { formatClock, formatDate, formatDayLong, formatMinutes, formatTime } from "../../lib/format";
import { currentPosition } from "../../lib/location";
import { useQuery } from "../../lib/useQuery";
import { useTheme } from "../../theme/ThemeProvider";
import { space, toneColors, type Tone } from "../../theme/tokens";
import type { AttendanceDay } from "../../api/types";
import { MonthCalendar } from "../../components/MonthCalendar";
import { Badge, Button, Card, ErrorState, GroupLabel, Icon, IconTile, InlineError, ListCard, ListRow, Loading, MiniStat, ProgressBar, Ring, Screen, SectionTitle, Select, Text, type IconName } from "../../ui";

const monthStart = () => {
  const date = new Date();
  date.setDate(1);
  return date;
};

/* Re-renders every 30s so the worked-time counter moves while the screen is open. */
const useTick = (active: boolean) => {
  const [, setTick] = useState(0);
  useEffect(() => {
    if (!active) return;
    const timer = setInterval(() => setTick((value) => value + 1), 30000);
    return () => clearInterval(timer);
  }, [active]);
};

export const AttendanceScreen = () => {
  const navigation = useNavigation();
  const { colors } = useTheme();
  const { data, loading, error, refreshing, refresh, setData } = useQuery(
    () => getMyAttendance({ from: isoDay(monthStart()), to: isoDay(new Date()), limit: 40 }),
    [],
  );
  const [busy, setBusy] = useState<null | "in" | "out" | "break" | "resume">(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [choosingBreak, setChoosingBreak] = useState(false);
  const [confirmOut, setConfirmOut] = useState(false);
  const confirmTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const today = data?.today || null;
  const phase = dayPhase(today);
  useTick(phase === "working" || phase === "on_break");

  useEffect(() => () => {
    if (confirmTimer.current) clearTimeout(confirmTimer.current);
  }, []);

  if (loading) return <Loading />;
  if (error || !data) return <ErrorState message={error || "Couldn't load attendance."} onRetry={refresh} />;

  const policy = data.policy;
  const needsLocation = Boolean(policy?.geofenceEnabled);

  const run = async (kind: NonNullable<typeof busy>, action: (location: GeoPoint | null) => Promise<{ message: string; today: typeof today }>) => {
    setBusy(kind);
    setActionError(null);
    setNotice(null);
    try {
      // Only check-in and check-out are fenced; breaks never ask for location.
      const location = needsLocation && (kind === "in" || kind === "out") ? await currentPosition() : null;
      const result = await action(location);
      setData({ ...data, today: result.today || today });
      setNotice(result.message || null);
      refresh();
    } catch (err) {
      setActionError(errorMessage(err));
    } finally {
      setBusy(null);
      setChoosingBreak(false);
      setConfirmOut(false);
    }
  };

  /* Checking out ends the day, so it takes a second tap within a few seconds. */
  const onCheckOut = () => {
    if (!confirmOut) {
      setConfirmOut(true);
      if (confirmTimer.current) clearTimeout(confirmTimer.current);
      confirmTimer.current = setTimeout(() => setConfirmOut(false), 4000);
      return;
    }
    run("out", checkOut);
  };

  const worked = workedMinutesSoFar(today);
  const phaseTone: Tone = phase === "working" ? "success" : phase === "on_break" ? "warning" : phase === "done" ? "neutral" : "primary";
  const summary = data.summary;
  const history = data.days.filter((day) => day.attendanceDate !== isoDay(new Date())).slice(0, 14);
  const shift = policy ? `${minutesToClock(policy.shiftStartMinutes)} – ${minutesToClock(policy.shiftEndMinutes)}` : "";
  const onBreakSince = breakStartedAt(today);

  const shiftMinutes =
    policy && typeof policy.shiftStartMinutes === "number" && typeof policy.shiftEndMinutes === "number" && policy.shiftEndMinutes > policy.shiftStartMinutes
      ? policy.shiftEndMinutes - policy.shiftStartMinutes
      : 540;
  const timeline = buildTimeline(today);

  return (
    <Screen
      title="My day"
      subtitle={formatDayLong()}
      refreshing={refreshing}
      onRefresh={refresh}
      right={
        needsLocation ? (
          <View style={[styles.zone, { backgroundColor: colors.successSoft }]}>
            <Icon name="location" size={12} color={colors.success} />
            <Text variant="tiny" color={colors.success} style={styles.zoneText}>
              Office check-in
            </Text>
          </View>
        ) : null
      }
    >
      <Card style={styles.hero}>
        <Ring size={176} stroke={12} progress={phase === "not_started" ? 0 : worked / shiftMinutes} color={phase === "on_break" ? colors.warning : colors.primary}>
          <Badge label={today?.isLateCheckIn && phase === "working" ? "Working · late" : PHASE_LABEL[phase]} tone={phaseTone} />
          <Text variant="monoLarge" style={styles.clock}>
            {formatClock(worked)}
          </Text>
          <Text variant="tiny" color="muted" style={styles.target}>
            of {formatMinutes(shiftMinutes)} target
          </Text>
        </Ring>

        {phase === "not_started" ? (
          <View style={styles.fill}>
            {shift ? (
              <Text variant="small" color="muted" align="center" style={styles.shift}>
                Shift {shift}
              </Text>
            ) : null}
            <Button label="Check in" icon="finger-print" loading={busy === "in"} onPress={() => run("in", checkIn)} />
          </View>
        ) : phase === "working" ? (
          choosingBreak ? (
            <View style={[styles.fill, styles.gapSm]}>
              <Select
                label="What kind of break?"
                placeholder="Choose the break"
                icon="cafe-outline"
                options={BREAK_TYPES.map((item) => ({ key: item.key, label: item.label }))}
                value=""
                onChange={(key) => run("break", () => startBreak(key))}
              />
              <Button label="Cancel" variant="ghost" size="sm" onPress={() => setChoosingBreak(false)} />
            </View>
          ) : (
            <View style={styles.row}>
              <Button label="Break" icon="cafe-outline" variant="secondary" style={[styles.flex, { backgroundColor: colors.bg }]} loading={busy === "break"} onPress={() => setChoosingBreak(true)} />
              <Button
                label={confirmOut ? "Tap to confirm" : "Check out"}
                icon="log-out-outline"
                variant={confirmOut ? "danger" : "primary"}
                style={styles.flex}
                loading={busy === "out"}
                onPress={onCheckOut}
              />
            </View>
          )
        ) : phase === "on_break" ? (
          <View style={styles.fill}>
            <Text variant="small" color="muted" align="center" style={styles.shift}>
              Break since {formatTime(onBreakSince)}
            </Text>
            <Button label="End break" icon="play" loading={busy === "resume"} onPress={() => run("resume", () => endBreak())} />
          </View>
        ) : (
          <Text variant="small" color="muted" align="center">
            {formatTime(today?.checkInAt)} – {formatTime(today?.checkOutAt)} · You're done for today. See you tomorrow!
          </Text>
        )}

        {needsLocation && (phase === "not_started" || phase === "working") ? (
          <View style={styles.note}>
            <Icon name="location-outline" size={13} color={colors.textFaint} />
            <Text variant="tiny" color="faint" style={styles.noteText}>
              Your location is checked against the office when you check in or out.
            </Text>
          </View>
        ) : null}
        <View style={styles.fill}>
          <InlineError message={actionError} />
        </View>
        {notice && !actionError ? (
          <Text variant="small" color="primary" align="center">
            {notice}
          </Text>
        ) : null}
      </Card>

      {timeline.length ? (
        <Card style={styles.timeline}>
          <Text variant="heading" style={styles.cardTitle}>
            Timeline
          </Text>
          {timeline.map((entry, index) => (
            <View key={entry.key} style={styles.tlRow}>
              <View style={styles.tlRail}>
                <IconTile icon={entry.icon} tone={entry.tone} size={28} iconSize={14} />
                {index < timeline.length - 1 ? <View style={[styles.tlLine, { backgroundColor: colors.border }]} /> : null}
              </View>
              <View style={styles.tlBody}>
                <Text variant="bodyStrong" style={styles.tlTitle}>
                  {entry.title}
                </Text>
                {entry.subtitle ? (
                  <Text variant="small" color="muted" style={styles.tlSub}>
                    {entry.subtitle}
                  </Text>
                ) : null}
              </View>
            </View>
          ))}
        </Card>
      ) : null}

      <SectionTitle title={MONTH_NAMES[new Date().getMonth()]} action="History" onAction={() => navigation.navigate("AttendanceHistory")} />
      <MonthCalendar days={data.days} />
      <View style={styles.stats}>
        <MiniStat label="Present" value={summary.presentDays ?? 0} tone="success" />
        <MiniStat label="Late" value={summary.lateDays ?? 0} tone="warning" />
        <MiniStat label="Leave" value={summary.leaveDays ?? 0} tone="primary" />
        <MiniStat label="Absent" value={summary.absentDays ?? 0} tone="danger" />
      </View>
      <Card style={styles.rowCard}>
        <Meter label="Attendance" value={summary.attendancePercent ?? 0} />
        <View style={[styles.divider, { backgroundColor: colors.border }]} />
        <Meter label="On time" value={summary.punctualityPercent ?? 0} />
      </Card>

      <ListCard>
        <ListRow
          title="Leave"
          subtitle="Balance, requests and applying for time off"
          left={<IconTile icon="airplane" tone="primary" />}
          chevron
          onPress={() => navigation.navigate("Leave")}
        />
      </ListCard>

      {history.length ? (
        <>
          <GroupLabel>Recent days</GroupLabel>
          <ListCard>
            {history.map((day) => {
              const meta = dayStatusMeta(day);
              return (
                <View key={day._id || day.attendanceDate} style={styles.dayRow}>
                  <View style={styles.flex}>
                    <Text variant="smallStrong">{day.attendanceDate ? formatDate(new Date(`${day.attendanceDate}T00:00:00`)) : "—"}</Text>
                    <Text variant="tiny" color="faint" style={styles.dayTimes}>
                      {day.checkInAt ? `${formatTime(day.checkInAt)} – ${day.checkOutAt ? formatTime(day.checkOutAt) : "no check-out"}` : "No check-in"}
                    </Text>
                  </View>
                  {day.workedMinutes ? (
                    <Text variant="mono" color={colors.textMuted} style={styles.dayWorked}>
                      {formatClock(day.workedMinutes)}
                    </Text>
                  ) : null}
                  <Badge label={meta.label} tone={meta.tone} />
                </View>
              );
            })}
          </ListCard>
        </>
      ) : null}
    </Screen>
  );
};

const MONTH_NAMES = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

type TimelineEntry = { key: string; icon: IconName; tone: Tone; title: string; subtitle?: string };

/* Check-in, each break, and check-out, in order - the design's "Timeline" card. */
const buildTimeline = (today: AttendanceDay | null): TimelineEntry[] => {
  if (!today?.checkInAt) return [];
  const entries: TimelineEntry[] = [
    {
      key: "in",
      icon: "finger-print",
      tone: today.isLateCheckIn ? "warning" : "success",
      title: `Checked in · ${formatTime(today.checkInAt)}`,
      subtitle: today.isLateCheckIn ? "Late check-in" : "On time",
    },
  ];
  (today.breakSessions || []).forEach((session, index) => {
    if (!session.startAt) return;
    entries.push({
      key: `b${session._id || index}`,
      icon: "cafe",
      tone: "warning",
      title: `Break · ${formatTime(session.startAt)}${session.endAt ? ` – ${formatTime(session.endAt)}` : ""}`,
      subtitle: session.endAt ? formatMinutes(session.durationMinutes ?? 0) : "In progress",
    });
  });
  if (today.checkOutAt) {
    entries.push({ key: "out", icon: "log-out", tone: "primary", title: `Checked out · ${formatTime(today.checkOutAt)}`, subtitle: `${formatMinutes(today.workedMinutes ?? 0)} worked` });
  }
  return entries;
};

const Meter = ({ label, value }: { label: string; value: number }) => {
  const { colors } = useTheme();
  const pct = Math.max(0, Math.min(100, Math.round(value)));
  return (
    <View style={styles.meter}>
      <View style={styles.meterHead}>
        <Text variant="small" color="muted" style={styles.meterLabel}>
          {label}
        </Text>
        <Text variant="smallStrong">{pct}%</Text>
      </View>
      <ProgressBar height={8} value={pct / 100} color={pct >= 75 ? colors.success : pct >= 50 ? colors.warning : colors.danger} />
    </View>
  );
};

const styles = StyleSheet.create({
  flex: { flex: 1 },
  fill: { alignSelf: "stretch", gap: 10 },
  zone: { flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 999, alignSelf: "flex-end" },
  zoneText: { fontSize: 11.5 },
  hero: { alignItems: "center", gap: 16, paddingTop: 20, borderRadius: 24 },
  clock: { marginTop: 2 },
  target: { fontFamily: "PlusJakartaSans_400Regular", fontSize: 11 },
  shift: { fontFamily: "PlusJakartaSans_600SemiBold" },
  row: { flexDirection: "row", gap: space.sm, alignSelf: "stretch" },
  gapSm: { gap: space.sm },
  note: { flexDirection: "row", alignItems: "center", gap: 6, alignSelf: "stretch", justifyContent: "center" },
  noteText: { fontFamily: "PlusJakartaSans_500Medium", flexShrink: 1 },
  timeline: { gap: 2, borderRadius: 20 },
  cardTitle: { fontSize: 13, paddingBottom: 8 },
  tlRow: { flexDirection: "row", gap: 10 },
  tlRail: { alignItems: "center" },
  tlLine: { flex: 1, width: 2, minHeight: 10 },
  tlBody: { paddingBottom: 10, flex: 1 },
  tlTitle: { fontSize: 13 },
  tlSub: { fontSize: 11.5 },
  calendar: { gap: 4, borderRadius: 20 },
  calRow: { flexDirection: "row", gap: 4 },
  calCell: { flex: 1 },
  calDay: { height: 34, borderRadius: 10, alignItems: "center", justifyContent: "center", gap: 2 },
  calDot: { width: 5, height: 5, borderRadius: 3 },
  legend: { flexDirection: "row", flexWrap: "wrap", gap: 10, paddingTop: 6 },
  legendItem: { flexDirection: "row", alignItems: "center", gap: 4 },
  legendDot: { width: 7, height: 7, borderRadius: 4 },
  legendText: { fontFamily: "PlusJakartaSans_600SemiBold" },
  stats: { flexDirection: "row", gap: 6 },
  rowCard: { flexDirection: "row", alignItems: "center", gap: space.lg },
  divider: { width: 1, alignSelf: "stretch" },
  meter: { flex: 1, gap: space.sm },
  meterHead: { flexDirection: "row", justifyContent: "space-between" },
  meterLabel: { fontSize: 12.5 },
  dayRow: { flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 11, paddingHorizontal: 12 },
  dayTimes: { fontFamily: "PlusJakartaSans_500Medium" },
  dayWorked: { fontSize: 12 },
});
