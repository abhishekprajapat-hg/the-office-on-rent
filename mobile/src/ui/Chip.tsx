import React from "react";
import { Pressable, ScrollView, StyleSheet } from "react-native";
import { useTheme } from "../theme/ThemeProvider";
import { gutter, radius, space, toneColors, type Tone } from "../theme/tokens";
import { Text } from "./Text";

type ChipProps = {
  label: string;
  selected?: boolean;
  onPress?: () => void;
  count?: number;
  /*
   * "filter" - pill; selected is solid ink (list filters: All / Due today / Hot).
   * "pick"   - rounded square; selected is a soft tint with a coloured border
   *            (form choices: status, priority, leave type).
   */
  variant?: "filter" | "pick";
  tone?: Tone;
};

export const Chip = ({ label, selected, onPress, count, variant = "filter", tone = "primary" }: ChipProps) => {
  const { colors } = useTheme();
  const picked = toneColors(colors, tone);

  const look =
    variant === "pick"
      ? selected
        ? { backgroundColor: picked.bg, borderColor: picked.fg, fg: picked.fg }
        : { backgroundColor: colors.surface, borderColor: colors.border, fg: colors.text }
      : selected
        ? { backgroundColor: colors.ink, borderColor: colors.ink, fg: colors.onInk }
        : { backgroundColor: colors.surface, borderColor: colors.border, fg: colors.text };

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected: Boolean(selected) }}
      onPress={onPress}
      style={[
        variant === "pick" ? styles.pick : styles.filter,
        { backgroundColor: look.backgroundColor, borderColor: look.borderColor },
        variant === "pick" && selected && styles.pickSelected,
      ]}
    >
      <Text variant="smallStrong" color={look.fg} style={styles.label}>
        {label}
        {count === undefined ? null : <Text variant="tiny" color={look.fg} style={styles.count}>{`  ${count}`}</Text>}
      </Text>
    </Pressable>
  );
};

/* A horizontally scrolling single-select row of chips. */
export const ChipRow = <T extends string>({
  options,
  value,
  onChange,
  inset = true,
}: {
  options: { key: T; label: string; count?: number }[];
  value: T;
  onChange: (key: T) => void;
  /* Pad the ends to the screen gutter (false when already inside padded content). */
  inset?: boolean;
}) => (
  <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={[styles.row, inset && styles.inset]}>
    {options.map((option) => (
      <Chip
        key={option.key}
        label={option.label}
        count={option.count}
        selected={option.key === value}
        onPress={() => onChange(option.key)}
      />
    ))}
  </ScrollView>
);

const styles = StyleSheet.create({
  filter: { borderRadius: radius.pill, borderWidth: 1, paddingHorizontal: 12, height: 32, justifyContent: "center" },
  pick: { borderRadius: 11, borderWidth: 1, paddingHorizontal: 12, height: 34, justifyContent: "center" },
  pickSelected: { borderWidth: 1.5 },
  label: { fontSize: 12.5 },
  count: { opacity: 0.6, fontSize: 11 },
  row: { gap: 6 },
  inset: { paddingHorizontal: gutter },
});

export const chipGap = space.sm;
