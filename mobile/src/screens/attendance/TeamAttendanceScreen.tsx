import React, { useLayoutEffect, useMemo, useState } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { getTeamAttendance, manageMemberBreak, type TeamAttendanceRow } from "../../api/attendance";
import { errorMessage } from "../../api/client";
import { canCorrectBreaks, canManageBreakNow, canSetStatusOn, teamBucket, todayKeyIn, type TeamFilter } from "../../lib/attendanceAdmin";
import { BREAK_TYPES, dayStatusMeta, isoDay } from "../../lib/attendanceState";
import { formatDayLong, formatMinutes, formatTime } from "../../lib/format";
import { useQuery } from "../../lib/useQuery";
import type { RootScreenProps } from "../../navigation/types";
import { useTheme } from "../../theme/ThemeProvider";
import { ActionSheet, Avatar, Badge, Body, EmptyState, ErrorState, Field, FilterDropdown, Icon, InlineError, ListCard, Loading, MiniStat, Text, type SheetAction } from "../../ui";
import { BreakCorrectionSheet, DayStatusSheet, type DayTarget } from "./AttendanceAdminSheets";

const FILTERS: { key: TeamFilter; label: string }[] = [
  { key: "all", label: "All" },
  { key: "in", label: "Working" },
  { key: "break", label: "On break" },
  { key: "out", label: "Checked out" },
  { key: "absent", label: "Absent" },
  { key: "leave", label: "Leave / off" },
];

const dayOf = (key: string) => new Date(`${key}T00:00:00`);
const shiftDay = (key: string, delta: number) => {
  const date = dayOf(key);
  date.setDate(date.getDate() + delta);
  return isoDay(date);
};

/* Web: AttendanceHub team board - who's in, on break, absent for one day, with the manager's corrections. */
export const TeamAttendanceScreen = ({ navigation }: RootScreenProps<"TeamAttendance">) => {
  const { colors } = useTheme();
  const today = todayKeyIn();
  const [date, setDate] = useState(today);
  const [filter, setFilter] = useState<TeamFilter>("all");
  const [query, setQuery] = useState("");
  const [menu, setMenu] = useState<TeamAttendanceRow | null>(null);
  const [breakFor, setBreakFor] = useState<TeamAttendanceRow | null>(null);
  const [statusTarget, setStatusTarget] = useState<DayTarget | null>(null);
  const [breakTarget, setBreakTarget] = useState<DayTarget | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const { data, loading, error, refreshing, refresh, reload } = useQuery(() => getTeamAttendance(date), [date]);

  useLayoutEffect(() => {
    navigation.setOptions({
      headerRight: () => (
        <Pressable accessibilityRole="button" accessibilityLabel="Offices" hitSlop={8} onPress={() => navigation.navigate("Offices")}>
          <Icon name="business-outline" size={20} color={colors.primary} />
        </Pressable>
      ),
    });
  }, [navigation, colors.primary]);

  const rows = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return (data?.rows || []).filter(
      (row) => (filter === "all" || teamBucket(row.attendance) === filter) && (!needle || String(row.user?.name || "").toLowerCase().includes(needle)),
    );
  }, [data, filter, query]);

  const counts = useMemo(() => {
    const out: Record<string, number> = {};
    for (const row of data?.rows || []) out[teamBucket(row.attendance)] = (out[teamBucket(row.attendance)] || 0) + 1;
    return out;
  }, [data]);

  const saved = (message: string) => {
    setNotice(message);
    setActionError(null);
    reload();
  };

  const runBreak = async (row: TeamAttendanceRow, action: "START" | "END", breakType?: string) => {
    setActionError(null);
    try {
      const result = await manageMemberBreak(row.user._id, action, breakType);
      saved(result.message);
    } catch (err) {
      setActionError(errorMessage(err));
    }
  };

  const targetFor = (row: TeamAttendanceRow): DayTarget => ({ userId: row.user._id, name: row.user.name, date, day: row.attendance || null });

  const actionsFor = (row: TeamAttendanceRow): SheetAction[] => {
    const day = row.attendance;
    const list: SheetAction[] = [
      { key: "history", label: "Attendance history", icon: "calendar-number-outline", onPress: () => navigation.navigate("MemberAttendance", { userId: row.user._id, name: row.user.name }) },
    ];
    if (date === today && canManageBreakNow(day)) {
      list.push(
        day?.isOnBreak
          ? { key: "end", label: "End their break now", icon: "play-outline", onPress: () => runBreak(row, "END") }
          : { key: "start", label: "Start a break for them", icon: "cafe-outline", onPress: () => setBreakFor(row) },
      );
    }
    if (canCorrectBreaks(day)) list.push({ key: "breaks", label: "Add or correct a break", icon: "time-outline", onPress: () => setBreakTarget(targetFor(row)) });
    if (canSetStatusOn(date, today)) list.push({ key: "status", label: "Set status for this day", icon: "create-outline", onPress: () => setStatusTarget(targetFor(row)) });
    return list;
  };

  const summary = data?.summary;

  return (
    <Body refreshing={refreshing} onRefresh={refresh}>
      <View style={[styles.dateNav, { backgroundColor: colors.surface, borderColor: colors.border }]}>
        <Pressable accessibilityRole="button" accessibilityLabel="Previous day" hitSlop={10} onPress={() => setDate(shiftDay(date, -1))}>
          <Icon name="chevron-back" size={18} color={colors.textMuted} />
        </Pressable>
        <Pressable accessibilityRole="button" onPress={() => setDate(today)} style={styles.dateLabel}>
          <Text variant="bodyStrong">{date === today ? "Today" : formatDayLong(dayOf(date))}</Text>
          {date !== today ? (
            <Text variant="tiny" color="primary">
              Back to today
            </Text>
          ) : null}
        </Pressable>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Next day"
          hitSlop={10}
          disabled={date >= today}
          onPress={() => setDate(shiftDay(date, 1))}
          style={date >= today ? styles.disabled : undefined}
        >
          <Icon name="chevron-forward" size={18} color={colors.textMuted} />
        </Pressable>
      </View>

      {summary ? (
        <View style={styles.stats}>
          <MiniStat value={summary.checkedIn ?? 0} label="Checked in" tone="success" />
          <MiniStat value={summary.onBreak ?? 0} label="On break" tone="warning" />
          <MiniStat value={summary.leave ?? 0} label="Leave" tone="primary" />
          <MiniStat value={summary.absent ?? 0} label="Absent" tone="danger" />
        </View>
      ) : null}

      <FilterDropdown
        label="Show"
        icon="funnel-outline"
        options={FILTERS.map((item) => ({ key: item.key, label: item.label, count: item.key === "all" ? data?.rows.length : counts[item.key] }))}
        value={filter}
        onChange={setFilter}
      />
      <Field compact icon="search-outline" value={query} onChangeText={setQuery} placeholder="Search people" />

      {notice ? (
        <Text variant="smallStrong" color={colors.success}>
          {notice}
        </Text>
      ) : null}
      <InlineError message={actionError} />

      {loading ? (
        <Loading />
      ) : error ? (
        <ErrorState message={error} onRetry={refresh} />
      ) : !rows.length ? (
        <EmptyState icon="people-outline" title="Nobody here" message={filter === "all" ? "No one is in your attendance scope." : "No one matches this filter."} />
      ) : (
        <ListCard>
          {rows.map((row) => {
            const day = row.attendance;
            const meta = day ? dayStatusMeta(day) : null;
            const bucket = teamBucket(day);
            const times = day?.checkInAt ? `In ${formatTime(day.checkInAt)}${day.checkOutAt ? ` · out ${formatTime(day.checkOutAt)}` : ""}` : "Not checked in";
            return (
              <Pressable
                key={row.user._id}
                accessibilityRole="button"
                accessibilityLabel={`${row.user.name}, actions`}
                onPress={() => {
                  setNotice(null);
                  setMenu(row);
                }}
                style={({ pressed }) => [styles.row, pressed && { backgroundColor: colors.surfaceAlt }]}
              >
                <Avatar name={row.user.name} uri={row.user.profileImageUrl} size={38} />
                <View style={styles.flex}>
                  <Text variant="bodyStrong" numberOfLines={1} style={styles.name}>
                    {row.user.name}
                  </Text>
                  <Text variant="small" color="muted" numberOfLines={1}>
                    {times}
                    {day?.totalBreakMinutes ? ` · breaks ${formatMinutes(day.totalBreakMinutes)}` : ""}
                  </Text>
                </View>
                {bucket === "break" ? <Badge label="On break" tone="warning" /> : meta ? <Badge label={meta.label} tone={meta.tone} /> : null}
              </Pressable>
            );
          })}
        </ListCard>
      )}

      <ActionSheet visible={Boolean(menu)} title={menu?.user.name} actions={menu ? actionsFor(menu) : []} onClose={() => setMenu(null)} />
      <ActionSheet
        visible={Boolean(breakFor)}
        title={breakFor ? `Break type for ${breakFor.user.name}` : undefined}
        actions={BREAK_TYPES.map((type) => ({ key: type.key, label: type.label, icon: "cafe-outline" as const, onPress: () => breakFor && runBreak(breakFor, "START", type.key) }))}
        onClose={() => setBreakFor(null)}
      />
      <DayStatusSheet target={statusTarget} onClose={() => setStatusTarget(null)} onSaved={saved} />
      <BreakCorrectionSheet target={breakTarget} onClose={() => setBreakTarget(null)} onSaved={saved} />
    </Body>
  );
};

const styles = StyleSheet.create({
  flex: { flex: 1, minWidth: 0 },
  dateNav: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", borderWidth: 1, borderRadius: 16, paddingHorizontal: 14, paddingVertical: 10 },
  dateLabel: { alignItems: "center" },
  disabled: { opacity: 0.3 },
  stats: { flexDirection: "row", gap: 6 },
  row: { flexDirection: "row", alignItems: "center", gap: 12, padding: 12 },
  name: { fontSize: 14 },
});
