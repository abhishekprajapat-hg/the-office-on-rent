import React from "react";
import { KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTheme } from "../theme/ThemeProvider";
import { radius } from "../theme/tokens";
import { Grabber } from "./Kit";
import { Text } from "./Text";

/*
 * The design's bottom sheet (Apply for leave, Update status, Transfer lead):
 * dimmed backdrop, white panel with 26px top corners, grabber, bold title,
 * optional sub-line, scrolling body.
 */
export const Sheet = ({
  visible,
  title,
  subtitle,
  onClose,
  children,
  footer,
}: {
  visible: boolean;
  title: string;
  subtitle?: string;
  onClose: () => void;
  children: React.ReactNode;
  /* Pinned under the scrolling body (the primary action). */
  footer?: React.ReactNode;
}) => {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  return (
    <Modal transparent visible={visible} animationType="slide" onRequestClose={onClose} statusBarTranslucent>
      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <Pressable style={[styles.backdrop, { backgroundColor: colors.overlay }]} onPress={onClose} accessibilityLabel="Close" />
        <View style={[styles.panel, { backgroundColor: colors.surface, paddingBottom: Math.max(insets.bottom, 12) + 14 }]}>
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
          <ScrollView style={styles.body} contentContainerStyle={styles.bodyContent} keyboardShouldPersistTaps="handled" bounces={false}>
            {children}
          </ScrollView>
          {footer ? <View style={styles.footer}>{footer}</View> : null}
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
};

const styles = StyleSheet.create({
  flex: { flex: 1, justifyContent: "flex-end" },
  backdrop: { ...StyleSheet.absoluteFillObject },
  panel: { borderTopLeftRadius: radius.sheet, borderTopRightRadius: radius.sheet, paddingTop: 10, paddingHorizontal: 18, maxHeight: "92%", gap: 12 },
  head: { gap: 2 },
  title: { fontSize: 19 },
  sub: { fontSize: 12.5 },
  body: { flexGrow: 0 },
  bodyContent: { gap: 14, paddingBottom: 2 },
  footer: { gap: 8 },
});
