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
};

export const Field = forwardRef<TextInput, Props>(({ label, icon, error, hint, secure, style, multiline, ...rest }, ref) => {
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
      <View
        style={[
          styles.box,
          multiline && styles.multiline,
          { borderColor, backgroundColor: colors.surface },
          focused && { shadowColor: colors.primary, shadowOpacity: 0.15, shadowRadius: 6, shadowOffset: { width: 0, height: 0 } },
        ]}
      >
        {icon ? <Icon name={icon} size={18} color={focused ? colors.primary : colors.textFaint} /> : null}
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
          style={[styles.input, { color: colors.text }, multiline && styles.inputMultiline, style]}
        />
        {secure ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={hidden ? "Show password" : "Hide password"}
            hitSlop={10}
            onPress={() => setHidden((value) => !value)}
          >
            <Icon name={hidden ? "eye-outline" : "eye-off-outline"} size={18} color={colors.textMuted} />
          </Pressable>
        ) : null}
      </View>
      {error ? (
        <Text variant="small" color="danger">
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
  box: {
    minHeight: 48,
    borderWidth: 1,
    borderRadius: radius.md,
    paddingHorizontal: space.md,
    flexDirection: "row",
    alignItems: "center",
    gap: space.sm,
  },
  multiline: { alignItems: "flex-start", paddingVertical: space.sm },
  input: { flex: 1, fontFamily: font.regular, fontSize: 15, paddingVertical: 12 },
  inputMultiline: { minHeight: 84, textAlignVertical: "top", paddingVertical: 4 },
});
