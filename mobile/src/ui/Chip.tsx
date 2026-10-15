import React from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { FilterDropdown } from "./FilterBar";
import type { IconName } from "./Icon";
import { useTheme } from "../theme/ThemeProvider";
import { gutter, radius, toneColors, type Tone } from "../theme/tokens";
import { Text } from "./Text";

type ChipProps = {
  label: string;
  selected?: boolean;
  onPress?: () => void;
  count?: number;
  /*
   * "pick"   - (default) rounded square; selected is a soft tint with a
   *            coloured border (form choices: status, priority, leave type).
   * "filter" - pill; selected is solid ink (list filter rows: All / Due today / Hot).
   */
  variant?: "filter" | "pick";
  tone?: Tone;
  /* A small coloured dot before the label (status chips). */
  dot?: string;
};

export const Chip = ({ label, selected, onPress, count, variant = "pick", tone = "primary", dot }: ChipProps) => {
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
      {dot ? <View style={[styles.dot, { backgroundColor: dot }]} /> : null}
      <Text variant="smallStrong" color={look.fg} style={styles.label}>
        {label}
        {count === undefined ? null : <Text variant="tiny" color={look.fg} style={styles.count}>{`  ${count}`}</Text>}
      </Text>
    </Pressable>
  );
};

/*
 * A single-select filter. It used to be a sideways-scrolling row of chips;
 * it is now one dropdown (see FilterBar) so every option is reachable
 * without swiping.
 */
export const ChipRow = <T extends string>({
  options,
  value,
  onChange,
  inset = true,
  label = "Show",
  icon = "funnel-outline",
}: {
  options: { key: T; label: string; count?: number }[];
  value: T;
  onChange: (key: T) => void;
  /* Pad the ends to the screen gutter (false when already inside padded content). */
  inset?: boolean;
  label?: string;
  icon?: IconName;
}) => (
  <View style={inset ? styles.inset : undefined}>
    <FilterDropdown label={label} icon={icon} options={options} value={value} onChange={onChange} />
  </View>
);

const styles = StyleSheet.create({
  filter: { borderRadius: radius.pill, borderWidth: 1, paddingHorizontal: 12, height: 32, justifyContent: "center" },
  pick: { borderRadius: 11, borderWidth: 1, paddingHorizontal: 11, height: 34, justifyContent: "center", flexDirection: "row", alignItems: "center", gap: 6 },
  dot: { width: 7, height: 7, borderRadius: 4 },
  pickSelected: { borderWidth: 1.5 },
  label: { fontSize: 12.5 },
  count: { opacity: 0.6, fontSize: 11 },
  inset: { paddingHorizontal: gutter },
});

