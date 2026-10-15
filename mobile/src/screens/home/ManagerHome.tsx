import React from "react";
import { Pressable, RefreshControl, ScrollView, StyleSheet, View } from "react-native";
import { StatusBar } from "expo-status-bar";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useIsFocused, useNavigation } from "@react-navigation/native";
import { loadApprovals, type ApprovalItem, type ApprovalKind } from "../../api/approvals";
import { getTeamAttendance } from "../../api/attendance";
import { getLeadSummary } from "../../api/leads";
import { getTeamPerformance } from "../../api/performance";
import { useUser } from "../../auth/AuthProvider";
import { firstName, formatDayShort, formatTime, monthKeyOf } from "../../lib/format";
import { countByStage, LEAD_STAGES } from "../../lib/leadStatus";
import { roleLabel } from "../../lib/roles";
import { useQuery } from "../../lib/useQuery";
import { useFeed } from "../../notifications/feed";
import { ChatButton } from "../../components/ChatButton";
import { useTheme } from "../../theme/ThemeProvider";
import { gutter, toneColors, type Tone } from "../../theme/tokens";
import { Avatar, Card, Icon, IconTile, ListCard, Loading, OfflineBanner, ProgressBar, SectionTitle, Text, type IconName } from "../../ui";

const settle = <T,>(promise: Promise<T>) => promise.catch(() => null);

const QUEUES: Record<ApprovalKind, { label: string; icon: IconName; tone: Tone }> = {
  payment: { label: "Deal payments", icon: "cash-outline", tone: "warning" },
  delete: { label: "Delete requests", icon: "trash-outline", tone: "danger" },
  leave: { label: "Leave requests", icon: "airplane-outline", tone: "primary" },
  inventory: { label: "Property requests", icon: "business-outline", tone: "violet" },
  status: { label: "Status changes", icon: "swap-horizontal", tone: "primary" },
  user: { label: "User removals", icon: "person-remove-outline", tone: "danger" },
  fix: { label: "Attendance fixes", icon: "time-outline", tone: "warning" },
};

/* "2 from Rahul Verma" / "Isha Singh · 21–22 Oct" style sub-line for a queue. */
const queueDetail = (items: ApprovalItem[]) => {
  const people = [...new Set(items.map((item) => item.requestedBy?.name).filter(Boolean))];
  if (people.length === 1) return `${items.length} from ${people[0]}`;
  return `${items.length} waiting${people.length ? ` · ${people.slice(0, 2).join(", ")}${people.length > 2 ? "…" : ""}` : ""}`;
};

/* Design 05 - the manager's (and admin's) home: team strip, approvals, team today. Web: ManagerDashboard. */
export const ManagerHome = () => {
  const user = useUser();
  const navigation = useNavigation();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const focused = useIsFocused();
  const unread = useFeed().filter((item) => !item.read).length;

  const { data, loading, refreshing, refresh } = useQuery(async () => {
    const [team, approvals, scores, summary] = await Promise.all([
      settle(getTeamAttendance()),
      settle(loadApprovals()),
      settle(getTeamPerformance(monthKeyOf())),
      settle(getLeadSummary()),
    ]);
    return { team, approvals, scores, summary };
  }, []);

  const rows = (data?.team?.rows || []).filter((row) => row.user._id !== (user.id || user._id));
  const isIn = (row: (typeof rows)[number]) => Boolean(row.attendance.checkInAt);
  const status = (row: (typeof rows)[number]) => String(row.attendance.status || "").toUpperCase();
  const present = rows.filter(isIn).length;
  const expected = rows.filter((row) => !["WEEK_OFF", "HOLIDAY"].includes(status(row))).length;
  const inField = rows.filter((row) => isIn(row) && row.user.role === "FIELD_EXECUTIVE" && !row.attendance.checkOutAt).length;
  const late = rows.filter((row) => row.attendance.isLateCheckIn || status(row) === "LATE").length;
  const onLeave = rows.filter((row) => ["LEAVE", "ON_LEAVE"].includes(status(row))).length;

  const pending = (data?.approvals || []).filter((item) => String(item.status).toUpperCase() === "PENDING");
  const queues = (Object.keys(QUEUES) as ApprovalKind[])
    .map((kind) => ({ kind, items: pending.filter((item) => item.kind === kind) }))
    .filter((queue) => queue.items.length);

  const scoreOf = new Map((data?.scores || []).map((row) => [row.user._id, row.performance]));
  const stages = countByStage(data?.summary?.byStatus);
  const stageMax = Math.max(1, ...Object.values(stages));

  const sortedTeam = [...rows].sort((a, b) => (scoreOf.get(b.user._id)?.score ?? -1) - (scoreOf.get(a.user._id)?.score ?? -1));

  return (
    <View style={[styles.flex, { backgroundColor: colors.bg }]}>
      {focused ? <StatusBar style="auto" /> : null}
      <ScrollView
        contentContainerStyle={styles.scroll}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={colors.primary} colors={[colors.primary]} />}
      >
        <View style={[styles.header, { backgroundColor: colors.surface, borderBottomColor: colors.border, paddingTop: insets.top + 4 }]}>
          <View style={styles.headRow}>
            <View style={styles.flex}>
              <Text variant="small" color="muted">
                {roleLabel(user.role)} · {formatDayShort()}
              </Text>
              <Text variant="display" style={styles.hi} numberOfLines={1}>
                Hi, {firstName(user.name)}
              </Text>
            </View>
            <ChatButton style={{ backgroundColor: colors.bg }} />
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={unread ? `Notifications, ${unread} unread` : "Notifications"}
              onPress={() => navigation.navigate("Notifications")}
              style={[styles.bell, { backgroundColor: colors.bg }]}
            >
              <Icon name="notifications-outline" size={20} color={colors.text} />
              {unread ? <View style={[styles.dot, { backgroundColor: colors.warning }]} /> : null}
            </Pressable>
            <Pressable accessibilityRole="button" accessibilityLabel="Open profile" onPress={() => navigation.navigate("Profile")}>
              <Avatar name={user.name} uri={user.profileImageUrl} size={42} solid />
            </Pressable>
          </View>
          <View style={styles.strip}>
            <StripTile value={data?.team ? `${present}/${expected}` : "—"} label="Present" tone="success" />
            <StripTile value={data?.team ? inField : "—"} label="In field" tone="primary" />
            <StripTile value={data?.team ? late : "—"} label="Late" tone="warning" />
            <StripTile value={data?.team ? onLeave : "—"} label="On leave" tone="violet" />
          </View>
        </View>
        <OfflineBanner inset={false} style={styles.connection} />

        {loading ? (
          <View style={styles.loading}>
            <Loading />
          </View>
        ) : (
          <View style={styles.content}>
            <View style={styles.section}>
              <SectionTitle title="Needs your approval" action={queues.length ? "Open all" : undefined} onAction={() => navigation.navigate("Approvals")} />
              {queues.length ? (
                <ListCard>
                  {queues.map(({ kind, items }) => {
                    const meta = QUEUES[kind];
                    return (
                      <Pressable
                        key={kind}
                        onPress={() => navigation.navigate("Approvals")}
                        accessibilityRole="button"
                        accessibilityLabel={`${meta.label}, ${items.length} waiting`}
                        style={({ pressed }) => [styles.row, pressed && { backgroundColor: colors.surfaceAlt }]}
                      >
                        <IconTile icon={meta.icon} tone={meta.tone} />
                        <View style={styles.flex}>
                          <Text variant="bodyStrong" style={styles.rowTitle}>
                            {meta.label}
                          </Text>
                          <Text variant="small" color="muted" style={styles.rowSub} numberOfLines={1}>
                            {queueDetail(items)}
                          </Text>
                        </View>
                        <View style={[styles.count, { backgroundColor: toneColors(colors, meta.tone).fg }]}>
                          <Text variant="tiny" color={colors.onPrimary} style={styles.countText}>
                            {items.length}
                          </Text>
                        </View>
                      </Pressable>
                    );
                  })}
                </ListCard>
              ) : (
                <Card>
                  <View style={styles.inline}>
                    <Icon name="checkmark-done" size={18} color={colors.success} />
                    <Text variant="small" color="muted">
                      Nothing waiting for you.
                    </Text>
                  </View>
                </Card>
              )}
            </View>

            {rows.length ? (
              <View style={styles.section}>
                <SectionTitle title="Team today" action="Pipeline" onAction={() => navigation.navigate("TeamPipeline")} />
                <ListCard>
                  {sortedTeam.slice(0, 12).map((row) => {
                    const perf = scoreOf.get(row.user._id);
                    const tone: Tone = perf?.grade?.key === "EXCELLENT" ? "success" : perf?.grade?.key === "GOOD" ? "primary" : perf?.grade?.key === "AVERAGE" ? "warning" : perf?.grade ? "danger" : "neutral";
                    const st = status(row);
                    const line = ["LEAVE", "ON_LEAVE"].includes(st)
                      ? "On leave today"
                      : st === "WEEK_OFF"
                        ? "Week off"
                        : row.attendance.checkInAt
                          ? `${row.attendance.isLateCheckIn ? "late" : "checked in"} ${formatTime(row.attendance.checkInAt)}${row.attendance.checkOutAt ? ` · out ${formatTime(row.attendance.checkOutAt)}` : row.attendance.isOnBreak ? " · on break" : ""}`
                          : "Not checked in";
                    return (
                      <Pressable
                        key={row.user._id}
                        onPress={() => navigation.navigate("PersonLeads", { assignedTo: row.user._id, name: row.user.name })}
                        accessibilityRole="button"
                        style={({ pressed }) => [styles.row, styles.teamRow, pressed && { backgroundColor: colors.surfaceAlt }]}
                      >
                        <Avatar name={row.user.name} uri={row.user.profileImageUrl} size={36} />
                        <View style={styles.flex}>
                          <Text variant="bodyStrong" style={styles.rowTitle} numberOfLines={1}>
                            {row.user.name}
                          </Text>
                          <Text variant="small" color="muted" style={styles.rowSub} numberOfLines={1}>
                            {roleLabel(row.user.role)} · {line}
                          </Text>
                        </View>
                        <View style={styles.score}>
                          <Text variant="heading" color={tone === "neutral" ? colors.textFaint : toneColors(colors, tone).fg}>
                            {perf?.score ?? "—"}
                          </Text>
                          <Text variant="label" color="faint" style={styles.scoreLabel}>
                            score
                          </Text>
                        </View>
                      </Pressable>
                    );
                  })}
                </ListCard>
              </View>
            ) : null}

            {data?.summary ? (
              <View style={styles.section}>
                <SectionTitle title="Pipeline" action="Leads" onAction={() => navigation.navigate("Tabs", { screen: "Leads" })} />
                <Card style={styles.pipeline}>
                  {LEAD_STAGES.map((stage) => (
                    <View key={stage.key} style={styles.stageRow}>
                      <Text variant="small" color="muted" style={styles.stageLabel}>
                        {stage.label}
                      </Text>
                      <View style={styles.flex}>
                        <ProgressBar height={22} value={Math.max(0.02, stages[stage.key] / stageMax)} color={stage.key === "CLOSED" ? colors.success : colors.primary} />
                      </View>
                      <Text variant="smallStrong" style={styles.stageCount}>
                        {stages[stage.key]}
                      </Text>
                    </View>
                  ))}
                </Card>
              </View>
            ) : null}
          </View>
        )}
      </ScrollView>
    </View>
  );
};

const StripTile = ({ value, label, tone }: { value: string | number; label: string; tone: Tone }) => {
  const { colors } = useTheme();
  const { fg, bg } = toneColors(colors, tone);
  return (
    <View style={[styles.stripTile, { backgroundColor: bg }]}>
      <Text variant="heading" color={fg} style={styles.stripValue}>
        {String(value)}
      </Text>
      <Text variant="tiny" color="muted" style={styles.stripLabel} numberOfLines={1}>
        {label}
      </Text>
    </View>
  );
};

const styles = StyleSheet.create({
  flex: { flex: 1, minWidth: 0 },
  scroll: { paddingBottom: 28 },
  header: { paddingHorizontal: 18, paddingBottom: 16, borderBottomWidth: 1, gap: 14 },
  headRow: { flexDirection: "row", alignItems: "center", gap: 10 },
  hi: { fontSize: 24, lineHeight: 30 },
  bell: { width: 42, height: 42, borderRadius: 14, alignItems: "center", justifyContent: "center" },
  dot: { position: "absolute", top: 9, right: 10, width: 8, height: 8, borderRadius: 4 },
  strip: { flexDirection: "row", gap: 6 },
  connection: { marginHorizontal: 18, marginTop: 12, marginBottom: 0 },
  stripTile: { flex: 1, borderRadius: 14, paddingVertical: 10, paddingHorizontal: 6, alignItems: "center", gap: 1 },
  stripValue: { fontSize: 17 },
  stripLabel: { fontFamily: "PlusJakartaSans_600SemiBold" },
  loading: { paddingVertical: 80 },
  content: { padding: gutter, gap: 16 },
  section: { gap: 8 },
  row: { flexDirection: "row", alignItems: "center", gap: 12, padding: 12 },
  teamRow: { gap: 10, paddingVertical: 10 },
  rowTitle: { fontSize: 13 },
  rowSub: { fontSize: 11.5 },
  count: { minWidth: 22, height: 22, borderRadius: 11, paddingHorizontal: 6, alignItems: "center", justifyContent: "center" },
  countText: { fontSize: 11, fontFamily: "PlusJakartaSans_800ExtraBold" },
  inline: { flexDirection: "row", alignItems: "center", gap: 8 },
  score: { alignItems: "flex-end" },
  scoreLabel: { fontSize: 9.5, letterSpacing: 0 },
  pipeline: { gap: 10 },
  stageRow: { flexDirection: "row", alignItems: "center", gap: 10 },
  stageLabel: { width: 74, fontSize: 11.5, fontFamily: "PlusJakartaSans_600SemiBold" },
  stageCount: { width: 34, textAlign: "right", fontSize: 12.5, fontFamily: "PlusJakartaSans_800ExtraBold" },
});
