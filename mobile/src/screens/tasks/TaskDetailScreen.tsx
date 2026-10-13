import React, { useLayoutEffect, useState } from "react";
import { Linking, Platform, Pressable, StyleSheet, View } from "react-native";
import { errorMessage, mediaUrl } from "../../api/client";
import {
  addAttachments,
  addComment,
  addSubtask,
  deleteAttachment,
  deleteComment,
  deleteSubtask,
  deleteTask,
  editSubtask,
  editTask,
  getTask,
  setSubtaskDone,
  updateTask,
} from "../../api/tasks";
import type { PersonRef, Subtask, Task, TaskFile } from "../../api/types";
import { SubtaskEditor } from "./SubtaskEditor";
import { useUser } from "../../auth/AuthProvider";
import { AttachButton } from "../../components/AttachButton";
import { formatDate, formatWhen } from "../../lib/format";
import { isManagement } from "../../lib/roles";
import { PRIORITY, priorityMeta, TASK_STATUS } from "../../lib/taskMeta";
import { formatBytes } from "../../lib/uploadRules";
import { useQuery } from "../../lib/useQuery";
import { activityLabel } from "../../lib/workload";
import type { RootScreenProps } from "../../navigation/types";
import { useTheme } from "../../theme/ThemeProvider";
import { space } from "../../theme/tokens";
import { ActionSheet, type SheetAction } from "../../ui/ActionSheet";
import { Avatar, Badge, Body, Button, Card, Chip, ErrorState, Field, Icon, InlineError, Loading, SectionTitle, Text } from "../../ui";

const STATUS_ORDER = ["TODO", "IN_PROGRESS", "COMPLETED", "BACKLOG"];
const idOf = (value?: { _id: string } | string | null) => (typeof value === "string" ? value : value?._id || "");

export const TaskDetailScreen = ({ route, navigation }: RootScreenProps<"TaskDetail">) => {
  const { taskId } = route.params;
  const user = useUser();
  const myId = user.id || user._id || "";
  const { colors } = useTheme();
  const { data: task, loading, error, refreshing, refresh, setData } = useQuery(async () => {
    const result = await getTask(taskId);
    if (!result) throw new Error("This task no longer exists.");
    return result;
  }, [taskId]);
  const [saving, setSaving] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [newSubtask, setNewSubtask] = useState("");
  const [comment, setComment] = useState("");
  const [notice, setNotice] = useState<string | null>(null);
  const [editing, setEditing] = useState<Subtask | null>(null);
  const [commentFiles, setCommentFiles] = useState<TaskFile[]>([]);

  useLayoutEffect(() => {
    navigation.setOptions({
      headerRight: () => (
        <Pressable accessibilityRole="button" accessibilityLabel="Task actions" hitSlop={10} onPress={() => setMenuOpen(true)} style={Platform.OS === "web" ? styles.webInset : undefined}>
          <Icon name="ellipsis-horizontal-circle" size={26} color={colors.primary} />
        </Pressable>
      ),
    });
  }, [navigation, colors.primary]);

  if (loading) return <Loading />;
  if (error || !task) return <ErrorState message={error || "Couldn't load this task."} onRetry={refresh} />;

  /* Runs a mutation that returns the updated task (most task endpoints do). */
  const run = async (key: string, action: () => Promise<Task | null | unknown>) => {
    setSaving(key);
    setActionError(null);
    try {
      const updated = await action();
      if (updated && typeof updated === "object" && "_id" in (updated as Task)) setData({ ...task, ...(updated as Task) });
      else refresh();
    } catch (err) {
      setActionError(errorMessage(err));
    } finally {
      setSaving(null);
    }
  };

  const toggleSubtask = async (subtaskId: string, done: boolean) => {
    const flip = (value: boolean) =>
      setData({ ...task, subtasks: (task.subtasks || []).map((item) => (item._id === subtaskId ? { ...item, isCompleted: value } : item)) });
    flip(done);
    setActionError(null);
    try {
      await setSubtaskDone(task._id, subtaskId, done);
    } catch (err) {
      flip(!done);
      setActionError(errorMessage(err));
    }
  };

  const done = task.status === "COMPLETED";
  const priority = priorityMeta(task.priority);
  const lead = typeof task.leadId === "object" && task.leadId ? task.leadId : null;
  const creator = typeof task.createdBy === "object" ? task.createdBy : null;
  const subtasks = task.subtasks || [];
  const openSubtasks = subtasks.filter((item) => !item.isCompleted).length;
  const mine = idOf(task.assignedTo) === myId;
  const canManage = idOf(creator) === myId || isManagement(user.role);

  const menu: SheetAction[] = [
    ...(canManage ? [{ key: "edit", label: "Edit task", icon: "create-outline" as const, onPress: () => navigation.navigate("NewTask", { taskId: task._id }) }] : []),
    ...(!mine && canManage ? [{ key: "me", label: "Assign to me", icon: "person-add-outline" as const, onPress: () => run("me", () => editTask(task._id, { assignedTo: myId })) }] : []),
    ...(canManage ? [{ key: "delete", label: "Delete task", icon: "trash-outline" as const, destructive: true, hint: user.role === "ADMIN" ? undefined : "Needs an admin's approval", onPress: () => setConfirmDelete(true) }] : []),
  ];

  return (
    <Body refreshing={refreshing} onRefresh={refresh}>
      <Card style={styles.gap}>
        <View style={styles.badges}>
          <Badge label={TASK_STATUS[task.status]?.label || task.status} tone={done ? "success" : task.status === "IN_PROGRESS" ? "info" : "neutral"} />
          <Badge label={`${priority.label} priority`} tone={priority.tone} />
          {(task.tags || []).map((tag) => (
            <Badge key={tag} label={`#${tag}`} />
          ))}
        </View>
        <Text variant="title" style={done ? styles.strike : undefined}>
          {task.title}
        </Text>
        {task.description ? (
          <Text variant="body" color="muted">
            {task.description}
          </Text>
        ) : null}
        <View style={styles.metaRow}>
          <Icon name="calendar-outline" size={16} color={colors.textMuted} />
          <Text variant="small" color="muted">
            {task.dueDate ? `Due ${formatDate(task.dueDate)}` : "No due date"}
          </Text>
        </View>
      </Card>

      {confirmDelete ? (
        <Card style={styles.gap}>
          <Text variant="bodyStrong">Delete this task?</Text>
          <Text variant="small" color="muted">
            Its checklist, comments and files go with it.
          </Text>
          <View style={styles.row}>
            <Button label="Keep" variant="secondary" style={styles.flex} onPress={() => setConfirmDelete(false)} />
            <Button
              label="Delete"
              variant="danger"
              icon="trash-outline"
              style={styles.flex}
              loading={saving === "delete"}
              onPress={async () => {
                setSaving("delete");
                try {
                  const result = await deleteTask(task._id);
                  if (result.pendingApproval) {
                    setNotice(result.message || "Delete request sent. An admin will review it.");
                    setConfirmDelete(false);
                    setSaving(null);
                  } else {
                    navigation.goBack();
                  }
                } catch (err) {
                  setActionError(errorMessage(err));
                  setSaving(null);
                  setConfirmDelete(false);
                }
              }}
            />
          </View>
        </Card>
      ) : null}

      {notice ? (
        <Card style={{ backgroundColor: colors.primarySoft, borderWidth: 0 }}>
          <Text variant="small" color="primary">
            {notice}
          </Text>
        </Card>
      ) : null}
      <Button
        label={done ? "Reopen task" : "Mark as done"}
        icon={done ? "refresh" : "checkmark-circle"}
        variant={done ? "secondary" : "primary"}
        loading={saving === "done"}
        disabled={!done && openSubtasks > 0}
        onPress={() => run("done", () => updateTask(task._id, { status: done ? "TODO" : "COMPLETED" }))}
      />
      {!done && openSubtasks > 0 ? (
        // The server refuses to complete a task with open checklist items; say so up front.
        <Text variant="small" color="muted" align="center">
          Tick off the {openSubtasks === 1 ? "last checklist item" : `${openSubtasks} remaining checklist items`} to finish this task.
        </Text>
      ) : null}
      <InlineError message={actionError} />

      <SectionTitle title="Status" />
      <View style={styles.chips}>
        {STATUS_ORDER.map((key) => (
          <Chip key={key} label={TASK_STATUS[key]!.label} selected={task.status === key} onPress={() => task.status !== key && run(key, () => updateTask(task._id, { status: key }))} />
        ))}
      </View>

      <SectionTitle title="Priority" />
      <View style={styles.chips}>
        {Object.keys(PRIORITY).map((key) => (
          <Chip key={key} label={PRIORITY[key]!.label} selected={task.priority === key} onPress={() => task.priority !== key && run(key, () => updateTask(task._id, { priority: key }))} />
        ))}
      </View>

      <SectionTitle title={subtasks.length ? `Checklist · ${subtasks.length - openSubtasks}/${subtasks.length}` : "Checklist"} />
      <Card style={styles.rows}>
        {subtasks.map((subtask, index) => (
          <View key={subtask._id || index} style={[styles.subtask, { borderBottomColor: colors.border, borderBottomWidth: StyleSheet.hairlineWidth }]}>
            <Pressable
              accessibilityRole="checkbox"
              accessibilityState={{ checked: subtask.isCompleted }}
              accessibilityLabel={subtask.title}
              onPress={() => subtask._id && toggleSubtask(subtask._id, !subtask.isCompleted)}
              style={styles.subtaskMain}
            >
              <Icon name={subtask.isCompleted ? "checkbox" : "square-outline"} size={22} color={subtask.isCompleted ? colors.success : colors.textFaint} />
              <Text variant="body" color={subtask.isCompleted ? "faint" : "text"} style={[styles.flex, subtask.isCompleted && styles.strike]}>
                {subtask.title}
              </Text>
            </Pressable>
            {canManage && subtask._id ? (
              <Pressable accessibilityRole="button" accessibilityLabel={`Edit ${subtask.title}`} hitSlop={8} onPress={() => setEditing(subtask)}>
                <Icon name="create-outline" size={18} color={colors.textFaint} />
              </Pressable>
            ) : null}
            {canManage && subtask._id ? (
              <Pressable accessibilityRole="button" accessibilityLabel={`Remove ${subtask.title}`} hitSlop={8} onPress={() => run(`rm-${subtask._id}`, () => deleteSubtask(task._id, subtask._id!))}>
                <Icon name="close" size={18} color={colors.textFaint} />
              </Pressable>
            ) : null}
          </View>
        ))}
        {canManage ? (
          <View style={styles.addRow}>
            <View style={styles.flex}>
              <Field value={newSubtask} onChangeText={setNewSubtask} placeholder="Add a checklist item" maxLength={180} onSubmitEditing={() => newSubtask.trim() && run("add-sub", async () => { const r = await addSubtask(task._id, { title: newSubtask.trim() }); setNewSubtask(""); return r; })} />
            </View>
            <Button
              label=""
              accessibilityLabel="Add checklist item"
              icon="add"
              size="sm"
              disabled={!newSubtask.trim()}
              loading={saving === "add-sub"}
              onPress={() =>
                run("add-sub", async () => {
                  const result = await addSubtask(task._id, { title: newSubtask.trim() });
                  setNewSubtask("");
                  return result;
                })
              }
            />
          </View>
        ) : !subtasks.length ? (
          <Text variant="small" color="muted">
            No checklist.
          </Text>
        ) : null}
      </Card>

      <SectionTitle title={`Files${task.attachments?.length ? ` · ${task.attachments.length}` : ""}`} />
      <Card style={styles.rows}>
        {(task.attachments || []).map((file) => (
          <FileRow key={file._id || file.url} file={file} onRemove={file._id ? () => run(`f-${file._id}`, () => deleteAttachment(task._id, file._id!)) : undefined} />
        ))}
        <View style={styles.attach}>
          <AttachButton
            category="task-attachments"
            label="Attach a file"
            onUploaded={(file) => run("attach", () => addAttachments(task._id, [{ url: file.url, name: file.fileName, mimeType: file.mimeType, size: file.size }]))}
          />
        </View>
      </Card>

      <SectionTitle title={`Discussion${task.comments?.length ? ` · ${task.comments.length}` : ""}`} />
      {(task.comments || []).map((item) => (
        <Card key={item._id} style={styles.gapSm}>
          <View style={styles.commentHead}>
            <Avatar name={item.author?.name || "?"} uri={item.author?.profileImageUrl} size={26} />
            <Text variant="smallStrong" style={styles.flex}>
              {item.author?.name || "Someone"}
            </Text>
            <Text variant="tiny" color="faint">
              {formatWhen(item.createdAt)}
            </Text>
            {idOf(item.author) === myId ? (
              <Pressable accessibilityRole="button" accessibilityLabel="Delete comment" hitSlop={8} onPress={() => run(`c-${item._id}`, () => deleteComment(task._id, item._id))}>
                <Icon name="trash-outline" size={16} color={colors.textFaint} />
              </Pressable>
            ) : null}
          </View>
          {item.body ? <Text variant="body">{item.body}</Text> : null}
          {(item.attachments || []).map((file) => (
            <FileRow key={file.url} file={file} />
          ))}
        </Card>
      ))}
      <Card style={styles.gapSm}>
        <Field value={comment} onChangeText={setComment} placeholder="Write a comment" multiline maxLength={4000} />
        {commentFiles.map((file, index) => (
          <FileRow key={file.url} file={file} onRemove={() => setCommentFiles((list) => list.filter((_, i) => i !== index))} />
        ))}
        <View style={styles.row}>
          <AttachButton
            category="task-attachments"
            label="Attach"
            onUploaded={(file) => setCommentFiles((list) => [...list, { url: file.url, name: file.fileName, mimeType: file.mimeType, size: file.size }])}
          />
          <View style={styles.flex} />
          <Button
            label="Post"
            icon="send"
            size="sm"
            disabled={!comment.trim() && !commentFiles.length}
            loading={saving === "comment"}
            onPress={() =>
              run("comment", async () => {
                const result = await addComment(task._id, comment, commentFiles);
                setComment("");
                setCommentFiles([]);
                return result;
              })
            }
          />
        </View>
      </Card>

      <SectionTitle title="People" />
      <Card style={styles.rows}>
        <PersonLine label="Assigned to" person={task.assignedTo} />
        <PersonLine label="Created by" person={creator} last />
      </Card>

      {lead ? (
        <>
          <SectionTitle title="Linked lead" />
          <Card onPress={() => navigation.navigate("LeadDetail", { leadId: lead._id, name: lead.name })} style={styles.leadRow}>
            <Avatar name={lead.name} size={36} />
            <View style={styles.flex}>
              <Text variant="bodyStrong">{lead.name}</Text>
              {lead.phone ? (
                <Text variant="small" color="muted">
                  {lead.phone}
                </Text>
              ) : null}
            </View>
            <Icon name="chevron-forward" size={18} color={colors.textFaint} />
          </Card>
        </>
      ) : null}

      {task.activity?.length ? (
        <>
          <SectionTitle title="Activity" />
          <Card style={styles.rows}>
            {[...task.activity].reverse().slice(0, 15).map((entry, index) => (
              <View key={entry._id || index} style={styles.activity}>
                <Text variant="small" style={styles.flex}>
                  <Text variant="smallStrong">{entry.actor?.name || "Someone"}</Text> {activityLabel(entry.action, entry.detail || entry.message)}
                </Text>
                <Text variant="tiny" color="faint">
                  {formatWhen(entry.at || entry.createdAt)}
                </Text>
              </View>
            ))}
          </Card>
        </>
      ) : null}

      <SubtaskEditor
        subtask={editing}
        onClose={() => setEditing(null)}
        onSave={async (patch) => {
          try {
            const updated = await editSubtask(task._id, editing!._id!, patch);
            if (updated) setData({ ...task, ...updated });
          } catch (err) {
            throw new Error(errorMessage(err));
          }
        }}
      />
      <ActionSheet visible={menuOpen && menu.length > 0} title={task.title} actions={menu} onClose={() => setMenuOpen(false)} />
    </Body>
  );
};

const FileRow = ({ file, onRemove }: { file: TaskFile; onRemove?: () => void }) => {
  const { colors } = useTheme();
  const isImage = String(file.mimeType || "").startsWith("image/");
  return (
    <View style={[styles.file, { borderColor: colors.border }]}>
      <Icon name={isImage ? "image-outline" : "document-outline"} size={20} color={colors.primary} />
      <Pressable style={styles.flex} accessibilityRole="link" onPress={() => Linking.openURL(mediaUrl(file.url) || file.url)}>
        <Text variant="small" numberOfLines={1}>
          {file.name || "File"}
        </Text>
        {file.size ? (
          <Text variant="tiny" color="faint">
            {formatBytes(file.size)}
          </Text>
        ) : null}
      </Pressable>
      {onRemove ? (
        <Pressable accessibilityRole="button" accessibilityLabel={`Remove ${file.name || "file"}`} hitSlop={8} onPress={onRemove}>
          <Icon name="close-circle" size={20} color={colors.textFaint} />
        </Pressable>
      ) : null}
    </View>
  );
};

const PersonLine = ({ label, person, last }: { label: string; person?: PersonRef; last?: boolean }) => {
  const { colors } = useTheme();
  return (
    <View style={[styles.person, !last && { borderBottomColor: colors.border, borderBottomWidth: StyleSheet.hairlineWidth }]}>
      <Avatar name={person?.name || "?"} uri={(person as { profileImageUrl?: string } | null)?.profileImageUrl} size={30} />
      <View style={styles.flex}>
        <Text variant="tiny" color="faint">
          {label}
        </Text>
        <Text variant="small" color={person?.name ? "text" : "faint"}>
          {person?.name || "Unassigned"}
        </Text>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  flex: { flex: 1 },
  webInset: { marginRight: space.lg },
  gap: { gap: space.sm },
  gapSm: { gap: space.sm },
  row: { flexDirection: "row", gap: space.sm, alignItems: "center" },
  badges: { flexDirection: "row", flexWrap: "wrap", gap: space.sm },
  strike: { textDecorationLine: "line-through" },
  metaRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: space.sm },
  rows: { paddingVertical: space.xs, gap: space.xs },
  subtask: { flexDirection: "row", alignItems: "center", gap: space.sm },
  subtaskMain: { flex: 1, flexDirection: "row", alignItems: "center", gap: space.md, paddingVertical: space.md },
  addRow: { flexDirection: "row", alignItems: "center", gap: space.sm, paddingVertical: space.sm },
  attach: { paddingVertical: space.sm },
  file: { flexDirection: "row", alignItems: "center", gap: space.md, borderWidth: 1, borderRadius: 10, padding: space.sm, marginVertical: 4 },
  commentHead: { flexDirection: "row", alignItems: "center", gap: space.sm },
  person: { flexDirection: "row", alignItems: "center", gap: space.md, paddingVertical: space.md },
  leadRow: { flexDirection: "row", alignItems: "center", gap: space.md },
  activity: { flexDirection: "row", gap: space.sm, paddingVertical: 6 },
});
