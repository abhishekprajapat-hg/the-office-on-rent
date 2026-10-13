import React, { useRef, useState } from "react";
import { StyleSheet, TextInput, View } from "react-native";
import { errorMessage } from "../../api/client";
import { createLead } from "../../api/leads";
import { validateNewLead } from "../../lib/leadForm";
import type { RootScreenProps } from "../../navigation/types";
import { space } from "../../theme/tokens";
import { Body, Button, Card, Chip, Field, InlineError, Text } from "../../ui";

const SOURCES = [
  { key: "DIRECT_CALL", label: "Direct call" },
  { key: "DIRECT_VISIT", label: "Walk-in" },
  { key: "REFERENCE", label: "Reference" },
  { key: "BROKER", label: "Broker" },
  { key: "WEBSITE", label: "Website" },
  { key: "JUSTDIAL", label: "JustDial" },
  { key: "99ACRES", label: "99acres" },
  { key: "MYBRICKS", label: "MyBricks" },
  { key: "OLX", label: "OLX" },
];

const TEMPERATURES = [
  { key: "HOT", label: "Hot" },
  { key: "WARM", label: "Warm" },
  { key: "COLD", label: "Cold" },
];

export const AddLeadScreen = ({ navigation }: RootScreenProps<"AddLead">) => {
  const [form, setForm] = useState({ name: "", phone: "", email: "", city: "", company: "", projectInterested: "" });
  const [sourceChannel, setSourceChannel] = useState("");
  const [temperature, setTemperature] = useState("WARM");
  const [touched, setTouched] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const phoneRef = useRef<TextInput>(null);
  const emailRef = useRef<TextInput>(null);
  const cityRef = useRef<TextInput>(null);

  const errors = validateNewLead(form);
  const set = (key: keyof typeof form) => (value: string) => setForm((prev) => ({ ...prev, [key]: value }));

  const save = async () => {
    setTouched(true);
    if (Object.keys(errors).length) return;
    setSaving(true);
    setError(null);
    try {
      const lead = await createLead({
        name: form.name.trim(),
        phone: form.phone.replace(/[^\d+]/g, ""),
        email: form.email.trim() || undefined,
        city: form.city.trim() || undefined,
        company: form.company.trim() || undefined,
        projectInterested: form.projectInterested.trim() || undefined,
        sourceChannel: sourceChannel || undefined,
        temperature,
      });
      if (lead?._id) navigation.replace("LeadDetail", { leadId: lead._id, name: lead.name });
      else navigation.goBack();
    } catch (err) {
      setError(errorMessage(err));
      setSaving(false);
    }
  };

  return (
    <Body>
      <Card style={styles.gap}>
        <Field
          label="Name *"
          value={form.name}
          onChangeText={set("name")}
          placeholder="Client's full name"
          autoCapitalize="words"
          returnKeyType="next"
          onSubmitEditing={() => phoneRef.current?.focus()}
          error={touched ? errors.name : undefined}
        />
        <Field
          ref={phoneRef}
          label="Phone *"
          value={form.phone}
          onChangeText={set("phone")}
          placeholder="10-digit mobile number"
          keyboardType="phone-pad"
          returnKeyType="next"
          onSubmitEditing={() => emailRef.current?.focus()}
          error={touched ? errors.phone : undefined}
        />
        <Field
          ref={emailRef}
          label="Email"
          value={form.email}
          onChangeText={set("email")}
          placeholder="name@example.com"
          keyboardType="email-address"
          autoCapitalize="none"
          autoCorrect={false}
          returnKeyType="next"
          onSubmitEditing={() => cityRef.current?.focus()}
          error={touched ? errors.email : undefined}
        />
        <Field ref={cityRef} label="City / locality" value={form.city} onChangeText={set("city")} placeholder="e.g. Gurugram" />
        <Field label="Company" value={form.company} onChangeText={set("company")} placeholder="Optional" />
        <Field label="Project interested" value={form.projectInterested} onChangeText={set("projectInterested")} placeholder="Optional" />
      </Card>

      <Card style={styles.gap}>
        <Text variant="heading">How warm is it?</Text>
        <View style={styles.chips}>
          {TEMPERATURES.map((item) => (
            <Chip key={item.key} label={item.label} selected={temperature === item.key} onPress={() => setTemperature(item.key)} />
          ))}
        </View>
        <Text variant="heading">Where did it come from?</Text>
        <View style={styles.chips}>
          {SOURCES.map((item) => (
            <Chip
              key={item.key}
              label={item.label}
              selected={sourceChannel === item.key}
              onPress={() => setSourceChannel((current) => (current === item.key ? "" : item.key))}
            />
          ))}
        </View>
      </Card>

      <InlineError message={error} />
      <Button label="Add lead" icon="person-add" onPress={save} loading={saving} />
    </Body>
  );
};

const styles = StyleSheet.create({
  gap: { gap: space.md },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: space.sm },
});
