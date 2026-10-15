import React from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import type { NativeStackHeaderProps } from "@react-navigation/native-stack";
import { useTheme } from "../theme/ThemeProvider";
import { Icon } from "./Icon";
import { Text } from "./Text";

/*
 * The design's compact pushed-screen header: blue chevron on the left (or
 * "Cancel" on a modal), 16px bold centred title, an optional action on the
 * right, sitting on the screen background with no bar or shadow.
 */
export const AppHeader = ({ navigation, options, route, back }: NativeStackHeaderProps) => {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const title = typeof options.title === "string" ? options.title : route.name;
  const modal = options.presentation === "modal";
  const goBack = () => (navigation.canGoBack() ? navigation.goBack() : navigation.navigate("Tabs"));
  const right = options.headerRight?.({ tintColor: colors.primary, canGoBack: Boolean(back) });
  // Modals (New lead, New task…) sit on white with a hairline under the header.
  const background = (options.headerStyle as { backgroundColor?: string } | undefined)?.backgroundColor || (modal ? colors.surface : colors.bg);
  return (
    <View style={[{ backgroundColor: background, paddingTop: insets.top }, modal && { borderBottomWidth: 1, borderBottomColor: colors.border }]}>
      <View style={styles.bar}>
        <View style={styles.side}>
          <Pressable accessibilityRole="button" accessibilityLabel={modal ? "Cancel" : "Back"} onPress={goBack} hitSlop={10}>
            {modal ? (
              <Text variant="body" color="muted" style={styles.cancel}>
                Cancel
              </Text>
            ) : (
              <Icon name="chevron-back" size={22} color={colors.primary} />
            )}
          </Pressable>
        </View>
        <Text variant="body" numberOfLines={1} style={styles.title} accessibilityRole="header">
          {title}
        </Text>
        <View style={[styles.side, styles.right]}>{right}</View>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  bar: { height: 36, flexDirection: "row", alignItems: "center", paddingHorizontal: 12, paddingTop: 2, paddingBottom: 8 },
  side: { width: 72, flexDirection: "row", alignItems: "center" },
  right: { justifyContent: "flex-end" },
  title: { flex: 1, textAlign: "center", fontSize: 16, fontFamily: "PlusJakartaSans_700Bold" },
  cancel: { fontFamily: "PlusJakartaSans_600SemiBold" },
});
