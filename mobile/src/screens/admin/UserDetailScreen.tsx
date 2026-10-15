import React, { useEffect, useMemo, useState } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { errorMessage } from "../../api/client";
import { api } from "../../api/client";
import { getPageAccess, setPageAccess, updateUserByAdmin, type CrmPage, type PageAccess } from "../../api/admin";
import { listUsers, type TeamUser } from "../../api/users";
import { useUser } from "../../auth/AuthProvider";
import { ROLE_LABELS } from "../../lib/roles";
import type { RootScreenProps } from "../../navigation/types";
import { useTheme } from "../../theme/ThemeProvider";
import { Avatar, Badge, Body, Button, Chip, ErrorState, Field, GroupLabel, Icon, InlineError, ListCard, Loading, Sheet, Text, Toggle, type IconName } from "../../ui";

const PAGE_ICONS: Record<string, IconName> = {
  dashboard: "grid-outline",
  leads: "people-outline",
  my_leads: "person-outline",
  inventory: "business-outline",
  projects: "albums-outline",
  field_ops: "navigate-outline",
  field: "navigate-outline",
  finance: "cash-outline",
  billing: "receipt-outline",
  reports: "bar-chart-outline",
  coworking_booking: "grid-outline",
  coworking_clients: "briefcase-outline",
  chat: "chatbubble-outline",
  tasks: "checkbox-outline",
  attendance: "finger-print-outline",
  salary: "wallet-outline",
  admin: "shield-outline",
  settings: "settings-outline",
};
const ACTION_LABEL = (action: string) => action.replace(/_/g, " ").replace(/^\w/, (c) => c.toUpperCase());
const SHORT_ROLE: Record<string, string> = {
  EXECUTIVE: "Executive",
  FIELD_EXECUTIVE: "Field exec",
  INSIDE_EXECUTIVE: "Inside exec",
  MANAGER: "Manager",
  PRODUCTION_EXECUTIVE: "Production",
  COMMUNITY_MANAGER: "Community",
  CHANNEL_PARTNER: "Partner",
  COWORKING_ADMIN: "Coworking",
  ADMIN: "Admin",
};
const ROLE_CHOICES = ["EXECUTIVE", "FIELD_EXECUTIVE", "INSIDE_EXECUTIVE", "MANAGER", "PRODUCTION_EXECUTIVE", "COMMUNITY_MANAGER", "CHANNEL_PARTNER", "COWORKING_ADMIN", "ADMIN"];

/* Design 38: role, page access per module, deactivate, reset password. */
export const UserDetailScreen = ({ route, navigation }: RootScreenProps<"UserDetail">) => {
  const { id } = route.params;
  const me = useUser();
  const { colors } = useTheme();
  const [person, setPerson] = useState<TeamUser | null>(null);
  const [access, setAccess] = useState<PageAccess | null>(null);
  const [grants, setGrants] = useState<Record<string, string[]>>({});
  const [role, setRole] = useState("");
  const [active, setActive] = useState(true);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [resetOpen, setResetOpen] = useState(false);
  const [password, setPassword] = useState("");
  const [removeOpen, setRemoveOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [sheetBusy, setSheetBusy] = useState(false);
  const [sheetError, setSheetError] = useState<string | null>(null);
  const isAdmin = me.role === "ADMIN";

  const load = async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const [users, pages] = await Promise.all([listUsers(), getPageAccess(id).catch(() => null)]);
      const found = users.find((user) => user._id === id) || null;
      if (!found) throw new Error("This person isn't in your team list.");
      setPerson(found);
      setRole(found.role);
      setActive(found.isActive !== false);
      setAccess(pages);
      setGrants(Object.fromEntries((pages?.pageAccess || []).map((grant) => [grant.pageKey, grant.actions])));
    } catch (err) {
      setLoadError(errorMessage(err));
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => {
    load();
  }, [id]);

  const original = useMemo(() => JSON.stringify(Object.fromEntries((access?.pageAccess || []).map((grant) => [grant.pageKey, [...grant.actions].sort()]))), [access]);
  const current = JSON.stringify(Object.fromEntries(Object.entries(grants).map(([key, actions]) => [key, [...actions].sort()])));
  const dirty = Boolean(person) && (role !== person?.role || active !== (person?.isActive !== false) || original !== current);

  const save = async () => {
    if (!person || !dirty) return;
    setSaving(true);
    setSaveError(null);
    setSaved(false);
    try {
      const patch: Record<string, unknown> = {};
      if (role !== person.role) patch.role = role;
      if (active !== (person.isActive !== false)) patch.isActive = active;
      if (Object.keys(patch).length) await updateUserByAdmin(person._id, patch);
      if (original !== current && access?.canEdit) {
        await setPageAccess(
          person._id,
          Object.entries(grants)
            .filter(([, actions]) => actions.length)
            .map(([pageKey, actions]) => ({ pageKey, actions })),
        );
      }
      setSaved(true);
      await load();
    } catch (err) {
      setSaveError(errorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  React.useLayoutEffect(() => {
    navigation.setOptions({
      title: person?.name || route.params.name || "User",
      headerRight: () => (
        <Pressable accessibilityRole="button" hitSlop={8} disabled={!dirty || saving} onPress={save}>
          <Text variant="bodyStrong" color={dirty ? colors.primary : colors.textFaint}>
            {saving ? "Saving…" : "Save"}
          </Text>
        </Pressable>
      ),
    });
  });

  if (loading) return <Loading />;
  if (loadError || !person) return <ErrorState message={loadError || "Couldn't load this person."} onRetry={load} />;

  const togglePage = (page: CrmPage, on: boolean) =>
    setGrants((prev) => {
      const next = { ...prev };
      if (on) next[page.key] = prev[page.key]?.length ? prev[page.key]! : ["view"];
      else delete next[page.key];
      return next;
    });
  const toggleAction = (page: CrmPage, action: string) =>
    setGrants((prev) => {
      const list = prev[page.key] || ["view"];
      return { ...prev, [page.key]: list.includes(action) ? list.filter((item) => item !== action) : [...new Set([...list, "view", action])] };
    });

  const resetPassword = async () => {
    if (password.length < 6) return setSheetError("Use at least 6 characters.");
    setSheetBusy(true);
    setSheetError(null);
    try {
      await updateUserByAdmin(person._id, { password, mustChangePassword: true });
      setResetOpen(false);
      setPassword("");
      setSaved(true);
    } catch (err) {
      setSheetError(errorMessage(err));
    } finally {
      setSheetBusy(false);
    }
  };

  const remove = async () => {
    if (!isAdmin && !reason.trim()) return setSheetError("Say why, so the admin can decide.");
    setSheetBusy(true);
    setSheetError(null);
    try {
      if (isAdmin) await api.delete(`/users/${person._id}`);
      else await api.post(`/users/${person._id}/delete-request`, { reason: reason.trim() });
      navigation.goBack();
    } catch (err) {
      setSheetError(errorMessage(err));
      setSheetBusy(false);
    }
  };

  const roleChoices = ROLE_CHOICES.filter((key) => isAdmin || !["ADMIN", "MANAGER"].includes(key) || key === person.role);
  const pages = (access?.pages || []).filter((page) => !page.alwaysAccessible);
  const self = person._id === (me.id || me._id);

  return (
    <Body>
      <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
        <Avatar name={person.name} uri={person.profileImageUrl} size={48} />
        <View style={styles.flex}>
          <Text variant="bodyStrong" style={styles.name}>
            {person.name}
          </Text>
          <Text variant="small" color="muted" numberOfLines={1}>
            {person.email || person.phone}
          </Text>
        </View>
        <Badge label={active ? "Active" : "Inactive"} tone={active ? "success" : "neutral"} />
      </View>

      <GroupLabel>Role</GroupLabel>
      <View style={styles.chips}>
        {roleChoices.map((key) => (
          <Chip key={key} label={SHORT_ROLE[key] || key} selected={role === key} onPress={() => !self && setRole(key)} />
        ))}
      </View>

      <GroupLabel>Page access</GroupLabel>
      {!access ? (
        <Text variant="small" color="muted">
          You can't change this person's page access.
        </Text>
      ) : !access.canEdit ? (
        <Text variant="small" color="muted">
          {access.editBlockedReason || "Page access is fixed for this role."}
        </Text>
      ) : null}
      {access && pages.length ? (
        <ListCard>
          {pages.map((page) => {
            const on = Boolean(grants[page.key]?.length);
            const extra = page.actions.filter((action) => action !== "view" && (action !== "delete" || access.canGrantDelete || grants[page.key]?.includes("delete")));
            return (
              <View key={page.key}>
                <View style={styles.pageRow}>
                  <Icon name={PAGE_ICONS[page.key] || "document-outline"} size={18} color={colors.textMuted} />
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={`${page.label} actions`}
                    disabled={!on || !extra.length}
                    onPress={() => setExpanded(expanded === page.key ? null : page.key)}
                    style={styles.flex}
                  >
                    <Text variant="body" style={styles.pageLabel}>
                      {page.label}
                    </Text>
                    {on && extra.length ? (
                      <Text variant="tiny" color="faint" numberOfLines={1}>
                        {(grants[page.key] || []).filter((action) => action !== "view").map(ACTION_LABEL).join(", ") || "View only"} · edit
                      </Text>
                    ) : null}
                  </Pressable>
                  {access.canEdit ? <Toggle value={on} label={page.label} onChange={(next) => togglePage(page, next)} /> : <Toggle value={on} label={page.label} />}
                </View>
                {expanded === page.key && on ? (
                  <View style={styles.actions}>
                    {extra.map((action) => (
                      <Chip key={action} label={ACTION_LABEL(action)} selected={(grants[page.key] || []).includes(action)} onPress={() => access.canEdit && toggleAction(page, action)} />
                    ))}
                  </View>
                ) : null}
              </View>
            );
          })}
        </ListCard>
      ) : null}
      {access?.canEdit && !access.usesRoleDefaults ? (
        <Pressable
          accessibilityRole="button"
          onPress={async () => {
            try {
              await setPageAccess(person._id, null);
              await load();
            } catch (err) {
              setSaveError(errorMessage(err));
            }
          }}
        >
          <Text variant="smallStrong" color="primary">
            Reset to {ROLE_LABELS[person.role as keyof typeof ROLE_LABELS] || "role"} defaults
          </Text>
        </Pressable>
      ) : null}

      {!self ? (
        <ListCard>
          <View style={styles.pageRow}>
            <Icon name="power-outline" size={18} color={colors.textMuted} />
            <Text variant="body" style={[styles.flex, styles.pageLabel]}>
              Account active
            </Text>
            <Toggle value={active} label="Account active" onChange={setActive} />
          </View>
        </ListCard>
      ) : null}

      <InlineError message={saveError} />
      {saved ? (
        <Text variant="smallStrong" color={colors.success} align="center">
          Saved.
        </Text>
      ) : null}
      {dirty ? <Button label="Save changes" icon="checkmark" loading={saving} onPress={save} /> : null}

      <Pressable
        accessibilityRole="button"
        onPress={() => {
          setSheetError(null);
          setResetOpen(true);
        }}
        style={[styles.danger, { backgroundColor: colors.dangerSoft }]}
      >
        <Icon name="key-outline" size={18} color={colors.danger} />
        <Text variant="bodyStrong" color="danger">
          Reset password
        </Text>
      </Pressable>
      {!self ? (
        <Pressable
          accessibilityRole="button"
          onPress={() => {
            setSheetError(null);
            setRemoveOpen(true);
          }}
          style={styles.removeLink}
        >
          <Text variant="smallStrong" color="danger">
            {isAdmin ? "Remove from company" : "Request removal"}
          </Text>
        </Pressable>
      ) : null}

      <Sheet
        visible={resetOpen}
        title="Reset password"
        subtitle={`${person.name} will be asked to choose a new one at next sign-in.`}
        onClose={() => setResetOpen(false)}
        footer={<Button label="Set password" loading={sheetBusy} onPress={resetPassword} />}
      >
        <Field label="Temporary password" value={password} onChangeText={setPassword} secure autoCapitalize="none" placeholder="At least 6 characters" />
        <InlineError message={sheetError} />
      </Sheet>
      <Sheet
        visible={removeOpen}
        title={isAdmin ? `Remove ${person.name}?` : `Ask to remove ${person.name}`}
        subtitle={isAdmin ? "Their leads and tasks stay; they can no longer sign in." : "An admin approves removals."}
        onClose={() => setRemoveOpen(false)}
        footer={<Button label={isAdmin ? "Remove" : "Send request"} variant="danger" loading={sheetBusy} onPress={remove} />}
      >
        <Field label="Reason" value={reason} onChangeText={setReason} placeholder={isAdmin ? "Optional" : "Why should they be removed?"} multiline />
        <InlineError message={sheetError} />
      </Sheet>
    </Body>
  );
};

const styles = StyleSheet.create({
  flex: { flex: 1, minWidth: 0 },
  card: { flexDirection: "row", alignItems: "center", gap: 12, padding: 14, borderRadius: 18, borderWidth: 1 },
  name: { fontSize: 15 },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  pageRow: { flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: 14, minHeight: 50, paddingVertical: 6 },
  pageLabel: { fontSize: 14 },
  actions: { flexDirection: "row", flexWrap: "wrap", gap: 6, paddingHorizontal: 14, paddingBottom: 12, paddingLeft: 44 },
  danger: { flexDirection: "row", gap: 8, alignItems: "center", justifyContent: "center", height: 50, borderRadius: 14 },
  removeLink: { alignSelf: "center", padding: 6 },
});
