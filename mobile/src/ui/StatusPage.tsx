import React from "react";
import { StyleSheet, View, type StyleProp, type ViewStyle } from "react-native";
import { STATUS_COPY, type StatusKind } from "../lib/statusKind";
import { useTheme } from "../theme/ThemeProvider";
import { space, toneColors, type Tone } from "../theme/tokens";
import { Button } from "./Button";
import { Icon, type IconName } from "./Icon";
import { Text } from "./Text";

const LOOK: Record<StatusKind, { icon: IconName; tone: Tone }> = {
  success: { icon: "checkmark-circle", tone: "success" },
  error: { icon: "alert-circle", tone: "danger" },
  offline: { icon: "cloud-offline", tone: "neutral" },
  slow: { icon: "speedometer", tone: "warning" },
  server: { icon: "server", tone: "danger" },
  notFound: { icon: "compass", tone: "primary" },
  noAccess: { icon: "lock-closed", tone: "warning" },
  sessionExpired: { icon: "time", tone: "primary" },
};

export type StatusAction = { label: string; onPress: () => void; icon?: IconName };

/*
 * A whole-screen state: a big tinted badge, a title, a sentence and up to two
 * buttons. Used by the success, not-found, no-access and crash pages and by
 * ErrorState when a load fails.
 */
export const StatusPage = ({
  kind,
  title,
  message,
  detail,
  primary,
  secondary,
  compact,
  style,
}: {
  kind: StatusKind;
  title?: string;
  message?: string;
  /* Small print under the message (an error code, what was saved). */
  detail?: string;
  primary?: StatusAction;
  secondary?: StatusAction;
  /* Inside a list or card rather than filling the screen. */
  compact?: boolean;
  style?: StyleProp<ViewStyle>;
}) => {
  const { colors } = useTheme();
  const look = LOOK[kind];
  const { fg, bg } = toneColors(colors, look.tone);
  const copy = STATUS_COPY[kind];
  const size = compact ? 64 : 96;
  return (
    <View style={[styles.wrap, compact && styles.compact, style]} accessibilityRole={kind === "success" ? "summary" : "alert"}>
      <View style={[styles.ring, { width: size + 28, height: size + 28, borderRadius: (size + 28) / 2, borderColor: bg }]}>
        <View style={[styles.badge, { width: size, height: size, borderRadius: size / 2, backgroundColor: bg }]}>
          <Icon name={look.icon} size={compact ? 30 : 46} color={fg} />
        </View>
      </View>
      <Text variant={compact ? "heading" : "title"} align="center" style={styles.title}>
        {title || copy.title}
      </Text>
      <Text variant="body" color="muted" align="center" style={styles.message}>
        {message || copy.message}
      </Text>
      {detail ? (
        <Text variant="tiny" color="faint" align="center" style={styles.message}>
          {detail}
        </Text>
      ) : null}
      {primary || secondary ? (
        <View style={styles.actions}>
          {primary ? <Button label={primary.label} icon={primary.icon} onPress={primary.onPress} style={styles.button} /> : null}
          {secondary ? <Button label={secondary.label} icon={secondary.icon} variant="ghost" onPress={secondary.onPress} style={styles.button} /> : null}
        </View>
      ) : null}
    </View>
  );
};

const styles = StyleSheet.create({
  wrap: { flex: 1, alignItems: "center", justifyContent: "center", paddingHorizontal: space.xxl, paddingVertical: space.xxl, gap: 10 },
  compact: { flex: 0, paddingVertical: space.xl },
  ring: { borderWidth: 2, alignItems: "center", justifyContent: "center", marginBottom: 12 },
  badge: { alignItems: "center", justifyContent: "center" },
  title: { marginTop: 8 },
  message: { maxWidth: 320 },
  actions: { alignSelf: "stretch", maxWidth: 360, width: "100%", alignItems: "stretch", gap: 4, marginTop: 14 },
  button: { alignSelf: "stretch" },
});
