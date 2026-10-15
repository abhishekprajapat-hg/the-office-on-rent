import React from "react";
import { Pressable, StyleSheet, View } from "react-native";
import Constants from "expo-constants";
import { useNavigation } from "@react-navigation/native";
import { useAuth, useUser } from "../../auth/AuthProvider";
import { canOpenPage, canDoPageAction } from "../../api/access";
import { canMarkAttendance, isManagement, roleLabel } from "../../lib/roles";
import { initials } from "../../lib/format";
import { useFeed } from "../../notifications/feed";
import { homeKindFor, tabsShown } from "../../lib/roleHome";
import { listConversations } from "../../api/chat";
import { api } from "../../api/client";
import { useQuery } from "../../lib/useQuery";
import { useTheme } from "../../theme/ThemeProvider";
import { space } from "../../theme/tokens";
import { Avatar, CountBubble, GroupLabel, Icon, IconTile, Screen, Text, type IconName } from "../../ui";

export const MoreScreen = () => {
  const user = useUser();
  const { access, refreshAccess } = useAuth();
  const navigation = useNavigation();
  const { colors } = useTheme();

  const role = user.role;
  const unread = useFeed().filter((item) => !item.read).length;
  const allowed = (page: string) => canOpenPage(user, access, page);
  // Modules this role's tab bar doesn't carry (Home by Role) get a tile here instead.
  const inBar = tabsShown(homeKindFor(role), user, access);
  const goTab = (screen: "Leads" | "Tasks" | "Attendance") => navigation.navigate("Tabs", { screen });
  // Badges for the design's tiles: unread chats and leads still waiting in the pool.
  const { data: badges } = useQuery(async () => {
    const [rooms, pool] = await Promise.all([
      allowed("chat") ? listConversations().catch(() => []) : [],
      isManagement(role) && allowed("leads")
        ? api
            .get("/leads", { params: { page: 1, limit: 1, assignedTo: "UNASSIGNED", fields: "_id" } })
            .then((res) => Number(res.data?.pagination?.totalCount ?? res.data?.pagination?.total ?? 0))
            .catch(() => 0)
        : 0,
    ]);
    return { chats: rooms.reduce((sum, room) => sum + (room.unreadCount || 0), 0), pool };
  }, [role, access]);
  // Same four groups as design 41; a tile appears once its module is built and the role may open it.
  const groups: { label: string; items: Tile[] }[] = [
    {
      label: "Sales",
      items: [
        (allowed("leads") || allowed("my_leads")) && !inBar.has("Leads") ? { icon: "people", label: "Leads", onPress: () => goTab("Leads") } : null,
        allowed("inventory") ? { icon: "business", label: "Inventory", onPress: () => navigation.navigate("Inventory") } : null,
        allowed("projects") ? { icon: "albums", label: "Projects", onPress: () => navigation.navigate("Projects") } : null,
        allowed("inventory") && role !== "CHANNEL_PARTNER" ? { icon: "person-circle", label: "Owners & brokers", onPress: () => navigation.navigate("Contacts") } : null,
        allowed("leads") && isManagement(role) ? { icon: "file-tray-full", label: "Lead pool", badge: badges?.pool, onPress: () => navigation.navigate("LeadPool") } : null,
        allowed("leads") && isManagement(role) ? { icon: "git-network", label: "Team pipeline", onPress: () => navigation.navigate("TeamPipeline") } : null,
        (canDoPageAction(user, access, "leads", "create") || canDoPageAction(user, access, "my_leads", "create")) ? { icon: "cloud-upload", label: "Bulk upload", onPress: () => navigation.navigate("BulkUpload") } : null,
      ].filter(Boolean) as Tile[],
    },
    {
      label: "Work",
      items: [
        allowed("chat") ? { icon: "chatbubbles", label: "Team chat", badge: badges?.chats, onPress: () => navigation.navigate("Chats") } : null,
        allowed("calendar") ? { icon: "calendar", label: "Calendar", onPress: () => navigation.navigate("Schedule") } : null,
        allowed("field_ops") ? { icon: "navigate", label: "Field ops", onPress: () => navigation.navigate("FieldOps") } : null,
        { icon: "notifications", label: "Notifications", badge: unread, onPress: () => navigation.navigate("Notifications") },
        allowed("tasks") && !inBar.has("Tasks") ? { icon: "checkbox", label: "Tasks", onPress: () => goTab("Tasks") } : null,
        allowed("attendance") && canMarkAttendance(role) && !inBar.has("Attendance") ? { icon: "finger-print", label: "Attendance", onPress: () => goTab("Attendance") } : null,
        allowed("attendance") ? { icon: "airplane", label: "Leave", onPress: () => navigation.navigate("Leave") } : null,
        isManagement(role) && allowed("tasks") ? { icon: "bar-chart", label: "Team workload", onPress: () => navigation.navigate("TeamWorkload") } : null,
        isManagement(role) && allowed("attendance") ? { icon: "people-circle", label: "Team attendance", onPress: () => navigation.navigate("TeamAttendance") } : null,
      ].filter(Boolean) as Tile[],
    },
    {
      label: "Money & people",
      items: [
        allowed("finance") ? { icon: "cash", label: "Finance", onPress: () => navigation.navigate("Finance") } : null,
        allowed("finance") ? { icon: "trending-up", label: "Revenue", onPress: () => navigation.navigate("Revenue") } : null,
        allowed("salary") && role !== "ADMIN" ? { icon: "wallet", label: "Salary", onPress: () => navigation.navigate("Salary") } : null,
        allowed("salary") && isManagement(role) ? { icon: "people", label: "Team salaries", onPress: () => navigation.navigate("TeamSalary") } : null,
        allowed("leaderboard") ? { icon: "trophy", label: "Leaderboard", onPress: () => navigation.navigate("Leaderboard") } : null,
        allowed("targets") ? { icon: "flag", label: "Targets", onPress: () => navigation.navigate("Targets") } : null,
        allowed("reports") ? { icon: "bar-chart", label: "Reports", onPress: () => navigation.navigate("Reports") } : null,
        allowed("performance") ? { icon: "speedometer", label: "Performance", onPress: () => navigation.navigate("Performance") } : null,
        allowed("attendance") ? { icon: "calendar-number", label: "Attendance history", onPress: () => navigation.navigate("AttendanceHistory") } : null,
      ].filter(Boolean) as Tile[],
    },
    {
      label: "Coworking & admin",
      items: [
        allowed("coworking_booking") ? { icon: "grid", label: "Bookings", onPress: () => navigation.navigate("Bookings") } : null,
        allowed("coworking_clients") ? { icon: "briefcase", label: "Clients", onPress: () => navigation.navigate("Clients") } : null,
        allowed("admin_team") ? { icon: "people", label: "Team access", onPress: () => navigation.navigate("Users") } : null,
        allowed("admin_team") && isManagement(role) ? { icon: "id-card", label: "Roles", onPress: () => navigation.navigate("Roles") } : null,
        allowed("admin_console") ? { icon: "shield-checkmark", label: "Admin", onPress: () => navigation.navigate("AdminConsole") } : null,
        { icon: "settings", label: "Settings", onPress: () => navigation.navigate("Settings") },
        role !== "ADMIN" ? { icon: "hourglass", label: "My requests", onPress: () => navigation.navigate("MyRequests") } : null,
        allowed("admin_console") ? { icon: "checkmark-done", label: "Approvals", onPress: () => navigation.navigate("Approvals") } : null,
      ].filter(Boolean) as Tile[],
    },
  ].filter((group) => group.items.length);

  return (
    <Screen title="More" onRefresh={refreshAccess}>
      <Pressable
        onPress={() => navigation.navigate("Profile")}
        accessibilityRole="button"
        accessibilityLabel="Open profile"
        style={({ pressed }) => [styles.profile, { backgroundColor: pressed ? colors.primaryPressed : colors.hero }]}
      >
        <View style={[styles.meTile, { backgroundColor: colors.surface }]}>
          {user.profileImageUrl ? (
            <Avatar name={user.name} uri={user.profileImageUrl} size={50} />
          ) : (
            <Text variant="title" color={colors.primary} style={styles.meText}>
              {initials(user.name)}
            </Text>
          )}
        </View>
        <View style={styles.flex}>
          <Text variant="heading" color={colors.onPrimary} numberOfLines={1} style={styles.meName}>
            {user.name}
          </Text>
          <Text variant="small" color={colors.onPrimaryMuted} numberOfLines={1}>
            {roleLabel(role)}
          </Text>
        </View>
        <Icon name="chevron-forward" size={17} color={colors.onPrimaryMuted} />
      </Pressable>

      {groups.map((group) => (
        <View key={group.label} style={styles.group}>
          <GroupLabel>{group.label}</GroupLabel>
          <View style={styles.grid}>
            {group.items.map((item) => (
              <Pressable
                key={item.label}
                onPress={item.onPress}
                accessibilityRole="button"
                accessibilityLabel={item.label}
                style={({ pressed }) => [styles.tile, { backgroundColor: pressed ? colors.surfaceAlt : colors.surface, borderColor: colors.border }]}
              >
                <IconTile icon={item.icon} size={34} iconSize={17} />
                {item.badge ? (
                  <View style={styles.badge}>
                    <CountBubble count={item.badge > 99 ? "99+" : item.badge} tone="danger" />
                  </View>
                ) : null}
                <Text variant="tiny" align="center" numberOfLines={2} style={styles.tileLabel}>
                  {item.label}
                </Text>
              </Pressable>
            ))}
            {Array.from({ length: (4 - (group.items.length % 4)) % 4 }, (_, i) => (
              <View key={`pad${i}`} style={styles.tilePad} />
            ))}
          </View>
        </View>
      ))}

    </Screen>
  );
};

type Tile = { icon: IconName; label: string; onPress: () => void; badge?: number };

const styles = StyleSheet.create({
  flex: { flex: 1, minWidth: 0 },
  profile: { flexDirection: "row", alignItems: "center", gap: 12, padding: 14, borderRadius: 20 },
  meTile: { width: 50, height: 50, borderRadius: 16, alignItems: "center", justifyContent: "center", overflow: "hidden" },
  meText: { fontSize: 17 },
  meName: { fontSize: 15.5 },
  group: { gap: 6 },
  grid: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  tile: { flexBasis: "23%", flexGrow: 1, alignItems: "center", gap: 6, paddingVertical: 10, paddingHorizontal: 4, borderRadius: 15, borderWidth: 1 },
  badge: { position: "absolute", top: 6, right: 6, transform: [{ scale: 0.8 }] },
  tilePad: { flexBasis: "23%", flexGrow: 1 },
  tileLabel: { lineHeight: 13 },
  setting: { flexDirection: "row", alignItems: "center", gap: 10, minHeight: 48, paddingHorizontal: 12 },
  settingLabel: { fontFamily: "PlusJakartaSans_600SemiBold", fontSize: 13.5 },
  version: { fontSize: 11, marginTop: space.xs },
});
