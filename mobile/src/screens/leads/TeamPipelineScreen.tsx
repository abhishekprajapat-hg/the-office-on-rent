import React from "react";
import { FlatList, RefreshControl, StyleSheet, View } from "react-native";
import { api } from "../../api/client";
import type { LeadSummary } from "../../api/types";
import { listUsers } from "../../api/users";
import { roleLabel } from "../../lib/roles";
import { useQuery } from "../../lib/useQuery";
import type { RootScreenProps } from "../../navigation/types";
import { useTheme } from "../../theme/ThemeProvider";
import { space } from "../../theme/tokens";
import { Avatar, Card, EmptyState, ErrorState, Icon, Loading, Text } from "../../ui";

const LEAD_ROLES = ["MANAGER", "INSIDE_EXECUTIVE", "EXECUTIVE", "FIELD_EXECUTIVE"];

/* Server-side counts per person, so the numbers match the Leads list exactly. */
const summaryFor = async (assignedTo: string) => {
  const res = await api.get<{ summary: LeadSummary }>("/leads/summary", {
    params: { assignedTo, tzOffsetMinutes: -new Date().getTimezoneOffset() },
  });
  return res.data?.summary || null;
};

export const TeamPipelineScreen = ({ navigation }: RootScreenProps<"TeamPipeline">) => {
  const { colors } = useTheme();
  const { data, loading, error, refreshing, refresh } = useQuery(async () => {
    const people = (await listUsers()).filter((user) => user.isActive !== false && LEAD_ROLES.includes(user.role));
    const [rows, unassigned] = await Promise.all([
      Promise.all(people.map(async (person) => ({ person, summary: await summaryFor(person._id).catch(() => null) }))),
      summaryFor("UNASSIGNED").catch(() => null),
    ]);
    rows.sort((a, b) => (b.summary?.open || 0) - (a.summary?.open || 0));
    return { rows, unassigned };
  }, []);

  if (loading) return <Loading label="Counting everyone's pipeline…" />;
  if (error || !data) return <ErrorState message={error || "Couldn't load the team."} onRetry={refresh} />;

  return (
    <FlatList
      style={{ backgroundColor: colors.bg }}
      contentContainerStyle={styles.list}
      data={data.rows}
      keyExtractor={(row) => row.person._id}
      ItemSeparatorComponent={() => <View style={styles.separator} />}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={colors.primary} colors={[colors.primary]} />}
      ListHeaderComponent={
        data.unassigned && data.unassigned.open ? (
          <Card
            onPress={() => navigation.navigate("PersonLeads", { assignedTo: "UNASSIGNED", name: "Unassigned" })}
            style={[styles.row, styles.header, { backgroundColor: colors.warningSoft, borderWidth: 0 }]}
          >
            <Icon name="alert-circle" size={22} color={colors.warning} />
            <View style={styles.flex}>
              <Text variant="bodyStrong">Unassigned leads</Text>
              <Text variant="small" color="muted">
                {data.unassigned.open} open, waiting for an owner
              </Text>
            </View>
            <Icon name="chevron-forward" size={18} color={colors.textFaint} />
          </Card>
        ) : null
      }
      ListEmptyComponent={<EmptyState icon="people-outline" title="No one to show" message="Your team's pipeline appears here." />}
      renderItem={({ item }) => {
        const summary = item.summary;
        return (
          <Card onPress={() => navigation.navigate("PersonLeads", { assignedTo: item.person._id, name: item.person.name })} style={styles.row}>
            <Avatar name={item.person.name} uri={item.person.profileImageUrl} size={44} />
            <View style={styles.flex}>
              <Text variant="bodyStrong">{item.person.name}</Text>
              <Text variant="tiny" color="faint">
                {roleLabel(item.person.role)}
              </Text>
              {summary ? (
                <View style={styles.stats}>
                  <Stat value={summary.open} label="open" color={colors.text} />
                  <Stat value={summary.followUpsDue} label="due" color={summary.overdueFollowUps ? colors.danger : colors.warning} />
                  <Stat value={summary.pendingFirstCalls} label="uncalled" color={colors.info} />
                  <Stat value={summary.closed} label="closed" color={colors.success} />
                </View>
              ) : (
                <Text variant="tiny" color="faint">
                  Counts unavailable
                </Text>
              )}
            </View>
            <Icon name="chevron-forward" size={18} color={colors.textFaint} />
          </Card>
        );
      }}
    />
  );
};

const Stat = ({ value, label, color }: { value: number; label: string; color: string }) => (
  <Text variant="small" color="muted">
    <Text variant="smallStrong" color={color}>
      {value}
    </Text>{" "}
    {label}
  </Text>
);

const styles = StyleSheet.create({
  flex: { flex: 1 },
  list: { padding: space.lg },
  separator: { height: space.sm },
  header: { marginBottom: space.md },
  row: { flexDirection: "row", alignItems: "center", gap: space.md },
  stats: { flexDirection: "row", flexWrap: "wrap", gap: space.md, marginTop: 4 },
});
