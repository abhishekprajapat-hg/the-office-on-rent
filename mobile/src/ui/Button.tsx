import React from "react";
import { ActivityIndicator, Pressable, StyleSheet, View, type StyleProp, type ViewStyle } from "react-native";
import { useTheme } from "../theme/ThemeProvider";
import { radius, space } from "../theme/tokens";
import { Icon, type IconName } from "./Icon";
import { Text } from "./Text";

type Variant = "primary" | "secondary" | "soft" | "ghost" | "danger";

type Props = {
  label: string;
  onPress?: () => void;
  variant?: Variant;
  icon?: IconName;
  /* Icon after the label ("Sign in →"). */
  trailingIcon?: IconName;
  loading?: boolean;
  disabled?: boolean;
  size?: "md" | "sm";
  style?: StyleProp<ViewStyle>;
  testID?: string;
  /* Required when label is empty (icon-only button). */
  accessibilityLabel?: string;
};

export const Button = ({
  label,
  onPress,
  variant = "primary",
  icon,
  trailingIcon,
  loading,
  disabled,
  size = "md",
  style,
  testID,
  accessibilityLabel,
}: Props) => {
  const { colors } = useTheme();
  const inactive = disabled || loading;

  const palette = {
    primary: { bg: colors.primary, pressed: colors.primaryPressed, fg: colors.onPrimary, border: colors.primary, iconFg: colors.onPrimary },
    secondary: { bg: colors.surface, pressed: colors.surfaceAlt, fg: colors.text, border: colors.border, iconFg: colors.primary },
    soft: { bg: colors.primarySoft, pressed: colors.primarySoft, fg: colors.primary, border: colors.primarySoft, iconFg: colors.primary },
    ghost: { bg: "transparent", pressed: colors.surfaceAlt, fg: colors.primary, border: "transparent", iconFg: colors.primary },
    danger: { bg: colors.dangerSoft, pressed: colors.dangerSoft, fg: colors.danger, border: colors.dangerSoft, iconFg: colors.danger },
  }[variant];

  return (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel || label}
      accessibilityState={{ disabled: Boolean(inactive), busy: Boolean(loading) }}
      onPress={inactive ? undefined : onPress}
      style={({ pressed }) => [
        styles.base,
        size === "sm" ? styles.sm : styles.md,
        { backgroundColor: pressed ? palette.pressed : palette.bg, borderColor: palette.border },
        inactive && { opacity: 0.55 },
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator color={palette.fg} size="small" />
      ) : (
        <View style={styles.row}>
          {icon ? <Icon name={icon} size={size === "sm" ? 16 : 18} color={palette.iconFg} /> : null}
          {label ? (
            <Text variant={size === "sm" ? "smallStrong" : "bodyStrong"} color={palette.fg} style={size === "md" ? styles.mdLabel : undefined}>
              {label}
            </Text>
          ) : null}
          {trailingIcon ? <Icon name={trailingIcon} size={size === "sm" ? 16 : 18} color={palette.iconFg} /> : null}
        </View>
      )}
    </Pressable>
  );
};

const styles = StyleSheet.create({
  base: { borderWidth: 1, alignItems: "center", justifyContent: "center" },
  md: { minHeight: 52, paddingHorizontal: space.lg, borderRadius: 16 },
  sm: { minHeight: 36, paddingHorizontal: space.md, borderRadius: 11 },
  row: { flexDirection: "row", alignItems: "center", gap: space.sm },
  mdLabel: { fontSize: 15 },
});
