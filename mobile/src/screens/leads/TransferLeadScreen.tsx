import React, { useMemo, useState } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { errorMessage } from "../../api/client";
import { assignLead, getLeadDetail } from "../../api/leads";
import { listUsers } from "../../api/users";
import { useUser } from "../../auth/AuthProvider";
import { roleLabel } from "../../lib/roles";
import { useQuery } from "../../lib/useQuery";
import type { RootScreenProps } from "../../navigation/types";
import { useTheme } from "../../theme/ThemeProvider";
import { space } from "../../theme/tokens";
import { Avatar, Body, Button, Card, ErrorState, Field, Icon, InlineError, Loading, Text } from "../../ui";

/* Who a lead may be handed to - MANUAL_LEAD_TRANSFER_TARGET_ROLES in backend role.constants.js. */
const TARGET_ROLES = ["ADMIN", "MANAGER", "INSIDE_EXECUTIVE", "EXECUTIVE", "FIELD_EXECUTIVE"];

export const TransferLeadScreen = ({ route, navigation }: RootScreenProps<"TransferLead">) => {
  const { leadId } = route.params;
  const me = useUser();
  const { colors } = useTheme();
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
    <Body>
      <Card style={styles.owner}>
        <Avatar name={data.lead.assignedTo?.name || "?"} size={36} />
        <View style={styles.flex}>
          <Text variant="tiny" color="faint">
            Currently with
          </Text>
          <Text variant="bodyStrong">{data.lead.assignedTo?.name || data.lead.assignedExecutive?.name || "Nobody"}</Text>
        </View>
        <Icon name="arrow-forward" size={20} color={colors.textFaint} />
        <Text variant="bodyStrong" color={chosen ? "primary" : "faint"} numberOfLines={1} style={styles.flex}>
          {chosen?.name || "Pick someone"}
        </Text>
      </Card>

      <Field icon="search" value={query} onChangeText={setQuery} placeholder="Search your team" autoCorrect={false} />
      <Card style={styles.list}>
        {people.length ? (
          people.map((person, index) => {
            const selected = person._id === target;
            return (
              <Pressable
                key={person._id}
                accessibilityRole="radio"
                accessibilityState={{ selected }}
                onPress={() => setTarget(person._id)}
                style={[styles.person, index < people.length - 1 && { borderBottomColor: colors.border, borderBottomWidth: StyleSheet.hairlineWidth }]}
              >
                <Avatar name={person.name} uri={person.profileImageUrl} size={34} />
                <View style={styles.flex}>
                  <Text variant="body">{person._id === (me.id || me._id) ? `${person.name} (me)` : person.name}</Text>
                  <Text variant="tiny" color="faint">
                    {roleLabel(person.role)}
                  </Text>
                </View>
                <Icon name={selected ? "radio-button-on" : "radio-button-off"} size={22} color={selected ? colors.primary : colors.textFaint} />
              </Pressable>
            );
          })
        ) : (
          <Text variant="small" color="muted">
            No one matches.
          </Text>
        )}
      </Card>
      <Field label="Reason (optional)" value={reason} onChangeText={setReason} placeholder="e.g. Client prefers Hindi; Karan covers that area" multiline maxLength={300} />
      <InlineError message={saveError} />
      <Button label={chosen ? `Transfer to ${chosen.name}` : "Transfer"} icon="swap-horizontal" disabled={!target} loading={saving} onPress={save} />
    </Body>
  );
};

const styles = StyleSheet.create({
  flex: { flex: 1 },
  owner: { flexDirection: "row", alignItems: "center", gap: space.md },
  list: { paddingVertical: space.xs },
  person: { flexDirection: "row", alignItems: "center", gap: space.md, paddingVertical: space.md },
});
