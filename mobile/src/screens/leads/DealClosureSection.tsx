import React from "react";
import { Linking, Pressable, StyleSheet, View } from "react-native";
import { mediaUrl } from "../../api/client";
import type { ClosureDocument } from "../../api/leads";
import { AttachButton } from "../../components/AttachButton";
import { fileKind, formatBytes } from "../../lib/uploadRules";
import { formatPrice, parseAmount } from "../../lib/money";
import { useTheme } from "../../theme/ThemeProvider";
import { space } from "../../theme/tokens";
import { Card, Field, Icon, Select, Text } from "../../ui";

export type DealDraft = {
  mode: string;
  paymentType: string;
  remaining: string;
  reference: string;
  note: string;
  documents: ClosureDocument[];
  brokerageReceived: string;
  brokerageAgreed: string;
  brokerageDistributed: string;
  brokerageSource: string;
};

export const PAYMENT_MODES = [
  { key: "UPI", label: "UPI" },
  { key: "CASH", label: "Cash" },
  { key: "CHECK", label: "Cheque" },
  { key: "NET_BANKING_NEFTRTGSIMPS", label: "Bank transfer" },
];

/* The payload the status endpoint expects, or a reason it isn't ready. */
export const dealPayload = (draft: DealDraft) => {
  if (!draft.mode) return { error: "Choose how the client paid." };
  if (!draft.paymentType) return { error: "Choose full or partial payment." };
  // The server needs a trail for anything but cash.
  if (draft.mode !== "CASH" && !draft.reference.trim()) return { error: "Enter the payment reference (UTR, transaction or cheque number)." };
  const remaining = draft.paymentType === "PARTIAL" ? parseAmount(draft.remaining) : 0;
  if (draft.paymentType === "PARTIAL" && !remaining) return { error: "Enter the amount still to be paid." };
  // The server refuses to close a deal without the brokerage received.
  const received = parseAmount(draft.brokerageReceived);
  if (received === null) return { error: "Enter the brokerage received (0 if none yet)." };
  const agreed = draft.brokerageAgreed.trim() ? parseAmount(draft.brokerageAgreed) : null;
  const distributed = draft.brokerageDistributed.trim() ? parseAmount(draft.brokerageDistributed) : 0;
  if (draft.brokerageAgreed.trim() && agreed === null) return { error: "Agreed brokerage should be a number." };
  if (distributed === null) return { error: "Brokerage distributed should be a number." };
  return {
    dealPayment: {
      mode: draft.mode,
      paymentType: draft.paymentType,
      remainingAmount: remaining,
      paymentReference: draft.reference.trim(),
      note: draft.note.trim(),
    },
    closureDocuments: draft.documents,
    brokerageReceived: received,
    brokerageDistributed: distributed,
    ...(agreed !== null ? { brokerageAgreed: agreed } : {}),
    ...(draft.brokerageSource ? { brokerageSource: draft.brokerageSource } : {}),
  };
};

export const DealClosureSection = ({
  draft,
  onChange,
  needsApproval,
}: {
  draft: DealDraft;
  onChange: (next: DealDraft) => void;
  needsApproval: boolean;
}) => {
  const { colors } = useTheme();
  const set = (patch: Partial<DealDraft>) => onChange({ ...draft, ...patch });
  const remaining = parseAmount(draft.remaining);

  return (
    <Card style={styles.gap}>
      <Text variant="heading">Deal payment</Text>
      {needsApproval ? (
        <Text variant="small" color="muted">
          Closing a deal goes to an admin to approve the payment. Until then the lead shows as Requested.
        </Text>
      ) : null}
      <View style={styles.pair}>
        <View style={styles.flex}>
          <Select label="Paid by" placeholder="Choose" options={PAYMENT_MODES.map((mode) => ({ key: mode.key, label: mode.label }))} value={draft.mode} onChange={(mode) => set({ mode })} />
        </View>
        <View style={styles.flex}>
          <Select
            label="Payment"
            placeholder="Choose"
            options={[
              { key: "FULL", label: "Paid in full" },
              { key: "PARTIAL", label: "Partly paid" },
            ]}
            value={draft.paymentType}
            onChange={(paymentType) => set({ paymentType })}
          />
        </View>
      </View>
      {draft.paymentType === "PARTIAL" ? (
        <Field label="Still to be paid" value={draft.remaining} onChangeText={(value) => set({ remaining: value })} placeholder="e.g. 2.5 lakh" hint={remaining ? formatPrice(remaining) : undefined} />
      ) : null}
      <Field
        label={draft.mode && draft.mode !== "CASH" ? "Reference *" : "Reference"}
        value={draft.reference}
        onChangeText={(value) => set({ reference: value })}
        placeholder={draft.mode === "CASH" ? "Optional" : "UTR / transaction / cheque no."}
        maxLength={120}
      />
      <Field label="Payment note" value={draft.note} onChangeText={(value) => set({ note: value })} placeholder="Optional" multiline maxLength={500} />

      <Text variant="heading">Brokerage</Text>
      <Select
        label="Paid by"
        placeholder="Not set"
        allowClear
        clearLabel="Not set"
        options={[
          { key: "TENANT", label: "Paid by tenant" },
          { key: "OWNER", label: "Paid by owner" },
          { key: "BOTH", label: "Both sides" },
        ]}
        value={draft.brokerageSource}
        onChange={(brokerageSource) => set({ brokerageSource })}
      />
      <Field label="Received *" value={draft.brokerageReceived} onChangeText={(value) => set({ brokerageReceived: value })} placeholder="e.g. 50k (0 if none yet)" hint={parseAmount(draft.brokerageReceived) ? formatPrice(parseAmount(draft.brokerageReceived)) : undefined} />
      <Field label="Agreed" value={draft.brokerageAgreed} onChangeText={(value) => set({ brokerageAgreed: value })} placeholder="Optional" hint={parseAmount(draft.brokerageAgreed) ? formatPrice(parseAmount(draft.brokerageAgreed)) : undefined} />
      <Field label="Distributed to team / partners" value={draft.brokerageDistributed} onChangeText={(value) => set({ brokerageDistributed: value })} placeholder="Optional" />

      <Text variant="smallStrong" color="muted">
        Closure documents
      </Text>
      {draft.documents.map((doc, index) => (
        <View key={`${doc.url}-${index}`} style={[styles.doc, { borderColor: colors.border }]}>
          <Icon name={doc.kind === "image" ? "image-outline" : doc.kind === "pdf" ? "document-text-outline" : "document-outline"} size={20} color={colors.primary} />
          <Pressable style={styles.flex} accessibilityRole="link" onPress={() => Linking.openURL(mediaUrl(doc.url) || doc.url)}>
            <Text variant="small" numberOfLines={1}>
              {doc.name || "Document"}
            </Text>
            {doc.size ? (
              <Text variant="tiny" color="faint">
                {formatBytes(doc.size)}
              </Text>
            ) : null}
          </Pressable>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`Remove ${doc.name || "document"}`}
            hitSlop={10}
            onPress={() => set({ documents: draft.documents.filter((_, i) => i !== index) })}
          >
            <Icon name="close-circle" size={20} color={colors.textFaint} />
          </Pressable>
        </View>
      ))}
      <AttachButton
        category="lead-documents"
        label="Attach agreement / receipt"
        onUploaded={(file) =>
          set({
            // The server stores closure documents as absolute links (it rejects a bare /api/... path).
            documents: [...draft.documents, { url: mediaUrl(file.url) || file.url, name: file.fileName, mimeType: file.mimeType, size: file.size, kind: fileKind(file.mimeType, file.fileName) }],
          })
        }
      />
    </Card>
  );
};

const styles = StyleSheet.create({
  flex: { flex: 1 },
  gap: { gap: space.md },
  pair: { flexDirection: "row", gap: space.sm },
  doc: { flexDirection: "row", alignItems: "center", gap: space.md, borderWidth: 1, borderRadius: 10, padding: space.sm },
});
