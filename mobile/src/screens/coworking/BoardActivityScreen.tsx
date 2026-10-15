import React from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { cabinLabel } from "../../lib/coworkingBoard";
import { formatWhen } from "../../lib/format";
import { useBoard } from "../../lib/useBoard";
import type { RootScreenProps } from "../../navigation/types";
import { useTheme } from "../../theme/ThemeProvider";
import type { Tone } from "../../theme/tokens";
import { Body, EmptyState, ErrorState, IconTile, ListCard, Loading, Text, type IconName } from "../../ui";

const KINDS: Record<string, { icon: IconName; tone: Tone }> = {
  onboard: { icon: "person-add", tone: "success" },
  book: { icon: "checkmark", tone: "success" },
  hold: { icon: "timer", tone: "warning" },
  expire: { icon: "timer-outline", tone: "warning" },
  release: { icon: "log-out", tone: "danger" },
  renew: { icon: "calendar", tone: "primary" },
  transfer: { icon: "swap-horizontal", tone: "primary" },
  block: { icon: "ban", tone: "violet" },
  unblock: { icon: "refresh", tone: "neutral" },
  payment: { icon: "cash", tone: "success" },
  document: { icon: "document-text", tone: "neutral" },
  edit: { icon: "create", tone: "neutral" },
};

/* Web: ActivityLogDialog. What has happened to the floor, newest first; tap a cabin to open it. */
export const BoardActivityScreen = ({ navigation }: RootScreenProps<"BoardActivity">) => {
  const { colors } = useTheme();
  const { board, loading, error, refresh, refreshing } = useBoard();
  if (loading) return <Loading />;
  if (error || !board) return <ErrorState message={error || "Couldn't load the board."} onRetry={refresh} />;
  return (
    <Body refreshing={refreshing} onRefresh={refresh}>
      {!board.activity.length ? (
        <EmptyState icon="time-outline" title="Nothing recorded yet" message="Onboard a client, hold a cabin or record a payment and it shows up here." />
      ) : (
        <ListCard>
          {board.activity.map((item) => {
            const kind = KINDS[item.kind] || KINDS.edit!;
            return (
              <View key={item.id} style={styles.row}>
                <IconTile icon={kind.icon} tone={kind.tone} />
                <View style={styles.flex}>
                  <Text variant="smallStrong">{item.title}</Text>
                  <Text variant="small" color="muted">
                    {item.detail}
                  </Text>
                  <View style={styles.meta}>
                    {item.cabinCodes.map((code) => (
                      <Pressable key={code} accessibilityRole="button" onPress={() => navigation.navigate("Cabin", { code })} style={[styles.code, { borderColor: colors.border }]}>
                        <Text variant="tiny" color="primary">
                          {cabinLabel(code)}
                        </Text>
                      </Pressable>
                    ))}
                    <Text variant="tiny" color="faint" style={styles.when}>
                      {formatWhen(item.at)}
                    </Text>
                  </View>
                </View>
              </View>
            );
          })}
        </ListCard>
      )}
    </Body>
  );
};

const styles = StyleSheet.create({
  flex: { flex: 1, minWidth: 0, gap: 2 },
  row: { flexDirection: "row", gap: 12, padding: 12 },
  meta: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: 6, marginTop: 4 },
  code: { borderWidth: 1, borderRadius: 999, paddingHorizontal: 8, paddingVertical: 2 },
  when: { marginLeft: "auto" },
});
