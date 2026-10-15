import React, { useState } from "react";
import { Linking, Pressable, StyleSheet, View } from "react-native";
import { errorMessage, mediaUrl } from "../../api/client";
import { pickDocument, pickImage, uploadFile, type LocalFile } from "../../api/uploads";
import type { BoardDocument } from "../../lib/coworkingBoard";
import { documentRecord, documentsFor, formatBytes, groupsOf, kycStatusOf, withDocument, type DocSpec } from "../../lib/coworkingKyc";
import { useTheme } from "../../theme/ThemeProvider";
import { ActionSheet, Icon, InlineError, Text } from "../../ui";

/*
 * The KYC checklist (web DocumentChecklist), used while onboarding and on the
 * client's profile. It never blocks onboarding: it states what is outstanding
 * and the client carries that state. Files go to the server, so every desk and
 * device can open them.
 */
export const DocumentChecklist = ({
  kind,
  documents,
  onChange,
  readOnly,
}: {
  kind: string;
  documents: BoardDocument[];
  onChange?: (documents: BoardDocument[]) => void | Promise<unknown>;
  readOnly?: boolean;
}) => {
  const { colors } = useTheme();
  const [picking, setPicking] = useState<DocSpec | null>(null);
  const [uploading, setUploading] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const status = kycStatusOf({ kind, documents });
  const byKey = new Map(documents.map((doc) => [doc.key, doc]));

  const attach = async (spec: DocSpec, pick: () => Promise<LocalFile | null>) => {
    setError(null);
    try {
      const file = await pick();
      if (!file) return;
      setUploading(spec.key);
      const saved = await uploadFile(file, "coworking-documents");
      await onChange?.(withDocument(documents, spec.key, documentRecord(spec, saved)));
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setUploading(null);
    }
  };

  return (
    <View style={styles.wrap}>
      <View style={[styles.banner, { backgroundColor: status.complete ? colors.successSoft : colors.warningSoft }]}>
        <Icon name={status.complete ? "checkmark-circle" : "alert-circle"} size={18} color={status.complete ? colors.success : colors.warning} />
        <View style={styles.flex}>
          <Text variant="smallStrong" color={status.complete ? colors.success : colors.warning}>
            {status.complete ? "KYC complete" : `${status.uploaded} of ${status.required} required documents`}
          </Text>
          {!status.complete ? (
            <Text variant="tiny" color={colors.warning}>
              Still needed: {status.missing.map((doc) => doc.label).join(", ")}.
            </Text>
          ) : null}
        </View>
      </View>
      <InlineError message={error} />

      {groupsOf(documentsFor(kind)).map(({ group, docs }) => (
        <View key={group} style={styles.group}>
          <Text variant="tiny" color="muted" style={styles.groupLabel}>
            {group.toUpperCase()}
          </Text>
          {docs.map((spec) => {
            const held = byKey.get(spec.key);
            const url = held?.url ? mediaUrl(held.url) || held.url : null;
            return (
              <View
                key={spec.key}
                style={[
                  styles.row,
                  { borderColor: held ? colors.success : colors.border, backgroundColor: held ? colors.successSoft : colors.surface, borderStyle: spec.required || held ? "solid" : "dashed" },
                ]}
              >
                <Icon name={held ? "checkmark-circle" : "attach-outline"} size={18} color={held ? colors.success : colors.textFaint} />
                <View style={styles.flex}>
                  <Text variant="smallStrong">
                    {spec.label} <Text variant="tiny" color="faint">{spec.required ? "Required" : "Optional"}</Text>
                  </Text>
                  {spec.hint ? (
                    <Text variant="tiny" color="muted">
                      {spec.hint}
                    </Text>
                  ) : null}
                  {held ? (
                    <View style={styles.file}>
                      <Text variant="tiny" color="muted" numberOfLines={1} style={styles.fileName}>
                        {held.fileName} {formatBytes(held.size)}
                      </Text>
                      {url ? (
                        <Pressable accessibilityRole="link" onPress={() => Linking.openURL(url)} hitSlop={6}>
                          <Text variant="tiny" color="primary">
                            Open
                          </Text>
                        </Pressable>
                      ) : (
                        <Text variant="tiny" color={colors.warning}>
                          On the web device only
                        </Text>
                      )}
                    </View>
                  ) : null}
                </View>
                {!readOnly ? (
                  <View style={styles.actions}>
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel={`${held ? "Replace" : "Upload"} ${spec.label}`}
                      disabled={Boolean(uploading)}
                      onPress={() => setPicking(spec)}
                      style={[styles.button, { borderColor: colors.border }]}
                    >
                      <Text variant="tiny" color={uploading === spec.key ? colors.textFaint : colors.primary}>
                        {uploading === spec.key ? "Uploading…" : held ? "Replace" : "Upload"}
                      </Text>
                    </Pressable>
                    {held ? (
                      <Pressable accessibilityRole="button" accessibilityLabel={`Remove ${spec.label}`} hitSlop={6} disabled={Boolean(uploading)} onPress={() => onChange?.(withDocument(documents, spec.key, null))}>
                        <Icon name="close" size={16} color={colors.textFaint} />
                      </Pressable>
                    ) : null}
                  </View>
                ) : null}
              </View>
            );
          })}
        </View>
      ))}

      <ActionSheet
        visible={Boolean(picking)}
        title={picking?.label}
        onClose={() => setPicking(null)}
        actions={
          picking
            ? [
                { key: "camera", label: "Take a photo", icon: "camera-outline", onPress: () => attach(picking, () => pickImage("camera")) },
                { key: "library", label: "Photo from gallery", icon: "image-outline", onPress: () => attach(picking, () => pickImage("library")) },
                { key: "file", label: "PDF or file", icon: "document-outline", onPress: () => attach(picking, pickDocument) },
              ]
            : []
        }
      />
    </View>
  );
};

const styles = StyleSheet.create({
  flex: { flex: 1, minWidth: 0 },
  wrap: { gap: 10 },
  banner: { flexDirection: "row", gap: 8, alignItems: "flex-start", padding: 10, borderRadius: 12 },
  group: { gap: 6 },
  groupLabel: { letterSpacing: 0.6, fontFamily: "PlusJakartaSans_700Bold" },
  row: { flexDirection: "row", alignItems: "flex-start", gap: 10, padding: 10, borderRadius: 12, borderWidth: 1 },
  file: { flexDirection: "row", alignItems: "center", gap: 8, marginTop: 2 },
  fileName: { flexShrink: 1 },
  actions: { flexDirection: "row", alignItems: "center", gap: 8 },
  button: { borderWidth: 1, borderRadius: 8, paddingHorizontal: 8, paddingVertical: 4 },
});
