import React, { useState } from "react";
import { StyleSheet, View } from "react-native";
import { errorMessage } from "../../api/client";
import { createBroadcast, listBroadcasts } from "../../api/chat";
import { chatTime } from "../../lib/chat";
import { ROLE_LABELS } from "../../lib/roles";
import { useQuery } from "../../lib/useQuery";
import type { RootScreenProps } from "../../navigation/types";
import { useTheme } from "../../theme/ThemeProvider";
import { Body, Button, Card, Field, GroupLabel, Icon, IconTile, InlineError, Select, Text } from "../../ui";

const AUDIENCES = ["", "MANAGER", "EXECUTIVE", "INSIDE_EXECUTIVE", "FIELD_EXECUTIVE", "PRODUCTION_EXECUTIVE", "COMMUNITY_MANAGER"];

/* Admin console → Broadcast: a one-way announcement that lands in everyone's chats and notifications. */
export const BroadcastScreen = ({ navigation }: RootScreenProps<"Broadcast">) => {
  const { colors } = useTheme();
  const [text, setText] = useState("");
  const [role, setRole] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);
  const { data: history, reload } = useQuery(() => listBroadcasts().catch(() => []), []);

  const send = async () => {
    if (!text.trim()) return setError("Write the announcement first.");
    setSending(true);
    setError(null);
    try {
      await createBroadcast(text.trim(), role || null);
      setText("");
      setSent(true);
      reload();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setSending(false);
    }
  };

  return (
    <Body>
      <Card style={styles.gap}>
        <View style={styles.headRow}>
          <IconTile icon="megaphone" tone="primary" />
          <View style={styles.flex}>
            <Text variant="bodyStrong">New broadcast</Text>
            <Text variant="small" color="muted">
              Arrives as a chat and a push notification. Replies aren't possible.
            </Text>
          </View>
        </View>
        <Select
          label="Send to"
          icon="people-outline"
          allowClear
          clearLabel="Everyone"
          placeholder="Everyone"
          options={AUDIENCES.filter(Boolean).map((key) => ({ key, label: `${ROLE_LABELS[key as keyof typeof ROLE_LABELS]}s` }))}
          value={role}
          onChange={setRole}
        />
        <Field
          value={text}
          onChangeText={(value) => {
            setText(value);
            setSent(false);
          }}
          placeholder="e.g. Office closed on 2 Nov for Diwali"
          multiline
          maxLength={2000}
        />
        <InlineError message={error} />
        {sent ? (
          <View style={styles.sentRow}>
            <Icon name="checkmark-circle" size={16} color={colors.success} />
            <Text variant="smallStrong" color={colors.success}>
              Broadcast sent.
            </Text>
          </View>
        ) : null}
        <Button label="Send broadcast" icon="send" loading={sending} onPress={send} />
      </Card>

      {history?.length ? (
        <>
          <GroupLabel>Earlier broadcasts</GroupLabel>
          <Card padded={false}>
            {history.map((room, index) => (
              <View key={room._id} style={[styles.history, index > 0 && { borderTopColor: colors.border, borderTopWidth: 1 }]}>
                <View style={styles.flex}>
                  <Text variant="smallStrong" numberOfLines={2} onPress={() => navigation.navigate("Conversation", { id: room._id, title: room.name || "Broadcast" })}>
                    {room.lastMessage || room.name || "Broadcast"}
                  </Text>
                  <Text variant="tiny" color="faint">
                    {room.name || "Everyone"} · {room.participants.length} people
                  </Text>
                </View>
                <Text variant="tiny" color="faint">
                  {chatTime(room.lastMessageAt)}
                </Text>
              </View>
            ))}
          </Card>
        </>
      ) : null}
    </Body>
  );
};

const styles = StyleSheet.create({
  flex: { flex: 1, minWidth: 0 },
  gap: { gap: 12 },
  headRow: { flexDirection: "row", gap: 12, alignItems: "center" },
  sentRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  history: { flexDirection: "row", gap: 10, paddingHorizontal: 14, paddingVertical: 11 },
});
