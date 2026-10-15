import React, { useState } from "react";
import { ActivityIndicator, Platform, Pressable, StyleSheet } from "react-native";
import { useTheme } from "../theme/ThemeProvider";
import { errorMessage } from "../api/client";
import { pickDocument, pickImage, uploadFile, type UploadCategory, type UploadedFile } from "../api/uploads";
import { ActionSheet, type SheetAction } from "../ui/ActionSheet";
import { Button, Icon, InlineError } from "../ui";

/*
 * "Attach" -> camera / photo library / document, uploaded straight away.
 * The caller gets the server's record of the file and decides where it goes.
 */
export const AttachButton = ({
  category,
  label = "Attach",
  imagesOnly,
  onUploaded,
  disabled,
  compact,
  renderTrigger,
  extraActions = [],
}: {
  category: UploadCategory;
  label?: string;
  imagesOnly?: boolean;
  onUploaded: (file: UploadedFile) => void | Promise<void>;
  disabled?: boolean;
  /* A 44px rounded "+" square for chat-style composers. */
  compact?: boolean;
  /* Draw your own trigger (e.g. the camera badge on an avatar). */
  renderTrigger?: (open: () => void, busy: boolean) => React.ReactNode;
  /* Extra rows for the sheet, e.g. "View photo" / "Remove photo". */
  extraActions?: SheetAction[];
}) => {
  const { colors } = useTheme();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const run = async (pick: () => Promise<Awaited<ReturnType<typeof pickDocument>>>) => {
    setError(null);
    try {
      const file = await pick();
      if (!file) return;
      setBusy(true);
      const uploaded = await uploadFile(file, category);
      await onUploaded(uploaded);
    } catch (err) {
      setError(errorMessage(err, "Couldn't attach that file."));
    } finally {
      setBusy(false);
    }
  };

  const actions = [
    // A browser preview has no camera picker; phones do.
    ...(Platform.OS === "web" ? [] : [{ key: "camera", label: "Take a photo", icon: "camera-outline" as const, onPress: () => run(() => pickImage("camera")) }]),
    { key: "library", label: "Choose a photo", icon: "image-outline" as const, onPress: () => run(() => pickImage("library")) },
    ...(imagesOnly ? [] : [{ key: "doc", label: "Choose a document", icon: "document-attach-outline" as const, hint: "PDF, Word, Excel", onPress: () => run(pickDocument) }]),
    ...extraActions,
  ];

  if (renderTrigger) {
    return (
      <>
        {renderTrigger(() => setOpen(true), busy)}
        {error ? <InlineError message={error} /> : null}
        <ActionSheet visible={open} title={label} actions={actions} onClose={() => setOpen(false)} />
      </>
    );
  }

  if (compact) {
    return (
      <>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Attach a file"
          disabled={disabled || busy}
          onPress={() => setOpen(true)}
          style={[styles.compact, { backgroundColor: colors.bg }]}
        >
          {busy ? <ActivityIndicator color={colors.primary} /> : <Icon name="add" size={22} color={colors.textMuted} />}
        </Pressable>
        {error ? <InlineError message={error} /> : null}
        <ActionSheet visible={open} title="Attach" actions={actions} onClose={() => setOpen(false)} />
      </>
    );
  }

  return (
    <>
      <Button label={busy ? "Uploading…" : label} icon="attach" variant="secondary" size="sm" loading={busy} disabled={disabled} onPress={() => setOpen(true)} />
      <InlineError message={error} />
      <ActionSheet visible={open} title={label} actions={actions} onClose={() => setOpen(false)} />
    </>
  );
};

const styles = StyleSheet.create({
  compact: { width: 40, height: 44, borderRadius: 13, alignItems: "center", justifyContent: "center" },
});
