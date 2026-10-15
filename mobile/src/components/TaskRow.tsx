import React from "react";
import { Pressable, StyleSheet, View } from "react-native";
import type { Task } from "../api/types";
import { formatDueDay } from "../lib/format";
import { dayKey, hasOverdueWork, isSubtaskDone, priorityMeta } from "../lib/taskMeta";
import { useTheme } from "../theme/ThemeProvider";
import { Avatar, Badge, CheckSquare, Icon, Text } from "../ui";

type Props = { task: Task; onPress: () => void; onToggle?: () => void; onMenu?: () => void; showAssignee?: boolean };

/*
 * Task card: square checkbox, title, the description's first line, then due
 * date (Overdue / Today flagged, an overdue subtask counts), subtask progress,
 * lead and assignee; priority on the right and a ⋯ for edit / move / delete.
 */
export const TaskRow = ({ task, onPress, onToggle, onMenu, showAssignee }: Props) => {
  const { colors } = useTheme();
  const done = task.status === "COMPLETED";
  const priority = priorityMeta(task.priority);
  const overdue = !done && hasOverdueWork(task);
  const subtasks = task.subtasks || [];
  const doneSubtasks = subtasks.filter(isSubtaskDone).length;
  const leadName = task.leadId && typeof task.leadId === "object" ? task.leadId.name : "";
  const dueToday = !done && Boolean(task.dueDate) && dayKey(task.dueDate!) === dayKey();
  const dueLabel = task.dueDate ? formatDueDay(task.dueDate) : "No date";
  const dueColor = overdue ? colors.danger : dueToday ? colors.warning : colors.textMuted;
  const assignee = task.assignedTo && typeof task.assignedTo === "object" ? task.assignedTo : null;

  return (
    <Pressable
      onPress={onPress}
      onLongPress={onMenu}
      accessibilityRole="button"
      accessibilityLabel={task.title}
      style={({ pressed }) => [styles.card, { backgroundColor: pressed ? colors.surfaceAlt : colors.surface, borderColor: overdue ? colors.dangerSoft : colors.border }]}
    >
      <Pressable
        accessibilityRole="checkbox"
        accessibilityState={{ checked: done }}
        accessibilityLabel={done ? "Reopen task" : "Complete task"}
        hitSlop={10}
        onPress={onToggle}
        disabled={!onToggle}
        style={styles.check}
      >
        <CheckSquare checked={done} />
      </Pressable>
      <View style={styles.body}>
        <View style={styles.titleRow}>
          <Text variant="body" numberOfLines={2} color={done ? "faint" : "text"} style={[styles.title, done && styles.strike]}>
            {task.title}
          </Text>
          {!done ? <Badge label={priority.label} tone={priority.tone} /> : null}
        </View>
        {task.description ? (
          <Text variant="small" color="muted" numberOfLines={1} style={styles.desc}>
            {task.description}
          </Text>
        ) : null}
        <View style={styles.meta}>
          <View style={styles.inline}>
            <Icon name={overdue ? "alert-circle" : "calendar-outline"} size={12} color={dueColor} />
            <Text variant="small" color={dueColor} style={styles.metaText}>
              {dueToday ? (overdue ? "Today · subtask overdue" : "Today") : overdue ? `Overdue · ${dueLabel}` : dueLabel}
            </Text>
          </View>
          <View style={styles.inline}>
            <Icon name="list-outline" size={12} color={colors.textMuted} />
            <Text variant="small" color="muted" style={styles.metaText}>
              {subtasks.length ? `${doneSubtasks}/${subtasks.length}` : "No subtasks"}
            </Text>
          </View>
          {leadName ? (
            <View style={styles.inline}>
              <Icon name="link-outline" size={12} color={colors.textMuted} />
              <Text variant="small" color="muted" style={styles.metaText} numberOfLines={1}>
                {leadName}
              </Text>
            </View>
          ) : null}
        </View>
        {showAssignee ? (
          <View style={styles.inline}>
            {assignee ? <Avatar name={assignee.name} uri={assignee.profileImageUrl} size={18} tinted /> : <Icon name="person-outline" size={13} color={colors.textFaint} />}
            <Text variant="small" color="muted" style={styles.metaText} numberOfLines={1}>
              {assignee?.name || "Unassigned"}
            </Text>
          </View>
        ) : null}
      </View>
      {onMenu ? (
        <Pressable accessibilityRole="button" accessibilityLabel="Task actions" hitSlop={10} onPress={onMenu} style={styles.menu}>
          <Icon name="ellipsis-vertical" size={16} color={colors.textFaint} />
        </Pressable>
      ) : null}
    </Pressable>
  );
};

const styles = StyleSheet.create({
  card: { flexDirection: "row", alignItems: "flex-start", gap: 10, padding: 12, borderRadius: 16, borderWidth: 1 },
  check: { marginTop: 1 },
  body: { flex: 1, minWidth: 0, gap: 4 },
  titleRow: { flexDirection: "row", alignItems: "flex-start", gap: 8 },
  title: { flex: 1, fontSize: 13.5, lineHeight: 18, fontFamily: "PlusJakartaSans_600SemiBold" },
  desc: { fontSize: 12, lineHeight: 16 },
  strike: { textDecorationLine: "line-through" },
  meta: { flexDirection: "row", alignItems: "center", flexWrap: "wrap", columnGap: 10, rowGap: 2 },
  inline: { flexDirection: "row", alignItems: "center", gap: 4 },
  metaText: { fontSize: 11.5, lineHeight: 15 },
  menu: { paddingTop: 1 },
});
