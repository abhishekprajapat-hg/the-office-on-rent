import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { ActivityIndicator, Pressable, StyleSheet, TextInput, View } from "react-native";
import { errorMessage } from "../../api/client";
import { useLeadSearch } from "../../lib/useLeadSearch";
import { createTask, editTask, getAssignees, getTask, type SubtaskDraft } from "../../api/tasks";
import { useUser } from "../../auth/AuthProvider";
import { DateTimeField } from "../../components/DateTimeField";
import { formatDate } from "../../lib/format";
import { roleLabel } from "../../lib/roles";
import { DEFAULT_TAGS, PRIORITY, STATUS_ORDER, subtaskStatus, TASK_STATUS, TASK_STATUS_TONE } from "../../lib/taskMeta";
import { useQuery } from "../../lib/useQuery";
import type { RootScreenProps } from "../../navigation/types";
import { useTheme } from "../../theme/ThemeProvider";
import { toneColors } from "../../theme/tokens";
import { Body, CheckSquare, Field, Icon, InlineError, PickerSheet, Select, Text } from "../../ui";
import { SubtaskEditor } from "./SubtaskEditor";

const PRODUCTION_ROLES = ["PRODUCTION_EXECUTIVE", "COMMUNITY_MANAGER"];
const endOfToday = () => {
  const date = new Date();
  date.setHours(18, 0, 0, 0);
  return date;
};

/*
 * The web's task editor (new and edit): title, description, status,
 * priority, due date, assignee (with "Assign to me"), linked lead, category
 * tags and full subtasks - each with its own instructions, date, status and
 * priority. Subtasks always follow the task's assignee.
 */
export const NewTaskScreen = ({ route, navigation }: RootScreenProps<"NewTask">) => {
  const user = useUser();
  const { colors } = useTheme();
  const myId = user.id || user._id || "";
  const taskId = route.params?.taskId;
  const lockAssignee = Boolean(route.params?.lockAssignee && route.params?.assignTo && !taskId);
  const production = PRODUCTION_ROLES.includes(user.role);

  const [title, setTitle] = useState(route.params?.leadName ? `Follow up with ${route.params.leadName}` : "");
  const [description, setDescription] = useState("");
  const [status, setStatus] = useState("TODO");
  const [priority, setPriority] = useState("MEDIUM");
  const [dueDate, setDueDate] = useState<Date | null>(endOfToday());
  const [assignee, setAssignee] = useState(route.params?.assignTo || myId);
  const [lead, setLead] = useState<{ _id: string; name: string } | null>(route.params?.leadId ? { _id: route.params.leadId, name: route.params.leadName || "Lead" } : null);
  const [tags, setTags] = useState<string[]>([]);
  const [tagDraft, setTagDraft] = useState("");
  const [subtasks, setSubtasks] = useState<SubtaskDraft[]>([]);
  const [editing, setEditing] = useState<{ index: number | null } | null>(null);
  const [prefilled, setPrefilled] = useState(!taskId);
  const [touched, setTouched] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [picker, setPicker] = useState<"" | "assignee" | "lead">("");
  const saveRef = useRef<() => void>(() => {});

  const { data: people, error: peopleError } = useQuery(getAssignees, []);
  const { leads, search: searchLeads } = useLeadSearch(picker === "lead");

  useLayoutEffect(() => {
    navigation.setOptions({
      title: taskId ? "Edit task" : "New task",
      headerRight: () => (
        <Pressable accessibilityRole="button" onPress={() => saveRef.current()} disabled={saving || !prefilled} hitSlop={8}>
          {saving ? (
            <ActivityIndicator color={colors.primary} />
          ) : (
            <Text variant="bodyStrong" color="primary" style={[styles.headerAction, !prefilled && { opacity: 0.5 }]}>
              {taskId ? "Save" : "Create"}
            </Text>
          )}
        </Pressable>
      ),
    });
  }, [navigation, taskId, saving, prefilled, colors.primary]);

  useEffect(() => {
    if (!taskId) return;
    getTask(taskId)
      .then((task) => {
        if (!task) return;
        setTitle(task.title);
        setDescription(task.description || "");
        setStatus(task.status || "TODO");
        setPriority(String(task.priority || "MEDIUM"));
        setDueDate(task.dueDate ? new Date(task.dueDate) : null);
        if (task.assignedTo?._id) setAssignee(task.assignedTo._id);
        setLead(task.leadId && typeof task.leadId === "object" ? { _id: task.leadId._id, name: task.leadId.name } : null);
        setTags(task.tags || []);
        setSubtasks(
          (task.subtasks || []).map((subtask) => ({
            _id: subtask._id,
            title: subtask.title,
            description: subtask.description || "",
            dueDate: subtask.dueDate || task.dueDate || null,
            status: subtaskStatus(subtask),
            priority: subtask.priority || task.priority || "MEDIUM",
            isCompleted: subtaskStatus(subtask) === "COMPLETED",
          })),
        );
      })
      .catch((err) => setError(errorMessage(err)))
      .finally(() => setPrefilled(true));
  }, [taskId]);

  // Me first, then everyone else alphabetically.
  const options = useMemo(() => {
    const list = [...(people || [])].filter(Boolean) as { _id: string; name: string; role?: string }[];
    if (!list.some((person) => person._id === myId)) list.push({ _id: myId, name: user.name, role: user.role });
    return list.sort((a, b) => (a._id === myId ? -1 : b._id === myId ? 1 : a.name.localeCompare(b.name)));
  }, [people, myId, user.name, user.role]);

  const addTag = (raw = tagDraft) => {
    const clean = raw.trim();
    setTagDraft("");
    if (!clean || tags.includes(clean)) return;
    setTags((list) => [...list, clean].slice(0, 20));
  };

  saveRef.current = () => {
    save();
  };

  const titleError = touched && !title.trim() ? "Enter a task title." : undefined;
  const dueError = touched && !dueDate ? "Choose a due date." : undefined;

  const save = async () => {
    setTouched(true);
    setError(null);
    if (!title.trim() || !dueDate) return;
    if (!assignee) return setError("Choose an assignee.");
    const invalid = subtasks.findIndex((subtask) => !subtask.title.trim() || !subtask.dueDate);
    if (invalid >= 0) return setError(`Complete the required fields in subtask ${invalid + 1}.`);
    if (status === "COMPLETED" && subtasks.some((subtask) => subtaskStatus(subtask) !== "COMPLETED")) return setError("Complete every subtask before completing the parent task.");
    setSaving(true);
    const payloadSubtasks = subtasks.map((subtask) => ({ ...subtask, assignedTo: assignee, isCompleted: subtaskStatus(subtask) === "COMPLETED" }));
    try {
      const payload = {
        title: title.trim(),
        description: description.trim(),
        status,
        priority,
        dueDate: dueDate.toISOString(),
        assignedTo: assignee,
        leadId: production ? null : lead?._id || null,
        tags,
        subtasks: payloadSubtasks,
      };
      if (taskId) {
        await editTask(taskId, payload);
        navigation.goBack();
        return;
      }
      const task = await createTask(payload);
      if (!task?._id) return navigation.goBack();
      navigation.replace("Success", {
        title: "Task created",
        message: `"${task.title || payload.title}" is on the list.`,
        next: { label: "Open the task", screen: "TaskDetail", params: { taskId: task._id } },
      });
    } catch (err) {
      setError(errorMessage(err));
      setSaving(false);
    }
  };

  const assigneeName = options.find((person) => person._id === assignee)?.name;
  const suggestions = DEFAULT_TAGS.filter((tag) => !tags.includes(tag) && (!tagDraft || tag.toLowerCase().includes(tagDraft.toLowerCase())));
  const editingSubtask = editing && editing.index !== null ? subtasks[editing.index] || null : null;

  return (
    <Body style={[styles.body, { backgroundColor: colors.surface }]}>
      <TextInput
        value={title}
        onChangeText={setTitle}
        placeholder="What needs to be done?"
        placeholderTextColor={colors.textFaint}
        maxLength={180}
        multiline
        autoFocus={!taskId && !route.params?.leadName}
        accessibilityLabel="Task title"
        style={[styles.title, { color: colors.text, borderBottomColor: titleError ? colors.danger : colors.primary }]}
      />
      {titleError ? (
        <Text variant="small" color="danger">
          {titleError}
        </Text>
      ) : null}
      <Field label="Description" value={description} onChangeText={setDescription} placeholder="Add context, instructions, or expected outcome" multiline maxLength={10000} />

      <View style={styles.choices}>
        <View style={styles.flex}>
          <Select label="Status" options={STATUS_ORDER.map((key) => ({ key, label: TASK_STATUS[key]!.label, dot: toneColors(colors, TASK_STATUS_TONE[key] || "neutral").fg }))} value={status} onChange={setStatus} />
        </View>
        <View style={styles.flex}>
          <Select label="Priority" options={(["LOW", "MEDIUM", "HIGH"] as const).map((key) => ({ key, label: PRIORITY[key]!.label, dot: toneColors(colors, PRIORITY[key]!.tone).fg }))} value={priority} onChange={setPriority} />
        </View>
      </View>

      <DateTimeField variant="row" icon="calendar-outline" mode="date" label="Due date" value={dueDate} onChange={setDueDate} />
      {dueError ? (
        <Text variant="small" color="danger">
          {dueError}
        </Text>
      ) : null}

      <View style={styles.block}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Assign to: ${assigneeName || "Me"}`}
          disabled={lockAssignee}
          onPress={() => setPicker("assignee")}
          style={[styles.row, { backgroundColor: colors.bg }]}
        >
          <Icon name={lockAssignee ? "lock-closed-outline" : "person-outline"} size={18} color={colors.primary} />
          <Text variant="body" color="muted" style={[styles.flex, styles.rowLabel]}>
            Assign to
          </Text>
          <Text variant="bodyStrong" style={styles.rowValue} numberOfLines={1}>
            {assignee === myId ? "Me" : assigneeName || "Choose"}
          </Text>
          {!lockAssignee ? <Icon name="chevron-forward" size={15} color={colors.textFaint} /> : null}
        </Pressable>
        {!lockAssignee && assignee !== myId ? (
          <Pressable accessibilityRole="button" onPress={() => setAssignee(myId)} style={styles.assignMe} hitSlop={6}>
            <Icon name="person-circle-outline" size={16} color={colors.primary} />
            <Text variant="smallStrong" color="primary">
              Assign to me
            </Text>
          </Pressable>
        ) : null}
        <View style={styles.hint}>
          <Icon name="information-circle-outline" size={14} color={colors.textFaint} />
          <Text variant="tiny" color="faint" style={styles.flex}>
            Every subtask is automatically assigned to the task owner.
          </Text>
        </View>
      </View>

      {!production ? (
        <Pressable accessibilityRole="button" accessibilityLabel={`Lead: ${lead?.name || "none"}`} onPress={() => setPicker("lead")} style={[styles.row, { backgroundColor: colors.bg }]}>
          <Icon name="link-outline" size={18} color={colors.primary} />
          <Text variant="body" color="muted" style={[styles.flex, styles.rowLabel]}>
            Lead
          </Text>
          <Text variant="bodyStrong" color={lead ? colors.text : colors.textFaint} style={styles.rowValue} numberOfLines={1}>
            {lead?.name || "No linked lead"}
          </Text>
          <Icon name="chevron-forward" size={15} color={colors.textFaint} />
        </Pressable>
      ) : null}

      <View style={styles.block}>
        <Text variant="smallStrong" color="muted">
          Category tags
        </Text>
        <View style={[styles.tagEditor, { borderColor: colors.border, backgroundColor: colors.bg }]}>
          {tags.map((tag) => (
            <Pressable key={tag} accessibilityRole="button" accessibilityLabel={`Remove tag ${tag}`} onPress={() => setTags((list) => list.filter((item) => item !== tag))} style={[styles.tag, { backgroundColor: colors.primarySoft }]}>
              <Text variant="smallStrong" color="primary">
                {tag}
              </Text>
              <Icon name="close" size={12} color={colors.primary} />
            </Pressable>
          ))}
          <TextInput
            value={tagDraft}
            onChangeText={setTagDraft}
            placeholder="Add tag…"
            placeholderTextColor={colors.textFaint}
            returnKeyType="done"
            onSubmitEditing={() => addTag()}
            blurOnSubmit={false}
            style={[styles.tagInput, { color: colors.text }]}
          />
        </View>
        {suggestions.length ? (
          <View style={styles.choices}>
            {suggestions.map((tag) => (
              <Pressable key={tag} accessibilityRole="button" onPress={() => addTag(tag)} style={[styles.tag, { borderWidth: 1, borderColor: colors.border }]}>
                <Icon name="add" size={12} color={colors.textMuted} />
                <Text variant="small" color="muted">
                  {tag}
                </Text>
              </Pressable>
            ))}
          </View>
        ) : null}
      </View>

      <View style={styles.block}>
        <View style={styles.subHead}>
          <Icon name="list" size={16} color={colors.textMuted} />
          <Text variant="smallStrong" color="muted" style={styles.flex}>
            Subtasks ({subtasks.length})
          </Text>
          <Pressable accessibilityRole="button" onPress={() => setEditing({ index: null })} hitSlop={8} style={styles.inline}>
            <Icon name="add-circle-outline" size={17} color={colors.primary} />
            <Text variant="smallStrong" color="primary">
              Add subtask
            </Text>
          </Pressable>
        </View>
        {subtasks.map((subtask, index) => {
          const done = subtaskStatus(subtask) === "COMPLETED";
          return (
            <Pressable key={subtask._id || `draft-${index}`} accessibilityRole="button" onPress={() => setEditing({ index })} style={[styles.subtask, { backgroundColor: colors.bg }]}>
              <Pressable
                accessibilityRole="checkbox"
                accessibilityState={{ checked: done }}
                hitSlop={8}
                onPress={() => setSubtasks((list) => list.map((item, i) => (i === index ? { ...item, status: done ? "TODO" : "COMPLETED", isCompleted: !done } : item)))}
              >
                <CheckSquare checked={done} size={20} />
              </Pressable>
              <View style={styles.flex}>
                <Text variant="bodyStrong" style={[styles.subTitle, done && styles.strike]} numberOfLines={1}>
                  {subtask.title || `New subtask ${index + 1}`}
                </Text>
                <Text variant="tiny" color="muted" numberOfLines={1}>
                  {[subtask.dueDate ? formatDate(subtask.dueDate) : "No date", TASK_STATUS[subtaskStatus(subtask)]?.label, PRIORITY[subtask.priority || "MEDIUM"]?.label].filter(Boolean).join(" · ")}
                  {subtask.description ? ` · ${subtask.description}` : ""}
                </Text>
              </View>
              <Pressable accessibilityRole="button" accessibilityLabel="Remove subtask" hitSlop={8} onPress={() => setSubtasks((list) => list.filter((_, i) => i !== index))}>
                <Icon name="trash-outline" size={16} color={colors.textFaint} />
              </Pressable>
            </Pressable>
          );
        })}
        {!subtasks.length ? (
          <Pressable accessibilityRole="button" onPress={() => setEditing({ index: null })} style={[styles.emptySub, { borderColor: colors.border }]}>
            <Icon name="add" size={16} color={colors.textMuted} />
            <Text variant="small" color="muted">
              Break this task into smaller steps
            </Text>
          </Pressable>
        ) : null}
      </View>

      {peopleError ? (
        <Text variant="small" color="muted">
          Couldn't load your team, so this task will be assigned to you.
        </Text>
      ) : null}
      <InlineError message={error} />

      <SubtaskEditor
        visible={Boolean(editing)}
        subtask={editingSubtask}
        isNew={editing?.index === null}
        defaults={{ dueDate: dueDate ? dueDate.toISOString() : null, priority }}
        onClose={() => setEditing(null)}
        onSave={(draft) => {
          if (editing?.index === null || editing?.index === undefined) setSubtasks((list) => [...list, draft]);
          else setSubtasks((list) => list.map((item, i) => (i === editing.index ? { ...item, ...draft } : item)));
        }}
        onDelete={editing && editing.index !== null ? () => setSubtasks((list) => list.filter((_, i) => i !== editing.index)) : undefined}
      />
      <PickerSheet
        visible={picker === "assignee"}
        title="Assign to"
        searchPlaceholder="Search active users"
        selected={assignee}
        onClose={() => setPicker("")}
        onPick={(key) => {
          setAssignee(key);
          setPicker("");
        }}
        items={options.map((person) => ({ key: person._id, label: person._id === myId ? `${person.name} (me)` : person.name, sub: person.role ? roleLabel(person.role) : undefined, avatar: true }))}
      />
      <PickerSheet
        visible={picker === "lead"}
        title="Linked lead"
        searchPlaceholder="Search leads by name or phone"
        onSearch={searchLeads}
        selected={lead?._id || "NONE"}
        onClose={() => setPicker("")}
        onPick={(key) => {
          const found = (leads || []).find((item) => item._id === key);
          setLead(key === "NONE" ? null : found ? { _id: found._id, name: found.name } : lead);
          setPicker("");
        }}
        items={[
          { key: "NONE", label: "No linked lead" },
          ...(lead && !(leads || []).some((item) => item._id === lead._id) ? [{ key: lead._id, label: lead.name }] : []),
          ...(leads || []).map((item) => ({ key: item._id, label: item.name, sub: [item.phone, item.projectInterested].filter(Boolean).join(" · ") })),
        ]}
      />
    </Body>
  );
};

const styles = StyleSheet.create({
  flex: { flex: 1, minWidth: 0 },
  body: { paddingTop: 16, paddingHorizontal: 18, gap: 14 },
  title: { fontSize: 19, lineHeight: 26, fontFamily: "PlusJakartaSans_700Bold", padding: 0, paddingBottom: 12, borderBottomWidth: 1.5, ...({ outlineStyle: "none" } as object) },
  row: { flexDirection: "row", alignItems: "center", gap: 12, padding: 12, borderRadius: 14 },
  rowLabel: { fontSize: 13 },
  rowValue: { fontSize: 13, maxWidth: "55%" },
  block: { gap: 8 },
  choices: { flexDirection: "row", gap: 10 },
  assignMe: { flexDirection: "row", alignItems: "center", gap: 5, alignSelf: "flex-start" },
  hint: { flexDirection: "row", alignItems: "center", gap: 5 },
  tagEditor: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: 6, borderWidth: 1, borderRadius: 14, padding: 8, minHeight: 48 },
  tag: { flexDirection: "row", alignItems: "center", gap: 4, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 5 },
  tagInput: { flexGrow: 1, minWidth: 90, fontFamily: "PlusJakartaSans_500Medium", fontSize: 13, paddingVertical: 4, ...({ outlineStyle: "none" } as object) },
  subHead: { flexDirection: "row", alignItems: "center", gap: 6 },
  inline: { flexDirection: "row", alignItems: "center", gap: 4 },
  subtask: { flexDirection: "row", alignItems: "center", gap: 10, borderRadius: 14, padding: 12 },
  subTitle: { fontSize: 13.5 },
  strike: { textDecorationLine: "line-through" },
  emptySub: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, borderWidth: 1.5, borderStyle: "dashed", borderRadius: 14, padding: 14 },
  headerAction: { fontFamily: "PlusJakartaSans_800ExtraBold" },
});
