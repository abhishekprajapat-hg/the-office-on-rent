import React, { useEffect, useMemo, useState } from "react";
import { FlatList, Modal, Pressable, StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTheme } from "../theme/ThemeProvider";
import { radius } from "../theme/tokens";
import { Avatar } from "./Avatar";
import { Field } from "./Field";
import { Grabber } from "./Kit";
import { Text } from "./Text";

export type PickerItem = { key: string; label: string; sub?: string; avatar?: boolean };

/*
 * Bottom sheet with an optional search and a single-select list (the design's
 * "Transfer lead" / "Assign to" pattern: initials tile, name, sub-line, radio).
 */
export const PickerSheet = ({
  visible,
  title,
  subtitle,
  items,
  selected,
  onPick,
  onClose,
  searchPlaceholder,
  onSearch,
}: {
  visible: boolean;
  title: string;
  subtitle?: string;
  items: PickerItem[];
  selected?: string;
  onPick: (key: string) => void;
  onClose: () => void;
  searchPlaceholder?: string;
  /* Server-side search: called (debounced) as the person types; the list shows whatever `items` becomes. */
  onSearch?: (query: string) => void;
}) => {
  const { colors, reduceMotion } = useTheme();
  const insets = useSafeAreaInsets();
  const [query, setQuery] = useState("");
  useEffect(() => {
    if (!onSearch) return;
    const timer = setTimeout(() => onSearch(query.trim()), 300);
    return () => clearTimeout(timer);
  }, [query]); // eslint-disable-line react-hooks/exhaustive-deps
  const shown = useMemo(() => {
    const needle = query.trim().toLowerCase();
    // Server-searched lists keep fixed rows (e.g. "No linked lead") plus what came back.
    if (onSearch) return items;
    return needle ? items.filter((item) => `${item.label} ${item.sub || ""}`.toLowerCase().includes(needle)) : items;
  }, [items, query, onSearch]);

  return (
    <Modal transparent visible={visible} animationType={reduceMotion ? "none" : "slide"} onRequestClose={onClose}>
      <Pressable style={[styles.backdrop, { backgroundColor: colors.overlay }]} onPress={onClose} accessibilityLabel="Close">
        <Pressable style={[styles.sheet, { backgroundColor: colors.surface, paddingBottom: insets.bottom + 18 }]}>
          <Grabber />
          <View style={styles.head}>
            <Text variant="title" style={styles.title}>
              {title}
            </Text>
            {subtitle ? (
              <Text variant="small" color="muted" style={styles.sub}>
                {subtitle}
              </Text>
            ) : null}
          </View>
          {searchPlaceholder ? <Field compact icon="search" value={query} onChangeText={setQuery} placeholder={searchPlaceholder} autoCorrect={false} /> : null}
          <FlatList
            data={shown}
            keyExtractor={(item) => item.key}
            style={styles.list}
            keyboardShouldPersistTaps="handled"
            renderItem={({ item, index }) => {
              const on = item.key === selected;
              return (
                <Pressable
                  accessibilityRole="radio"
                  accessibilityState={{ selected: on }}
                  onPress={() => {
                    onPick(item.key);
                    onClose();
                  }}
                  style={[styles.row, index > 0 && { borderTopWidth: 1, borderTopColor: colors.border }]}
                >
                  {item.avatar !== false ? <Avatar name={item.label} size={38} /> : null}
                  <View style={styles.flex}>
                    <Text variant="bodyStrong" style={styles.name} numberOfLines={1}>
                      {item.label}
                    </Text>
                    {item.sub ? (
                      <Text variant="small" color="muted" style={styles.rowSub} numberOfLines={1}>
                        {item.sub}
                      </Text>
                    ) : null}
                  </View>
                  <View style={[styles.radio, { borderColor: on ? colors.primary : colors.border, backgroundColor: on ? colors.primary : colors.surface }]}>
                    {on ? <View style={[styles.radioDot, { backgroundColor: colors.surface }]} /> : null}
                  </View>
                </Pressable>
              );
            }}
            ListEmptyComponent={
              <Text variant="small" color="muted" style={styles.empty}>
                No matches.
              </Text>
            }
          />
        </Pressable>
      </Pressable>
    </Modal>
  );
};

const styles = StyleSheet.create({
  flex: { flex: 1, minWidth: 0 },
  backdrop: { flex: 1, justifyContent: "flex-end" },
  sheet: { borderTopLeftRadius: radius.sheet, borderTopRightRadius: radius.sheet, paddingTop: 10, paddingHorizontal: 18, gap: 12, maxHeight: "85%" },
  head: { gap: 2 },
  title: { fontSize: 19 },
  sub: { fontSize: 12.5 },
  list: { flexGrow: 0 },
  row: { flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 10, paddingHorizontal: 4 },
  name: { fontSize: 13.5 },
  rowSub: { fontSize: 11.5 },
  radio: { width: 22, height: 22, borderRadius: 11, borderWidth: 2, alignItems: "center", justifyContent: "center" },
  radioDot: { width: 8, height: 8, borderRadius: 4 },
  empty: { paddingVertical: 16, textAlign: "center" },
});
