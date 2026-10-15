import React, { useCallback, useEffect, useRef, useState } from "react";
import { ActivityIndicator, FlatList, Image, KeyboardAvoidingView, Platform, Pressable, StyleSheet, TextInput, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useFocusEffect } from "@react-navigation/native";
import { errorMessage, mediaUrl } from "../../api/client";
import { clearChat, deleteMessage, getMessages, listConversations, markRead, sendMessage, type ChatMessage, type Conversation } from "../../api/chat";
import { pickDocument, pickImage, uploadFile, type LocalFile } from "../../api/uploads";
import { listUsers } from "../../api/users";
import { dialable } from "../../lib/format";
import { roleLabel } from "../../lib/roles";
import { useUser } from "../../auth/AuthProvider";
import { chatTime, conversationTitle, mergeMessage, receipt, startsNewDay, typingLine, unseenByMe, type Tick } from "../../lib/chat";
import { formatDate } from "../../lib/format";
import { formatPrice } from "../../lib/money";
import type { RootScreenProps } from "../../navigation/types";
import { emitEvent, emitWithAck, useRoomChannel, useSocketEvent } from "../../realtime/socket";
import { chatInbox } from "../../notifications/chatInbox";
import { useTheme } from "../../theme/ThemeProvider";
import { font, radius, space } from "../../theme/tokens";
import { ActionSheet, Avatar, ErrorState, Icon, Loading, Text, type IconName } from "../../ui";
import { Linking } from "react-native";

const PAGE = 40;
// Typing state: stop after 3s without a keystroke; drop someone else's after 6s without news (web REMOTE_TYPING_TIMEOUT_MS).
const LOCAL_TYPING_IDLE_MS = 3000;
const REMOTE_TYPING_TIMEOUT_MS = 6000;

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

  const [room, setRoom] = useState<Conversation | null>(null);
  const [phone, setPhone] = useState<string | null>(null);
  const [attachMenu, setAttachMenu] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [attachError, setAttachError] = useState<string | null>(null);
  const [selected, setSelected] = useState<ChatMessage | null>(null);
  const [roomMenu, setRoomMenu] = useState(false);
  const [confirmClear, setConfirmClear] = useState(false);
  const [typing, setTyping] = useState<Record<string, number>>({});
  const typingTimers = useRef(new Map<string, ReturnType<typeof setTimeout>>());
  const localTyping = useRef<{ on: boolean; timer: ReturnType<typeof setTimeout> | null }>({ on: false, timer: null });
  const seenSent = useRef(new Set<string>());

  // While this chat is on screen its messages are read as they land: no banner, no count.
  useFocusEffect(
    useCallback(() => {
      chatInbox.setActiveRoom(id);
      return () => {
        chatInbox.setActiveRoom(null);
        chatInbox.refresh();
      };
    }, [id]),
  );

  // The room (for the header, members and a lead link) and, for a direct chat, the other person's phone.
  useEffect(() => {
    listConversations()
      .then((rooms) => {
        const found = rooms.find((item) => item._id === id) || null;
        setRoom(found);
        const other = found?.type === "direct" ? found.participants.find((person) => person._id !== myId) : null;
        if (other) {
          listUsers()
            .then((users) => setPhone(users.find((person) => person._id === other._id)?.phone || null))
            .catch(() => {});
        }
      })
      .catch(() => {});
  }, [id, myId]);

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

  // Receipts arrive as room events carrying the updated message (web onMessageSeen / onMessageDelivered); refresh its ticks.
  const applyReceipt = (event: { roomId?: string; message?: ChatMessage }) => {
    const updated = event.message;
    if (!updated?._id || String(event.roomId || updated.room) !== id) return;
    setMessages((current) => current.map((item) => (item._id === updated._id ? { ...item, deliveredTo: updated.deliveredTo || item.deliveredTo, seenBy: updated.seenBy || item.seenBy } : item)));
  };
  useSocketEvent<{ roomId?: string; message?: ChatMessage }>("chat:message:seen", applyReceipt);
  useSocketEvent<{ roomId?: string; message?: ChatMessage }>("chat:message:delivered", applyReceipt);

  // With the chat open, messages from others are seen: tell the sender, once per message.
  useEffect(() => {
    unseenByMe(messages, myId).forEach((message) => {
      if (seenSent.current.has(message._id)) return;
      seenSent.current.add(message._id);
      emitWithAck<{ ok?: boolean; message?: ChatMessage }>("chat:message:seen", { messageId: message._id }).then((ack) => {
        if (ack?.ok && ack.message) applyReceipt({ roomId: id, message: ack.message });
      });
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [messages, myId, id]);

  // Someone else typing in this room (web onTyping); each name drops off on its own after a quiet spell.
  useSocketEvent<{ roomId?: string; userId?: string; isTyping?: boolean }>("chat:typing", (event) => {
    const who = String(event.userId || "");
    if (String(event.roomId) !== id || !who || who === myId) return;
    const existing = typingTimers.current.get(who);
    if (existing) clearTimeout(existing);
    if (event.isTyping === false) {
      typingTimers.current.delete(who);
      setTyping(({ [who]: _gone, ...rest }) => rest);
      return;
    }
    setTyping((prev) => ({ ...prev, [who]: Date.now() }));
    typingTimers.current.set(
      who,
      setTimeout(() => {
        typingTimers.current.delete(who);
        setTyping(({ [who]: _gone, ...rest }) => rest);
      }, REMOTE_TYPING_TIMEOUT_MS),
    );
  });
  useEffect(() => () => typingTimers.current.forEach((timer) => clearTimeout(timer)), []);

  /* My typing state: on with the first keystroke, off after a pause, on send, or on leaving. */
  const setLocalTyping = (on: boolean) => {
    if (localTyping.current.timer) clearTimeout(localTyping.current.timer);
    localTyping.current.timer = on ? setTimeout(() => setLocalTyping(false), LOCAL_TYPING_IDLE_MS) : null;
    if (localTyping.current.on === on) return;
    localTyping.current.on = on;
    emitEvent("chat:typing", { roomId: id, isTyping: on });
  };
  useEffect(
    () => () => {
      if (localTyping.current.on) emitEvent("chat:typing", { roomId: id, isTyping: false });
      if (localTyping.current.timer) clearTimeout(localTyping.current.timer);
    },
    [id],
  );
  // A message deleted for everyone (or by me on another device) leaves the list; so does a chat I cleared elsewhere.
  useSocketEvent<{ roomId?: string; messageId?: string }>("chat:message:deleted", (event) => {
    if (String(event.roomId) !== id || !event.messageId) return;
    setMessages((current) => current.filter((item) => item._id !== event.messageId));
  });
  useSocketEvent<{ roomId?: string; userId?: string }>("chat:room:cleared", (event) => {
    if (String(event.roomId) !== id || String(event.userId || myId) !== myId) return;
    setMessages([]);
  });

  const removeMessage = async (message: ChatMessage, scope: "self" | "everyone") => {
    setAttachError(null);
    try {
      await deleteMessage(message._id, scope);
      setMessages((current) => current.filter((item) => item._id !== message._id));
    } catch (err) {
      setAttachError(errorMessage(err));
    }
  };

  const runClear = async () => {
    setAttachError(null);
    try {
      await clearChat(id);
      setMessages([]);
      setHasOlder(false);
    } catch (err) {
      setAttachError(errorMessage(err));
    }
  };

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

  const sendPhoto = async (source: "camera" | "library" | "file") => {
    setAttachError(null);
    try {
      const file: LocalFile | null = source === "file" ? await pickDocument() : await pickImage(source);
      if (!file) return;
      setUploading(true);
      const uploaded = await uploadFile(file, "chat");
      const saved = await sendMessage(id, "", { mediaAttachments: [{ url: uploaded.url, name: uploaded.fileName, mimeType: uploaded.mimeType, size: uploaded.size }] });
      if (saved) setMessages((current) => mergeMessage(current, saved));
    } catch (err) {
      setAttachError(errorMessage(err));
    } finally {
      setUploading(false);
    }
  };

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
    setLocalTyping(false);
    try {
      const saved = await sendMessage(id, body);
      pendingText.current.delete(clientId);
      if (saved) setMessages((current) => mergeMessage(current, saved, clientId));
    } catch {
      setMessages((current) => current.map((item) => (item._id === clientId ? { ...item, localState: "failed" } : item)));
    }
  };

  const other = room?.type === "direct" ? room.participants.find((person) => person._id !== myId) : null;
  const heading = room ? conversationTitle(room, myId) : title || "Chat";
  const subline = other
    ? other.roleLabel || roleLabel(other.role)
    : room?.type === "broadcast"
      ? "Broadcast · read only"
      : room
        ? `${room.participants.length} members`
        : "";
  const lead = room?.leadId && typeof room.leadId === "object" ? room.leadId : null;
  const tel = dialable(phone || undefined);

  const header = (
    <View style={[styles.header, { backgroundColor: colors.surface, borderBottomColor: colors.border, paddingTop: insets.top + 6 }]}>
      <Pressable accessibilityRole="button" accessibilityLabel="Back" hitSlop={10} onPress={() => navigation.goBack()}>
        <Icon name="chevron-back" size={24} color={colors.primary} />
      </Pressable>
      {other ? (
        <Avatar name={other.name} uri={other.profileImageUrl} size={38} tinted />
      ) : (
        <View style={[styles.groupTile, { backgroundColor: colors.primarySoft }]}>
          <Icon name={room?.type === "broadcast" ? "megaphone" : "people"} size={18} color={colors.primary} />
        </View>
      )}
      <View style={styles.flex}>
        <Text variant="bodyStrong" numberOfLines={1} style={styles.headName}>
          {heading}
        </Text>
        {subline ? (
          <Text variant="tiny" color="muted" numberOfLines={1}>
            {subline}
          </Text>
        ) : null}
      </View>
      {tel ? (
        <Pressable accessibilityRole="button" accessibilityLabel={`Call ${heading}`} hitSlop={10} onPress={() => Linking.openURL(`tel:${tel}`)}>
          <Icon name="call-outline" size={21} color={colors.primary} />
        </Pressable>
      ) : null}
      <Pressable accessibilityRole="button" accessibilityLabel="Chat options" hitSlop={10} onPress={() => setRoomMenu(true)}>
        <Icon name="ellipsis-vertical" size={20} color={colors.primary} />
      </Pressable>
    </View>
  );

  if (loading)
    return (
      <View style={[styles.root, { backgroundColor: colors.bg }]}>
        {header}
        <Loading />
      </View>
    );
  if (error)
    return (
      <View style={[styles.root, { backgroundColor: colors.bg }]}>
        {header}
        <ErrorState message={error} onRetry={load} />
      </View>
    );

  // Inverted list: newest at the bottom, scrolling up loads history.
  const reversed = [...messages].reverse();

  return (
    <KeyboardAvoidingView
      style={[styles.root, { backgroundColor: colors.bg }]}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      {header}
      <FlatList
        inverted
        data={reversed}
        keyExtractor={(item) => item._id}
        contentContainerStyle={styles.list}
        onEndReached={loadOlder}
        onEndReachedThreshold={0.3}
        ListHeaderComponent={
          lead ? (
            <Pressable
              accessibilityRole="button"
              onPress={() => navigation.navigate("LeadDetail", { leadId: lead._id, name: lead.name })}
              style={[styles.leadCard, { backgroundColor: colors.surface, borderColor: colors.border }]}
            >
              <View style={[styles.leadIcon, { backgroundColor: colors.primarySoft }]}>
                <Icon name="people" size={16} color={colors.primary} />
              </View>
              <View>
                <Text variant="smallStrong">Lead · {lead.name}</Text>
                <Text variant="tiny" color="muted">
                  Open the lead
                </Text>
              </View>
              <Icon name="chevron-forward" size={15} color={colors.textFaint} />
            </Pressable>
          ) : null
        }
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
                <View style={styles.dayWrap}>
                  <Text variant="tiny" color="muted" style={[styles.day, { backgroundColor: colors.track }]}>
                    {new Date(item.createdAt).toDateString() === new Date().toDateString() ? "Today" : formatDate(item.createdAt)}
                  </Text>
                </View>
              ) : null}
              <Bubble
                message={item}
                mine={mine}
                tick={mine ? receipt(item, myId) : null}
                onRetry={item.localState === "failed" ? () => send(pendingText.current.get(item._id) || item.text || "", item._id) : undefined}
                onOpenProperty={(propertyId) => navigation.navigate("PropertyDetail", { id: propertyId })}
                onLongPress={item.localState ? undefined : () => setSelected(item)}
              />
            </View>
          );
        }}
      />
      {attachError ? (
        <Text variant="small" color="danger" style={styles.attachError}>
          {attachError}
        </Text>
      ) : null}
      {Object.keys(typing).length ? (
        <Text variant="tiny" color="muted" style={styles.attachError} accessibilityLiveRegion="polite">
          {typingLine(Object.keys(typing).map((userId) => room?.participants.find((person) => person._id === userId)?.name || "Someone"))}
        </Text>
      ) : null}
            <View style={[styles.composer, { backgroundColor: colors.bg, paddingBottom: insets.bottom + space.sm }]}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Attach"
          disabled={uploading}
          onPress={() => setAttachMenu(true)}
          style={[styles.attach, { backgroundColor: colors.surface, borderColor: colors.border }]}
        >
          {uploading ? <ActivityIndicator size="small" color={colors.primary} /> : <Icon name="add" size={22} color={colors.textMuted} />}
        </Pressable>
        <TextInput
          value={draft}
          onChangeText={(value) => {
            setDraft(value);
            setLocalTyping(Boolean(value.trim()));
          }}
          placeholder="Message"
          placeholderTextColor={colors.textFaint}
          multiline
          maxLength={4000}
          style={[styles.input, { color: colors.text, backgroundColor: colors.surface, borderColor: colors.border }]}
          accessibilityLabel="Message"
        />
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Send"
          disabled={!draft.trim()}
          onPress={() => send(draft)}
          style={[styles.send, { backgroundColor: colors.primary, opacity: draft.trim() ? 1 : 0.55 }]}
        >
          <Icon name="send" size={18} color={colors.onPrimary} />
        </Pressable>
      </View>
      <ActionSheet
        visible={Boolean(selected)}
        title="Message"
        onClose={() => setSelected(null)}
        actions={
          selected
            ? [
                { key: "self", icon: "eye-off-outline", label: "Delete for me", destructive: true, onPress: () => removeMessage(selected, "self") },
                ...(user.role === "ADMIN" && selected.sender?._id === myId
                  ? [{ key: "everyone", icon: "trash-outline" as IconName, label: "Delete for everyone", destructive: true, onPress: () => removeMessage(selected, "everyone") }]
                  : []),
              ]
            : []
        }
      />
      <ActionSheet
        visible={roomMenu}
        title={heading}
        onClose={() => setRoomMenu(false)}
        actions={[{ key: "clear", icon: "trash-bin-outline", label: "Clear chat", hint: "Removes the messages for you only", destructive: true, onPress: () => setConfirmClear(true) }]}
      />
      <ActionSheet
        visible={confirmClear}
        title="Clear every message in this chat for you?"
        onClose={() => setConfirmClear(false)}
        actions={[{ key: "confirm", icon: "trash-bin-outline", label: "Clear chat", destructive: true, onPress: runClear }]}
      />
      <ActionSheet
        visible={attachMenu}
        onClose={() => setAttachMenu(false)}
        title="Send"
        actions={[
          { key: "camera", icon: "camera-outline", label: "Take a photo", onPress: () => sendPhoto("camera") },
          { key: "library", icon: "image-outline", label: "Photo from gallery", onPress: () => sendPhoto("library") },
          { key: "file", icon: "document-attach-outline", label: "Document", hint: "PDF, Word, Excel or other file", onPress: () => sendPhoto("file") },
          { key: "property", icon: "business-outline", label: "Share a property", hint: "Sends a card from inventory", onPress: () => navigation.navigate("PickProperty", { chatId: id }) },
        ]}
      />
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
  onLongPress,
}: {
  message: ChatMessage;
  mine: boolean;
  tick: Tick | null;
  onRetry?: () => void;
  onOpenProperty: (id: string) => void;
  /* Opens the delete menu for a saved message. */
  onLongPress?: () => void;
}) => {
  const { colors } = useTheme();
  const bg = mine ? colors.primary : colors.surface;
  const fg = mine ? colors.onPrimary : colors.text;
  const property = message.sharedProperty;
  const tickColor = tick === "seen" ? colors.primary : tick === "failed" ? colors.danger : colors.textFaint;

  return (
    <View style={[styles.bubbleRow, mine ? styles.mineRow : styles.theirRow]}>
      <Pressable
        disabled={!onRetry && !onLongPress}
        onPress={onRetry}
        onLongPress={onLongPress}
        accessibilityLabel={onRetry ? "Message not sent. Tap to retry." : undefined}
        accessibilityHint={onLongPress ? "Long-press for options" : undefined}
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
        {(message.mediaAttachments || []).map((media) =>
          (media.mimeType || "").startsWith("image") || media.kind === "image" ? (
            <Pressable key={media.url} accessibilityRole="imagebutton" accessibilityLabel="Open photo" onPress={() => Linking.openURL(mediaUrl(media.url) || media.url)}>
              <Image source={{ uri: mediaUrl(media.url) }} style={styles.media} />
            </Pressable>
          ) : (
            <Pressable key={media.url} accessibilityRole="button" onPress={() => Linking.openURL(mediaUrl(media.url) || media.url)} style={styles.fileRow}>
              <Icon name="document-attach-outline" size={18} color={fg} />
              <Text variant="small" color={fg} numberOfLines={1} style={styles.fileName}>
                {media.name || "Attachment"}
              </Text>
            </Pressable>
          ),
        )}
        {message.text && !property && !(message.mediaAttachments || []).length ? (
          <Text variant="body" color={fg} style={styles.bubbleText}>
            {message.isDeleted ? "This message was deleted" : message.text}
          </Text>
        ) : null}
      </Pressable>
      <View style={[styles.meta, mine ? styles.metaMine : null]}>
        <Text variant="tiny" color={message.localState === "failed" ? colors.danger : colors.textFaint} style={styles.metaText}>
          {message.localState === "failed" ? "Not sent · tap to retry" : chatTime(message.createdAt, new Date(message.createdAt))}
        </Text>
        {tick ? <Icon name={TICKS[tick].icon} size={13} color={tickColor} /> : null}
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  root: { flex: 1 },
  flex: { flex: 1, minWidth: 0 },
  list: { padding: space.md, gap: 4 },
  older: { paddingVertical: space.md },
  empty: { padding: space.xxl, transform: [{ scaleY: -1 }] },
  day: { paddingHorizontal: 10, paddingVertical: 3, borderRadius: 999, overflow: "hidden" },
  bubbleRow: { marginVertical: 3 },
  mineRow: { alignItems: "flex-end" },
  theirRow: { alignItems: "flex-start" },
  bubble: { maxWidth: "80%", borderRadius: 20, paddingHorizontal: 13, paddingVertical: 10, gap: 6 },
  mineBubble: { borderBottomRightRadius: 6 },
  theirBubble: { borderBottomLeftRadius: 6, borderWidth: 1 },
  meta: { flexDirection: "row", alignItems: "center", gap: 3, marginTop: 3, paddingHorizontal: 2 },
  metaMine: { alignSelf: "flex-end" },
  metaText: { fontSize: 10.5 },
  bubbleText: { fontSize: 14, lineHeight: 20 },
  media: { width: 220, height: 160, borderRadius: 14 },
  fileRow: { flexDirection: "row", alignItems: "center", gap: 6, maxWidth: 220 },
  fileName: { flexShrink: 1 },
  header: { flexDirection: "row", alignItems: "center", gap: 10, paddingHorizontal: 14, paddingBottom: 10, borderBottomWidth: 1 },
  headName: { fontSize: 15 },
  groupTile: { width: 38, height: 38, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  dayWrap: { alignItems: "center", paddingVertical: 8 },
  leadCard: { flexDirection: "row", alignItems: "center", gap: 10, alignSelf: "flex-start", borderWidth: 1, borderRadius: 16, padding: 10, marginTop: 8 },
  leadIcon: { width: 32, height: 32, borderRadius: 10, alignItems: "center", justifyContent: "center" },
  attach: { width: 42, height: 42, borderRadius: 14, borderWidth: 1, alignItems: "center", justifyContent: "center" },
  attachError: { paddingHorizontal: 16, paddingBottom: 4 },
  property: { borderRadius: radius.md, overflow: "hidden", width: 220 },
  propertyImage: { width: 220, height: 110 },
  propertyText: { padding: space.sm, gap: 2 },
  composer: { flexDirection: "row", alignItems: "flex-end", gap: 8, paddingHorizontal: 12, paddingTop: 8 },
  input: { flex: 1, minHeight: 42, maxHeight: 120, borderRadius: 14, borderWidth: 1, paddingHorizontal: 14, paddingTop: 10, paddingBottom: 10, fontFamily: font.regular, fontSize: 14.5, lineHeight: 20 },
  send: { width: 42, height: 42, borderRadius: 14, alignItems: "center", justifyContent: "center" },
});
