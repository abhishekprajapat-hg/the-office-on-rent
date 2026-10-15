import React, { useState } from "react";
import { StyleSheet, View } from "react-native";
import { errorMessage } from "../../api/client";
import { createUser } from "../../api/admin";
import { useUser } from "../../auth/AuthProvider";
import { ROLE_LABELS } from "../../lib/roles";
import type { RootScreenProps } from "../../navigation/types";
import { Body, Button, Chip, Field, InlineError, Text } from "../../ui";

const ROLES = ["EXECUTIVE", "FIELD_EXECUTIVE", "INSIDE_EXECUTIVE", "MANAGER", "PRODUCTION_EXECUTIVE", "COMMUNITY_MANAGER", "CHANNEL_PARTNER", "COWORKING_ADMIN"];

export const AddUserScreen = ({ navigation }: RootScreenProps<"AddUser">) => {
  const me = useUser();
  const [form, setForm] = useState({ name: "", email: "", phone: "", password: "" });
  const [role, setRole] = useState("EXECUTIVE");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const set = (key: keyof typeof form) => (value: string) => setForm((prev) => ({ ...prev, [key]: value }));
  const roles = ROLES.filter((key) => me.role === "ADMIN" || key !== "MANAGER");

  const save = async () => {
    if (form.name.trim().length < 2) return setError("Enter their full name.");
    if (!/^\S+@\S+\.\S+$/.test(form.email.trim())) return setError("Enter a valid email; it's their sign-in.");
    if (form.phone.replace(/\D/g, "").length < 10) return setError("Enter a 10-digit phone number.");
    if (form.password.length < 6) return setError("The temporary password needs at least 6 characters.");
    setSaving(true);
    setError(null);
    try {
      await createUser({ name: form.name.trim(), email: form.email.trim().toLowerCase(), phone: form.phone.replace(/[^\d+]/g, ""), role, password: form.password });
      navigation.goBack();
    } catch (err) {
      setError(errorMessage(err));
      setSaving(false);
    }
  };

  return (
    <Body>
      <Field label="Full name" icon="person-outline" value={form.name} onChangeText={set("name")} autoCapitalize="words" placeholder="e.g. Rahul Verma" />
      <Field label="Work email" icon="mail-outline" value={form.email} onChangeText={set("email")} keyboardType="email-address" autoCapitalize="none" placeholder="name@theofficeonrent.com" />
      <Field label="Phone" icon="call-outline" value={form.phone} onChangeText={set("phone")} keyboardType="phone-pad" placeholder="98100 12345" />
      <Text variant="smallStrong" color="muted">
        Role
      </Text>
      <View style={styles.chips}>
        {roles.map((key) => (
          <Chip key={key} label={ROLE_LABELS[key as keyof typeof ROLE_LABELS]} selected={role === key} onPress={() => setRole(key)} />
        ))}
      </View>
      <Field label="Temporary password" value={form.password} onChangeText={set("password")} secure autoCapitalize="none" hint="Share it privately; they can change it after signing in." />
      <InlineError message={error} />
      <Button label="Create account" icon="person-add" loading={saving} onPress={save} />
    </Body>
  );
};

const styles = StyleSheet.create({
  chips: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
});
