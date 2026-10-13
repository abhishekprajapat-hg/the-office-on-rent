import React, { useCallback, useEffect, useRef, useState } from "react";
import { ActivityIndicator, FlatList, Image, KeyboardAvoidingView, Platform, Pressable, StyleSheet, TextInput, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { errorMessage, mediaUrl } from "../../api/client";
import { getMessages, listConversations, markRead, sendMessage, type ChatMessage } from "../../api/chat";
import { useUser } from "../../auth/AuthProvider";
import { chatTime, conversationTitle, mergeMessage, receipt, startsNewDay, type Tick } from "../../lib/chat";
import { formatDate } from "../../lib/format";
import { formatPrice } from "../../lib/money";
import type { RootScreenProps } from "../../navigation/types";
import { useRoomChannel, useSocketEvent } from "../../realtime/socket";
import { useTheme } from "../../theme/ThemeProvider";
import { font, radius, space } from "../../theme/tokens";
import { ErrorState, Icon, Loading, Text, type IconName } from "../../ui";

const PAGE = 40;

export const ConversationScreen = ({ route, navigation }: RootScreenProps<"Conversation">) => {
  const { id, title } = route.params;
  const user = useUser();
  const myId = user.id || user._id || "";
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();

  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [olderLoading, setOlderLoading] = useState(false);
  const [hasOlder, setHasOlder] = useState(true);
  const [draft, setDraft] = useState("");
  const pendingText = useRef(new Map<string, string>());

  useEffect(() => {
    navigation.setOptions({ title: title || "Chat" });
    if (title) return;
    // Opened from a link without a name: look the conversation up for its title.
    listConversations()
      .then((rooms) => {
        const room = rooms.find((item) => item._id === id);
        if (room) navigation.setOptions({ title: conversationTitle(room, myId) });
      })
      .catch(() => {});
  }, [navigation, title, id, myId]);

  const load = useCallback(async () => {
    setError(null);
    try {
      const rows = await getMessages(id, undefined, PAGE);
      setMessages(rows);
      setHasOlder(rows.length >= PAGE);
      markRead(id).catch(() => {});
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    load();
  }, [load]);

  const loadOlder = async () => {
    if (olderLoading || !hasOlder || !messages.length) return;
    setOlderLoading(true);
    try {
      const rows = await getMessages(id, messages[0]!.createdAt, PAGE);
      setMessages((current) => rows.reduce((list, row) => mergeMessage(list, row), current));
      setHasOlder(rows.length >= PAGE);
    } catch {
      // Older history is best-effort; the next scroll tries again.
    } finally {
      setOlderLoading(false);
    }
  };

  useRoomChannel(id);

  useSocketEvent<{ conversation?: { _id: string }; message?: ChatMessage }>("messenger:message:new", ({ conversation, message }) => {
    if (!message || (conversation?._id || message.room) !== id) return;
    setMessages((current) => mergeMessage(current, message));
    if (message.sender?._id !== myId) markRead(id).catch(() => {});
  });

  // Receipts arrive as room events; refresh the ticks on my messages.
  useSocketEvent<{ messageId?: string; roomId?: string; seenBy?: ChatMessage["seenBy"]; deliveredTo?: ChatMessage["deliveredTo"] }>(
    "chat:message:seen",
    (event) => {
      if (event.roomId !== id || !event.messageId) return;
      setMessages((current) => current.map((item) => (item._id === event.messageId ? { ...item, seenBy: event.seenBy || item.seenBy } : item)));
    },
  );
  useSocketEvent<{ roomId?: string; userId?: string }>("chat:room:read", (event) => {
    const reader = String(event.userId || "");
    if (String(event.roomId) !== id || !reader || reader === myId) return;
    // Someone else read the room: every message of mine is now seen by them.
    setMessages((current) =>
      current.map((item) =>
        item.sender?._id === myId && !(item.seenBy || []).some((entry) => entry.user === reader)
          ? { ...item, seenBy: [...(item.seenBy || []), { user: reader, at: new Date().toISOString() }] }
          : item,
      ),
    );
  });

  const send = async (text: string, retryOf?: string) => {
    const body = text.trim();
    if (!body) return;
    const clientId = retryOf || `local-${Date.now()}`;
    pendingText.current.set(clientId, body);
    const optimistic: ChatMessage = {
      _id: clientId,
      room: id,
      sender: { _id: myId, name: user.name },
      type: "text",
      text: body,
      createdAt: new Date().toISOString(),
      localState: "sending",
    };
    setMessages((current) => mergeMessage(current, optimistic, clientId));
    if (!retryOf) setDraft("");
    try {
      const saved = await sendMessage(id, body);
      pendingText.current.delete(clientId);
      if (saved) setMessages((current) => mergeMessage(current, saved, clientId));
    } catch {
      setMessages((current) => current.map((item) => (item._id === clientId ? { ...item, localState: "failed" } : item)));
    }
  };

  if (loading) return <Loading />;
  if (error) return <ErrorState message={error} onRetry={load} />;

  // Inverted list: newest at the bottom, scrolling up loads history.
  const reversed = [...messages].reverse();

  return (
    <KeyboardAvoidingView
      style={[styles.root, { backgroundColor: colors.bg }]}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
      keyboardVerticalOffset={Platform.OS === "ios" ? 90 : 0}
    >
      <FlatList
        inverted
        data={reversed}
        keyExtractor={(item) => item._id}
        contentContainerStyle={styles.list}
        onEndReached={loadOlder}
        onEndReachedThreshold={0.3}
        ListFooterComponent={olderLoading ? <ActivityIndicator color={colors.primary} style={styles.older} /> : null}
        ListEmptyComponent={
          <View style={styles.empty}>
            <Text variant="small" color="muted" align="center">
              No messages yet. Say hello!
            </Text>
          </View>
        }
        renderItem={({ item, index }) => {
          const chronoIndex = messages.length - 1 - index;
          const mine = item.sender?._id === myId;
          return (
            <View>
              {startsNewDay(messages, chronoIndex) ? (
                <Text variant="tiny" color="faint" align="center" style={styles.day}>
                  {formatDate(item.createdAt)}
                </Text>
              ) : null}
              <Bubble
                message={item}
                mine={mine}
                tick={mine ? receipt(item, myId) : null}
                onRetry={item.localState === "failed" ? () => send(pendingText.current.get(item._id) || item.text || "", item._id) : undefined}
                onOpenProperty={(propertyId) => navigation.navigate("PropertyDetail", { id: propertyId })}
              />
            </View>
          );
        }}
      />
      <View style={[styles.composer, { backgroundColor: colors.surface, borderTopColor: colors.border, paddingBottom: insets.bottom + space.sm }]}>
        <TextInput
          value={draft}
          onChangeText={setDraft}
          placeholder="Message"
          placeholderTextColor={colors.textFaint}
          multiline
          maxLength={4000}
          style={[styles.input, { color: colors.text, backgroundColor: colors.surfaceAlt }]}
          accessibilityLabel="Message"
        />
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Send"
          disabled={!draft.trim()}
          onPress={() => send(draft)}
          style={[styles.send, { backgroundColor: draft.trim() ? colors.primary : colors.surfaceAlt }]}
        >
          <Icon name="send" size={18} color={draft.trim() ? colors.onPrimary : colors.textFaint} />
        </Pressable>
      </View>
    </KeyboardAvoidingView>
  );
};

const TICKS: Record<Tick, { icon: IconName; label: string }> = {
  sending: { icon: "time-outline", label: "Sending" },
  failed: { icon: "alert-circle", label: "Not sent" },
  sent: { icon: "checkmark", label: "Sent" },
  delivered: { icon: "checkmark-done", label: "Delivered" },
  seen: { icon: "checkmark-done", label: "Seen" },
};

const Bubble = ({
  message,
  mine,
  tick,
  onRetry,
  onOpenProperty,
}: {
  message: ChatMessage;
  mine: boolean;
  tick: Tick | null;
  onRetry?: () => void;
  onOpenProperty: (id: string) => void;
}) => {
  const { colors } = useTheme();
  const bg = mine ? colors.primary : colors.surface;
  const fg = mine ? colors.onPrimary : colors.text;
  const property = message.sharedProperty;
  const tickColor = tick === "seen" ? (mine ? "#bff5e3" : colors.info) : tick === "failed" ? colors.danger : mine ? "rgba(255,255,255,0.75)" : colors.textFaint;

  return (
    <View style={[styles.bubbleRow, mine ? styles.mineRow : styles.theirRow]}>
      <Pressable
        disabled={!onRetry}
        onPress={onRetry}
        accessibilityLabel={onRetry ? "Message not sent. Tap to retry." : undefined}
        style={[
          styles.bubble,
          { backgroundColor: bg, borderColor: colors.border },
          mine ? styles.mineBubble : styles.theirBubble,
          message.localState === "failed" && { opacity: 0.7 },
        ]}
      >
        {property ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`Open property ${property.title || ""}`}
            onPress={() => property.inventoryId && onOpenProperty(property.inventoryId)}
            style={[styles.property, { backgroundColor: mine ? "rgba(255,255,255,0.14)" : colors.surfaceAlt }]}
          >
            {property.image ? <Image source={{ uri: mediaUrl(property.image) }} style={styles.propertyImage} /> : null}
            <View style={styles.propertyText}>
              <Text variant="smallStrong" color={fg} numberOfLines={2}>
                {property.title}
              </Text>
              {property.price ? (
                <Text variant="tiny" color={fg}>
                  {formatPrice(property.price)}
                </Text>
              ) : null}
              <Text variant="tiny" color={mine ? "rgba(255,255,255,0.8)" : colors.textMuted} numberOfLines={1}>
                {property.location}
              </Text>
            </View>
          </Pressable>
        ) : null}
        {message.text && !property ? (
          <Text variant="body" color={fg}>
            {message.isDeleted ? "This message was deleted" : message.text}
          </Text>
        ) : null}
        <View style={styles.meta}>
          <Text variant="tiny" color={mine ? "rgba(255,255,255,0.75)" : colors.textFaint}>
            {message.localState === "failed" ? "Not sent · tap to retry" : chatTime(message.createdAt, new Date(message.createdAt))}
          </Text>
          {tick ? <Icon name={TICKS[tick].icon} size={14} color={tickColor} /> : null}
        </View>
      </Pressable>
    </View>
  );
};

const styles = StyleSheet.create({
  root: { flex: 1 },
  list: { padding: space.md, gap: 4 },
  older: { paddingVertical: space.md },
  empty: { padding: space.xxl, transform: [{ scaleY: -1 }] },
  day: { paddingVertical: space.sm },
  bubbleRow: { flexDirection: "row", marginVertical: 2 },
  mineRow: { justifyContent: "flex-end" },
  theirRow: { justifyContent: "flex-start" },
  bubble: { maxWidth: "82%", borderRadius: radius.lg, paddingHorizontal: space.md, paddingVertical: space.sm, gap: 4 },
  mineBubble: { borderBottomRightRadius: 4 },
  theirBubble: { borderBottomLeftRadius: 4, borderWidth: StyleSheet.hairlineWidth },
  meta: { flexDirection: "row", alignItems: "center", gap: 4, alignSelf: "flex-end" },
  property: { borderRadius: radius.md, overflow: "hidden", width: 220 },
  propertyImage: { width: 220, height: 110 },
  propertyText: { padding: space.sm, gap: 2 },
  composer: { flexDirection: "row", alignItems: "flex-end", gap: space.sm, paddingHorizontal: space.md, paddingTop: space.sm, borderTopWidth: StyleSheet.hairlineWidth },
  input: { flex: 1, minHeight: 42, maxHeight: 120, borderRadius: 21, paddingHorizontal: space.lg, paddingTop: 11, paddingBottom: 11, fontFamily: font.regular, fontSize: 15 },
  send: { width: 42, height: 42, borderRadius: 21, alignItems: "center", justifyContent: "center" },
});
