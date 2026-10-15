import React, { useEffect, useState } from "react";
import { ActivityIndicator, StyleSheet, View } from "react-native";
import { subscribeOnline } from "../api/client";
import { useTheme } from "../theme/ThemeProvider";
import { gutter, space, toneColors, type Tone } from "../theme/tokens";
import { Button } from "./Button";
import { Icon, type IconName } from "./Icon";
import { Text } from "./Text";

export const Loading = ({ label }: { label?: string }) => {
  const { colors } = useTheme();
  return (
    <View style={styles.center}>
      <ActivityIndicator color={colors.primary} />
      {label ? (
        <Text variant="small" color="muted">
          {label}
        </Text>
      ) : null}
    </View>
  );
};

/* Design 44 state card: tinted icon tile, bold title, short message, one action. */
export const EmptyState = ({
  icon = "file-tray-outline",
  title,
  message,
  actionLabel,
  onAction,
  tone = "primary",
  solidAction,
}: {
  icon?: IconName;
  title: string;
  message?: string;
  actionLabel?: string;
  onAction?: () => void;
  tone?: Tone;
  solidAction?: boolean;
}) => {
  const { colors } = useTheme();
  const { fg, bg } = toneColors(colors, tone);
  return (
    <View style={styles.wrap}>
      <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
        <View style={[styles.iconWrap, { backgroundColor: bg }]}>
          <Icon name={icon} size={24} color={fg} />
        </View>
        <Text variant="heading" align="center" style={styles.title}>
          {title}
        </Text>
        {message ? (
          <Text variant="small" color="muted" align="center" style={styles.message}>
            {message}
          </Text>
        ) : null}
        {actionLabel && onAction ? <Button label={actionLabel} onPress={onAction} size="sm" variant={solidAction ? "primary" : "soft"} style={styles.action} /> : null}
      </View>
    </View>
  );
};

export const ErrorState = ({ message, onRetry, title = "Couldn't load this" }: { message: string; onRetry?: () => void; title?: string }) => (
  <EmptyState icon="alert-circle" tone="danger" title={title} message={message} actionLabel={onRetry ? "Try again" : undefined} onAction={onRetry} solidAction />
);

/* An inline red message box, for form submit errors. */
export const InlineError = ({ message }: { message?: string | null }) => {
  const { colors } = useTheme();
  if (!message) return null;
  return (
    <View style={[styles.inline, { backgroundColor: colors.dangerSoft }]} accessibilityRole="alert">
      <Icon name="alert-circle" size={18} color={colors.danger} />
      <Text variant="small" color="danger" style={styles.inlineText}>
        {message}
      </Text>
    </View>
  );
};

/* Dark "You're offline" strip (design 44), shown while requests can't reach the server. */
export const OfflineBanner = () => {
  const { colors } = useTheme();
  const [online, setOnline] = useState(true);
  useEffect(() => subscribeOnline(setOnline), []);
  if (online) return null;
  return (
    <View style={[styles.offline, { backgroundColor: colors.ink }]} accessibilityRole="alert">
      <Icon name="cloud-offline-outline" size={17} color={colors.onInk} />
      <Text variant="small" color={colors.onInk} style={styles.offlineText}>
        You're offline. Pull to refresh once you're back.
      </Text>
    </View>
  );
};

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: "center", justifyContent: "center", padding: space.xxl, gap: space.md },
  wrap: { flex: 1, justifyContent: "center", padding: gutter },
  card: { borderWidth: 1, borderRadius: 20, paddingVertical: 20, paddingHorizontal: 16, alignItems: "center", gap: 8 },
  iconWrap: { width: 48, height: 48, borderRadius: 16, alignItems: "center", justifyContent: "center" },
  title: { fontSize: 14.5 },
  message: { maxWidth: 240, fontSize: 12.5, lineHeight: 17 },
  action: { marginTop: 4, borderRadius: 12, paddingHorizontal: 16 },
  inline: { flexDirection: "row", gap: space.sm, padding: space.md, borderRadius: 13, alignItems: "flex-start" },
  inlineText: { flex: 1 },
  offline: { flexDirection: "row", alignItems: "center", gap: 8, marginHorizontal: gutter, marginBottom: 8, paddingVertical: 10, paddingHorizontal: 12, borderRadius: 13 },
  offlineText: { flex: 1, fontFamily: "PlusJakartaSans_600SemiBold", fontSize: 12.5 },
});
