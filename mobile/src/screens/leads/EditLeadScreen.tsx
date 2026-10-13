import React, { useEffect, useState } from "react";
import { StyleSheet, View } from "react-native";
import { errorMessage } from "../../api/client";
import { getLeadDetail, updateLeadBasics, updateLeadDetails, type LeadDetail } from "../../api/leads";
import { validateNewLead } from "../../lib/leadForm";
import { leadTemperature } from "../../lib/leadStatus";
import type { RootScreenProps } from "../../navigation/types";
import { space } from "../../theme/tokens";
import { Body, Button, Card, Chip, ErrorState, Field, InlineError, Loading, Text } from "../../ui";

const SOURCES = [
  { key: "", label: "Not set" },
  { key: "DIRECT_CALL", label: "Direct call" },
  { key: "DIRECT_VISIT", label: "Walk-in" },
  { key: "REFERENCE", label: "Reference" },
  { key: "BROKER", label: "Broker" },
  { key: "WEBSITE", label: "Website" },
  { key: "META", label: "Meta ads" },
  { key: "JUSTDIAL", label: "JustDial" },
  { key: "99ACRES", label: "99acres" },
  { key: "MYBRICKS", label: "MyBricks" },
  { key: "OLX", label: "OLX" },
];

export const EditLeadScreen = ({ route, navigation }: RootScreenProps<"EditLead">) => {
  const { leadId } = route.params;
  const [lead, setLead] = useState<LeadDetail | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [form, setForm] = useState({ name: "", phone: "", email: "", city: "", company: "", projectInterested: "", clientProfession: "", locations: "" });
  const [sourceChannel, setSourceChannel] = useState("");
  const [temperature, setTemperature] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getLeadDetail(leadId)
      .then((value) => {
        if (!value) throw new Error("This lead no longer exists.");
        setLead(value);
        setForm({
          name: value.name || "",
          phone: value.phone || "",
          email: value.email || "",
          city: value.city || "",
          company: value.company || "",
          projectInterested: value.projectInterested || "",
          clientProfession: value.clientProfession || "",
          locations: (value.preferredLocations || []).join(", "),
        });
        setSourceChannel(value.sourceChannel || "");
        setTemperature(leadTemperature(value));
      })
      .catch((err) => setLoadError(errorMessage(err)));
  }, [leadId]);

  if (loadError) return <ErrorState message={loadError} onRetry={() => navigation.goBack()} />;
  if (!lead) return <Loading />;

  const set = (key: keyof typeof form) => (value: string) => setForm((prev) => ({ ...prev, [key]: value }));
  const errors = validateNewLead(form);

  const save = async () => {
    if (Object.keys(errors).length) return setError(Object.values(errors)[0] || null);
    setSaving(true);
    setError(null);
    try {
      await updateLeadBasics(leadId, {
        name: form.name.trim(),
        phone: form.phone.replace(/[^\d+]/g, ""),
        email: form.email.trim(),
        city: form.city.trim(),
        company: form.company.trim(),
        projectInterested: form.projectInterested.trim(),
        clientProfession: form.clientProfession.trim(),
        preferredLocations: form.locations.split(",").map((item) => item.trim()).filter(Boolean),
        sourceChannel,
      });
      // Temperature lives on the status endpoint; only send it when it changed.
      if (temperature && temperature !== leadTemperature(lead)) {
        await updateLeadDetails(leadId, lead.status, { temperature });
      }
      navigation.goBack();
    } catch (err) {
      setError(errorMessage(err));
      setSaving(false);
    }
  };

  return (
    <Body>
      <Card style={styles.gap}>
        <Field label="Name *" value={form.name} onChangeText={set("name")} autoCapitalize="words" />
        <Field label="Phone *" value={form.phone} onChangeText={set("phone")} keyboardType="phone-pad" />
        <Field label="Email" value={form.email} onChangeText={set("email")} keyboardType="email-address" autoCapitalize="none" />
        <Field label="City" value={form.city} onChangeText={set("city")} />
        <Field label="Preferred locations" value={form.locations} onChangeText={set("locations")} placeholder="Comma separated, e.g. Sector 57, Golf Course Rd" />
        <Field label="Company" value={form.company} onChangeText={set("company")} />
        <Field label="Profession" value={form.clientProfession} onChangeText={set("clientProfession")} />
        <Field label="Project interested" value={form.projectInterested} onChangeText={set("projectInterested")} />
      </Card>
      <Card style={styles.gap}>
        <Text variant="heading">Temperature</Text>
        <View style={styles.chips}>
          {["HOT", "WARM", "COLD"].map((key) => (
            <Chip key={key} label={key.charAt(0) + key.slice(1).toLowerCase()} selected={temperature === key} onPress={() => setTemperature(key)} />
          ))}
        </View>
        <Text variant="heading">Source</Text>
        <View style={styles.chips}>
          {SOURCES.map((item) => (
            <Chip key={item.key || "none"} label={item.label} selected={sourceChannel === item.key} onPress={() => setSourceChannel(item.key)} />
          ))}
        </View>
      </Card>
      <InlineError message={error} />
      <Button label="Save changes" icon="checkmark" loading={saving} onPress={save} />
    </Body>
  );
};

const styles = StyleSheet.create({
  gap: { gap: space.md },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: space.sm },
});
