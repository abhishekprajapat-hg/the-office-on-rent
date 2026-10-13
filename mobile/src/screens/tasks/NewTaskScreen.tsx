import React, { useEffect, useLayoutEffect, useMemo, useState } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { errorMessage } from "../../api/client";
import { createTask, editTask, getAssignees, getTask } from "../../api/tasks";
import { useUser } from "../../auth/AuthProvider";
import { DateTimeField } from "../../components/DateTimeField";
import { roleLabel } from "../../lib/roles";
import { PRIORITY } from "../../lib/taskMeta";
import { useQuery } from "../../lib/useQuery";
import type { RootScreenProps } from "../../navigation/types";
import { useTheme } from "../../theme/ThemeProvider";
import { space } from "../../theme/tokens";
import { Avatar, Body, Button, Card, Chip, Field, Icon, InlineError, Text } from "../../ui";

const endOfToday = () => {
  const date = new Date();
  date.setHours(18, 0, 0, 0);
  return date;
};

export const NewTaskScreen = ({ route, navigation }: RootScreenProps<"NewTask">) => {
  const user = useUser();
  const { colors } = useTheme();
  const leadId = route.params?.leadId;
  const leadName = route.params?.leadName;
  // Edit mode when a task id is passed: same form, prefilled, saved with PATCH.
  const taskId = route.params?.taskId;
  const myId = user.id || user._id || "";

  const [title, setTitle] = useState(leadName ? `Follow up with ${leadName}` : "");
  const [description, setDescription] = useState("");
  const [priority, setPriority] = useState("MEDIUM");
  const [dueDate, setDueDate] = useState<Date | null>(endOfToday());
  const [assignee, setAssignee] = useState(myId);
  const [filter, setFilter] = useState("");
  const [tags, setTags] = useState("");
  const [prefilled, setPrefilled] = useState(!taskId);
  const [touched, setTouched] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const { data: people, error: peopleError } = useQuery(getAssignees, []);

  useLayoutEffect(() => {
    if (taskId) navigation.setOptions({ title: "Edit task" });
  }, [navigation, taskId]);

  useEffect(() => {
    if (!taskId) return;
    getTask(taskId)
      .then((task) => {
        if (!task) return;
        setTitle(task.title);
        setDescription(task.description || "");
        setPriority(String(task.priority || "MEDIUM"));
        setDueDate(task.dueDate ? new Date(task.dueDate) : null);
        if (task.assignedTo?._id) setAssignee(task.assignedTo._id);
        setTags((task.tags || []).join(", "));
      })
      .catch((err) => setError(errorMessage(err)))
      .finally(() => setPrefilled(true));
  }, [taskId]);

  // Me first, then everyone else alphabetically; the search narrows long teams.
  const options = useMemo(() => {
    const list = [...(people || [])];
    if (!list.some((person) => person._id === myId)) list.push({ _id: myId, name: user.name, role: user.role });
    const needle = filter.trim().toLowerCase();
    return list
      .filter((person) => !needle || person.name.toLowerCase().includes(needle))
      .sort((a, b) => (a._id === myId ? -1 : b._id === myId ? 1 : a.name.localeCompare(b.name)));
  }, [people, myId, user.name, user.role, filter]);

  const titleError = touched && !title.trim() ? "Give the task a title" : undefined;
  const dueError = touched && !dueDate ? "Pick a due date" : undefined;

  const save = async () => {
    setTouched(true);
    if (!title.trim() || !dueDate || !assignee) return;
    setSaving(true);
    setError(null);
    try {
      if (taskId) {
        await editTask(taskId, {
          title: title.trim(),
          description: description.trim(),
          priority,
          dueDate: dueDate.toISOString(),
          assignedTo: assignee,
          tags: tags.split(",").map((tag) => tag.trim()).filter(Boolean),
        });
        navigation.goBack();
        return;
      }
      const task = await createTask({
        title: title.trim(),
        description: description.trim() || undefined,
        priority,
        dueDate: dueDate.toISOString(),
        assignedTo: assignee,
        leadId,
        tags: tags.split(",").map((tag) => tag.trim()).filter(Boolean),
      });
      if (task?._id) navigation.replace("TaskDetail", { taskId: task._id });
      else navigation.goBack();
    } catch (err) {
      setError(errorMessage(err));
      setSaving(false);
    }
  };

  return (
    <Body>
      <Card style={styles.gap}>
        <Field label="Title *" value={title} onChangeText={setTitle} placeholder="What needs doing?" maxLength={180} error={titleError} />
        <Field label="Details" value={description} onChangeText={setDescription} placeholder="Optional" multiline />
        <Field label="Tags" value={tags} onChangeText={setTags} placeholder="Comma separated, e.g. visit, docs" autoCapitalize="none" />
        <DateTimeField label="Due *" value={dueDate} onChange={setDueDate} minimumDate={new Date()} />
        {dueError ? (
          <Text variant="small" color="danger">
            {dueError}
          </Text>
        ) : null}
        <Text variant="smallStrong" color="muted">
          Priority
        </Text>
        <View style={styles.chips}>
          {Object.keys(PRIORITY).map((key) => (
            <Chip key={key} label={PRIORITY[key]!.label} selected={priority === key} onPress={() => setPriority(key)} />
          ))}
        </View>
        {leadName ? (
          <View style={[styles.leadTag, { backgroundColor: colors.primarySoft }]}>
            <Icon name="link" size={16} color={colors.primary} />
            <Text variant="small" color="primary">
              Linked to {leadName}
            </Text>
          </View>
        ) : null}
      </Card>

      <Card style={styles.gap}>
        <Text variant="heading">Assign to</Text>
        {(people?.length || 0) > 6 ? <Field icon="search" value={filter} onChangeText={setFilter} placeholder="Search people" /> : null}
        {peopleError ? (
          <Text variant="small" color="muted">
            Couldn't load your team, so this task will be assigned to you.
          </Text>
        ) : null}
        <View>
          {options.map((person, index) => {
            const selected = person._id === assignee;
            return (
              <Pressable
                key={person._id}
                accessibilityRole="radio"
                accessibilityState={{ selected }}
                onPress={() => setAssignee(person._id)}
                style={[styles.person, index < options.length - 1 && { borderBottomColor: colors.border, borderBottomWidth: StyleSheet.hairlineWidth }]}
              >
                <Avatar name={person.name} size={34} />
                <View style={styles.flex}>
                  <Text variant="body">{person._id === myId ? `${person.name} (me)` : person.name}</Text>
                  {person.role ? (
                    <Text variant="tiny" color="faint">
                      {roleLabel(person.role)}
                    </Text>
                  ) : null}
                </View>
                <Icon name={selected ? "radio-button-on" : "radio-button-off"} size={22} color={selected ? colors.primary : colors.textFaint} />
              </Pressable>
            );
          })}
        </View>
      </Card>

      <InlineError message={error} />
      <Button label={taskId ? "Save changes" : "Create task"} icon={taskId ? "checkmark" : "add-circle"} onPress={save} loading={saving} disabled={!prefilled} />
    </Body>
  );
};

const styles = StyleSheet.create({
  flex: { flex: 1 },
  gap: { gap: space.md },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: space.sm },
  leadTag: { flexDirection: "row", alignItems: "center", gap: space.sm, padding: space.sm, borderRadius: 8 },
  person: { flexDirection: "row", alignItems: "center", gap: space.md, paddingVertical: space.md },
});
