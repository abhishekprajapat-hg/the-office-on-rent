import React, { useState } from "react";
import { Image, Pressable, StyleSheet, TextInput, View } from "react-native";
import { useNavigation } from "@react-navigation/native";
import { errorMessage, mediaUrl } from "../../api/client";
import { createEntry, EXPENSE_CATEGORIES, INCOME_CATEGORIES, PAYMENT_METHODS } from "../../api/finance";
import type { UploadedFile } from "../../api/uploads";
import { AttachButton } from "../../components/AttachButton";
import { DateTimeField } from "../../components/DateTimeField";
import { parseAmount } from "../../lib/money";
import { useTheme } from "../../theme/ThemeProvider";
import { font } from "../../theme/tokens";
import { Body, Button, Field, FooterBar, Icon, InlineError, Segmented, Text } from "../../ui";
import { PickerSheet } from "../../ui/PickerSheet";

const human = (value: string) => value.replace(/_/g, " ").toLowerCase().replace(/^\w/, (c) => c.toUpperCase());

/* Design 29 - amount, mode, type, proof. Saves through POST /finance/entries like the web's Add entry. */
export const RecordPaymentScreen = () => {
  const navigation = useNavigation();
  const { colors } = useTheme();
  const [kind, setKind] = useState<"INCOME" | "EXPENSE">("INCOME");
  const [amount, setAmount] = useState("");
  const [method, setMethod] = useState("UPI");
  const [category, setCategory] = useState<string>("SECURITY_DEPOSIT");
  const [picking, setPicking] = useState(false);
  const [party, setParty] = useState("");
  const [title, setTitle] = useState("");
  const [reference, setReference] = useState("");
  const [notes, setNotes] = useState("");
  const [date, setDate] = useState<Date | null>(new Date());
  const [paid, setPaid] = useState(true);
  const [receipts, setReceipts] = useState<UploadedFile[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const categories = kind === "INCOME" ? INCOME_CATEGORIES : EXPENSE_CATEGORIES;
  const value = parseAmount(amount);

  const save = async () => {
    if (!value || value <= 0) return setError("Enter the amount.");
    setSaving(true);
    setError(null);
    try {
      await createEntry({
        kind,
        amount: value,
        method,
        category,
        title: title.trim() || (kind === "INCOME" ? human(category) : human(category)),
        party: party.trim(),
        reference: reference.trim(),
        notes: notes.trim(),
        date: (date || new Date()).toISOString(),
        status: kind === "EXPENSE" ? (paid ? "PAID" : "PENDING") : undefined,
        receipts: receipts.map((file) => ({ name: file.fileName, fileUrl: file.url, fileType: file.mimeType })),
      });
      navigation.goBack();
    } catch (err) {
      setError(errorMessage(err));
      setSaving(false);
    }
  };

  return (
    <View style={[styles.flex, { backgroundColor: colors.surface }]}>
      <Body style={[styles.body, { backgroundColor: colors.surface }]} footerSpace>
        <Segmented
          options={[
            { key: "INCOME", label: "Money in" },
            { key: "EXPENSE", label: "Money out" },
          ]}
          value={kind}
          onChange={(next) => {
            setKind(next);
            setCategory(next === "INCOME" ? "SECURITY_DEPOSIT" : "OTHER");
          }}
        />

        <View style={styles.amountBlock}>
          <Text variant="smallStrong" color="muted">
            {kind === "INCOME" ? "Amount received" : "Amount paid"}
          </Text>
          <View style={styles.amountRow}>
            <Text style={[styles.amountText, { color: colors.text }]}>₹</Text>
            <TextInput
              value={amount}
              onChangeText={setAmount}
              keyboardType="decimal-pad"
              placeholder="0"
              placeholderTextColor={colors.textFaint}
              style={[styles.amountText, styles.amountInput, { color: colors.text }]}
              accessibilityLabel="Amount"
            />
          </View>
          <TextInput
            value={party}
            onChangeText={setParty}
            placeholder={kind === "INCOME" ? "Received from (client, lead or company)" : "Paid to (vendor)"}
            placeholderTextColor={colors.textFaint}
            style={[styles.party, { color: colors.textMuted }]}
          />
        </View>

        <View style={styles.group}>
          <Text variant="smallStrong" color="muted" style={styles.label}>
            Mode
          </Text>
          <View style={styles.modes}>
            {PAYMENT_METHODS.map((item) => {
              const on = method === item.key;
              return (
                <Pressable
                  key={item.key}
                  onPress={() => setMethod(item.key)}
                  accessibilityRole="radio"
                  accessibilityState={{ selected: on }}
                  style={[styles.mode, { backgroundColor: on ? colors.primarySoft : colors.surface, borderColor: on ? colors.primary : colors.border }]}
                >
                  <Icon name={item.icon} size={18} color={on ? colors.primary : colors.text} />
                  <Text variant="smallStrong" color={on ? colors.primary : colors.text} style={styles.modeLabel}>
                    {item.label}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </View>

        <View style={styles.group}>
          <Text variant="smallStrong" color="muted" style={styles.label}>
            {kind === "INCOME" ? "Payment type" : "Category"}
          </Text>
          <Pressable onPress={() => setPicking(true)} style={[styles.select, { backgroundColor: colors.bg, borderColor: colors.border }]} accessibilityRole="button">
            <Text variant="body" style={styles.selectText}>
              {human(category)}
            </Text>
            <Icon name="chevron-down" size={15} color={colors.textFaint} />
          </Pressable>
        </View>

        <Field label="Title" value={title} onChangeText={setTitle} placeholder={kind === "INCOME" ? "e.g. Deposit for Aerocity One" : "e.g. Office supplies"} />
        <DateTimeField label="Date" mode="date" value={date} onChange={setDate} />
        <Field label="Reference" value={reference} onChangeText={setReference} placeholder="UTR, cheque or transaction number" autoCapitalize="characters" />

        <View style={styles.group}>
          <Text variant="smallStrong" color="muted" style={styles.label}>
            Proof
          </Text>
          <AttachButton
            category="lead-documents"
            onUploaded={(file) => setReceipts((list) => [...list, file])}
            renderTrigger={(open, busy) => (
              <Pressable onPress={open} accessibilityRole="button" style={[styles.proof, { backgroundColor: colors.primarySoft, borderColor: colors.primary }]}>
                <Icon name="camera-outline" size={22} color={colors.primary} />
                <Text variant="smallStrong" color={colors.primary}>
                  {busy ? "Uploading…" : receipts.length ? `${receipts.length} attached · add another` : "Snap receipt or UTR screenshot"}
                </Text>
              </Pressable>
            )}
          />
          {receipts.length ? (
            <View style={styles.thumbs}>
              {receipts.map((file) => (
                <Pressable key={file.url} onLongPress={() => setReceipts((list) => list.filter((item) => item.url !== file.url))}>
                  {file.mimeType.startsWith("image/") ? (
                    <Image source={{ uri: mediaUrl(file.url) }} style={styles.thumb} />
                  ) : (
                    <View style={[styles.thumb, styles.fileThumb, { backgroundColor: colors.surfaceAlt }]}>
                      <Icon name="document" size={20} color={colors.textMuted} />
                    </View>
                  )}
                </Pressable>
              ))}
            </View>
          ) : null}
        </View>

        {kind === "EXPENSE" ? (
          <Segmented
            options={[
              { key: "PAID", label: "Already paid" },
              { key: "PENDING", label: "To be paid" },
            ]}
            value={paid ? "PAID" : "PENDING"}
            onChange={(next) => setPaid(next === "PAID")}
          />
        ) : null}
        <Field label="Notes" value={notes} onChangeText={setNotes} placeholder="Optional" multiline />
        <InlineError message={error} />
      </Body>
      <FooterBar>
        <Button label={kind === "INCOME" ? "Save payment" : "Save expense"} style={styles.flex} loading={saving} onPress={save} />
      </FooterBar>
      <PickerSheet
        visible={picking}
        title={kind === "INCOME" ? "Payment type" : "Category"}
        items={categories.map((key) => ({ key, label: human(key) }))}
        selected={category}
        onPick={(key) => {
          setCategory(key);
          setPicking(false);
        }}
        onClose={() => setPicking(false)}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  flex: { flex: 1 },
  body: { gap: 16, paddingTop: 18 },
  amountBlock: { alignItems: "center", gap: 4, paddingVertical: 6 },
  amountRow: { flexDirection: "row", alignItems: "center" },
  amountText: { fontFamily: font.extrabold, fontSize: 40, letterSpacing: -1.2 },
  amountInput: { minWidth: 60, textAlign: "center", padding: 0 },
  party: { fontFamily: font.regular, fontSize: 12, textAlign: "center", minWidth: 240, padding: 0 },
  group: { gap: 8 },
  label: { fontSize: 11.5 },
  modes: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  mode: { width: "23.5%", flexGrow: 1, borderWidth: 1.5, borderRadius: 13, paddingVertical: 10, alignItems: "center", gap: 4 },
  modeLabel: { fontSize: 11.5 },
  select: { height: 46, borderRadius: 13, borderWidth: 1, paddingHorizontal: 13, flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  selectText: { fontFamily: font.semibold },
  proof: { height: 84, borderRadius: 14, borderWidth: 1.5, borderStyle: "dashed", alignItems: "center", justifyContent: "center", gap: 4 },
  thumbs: { flexDirection: "row", gap: 8, flexWrap: "wrap" },
  thumb: { width: 56, height: 56, borderRadius: 10 },
  fileThumb: { alignItems: "center", justifyContent: "center" },
});
