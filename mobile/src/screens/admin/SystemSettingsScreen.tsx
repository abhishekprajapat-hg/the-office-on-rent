import React, { useEffect, useState } from "react";
import { StyleSheet, View } from "react-native";
import { errorMessage } from "../../api/client";
import { getAttendancePolicy, getCompanySettings, updateAttendancePolicy, updateCompanySettings, type AttendancePolicy } from "../../api/admin";
import { DateTimeField } from "../../components/DateTimeField";
import { useQuery } from "../../lib/useQuery";
import type { RootScreenProps } from "../../navigation/types";
import { useTheme } from "../../theme/ThemeProvider";
import { Body, Button, ErrorState, Field, GroupLabel, InlineError, ListCard, Loading, MultiSelect, Segmented, Text, Toggle } from "../../ui";

const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const toDate = (minutes: number) => {
  const date = new Date();
  date.setHours(Math.floor(minutes / 60), minutes % 60, 0, 0);
  return date;
};
const toMinutes = (date: Date | null) => (date ? date.getHours() * 60 + date.getMinutes() : 0);
const clock = (minutes: number) => `${Math.floor(minutes / 60) % 12 || 12}:${String(minutes % 60).padStart(2, "0")} ${minutes < 720 ? "AM" : "PM"}`;
const hours = (minutes: number) => `${Math.floor(minutes / 60)}h${minutes % 60 ? ` ${minutes % 60}m` : ""}`;

/* Admin → Shifts & rules (attendance policy) and System (company profile, plan). */
export const SystemSettingsScreen = ({ route, navigation }: RootScreenProps<"SystemSettings">) => {
  const { colors } = useTheme();
  const [section, setSection] = useState<"shift" | "company">(route.params?.section || "shift");
  const policy = useQuery(() => getAttendancePolicy(), []);
  const company = useQuery(() => getCompanySettings().catch(() => null), []);

  const [draft, setDraft] = useState<AttendancePolicy | null>(null);
  const [name, setName] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (policy.data) setDraft(policy.data);
  }, [policy.data]);
  React.useLayoutEffect(() => {
    navigation.setOptions({ title: section === "shift" ? "Shifts & rules" : "System" });
  }, [navigation, section]);

  const set = (patch: Partial<AttendancePolicy>) => {
    setSaved(false);
    setDraft((prev) => (prev ? { ...prev, ...patch } : prev));
  };

  const savePolicy = async () => {
    if (!draft) return;
    if (draft.shiftEndMinutes <= draft.shiftStartMinutes) return setError("The shift must end after it starts.");
    if (draft.halfDayMinutes >= draft.fullDayMinutes) return setError("A half day must be shorter than a full day.");
    setSaving(true);
    setError(null);
    try {
      const { shiftStartMinutes, shiftEndMinutes, graceMinutes, halfDayMinutes, fullDayMinutes, weeklyOffDays, allowCheckoutDuringBreak, geofenceEnabled, officeRadiusMeters } = draft;
      await updateAttendancePolicy({ shiftStartMinutes, shiftEndMinutes, graceMinutes, halfDayMinutes, fullDayMinutes, weeklyOffDays, allowCheckoutDuringBreak, geofenceEnabled, officeRadiusMeters });
      setSaved(true);
      policy.reload();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  const saveCompany = async () => {
    if (!name?.trim()) return;
    setSaving(true);
    setError(null);
    try {
      await updateCompanySettings({ name: name.trim() });
      setSaved(true);
      setName(null);
      company.reload();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Body>
      <Segmented
        options={[
          { key: "shift", label: "Shifts & rules" },
          { key: "company", label: "Company" },
        ]}
        value={section}
        onChange={(key) => {
          setSection(key);
          setError(null);
          setSaved(false);
        }}
      />

      {section === "shift" ? (
        policy.loading ? (
          <Loading />
        ) : policy.error || !draft ? (
          <ErrorState message={policy.error || "Couldn't load the attendance policy."} onRetry={policy.refresh} />
        ) : (
          <>
            <GroupLabel>Shift</GroupLabel>
            <View style={styles.row}>
              <View style={styles.flex}>
                <DateTimeField label="Starts" mode="time" variant="tile" icon="time-outline" value={toDate(draft.shiftStartMinutes)} onChange={(date) => set({ shiftStartMinutes: toMinutes(date) })} />
              </View>
              <View style={styles.flex}>
                <DateTimeField label="Ends" mode="time" variant="tile" icon="time-outline" value={toDate(draft.shiftEndMinutes)} onChange={(date) => set({ shiftEndMinutes: toMinutes(date) })} />
              </View>
            </View>
            <View style={styles.row}>
              <View style={styles.flex}>
                <Field label="Grace" value={String(draft.graceMinutes)} onChangeText={(value) => set({ graceMinutes: Number(value.replace(/\D/g, "")) || 0 })} keyboardType="numeric" suffix="min" />
              </View>
              <View style={styles.flex}>
                <Field
                  label="Half day after"
                  value={String(draft.halfDayMinutes / 60)}
                  onChangeText={(value) => set({ halfDayMinutes: Math.round((Number(value) || 0) * 60) })}
                  keyboardType="decimal-pad"
                  suffix="hours"
                />
              </View>
            </View>
            <Field
              label="Full day after"
              value={String(draft.fullDayMinutes / 60)}
              onChangeText={(value) => set({ fullDayMinutes: Math.round((Number(value) || 0) * 60) })}
              keyboardType="decimal-pad"
              suffix="hours"
              hint={`Late after ${clock(draft.shiftStartMinutes + draft.graceMinutes)} · half day under ${hours(draft.halfDayMinutes)}`}
            />
            <GroupLabel>Weekly off</GroupLabel>
            <MultiSelect
              title="Weekly off"
              placeholder="No weekly off"
              icon="calendar-outline"
              options={DAYS.map((label, index) => ({ key: String(index), label }))}
              value={(draft.weeklyOffDays || []).map(String)}
              onChange={(keys) => set({ weeklyOffDays: keys.map(Number).sort((a, b) => a - b) })}
            />
            <GroupLabel>Rules</GroupLabel>
            <ListCard>
              <View style={styles.toggleRow}>
                <View style={styles.flex}>
                  <Text variant="body">Geofence check-in</Text>
                  <Text variant="tiny" color="faint">
                    Only inside an office's radius{draft.offices?.length ? ` · ${draft.offices.map((office) => office.name).join(", ")}` : ""}
                  </Text>
                </View>
                <Toggle value={Boolean(draft.geofenceEnabled)} label="Geofence check-in" onChange={(value) => set({ geofenceEnabled: value })} />
              </View>
              {draft.geofenceEnabled ? (
                <View style={styles.inset}>
                  <Field label="Default radius" value={String(draft.officeRadiusMeters || 200)} onChangeText={(value) => set({ officeRadiusMeters: Number(value.replace(/\D/g, "")) || 0 })} keyboardType="numeric" suffix="metres" />
                </View>
              ) : null}
              <View style={[styles.toggleRow, { borderTopColor: colors.border, borderTopWidth: 1 }]}>
                <View style={styles.flex}>
                  <Text variant="body">Check out while on break</Text>
                  <Text variant="tiny" color="faint">
                    Otherwise the break must end first
                  </Text>
                </View>
                <Toggle value={Boolean(draft.allowCheckoutDuringBreak)} label="Check out while on break" onChange={(value) => set({ allowCheckoutDuringBreak: value })} />
              </View>
            </ListCard>
            <Text variant="tiny" color="faint">
              Office locations are pinned on the web app's map.
            </Text>
            <InlineError message={error} />
            {saved ? (
              <Text variant="smallStrong" color={colors.success} align="center">
                Saved. New rules apply from the next check-in.
              </Text>
            ) : null}
            <Button label="Save rules" icon="checkmark" loading={saving} onPress={savePolicy} />
          </>
        )
      ) : company.loading ? (
        <Loading />
      ) : !company.data ? (
        <Text variant="small" color="muted">
          Company settings are available to admins and managers.
        </Text>
      ) : (
        <>
          <Field label="Company name" value={name ?? company.data.company.name} onChangeText={setName} />
          <ListCard>
            {[
              ["Legal name", company.data.company.legalName],
              ["Workspace", company.data.company.subdomain],
              ["Custom domain", company.data.company.customDomain],
              ["Status", company.data.company.status],
              ["Plan", company.data.subscription?.plan?.name || (company.data.subscription ? "Current plan" : "")],
              ["Renews", company.data.subscription?.currentPeriodEnd ? new Date(company.data.subscription.currentPeriodEnd).toLocaleDateString("en-IN") : ""],
            ]
              .filter(([, value]) => value)
              .map(([label, value]) => (
                <View key={label} style={styles.fact}>
                  <Text variant="small" color="muted">
                    {label}
                  </Text>
                  <Text variant="smallStrong">{String(value)}</Text>
                </View>
              ))}
          </ListCard>
          <InlineError message={error} />
          {saved ? (
            <Text variant="smallStrong" color={colors.success} align="center">
              Saved.
            </Text>
          ) : null}
          {name !== null && name.trim() !== company.data.company.name ? <Button label="Save" icon="checkmark" loading={saving} onPress={saveCompany} /> : null}
        </>
      )}
    </Body>
  );
};

const styles = StyleSheet.create({
  flex: { flex: 1, minWidth: 0 },
  row: { flexDirection: "row", gap: 10 },
  toggleRow: { flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: 14, paddingVertical: 12 },
  inset: { paddingHorizontal: 14, paddingBottom: 12 },
  fact: { flexDirection: "row", justifyContent: "space-between", paddingHorizontal: 14, paddingVertical: 10, gap: 10 },
});
