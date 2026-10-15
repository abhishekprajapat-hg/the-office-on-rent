import React from "react";
import { StyleSheet, View } from "react-native";
import type { Lead } from "../api/types";
import { formatWhen, isOverdue } from "../lib/format";
import { leadTemperature, statusMeta, TEMPERATURE } from "../lib/leadStatus";
import { toneColors } from "../theme/tokens";
import { Avatar, Badge, Card, Icon, Text } from "../ui";
import { useTheme } from "../theme/ThemeProvider";

/* Lead card from the v3 Leads list: initials tile, name + temperature dot, status pill, follow-up time. */
export const LeadRow = ({ lead, onPress }: { lead: Lead; onPress: () => void }) => {
  const { colors } = useTheme();
  const status = statusMeta(lead.status);
  const temperature = TEMPERATURE[leadTemperature(lead)];
  const owner = lead.assignedExecutive?.name || lead.assignedTo?.name;
  const overdue = isOverdue(lead.nextFollowUp);
  const subtitle = [lead.company && !lead.projectInterested ? lead.company : null, lead.projectInterested, lead.city].filter(Boolean).join(" · ") || lead.phone;

  return (
    <Card onPress={onPress} style={styles.card} accessibilityLabel={`${lead.name}, ${status.label}${temperature ? `, ${temperature.label}` : ""}`}>
      <Avatar name={lead.name} size={40} />
      <View style={styles.body}>
        <View style={styles.titleRow}>
          <Text variant="bodyStrong" numberOfLines={1} style={styles.name}>
            {lead.name}
          </Text>
          {temperature ? <View style={[styles.dot, { backgroundColor: toneColors(colors, temperature.tone).fg }]} /> : null}
        </View>
        <Text variant="small" color="muted" numberOfLines={1} style={styles.sub}>
          {subtitle}
        </Text>
        <View style={styles.metaRow}>
          <Badge label={status.label} tone={status.tone} />
          {lead.nextFollowUp ? (
            <View style={styles.followUp}>
              <Icon name="alarm-outline" size={12} color={overdue ? colors.danger : colors.textMuted} />
              <Text variant="tiny" color={overdue ? colors.danger : colors.textMuted} numberOfLines={1} style={styles.metaText}>
                {overdue ? `Overdue ${formatWhen(lead.nextFollowUp).replace(/^Today, /, "")}` : formatWhen(lead.nextFollowUp)}
              </Text>
            </View>
          ) : owner ? (
            <Text variant="tiny" color="faint" numberOfLines={1} style={styles.metaText}>
              {owner}
            </Text>
          ) : null}
        </View>
      </View>
      <Icon name="chevron-forward" size={16} color={colors.textFaint} />
    </Card>
  );
};

const styles = StyleSheet.create({
  card: { flexDirection: "row", alignItems: "center", gap: 10, padding: 12, borderRadius: 16 },
  body: { flex: 1, minWidth: 0, gap: 2 },
  titleRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  name: { flexShrink: 1 },
  dot: { width: 7, height: 7, borderRadius: 4 },
  sub: { fontSize: 11.5, lineHeight: 15 },
  metaRow: { flexDirection: "row", alignItems: "center", gap: 8, marginTop: 2 },
  followUp: { flexDirection: "row", alignItems: "center", gap: 3, flexShrink: 1 },
  metaText: { fontFamily: "PlusJakartaSans_600SemiBold" },
});
