import React from "react";
import { Modal, Pressable, ScrollView, StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTheme } from "../theme/ThemeProvider";
import { radius } from "../theme/tokens";
import { Button } from "./Button";
import { Grabber } from "./Kit";
import { Text } from "./Text";

/*
 * Design 16 "Filter leads" sheet: tall white sheet, title + Reset, groups of
 * tinted pick-chips, and a pinned Cancel / primary footer.
 */
export const FilterSheet = ({
  visible,
  title,
  onClose,
  onReset,
  applyLabel = "Done",
  onApply,
  children,
}: {
  visible: boolean;
  title: string;
  onClose: () => void;
  onReset?: () => void;
  applyLabel?: string;
  onApply?: () => void;
  children: React.ReactNode;
}) => {
  const { colors, reduceMotion } = useTheme();
  const insets = useSafeAreaInsets();
  return (
    <Modal transparent visible={visible} animationType={reduceMotion ? "none" : "slide"} onRequestClose={onClose}>
      <View style={[styles.backdrop, { backgroundColor: colors.overlay, paddingTop: insets.top + 44 }]}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} accessibilityLabel="Close filters" />
        <View style={[styles.sheet, { backgroundColor: colors.surface }]}>
          <View style={styles.top}>
            <Grabber />
            <View style={styles.head}>
              <Text variant="title" style={styles.title}>
                {title}
              </Text>
              {onReset ? (
                <Pressable accessibilityRole="button" onPress={onReset} hitSlop={8}>
                  <Text variant="smallStrong" color="primary" style={styles.reset}>
                    Reset
                  </Text>
                </Pressable>
              ) : null}
            </View>
          </View>
          <ScrollView contentContainerStyle={styles.body}>{children}</ScrollView>
          <View style={[styles.footer, { borderTopColor: colors.border, paddingBottom: Math.max(insets.bottom, 12) + 14 }]}>
            <Button label="Cancel" variant="secondary" style={styles.cancel} onPress={onClose} />
            <Button
              label={applyLabel}
              style={styles.apply}
              onPress={() => {
                onApply?.();
                onClose();
              }}
            />
          </View>
        </View>
      </View>
    </Modal>
  );
};

export const FilterGroup = ({ label, children }: { label: string; children: React.ReactNode }) => (
  <View style={styles.group}>
    <Text variant="smallStrong" color="muted">
      {label}
    </Text>
    <View style={styles.chips}>{children}</View>
  </View>
);

const styles = StyleSheet.create({
  backdrop: { flex: 1, justifyContent: "flex-end" },
  sheet: { flex: 1, borderTopLeftRadius: radius.sheet, borderTopRightRadius: radius.sheet, overflow: "hidden" },
  top: { paddingTop: 10, paddingHorizontal: 18, gap: 16 },
  head: { flexDirection: "row", alignItems: "center" },
  title: { flex: 1, fontSize: 19 },
  reset: { fontSize: 13 },
  body: { padding: 18, paddingTop: 16, gap: 16 },
  group: { gap: 8 },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  footer: { flexDirection: "row", gap: 8, paddingTop: 12, paddingHorizontal: 18, borderTopWidth: 1 },
  cancel: { flex: 1, minHeight: 50, borderRadius: 15 },
  apply: { flex: 2, minHeight: 50, borderRadius: 15 },
});
