import React, { useLayoutEffect } from "react";
import { FlatList, Platform, RefreshControl, StyleSheet, View } from "react-native";
import { listConversations, type ChatMessage, type Conversation } from "../../api/chat";
import { useUser } from "../../auth/AuthProvider";
import { chatTime, conversationTitle, otherPerson } from "../../lib/chat";
import { useQuery } from "../../lib/useQuery";
import type { RootScreenProps } from "../../navigation/types";
import { useSocketEvent } from "../../realtime/socket";
import { useTheme } from "../../theme/ThemeProvider";
import { radius, space } from "../../theme/tokens";
import { Avatar, Card, EmptyState, ErrorState, HeaderButton, Icon, Loading, Text } from "../../ui";

const byRecent = (a: Conversation, b: Conversation) =>
  new Date(b.lastMessageAt || 0).getTime() - new Date(a.lastMessageAt || 0).getTime();

export const ChatsScreen = ({ navigation }: RootScreenProps<"Chats">) => {
  const user = useUser();
  const myId = user.id || user._id || "";
  const { colors } = useTheme();
  const { data, loading, error, refreshing, refresh, setData, reload } = useQuery(async () => (await listConversations()).sort(byRecent), []);

  useLayoutEffect(() => {
    navigation.setOptions({
      headerRight: () => (
        <View style={Platform.OS === "web" ? styles.webInset : undefined}>
          <HeaderButton icon="create-outline" label="New chat" onPress={() => navigation.navigate("NewChat")} />
        </View>
      ),
    });
  }, [navigation]);

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

  if (loading) return <Loading />;
  if (error) return <ErrorState message={error} onRetry={refresh} />;

  return (
    <FlatList
      style={{ backgroundColor: colors.bg }}
      data={data || []}
      keyExtractor={(item) => item._id}
      contentContainerStyle={[styles.list, !data?.length && styles.grow]}
      ItemSeparatorComponent={() => <View style={styles.separator} />}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={colors.primary} colors={[colors.primary]} />}
      ListEmptyComponent={
        <EmptyState icon="chatbubbles-outline" title="No conversations yet" message="Start a chat with someone on your team." actionLabel="New chat" onAction={() => navigation.navigate("NewChat")} />
      }
      renderItem={({ item }) => {
        const title = conversationTitle(item, myId);
        const other = otherPerson(item, myId);
        const unread = item.unreadCount || 0;
        const fromMe = item.lastMessageSender?._id === myId;
        return (
          <Card
            onPress={() => navigation.navigate("Conversation", { id: item._id, title })}
            style={styles.row}
            accessibilityLabel={`${title}${unread ? `, ${unread} unread` : ""}`}
          >
            {other ? (
              <Avatar name={other.name} uri={other.profileImageUrl} size={48} />
            ) : (
              <View style={[styles.groupIcon, { backgroundColor: colors.primarySoft }]}>
                <Icon name={item.type === "broadcast" ? "megaphone" : "people"} size={22} color={colors.primary} />
              </View>
            )}
            <View style={styles.flex}>
              <View style={styles.top}>
                <Text variant="bodyStrong" numberOfLines={1} style={styles.flex}>
                  {title}
                </Text>
                <Text variant="tiny" color={unread ? colors.primary : colors.textFaint}>
                  {chatTime(item.lastMessageAt)}
                </Text>
              </View>
              <View style={styles.top}>
                <Text variant="small" color={unread ? "text" : "muted"} numberOfLines={1} style={styles.flex}>
                  {fromMe ? "You: " : ""}
                  {item.lastMessage || "No messages yet"}
                </Text>
                {unread ? (
                  <View style={[styles.unread, { backgroundColor: colors.primary }]}>
                    <Text variant="tiny" color="onPrimary">
                      {unread > 99 ? "99+" : unread}
                    </Text>
                  </View>
                ) : null}
              </View>
            </View>
          </Card>
        );
      }}
    />
  );
};

const styles = StyleSheet.create({
  flex: { flex: 1 },
  grow: { flexGrow: 1 },
  list: { padding: space.lg },
  separator: { height: space.sm },
  row: { flexDirection: "row", alignItems: "center", gap: space.md, paddingVertical: space.md },
  groupIcon: { width: 48, height: 48, borderRadius: 24, alignItems: "center", justifyContent: "center" },
  top: { flexDirection: "row", alignItems: "center", gap: space.sm },
  unread: { minWidth: 20, height: 20, borderRadius: radius.pill, paddingHorizontal: 6, alignItems: "center", justifyContent: "center" },
  webInset: { marginRight: space.lg },
});
