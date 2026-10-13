import React, { useLayoutEffect } from "react";
import { FlatList, RefreshControl, StyleSheet, View } from "react-native";
import { listTasks } from "../../api/tasks";
import { TaskRow } from "../../components/TaskRow";
import { sortTasks } from "../../lib/taskMeta";
import { useQuery } from "../../lib/useQuery";
import type { RootScreenProps } from "../../navigation/types";
import { useTheme } from "../../theme/ThemeProvider";
import { space } from "../../theme/tokens";
import { EmptyState, ErrorState, Loading } from "../../ui";

/* One teammate's tasks, open first. */
export const PersonTasksScreen = ({ route, navigation }: RootScreenProps<"PersonTasks">) => {
  const { assignedTo, name } = route.params;
  const { colors } = useTheme();
  const { data, loading, error, refreshing, refresh } = useQuery(async () => sortTasks(await listTasks({ assignedTo })), [assignedTo]);

  useLayoutEffect(() => {
    navigation.setOptions({ title: name });
  }, [navigation, name]);

  if (loading) return <Loading />;
  if (error) return <ErrorState message={error} onRetry={refresh} />;

  return (
    <FlatList
      style={{ backgroundColor: colors.bg }}
      contentContainerStyle={[styles.list, !data?.length && styles.grow]}
      data={data || []}
      keyExtractor={(task) => task._id}
      ItemSeparatorComponent={() => <View style={styles.separator} />}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={colors.primary} colors={[colors.primary]} />}
      ListEmptyComponent={<EmptyState icon="checkbox-outline" title="No tasks" message={`${name} has nothing assigned.`} />}
      renderItem={({ item }) => <TaskRow task={item} onPress={() => navigation.navigate("TaskDetail", { taskId: item._id })} />}
    />
  );
};

const styles = StyleSheet.create({
  list: { padding: space.lg },
  grow: { flexGrow: 1 },
  separator: { height: space.sm },
});
