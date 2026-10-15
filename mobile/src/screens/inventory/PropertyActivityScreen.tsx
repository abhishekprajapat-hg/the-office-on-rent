import React from "react";
import { StyleSheet, View } from "react-native";
import { getPropertyActivity } from "../../api/inventory";
import { formatAgo } from "../../lib/format";
import { activityLabel, describeChanges } from "../../lib/inventoryAccess";
import { roleLabel } from "../../lib/roles";
import { useQuery } from "../../lib/useQuery";
import type { RootScreenProps } from "../../navigation/types";
import { Avatar, Body, EmptyState, ErrorState, ListCard, Loading, Text } from "../../ui";

/* Web: AssetVault activity drawer - who changed this property, when, and what. Admins and managers. */
export const PropertyActivityScreen = ({ route, navigation }: RootScreenProps<"PropertyActivity">) => {
  const { id, title } = route.params;
  const { data, loading, error, refreshing, refresh } = useQuery(() => getPropertyActivity(id), [id]);

  React.useLayoutEffect(() => {
    if (title) navigation.setOptions({ title });
  }, [navigation, title]);

  if (loading) return <Loading />;
  if (error) return <ErrorState message={error} onRetry={refresh} />;

  return (
    <Body refreshing={refreshing} onRefresh={refresh}>
      {!data?.length ? (
        <EmptyState icon="time-outline" title="No activity yet" message="Edits, approvals and status changes show here." />
      ) : (
        <ListCard>
          {data.map((row) => {
            const changes = describeChanges(row.oldValue, row.newValue);
            return (
              <View key={row._id} style={styles.row}>
                <Avatar name={row.changedBy?.name || "?"} uri={row.changedBy?.profileImageUrl} size={34} />
                <View style={styles.flex}>
                  <Text variant="bodyStrong" style={styles.title}>
                    {activityLabel(row.actionType)}
                  </Text>
                  <Text variant="small" color="muted">
                    {[row.changedBy?.name, row.changedBy?.role || row.role ? roleLabel(row.changedBy?.role || row.role) : "", formatAgo(row.timestamp)].filter(Boolean).join(" · ")}
                  </Text>
                  {changes.map((line) => (
                    <Text key={line} variant="tiny" color="faint" numberOfLines={2}>
                      {line}
                    </Text>
                  ))}
                </View>
              </View>
            );
          })}
        </ListCard>
      )}
    </Body>
  );
};

const styles = StyleSheet.create({
  flex: { flex: 1, minWidth: 0, gap: 2 },
  row: { flexDirection: "row", gap: 12, padding: 12 },
  title: { fontSize: 13.5 },
});
