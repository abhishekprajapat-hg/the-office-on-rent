import React, { useEffect, useState } from "react";
import { StyleSheet, View } from "react-native";
import type { SubtaskDraft } from "../../api/tasks";
import { DateTimeField } from "../../components/DateTimeField";
import { PRIORITY, STATUS_ORDER, TASK_STATUS, TASK_STATUS_TONE, subtaskStatus } from "../../lib/taskMeta";
import { Button, Chip, Field, InlineError, Sheet, Text } from "../../ui";

/*
 * The web's subtask editor as a bottom sheet: title, full instructions, due
 * date, status and priority. A receiver who doesn't manage the task can only
 * move the status (the server enforces the same).
 */
export const SubtaskEditor = ({
  visible,
  subtask,
  isNew,
  statusOnly,
  defaults,
  onSave,
  onDelete,
  onClose,
}: {
  visible: boolean;
  subtask: SubtaskDraft | null;
  isNew?: boolean;
  statusOnly?: boolean;
  defaults?: { dueDate?: string | null; priority?: string };
  onSave: (draft: SubtaskDraft) => Promise<void> | void;
  onDelete?: () => Promise<void> | void;
  onClose: () => void;
}) => {
  const [title, setTitle] = useState("");
  const [note, setNote] = useState("");
  const [due, setDue] = useState<Date | null>(null);
  const [status, setStatus] = useState("TODO");
  const [priority, setPriority] = useState("MEDIUM");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!visible) return;
    setTitle(subtask?.title || "");
    setNote(subtask?.description || "");
    const dueValue = subtask?.dueDate || defaults?.dueDate || null;
    setDue(dueValue ? new Date(dueValue) : new Date());
    setStatus(subtask ? subtaskStatus(subtask) : "TODO");
    setPriority(subtask?.priority || defaults?.priority || "MEDIUM");
    setError(null);
    setSaving(false);
  }, [visible, subtask, defaults?.dueDate, defaults?.priority]);

  const save = async () => {
    if (!statusOnly) {
      if (!title.trim()) return setError("Give the subtask a title.");
      if (!due) return setError("Pick a due date.");
    }
    setSaving(true);
    setError(null);
    try {
      await onSave(
        statusOnly
          ? { title: subtask?.title || "", status, isCompleted: status === "COMPLETED" }
          : {
              ...(subtask?._id ? { _id: subtask._id } : {}),
              title: title.trim(),
              description: note.trim(),
              dueDate: due!.toISOString(),
              status,
              priority,
              isCompleted: status === "COMPLETED",
            },
      );
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't save the subtask.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Sheet
      visible={visible}
      title={isNew ? "New subtask" : statusOnly ? subtask?.title || "Subtask" : "Subtask"}
      subtitle={statusOnly ? "You can move the status; the task's owner edits the rest." : "Subtasks follow the task's assignee and keep their own date, status and priority."}
      onClose={onClose}
      footer={
        <View style={styles.row}>
          {onDelete && !isNew ? (
            <Button
              label="Remove"
              variant="danger"
              icon="trash-outline"
              style={styles.flex}
              onPress={async () => {
                setSaving(true);
                try {
                  await onDelete();
                  onClose();
                } catch (err) {
                  setError(err instanceof Error ? err.message : "Couldn't remove it.");
                  setSaving(false);
                }
              }}
            />
          ) : null}
          <Button label={isNew ? "Add subtask" : "Save"} icon="checkmark" style={styles.wide} loading={saving} onPress={save} />
        </View>
      }
    >
      {statusOnly ? (
        subtask?.description ? (
          <Text variant="small" color="muted">
            {subtask.description}
          </Text>
        ) : null
      ) : (
        <>
          <Field label="Title" value={title} onChangeText={setTitle} maxLength={180} placeholder="Subtask title" autoFocus={isNew} />
          <Field label="Description" value={note} onChangeText={setNote} placeholder="Full instructions for this subtask" multiline maxLength={5000} />
          <DateTimeField label="Due date" mode="date" variant="row" value={due} onChange={setDue} />
        </>
      )}
      <Text variant="smallStrong" color="muted">
        Status
      </Text>
      <View style={styles.chips}>
        {STATUS_ORDER.map((key) => (
          <Chip key={key} label={TASK_STATUS[key]!.label} tone={TASK_STATUS_TONE[key]} selected={status === key} onPress={() => setStatus(key)} />
        ))}
      </View>
      {!statusOnly ? (
        <>
          <Text variant="smallStrong" color="muted">
            Priority
          </Text>
          <View style={styles.chips}>
            {(["LOW", "MEDIUM", "HIGH"] as const).map((key) => (
              <Chip key={key} label={PRIORITY[key]!.label} tone={PRIORITY[key]!.tone === "neutral" ? "primary" : PRIORITY[key]!.tone} selected={priority === key} onPress={() => setPriority(key)} />
            ))}
          </View>
        </>
      ) : null}
      <InlineError message={error} />
    </Sheet>
  );
};

const styles = StyleSheet.create({
  flex: { flex: 1 },
  wide: { flex: 1.6 },
  row: { flexDirection: "row", gap: 8 },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
});
