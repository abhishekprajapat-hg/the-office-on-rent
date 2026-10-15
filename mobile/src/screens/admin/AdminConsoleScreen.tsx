import React from "react";
import { Pressable, RefreshControl, ScrollView, StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { loadApprovals } from "../../api/approvals";
import { getTeamAttendance, getViolations } from "../../api/attendance";
import { getMetaIntegration } from "../../api/admin";
import { listUsers } from "../../api/users";
import { useUser } from "../../auth/AuthProvider";
import { useQuery } from "../../lib/useQuery";
import type { RootScreenProps } from "../../navigation/types";
import { useTheme } from "../../theme/ThemeProvider";
import { CountBubble, Icon, IconTile, Text, type IconName } from "../../ui";
import type { Tone } from "../../theme/tokens";

const settle = <T,>(promise: Promise<T>, fallback: T) => promise.catch(() => fallback);

/* Design 37: the admin's console - headcount up top, then a tile per admin job. */
export const AdminConsoleScreen = ({ navigation }: RootScreenProps<"AdminConsole">) => {
  const me = useUser();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const { data, refreshing, refresh } = useQuery(async () => {
    const [users, attendance, approvals, violations, meta] = await Promise.all([
      settle(listUsers(), []),
      settle(getTeamAttendance(), { summary: null, rows: [] }),
      settle(loadApprovals(), []),
      settle(getViolations(new Date().toISOString().slice(0, 7)), null),
      settle(getMetaIntegration(), null),
    ]);
    const active = users.filter((user) => user.isActive !== false);
    return {
      employees: active.length,
      roles: new Set(active.map((user) => user.role)).size,
      activeToday: attendance.summary?.checkedIn ?? attendance.rows.filter((row) => row.attendance?.checkInAt).length,
      pending: approvals.filter((item) => item.status === "PENDING").length,
      approvalKinds: [...new Set(approvals.filter((item) => item.status === "PENDING").map((item) => item.kind))],
      alerts: (violations?.violations || []).filter((item) => item.active && !item.excused).length,
      meta,
    };
  }, []);

  const kindWords: Record<string, string> = { leave: "leave", delete: "deletes", fix: "fixes", payment: "payments", inventory: "inventory", status: "status", user: "users" };
  const tiles: { icon: IconName; tone: Tone; label: string; sub: string; badge?: number; onPress: () => void }[] = [
    { icon: "people", tone: "primary", label: "Users", sub: data ? `${data.employees} · ${data.roles} roles` : "Team & roles", onPress: () => navigation.navigate("Users") },
    {
      icon: "checkmark-done",
      tone: "warning",
      label: "Approvals",
      sub: data?.approvalKinds.length ? data.approvalKinds.slice(0, 3).map((key) => kindWords[key] || key).join(", ").replace(/^\w/, (c) => c.toUpperCase()) : "Nothing waiting",
      badge: data?.pending,
      onPress: () => navigation.navigate("Approvals"),
    },
    { icon: "sparkles", tone: "violet", label: "Assistant", sub: "Ask about leads & stock", onPress: () => navigation.navigate("Assistant") },
    { icon: "key", tone: "violet", label: "Page access", sub: "Per-user modules", onPress: () => navigation.navigate("Users", { focus: "access" }) },
    { icon: "megaphone", tone: "primary", label: "Broadcast", sub: "Notify everyone", onPress: () => navigation.navigate("Broadcast") },
    {
      icon: "logo-facebook",
      tone: "primary",
      label: "Meta Ads",
      sub: data?.meta ? (data.meta.readiness?.isReady ? `${data.meta.pageIds.length} page${data.meta.pageIds.length === 1 ? "" : "s"} live` : "Not connected") : "Lead sync",
      onPress: () => navigation.navigate("MetaAds"),
    },
    { icon: "warning", tone: "danger", label: "Alerts", sub: "Violations & SLA", badge: data?.alerts, onPress: () => navigation.navigate("Tabs", { screen: "Attendance" }) },
    { icon: "time", tone: "success", label: "Shifts & rules", sub: "Grace, geofence", onPress: () => navigation.navigate("SystemSettings", { section: "shift" }) },
    { icon: "settings", tone: "neutral", label: "System", sub: "Company settings", onPress: () => navigation.navigate("SystemSettings", { section: "company" }) },
  ];

  return (
    <ScrollView
      style={{ backgroundColor: colors.bg }}
      contentContainerStyle={{ paddingBottom: insets.bottom + 24 }}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={colors.onInk} />}
    >
      <View style={[styles.hero, { backgroundColor: colors.ink, paddingTop: insets.top + 8 }]}>
        <View style={styles.headRow}>
          <Pressable accessibilityRole="button" accessibilityLabel="Back" hitSlop={10} onPress={() => navigation.goBack()}>
            <Icon name="chevron-back" size={24} color={colors.onInk} />
          </Pressable>
          <Text variant="title" color={colors.onInk} style={styles.title}>
            Admin
          </Text>
          <View style={[styles.rolePill, { backgroundColor: colors.primary }]}>
            <Text variant="tiny" color={colors.onPrimary} style={styles.roleText}>
              {me.role === "ADMIN" ? "Super admin" : "Manager"}
            </Text>
          </View>
        </View>
        <View style={styles.stats}>
          {[
            [data?.employees ?? "–", "Employees"],
            [data?.activeToday ?? "–", "Active today"],
            [data?.pending ?? "–", "Pending"],
          ].map(([value, label]) => (
            <View key={String(label)} style={styles.stat}>
              <Text variant="title" color={colors.onInk} style={styles.statValue}>
                {String(value)}
              </Text>
              <Text variant="tiny" color="rgba(255,255,255,0.6)">
                {label}
              </Text>
            </View>
          ))}
        </View>
      </View>

      <View style={styles.grid}>
        {tiles.map((tile) => (
          <Pressable
            key={tile.label}
            accessibilityRole="button"
            accessibilityLabel={tile.label}
            onPress={tile.onPress}
            style={({ pressed }) => [styles.tile, { backgroundColor: pressed ? colors.surfaceAlt : colors.surface, borderColor: colors.border }]}
          >
            <View style={styles.tileTop}>
              <IconTile icon={tile.icon} tone={tile.tone} size={36} iconSize={18} />
              {tile.badge ? <CountBubble count={tile.badge > 99 ? "99+" : tile.badge} tone="danger" /> : null}
            </View>
            <Text variant="bodyStrong" style={styles.tileLabel}>
              {tile.label}
            </Text>
            <Text variant="tiny" color="muted" numberOfLines={1}>
              {tile.sub}
            </Text>
          </Pressable>
        ))}
      </View>
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  hero: { paddingHorizontal: 16, paddingBottom: 18, gap: 16, borderBottomLeftRadius: 24, borderBottomRightRadius: 24 },
  headRow: { flexDirection: "row", alignItems: "center", gap: 10 },
  title: { flex: 1, fontSize: 24 },
  rolePill: { borderRadius: 999, paddingHorizontal: 10, paddingVertical: 4 },
  roleText: { fontFamily: "PlusJakartaSans_700Bold" },
  stats: { flexDirection: "row", gap: 8 },
  stat: { flex: 1, backgroundColor: "rgba(255,255,255,0.08)", borderRadius: 14, padding: 10, gap: 2 },
  statValue: { fontSize: 20 },
  grid: { flexDirection: "row", flexWrap: "wrap", gap: 10, padding: 14 },
  tile: { width: "48.4%", borderWidth: 1, borderRadius: 18, padding: 14, gap: 4 },
  tileTop: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 6 },
  tileLabel: { fontSize: 14 },
});
