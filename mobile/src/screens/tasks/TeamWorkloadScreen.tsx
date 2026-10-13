import React, { useMemo, useState } from "react";
import { FlatList, RefreshControl, StyleSheet, View } from "react-native";
import { getAssignees, getTaskStats, getTaskStatsByUser } from "../../api/tasks";
import { roleLabel } from "../../lib/roles";
import { useQuery } from "../../lib/useQuery";
import { completionRate, WORKLOAD, workloadFor, type Workload } from "../../lib/workload";
import type { RootScreenProps } from "../../navigation/types";
import { useTheme } from "../../theme/ThemeProvider";
import { space, toneColors } from "../../theme/tokens";
import { Avatar, Badge, Card, ChipRow, EmptyState, ErrorState, Icon, Loading, Text } from "../../ui";

type Sort = "tasks" | "overdue" | "progress" | "name";

export const TeamWorkloadScreen = ({ navigation }: RootScreenProps<"TeamWorkload">) => {
  const { colors } = useTheme();
  const [filter, setFilter] = useState<"ALL" | Workload>("ALL");
  const [sort, setSort] = useState<Sort>("tasks");
  const [role, setRole] = useState("ALL");
  const { data, loading, error, refreshing, refresh } = useQuery(async () => {
    const [people, byUser, totals] = await Promise.all([getAssignees(), getTaskStatsByUser(), getTaskStats()]);
    return {
      totals,
      members: people.map((person) => {
        const stat = byUser[person._id] || { total: 0, TODO: 0, IN_PROGRESS: 0, COMPLETED: 0, BACKLOG: 0, pending: 0, overdue: 0 };
        return { person, stat, load: workloadFor(stat) };
      }),
    };
  }, []);

  const members = useMemo(() => {
    const list = (data?.members || []).filter((member) => (filter === "ALL" || member.load === filter) && (role === "ALL" || member.person.role === role));
    return [...list].sort((a, b) => {
      if (sort === "name") return a.person.name.localeCompare(b.person.name);
      if (sort === "overdue") return (b.stat.overdue || 0) - (a.stat.overdue || 0);
      if (sort === "progress") return completionRate(a.stat) - completionRate(b.stat);
      return (b.stat.total || 0) - (a.stat.total || 0);
    });
  }, [data, filter, sort, role]);
  const roles = useMemo(() => [...new Set((data?.members || []).map((member) => String(member.person.role || "")).filter(Boolean))], [data]);

  if (loading) return <Loading />;
  if (error || !data) return <ErrorState message={error || "Couldn't load the team."} onRetry={refresh} />;

  const totals = data.totals;
  const counts = (key: Workload) => data.members.filter((member) => member.load === key).length;

  return (
    <FlatList
      style={{ backgroundColor: colors.bg }}
      contentContainerStyle={styles.list}
      data={members}
      keyExtractor={(member) => member.person._id}
      ItemSeparatorComponent={() => <View style={styles.separator} />}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={colors.primary} colors={[colors.primary]} />}
      ListHeaderComponent={
        <View style={styles.header}>
          {totals ? (
            <View style={styles.tiles}>
              <Tile label="Total" value={totals.total} />
              <Tile label="Done" value={totals.COMPLETED} tone={colors.success} />
              <Tile label="Overdue" value={totals.overdue} tone={totals.overdue ? colors.danger : undefined} />
              <Tile label="Done rate" value={`${completionRate(totals)}%`} />
            </View>
          ) : null}
          <ChipRow
            options={[
              { key: "ALL", label: "Everyone", count: data.members.length },
              { key: "busy", label: "Busy", count: counts("busy") },
              { key: "balanced", label: "Balanced", count: counts("balanced") },
              { key: "available", label: "Available", count: counts("available") },
              { key: "offline", label: "No tasks", count: counts("offline") },
            ]}
            value={filter}
            onChange={(key) => setFilter(key as typeof filter)}
          />
          <ChipRow options={[{ key: "ALL", label: "All roles" }, ...roles.map((item) => ({ key: item, label: roleLabel(item) }))]} value={role} onChange={setRole} />
          <ChipRow
            options={[
              { key: "tasks", label: "Most tasks" },
              { key: "overdue", label: "Most overdue" },
              { key: "progress", label: "Least progress" },
              { key: "name", label: "Name" },
            ]}
            value={sort}
            onChange={(key) => setSort(key as Sort)}
          />
        </View>
      }
      ListEmptyComponent={<EmptyState icon="people-outline" title="Nobody here" />}
      renderItem={({ item }) => {
        const meta = WORKLOAD[item.load];
        const rate = completionRate(item.stat);
        const { fg } = toneColors(colors, meta.tone);
        return (
          <Card onPress={() => navigation.navigate("PersonTasks", { assignedTo: item.person._id, name: item.person.name })} style={styles.row}>
            <Avatar name={item.person.name} uri={(item.person as { profileImageUrl?: string }).profileImageUrl} size={42} />
            <View style={styles.flex}>
              <View style={styles.titleRow}>
                <Text variant="bodyStrong" style={styles.flex} numberOfLines={1}>
                  {item.person.name}
                </Text>
                <Badge label={meta.label} tone={meta.tone} />
              </View>
              <Text variant="tiny" color="faint">
                {roleLabel(item.person.role)}
              </Text>
              <Text variant="small" color="muted">
                {item.stat.total} tasks · {item.stat.pending} open
                {item.stat.overdue ? <Text variant="small" color="danger">{` · ${item.stat.overdue} overdue`}</Text> : null}
              </Text>
              <View style={[styles.track, { backgroundColor: colors.surfaceAlt }]}>
                <View style={[styles.fill, { width: `${rate}%`, backgroundColor: fg }]} />
              </View>
            </View>
            <Icon name="chevron-forward" size={18} color={colors.textFaint} />
          </Card>
        );
      }}
    />
  );
};

const Tile = ({ label, value, tone }: { label: string; value: number | string; tone?: string }) => (
  <Card style={styles.tile}>
    <Text variant="title" color={tone}>
      {value}
    </Text>
    <Text variant="tiny" color="muted">
      {label}
    </Text>
  </Card>
);

const styles = StyleSheet.create({
  flex: { flex: 1 },
  list: { paddingVertical: space.lg },
  header: { gap: space.md, marginBottom: space.md },
  tiles: { flexDirection: "row", gap: space.sm, paddingHorizontal: space.lg },
  tile: { flex: 1, alignItems: "center", paddingVertical: space.md, paddingHorizontal: 4 },
  separator: { height: space.sm },
  row: { flexDirection: "row", alignItems: "center", gap: space.md, marginHorizontal: space.lg },
  titleRow: { flexDirection: "row", alignItems: "center", gap: space.sm },
  track: { height: 6, borderRadius: 3, overflow: "hidden", marginTop: 6 },
  fill: { height: 6, borderRadius: 3 },
});
