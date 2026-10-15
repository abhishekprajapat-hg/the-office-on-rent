import React, { useEffect, useState } from "react";
import { ActivityIndicator, Pressable, StyleSheet, View, type StyleProp, type ViewStyle } from "react-native";
import { recheckConnection, subscribeConnection } from "../api/client";
import { SLOW_MS, connectionNotice, type ConnectionState } from "../lib/connection";
import { statusKindOf } from "../lib/statusKind";
import { StatusPage } from "./StatusPage";
import { useTheme } from "../theme/ThemeProvider";
import { gutter, space, toneColors, type Tone } from "../theme/tokens";
import { Button } from "./Button";
import { Icon, type IconName } from "./Icon";
import { Text } from "./Text";

/* A spinner; after a few seconds it says the line is slow, so a long wait doesn't look like a hang. */
export const Loading = ({ label }: { label?: string }) => {
  const { colors } = useTheme();
  const [slow, setSlow] = useState(false);
  useEffect(() => {
    const timer = setTimeout(() => setSlow(true), SLOW_MS);
    return () => clearTimeout(timer);
  }, []);
  return (
    <View style={styles.center}>
      <ActivityIndicator color={colors.primary} />
      {label ? (
        <Text variant="small" color="muted">
          {label}
        </Text>
      ) : null}
      {slow ? (
        <View style={styles.slow} accessibilityLiveRegion="polite">
          <Icon name="speedometer-outline" size={16} color={colors.warning} />
          <Text variant="small" color="muted" align="center">
            Still loading. Your connection seems slow.
          </Text>
        </View>
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

/*
 * A load that failed. Offline, slow, server down, no access and not found
 * each get their own page; anything else is the plain error card.
 */
export const ErrorState = ({ message, onRetry, title = "Couldn't load this" }: { message: string; onRetry?: () => void; title?: string }) => {
  const kind = statusKindOf(message);
  if (kind === "error" || kind === "success" || kind === "sessionExpired") {
    return <EmptyState icon="alert-circle" tone="danger" title={title} message={message} actionLabel={onRetry ? "Try again" : undefined} onAction={onRetry} solidAction />;
  }
  const retry = onRetry && kind !== "noAccess" && kind !== "notFound" ? { label: "Try again", icon: "refresh" as IconName, onPress: onRetry } : undefined;
  return <StatusPage compact kind={kind} message={kind === "noAccess" || kind === "notFound" ? message : undefined} primary={retry} />;
};

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

/*
 * The connection strip (design 44): dark "You're offline", red "Can't reach
 * the CRM", amber "Slow connection". Shown at the top of every screen while
 * it applies; "Retry" checks again straight away.
 */
export const OfflineBanner = ({ inset = true, style }: { inset?: boolean; style?: StyleProp<ViewStyle> }) => {
  const { colors } = useTheme();
  const [state, setState] = useState<ConnectionState>({ online: true, slow: false, serverDown: false });
  useEffect(() => subscribeConnection(setState), []);
  const notice = connectionNotice(state);
  if (!notice) return null;
  const look = {
    offline: { bg: colors.ink, fg: colors.onInk, icon: "cloud-offline-outline" as IconName },
    server: { bg: colors.dangerSoft, fg: colors.danger, icon: "server-outline" as IconName },
    slow: { bg: colors.warningSoft, fg: colors.warning, icon: "speedometer-outline" as IconName },
  }[notice.kind];
  return (
    <View style={[styles.offline, inset && styles.offlineInset, { backgroundColor: look.bg }, style]} accessibilityRole="alert" accessibilityLiveRegion="polite">
      <Icon name={look.icon} size={17} color={look.fg} />
      <View style={styles.offlineTexts}>
        <Text variant="small" color={look.fg} style={styles.offlineText}>
          {notice.title}
        </Text>
        <Text variant="tiny" color={look.fg} style={styles.offlineSub}>
          {notice.message}
        </Text>
      </View>
      {notice.kind !== "slow" ? (
        <Pressable accessibilityRole="button" accessibilityLabel="Check the connection again" hitSlop={8} onPress={recheckConnection}>
          <Text variant="smallStrong" color={look.fg} style={styles.retry}>
            Retry
          </Text>
        </Pressable>
      ) : null}
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
  slow: { flexDirection: "row", alignItems: "center", gap: 6, maxWidth: 280 },
  inline: { flexDirection: "row", gap: space.sm, padding: space.md, borderRadius: 13, alignItems: "flex-start" },
  inlineText: { flex: 1 },
  offline: { flexDirection: "row", alignItems: "center", gap: 10, marginBottom: 8, paddingVertical: 9, paddingHorizontal: 12, borderRadius: 13 },
  offlineInset: { marginHorizontal: gutter },
  offlineTexts: { flex: 1, minWidth: 0 },
  offlineText: { fontFamily: "PlusJakartaSans_700Bold", fontSize: 12.5 },
  offlineSub: { opacity: 0.85 },
  retry: { textDecorationLine: "underline" },
});
