import React, { useState } from "react";
import { StyleSheet, View } from "react-native";
import { errorMessage } from "../../api/client";
import { createCwClient } from "../../api/coworking";
import type { RootScreenProps } from "../../navigation/types";
import { Body, Button, Chip, Field, InlineError, Text } from "../../ui";

const TYPES = ["INDIVIDUAL", "FREELANCER", "STARTUP", "SME", "ENTERPRISE", "OTHER"];

export const AddClientScreen = ({ navigation }: RootScreenProps<"AddClient">) => {
  const [form, setForm] = useState({ companyName: "", contactPerson: "", phone: "", email: "", gstNumber: "", industry: "" });
  const [type, setType] = useState("STARTUP");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const set = (key: keyof typeof form) => (value: string) => setForm((prev) => ({ ...prev, [key]: value }));

  const save = async () => {
    if (!form.companyName.trim()) return setError("Enter the company or person's name.");
    if (!form.contactPerson.trim()) return setError("Enter a contact person.");
    if (form.phone.replace(/\D/g, "").length < 10) return setError("Enter a 10-digit phone number.");
    setSaving(true);
    setError(null);
    try {
      const client = await createCwClient({
        companyName: form.companyName.trim(),
        contactPerson: form.contactPerson.trim(),
        phone: form.phone.replace(/[^\d+]/g, ""),
        email: form.email.trim() || undefined,
        gstNumber: form.gstNumber.trim().toUpperCase() || undefined,
        industry: form.industry.trim() || undefined,
        clientType: type,
        status: "ACTIVE",
      });
      if (client?._id) navigation.replace("ClientDetail", { id: client._id });
      else navigation.goBack();
    } catch (err) {
      setError(errorMessage(err));
      setSaving(false);
    }
  };

  return (
    <Body>
      <Field label="Company / name" icon="business-outline" value={form.companyName} onChangeText={set("companyName")} placeholder="e.g. Joshi Exports" autoCapitalize="words" />
      <Field label="Contact person" icon="person-outline" value={form.contactPerson} onChangeText={set("contactPerson")} placeholder="Who signs" autoCapitalize="words" />
      <Field label="Phone" icon="call-outline" value={form.phone} onChangeText={set("phone")} keyboardType="phone-pad" placeholder="98100 12345" />
      <Field label="Email" icon="mail-outline" value={form.email} onChangeText={set("email")} keyboardType="email-address" autoCapitalize="none" placeholder="Optional" />
      <Text variant="smallStrong" color="muted">
        Type
      </Text>
      <View style={styles.chips}>
        {TYPES.map((key) => (
          <Chip key={key} label={key === "SME" ? "SME" : key.charAt(0) + key.slice(1).toLowerCase()} selected={type === key} onPress={() => setType(key)} />
        ))}
      </View>
      <Field label="GST number" value={form.gstNumber} onChangeText={set("gstNumber")} autoCapitalize="characters" placeholder="Optional" />
      <Field label="Industry" value={form.industry} onChangeText={set("industry")} placeholder="Optional" />
      <InlineError message={error} />
      <Button label="Add client" icon="person-add" loading={saving} onPress={save} />
    </Body>
  );
};

const styles = StyleSheet.create({
  chips: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
});
