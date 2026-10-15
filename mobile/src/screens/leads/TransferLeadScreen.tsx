import React, { useMemo, useState } from "react";
import { Pressable, ScrollView, StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { errorMessage } from "../../api/client";
import { assignLead, getLeadDetail } from "../../api/leads";
import { listUsers } from "../../api/users";
import { useUser } from "../../auth/AuthProvider";
import { roleLabel } from "../../lib/roles";
import { useQuery } from "../../lib/useQuery";
import type { RootScreenProps } from "../../navigation/types";
import { useTheme } from "../../theme/ThemeProvider";
import { Avatar, Button, ErrorState, Field, Grabber, InlineError, Loading, Text } from "../../ui";

/* Who a lead may be handed to - MANUAL_LEAD_TRANSFER_TARGET_ROLES in backend role.constants.js. */
const TARGET_ROLES = ["ADMIN", "MANAGER", "INSIDE_EXECUTIVE", "EXECUTIVE", "FIELD_EXECUTIVE"];

export const TransferLeadScreen = ({ route, navigation }: RootScreenProps<"TransferLead">) => {
  const { leadId } = route.params;
  const me = useUser();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const { data, loading, error, refresh } = useQuery(async () => {
    const [lead, users] = await Promise.all([getLeadDetail(leadId), listUsers()]);
    if (!lead) throw new Error("This lead no longer exists.");
    return { lead, users };
  }, [leadId]);
  const [query, setQuery] = useState("");
  const [target, setTarget] = useState<string | null>(null);
  const [reason, setReason] = useState("");
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const ownerId = data?.lead.assignedTo?._id || data?.lead.assignedExecutive?._id || "";
  const people = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return (data?.users || [])
      .filter((person) => person.isActive !== false && TARGET_ROLES.includes(person.role) && person._id !== ownerId)
      .filter((person) => !needle || person.name.toLowerCase().includes(needle) || roleLabel(person.role).toLowerCase().includes(needle))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [data, query, ownerId]);

  if (loading) return <Loading />;
  if (error || !data) return <ErrorState message={error || "Couldn't load your team."} onRetry={refresh} />;

  const chosen = people.find((person) => person._id === target);

  const save = async () => {
    if (!target) return;
    setSaving(true);
    setSaveError(null);
    try {
      await assignLead(leadId, target, reason);
      navigation.goBack();
    } catch (err) {
      setSaveError(errorMessage(err));
      setSaving(false);
    }
  };

  return (
    <View style={[styles.backdrop, { backgroundColor: colors.overlay }]}>
      <Pressable style={styles.flex} onPress={() => navigation.goBack()} accessibilityLabel="Close" />
      <View style={[styles.panel, { backgroundColor: colors.surface, paddingBottom: Math.max(insets.bottom, 12) + 14 }]}>
        <Grabber />
        <View style={styles.head}>
          <Text variant="title" style={styles.title}>
            Transfer lead
          </Text>
          <Text variant="small" color="muted" style={styles.sub}>
            {data.lead.name} will move with its tasks and history{data.lead.assignedTo?.name ? ` · now with ${data.lead.assignedTo.name}` : ""}.
          </Text>
        </View>
        <Field icon="search" compact value={query} onChangeText={setQuery} placeholder="Search teammates" autoCorrect={false} />
        <ScrollView style={styles.list} keyboardShouldPersistTaps="handled">
          {people.length ? (
            people.map((person, index) => {
              const selected = person._id === target;
              return (
                <Pressable
                  key={person._id}
                  accessibilityRole="radio"
                  accessibilityState={{ selected }}
                  onPress={() => setTarget(person._id)}
                  style={[styles.person, index > 0 && { borderTopColor: colors.border, borderTopWidth: 1 }]}
                >
                  <Avatar name={person.name} uri={person.profileImageUrl} size={38} />
                  <View style={styles.flex}>
                    <Text variant="bodyStrong" style={styles.name}>
                      {person._id === (me.id || me._id) ? `${person.name} (me)` : person.name}
                    </Text>
                    <Text variant="small" color="muted" style={styles.role}>
                      {[roleLabel(person.role), person.branch].filter(Boolean).join(" · ")}
                    </Text>
                  </View>
                  <View style={[styles.radio, { borderColor: selected ? colors.primary : colors.border, backgroundColor: selected ? colors.primary : colors.surface }]}>
                    {selected ? <View style={[styles.radioInner, { backgroundColor: colors.surface }]} /> : null}
                  </View>
                </Pressable>
              );
            })
          ) : (
            <Text variant="small" color="muted">
              No one matches.
            </Text>
          )}
        </ScrollView>
        <Field value={reason} onChangeText={setReason} placeholder="Reason · e.g. Client prefers Gurugram team" maxLength={300} />
        <InlineError message={saveError} />
        <Button label={chosen ? `Transfer to ${chosen.name}` : "Pick a teammate"} disabled={!target} loading={saving} onPress={save} />
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  flex: { flex: 1, minWidth: 0 },
  backdrop: { flex: 1, justifyContent: "flex-end" },
  panel: { borderTopLeftRadius: 26, borderTopRightRadius: 26, paddingTop: 10, paddingHorizontal: 18, gap: 12, maxHeight: "88%" },
  head: { gap: 2 },
  title: { fontSize: 19 },
  sub: { fontSize: 12.5 },
  list: { flexGrow: 0, maxHeight: 300 },
  person: { flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 10, paddingHorizontal: 4 },
  name: { fontSize: 13.5 },
  role: { fontSize: 11.5 },
  radio: { width: 22, height: 22, borderRadius: 11, borderWidth: 2, alignItems: "center", justifyContent: "center" },
  radioInner: { width: 8, height: 8, borderRadius: 4 },
});
