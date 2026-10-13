import React from "react";
import { ActivityIndicator, StyleSheet, View } from "react-native";
import { useTheme } from "../theme/ThemeProvider";
import { space } from "../theme/tokens";
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

export const EmptyState = ({
  icon = "file-tray-outline",
  title,
  message,
  actionLabel,
  onAction,
}: {
  icon?: IconName;
  title: string;
  message?: string;
  actionLabel?: string;
  onAction?: () => void;
}) => {
  const { colors } = useTheme();
  return (
    <View style={styles.center}>
      <View style={[styles.iconWrap, { backgroundColor: colors.primarySoft }]}>
        <Icon name={icon} size={26} color={colors.primary} />
      </View>
      <Text variant="heading" align="center">
        {title}
      </Text>
      {message ? (
        <Text variant="small" color="muted" align="center" style={styles.message}>
          {message}
        </Text>
      ) : null}
      {actionLabel && onAction ? <Button label={actionLabel} onPress={onAction} size="sm" variant="secondary" /> : null}
    </View>
  );
};

export const ErrorState = ({ message, onRetry }: { message: string; onRetry?: () => void }) => (
  <EmptyState
    icon="cloud-offline-outline"
    title="Couldn't load this"
    message={message}
    actionLabel={onRetry ? "Try again" : undefined}
    onAction={onRetry}
  />
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

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: "center", justifyContent: "center", padding: space.xxl, gap: space.md },
  iconWrap: { width: 56, height: 56, borderRadius: 28, alignItems: "center", justifyContent: "center" },
  message: { maxWidth: 280 },
  inline: { flexDirection: "row", gap: space.sm, padding: space.md, borderRadius: 10, alignItems: "flex-start" },
  inlineText: { flex: 1 },
});
