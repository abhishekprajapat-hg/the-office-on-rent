import React, { useMemo, useState } from "react";
import { Modal, Pressable, ScrollView, StyleSheet, TextInput, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTheme } from "../theme/ThemeProvider";
import { font, radius } from "../theme/tokens";
import { Button } from "./Button";
import { Grabber } from "./Kit";
import { Icon, type IconName } from "./Icon";
import { Text } from "./Text";

export type SelectOption<T extends string = string> = { key: T; label: string; hint?: string; dot?: string };

/*
 * Dropdowns for forms, in place of rows of capsules: a field-like box showing
 * what is picked, opening a bottom sheet of options. Select picks one,
 * MultiSelect any number. Long lists get a search box.
 */

type Common<T extends string> = {
  label?: string;
  options: SelectOption<T>[];
  placeholder?: string;
  icon?: IconName;
  disabled?: boolean;
  error?: string;
  hint?: string;
  /* The sheet's heading when the field has no label. */
  title?: string;
};

export const Select = <T extends string>({
  value,
  onChange,
  allowClear,
  clearLabel = "None",
  ...common
}: Common<T> & {
  value: T | "" | null | undefined;
  onChange: (key: T) => void;
  /* Offer a "None" row that hands back "" (the field becomes empty). */
  allowClear?: boolean;
  clearLabel?: string;
}) => {
  const [open, setOpen] = useState(false);
  const current = common.options.find((option) => option.key === value);
  return (
    <>
      <SelectBox {...common} text={current?.label} dot={current?.dot} onPress={() => setOpen(true)} />
      <OptionSheet
        visible={open}
        title={common.title || common.label || "Choose"}
        options={allowClear ? [{ key: "" as T, label: clearLabel }, ...common.options] : common.options}
        isSelected={(key) => (key === "" ? !current : key === value)}
        onPick={(key) => {
          onChange(key);
          setOpen(false);
        }}
        onClose={() => setOpen(false)}
      />
    </>
  );
};

export const MultiSelect = <T extends string>({
  value,
  onChange,
  ...common
}: Common<T> & {
  value: T[];
  onChange: (keys: T[]) => void;
}) => {
  const [open, setOpen] = useState(false);
  const picked = common.options.filter((option) => value.includes(option.key));
  const text = !picked.length ? undefined : picked.length <= 2 ? picked.map((option) => option.label).join(", ") : `${picked.slice(0, 2).map((option) => option.label).join(", ")} +${picked.length - 2}`;
  return (
    <>
      <SelectBox {...common} text={text} count={picked.length} onPress={() => setOpen(true)} />
      <OptionSheet
        visible={open}
        multiple
        title={common.title || common.label || "Choose"}
        options={common.options}
        isSelected={(key) => value.includes(key)}
        onPick={(key) => onChange(value.includes(key) ? value.filter((item) => item !== key) : [...value, key])}
        onClear={value.length ? () => onChange([]) : undefined}
        onClose={() => setOpen(false)}
      />
    </>
  );
};

const SelectBox = ({
  label,
  placeholder = "Select",
  icon,
  disabled,
  error,
  hint,
  text,
  dot,
  count,
  onPress,
}: Omit<Common<string>, "options"> & { text?: string; dot?: string; count?: number; onPress: () => void }) => {
  const { colors } = useTheme();
  return (
    <View style={styles.wrap}>
      {label ? (
        <Text variant="smallStrong" color="muted">
          {label}
        </Text>
      ) : null}
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${label || placeholder}: ${text || "not set"}. Change`}
        accessibilityState={{ disabled }}
        disabled={disabled}
        onPress={onPress}
        style={({ pressed }) => [
          styles.box,
          { backgroundColor: colors.bg, borderColor: error ? colors.danger : colors.border, opacity: disabled ? 0.55 : pressed ? 0.8 : 1 },
        ]}
      >
        {icon ? <Icon name={icon} size={18} color={colors.textMuted} /> : null}
        {dot ? <View style={[styles.dot, { backgroundColor: dot }]} /> : null}
        <Text variant="body" color={text ? colors.text : colors.textFaint} numberOfLines={1} style={styles.value}>
          {text || placeholder}
        </Text>
        {count && count > 2 ? (
          <View style={[styles.count, { backgroundColor: colors.primarySoft }]}>
            <Text variant="tiny" color="primary">
              {count}
            </Text>
          </View>
        ) : null}
        <Icon name="chevron-down" size={17} color={colors.textMuted} />
      </Pressable>
      {error ? (
        <Text variant="tiny" color="danger">
          {error}
        </Text>
      ) : hint ? (
        <Text variant="tiny" color="faint">
          {hint}
        </Text>
      ) : null}
    </View>
  );
};

const OptionSheet = <T extends string>({
  visible,
  title,
  options,
  multiple,
  isSelected,
  onPick,
  onClear,
  onClose,
}: {
  visible: boolean;
  title: string;
  options: SelectOption<T>[];
  multiple?: boolean;
  isSelected: (key: T) => boolean;
  onPick: (key: T) => void;
  onClear?: () => void;
  onClose: () => void;
}) => {
  const { colors, reduceMotion } = useTheme();
  const insets = useSafeAreaInsets();
  const [query, setQuery] = useState("");
  const searchable = options.length > 10;
  const shown = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return needle ? options.filter((option) => option.label.toLowerCase().includes(needle)) : options;
  }, [options, query]);
  const close = () => {
    setQuery("");
    onClose();
  };

  return (
    <Modal transparent visible={visible} animationType={reduceMotion ? "none" : "slide"} onRequestClose={close} statusBarTranslucent>
      <Pressable style={[styles.backdrop, { backgroundColor: colors.overlay }]} onPress={close} accessibilityLabel="Close">
        <Pressable style={[styles.sheet, { backgroundColor: colors.surface, paddingBottom: insets.bottom + 16 }]}>
          <Grabber />
          <View style={styles.head}>
            <Text variant="title" style={styles.flex}>
              {title}
            </Text>
            {onClear ? (
              <Pressable accessibilityRole="button" hitSlop={8} onPress={onClear}>
                <Text variant="smallStrong" color="primary">
                  Clear
                </Text>
              </Pressable>
            ) : null}
          </View>
          {searchable ? (
            <View style={[styles.search, { backgroundColor: colors.bg, borderColor: colors.border }]}>
              <Icon name="search" size={16} color={colors.textFaint} />
              <TextInput
                value={query}
                onChangeText={setQuery}
                placeholder="Search"
                placeholderTextColor={colors.textFaint}
                style={[styles.searchInput, { color: colors.text }]}
                autoCorrect={false}
              />
            </View>
          ) : null}
          <ScrollView style={styles.list} keyboardShouldPersistTaps="handled">
            {shown.map((option, index) => {
              const selected = isSelected(option.key);
              return (
                <Pressable
                  key={option.key || "__none"}
                  accessibilityRole={multiple ? "checkbox" : "radio"}
                  accessibilityState={multiple ? { checked: selected } : { selected }}
                  onPress={() => onPick(option.key)}
                  style={({ pressed }) => [
                    styles.option,
                    index > 0 && { borderTopColor: colors.border, borderTopWidth: StyleSheet.hairlineWidth },
                    pressed && { backgroundColor: colors.surfaceAlt },
                  ]}
                >
                  {option.dot ? <View style={[styles.dot, { backgroundColor: option.dot }]} /> : null}
                  <View style={styles.flex}>
                    <Text variant="body" color={selected ? colors.primary : option.key === "" ? colors.textMuted : colors.text} style={selected ? styles.optionSelected : undefined}>
                      {option.label}
                    </Text>
                    {option.hint ? (
                      <Text variant="tiny" color="faint">
                        {option.hint}
                      </Text>
                    ) : null}
                  </View>
                  <Icon
                    name={multiple ? (selected ? "checkbox" : "square-outline") : selected ? "checkmark-circle" : "ellipse-outline"}
                    size={21}
                    color={selected ? colors.primary : colors.border}
                  />
                </Pressable>
              );
            })}
            {!shown.length ? (
              <Text variant="small" color="muted" style={styles.none}>
                Nothing matches.
              </Text>
            ) : null}
          </ScrollView>
          {multiple ? <Button label="Done" onPress={close} /> : null}
        </Pressable>
      </Pressable>
    </Modal>
  );
};

const styles = StyleSheet.create({
  flex: { flex: 1, minWidth: 0 },
  wrap: { gap: 6 },
  box: { minHeight: 52, borderRadius: radius.md, borderWidth: 1, paddingHorizontal: 14, flexDirection: "row", alignItems: "center", gap: 10 },
  value: { flex: 1, fontSize: 15, fontFamily: font.medium },
  dot: { width: 9, height: 9, borderRadius: 5 },
  count: { minWidth: 22, height: 20, borderRadius: 10, paddingHorizontal: 6, alignItems: "center", justifyContent: "center" },
  backdrop: { flex: 1, justifyContent: "flex-end" },
  sheet: { borderTopLeftRadius: 26, borderTopRightRadius: 26, paddingTop: 10, paddingHorizontal: 18, gap: 10, maxHeight: "82%" },
  head: { flexDirection: "row", alignItems: "center", gap: 10 },
  search: { flexDirection: "row", alignItems: "center", gap: 8, borderWidth: 1, borderRadius: 12, paddingHorizontal: 12, height: 42 },
  searchInput: { flex: 1, fontFamily: font.medium, fontSize: 14 },
  list: { flexGrow: 0 },
  option: { flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 13 },
  optionSelected: { fontFamily: font.bold },
  none: { paddingVertical: 16, textAlign: "center" },
});
