import React from "react";
import { Modal, Pressable, StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTheme } from "../theme/ThemeProvider";
import { radius, space } from "../theme/tokens";
import { Icon, type IconName } from "./Icon";
import { Text } from "./Text";

export type SheetAction = { key: string; label: string; icon: IconName; destructive?: boolean; hint?: string; onPress: () => void };

/* A bottom sheet of actions - the phone's answer to the web's "more" menus. */
export const ActionSheet = ({
  visible,
  title,
  actions,
  onClose,
}: {
  visible: boolean;
  title?: string;
  actions: SheetAction[];
  onClose: () => void;
}) => {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  return (
    <Modal transparent visible={visible} animationType="fade" onRequestClose={onClose}>
      <Pressable style={[styles.backdrop, { backgroundColor: colors.overlay }]} onPress={onClose} accessibilityLabel="Close menu">
        <Pressable style={[styles.sheet, { backgroundColor: colors.surface, paddingBottom: insets.bottom + space.lg }]}>
          <View style={[styles.grabber, { backgroundColor: colors.border }]} />
          {title ? (
            <Text variant="smallStrong" color="muted" style={styles.title}>
              {title}
            </Text>
          ) : null}
          {actions.map((action) => (
            <Pressable
              key={action.key}
              accessibilityRole="button"
              onPress={() => {
                onClose();
                action.onPress();
              }}
              style={({ pressed }) => [styles.row, pressed && { backgroundColor: colors.surfaceAlt }]}
            >
              <Icon name={action.icon} size={22} color={action.destructive ? colors.danger : colors.text} />
              <View style={styles.flex}>
                <Text variant="body" color={action.destructive ? "danger" : "text"}>
                  {action.label}
                </Text>
                {action.hint ? (
                  <Text variant="tiny" color="faint">
                    {action.hint}
                  </Text>
                ) : null}
              </View>
            </Pressable>
          ))}
        </Pressable>
      </Pressable>
    </Modal>
  );
};

const styles = StyleSheet.create({
  flex: { flex: 1 },
  backdrop: { flex: 1, justifyContent: "flex-end" },
  sheet: { borderTopLeftRadius: radius.xl, borderTopRightRadius: radius.xl, paddingTop: space.sm },
  grabber: { width: 40, height: 4, borderRadius: 2, alignSelf: "center", marginBottom: space.sm },
  title: { paddingHorizontal: space.xl, paddingVertical: space.sm },
  row: { flexDirection: "row", alignItems: "center", gap: space.lg, paddingHorizontal: space.xl, paddingVertical: space.md + 2 },
});
