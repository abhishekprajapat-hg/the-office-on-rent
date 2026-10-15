import React, { useLayoutEffect, useState } from "react";
import { KeyboardAvoidingView, Linking, Platform, Pressable, StyleSheet, TextInput, View } from "react-native";
import { errorMessage, mediaUrl } from "../../api/client";
import { useLeadSearch } from "../../lib/useLeadSearch";
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
  getAssignees,
  getTask,
  updateTask,
  type SubtaskDraft,
} from "../../api/tasks";
import type { Subtask, Task, TaskFile } from "../../api/types";
import { SubtaskEditor } from "./SubtaskEditor";
import { useUser } from "../../auth/AuthProvider";
import { AttachButton } from "../../components/AttachButton";
import { DateTimeField } from "../../components/DateTimeField";
import { formatDate, formatWhen } from "../../lib/format";
import { isManagement, roleLabel } from "../../lib/roles";
import { dayKey, DEFAULT_TAGS, isSubtaskDone, isTaskOverdue, PRIORITY, priorityMeta, STATUS_ORDER, subtaskStatus, TASK_STATUS, TASK_STATUS_TONE } from "../../lib/taskMeta";
import { formatBytes } from "../../lib/uploadRules";
import { useQuery } from "../../lib/useQuery";
import { activityLabel } from "../../lib/workload";
import type { RootScreenProps } from "../../navigation/types";
import { useTheme } from "../../theme/ThemeProvider";
import { space, toneColors } from "../../theme/tokens";
import { ActionSheet, type SheetAction } from "../../ui/ActionSheet";
import { PickerSheet } from "../../ui/PickerSheet";
import { Avatar, Badge, Body, Button, Card, CheckSquare, ErrorState, FooterBar, Icon, InlineError, ListCard, Loading, ProgressBar, Sheet, Text, type IconName } from "../../ui";

const idOf = (value?: { _id: string } | string | null) => (typeof value === "string" ? value : value?._id || "");
const PRODUCTION_ROLES = ["PRODUCTION_EXECUTIVE", "COMMUNITY_MANAGER"];

/*
 * The web's task details panel: inline status / priority / due date /
 * assignee / linked lead, created-by, category tags, full subtasks (each with
 * its own instructions, date, status and priority), files, comments with
 * files, and the task history. Who may change what follows the server: the
 * creator (or a manager who isn't the receiver) manages everything; the
 * receiver moves the status of the task and its subtasks.
 */
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
  const [comment, setComment] = useState("");
  const [notice, setNotice] = useState<string | null>(null);
  const [commentFiles, setCommentFiles] = useState<TaskFile[]>([]);
  const [sheet, setSheet] = useState<null | "status" | "priority" | "assignee" | "lead">(null);
  const [editingSubtask, setEditingSubtask] = useState<{ subtask: Subtask | null; isNew: boolean } | null>(null);
  const [tagDraft, setTagDraft] = useState("");
  const [showHistory, setShowHistory] = useState(false);
  const { data: people } = useQuery(() => getAssignees().catch(() => []), []);
  const { leads, search: searchLeads } = useLeadSearch(sheet === "lead");

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
  const run = async (key: string, action: () => Promise<Task | null | unknown>, done?: string) => {
    setSaving(key);
    setActionError(null);
    try {
      const updated = await action();
      if (updated && typeof updated === "object" && "_id" in (updated as Task)) setData({ ...task, ...(updated as Task) });
      else refresh();
      if (done) setNotice(done);
    } catch (err) {
      setActionError(errorMessage(err));
    } finally {
      setSaving(null);
    }
  };

  const creator = typeof task.createdBy === "object" ? task.createdBy : null;
  const isCreator = idOf(creator) === myId;
  const isReceiver = idOf(task.assignedTo) === myId && !isCreator;
  const canManage = isCreator || (!isReceiver && isManagement(user.role));
  const canChangeStatus = canManage || isReceiver;
  const canModerate = isManagement(user.role);
  const production = PRODUCTION_ROLES.includes(user.role);

  const done = task.status === "COMPLETED";
  const priority = priorityMeta(task.priority);
  const lead = typeof task.leadId === "object" && task.leadId ? task.leadId : null;
  const subtasks = task.subtasks || [];
  const doneSubtasks = subtasks.filter(isSubtaskDone).length;
  const openSubtasks = subtasks.length - doneSubtasks;
  const overdue = isTaskOverdue(task);
  const assignee = task.assignedTo && typeof task.assignedTo === "object" ? task.assignedTo : null;
  const statusTone = toneColors(colors, TASK_STATUS_TONE[task.status] || "neutral");

  const setStatus = (status: string) => {
    if (status === "COMPLETED" && openSubtasks > 0) return setActionError("Complete every subtask before completing the parent task.");
    run(`status-${status}`, () => updateTask(task._id, { status }), "Task updated.");
  };

  const toggleSubtask = async (subtask: Subtask) => {
    if (!subtask._id) return;
    const next = isSubtaskDone(subtask) ? "TODO" : "COMPLETED";
    const flip = (status: string) =>
      setData({ ...task, subtasks: subtasks.map((item) => (item._id === subtask._id ? { ...item, status, isCompleted: status === "COMPLETED" } : item)) });
    flip(next);
    setActionError(null);
    try {
      const updated = await editSubtask(task._id, subtask._id, { status: next, isCompleted: next === "COMPLETED" });
      if (updated) setData({ ...task, ...updated });
    } catch (err) {
      flip(subtaskStatus(subtask));
      setActionError(errorMessage(err));
    }
  };

  const addTag = (raw = tagDraft) => {
    const clean = raw.trim();
    setTagDraft("");
    if (!clean || (task.tags || []).includes(clean)) return;
    run("tags", () => editTask(task._id, { tags: [...(task.tags || []), clean].slice(0, 20) }));
  };

  const menu: SheetAction[] = [
    ...(canManage ? [{ key: "edit", label: "Edit task", icon: "create-outline" as const, hint: "Title, details, subtasks", onPress: () => navigation.navigate("NewTask", { taskId: task._id }) }] : []),
    ...(idOf(task.assignedTo) !== myId && canManage ? [{ key: "me", label: "Assign to me", icon: "person-add-outline" as const, onPress: () => run("me", () => editTask(task._id, { assignedTo: myId }), "Assigned to you.") }] : []),
    ...(lead ? [{ key: "lead", label: "Open lead", icon: "person-outline" as const, hint: lead.name, onPress: () => navigation.navigate("LeadDetail", { leadId: lead._id, name: lead.name }) }] : []),
    { key: "history", label: showHistory ? "Hide history" : "Show history", icon: "time-outline" as const, onPress: () => setShowHistory(!showHistory) },
    ...(canManage
      ? [{ key: "delete", label: "Delete task", icon: "trash-outline" as const, destructive: true, hint: user.role === "MANAGER" ? "Sends a request to an admin" : undefined, onPress: () => setConfirmDelete(true) }]
      : []),
  ];

  const postComment = () =>
    run("comment", async () => {
      const result = await addComment(task._id, comment, commentFiles);
      setComment("");
      setCommentFiles([]);
      return result;
    });

  const tagSuggestions = DEFAULT_TAGS.filter((tag) => !(task.tags || []).includes(tag) && (!tagDraft || tag.toLowerCase().includes(tagDraft.toLowerCase())));
  const history = [...(task.activity || [])].reverse();

  return (
    <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === "ios" ? "padding" : undefined} keyboardVerticalOffset={Platform.OS === "ios" ? 80 : 0}>
      <Body refreshing={refreshing} onRefresh={refresh} footerSpace>
        <Card style={styles.summary}>
          <View style={styles.badges}>
            <Badge label={TASK_STATUS[task.status]?.label || task.status} tone={TASK_STATUS_TONE[task.status] || "neutral"} />
            <Badge label={priority.label} tone={priority.tone} />
            {overdue ? <Badge label="Overdue" tone="danger" /> : null}
          </View>
          <Text variant="title" style={[styles.taskTitle, done && styles.strike]}>
            {task.title}
          </Text>
          <Text variant="body" color="muted" style={styles.desc}>
            {task.description || "No description added."}
          </Text>
          {canManage ? (
            <Pressable accessibilityRole="button" onPress={() => navigation.navigate("NewTask", { taskId: task._id })} style={styles.editLink} hitSlop={6}>
              <Icon name="create-outline" size={15} color={colors.primary} />
              <Text variant="smallStrong" color="primary">
                Edit task
              </Text>
            </Pressable>
          ) : null}
        </Card>

        {confirmDelete ? (
          <Card style={styles.gap}>
            <Text variant="bodyStrong">{user.role === "MANAGER" ? "Send a request to an admin to delete this task?" : "Delete this task? This can't be undone."}</Text>
            <Text variant="small" color="muted">
              Its subtasks, comments and files go with it.
            </Text>
            <View style={styles.row}>
              <Button label="Keep" variant="secondary" style={styles.flex} onPress={() => setConfirmDelete(false)} />
              <Button
                label={user.role === "MANAGER" ? "Send request" : "Delete"}
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
          <Pressable onPress={() => setNotice(null)} style={[styles.notice, { backgroundColor: colors.successSoft }]}>
            <Icon name="checkmark-circle" size={16} color={colors.success} />
            <Text variant="small" color={colors.success} style={styles.flex}>
              {notice}
            </Text>
          </Pressable>
        ) : null}
        <InlineError message={actionError} />

        {/* The web's field grid, one tappable row each. */}
        <ListCard>
          <FieldRow icon="ellipse" iconColor={statusTone.fg} label="Status" value={TASK_STATUS[task.status]?.label || task.status} onPress={canChangeStatus ? () => setSheet("status") : undefined} />
          <FieldRow icon="flag-outline" label="Priority" value={priority.label} valueColor={toneColors(colors, priority.tone === "neutral" ? "primary" : priority.tone).fg} onPress={canManage ? () => setSheet("priority") : undefined} />
          {canManage ? (
            <View style={styles.dateRow}>
              <DateTimeField
                label={overdue ? "Due date · overdue" : "Due date"}
                mode="date"
                variant="row"
                value={task.dueDate ? new Date(task.dueDate) : null}
                onChange={(date) => date && run("due", () => updateTask(task._id, { dueDate: date.toISOString() }), "Due date changed.")}
              />
            </View>
          ) : (
            <FieldRow icon="calendar-outline" label="Due date" value={task.dueDate ? formatDate(task.dueDate) : "No date"} valueColor={overdue ? colors.danger : undefined} />
          )}
          <FieldRow
            icon="person-outline"
            label="Assigned to"
            value={assignee ? (idOf(assignee) === myId ? `${assignee.name} (me)` : assignee.name) : "Unassigned"}
            avatar={assignee?.name}
            onPress={canManage ? () => setSheet("assignee") : undefined}
          />
          <FieldRow icon="create-outline" label="Created by" value={creator ? `${creator.name}${creator.role ? ` · ${roleLabel(creator.role)}` : ""}` : "—"} avatar={creator?.name} />
          {!production ? (
            <FieldRow
              icon="link-outline"
              label="Linked lead"
              value={lead ? lead.name : "No linked lead"}
              valueColor={lead ? colors.primary : colors.textFaint}
              onPress={canManage ? () => setSheet("lead") : lead ? () => navigation.navigate("LeadDetail", { leadId: lead._id, name: lead.name }) : undefined}
            />
          ) : null}
        </ListCard>

        {/* Category tags. */}
        <Card style={styles.gap}>
          <View style={styles.cardHead}>
            <Icon name="pricetag-outline" size={15} color={colors.textMuted} />
            <Text variant="heading" style={[styles.cardTitle, styles.flex]}>
              Category tags
            </Text>
          </View>
          <View style={styles.tags}>
            {(task.tags || []).map((tag) => (
              <Pressable
                key={tag}
                accessibilityRole="button"
                accessibilityLabel={canManage ? `Remove tag ${tag}` : tag}
                disabled={!canManage}
                onPress={() => run("tags", () => editTask(task._id, { tags: (task.tags || []).filter((item) => item !== tag) }))}
                style={[styles.tag, { backgroundColor: colors.primarySoft }]}
              >
                <Text variant="smallStrong" color="primary">
                  {tag}
                </Text>
                {canManage ? <Icon name="close" size={12} color={colors.primary} /> : null}
              </Pressable>
            ))}
            {!(task.tags || []).length && !canManage ? (
              <Text variant="small" color="faint">
                No tags
              </Text>
            ) : null}
          </View>
          {canManage ? (
            <>
              <View style={[styles.tagInput, { borderColor: colors.border, backgroundColor: colors.bg }]}>
                <Icon name="add" size={16} color={colors.textFaint} />
                <TextInput
                  value={tagDraft}
                  onChangeText={setTagDraft}
                  placeholder="Add tag"
                  placeholderTextColor={colors.textFaint}
                  returnKeyType="done"
                  onSubmitEditing={() => addTag()}
                  style={[styles.tagField, { color: colors.text }]}
                />
              </View>
              {tagSuggestions.length ? (
                <View style={styles.tags}>
                  {tagSuggestions.map((tag) => (
                    <Pressable key={tag} accessibilityRole="button" onPress={() => addTag(tag)} style={[styles.tag, { borderColor: colors.border, borderWidth: 1 }]}>
                      <Icon name="add" size={12} color={colors.textMuted} />
                      <Text variant="small" color="muted">
                        {tag}
                      </Text>
                    </Pressable>
                  ))}
                </View>
              ) : null}
            </>
          ) : null}
        </Card>

        {/* Subtasks, as on the web: each has its own date, status and priority. */}
        <Card style={styles.checklist}>
          <View style={styles.cardHead}>
            <Icon name="list" size={16} color={colors.textMuted} />
            <Text variant="heading" style={[styles.cardTitle, styles.flex]}>
              Subtasks <Text variant="small" color="muted">{`(${doneSubtasks} of ${subtasks.length})`}</Text>
            </Text>
            {canManage ? (
              <Pressable accessibilityRole="button" onPress={() => setEditingSubtask({ subtask: null, isNew: true })} hitSlop={8} style={styles.inline}>
                <Icon name="add-circle-outline" size={17} color={colors.primary} />
                <Text variant="smallStrong" color="primary">
                  Add subtask
                </Text>
              </Pressable>
            ) : null}
          </View>
          {subtasks.length ? <ProgressBar value={doneSubtasks / subtasks.length} /> : null}
          {subtasks.map((subtask, index) => {
            const status = subtaskStatus(subtask);
            const subDone = status === "COMPLETED";
            const subOverdue = !subDone && Boolean(subtask.dueDate) && dayKey(subtask.dueDate!) < dayKey();
            const subPriority = priorityMeta(subtask.priority || task.priority);
            return (
              <Pressable
                key={subtask._id || index}
                accessibilityRole="button"
                accessibilityLabel={`Subtask ${subtask.title}`}
                onPress={() => (canManage || canChangeStatus) && setEditingSubtask({ subtask, isNew: false })}
                style={[styles.subtask, index > 0 && { borderTopColor: colors.border, borderTopWidth: StyleSheet.hairlineWidth }]}
              >
                <Pressable
                  accessibilityRole="checkbox"
                  accessibilityState={{ checked: subDone }}
                  accessibilityLabel={subDone ? "Reopen subtask" : "Complete subtask"}
                  disabled={!canChangeStatus}
                  hitSlop={8}
                  onPress={() => toggleSubtask(subtask)}
                >
                  <CheckSquare checked={subDone} size={20} />
                </Pressable>
                <View style={styles.flex}>
                  <Text variant="body" color={subDone ? "faint" : "text"} style={[styles.subtaskText, subDone && styles.strike]}>
                    {subtask.title}
                  </Text>
                  {subtask.description ? (
                    <Text variant="tiny" color="muted" numberOfLines={2}>
                      {subtask.description}
                    </Text>
                  ) : null}
                  <View style={styles.subMeta}>
                    <Text variant="tiny" color={subOverdue ? colors.danger : colors.textMuted}>
                      {subtask.dueDate ? `${subOverdue ? "Overdue · " : ""}${formatDate(subtask.dueDate)}` : "No date"}
                    </Text>
                    <Text variant="tiny" color={toneColors(colors, TASK_STATUS_TONE[status] || "neutral").fg}>
                      {TASK_STATUS[status]?.label}
                    </Text>
                    <Text variant="tiny" color={toneColors(colors, subPriority.tone === "neutral" ? "primary" : subPriority.tone).fg}>
                      {subPriority.label}
                    </Text>
                  </View>
                </View>
                {canManage ? <Icon name="chevron-forward" size={15} color={colors.textFaint} /> : null}
              </Pressable>
            );
          })}
          {!subtasks.length ? (
            <View style={styles.noSubtasks}>
              <Text variant="small" color="muted">
                No subtasks yet.
              </Text>
              {canManage ? (
                <Text variant="smallStrong" color="primary" onPress={() => setEditingSubtask({ subtask: null, isNew: true })}>
                  Add the first subtask
                </Text>
              ) : null}
            </View>
          ) : null}
          {!done && openSubtasks > 0 ? (
            <View style={styles.note}>
              <Icon name="information-circle-outline" size={14} color={colors.textMuted} />
              <Text variant="small" color="muted" style={styles.noteText}>
                Complete every subtask before completing the task.
              </Text>
            </View>
          ) : null}
        </Card>

        {canChangeStatus ? (
          <Button
            label={done ? "Reopen task" : "Mark as completed"}
            icon={done ? "refresh" : "checkmark-circle"}
            variant={done ? "secondary" : "primary"}
            loading={saving === "status-COMPLETED" || saving === "status-TODO"}
            disabled={!done && openSubtasks > 0}
            onPress={() => setStatus(done ? "TODO" : "COMPLETED")}
          />
        ) : null}

        <View style={styles.section}>
          <View style={styles.cardHead}>
            <Icon name="attach" size={16} color={colors.textMuted} />
            <Text variant="heading" style={[styles.cardTitle, styles.flex]}>
              Files <Text variant="small" color="muted">{`(${(task.attachments || []).length})`}</Text>
            </Text>
          </View>
          <Card style={styles.files}>
            {(task.attachments || []).map((file) => (
              <FileRow
                key={file._id || file.url}
                file={file}
                onRemove={file._id && (canModerate || idOf(file.uploadedBy as { _id: string } | string | null) === myId) ? () => run(`f-${file._id}`, () => deleteAttachment(task._id, file._id!)) : undefined}
              />
            ))}
            {!(task.attachments || []).length ? (
              <Text variant="small" color="muted">
                No files yet. Attach briefs, references or the finished work.
              </Text>
            ) : null}
            <AttachButton
              category="task-attachments"
              label="Attach file"
              onUploaded={(file) => run("attach", () => addAttachments(task._id, [{ url: file.url, name: file.fileName, mimeType: file.mimeType, size: file.size }]))}
            />
          </Card>
        </View>

        <View style={styles.section}>
          <View style={styles.cardHead}>
            <Icon name="chatbubbles-outline" size={16} color={colors.textMuted} />
            <Text variant="heading" style={[styles.cardTitle, styles.flex]}>
              Comments & updates <Text variant="small" color="muted">{`(${(task.comments || []).length})`}</Text>
            </Text>
            <Pressable accessibilityRole="button" onPress={() => setShowHistory(!showHistory)} hitSlop={8} style={styles.inline}>
              <Icon name="time-outline" size={15} color={showHistory ? colors.primary : colors.textMuted} />
              <Text variant="smallStrong" color={showHistory ? colors.primary : colors.textMuted}>
                History
              </Text>
            </Pressable>
          </View>
          {showHistory ? (
            <ListCard>
              {history.length ? (
                history.map((entry, index) => (
                  <View key={entry._id || index} style={styles.activity}>
                    <Text variant="small" style={styles.flex}>
                      <Text variant="smallStrong">{entry.actor?.name || "Someone"}</Text> {activityLabel(entry.action, entry.detail || entry.message)}
                    </Text>
                    <Text variant="tiny" color="faint">
                      {formatWhen(entry.at || entry.createdAt)}
                    </Text>
                  </View>
                ))
              ) : (
                <View style={styles.activity}>
                  <Text variant="small" color="muted">
                    No history recorded yet.
                  </Text>
                </View>
              )}
            </ListCard>
          ) : null}
          {(task.comments || []).length ? (
            (task.comments || []).map((item) => {
              const own = idOf(item.author) === myId;
              return (
                <View key={item._id} style={styles.comment}>
                  <Avatar name={item.author?.name || "?"} uri={item.author?.profileImageUrl} size={28} tinted />
                  <View style={[styles.bubble, { backgroundColor: own ? colors.primarySoft : colors.surface, borderColor: own ? colors.primarySoft : colors.border }]}>
                    <View style={styles.bubbleHead}>
                      <Text variant="small" style={styles.bubbleName} numberOfLines={1}>
                        {own ? "You" : item.author?.name || "Someone"}
                        <Text variant="small" color="faint" style={styles.bubbleTime}>{` · ${formatWhen(item.createdAt).replace(/^Today, /, "")}`}</Text>
                      </Text>
                      {own || canModerate ? (
                        <Pressable accessibilityRole="button" accessibilityLabel="Delete comment" hitSlop={8} onPress={() => run(`c-${item._id}`, () => deleteComment(task._id, item._id))}>
                          <Icon name="trash-outline" size={14} color={colors.textFaint} />
                        </Pressable>
                      ) : null}
                    </View>
                    {item.body ? (
                      <Text variant="body" style={styles.bubbleText}>
                        {item.body}
                      </Text>
                    ) : null}
                    {(item.attachments || []).map((file) => (
                      <FileRow key={file.url} file={file} />
                    ))}
                  </View>
                </View>
              );
            })
          ) : (
            <Text variant="small" color="muted">
              No comments yet. Post a progress update or ask a question.
            </Text>
          )}
        </View>
      </Body>

      <FooterBar>
        <View style={styles.composer}>
          {commentFiles.map((file, index) => (
            <FileRow key={file.url} file={file} onRemove={() => setCommentFiles((list) => list.filter((_, i) => i !== index))} />
          ))}
          <View style={styles.composerRow}>
            {commentFiles.length < 5 ? (
              <AttachButton
                category="task-attachments"
                label=""
                compact
                onUploaded={(file) => setCommentFiles((list) => [...list, { url: file.url, name: file.fileName, mimeType: file.mimeType, size: file.size }].slice(0, 5))}
              />
            ) : null}
            <TextInput
              value={comment}
              onChangeText={setComment}
              placeholder="Write an update or question…"
              placeholderTextColor={colors.textFaint}
              multiline
              maxLength={4000}
              style={[styles.input, { backgroundColor: colors.bg, borderColor: colors.border, color: colors.text }]}
            />
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Post comment"
              disabled={(!comment.trim() && !commentFiles.length) || saving === "comment"}
              onPress={postComment}
              style={[styles.send, { backgroundColor: colors.primary, opacity: !comment.trim() && !commentFiles.length ? 0.5 : 1 }]}
            >
              <Icon name="send" size={17} color={colors.onPrimary} />
            </Pressable>
          </View>
        </View>
      </FooterBar>

      <SubtaskEditor
        visible={Boolean(editingSubtask)}
        subtask={editingSubtask?.subtask ? { ...editingSubtask.subtask, assignedTo: undefined } : null}
        isNew={editingSubtask?.isNew}
        statusOnly={!canManage}
        defaults={{ dueDate: task.dueDate, priority: task.priority }}
        onClose={() => setEditingSubtask(null)}
        onSave={async (draft: SubtaskDraft) => {
          try {
            if (editingSubtask?.isNew) {
              const updated = await addSubtask(task._id, { ...draft, assignedTo: idOf(task.assignedTo) || undefined });
              if (updated) setData({ ...task, ...updated });
              setNotice("Subtask added.");
            } else if (editingSubtask?.subtask?._id) {
              const { _id, ...patch } = draft;
              const updated = await editSubtask(task._id, editingSubtask.subtask._id, canManage ? patch : { status: patch.status, isCompleted: patch.isCompleted });
              if (updated) setData({ ...task, ...updated });
              setNotice("Subtask updated.");
            }
          } catch (err) {
            throw new Error(errorMessage(err));
          }
        }}
        onDelete={
          canManage && editingSubtask?.subtask?._id
            ? async () => {
                try {
                  const updated = await deleteSubtask(task._id, editingSubtask.subtask!._id!);
                  if (updated) setData({ ...task, ...updated });
                  setNotice("Subtask removed.");
                } catch (err) {
                  throw new Error(errorMessage(err));
                }
              }
            : undefined
        }
      />
      <ActionSheet visible={menuOpen} title={task.title} actions={menu} onClose={() => setMenuOpen(false)} />
      <ActionSheet
        visible={sheet === "status"}
        title="Status"
        onClose={() => setSheet(null)}
        actions={STATUS_ORDER.map((key) => ({
          key,
          label: TASK_STATUS[key]!.label,
          icon: (task.status === key ? "radio-button-on" : "radio-button-off") as IconName,
          hint: key === "COMPLETED" && openSubtasks > 0 ? "Finish the subtasks first" : undefined,
          onPress: () => task.status !== key && setStatus(key),
        }))}
      />
      <ActionSheet
        visible={sheet === "priority"}
        title="Priority"
        onClose={() => setSheet(null)}
        actions={(["LOW", "MEDIUM", "HIGH"] as const).map((key) => ({
          key,
          label: PRIORITY[key]!.label,
          icon: (task.priority === key ? "radio-button-on" : "radio-button-off") as IconName,
          onPress: () => task.priority !== key && run(key, () => updateTask(task._id, { priority: key }), "Task updated."),
        }))}
      />
      <PickerSheet
        visible={sheet === "assignee"}
        title="Assign to"
        subtitle="Subtasks follow the task's assignee."
        searchPlaceholder="Search active users"
        selected={idOf(task.assignedTo)}
        items={(people || []).map((person) => ({ key: person!._id, label: person!._id === myId ? `${person!.name} (me)` : person!.name, sub: roleLabel(person!.role), avatar: true }))}
        onPick={(key) => {
          setSheet(null);
          if (key !== idOf(task.assignedTo)) run("assignee", () => editTask(task._id, { assignedTo: key }), "Task reassigned.");
        }}
        onClose={() => setSheet(null)}
      />
      <PickerSheet
        visible={sheet === "lead"}
        title="Linked lead"
        searchPlaceholder="Search leads by name or phone"
        onSearch={searchLeads}
        selected={lead?._id || "NONE"}
        items={[
          { key: "NONE", label: "No linked lead" },
          ...(lead && !(leads || []).some((item) => item._id === lead._id) ? [{ key: lead._id, label: lead.name }] : []),
          ...(leads || []).map((item) => ({ key: item._id, label: item.name, sub: [item.phone, item.projectInterested].filter(Boolean).join(" · ") })),
        ]}
        onPick={(key) => {
          setSheet(null);
          const next = key === "NONE" ? null : key;
          if (next !== (lead?._id || null)) run("lead", () => editTask(task._id, { leadId: next }), next ? "Lead linked." : "Lead unlinked.");
        }}
        onClose={() => setSheet(null)}
      />
    </KeyboardAvoidingView>
  );
};

const FieldRow = ({
  icon,
  iconColor,
  label,
  value,
  valueColor,
  avatar,
  onPress,
}: {
  icon: IconName;
  iconColor?: string;
  label: string;
  value: string;
  valueColor?: string;
  avatar?: string;
  onPress?: () => void;
}) => {
  const { colors } = useTheme();
  return (
    <Pressable disabled={!onPress} onPress={onPress} accessibilityRole={onPress ? "button" : undefined} accessibilityLabel={`${label}: ${value}`} style={styles.fieldRow}>
      <Icon name={icon} size={16} color={iconColor || colors.textMuted} />
      <Text variant="small" color="muted" style={styles.fieldLabel}>
        {label}
      </Text>
      <View style={styles.fieldValue}>
        {avatar ? <Avatar name={avatar} size={20} tinted /> : null}
        <Text variant="smallStrong" color={valueColor || colors.text} numberOfLines={1} style={styles.fieldText}>
          {value}
        </Text>
      </View>
      {onPress ? <Icon name="chevron-forward" size={14} color={colors.textFaint} /> : <View style={styles.chevronPad} />}
    </Pressable>
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

const styles = StyleSheet.create({
  flex: { flex: 1, minWidth: 0 },
  webInset: { marginRight: space.lg },
  gap: { gap: space.sm },
  row: { flexDirection: "row", gap: space.sm, alignItems: "center" },
  inline: { flexDirection: "row", alignItems: "center", gap: 4 },
  summary: { gap: 10, padding: 16, borderRadius: 20 },
  badges: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  taskTitle: { lineHeight: 24 },
  desc: { fontSize: 13, lineHeight: 19 },
  editLink: { flexDirection: "row", alignItems: "center", gap: 5, alignSelf: "flex-start" },
  strike: { textDecorationLine: "line-through" },
  notice: { flexDirection: "row", alignItems: "center", gap: 8, borderRadius: 12, padding: 10 },
  fieldRow: { flexDirection: "row", alignItems: "center", gap: 10, minHeight: 48, paddingHorizontal: 14, paddingVertical: 8 },
  fieldLabel: { width: 86, fontSize: 12.5 },
  fieldValue: { flex: 1, minWidth: 0, flexDirection: "row", alignItems: "center", justifyContent: "flex-end", gap: 6 },
  fieldText: { fontSize: 13, flexShrink: 1, textAlign: "right" },
  chevronPad: { width: 14 },
  dateRow: { paddingHorizontal: 4, paddingVertical: 2 },
  cardHead: { flexDirection: "row", alignItems: "center", gap: 8 },
  cardTitle: { fontSize: 13 },
  tags: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  tag: { flexDirection: "row", alignItems: "center", gap: 4, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 5 },
  tagInput: { flexDirection: "row", alignItems: "center", gap: 6, borderWidth: 1, borderRadius: 12, paddingHorizontal: 10, height: 40 },
  tagField: { flex: 1, fontFamily: "PlusJakartaSans_500Medium", fontSize: 13, ...({ outlineStyle: "none" } as object) },
  checklist: { gap: 8, borderRadius: 20 },
  subtask: { flexDirection: "row", alignItems: "flex-start", gap: 10, paddingVertical: 9 },
  subtaskText: { fontSize: 13 },
  subMeta: { flexDirection: "row", gap: 10, marginTop: 3 },
  noSubtasks: { alignItems: "center", gap: 4, paddingVertical: 8 },
  note: { flexDirection: "row", alignItems: "center", gap: 6 },
  noteText: { fontSize: 11.5 },
  section: { gap: 8 },
  comment: { flexDirection: "row", gap: 8 },
  bubble: { flex: 1, paddingVertical: 8, paddingHorizontal: 10, borderRadius: 12, borderWidth: 1, gap: 2 },
  bubbleHead: { flexDirection: "row", alignItems: "center", gap: 6 },
  bubbleName: { flex: 1, fontSize: 11.5, fontFamily: "PlusJakartaSans_700Bold" },
  bubbleTime: { fontFamily: "PlusJakartaSans_500Medium", fontSize: 11.5 },
  bubbleText: { fontSize: 12.5, lineHeight: 17 },
  files: { gap: 6 },
  file: { flexDirection: "row", alignItems: "center", gap: space.md, borderWidth: 1, borderRadius: 12, padding: space.sm },
  activity: { flexDirection: "row", gap: space.sm, paddingVertical: 10, paddingHorizontal: 12 },
  composer: { flex: 1, gap: 6 },
  composerRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  input: { flex: 1, minHeight: 44, maxHeight: 110, borderRadius: 14, borderWidth: 1, paddingHorizontal: 12, paddingVertical: 11, fontSize: 13, fontFamily: "PlusJakartaSans_500Medium", ...({ outlineStyle: "none" } as object) },
  send: { width: 44, height: 44, borderRadius: 14, alignItems: "center", justifyContent: "center" },
});
