import React from "react";
import { Pressable, RefreshControl, ScrollView, StyleSheet, View, type StyleProp, type ViewStyle } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTheme } from "../theme/ThemeProvider";
import { space } from "../theme/tokens";
import { Icon, type IconName } from "./Icon";
import { Text } from "./Text";

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
}: {
  title?: string;
  subtitle?: string;
  right?: React.ReactNode;
  children: React.ReactNode;
  scroll?: boolean;
  refreshing?: boolean;
  onRefresh?: () => void;
  contentStyle?: StyleProp<ViewStyle>;
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
    <View style={[styles.root, { backgroundColor: colors.bg, paddingTop: insets.top }]}>
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
}: {
  children: React.ReactNode;
  refreshing?: boolean;
  onRefresh?: () => void;
  style?: StyleProp<ViewStyle>;
}) => {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  return (
    <ScrollView
      style={{ backgroundColor: colors.bg }}
      contentContainerStyle={[styles.body, { paddingBottom: insets.bottom + space.xxl }, style]}
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

export const HeaderButton = ({ icon, label, onPress }: { icon: IconName; label: string; onPress: () => void }) => {
  const { colors } = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      hitSlop={8}
      style={({ pressed }) => [
        styles.headerButton,
        { backgroundColor: pressed ? colors.primaryPressed : colors.primary },
      ]}
    >
      <Icon name={icon} size={22} color={colors.onPrimary} />
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

const styles = StyleSheet.create({
  root: { flex: 1 },
  flex: { flex: 1 },
  content: { paddingHorizontal: space.lg, paddingBottom: space.xxl, gap: space.lg },
  header: { flexDirection: "row", alignItems: "center", paddingTop: space.md, gap: space.md },
  fixedHeader: { paddingHorizontal: space.lg, paddingBottom: space.md },
  headerText: { flex: 1 },
  headerButton: { width: 42, height: 42, borderRadius: 21, alignItems: "center", justifyContent: "center" },
  body: { padding: space.lg, gap: space.lg },
  section: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: space.xs },
});
