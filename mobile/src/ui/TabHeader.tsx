import React from "react";
import { StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import type { BottomTabHeaderProps } from "@react-navigation/bottom-tabs";
import { useTheme } from "../theme/ThemeProvider";
import { Text } from "./Text";

/* Header for screens that live in the tab bar (Team, Approvals, Bookings…): big title, the screen's own action on the right, no back. */
export const TabHeader = ({ options, route }: BottomTabHeaderProps) => {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const title = typeof options.title === "string" ? options.title : route.name;
  const right = options.headerRight?.({ tintColor: colors.primary, canGoBack: false });
  return (
    <View style={[styles.wrap, { backgroundColor: colors.bg, paddingTop: insets.top + 4 }]}>
      <Text variant="display" numberOfLines={1} style={styles.title} accessibilityRole="header">
        {title}
      </Text>
      <View style={styles.right}>{right}</View>
    </View>
  );
};

const styles = StyleSheet.create({
  wrap: { flexDirection: "row", alignItems: "center", paddingHorizontal: 16, paddingBottom: 8, gap: 8 },
  title: { flex: 1 },
  right: { flexDirection: "row", alignItems: "center", gap: 8 },
});
