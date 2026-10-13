import React, { useEffect, useState } from "react";
import { Modal, Pressable, StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import type { Subtask } from "../../api/types";
import { DateTimeField } from "../../components/DateTimeField";
import { useTheme } from "../../theme/ThemeProvider";
import { radius, space } from "../../theme/tokens";
import { Button, Field, InlineError, Text } from "../../ui";

/* The web's subtask detail panel as a bottom sheet: title, note, due date. */
export const SubtaskEditor = ({
  subtask,
  onSave,
  onClose,
}: {
  subtask: Subtask | null;
  onSave: (patch: { title: string; description: string; dueDate: string | null }) => Promise<void>;
  onClose: () => void;
}) => {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const [title, setTitle] = useState("");
  const [note, setNote] = useState("");
  const [due, setDue] = useState<Date | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!subtask) return;
    setTitle(subtask.title);
    setNote(subtask.description || "");
    setDue(subtask.dueDate ? new Date(subtask.dueDate) : null);
    setError(null);
  }, [subtask]);

  const save = async () => {
    if (!title.trim()) return setError("Give the item a title.");
    setSaving(true);
    try {
      await onSave({ title: title.trim(), description: note.trim(), dueDate: due ? due.toISOString() : null });
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't save.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal transparent visible={Boolean(subtask)} animationType="fade" onRequestClose={onClose}>
      <Pressable style={[styles.backdrop, { backgroundColor: colors.overlay }]} onPress={onClose}>
        <Pressable style={[styles.sheet, { backgroundColor: colors.surface, paddingBottom: insets.bottom + space.lg }]}>
          <Text variant="heading">Checklist item</Text>
          <Field label="Title" value={title} onChangeText={setTitle} maxLength={180} />
          <Field label="Note" value={note} onChangeText={setNote} placeholder="Optional" multiline maxLength={5000} />
          <DateTimeField label="Due" mode="date" value={due} onChange={setDue} clearable />
          <InlineError message={error} />
          <View style={styles.row}>
            <Button label="Cancel" variant="secondary" style={styles.flex} onPress={onClose} />
            <Button label="Save" icon="checkmark" style={styles.flex} loading={saving} onPress={save} />
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
};

const styles = StyleSheet.create({
  flex: { flex: 1 },
  backdrop: { flex: 1, justifyContent: "flex-end" },
  sheet: { borderTopLeftRadius: radius.xl, borderTopRightRadius: radius.xl, padding: space.lg, gap: space.md },
  row: { flexDirection: "row", gap: space.md },
});
