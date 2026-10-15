import React, { useEffect, useState } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { getOffices, saveOffices, type Office, type OfficeUser } from "../../api/attendance";
import { errorMessage } from "../../api/client";
import { currentPosition } from "../../lib/location";
import { useTheme } from "../../theme/ThemeProvider";
import { Avatar, Body, Button, Card, CheckSquare, EmptyState, ErrorState, Field, Icon, InlineError, Loading, Sheet, Text } from "../../ui";

type Draft = { key: string; _id?: string; name: string; latitude: string; longitude: string; radiusMeters: string; userIds: string[] };

let draftSeq = 0;
const toDraft = (office: Partial<Office> = {}): Draft => ({
  key: office._id || `new-${(draftSeq += 1)}`,
  _id: office._id,
  name: office.name || "",
  latitude: office.latitude === undefined || office.latitude === null ? "" : String(office.latitude),
  longitude: office.longitude === undefined || office.longitude === null ? "" : String(office.longitude),
  radiusMeters: String(office.radiusMeters || 200),
  userIds: (office.userIds || []).map(String),
});

/*
 * Web: AttendanceOfficesPanel. Everyone may check in at the main office; here
 * an admin or manager adds further offices, each with its own geofence, and
 * picks who may check in there. A manager is offered their own team only.
 */
export const OfficesScreen = () => {
  const { colors } = useTheme();
  const [offices, setOffices] = useState<Draft[]>([]);
  const [people, setPeople] = useState<OfficeUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [locating, setLocating] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [picking, setPicking] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [dirty, setDirty] = useState(false);

  const load = async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const data = await getOffices();
      setOffices(data.offices.map(toDraft));
      setPeople(data.assignableUsers);
      setDirty(false);
    } catch (err) {
      setLoadError(errorMessage(err));
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => {
    load();
  }, []);

  const update = (key: string, patch: Partial<Draft>) => {
    setOffices((prev) => prev.map((office) => (office.key === key ? { ...office, ...patch } : office)));
    setDirty(true);
    setNotice(null);
  };

  const locate = async (key: string) => {
    setLocating(key);
    setError(null);
    try {
      const point = await currentPosition();
      update(key, { latitude: point.latitude.toFixed(6), longitude: point.longitude.toFixed(6) });
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setLocating(null);
    }
  };

  const save = async () => {
    const incomplete = offices.find((office) => !office.name.trim() || !office.latitude.trim() || !office.longitude.trim());
    if (incomplete) return setError(`${incomplete.name.trim() || "Each office"} needs a name, latitude and longitude.`);
    setSaving(true);
    setError(null);
    try {
      const result = await saveOffices(
        offices.map((office) => ({
          ...(office._id ? { _id: office._id } : {}),
          name: office.name.trim(),
          latitude: office.latitude.trim(),
          longitude: office.longitude.trim(),
          radiusMeters: Number(office.radiusMeters) || 200,
          userIds: office.userIds,
        })),
      );
      setOffices(result.offices.map(toDraft));
      setPeople(result.assignableUsers);
      setDirty(false);
      setNotice(result.message);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <Loading />;
  if (loadError) return <ErrorState message={loadError} onRetry={load} />;

  const editing = offices.find((office) => office.key === picking) || null;
  const needle = search.trim().toLowerCase();
  const visiblePeople = people.filter((person) => !needle || person.name.toLowerCase().includes(needle));

  return (
    <Body>
      <Text variant="small" color="muted">
        Everyone can check in at the main office (set in System settings). Add another office here, with its own radius, and pick who may check in there.
      </Text>

      {!offices.length ? <EmptyState icon="business-outline" title="No other offices" message="Only the main office's geofence is in use." /> : null}

      {offices.map((office, index) => (
        <Card key={office.key} style={styles.office}>
          <View style={styles.officeHead}>
            <Text variant="bodyStrong" style={styles.flex}>
              {office.name.trim() || `Office ${index + 1}`}
            </Text>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`Remove ${office.name || "office"}`}
              hitSlop={8}
              onPress={() => {
                setOffices((prev) => prev.filter((row) => row.key !== office.key));
                setDirty(true);
              }}
            >
              <Icon name="trash-outline" size={18} color={colors.danger} />
            </Pressable>
          </View>
          <Field label="Name" value={office.name} onChangeText={(name) => update(office.key, { name })} placeholder="e.g. Noida branch" maxLength={80} />
          <View style={styles.pair}>
            <View style={styles.flex}>
              <Field label="Latitude" value={office.latitude} onChangeText={(latitude) => update(office.key, { latitude })} keyboardType="numbers-and-punctuation" />
            </View>
            <View style={styles.flex}>
              <Field label="Longitude" value={office.longitude} onChangeText={(longitude) => update(office.key, { longitude })} keyboardType="numbers-and-punctuation" />
            </View>
          </View>
          <Button size="sm" variant="secondary" icon="locate-outline" label="Use my current location" loading={locating === office.key} onPress={() => locate(office.key)} />
          <Field label="Radius" suffix="m" value={office.radiusMeters} onChangeText={(radiusMeters) => update(office.key, { radiusMeters: radiusMeters.replace(/[^0-9]/g, "") })} keyboardType="number-pad" />
          <Pressable
            accessibilityRole="button"
            onPress={() => {
              setSearch("");
              setPicking(office.key);
            }}
            style={[styles.people, { backgroundColor: colors.surfaceAlt }]}
          >
            <Icon name="people-outline" size={18} color={colors.primary} />
            <Text variant="small" style={styles.flex}>
              {office.userIds.length ? `${office.userIds.length} ${office.userIds.length === 1 ? "person" : "people"} may check in here` : "No one assigned yet"}
            </Text>
            <Icon name="chevron-forward" size={16} color={colors.textFaint} />
          </Pressable>
        </Card>
      ))}

      <Button
        variant="secondary"
        icon="add"
        label="Add an office"
        onPress={() => {
          setOffices((prev) => [...prev, toDraft()]);
          setDirty(true);
        }}
      />
      <InlineError message={error} />
      {notice ? (
        <Text variant="smallStrong" color={colors.success} align="center">
          {notice}
        </Text>
      ) : null}
      {dirty ? <Button icon="checkmark" label="Save offices" loading={saving} onPress={save} /> : null}

      <Sheet visible={Boolean(editing)} title={editing ? `Who may check in at ${editing.name || "this office"}` : "People"} onClose={() => setPicking(null)} footer={<Button label="Done" onPress={() => setPicking(null)} />}>
        <Field compact icon="search-outline" value={search} onChangeText={setSearch} placeholder="Search people" />
        {visiblePeople.map((person) => {
          const on = Boolean(editing?.userIds.includes(person._id));
          return (
            <Pressable
              key={person._id}
              accessibilityRole="checkbox"
              accessibilityState={{ checked: on }}
              onPress={() => editing && update(editing.key, { userIds: on ? editing.userIds.filter((id) => id !== person._id) : [...editing.userIds, person._id] })}
              style={styles.person}
            >
              <Avatar name={person.name} uri={person.profileImageUrl} size={32} />
              <Text variant="body" style={styles.flex}>
                {person.name}
              </Text>
              <CheckSquare checked={on} />
            </Pressable>
          );
        })}
      </Sheet>
    </Body>
  );
};

const styles = StyleSheet.create({
  flex: { flex: 1, minWidth: 0 },
  office: { gap: 10 },
  officeHead: { flexDirection: "row", alignItems: "center", gap: 8 },
  pair: { flexDirection: "row", gap: 8 },
  people: { flexDirection: "row", alignItems: "center", gap: 10, padding: 12, borderRadius: 12 },
  person: { flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 6 },
});
