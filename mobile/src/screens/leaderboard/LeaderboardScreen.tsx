import React, { useState } from "react";
import { Pressable, RefreshControl, ScrollView, StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { StatusBar } from "expo-status-bar";
import { useIsFocused, useNavigation } from "@react-navigation/native";
import { errorMessage } from "../../api/client";
import { assignTarget, getLeaderboard, getMyTargets, type TargetView } from "../../api/targets";
import { firstName, initials, monthKeyOf, monthLabel } from "../../lib/format";
import { parseAmount } from "../../lib/money";
import { useQuery } from "../../lib/useQuery";
import { useTheme } from "../../theme/ThemeProvider";
import { gutter } from "../../theme/tokens";
import { Avatar, Button, Card, ErrorState, Field, Icon, InlineError, ListCard, Loading, ProgressBar, Text } from "../../ui";
import { PickerSheet } from "../../ui/PickerSheet";
import { Sheet } from "../../ui/Sheet";
import { compactRupees } from "../finance/FinanceScreen";

const RING = ["#c9d4fb", "#ffcf5a", "#e5b38b"]; // 2nd, 1st, 3rd

/* Design 31 - blue podium, ranked list, my targets. Web: reports/RoleLeaderboard + targets. */
export const LeaderboardScreen = () => {
  const navigation = useNavigation();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const focused = useIsFocused();
  const month = monthKeyOf();
  const [role, setRole] = useState<string>("");
  const [rolePicker, setRolePicker] = useState(false);
  const [assigning, setAssigning] = useState(false);

  const { data, loading, error, refreshing, refresh } = useQuery(async () => {
    const [board, targets] = await Promise.all([getLeaderboard({ ...(role ? { role } : {}), windowDays: 30 }), getMyTargets(month).catch(() => null)]);
    return { board, targets };
  }, [role, month]);

  const rows = data?.board.leaderboard || [];
  const podium = [rows[1], rows[0], rows[2]];
  const heights = [70, 96, 54];
  const sizes = [46, 56, 42];

  return (
    <View style={[styles.flex, { backgroundColor: colors.bg }]}>
      {focused ? <StatusBar style="light" /> : null}
      <ScrollView refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={colors.onPrimary} />} contentContainerStyle={styles.scroll}>
        <View style={[styles.hero, { backgroundColor: colors.hero, paddingTop: insets.top }]}>
          <View style={styles.bar}>
            <Pressable accessibilityRole="button" accessibilityLabel="Back" hitSlop={10} onPress={() => navigation.goBack()}>
              <Icon name="chevron-back" size={22} color={colors.onPrimary} />
            </Pressable>
            <Text variant="body" color={colors.onPrimary} style={styles.barTitle}>
              Leaderboard · {monthLabel(month).split(" ")[0]}
            </Text>
            <View style={styles.barSide} />
          </View>
          {data?.board.allowedRoleFilters.length && data.board.allowedRoleFilters.length > 1 ? (
            <View style={styles.roles}>
              <Pressable accessibilityRole="button" accessibilityLabel="Change role" onPress={() => setRolePicker(true)} style={styles.roleChip}>
                <Text variant="smallStrong" color={colors.onPrimary}>
                  {data.board.allowedRoleFilters.find((option) => option.value === (role || data.board.role))?.label || "Role"}
                </Text>
                <Icon name="chevron-down" size={14} color={colors.onPrimary} />
              </Pressable>
              <PickerSheet
                visible={rolePicker}
                title="Rank by role"
                items={data.board.allowedRoleFilters.map((option) => ({ key: option.value, label: option.label }))}
                selected={role || data.board.role}
                onPick={(key) => {
                  setRole(key);
                  setRolePicker(false);
                }}
                onClose={() => setRolePicker(false)}
              />
            </View>
          ) : null}
          {loading ? (
            <View style={styles.podiumLoading}>
              <Loading />
            </View>
          ) : (
            <View style={styles.podium}>
              {podium.map((row, index) => (
                <View key={index} style={styles.podiumCol}>
                  {row ? (
                    <>
                      <View style={[styles.medal, { width: sizes[index], height: sizes[index], borderRadius: sizes[index]! / 2, borderColor: RING[index] }]}>
                        <Text variant="bodyStrong" color={colors.primary} style={styles.medalText}>
                          {initials(row.name)}
                        </Text>
                      </View>
                      <Text variant="smallStrong" color={colors.onPrimary} numberOfLines={1}>
                        {firstName(row.name)}
                        {row.isSelf ? " (you)" : ""}
                      </Text>
                      <View style={[styles.step, { height: heights[index] }]}>
                        <Text variant="title" color={colors.onPrimary}>
                          {row.rank}
                        </Text>
                        <Text variant="tiny" color={colors.onPrimaryMuted} style={styles.stepSub}>
                          {row.closedLeads} closed
                        </Text>
                      </View>
                    </>
                  ) : null}
                </View>
              ))}
            </View>
          )}
        </View>

        {error ? <ErrorState message={error} onRetry={refresh} /> : null}

        <View style={styles.content}>
          {rows.length > 3 ? (
            <ListCard>
              {rows.slice(3).map((row) => (
                <View key={row.userId} style={[styles.row, row.isSelf && { backgroundColor: colors.primarySoft }]}>
                  <Text variant="smallStrong" color="muted" style={styles.rank}>
                    {row.rank}
                  </Text>
                  <Avatar name={row.name} uri={row.profileImageUrl} size={34} />
                  <View style={styles.flex}>
                    <Text variant="bodyStrong" style={styles.name} numberOfLines={1}>
                      {row.name}
                      {row.isSelf ? " (you)" : ""}
                    </Text>
                    <Text variant="tiny" color="muted" style={styles.sub}>
                      {row.totalLeads} leads · {row.siteVisits} visits · {row.conversionRate}%
                    </Text>
                  </View>
                  <Text variant="smallStrong" style={styles.value}>
                    {row.closedLeads}
                  </Text>
                </View>
              ))}
            </ListCard>
          ) : null}
          {data && !rows.length ? (
            <Card>
              <Text variant="small" color="muted">
                No one to rank yet for {data.board.roleLabel || "this role"}.
              </Text>
            </Card>
          ) : null}
          {data ? (
            <Text variant="tiny" color="faint" align="center">
              Ranked by closures over the last {data.board.windowDays} days · {data.board.roleLabel}
            </Text>
          ) : null}

          {data?.targets?.myTarget ? <TargetCard title="My targets" target={data.targets.myTarget} /> : null}

          {data?.targets?.canAssign ? (
            <>
              <View style={styles.teamHead}>
                <Text variant="heading" style={styles.flex}>
                  Team targets · {monthLabel(month).split(" ")[0]}
                </Text>
                <Pressable onPress={() => setAssigning(true)} hitSlop={8}>
                  <Text variant="smallStrong" color="primary">
                    Set target
                  </Text>
                </Pressable>
              </View>
              {data.targets.outgoing.length ? (
                data.targets.outgoing.map((target) => <TargetCard key={target._id} title={target.assignedTo?.name || "Teammate"} target={target} />)
              ) : (
                <Card>
                  <Text variant="small" color="muted">
                    No targets set for your team this month.
                  </Text>
                </Card>
              )}
            </>
          ) : null}
        </View>
      </ScrollView>
      {data?.targets ? (
        <AssignSheet visible={assigning} month={month} reports={data.targets.assignableReports} onClose={() => setAssigning(false)} onDone={refresh} />
      ) : null}
    </View>
  );
};

export const TargetCard = ({ title, target }: { title: string; target: TargetView }) => {
  const { colors } = useTheme();
  const rows = [
    { label: "Closures", value: target.achievements.closedDealsAchieved, goal: null as number | null, color: colors.primary },
    { label: "Leads", value: target.achievements.leadsAchieved, goal: target.leadsTarget, color: colors.primary },
    { label: "Site visits", value: target.achievements.siteVisitsAchieved, goal: target.siteVisitTarget, color: colors.violet },
    { label: "Revenue", value: target.achievements.revenueAchieved, goal: target.revenueTarget, color: colors.success, money: true },
  ].filter((row) => row.goal);
  return (
    <Card style={styles.targets}>
      <Text variant="heading" style={styles.targetTitle}>
        {title}
      </Text>
      {rows.map((row) => (
        <View key={row.label} style={styles.target}>
          <View style={styles.targetHead}>
            <Text variant="small" style={styles.targetLabel}>
              {row.label}
            </Text>
            <Text variant="small" color="muted">
              <Text variant="smallStrong">{row.money ? compactRupees(row.value) : row.value}</Text> / {row.money ? compactRupees(row.goal) : row.goal}
            </Text>
          </View>
          <ProgressBar height={8} value={row.goal ? row.value / row.goal : 0} color={row.color} />
        </View>
      ))}
      {target.notes ? (
        <Text variant="tiny" color="faint">
          {target.notes}
        </Text>
      ) : null}
    </Card>
  );
};

const AssignSheet = ({
  visible,
  month,
  reports,
  onClose,
  onDone,
}: {
  visible: boolean;
  month: string;
  reports: { _id: string; name: string; roleLabel?: string }[];
  onClose: () => void;
  onDone: () => void;
}) => {
  const [person, setPerson] = useState<string>("");
  const [picking, setPicking] = useState(false);
  const [leads, setLeads] = useState("");
  const [visits, setVisits] = useState("");
  const [revenue, setRevenue] = useState("");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const chosen = reports.find((row) => row._id === person);
  const save = async () => {
    if (!person) return setError("Pick who the target is for.");
    const payload = { month, assignedToId: person, leadsTarget: Number(leads) || 0, siteVisitTarget: Number(visits) || 0, revenueTarget: parseAmount(revenue) || 0, notes };
    if (!payload.leadsTarget && !payload.siteVisitTarget && !payload.revenueTarget) return setError("Set at least one target above zero.");
    setSaving(true);
    setError(null);
    try {
      await assignTarget(payload);
      onClose();
      onDone();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setSaving(false);
    }
  };
  return (
    <>
      <Sheet
        visible={visible && !picking}
        title="Set a monthly target"
        subtitle={monthLabel(month)}
        onClose={onClose}
        footer={
          <>
            <InlineError message={error} />
            <Button label="Save target" loading={saving} onPress={save} />
          </>
        }
      >
        <Button variant="secondary" icon="person-outline" label={chosen ? `${chosen.name} · ${chosen.roleLabel || ""}` : "Choose teammate"} onPress={() => setPicking(true)} />
        <Field label="Leads" value={leads} onChangeText={setLeads} keyboardType="number-pad" placeholder="0" />
        <Field label="Site visits" value={visits} onChangeText={setVisits} keyboardType="number-pad" placeholder="0" />
        <Field label="Revenue (₹)" value={revenue} onChangeText={setRevenue} keyboardType="decimal-pad" placeholder="e.g. 6,00,000" />
        <Field label="Notes" value={notes} onChangeText={setNotes} placeholder="Optional" multiline />
      </Sheet>
      <PickerSheet
        visible={visible && picking}
        title="Target for"
        items={reports.map((row) => ({ key: row._id, label: row.name, sub: row.roleLabel, avatar: true }))}
        selected={person}
        onPick={(key) => {
          setPerson(key);
          setPicking(false);
        }}
        onClose={() => setPicking(false)}
        searchPlaceholder="Search your team"
      />
    </>
  );
};

const styles = StyleSheet.create({
  flex: { flex: 1, minWidth: 0 },
  scroll: { paddingBottom: 30 },
  hero: { paddingBottom: 18 },
  bar: { flexDirection: "row", alignItems: "center", paddingHorizontal: 12, paddingTop: 2, paddingBottom: 12 },
  barTitle: { flex: 1, textAlign: "center", fontFamily: "PlusJakartaSans_700Bold", fontSize: 16 },
  barSide: { width: 22 },
  roles: { flexDirection: "row", flexWrap: "wrap", justifyContent: "center", gap: 6, paddingHorizontal: 18, paddingBottom: 12 },
  roleChip: { flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 14, paddingVertical: 7, borderRadius: 12, backgroundColor: "rgba(255,255,255,0.16)" },
  podiumLoading: { height: 180 },
  podium: { flexDirection: "row", alignItems: "flex-end", justifyContent: "center", gap: 10, paddingHorizontal: 18 },
  podiumCol: { flex: 1, alignItems: "center", gap: 6 },
  medal: { backgroundColor: "#fff", borderWidth: 3, alignItems: "center", justifyContent: "center" },
  medalText: { fontFamily: "PlusJakartaSans_800ExtraBold" },
  step: { width: "100%", borderTopLeftRadius: 12, borderTopRightRadius: 12, backgroundColor: "rgba(255,255,255,0.16)", alignItems: "center", paddingTop: 8, gap: 1 },
  stepSub: { fontFamily: "PlusJakartaSans_500Medium" },
  content: { padding: gutter, gap: 12 },
  row: { flexDirection: "row", alignItems: "center", gap: 10, paddingHorizontal: 12, paddingVertical: 10 },
  rank: { width: 18, fontSize: 13, fontFamily: "PlusJakartaSans_800ExtraBold" },
  name: { fontSize: 13 },
  sub: { fontFamily: "PlusJakartaSans_500Medium" },
  value: { fontSize: 12.5, fontFamily: "PlusJakartaSans_800ExtraBold" },
  targets: { gap: 12, borderRadius: 18 },
  targetTitle: { fontSize: 13 },
  target: { gap: 5 },
  targetHead: { flexDirection: "row", justifyContent: "space-between" },
  targetLabel: { fontFamily: "PlusJakartaSans_600SemiBold", fontSize: 12.5 },
  teamHead: { flexDirection: "row", alignItems: "baseline", marginTop: 4 },
});
