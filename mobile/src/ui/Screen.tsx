import React from "react";
import { Pressable, RefreshControl, ScrollView, StyleSheet, View, type StyleProp, type ViewStyle } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTheme } from "../theme/ThemeProvider";
import { gutter, space } from "../theme/tokens";
import { Icon, type IconName } from "./Icon";
import { Text } from "./Text";
import { OfflineBanner } from "./States";

/*
 * A tab-root screen: large title header plus scrolling content. Pushed
 * screens use the native stack header instead and wrap content in <Body>.
 */
export const Screen = ({
  title,
  subtitle,
  right,
  children,
  scroll = true,
  refreshing,
  onRefresh,
  contentStyle,
  background,
}: {
  title?: string;
  subtitle?: string;
  right?: React.ReactNode;
  children: React.ReactNode;
  scroll?: boolean;
  refreshing?: boolean;
  onRefresh?: () => void;
  contentStyle?: StyleProp<ViewStyle>;
  background?: string;
}) => {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();

  const header = title ? (
    <View style={styles.header}>
      <View style={styles.headerText}>
        <Text variant="display" numberOfLines={1}>
          {title}
        </Text>
        {subtitle ? (
          <Text variant="small" color="muted" numberOfLines={1}>
            {subtitle}
          </Text>
        ) : null}
      </View>
      {right}
    </View>
  ) : null;

  return (
    <View style={[styles.root, { backgroundColor: background || colors.bg, paddingTop: insets.top }]}>
      <OfflineBanner />
      {scroll ? (
        <ScrollView
          contentContainerStyle={[styles.content, contentStyle]}
          keyboardShouldPersistTaps="handled"
          refreshControl={
            onRefresh ? (
              <RefreshControl refreshing={Boolean(refreshing)} onRefresh={onRefresh} tintColor={colors.primary} colors={[colors.primary]} />
            ) : undefined
          }
        >
          {header}
          {children}
        </ScrollView>
      ) : (
        <View style={styles.flex}>
          {header ? <View style={styles.fixedHeader}>{header}</View> : null}
          {children}
        </View>
      )}
    </View>
  );
};

/* Scrolling body for pushed (stack) screens. */
export const Body = ({
  children,
  refreshing,
  onRefresh,
  style,
  footerSpace,
}: {
  children: React.ReactNode;
  refreshing?: boolean;
  onRefresh?: () => void;
  style?: StyleProp<ViewStyle>;
  /* Extra bottom room when a <FooterBar> sits over the content. */
  footerSpace?: boolean;
}) => {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  return (
    <ScrollView
      style={{ backgroundColor: colors.bg }}
      contentContainerStyle={[styles.body, { paddingBottom: insets.bottom + space.xxl + (footerSpace ? 76 : 0) }, style]}
      keyboardShouldPersistTaps="handled"
      refreshControl={
        onRefresh ? (
          <RefreshControl refreshing={Boolean(refreshing)} onRefresh={onRefresh} tintColor={colors.primary} colors={[colors.primary]} />
        ) : undefined
      }
    >
      {children}
    </ScrollView>
  );
};

/* White action bar pinned to the bottom of a pushed screen ("Add task" / "Update status"). */
export const FooterBar = ({ children }: { children: React.ReactNode }) => {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  return (
    <View
      style={[
        styles.footer,
        { backgroundColor: colors.surface, borderTopColor: colors.border, paddingBottom: Math.max(insets.bottom, 12) + 8 },
      ]}
    >
      {children}
    </View>
  );
};

/* 42px rounded-square header action: solid blue (add) or white outlined (filter, map). */
export const HeaderButton = ({
  icon,
  label,
  onPress,
  variant = "primary",
}: {
  icon: IconName;
  label: string;
  onPress: () => void;
  variant?: "primary" | "secondary";
}) => {
  const { colors } = useTheme();
  const solid = variant === "primary";
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      hitSlop={8}
      style={({ pressed }) => [
        styles.headerButton,
        solid
          ? { backgroundColor: pressed ? colors.primaryPressed : colors.primary }
          : { backgroundColor: pressed ? colors.surfaceAlt : colors.surface, borderColor: colors.border, borderWidth: 1 },
      ]}
    >
      <Icon name={icon} size={solid ? 24 : 20} color={solid ? colors.onPrimary : colors.primary} />
    </Pressable>
  );
};

export const SectionTitle = ({ title, action, onAction }: { title: string; action?: string; onAction?: () => void }) => (
  <View style={styles.section}>
    <Text variant="heading">{title}</Text>
    {action && onAction ? (
      <Pressable accessibilityRole="button" onPress={onAction} hitSlop={8}>
        <Text variant="smallStrong" color="primary">
          {action}
        </Text>
      </Pressable>
    ) : null}
  </View>
);

/* Uppercase faint group label: "TODAY", "MY REQUESTS". */
export const GroupLabel = ({ children, color }: { children: string; color?: string }) => (
  <Text variant="label" color={color || "faint"}>
    {children}
  </Text>
);

const styles = StyleSheet.create({
  root: { flex: 1 },
  flex: { flex: 1 },
  content: { paddingHorizontal: gutter, paddingBottom: space.xxl, gap: space.md },
  header: { flexDirection: "row", alignItems: "center", paddingTop: 4, gap: space.sm },
  fixedHeader: { paddingHorizontal: gutter, paddingBottom: space.md },
  headerText: { flex: 1 },
  headerButton: { width: 42, height: 42, borderRadius: 14, alignItems: "center", justifyContent: "center" },
  body: { paddingHorizontal: gutter, paddingTop: 2, gap: space.md },
  footer: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    paddingTop: 10,
    paddingHorizontal: gutter,
    borderTopWidth: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: space.sm,
  },
  section: { flexDirection: "row", alignItems: "baseline", justifyContent: "space-between", marginTop: space.xs },
});
