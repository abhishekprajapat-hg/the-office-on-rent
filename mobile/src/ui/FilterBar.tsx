import React, { useMemo, useState } from "react";
import { Modal, Pressable, ScrollView, StyleSheet, TextInput, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTheme } from "../theme/ThemeProvider";
import { font } from "../theme/tokens";
import { Grabber } from "./Kit";
import { Icon, type IconName } from "./Icon";
import { Text } from "./Text";

export type FilterOption<T extends string = string> = { key: T; label: string; count?: number; hint?: string };

export type FilterDef<T extends string = string> = {
  /* What the dropdown filters, e.g. "Status", "Role", "Sort". */
  label: string;
  options: FilterOption<T>[];
  value: T;
  onChange: (key: T) => void;
  /* The "no filter" option; defaults to the first one. Picking it clears the dropdown. */
  defaultKey?: T;
  icon?: IconName;
};

/*
 * A dropdown filter: one compact button that shows what is picked and opens
 * a bottom sheet of options with counts. Replaces the horizontally scrolling
 * chip rows - everything stays visible without swiping, and a set filter is
 * tinted with a one-tap clear.
 */
export const FilterDropdown = <T extends string>({ label, options, value, onChange, defaultKey, icon, grow = true }: FilterDef<T> & { grow?: boolean }) => {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const fallback = defaultKey ?? options[0]?.key;
  const current = options.find((option) => option.key === value) || options[0];
  const active = value !== fallback;
  const searchable = options.length > 10;
  const shown = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return needle ? options.filter((option) => option.label.toLowerCase().includes(needle)) : options;
  }, [options, query]);

  const pick = (key: T) => {
    onChange(key);
    setOpen(false);
    setQuery("");
  };

  return (
    <>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${label}: ${current?.label || ""}. Change`}
        onPress={() => setOpen(true)}
        style={({ pressed }) => [
          styles.button,
          grow && styles.grow,
          {
            backgroundColor: active ? colors.primarySoft : colors.surface,
            borderColor: active ? colors.primary : colors.border,
            opacity: pressed ? 0.75 : 1,
          },
        ]}
      >
        {icon ? <Icon name={icon} size={15} color={active ? colors.primary : colors.textMuted} /> : null}
        <View style={styles.texts}>
          <Text variant="tiny" color={active ? colors.primary : colors.textFaint} numberOfLines={1} style={styles.caption}>
            {label}
          </Text>
          <Text variant="smallStrong" color={active ? colors.primary : colors.text} numberOfLines={1} style={styles.value}>
            {current?.label}
            {current?.count !== undefined ? <Text variant="tiny" color={active ? colors.primary : colors.textFaint}>{`  ${current.count}`}</Text> : null}
          </Text>
        </View>
        {active ? (
          <Pressable accessibilityRole="button" accessibilityLabel={`Clear ${label}`} hitSlop={10} onPress={() => onChange(fallback as T)}>
            <Icon name="close-circle" size={17} color={colors.primary} />
          </Pressable>
        ) : (
          <Icon name="chevron-down" size={15} color={colors.textMuted} />
        )}
      </Pressable>

      <Modal transparent visible={open} animationType="slide" onRequestClose={() => setOpen(false)} statusBarTranslucent>
        <Pressable style={[styles.backdrop, { backgroundColor: colors.overlay }]} onPress={() => setOpen(false)} accessibilityLabel="Close">
          <Pressable style={[styles.sheet, { backgroundColor: colors.surface, paddingBottom: insets.bottom + 16 }]}>
            <Grabber />
            <Text variant="title" style={styles.sheetTitle}>
              {label}
            </Text>
            {searchable ? (
              <View style={[styles.search, { backgroundColor: colors.bg, borderColor: colors.border }]}>
                <Icon name="search" size={16} color={colors.textFaint} />
                <TextInput
                  value={query}
                  onChangeText={setQuery}
                  placeholder={`Search ${label.toLowerCase()}`}
                  placeholderTextColor={colors.textFaint}
                  style={[styles.searchInput, { color: colors.text }]}
                  autoCorrect={false}
                />
              </View>
            ) : null}
            <ScrollView style={styles.list} keyboardShouldPersistTaps="handled">
              {shown.map((option, index) => {
                const selected = option.key === value;
                return (
                  <Pressable
                    key={option.key}
                    accessibilityRole="radio"
                    accessibilityState={{ selected }}
                    onPress={() => pick(option.key)}
                    style={({ pressed }) => [
                      styles.option,
                      index > 0 && { borderTopColor: colors.border, borderTopWidth: StyleSheet.hairlineWidth },
                      pressed && { backgroundColor: colors.surfaceAlt },
                    ]}
                  >
                    <View style={styles.texts}>
                      <Text variant="body" color={selected ? colors.primary : colors.text} style={selected ? styles.optionSelected : undefined}>
                        {option.label}
                      </Text>
                      {option.hint ? (
                        <Text variant="tiny" color="faint">
                          {option.hint}
                        </Text>
                      ) : null}
                    </View>
                    {option.count !== undefined ? (
                      <Text variant="smallStrong" color={colors.textMuted}>
                        {option.count}
                      </Text>
                    ) : null}
                    <Icon name={selected ? "checkmark-circle" : "ellipse-outline"} size={20} color={selected ? colors.primary : colors.border} />
                  </Pressable>
                );
              })}
              {!shown.length ? (
                <Text variant="small" color="muted" style={styles.none}>
                  Nothing matches.
                </Text>
              ) : null}
            </ScrollView>
          </Pressable>
        </Pressable>
      </Modal>
    </>
  );
};

/*
 * Several dropdowns side by side (two or three to a row, wrapping after),
 * plus "Clear all" when more than one is set.
 */
export const FilterBar = ({ filters, inset }: { filters: FilterDef<any>[]; inset?: boolean }) => {
  const active = filters.filter((filter) => filter.value !== (filter.defaultKey ?? filter.options[0]?.key));
  return (
    <View style={[styles.bar, inset && styles.inset]}>
      <View style={styles.row}>
        {filters.map((filter) => (
          <View key={filter.label} style={[styles.cell, filters.length > 2 && styles.cellHalf]}>
            <FilterDropdown {...filter} />
          </View>
        ))}
      </View>
      {active.length > 1 ? (
        <Pressable accessibilityRole="button" onPress={() => active.forEach((filter) => filter.onChange(filter.defaultKey ?? filter.options[0]!.key))} hitSlop={6} style={styles.clearAll}>
          <Text variant="smallStrong" color="primary">
            Clear all filters
          </Text>
        </Pressable>
      ) : null}
    </View>
  );
};

const styles = StyleSheet.create({
  button: { flexDirection: "row", alignItems: "center", gap: 8, minHeight: 46, borderWidth: 1, borderRadius: 13, paddingHorizontal: 12, paddingVertical: 5 },
  grow: { flex: 1 },
  texts: { flex: 1, minWidth: 0 },
  caption: { fontSize: 10.5, fontFamily: font.semibold },
  value: { fontSize: 13 },
  backdrop: { flex: 1, justifyContent: "flex-end" },
  sheet: { borderTopLeftRadius: 26, borderTopRightRadius: 26, paddingTop: 10, paddingHorizontal: 18, maxHeight: "80%", gap: 10 },
  sheetTitle: { fontSize: 19, marginTop: 6 },
  search: { flexDirection: "row", alignItems: "center", gap: 8, borderWidth: 1, borderRadius: 12, paddingHorizontal: 12, height: 44 },
  searchInput: { flex: 1, fontFamily: font.medium, fontSize: 14, ...({ outlineStyle: "none" } as object) },
  list: { flexGrow: 0 },
  option: { flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 13, paddingHorizontal: 2 },
  optionSelected: { fontFamily: font.bold },
  none: { paddingVertical: 16 },
  bar: { gap: 6 },
  inset: { paddingHorizontal: 16 },
  row: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  cell: { flexGrow: 1, flexBasis: 0, minWidth: 0 },
  cellHalf: { flexBasis: "47%" },
  clearAll: { alignSelf: "flex-end" },
});
