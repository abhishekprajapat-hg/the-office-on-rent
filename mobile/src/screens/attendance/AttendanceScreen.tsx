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
import { formatDate, formatMinutes, formatTime } from "../../lib/format";
import { currentPosition } from "../../lib/location";
import { useQuery } from "../../lib/useQuery";
import { useTheme } from "../../theme/ThemeProvider";
import { radius, space, toneColors, type Tone } from "../../theme/tokens";
import { Badge, Button, Card, Chip, ErrorState, Icon, InlineError, Loading, Screen, SectionTitle, Text } from "../../ui";

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
  const { fg, bg } = toneColors(colors, phaseTone);
  const summary = data.summary;
  const history = data.days.filter((day) => day.attendanceDate !== isoDay(new Date())).slice(0, 14);
  const shift = policy ? `${minutesToClock(policy.shiftStartMinutes)} – ${minutesToClock(policy.shiftEndMinutes)}` : "";
  const onBreakSince = breakStartedAt(today);

  return (
    <Screen title="Attendance" subtitle={formatDate(new Date())} refreshing={refreshing} onRefresh={refresh}>
      <Card style={styles.hero}>
        <View style={styles.heroTop}>
          <View style={[styles.heroIcon, { backgroundColor: bg }]}>
            <Icon name={phase === "on_break" ? "cafe" : phase === "done" ? "moon" : "finger-print"} size={26} color={fg} />
          </View>
          <View style={styles.flex}>
            <Text variant="heading">{PHASE_LABEL[phase]}</Text>
            <Text variant="small" color="muted">
              {phase === "not_started"
                ? shift
                  ? `Shift ${shift}`
                  : "Check in to start your day"
                : phase === "on_break"
                  ? `Break since ${formatTime(onBreakSince)}`
                  : phase === "done"
                    ? `${formatTime(today?.checkInAt)} – ${formatTime(today?.checkOutAt)}`
                    : `Checked in at ${formatTime(today?.checkInAt)}`}
            </Text>
          </View>
          {today?.isLateCheckIn ? <Badge label="Late" tone="warning" /> : null}
        </View>

        {phase !== "not_started" ? (
          <View style={styles.counter}>
            <Text variant="display" style={styles.counterValue}>
              {formatMinutes(worked)}
            </Text>
            <Text variant="small" color="muted">
              worked{today?.totalBreakMinutes ? ` · ${formatMinutes(today.totalBreakMinutes)} on breaks` : ""}
            </Text>
          </View>
        ) : null}

        {phase === "not_started" ? (
          <Button label="Check in" icon="log-in-outline" loading={busy === "in"} onPress={() => run("in", checkIn)} />
        ) : phase === "working" ? (
          choosingBreak ? (
            <View style={styles.gapSm}>
              <Text variant="smallStrong" color="muted">
                What kind of break?
              </Text>
              <View style={styles.chips}>
                {BREAK_TYPES.map((item) => (
                  <Chip key={item.key} label={item.label} onPress={() => run("break", () => startBreak(item.key))} />
                ))}
              </View>
              <Button label="Cancel" variant="ghost" size="sm" onPress={() => setChoosingBreak(false)} />
            </View>
          ) : (
            <View style={styles.row}>
              <Button label="Take a break" icon="cafe-outline" variant="secondary" style={styles.flex} loading={busy === "break"} onPress={() => setChoosingBreak(true)} />
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
          <Button label="End break" icon="play" loading={busy === "resume"} onPress={() => run("resume", () => endBreak())} />
        ) : (
          <Text variant="small" color="muted" align="center">
            You're done for today. See you tomorrow!
          </Text>
        )}

        {needsLocation && (phase === "not_started" || phase === "working") ? (
          <View style={styles.note}>
            <Icon name="location-outline" size={14} color={colors.textFaint} />
            <Text variant="tiny" color="faint">
              Your location is checked against the office when you check in or out.
            </Text>
          </View>
        ) : null}
        <InlineError message={actionError} />
        {notice && !actionError ? (
          <Text variant="small" color="primary" align="center">
            {notice}
          </Text>
        ) : null}
      </Card>

      <SectionTitle title="This month" />
      <View style={styles.stats}>
        <Stat label="Present" value={summary.presentDays ?? 0} tone="success" />
        <Stat label="Late" value={summary.lateDays ?? 0} tone="warning" />
        <Stat label="Absent" value={summary.absentDays ?? 0} tone="danger" />
        <Stat label="Leave" value={summary.leaveDays ?? 0} tone="info" />
      </View>
      <Card style={styles.rowCard}>
        <Meter label="Attendance" value={summary.attendancePercent ?? 0} />
        <View style={[styles.divider, { backgroundColor: colors.border }]} />
        <Meter label="On time" value={summary.punctualityPercent ?? 0} />
      </Card>

      <Card onPress={() => navigation.navigate("Leave")} style={styles.leaveRow} accessibilityLabel="Leave">
        <View style={[styles.heroIcon, { backgroundColor: colors.infoSoft }]}>
          <Icon name="airplane" size={20} color={colors.info} />
        </View>
        <View style={styles.flex}>
          <Text variant="bodyStrong">Leave</Text>
          <Text variant="small" color="muted">
            Balance, requests and applying for time off
          </Text>
        </View>
        <Icon name="chevron-forward" size={18} color={colors.textFaint} />
      </Card>

      <SectionTitle title="Recent days" />
      <Card style={styles.list}>
        {history.length ? (
          history.map((day, index) => {
            const meta = dayStatusMeta(day);
            return (
              <View
                key={day._id || day.attendanceDate}
                style={[styles.dayRow, index < history.length - 1 && { borderBottomColor: colors.border, borderBottomWidth: StyleSheet.hairlineWidth }]}
              >
                <View style={styles.flex}>
                  <Text variant="smallStrong">{day.attendanceDate ? formatDate(new Date(`${day.attendanceDate}T00:00:00`)) : "—"}</Text>
                  <Text variant="tiny" color="faint">
                    {day.checkInAt ? `${formatTime(day.checkInAt)} – ${day.checkOutAt ? formatTime(day.checkOutAt) : "no check-out"}` : "No check-in"}
                  </Text>
                </View>
                {day.workedMinutes ? (
                  <Text variant="small" color="muted">
                    {formatMinutes(day.workedMinutes)}
                  </Text>
                ) : null}
                <Badge label={meta.label} tone={meta.tone} />
              </View>
            );
          })
        ) : (
          <Text variant="small" color="muted">
            Nothing recorded yet this month.
          </Text>
        )}
      </Card>
    </Screen>
  );
};

const Stat = ({ label, value, tone }: { label: string; value: number; tone: Tone }) => {
  const { colors } = useTheme();
  const { fg } = toneColors(colors, tone);
  return (
    <Card style={styles.stat}>
      <Text variant="title" color={fg}>
        {value}
      </Text>
      <Text variant="tiny" color="muted">
        {label}
      </Text>
    </Card>
  );
};

const Meter = ({ label, value }: { label: string; value: number }) => {
  const { colors } = useTheme();
  const pct = Math.max(0, Math.min(100, Math.round(value)));
  return (
    <View style={styles.meter}>
      <View style={styles.meterHead}>
        <Text variant="small" color="muted">
          {label}
        </Text>
        <Text variant="smallStrong">{pct}%</Text>
      </View>
      <View style={[styles.track, { backgroundColor: colors.surfaceAlt }]}>
        <View style={[styles.fill, { width: `${pct}%`, backgroundColor: pct >= 75 ? colors.success : pct >= 50 ? colors.warning : colors.danger }]} />
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  flex: { flex: 1 },
  hero: { gap: space.lg },
  heroTop: { flexDirection: "row", alignItems: "center", gap: space.md },
  heroIcon: { width: 48, height: 48, borderRadius: radius.md, alignItems: "center", justifyContent: "center" },
  counter: { alignItems: "center", gap: 2 },
  counterValue: { fontSize: 40, lineHeight: 46 },
  row: { flexDirection: "row", gap: space.md },
  gapSm: { gap: space.sm },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: space.sm },
  note: { flexDirection: "row", alignItems: "center", gap: 6, justifyContent: "center" },
  stats: { flexDirection: "row", gap: space.sm },
  stat: { flex: 1, alignItems: "center", paddingVertical: space.md, paddingHorizontal: space.xs, gap: 2 },
  rowCard: { flexDirection: "row", alignItems: "center", gap: space.lg },
  divider: { width: StyleSheet.hairlineWidth, alignSelf: "stretch" },
  meter: { flex: 1, gap: space.sm },
  meterHead: { flexDirection: "row", justifyContent: "space-between" },
  track: { height: 8, borderRadius: 4, overflow: "hidden" },
  fill: { height: 8, borderRadius: 4 },
  leaveRow: { flexDirection: "row", alignItems: "center", gap: space.md },
  list: { paddingVertical: space.xs },
  dayRow: { flexDirection: "row", alignItems: "center", gap: space.md, paddingVertical: space.md },
});
