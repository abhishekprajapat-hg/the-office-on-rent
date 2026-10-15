import React, { useState, useSyncExternalStore } from "react";
import { errorMessage } from "../api/client";
import { openLeadRoom, sendMessage } from "../api/chat";
import { pickImage, uploadFile } from "../api/uploads";
import { useLeadSearch } from "../lib/useLeadSearch";
import { Button, InlineError, Sheet, Text } from "../ui";
import { PickerSheet } from "../ui/PickerSheet";

/*
 * "Site photos" (Field executive): pick the lead, take a photo, and it lands
 * in that lead's team chat - where the manager and the rest of the team see it.
 */
let visible = false;
const listeners = new Set<() => void>();
const set = (next: boolean) => {
  visible = next;
  listeners.forEach((listener) => listener());
};
export const openSitePhoto = () => set(true);
const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};

export const SitePhotoFlow = () => {
  const open = useSyncExternalStore(subscribe, () => visible, () => visible);
  const { leads, search } = useLeadSearch(open);
  const [lead, setLead] = useState<{ _id: string; name: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);

  const shoot = async (source: "camera" | "library") => {
    if (!lead) return;
    setBusy(true);
    setError(null);
    try {
      const file = await pickImage(source);
      if (!file) return setBusy(false);
      const uploaded = await uploadFile(file, "chat");
      const room = await openLeadRoom(lead._id);
      if (!room) throw new Error("Couldn't open the lead's chat.");
      await sendMessage(room._id, "Site photo", { mediaAttachments: [{ url: uploaded.url, name: uploaded.fileName, mimeType: uploaded.mimeType, size: uploaded.size }] });
      setDone(`Photo shared in ${lead.name}'s team chat.`);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  const close = () => {
    set(false);
    setLead(null);
    setError(null);
    setDone(null);
  };

  return (
    <>
      <PickerSheet
        visible={open && !lead}
        title="Site photo for…"
        subtitle="The photo goes to the lead's team chat."
        searchPlaceholder="Search leads by name or phone"
        onSearch={search}
        items={(leads || []).map((item) => ({ key: item._id, label: item.name, sub: [item.projectInterested, item.phone].filter(Boolean).join(" · "), avatar: true }))}
        onPick={(key) => {
          const found = (leads || []).find((item) => item._id === key);
          if (found) setLead({ _id: found._id, name: found.name });
        }}
        onClose={close}
      />
      <Sheet
        visible={open && Boolean(lead)}
        title={lead ? `Photo for ${lead.name}` : ""}
        subtitle={done || "Take one now or choose from the gallery."}
        onClose={close}
        footer={
          done ? (
            <Button label="Done" icon="checkmark" onPress={close} />
          ) : (
            <>
              <Button label="Take photo" icon="camera" loading={busy} onPress={() => shoot("camera")} />
              <Button label="From gallery" icon="images" variant="secondary" disabled={busy} onPress={() => shoot("library")} />
            </>
          )
        }
      >
        {done ? (
          <Text variant="small" color="muted">
            Take another from the same button any time.
          </Text>
        ) : null}
        <InlineError message={error} />
      </Sheet>
    </>
  );
};
