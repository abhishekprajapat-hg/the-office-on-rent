import React from "react";
import { StyleSheet, View } from "react-native";
import type { Lead } from "../api/types";
import { formatWhen, isOverdue } from "../lib/format";
import { leadTemperature, statusMeta, TEMPERATURE } from "../lib/leadStatus";
import { space } from "../theme/tokens";
import { Avatar, Badge, Card, Icon, Text } from "../ui";
import { useTheme } from "../theme/ThemeProvider";

export const LeadRow = ({ lead, onPress }: { lead: Lead; onPress: () => void }) => {
  const { colors } = useTheme();
  const status = statusMeta(lead.status);
  const temperature = TEMPERATURE[leadTemperature(lead)];
  const owner = lead.assignedExecutive?.name || lead.assignedTo?.name;
  const overdue = isOverdue(lead.nextFollowUp);
  const subtitle = [lead.projectInterested, lead.city].filter(Boolean).join(" · ") || lead.phone;

  return (
    <Card onPress={onPress} style={styles.card} accessibilityLabel={`${lead.name}, ${status.label}`}>
      <Avatar name={lead.name} size={42} />
      <View style={styles.body}>
        <View style={styles.titleRow}>
          <Text variant="bodyStrong" numberOfLines={1} style={styles.name}>
            {lead.name}
          </Text>
          {temperature ? <Badge label={temperature.label} tone={temperature.tone} /> : null}
        </View>
        <Text variant="small" color="muted" numberOfLines={1}>
          {subtitle}
        </Text>
        <View style={styles.metaRow}>
          <Badge label={status.label} tone={status.tone} />
          {lead.nextFollowUp ? (
            <View style={styles.followUp}>
              <Icon name="alarm-outline" size={13} color={overdue ? colors.danger : colors.textMuted} />
              <Text variant="tiny" color={overdue ? colors.danger : colors.textMuted} numberOfLines={1}>
                {formatWhen(lead.nextFollowUp)}
              </Text>
            </View>
          ) : owner ? (
            <Text variant="tiny" color="faint" numberOfLines={1}>
              {owner}
            </Text>
          ) : null}
        </View>
      </View>
      <Icon name="chevron-forward" size={18} color={colors.textFaint} />
    </Card>
  );
};

const styles = StyleSheet.create({
  card: { flexDirection: "row", alignItems: "center", gap: space.md, paddingVertical: space.md },
  body: { flex: 1, gap: 3 },
  titleRow: { flexDirection: "row", alignItems: "center", gap: space.sm },
  name: { flexShrink: 1 },
  metaRow: { flexDirection: "row", alignItems: "center", gap: space.sm, marginTop: 3 },
  followUp: { flexDirection: "row", alignItems: "center", gap: 3, flexShrink: 1 },
});
