import React from "react";
import { Pressable, StyleSheet, View } from "react-native";
import type { Task } from "../api/types";
import { formatDate, isOverdue } from "../lib/format";
import { priorityMeta, taskStatusMeta } from "../lib/taskMeta";
import { useTheme } from "../theme/ThemeProvider";
import { space } from "../theme/tokens";
import { Badge, Card, Icon, Text } from "../ui";

type Props = { task: Task; onPress: () => void; onToggle?: () => void; showAssignee?: boolean };

export const TaskRow = ({ task, onPress, onToggle, showAssignee }: Props) => {
  const { colors } = useTheme();
  const done = task.status === "COMPLETED";
  const priority = priorityMeta(task.priority);
  const overdue = !done && Boolean(task.dueDate) && isOverdue(endOfDay(task.dueDate!));
  const subtasks = task.subtasks || [];
  const doneSubtasks = subtasks.filter((subtask) => subtask.isCompleted).length;

  return (
    <Card onPress={onPress} style={styles.card} accessibilityLabel={task.title}>
      <Pressable
        accessibilityRole="checkbox"
        accessibilityState={{ checked: done }}
        accessibilityLabel={done ? "Mark as not done" : "Mark as done"}
        hitSlop={10}
        onPress={onToggle}
        disabled={!onToggle}
      >
        <Icon name={done ? "checkmark-circle" : "ellipse-outline"} size={24} color={done ? colors.success : colors.textFaint} />
      </Pressable>
      <View style={styles.body}>
        <Text
          variant="bodyStrong"
          numberOfLines={2}
          color={done ? "faint" : "text"}
          style={done ? styles.strike : undefined}
        >
          {task.title}
        </Text>
        <View style={styles.meta}>
          <Badge label={priority.label} tone={priority.tone} />
          {!done && task.status !== "TODO" ? <Badge label={taskStatusMeta(task.status).label} tone="info" /> : null}
          {task.dueDate ? (
            <View style={styles.inline}>
              <Icon name="calendar-outline" size={13} color={overdue ? colors.danger : colors.textMuted} />
              <Text variant="tiny" color={overdue ? colors.danger : colors.textMuted}>
                {overdue ? `Overdue · ${formatDate(task.dueDate)}` : formatDate(task.dueDate)}
              </Text>
            </View>
          ) : null}
          {subtasks.length ? (
            <View style={styles.inline}>
              <Icon name="list-outline" size={13} color={colors.textMuted} />
              <Text variant="tiny" color="muted">
                {doneSubtasks}/{subtasks.length}
              </Text>
            </View>
          ) : null}
        </View>
        {showAssignee && task.assignedTo?.name ? (
          <Text variant="tiny" color="faint" numberOfLines={1}>
            {task.assignedTo.name}
          </Text>
        ) : null}
      </View>
    </Card>
  );
};

/* A due date is a day, not an instant: it is overdue once that day is over. */
const endOfDay = (value: string) => {
  const date = new Date(value);
  date.setHours(23, 59, 59, 999);
  return date;
};

const styles = StyleSheet.create({
  card: { flexDirection: "row", alignItems: "flex-start", gap: space.md, paddingVertical: space.md },
  body: { flex: 1, gap: 6 },
  strike: { textDecorationLine: "line-through" },
  meta: { flexDirection: "row", alignItems: "center", flexWrap: "wrap", gap: space.sm },
  inline: { flexDirection: "row", alignItems: "center", gap: 3 },
});
