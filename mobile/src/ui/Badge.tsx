import React from "react";
import { StyleSheet, View } from "react-native";
import { useTheme } from "../theme/ThemeProvider";
import { radius, toneColors, type Tone } from "../theme/tokens";
import { Text } from "./Text";

export const Badge = ({ label, tone = "neutral" }: { label: string; tone?: Tone }) => {
  const { colors } = useTheme();
  const { fg, bg } = toneColors(colors, tone);
  return (
    <View style={[styles.badge, { backgroundColor: bg }]}>
      <Text variant="tiny" color={fg} numberOfLines={1}>
        {label}
      </Text>
    </View>
  );
};

/* A small round count bubble (unread chats, pending approvals). */
export const CountBubble = ({ count, tone = "primary" }: { count: number | string; tone?: "primary" | "danger" }) => {
  const { colors } = useTheme();
  return (
    <View style={[styles.bubble, { backgroundColor: tone === "danger" ? colors.danger : colors.primary }]}>
      <Text variant="tiny" color={colors.onPrimary} style={styles.bubbleText}>
        {count}
      </Text>
    </View>
  );
};

const styles = StyleSheet.create({
  badge: { borderRadius: radius.pill, paddingHorizontal: 9, paddingVertical: 3, alignSelf: "flex-start" },
  bubble: { minWidth: 20, height: 20, borderRadius: 10, paddingHorizontal: 6, alignItems: "center", justifyContent: "center" },
  bubbleText: { fontSize: 10.5, lineHeight: 13 },
});
