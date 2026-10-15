import React, { useLayoutEffect, useRef, useState } from "react";
import { Pressable, StyleSheet, TextInput, View } from "react-native";
import { BrokerPhoneHint } from "../../components/BrokerPhoneHint";
import { useTheme } from "../../theme/ThemeProvider";
import { PickerSheet } from "../../ui/PickerSheet";
import { errorMessage } from "../../api/client";
import { createLead } from "../../api/leads";
import { validateNewLead } from "../../lib/leadForm";
import type { RootScreenProps } from "../../navigation/types";
import { Body, Chip, Field, Icon, InlineError, Text } from "../../ui";

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
  const [pickingSource, setPickingSource] = useState(false);
  const { colors } = useTheme();
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

  useLayoutEffect(() => {
    navigation.setOptions({
      headerRight: () => (
        <Pressable accessibilityRole="button" onPress={save} disabled={saving} hitSlop={8}>
          <Text variant="bodyStrong" color="primary" style={styles.save}>
            {saving ? "Saving…" : "Save"}
          </Text>
        </Pressable>
      ),
    });
  });

  const sourceLabel = SOURCES.find((item) => item.key === sourceChannel)?.label;

  return (
    <View style={[styles.flex, { backgroundColor: colors.surface }]}>
      <Body style={{ backgroundColor: colors.surface }}>
        <Field
          label="Full name *"
          icon="person-outline"
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
          icon="call-outline"
          value={form.phone}
          onChangeText={set("phone")}
          placeholder="10-digit mobile number"
          keyboardType="phone-pad"
          returnKeyType="next"
          onSubmitEditing={() => emailRef.current?.focus()}
          error={touched ? errors.phone : undefined}
        />
        <BrokerPhoneHint phone={form.phone} />
        <Field
          ref={emailRef}
          label="Email"
          icon="mail-outline"
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
        <Field label="Company" icon="business-outline" value={form.company} onChangeText={set("company")} placeholder="Optional" />
        <View style={styles.group}>
          <Text variant="smallStrong" color="muted" style={styles.label}>
            Requirement
          </Text>
          <View style={styles.chips}>
            {REQUIREMENTS.map((item) => (
              <Chip key={item} label={item} selected={form.projectInterested === item} onPress={() => set("projectInterested")(form.projectInterested === item ? "" : item)} />
            ))}
          </View>
          <Field
            icon="resize-outline"
            value={REQUIREMENTS.includes(form.projectInterested) ? "" : form.projectInterested}
            onChangeText={set("projectInterested")}
            placeholder="Or describe it — seats, area, project"
          />
        </View>
        <Field ref={cityRef} label="City / locality" icon="location-outline" value={form.city} onChangeText={set("city")} placeholder="e.g. Sector 62, Noida" />
        <View style={styles.group}>
          <Text variant="smallStrong" color="muted" style={styles.label}>
            Source
          </Text>
          <Pressable onPress={() => setPickingSource(true)} style={[styles.select, { backgroundColor: colors.bg, borderColor: colors.border }]} accessibilityRole="button">
            <Text variant="body" color={sourceLabel ? colors.text : colors.textFaint} style={styles.selectText}>
              {sourceLabel || "Where did it come from?"}
            </Text>
            <Icon name="chevron-down" size={15} color={colors.textFaint} />
          </Pressable>
        </View>
        <View style={styles.group}>
          <Text variant="smallStrong" color="muted" style={styles.label}>
            How warm is it?
          </Text>
          <View style={styles.chips}>
            {TEMPERATURES.map((item) => (
              <Chip key={item.key} label={item.label} tone={item.key === "HOT" ? "danger" : item.key === "WARM" ? "warning" : "primary"} selected={temperature === item.key} onPress={() => setTemperature(item.key)} />
            ))}
          </View>
        </View>
        <InlineError message={error} />
      </Body>
      <PickerSheet
        visible={pickingSource}
        title="Source"
        items={SOURCES.map((item) => ({ key: item.key, label: item.label }))}
        selected={sourceChannel}
        onPick={(key) => {
          setSourceChannel(key);
          setPickingSource(false);
        }}
        onClose={() => setPickingSource(false)}
      />
    </View>
  );
};

const REQUIREMENTS = ["Private cabin", "Managed office", "Coworking", "Bare shell", "Virtual office"];

const styles = StyleSheet.create({
  flex: { flex: 1 },
  save: { fontFamily: "PlusJakartaSans_800ExtraBold" },
  group: { gap: 6 },
  label: { fontSize: 11.5 },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  select: { height: 46, borderRadius: 13, borderWidth: 1, paddingHorizontal: 13, flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  selectText: { fontFamily: "PlusJakartaSans_500Medium" },
});
