import React, { useMemo, useState } from "react";
import { FlatList, Pressable, RefreshControl, StyleSheet, View } from "react-native";
import { useNavigation } from "@react-navigation/native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { errorMessage } from "../../api/client";
import { listTasks, updateTask } from "../../api/tasks";
import type { Task } from "../../api/types";
import { useUser } from "../../auth/AuthProvider";
import { TaskRow } from "../../components/TaskRow";
import { isManagement } from "../../lib/roles";
import { sortTasks } from "../../lib/taskMeta";
import { useQuery } from "../../lib/useQuery";
import { useTheme } from "../../theme/ThemeProvider";
import { radius, space } from "../../theme/tokens";
import { ChipRow, EmptyState, ErrorState, HeaderButton, Icon, InlineError, Loading, Text } from "../../ui";

type Scope = "forMe" | "byMe" | "all";
type StatusFilter = "OPEN" | "OVERDUE" | "IN_PROGRESS" | "COMPLETED";

/* A due date is a day: overdue once that day has ended and the task is still open. */
const isOverdueTask = (task: Task) => {
  if (task.status === "COMPLETED" || !task.dueDate) return false;
  const end = new Date(task.dueDate);
  end.setHours(23, 59, 59, 999);
  return end.getTime() < Date.now();
};

export const TasksScreen = () => {
  const user = useUser();
  const navigation = useNavigation();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const userId = user.id || user._id || "";
  const [scope, setScope] = useState<Scope>("forMe");
  const [status, setStatus] = useState<StatusFilter>("OPEN");
  const [priority, setPriority] = useState("ALL");
  const [tag, setTag] = useState("ALL");
  const [toggleError, setToggleError] = useState<string | null>(null);

  const { data, loading, error, refreshing, refresh, setData } = useQuery(
    () => listTasks(scope === "forMe" ? { assignedTo: userId } : scope === "byMe" ? { scope: "mine" } : {}),
    [scope, userId],
  );

  const counts = useMemo(() => {
    const tasks = data || [];
    return {
      OPEN: tasks.filter((task) => task.status !== "COMPLETED").length,
      OVERDUE: tasks.filter(isOverdueTask).length,
      IN_PROGRESS: tasks.filter((task) => task.status === "IN_PROGRESS").length,
      COMPLETED: tasks.filter((task) => task.status === "COMPLETED").length,
    };
  }, [data]);

  const visible = useMemo(() => {
    const tasks = data || [];
    const filtered = tasks.filter((task) =>
      (status === "OPEN" ? task.status !== "COMPLETED" : status === "OVERDUE" ? isOverdueTask(task) : task.status === status)
        && (priority === "ALL" || task.priority === priority)
        && (tag === "ALL" || (task.tags || []).includes(tag)),
    );
    return sortTasks(filtered);
  }, [data, status, priority, tag]);

  const tags = useMemo(() => [...new Set((data || []).flatMap((task) => task.tags || []))].sort(), [data]);

  /* Optimistic: the row flips at once and flips back if the server says no. */
  const toggle = async (task: Task) => {
    const next = task.status === "COMPLETED" ? "TODO" : "COMPLETED";
    const swap = (value: string) => setData((tasks) => (tasks || []).map((item) => (item._id === task._id ? { ...item, status: value } : item)));
    swap(next);
    setToggleError(null);
    try {
      await updateTask(task._id, { status: next });
    } catch (err) {
      swap(task.status);
      setToggleError(errorMessage(err));
    }
  };

  const scopes: { key: Scope; label: string }[] = [
    { key: "forMe", label: "For me" },
    { key: "byMe", label: "Created by me" },
    ...(isManagement(user.role) ? [{ key: "all" as const, label: "Team" }] : []),
  ];

  return (
    <View style={[styles.root, { backgroundColor: colors.bg, paddingTop: insets.top }]}>
      <View style={styles.header}>
        <View style={styles.flex}>
          <Text variant="display">Tasks</Text>
          <Text variant="small" color="muted">
            {data ? `${counts.OPEN} open` : " "}
          </Text>
        </View>
        {isManagement(user.role) ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Team workload"
            onPress={() => navigation.navigate("TeamWorkload")}
            style={[styles.iconButton, { borderColor: colors.border, backgroundColor: colors.surface }]}
          >
            <Icon name="bar-chart" size={20} color={colors.primary} />
          </Pressable>
        ) : null}
        <HeaderButton icon="add" label="New task" onPress={() => navigation.navigate("NewTask")} />
      </View>

      <View style={[styles.segment, { backgroundColor: colors.surfaceAlt }]}>
        {scopes.map((item) => {
          const active = item.key === scope;
          return (
            <Pressable
              key={item.key}
              accessibilityRole="tab"
              accessibilityState={{ selected: active }}
              onPress={() => setScope(item.key)}
              style={[styles.segmentItem, active && { backgroundColor: colors.surface }]}
            >
              <Text variant="smallStrong" color={active ? "text" : "muted"}>
                {item.label}
              </Text>
            </Pressable>
          );
        })}
      </View>

      <View style={styles.chips}>
        <ChipRow
          options={[
            { key: "OPEN", label: "Open", count: data ? counts.OPEN : undefined },
            { key: "OVERDUE", label: "Overdue", count: data ? counts.OVERDUE : undefined },
            { key: "IN_PROGRESS", label: "In progress", count: data ? counts.IN_PROGRESS : undefined },
            { key: "COMPLETED", label: "Done", count: data ? counts.COMPLETED : undefined },
          ]}
          value={status}
          onChange={setStatus}
        />
        <ChipRow
          options={[
            { key: "ALL", label: "Any priority" },
            { key: "HIGH", label: "High" },
            { key: "MEDIUM", label: "Medium" },
            { key: "LOW", label: "Low" },
          ]}
          value={priority}
          onChange={setPriority}
        />
        {tags.length ? (
          <ChipRow options={[{ key: "ALL", label: "Any tag" }, ...tags.map((item) => ({ key: item, label: `#${item}` }))]} value={tag} onChange={setTag} />
        ) : null}
      </View>

      {toggleError ? (
        <View style={styles.errorWrap}>
          <InlineError message={toggleError} />
        </View>
      ) : null}

      {loading ? (
        <Loading />
      ) : error ? (
        <ErrorState message={error} onRetry={refresh} />
      ) : (
        <FlatList
          data={visible}
          keyExtractor={(task) => task._id}
          renderItem={({ item }) => (
            <TaskRow
              task={item}
              showAssignee={scope !== "forMe"}
              onPress={() => navigation.navigate("TaskDetail", { taskId: item._id })}
              onToggle={() => toggle(item)}
            />
          )}
          ItemSeparatorComponent={Separator}
          contentContainerStyle={[styles.list, !visible.length && styles.grow]}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={colors.primary} colors={[colors.primary]} />}
          ListEmptyComponent={
            <EmptyState
              icon={status === "COMPLETED" ? "trophy-outline" : "checkbox-outline"}
              title={status === "COMPLETED" ? "Nothing finished yet" : "No open tasks"}
              message={status === "COMPLETED" ? "Completed tasks will show up here." : "You're all caught up."}
              actionLabel={status === "COMPLETED" ? undefined : "Create a task"}
              onAction={() => navigation.navigate("NewTask")}
            />
          }
        />
      )}
    </View>
  );
};

const Separator = () => <View style={styles.separator} />;

const styles = StyleSheet.create({
  root: { flex: 1 },
  flex: { flex: 1 },
  grow: { flexGrow: 1 },
  header: { flexDirection: "row", alignItems: "center", paddingHorizontal: space.lg, paddingTop: space.md, gap: space.md },
  iconButton: { width: 42, height: 42, borderRadius: 21, borderWidth: 1, alignItems: "center", justifyContent: "center" },
  segment: { flexDirection: "row", marginHorizontal: space.lg, marginTop: space.md, borderRadius: radius.md, padding: 3 },
  segmentItem: { flex: 1, alignItems: "center", paddingVertical: 9, borderRadius: radius.sm },
  chips: { paddingVertical: space.md, gap: space.sm },
  errorWrap: { paddingHorizontal: space.lg, paddingBottom: space.sm },
  list: { paddingHorizontal: space.lg, paddingBottom: space.xxl },
  separator: { height: space.sm },
});
