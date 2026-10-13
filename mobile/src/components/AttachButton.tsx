import React, { useState } from "react";
import { Platform } from "react-native";
import { errorMessage } from "../api/client";
import { pickDocument, pickImage, uploadFile, type UploadCategory, type UploadedFile } from "../api/uploads";
import { ActionSheet } from "../ui/ActionSheet";
import { Button, InlineError } from "../ui";

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
}: {
  category: UploadCategory;
  label?: string;
  imagesOnly?: boolean;
  onUploaded: (file: UploadedFile) => void | Promise<void>;
  disabled?: boolean;
}) => {
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
  ];

  return (
    <>
      <Button label={busy ? "Uploading…" : label} icon="attach" variant="secondary" size="sm" loading={busy} disabled={disabled} onPress={() => setOpen(true)} />
      <InlineError message={error} />
      <ActionSheet visible={open} title={label} actions={actions} onClose={() => setOpen(false)} />
    </>
  );
};
