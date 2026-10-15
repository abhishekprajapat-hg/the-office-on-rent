import React, { useLayoutEffect, useMemo } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { useNavigation } from "@react-navigation/native";
import { getTodayFollowUps } from "../../api/leads";
import { useAuth, useUser } from "../../auth/AuthProvider";
import { canOpenPage } from "../../api/access";
import { formatAgo, formatTime, isOverdue } from "../../lib/format";
import { useQuery } from "../../lib/useQuery";
import { feed, useFeed, type FeedItem, type FeedKind } from "../../notifications/feed";
import { useTheme } from "../../theme/ThemeProvider";
import type { Tone } from "../../theme/tokens";
import { Body, EmptyState, GroupLabel, IconTile, ListCard, Text, type IconName } from "../../ui";

const KIND: Record<FeedKind | "overdue", { icon: IconName; tone: Tone }> = {
  overdue: { icon: "alarm", tone: "danger" },
  lead: { icon: "person-add", tone: "primary" },
  chat: { icon: "chatbubbles", tone: "violet" },
  task: { icon: "checkbox", tone: "primary" },
  request: { icon: "checkmark-done", tone: "warning" },
  push: { icon: "notifications", tone: "primary" },
  broadcast: { icon: "megaphone", tone: "neutral" },
};

type Row = FeedItem & { overdue?: boolean };

/* Design 06: Today / Earlier groups, tinted icon, unread dot, "Read all". */
export const NotificationsScreen = () => {
  const navigation = useNavigation();
  const user = useUser();
  const { access } = useAuth();
  const leadsAllowed = canOpenPage(user, access, "leads") || canOpenPage(user, access, "my_leads");
  const { colors } = useTheme();
  const items = useFeed();
  const { data: followUps, refreshing, refresh } = useQuery(() => (leadsAllowed ? getTodayFollowUps(20) : Promise.resolve([])), [leadsAllowed]);

  useLayoutEffect(() => {
    navigation.setOptions({
      headerRight: () => (
        <Pressable accessibilityRole="button" onPress={() => feed.markAllRead()} hitSlop={8}>
          <Text variant="smallStrong" color="primary">
            Read all
          </Text>
        </Pressable>
      ),
    });
  }, [navigation]);

  const rows = useMemo<Row[]>(() => {
    const overdue: Row[] = (followUps || [])
      .filter((lead) => isOverdue(lead.nextFollowUp))
      .map((lead) => ({
        id: `overdue:${lead._id}`,
        kind: "push",
        overdue: true,
        title: "Follow-up overdue",
        body: `${lead.name} was due at ${formatTime(lead.nextFollowUp)}`,
        at: lead.nextFollowUp || new Date().toISOString(),
        read: false,
        link: `leads/${lead._id}`,
      }));
    const visible = items.filter((item) => {
      const link = item.link || "";
      if (link.startsWith("leads")) return leadsAllowed;
      if (link.startsWith("tasks")) return canOpenPage(user, access, "tasks");
      if (link.startsWith("chats")) return canOpenPage(user, access, "chat");
      if (link === "approvals") return canOpenPage(user, access, "admin_console");
      if (link === "attendance") return canOpenPage(user, access, "attendance");
      return true;
    });
    return [...overdue, ...visible].sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime());
  }, [items, followUps, leadsAllowed, user, access]);

  const today = new Date().toDateString();
  const groups = [
    { label: "Today", rows: rows.filter((row) => new Date(row.at).toDateString() === today) },
    { label: "Earlier", rows: rows.filter((row) => new Date(row.at).toDateString() !== today) },
  ].filter((group) => group.rows.length);

  const open = (row: Row) => {
    if (!row.overdue) feed.markRead(row.id);
    const link = row.link || "";
    let match: RegExpMatchArray | null;
    if ((match = link.match(/^leads\/(\w+)$/))) navigation.navigate("LeadDetail", { leadId: match[1]! });
    else if ((match = link.match(/^tasks\/(\w+)$/))) navigation.navigate("TaskDetail", { taskId: match[1]! });
    else if ((match = link.match(/^chats\/(\w+)$/))) navigation.navigate("Conversation", { id: match[1]! });
    else if (link === "chats") navigation.navigate("Chats");
    else if (link === "approvals") navigation.navigate("Approvals");
    else if (link === "leads") navigation.navigate("Tabs", { screen: "Leads" });
    else if (link === "tasks") navigation.navigate("Tabs", { screen: "Tasks" });
    else if (link === "attendance") navigation.navigate("Tabs", { screen: "Attendance" });
  };

  if (!groups.length) {
    return <EmptyState icon="sparkles" tone="success" title="You're all caught up" message="New leads, mentions, tasks and approvals will show up here." />;
  }

  return (
    <Body refreshing={refreshing} onRefresh={refresh} style={styles.body}>
      {groups.map((group) => (
        <View key={group.label} style={styles.group}>
          <GroupLabel>{group.label}</GroupLabel>
          <ListCard>
            {group.rows.map((row) => {
              const look = KIND[row.overdue ? "overdue" : row.kind];
              const unread = !row.read;
              return (
                <Pressable
                  key={row.id}
                  accessibilityRole="button"
                  accessibilityLabel={`${row.title}. ${row.body}`}
                  onPress={() => open(row)}
                  style={({ pressed }) => [styles.row, pressed && { backgroundColor: colors.surfaceAlt }]}
                >
                  <IconTile icon={look.icon} tone={look.tone} size={36} iconSize={17} />
                  <View style={styles.text}>
                    <Text variant="bodyStrong" style={styles.title} numberOfLines={1}>
                      {row.title}
                    </Text>
                    <Text variant="small" color="muted" style={styles.sub} numberOfLines={2}>
                      {row.body}
                    </Text>
                  </View>
                  <View style={styles.meta}>
                    <Text variant="small" color="faint" style={styles.ago}>
                      {formatAgo(row.at)}
                    </Text>
                    <View style={[styles.dot, { backgroundColor: unread ? colors.primary : "transparent" }]} />
                  </View>
                </Pressable>
              );
            })}
          </ListCard>
        </View>
      ))}
    </Body>
  );
};

const styles = StyleSheet.create({
  body: { gap: 14, paddingTop: 4 },
  group: { gap: 8 },
  row: { flexDirection: "row", gap: 12, padding: 12 },
  text: { flex: 1, minWidth: 0, gap: 2 },
  title: { fontSize: 13 },
  sub: { lineHeight: 16 },
  meta: { alignItems: "flex-end", gap: 6 },
  ago: { fontSize: 11 },
  dot: { width: 8, height: 8, borderRadius: 4 },
});
