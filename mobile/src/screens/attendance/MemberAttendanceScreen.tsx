import React, { useLayoutEffect, useState } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { getMemberAttendance, getMemberLeaveBalance } from "../../api/attendance";
import type { AttendanceDay } from "../../api/types";
import { MonthCalendar } from "../../components/MonthCalendar";
import { canCorrectBreaks, canSetStatusOn, todayKeyIn } from "../../lib/attendanceAdmin";
import { dayStatusMeta, isoDay } from "../../lib/attendanceState";
import { formatDayShort, formatMinutes, formatTime, monthKeyOf, monthLabel, shiftMonth } from "../../lib/format";
import { useQuery } from "../../lib/useQuery";
import type { RootScreenProps } from "../../navigation/types";
import { useTheme } from "../../theme/ThemeProvider";
import { ActionSheet, Badge, Body, Card, ErrorState, GroupLabel, Icon, ListCard, Loading, MiniStat, Text, type SheetAction } from "../../ui";
import { BreakCorrectionSheet, DayStatusSheet, type DayTarget } from "./AttendanceAdminSheets";

const dayOf = (key: string) => new Date(`${key}T00:00:00`);

/* Web: AttendanceHub "member attendance" calendar - one person's month, leave balance, and day corrections. */
export const MemberAttendanceScreen = ({ route, navigation }: RootScreenProps<"MemberAttendance">) => {
  const { userId, name } = route.params;
  const { colors } = useTheme();
  const current = monthKeyOf();
  const [month, setMonth] = useState(current);
  const [menu, setMenu] = useState<AttendanceDay | null>(null);
  const [statusTarget, setStatusTarget] = useState<DayTarget | null>(null);
  const [breakTarget, setBreakTarget] = useState<DayTarget | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const { data, loading, error, refresh, refreshing, reload } = useQuery(async () => {
    const [y, m] = month.split("-").map(Number);
    const from = isoDay(new Date(y!, m! - 1, 1));
    const to = month === current ? isoDay(new Date()) : isoDay(new Date(y!, m!, 0));
    const [attendance, balance] = await Promise.all([getMemberAttendance(userId, { from, to }), getMemberLeaveBalance(userId).catch(() => null)]);
    return { attendance, balance };
  }, [month, userId]);

  useLayoutEffect(() => {
    navigation.setOptions({ title: data?.attendance.user?.name || name || "Attendance" });
  }, [navigation, data, name]);

  const [y, m] = month.split("-").map(Number);
  const today = todayKeyIn(data?.attendance.timezone);
  const days = [...(data?.attendance.days || [])].sort((a, b) => String(b.attendanceDate).localeCompare(String(a.attendanceDate)));
  const summary = data?.attendance.summary;
  const balance = data?.balance;
  const person = data?.attendance.user?.name || name || "";

  const targetFor = (day: AttendanceDay): DayTarget => ({ userId, name: person, date: String(day.attendanceDate), day });
  const actionsFor = (day: AttendanceDay): SheetAction[] => {
    const list: SheetAction[] = [];
    if (canSetStatusOn(day.attendanceDate, today)) list.push({ key: "status", label: "Set status for this day", icon: "create-outline", onPress: () => setStatusTarget(targetFor(day)) });
    if (canCorrectBreaks(day)) list.push({ key: "breaks", label: "Add or correct a break", icon: "time-outline", onPress: () => setBreakTarget(targetFor(day)) });
    return list;
  };
  const saved = (message: string) => {
    setNotice(message);
    reload();
  };

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
        {loading ? <Loading /> : <MonthCalendar bare days={data?.attendance.days || []} month={new Date(y!, m! - 1, 1)} />}
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

      {balance ? (
        <Card style={styles.balance}>
          <Icon name="airplane-outline" size={18} color={colors.primary} />
          <Text variant="small" style={styles.flex}>
            Leave balance <Text variant="smallStrong">{balance.available ?? 0} available</Text> · {balance.used ?? 0} used · {balance.pending ?? 0} pending
          </Text>
        </Card>
      ) : null}

      {notice ? (
        <Text variant="smallStrong" color={colors.success}>
          {notice}
        </Text>
      ) : null}

      {days.length ? (
        <>
          <GroupLabel>Days</GroupLabel>
          <ListCard>
            {days.map((day) => {
              const meta = dayStatusMeta(day);
              const actions = actionsFor(day);
              return (
                <Pressable
                  key={String(day._id || day.attendanceDate)}
                  accessibilityRole={actions.length ? "button" : undefined}
                  disabled={!actions.length}
                  onPress={() => {
                    setNotice(null);
                    setMenu(day);
                  }}
                  style={({ pressed }) => [styles.row, pressed && { backgroundColor: colors.surfaceAlt }]}
                >
                  <View style={styles.flex}>
                    <Text variant="bodyStrong" style={styles.rowTitle}>
                      {day.attendanceDate ? formatDayShort(dayOf(day.attendanceDate)) : ""}
                    </Text>
                    <Text variant="small" color="muted" numberOfLines={1}>
                      {day.checkInAt ? `${formatTime(day.checkInAt)} – ${day.checkOutAt ? formatTime(day.checkOutAt) : "…"}` : "No check-in"}
                      {day.workedMinutes ? ` · ${formatMinutes(day.workedMinutes)}` : ""}
                      {day.breakSessions?.length ? ` · ${day.breakSessions.length} break${day.breakSessions.length > 1 ? "s" : ""}` : ""}
                      {day.source === "MANUAL" ? " · set by admin" : ""}
                    </Text>
                  </View>
                  <Badge label={meta.label} tone={meta.tone} />
                </Pressable>
              );
            })}
          </ListCard>
        </>
      ) : null}

      <ActionSheet visible={Boolean(menu)} title={menu?.attendanceDate ? formatDayShort(dayOf(menu.attendanceDate)) : undefined} actions={menu ? actionsFor(menu) : []} onClose={() => setMenu(null)} />
      <DayStatusSheet target={statusTarget} onClose={() => setStatusTarget(null)} onSaved={saved} />
      <BreakCorrectionSheet target={breakTarget} onClose={() => setBreakTarget(null)} onSaved={saved} />
    </Body>
  );
};

const styles = StyleSheet.create({
  flex: { flex: 1, minWidth: 0 },
  calendarCard: { gap: 10, borderRadius: 20 },
  monthNav: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  monthTitle: { fontFamily: "PlusJakartaSans_800ExtraBold" },
  disabled: { opacity: 0.3 },
  stats: { flexDirection: "row", gap: 6 },
  balance: { flexDirection: "row", alignItems: "center", gap: 10 },
  row: { flexDirection: "row", alignItems: "center", gap: 12, padding: 12 },
  rowTitle: { fontSize: 13 },
});
