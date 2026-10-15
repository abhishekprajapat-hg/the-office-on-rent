import React, { useMemo, useState } from "react";
import { FlatList, Pressable, RefreshControl, StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { listConversations, type ChatMessage, type Conversation } from "../../api/chat";
import { useUser } from "../../auth/AuthProvider";
import { chatTime, conversationTitle, otherPerson } from "../../lib/chat";
import { isManagement } from "../../lib/roles";
import { useQuery } from "../../lib/useQuery";
import type { RootScreenProps } from "../../navigation/types";
import { useSocketEvent } from "../../realtime/socket";
import { useTheme } from "../../theme/ThemeProvider";
import { ActionSheet, Avatar, Segmented, EmptyState, ErrorState, Field, Icon, Loading, Text } from "../../ui";

const byRecent = (a: Conversation, b: Conversation) => new Date(b.lastMessageAt || 0).getTime() - new Date(a.lastMessageAt || 0).getTime();
type Filter = "ALL" | "UNREAD" | "GROUPS";

/* Design 33: big title, search, All / Unread / Groups, then a flat list of conversations. */
export const ChatsScreen = ({ navigation }: RootScreenProps<"Chats">) => {
  const user = useUser();
  const myId = user.id || user._id || "";
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<Filter>("ALL");
  const [composeMenu, setComposeMenu] = useState(false);
  const { data, loading, error, refreshing, refresh, setData, reload } = useQuery(async () => (await listConversations()).sort(byRecent), []);
  const canGroup = isManagement(user.role);

  /* A new message anywhere moves its conversation to the top without a refetch. */
  useSocketEvent<{ conversation?: Conversation; message?: ChatMessage }>("messenger:message:new", ({ conversation, message }) => {
    if (!conversation || !message) return;
    const known = (data || []).some((item) => item._id === conversation._id);
    if (!known) return reload();
    setData((list) =>
      (list || [])
        .map((item) =>
          item._id === conversation._id
            ? {
                ...item,
                lastMessage: message.text || conversation.lastMessage,
                lastMessageAt: message.createdAt,
                lastMessageSender: message.sender,
                unreadCount: message.sender?._id === myId ? item.unreadCount : (item.unreadCount || 0) + 1,
              }
            : item,
        )
        .sort(byRecent),
    );
  });

  const unreadRooms = (data || []).filter((item) => (item.unreadCount || 0) > 0).length;
  const rows = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return (data || [])
      .filter((item) => (filter === "UNREAD" ? (item.unreadCount || 0) > 0 : filter === "GROUPS" ? item.type !== "direct" : true))
      .filter((item) => {
        if (!needle) return true;
        const names = [conversationTitle(item, myId), ...item.participants.map((person) => person.name)].join(" ").toLowerCase();
        return names.includes(needle);
      });
  }, [data, filter, query, myId]);

  const compose = () => (canGroup ? setComposeMenu(true) : navigation.navigate("NewChat"));

  return (
    <View style={[styles.flex, { backgroundColor: colors.surface }]}>
      <View style={[styles.header, { paddingTop: insets.top + 8 }]}>
        <View style={styles.headRow}>
          <Pressable accessibilityRole="button" accessibilityLabel="Back" hitSlop={10} onPress={() => navigation.goBack()}>
            <Icon name="chevron-back" size={24} color={colors.primary} />
          </Pressable>
          <Text variant="title" style={styles.title}>
            Chats
          </Text>
          <Pressable accessibilityRole="button" accessibilityLabel="New chat" onPress={compose} style={[styles.compose, { backgroundColor: colors.primary }]}>
            <Icon name="create-outline" size={20} color={colors.onPrimary} />
          </Pressable>
        </View>
        <Field icon="search" compact value={query} onChangeText={setQuery} placeholder="Search people and groups" autoCorrect={false} />
        <Segmented
          options={[
            { key: "ALL", label: "All" },
            { key: "UNREAD", label: unreadRooms ? `Unread · ${unreadRooms}` : "Unread" },
            { key: "GROUPS", label: "Groups" },
          ]}
          value={filter}
          onChange={setFilter}
        />
      </View>

      {loading ? (
        <Loading />
      ) : error ? (
        <ErrorState message={error} onRetry={refresh} />
      ) : (
        <FlatList
          data={rows}
          keyExtractor={(item) => item._id}
          contentContainerStyle={[styles.list, { paddingBottom: insets.bottom + 24 }, !rows.length && styles.grow]}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={colors.primary} colors={[colors.primary]} />}
          keyboardShouldPersistTaps="handled"
          ListEmptyComponent={
            query || filter !== "ALL" ? (
              <EmptyState icon="search" title="No chats match" message="Try another name or clear the filter." actionLabel="Clear" onAction={() => (setQuery(""), setFilter("ALL"))} />
            ) : (
              <EmptyState icon="chatbubbles-outline" title="No conversations yet" message="Start a chat with someone on your team." actionLabel="New chat" onAction={compose} />
            )
          }
          renderItem={({ item, index }) => {
            const title = conversationTitle(item, myId);
            const other = otherPerson(item, myId);
            const unread = item.unreadCount || 0;
            const fromMe = item.lastMessageSender?._id === myId;
            const sender = !fromMe && item.type !== "direct" && item.lastMessageSender?.name ? `${item.lastMessageSender.name.split(" ")[0]}: ` : "";
            return (
              <Pressable
                onPress={() => navigation.navigate("Conversation", { id: item._id, title })}
                accessibilityRole="button"
                accessibilityLabel={`${title}${unread ? `, ${unread} unread` : ""}`}
                style={({ pressed }) => [styles.row, index > 0 && { borderTopColor: colors.border, borderTopWidth: 1 }, pressed && { opacity: 0.7 }]}
              >
                {item.type === "broadcast" ? (
                  <View style={[styles.groupIcon, { backgroundColor: colors.track }]}>
                    <Icon name="megaphone" size={18} color={colors.textMuted} />
                  </View>
                ) : (
                  <Avatar name={other?.name || title} uri={other?.profileImageUrl} size={46} tinted />
                )}
                <View style={styles.flex}>
                  <View style={styles.line}>
                    <Text variant="bodyStrong" numberOfLines={1} style={[styles.flex, styles.name]}>
                      {title}
                    </Text>
                    <Text variant="tiny" color={colors.textFaint}>
                      {chatTime(item.lastMessageAt)}
                    </Text>
                  </View>
                  <View style={styles.line}>
                    <Text variant={unread ? "smallStrong" : "small"} color={unread ? "text" : "muted"} numberOfLines={1} style={styles.flex}>
                      {fromMe ? "You: " : sender}
                      {item.lastMessage || "No messages yet"}
                    </Text>
                    {unread ? (
                      <View style={[styles.unread, { backgroundColor: colors.primary }]}>
                        <Text variant="tiny" color="onPrimary" style={styles.unreadText}>
                          {unread > 99 ? "99+" : unread}
                        </Text>
                      </View>
                    ) : null}
                  </View>
                </View>
              </Pressable>
            );
          }}
        />
      )}

      <ActionSheet
        visible={composeMenu}
        onClose={() => setComposeMenu(false)}
        title="Start a conversation"
        actions={[
          { key: "chat", icon: "chatbubble-outline", label: "New chat", hint: "One-to-one with a teammate", onPress: () => navigation.navigate("NewChat") },
          { key: "group", icon: "people-outline", label: "New group", hint: "Pick members and name it", onPress: () => navigation.navigate("NewChat", { group: true }) },
          { key: "broadcast", icon: "megaphone-outline", label: "Broadcast", hint: "Notify everyone, or one role", onPress: () => navigation.navigate("Broadcast") },
        ]}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  flex: { flex: 1, minWidth: 0 },
  grow: { flexGrow: 1 },
  header: { paddingHorizontal: 14, gap: 12, paddingBottom: 6 },
  headRow: { flexDirection: "row", alignItems: "center", gap: 10 },
  title: { flex: 1, fontSize: 26 },
  compose: { width: 44, height: 44, borderRadius: 14, alignItems: "center", justifyContent: "center" },
  chips: { flexDirection: "row", gap: 6 },
  list: { paddingHorizontal: 14 },
  row: { flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 12 },
  name: { fontSize: 14 },
  groupIcon: { width: 46, height: 46, borderRadius: 15, alignItems: "center", justifyContent: "center" },
  line: { flexDirection: "row", alignItems: "center", gap: 8 },
  unread: { minWidth: 18, height: 18, borderRadius: 9, paddingHorizontal: 5, alignItems: "center", justifyContent: "center" },
  unreadText: { fontSize: 10.5 },
});
