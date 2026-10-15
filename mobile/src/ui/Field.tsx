import React, { forwardRef, useState } from "react";
import { Pressable, StyleSheet, TextInput, View, type TextInputProps } from "react-native";
import { useTheme } from "../theme/ThemeProvider";
import { font, radius, space } from "../theme/tokens";
import { Icon, type IconName } from "./Icon";
import { Text } from "./Text";

type Props = TextInputProps & {
  label?: string;
  icon?: IconName;
  error?: string;
  hint?: string;
  secure?: boolean;
  /* White box on a grey screen (search bars) instead of the grey form fill. */
  surface?: boolean;
  /* 44px search-bar height instead of the 52px form height. */
  compact?: boolean;
  /* Unit shown inside the box on the right (sq ft, months). */
  suffix?: string;
};

/*
 * Grey filled input that turns white with a blue border and a soft blue
 * ring while focused (the Login design).
 */
export const Field = forwardRef<TextInput, Props>(({ label, icon, error, hint, secure, surface, compact, suffix, style, multiline, ...rest }, ref) => {
  const { colors } = useTheme();
  const [focused, setFocused] = useState(false);
  const [hidden, setHidden] = useState(true);

  const borderColor = error ? colors.danger : focused ? colors.primary : colors.border;

  return (
    <View style={styles.wrap}>
      {label ? (
        <Text variant="smallStrong" color="muted">
          {label}
        </Text>
      ) : null}
      <View style={[styles.ring, { borderColor: focused && !error ? colors.primarySoft : "transparent" }]}>
        <View
          style={[
            styles.box,
            multiline && styles.multiline,
            {
              borderColor,
              borderWidth: focused || error ? 1.5 : 1,
              backgroundColor: focused || surface ? colors.surface : colors.bg,
            },
            compact && styles.compact,
          ]}
        >
          {icon ? <Icon name={icon} size={compact ? 16 : 18} color={focused ? colors.primary : colors.textFaint} /> : null}
          <TextInput
            ref={ref}
            {...rest}
            multiline={multiline}
            secureTextEntry={secure ? hidden : undefined}
            placeholderTextColor={colors.textFaint}
            onFocus={(event) => {
              setFocused(true);
              rest.onFocus?.(event);
            }}
            onBlur={(event) => {
              setFocused(false);
              rest.onBlur?.(event);
            }}
            style={[styles.input, { color: colors.text }, compact && styles.inputCompact, multiline && styles.inputMultiline, style]}
          />
          {suffix ? (
            <Text variant="small" color="faint" style={styles.suffix}>
              {suffix}
            </Text>
          ) : null}
          {secure ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={hidden ? "Show password" : "Hide password"}
              hitSlop={10}
              onPress={() => setHidden((value) => !value)}
            >
              <Icon name={hidden ? "eye-outline" : "eye-off-outline"} size={18} color={colors.textFaint} />
            </Pressable>
          ) : null}
        </View>
      </View>
      {error ? (
        <Text variant="small" color="danger" style={styles.error}>
          {error}
        </Text>
      ) : hint ? (
        <Text variant="small" color="faint">
          {hint}
        </Text>
      ) : null}
    </View>
  );
});

Field.displayName = "Field";

const styles = StyleSheet.create({
  wrap: { gap: 6 },
  /* The 4px focus ring sits outside the box without shifting layout. */
  ring: { borderWidth: 4, borderRadius: radius.md + 4, margin: -4 },
  box: {
    minHeight: 52,
    borderRadius: radius.md,
    paddingHorizontal: 14,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  multiline: { alignItems: "flex-start", paddingVertical: space.sm },
  compact: { minHeight: 44 },
  inputCompact: { fontSize: 13.5, paddingVertical: 10 },
  input: { flex: 1, fontFamily: font.medium, fontSize: 15, paddingVertical: 12, ...({ outlineStyle: "none" } as object) },
  inputMultiline: { minHeight: 84, textAlignVertical: "top", paddingVertical: 4, fontFamily: font.regular, fontSize: 13.5 },
  error: { fontFamily: font.semibold, fontSize: 11.5 },
  suffix: { fontFamily: font.semibold, fontSize: 12 },
});
