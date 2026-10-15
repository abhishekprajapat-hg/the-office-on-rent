import React, { useEffect, useMemo, useState } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { errorMessage } from "../../api/client";
import { api } from "../../api/client";
import { getPageAccess, getUserProfile, listCustomRoles, setPageAccess, updateUserByAdmin, type AdminProfileView, type CrmPage, type CustomRole, type PageAccess } from "../../api/admin";
import { canOpenPage } from "../../api/access";
import { getMemberAttendance, getMemberLeaveBalance, type AttendanceSummary, type LeaveBalance } from "../../api/attendance";
import { listTasks } from "../../api/tasks";
import { listUsers, type TeamUser } from "../../api/users";
import { useAuth, useUser } from "../../auth/AuthProvider";
import { formatDate, monthKeyOf } from "../../lib/format";
import { ROLE_LABELS } from "../../lib/roles";
import { BUSINESS_CATEGORIES, taskStats } from "../../lib/userAdmin";
import type { RootScreenProps } from "../../navigation/types";
import { useTheme } from "../../theme/ThemeProvider";
import { Avatar, Badge, Body, Button, Chip, ErrorState, FactRow, Field, GroupLabel, Icon, InlineError, ListCard, Loading, Sheet, Text, Toggle, type IconName } from "../../ui";
import { AtAGlance, EditDetailsSheet } from "./UserProfileKit";

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
  const { access: myAccess } = useAuth();
  const { colors } = useTheme();
  const [namedRoles, setNamedRoles] = useState<CustomRole[]>([]);
  const [customRoleId, setCustomRoleId] = useState<string | null>(null);
  const [person, setPerson] = useState<TeamUser | null>(null);
  const [team, setTeam] = useState<TeamUser[]>([]);
  /* The full record (reporting manager filled in) and lead numbers, for admins and managers; others work from the team list. */
  const [profile, setProfile] = useState<AdminProfileView | null>(null);
  const [glance, setGlance] = useState<{ attendance: AttendanceSummary | null; tasks: ReturnType<typeof taskStats> | null; leave: LeaveBalance | null } | null>(null);
  const [editOpen, setEditOpen] = useState(false);
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
      const [users, pages, roles, full] = await Promise.all([
        listUsers(),
        getPageAccess(id).catch(() => null),
        listCustomRoles().catch(() => []),
        me.role === "ADMIN" || me.role === "MANAGER" ? getUserProfile(id).catch(() => null) : Promise.resolve(null),
      ]);
      const found = users.find((user) => user._id === id) || null;
      if (!found) throw new Error("This person isn't in your team list.");
      setPerson(found);
      setTeam(users);
      setProfile(full);
      setNamedRoles(roles);
      setCustomRoleId(idOfRole(found.customRoleId));
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

  /* The at-a-glance numbers load on their own; one the viewer may not see is left out, never an error. */
  const loadGlance = async (target: TeamUser) => {
    const now = new Date();
    const day = (date: Date) => `${monthKeyOf(date)}-${String(date.getDate()).padStart(2, "0")}`;
    const scored = target.role !== "ADMIN";
    const [attendance, tasks, leave] = await Promise.all([
      scored ? getMemberAttendance(target._id, { from: `${monthKeyOf(now)}-01`, to: day(now) }).then((data) => data.summary).catch(() => null) : null,
      listTasks({ assignedTo: target._id }).then((rows) => taskStats(rows, now)).catch(() => null),
      scored ? getMemberLeaveBalance(target._id).catch(() => null) : null,
    ]);
    setGlance({ attendance, tasks, leave });
  };
  useEffect(() => {
    if (person && person._id === id) loadGlance(person);
  }, [person?._id]);

  const original = useMemo(() => JSON.stringify(Object.fromEntries((access?.pageAccess || []).map((grant) => [grant.pageKey, [...grant.actions].sort()]))), [access]);
  const current = JSON.stringify(Object.fromEntries(Object.entries(grants).map(([key, actions]) => [key, [...actions].sort()])));
  const customChanged = Boolean(person) && customRoleId !== idOfRole(person?.customRoleId);
  const dirty = Boolean(person) && (role !== person?.role || customChanged || active !== (person?.isActive !== false) || original !== current);

  const save = async () => {
    if (!person || !dirty) return;
    setSaving(true);
    setSaveError(null);
    setSaved(false);
    try {
      const patch: Record<string, unknown> = {};
      // A named role carries its own base role; the server applies it, so send one or the other.
      if (customChanged && customRoleId) patch.customRoleId = customRoleId;
      else if (role !== person.role || customChanged) {
        patch.role = role;
        patch.customRoleId = null;
      }
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

  // Nobody is made an admin from here; the server refuses it.
  const roleChoices = ROLE_CHOICES.filter((key) => key === person.role || (key !== "ADMIN" && (isAdmin || key !== "MANAGER")));
  const pages = (access?.pages || []).filter((page) => !page.alwaysAccessible);
  const self = person._id === (me.id || me._id);
  const record = profile?.profile || person;
  const parent = record.parentId && typeof record.parentId === "object" ? record.parentId : team.find((user) => user._id === record.parentId) || null;
  const category = BUSINESS_CATEGORIES.find((item) => item.key === record.roleType)?.label;
  const canEditDetails = !self && (me.role === "ADMIN" || (me.role === "MANAGER" && person.role !== "ADMIN"));

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

      <ListCard>
        <View style={styles.facts}>
          {category ? <FactRow icon="briefcase-outline" label="Business" value={category} /> : null}
          {parent ? <FactRow icon="git-merge-outline" label="Reports to" value={parent.name} /> : null}
          {record.department ? <FactRow icon="layers-outline" label="Department" value={record.department} /> : null}
          {record.branch ? <FactRow icon="location-outline" label="Branch" value={record.branch} /> : null}
          {record.shiftTiming ? <FactRow icon="time-outline" label="Shift" value={record.shiftTiming} /> : null}
          {record.role !== "ADMIN" ? <FactRow icon="flag-outline" label="Monthly target" value={String(Number.isFinite(record.monthlyTarget) ? record.monthlyTarget : 10)} /> : null}
          {record.role === "CHANNEL_PARTNER" && record.brokerageConfig ? (
            <FactRow
              icon="cash-outline"
              label="Brokerage"
              value={record.brokerageConfig.mode === "PERCENTAGE" ? `${record.brokerageConfig.value ?? 0}% of sell value` : `₹${Number(record.brokerageConfig.value || 0).toLocaleString("en-IN")} per deal`}
            />
          ) : null}
          {record.role === "CHANNEL_PARTNER" ? <FactRow icon="business-outline" label="Inventory access" value={record.canViewInventory ? "Can view" : "No"} /> : null}
          {record.employeeId ? <FactRow icon="id-card-outline" label="Employee ID" value={record.employeeId} /> : null}
          {record.joiningDate ? <FactRow icon="calendar-outline" label="Joined" value={formatDate(record.joiningDate)} /> : null}
          {record.lastLoginAt ? <FactRow icon="log-in-outline" label="Last sign-in" value={formatDate(record.lastLoginAt)} /> : null}
        </View>
        {canEditDetails ? <LinkRow icon="create-outline" label="Edit details" onPress={() => setEditOpen(true)} /> : null}
      </ListCard>

      {glance ? (
        <>
          <GroupLabel>At a glance</GroupLabel>
          <AtAGlance
            attendance={glance.attendance}
            tasks={glance.tasks}
            leave={glance.leave}
            target={{ target: Number.isFinite(record.monthlyTarget) ? Number(record.monthlyTarget) : 10, achieved: record.role === "ADMIN" ? null : profile?.performance ? Number(profile.performance.achievedTarget || 0) : null }}
            leads={profile?.performance || null}
          />
        </>
      ) : null}

      <GroupLabel>Role</GroupLabel>
      <View style={styles.chips}>
        {roleChoices.map((key) => (
          <Chip
            key={key}
            label={SHORT_ROLE[key] || key}
            selected={!customRoleId && role === key}
            onPress={() => {
              if (self) return;
              setRole(key);
              setCustomRoleId(null);
            }}
          />
        ))}
      </View>
      {namedRoles.length ? (
        <>
          <Text variant="smallStrong" color="muted">
            Named roles
          </Text>
          <View style={styles.chips}>
            {namedRoles
              .filter((item) => isAdmin || !["ADMIN", "MANAGER"].includes(item.baseRole) || item._id === customRoleId)
              .map((item) => (
                <Chip
                  key={item._id}
                  label={item.name}
                  selected={customRoleId === item._id}
                  onPress={() => {
                    if (self) return;
                    setCustomRoleId(item._id);
                    setRole(item.baseRole);
                  }}
                />
              ))}
          </View>
        </>
      ) : null}

      {!self && person.role !== "ADMIN" ? (
        <ListCard>
          {canOpenPage(me, myAccess, "attendance") ? (
            <LinkRow icon="calendar-number-outline" label="Attendance" onPress={() => navigation.navigate("MemberAttendance", { userId: person._id, name: person.name })} />
          ) : null}
          {canOpenPage(me, myAccess, "salary") ? (
            <LinkRow icon="wallet-outline" label="Salary" onPress={() => navigation.navigate("MemberSalary", { userId: person._id, name: person.name })} />
          ) : null}
          {canOpenPage(me, myAccess, "performance") ? (
            <LinkRow icon="speedometer-outline" label="Performance" onPress={() => navigation.navigate("MemberPerformance", { userId: person._id, name: person.name })} />
          ) : null}
        </ListCard>
      ) : null}

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

      <EditDetailsSheet
        visible={editOpen}
        person={record}
        role={person.role}
        users={team}
        onClose={() => setEditOpen(false)}
        onSaved={() => {
          setEditOpen(false);
          setSaved(true);
          load();
        }}
      />
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

const idOfRole = (value: TeamUser["customRoleId"]) => (value && typeof value === "object" ? value._id : value || null);

const LinkRow = ({ icon, label, onPress }: { icon: IconName; label: string; onPress: () => void }) => {
  const { colors } = useTheme();
  return (
    <Pressable accessibilityRole="button" onPress={onPress} style={({ pressed }) => [styles.pageRow, pressed && { backgroundColor: colors.surfaceAlt }]}>
      <Icon name={icon} size={18} color={colors.textMuted} />
      <Text variant="body" style={[styles.flex, styles.pageLabel]}>
        {label}
      </Text>
      <Icon name="chevron-forward" size={16} color={colors.textFaint} />
    </Pressable>
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
  facts: { paddingHorizontal: 14, paddingVertical: 4 },
});
