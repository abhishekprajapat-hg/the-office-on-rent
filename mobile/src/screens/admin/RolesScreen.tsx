import React, { useLayoutEffect, useState } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { createCustomRole, deleteCustomRole, getRoleCatalogue, listCustomRoles, updateCustomRole, type BusinessCategory, type CustomRole } from "../../api/admin";
import { errorMessage } from "../../api/client";
import { useUser } from "../../auth/AuthProvider";
import { roleLabel } from "../../lib/roles";
import { useQuery } from "../../lib/useQuery";
import type { RootScreenProps } from "../../navigation/types";
import { useTheme } from "../../theme/ThemeProvider";
import { Badge, Body, Button, EmptyState, ErrorState, Field, Icon, InlineError, ListCard, Loading, Select, Sheet, Text } from "../../ui";

const CATEGORY_LABEL: Record<string, string> = { COMMERCIAL: "Commercial", RESIDENTIAL: "Residential", COWORKING: "Coworking", BOTH: "Commercial & residential" };

/*
 * Web: TeamManager roles. A named role (e.g. "Senior Leasing Associate") is a
 * name plus the built-in role it behaves as; what holders can reach is set on
 * each person's page access. Only an admin changes what a role is based on.
 */
export const RolesScreen = ({ navigation }: RootScreenProps<"Roles">) => {
  const me = useUser();
  const { colors } = useTheme();
  const isAdmin = me.role === "ADMIN";
  const { data, loading, error, refreshing, refresh, reload } = useQuery(async () => {
    const [roles, catalogue] = await Promise.all([listCustomRoles(), getRoleCatalogue()]);
    return { roles, catalogue };
  }, []);
  const [editing, setEditing] = useState<CustomRole | null>(null);
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [baseRole, setBaseRole] = useState("EXECUTIVE");
  const [category, setCategory] = useState<BusinessCategory>("COMMERCIAL");
  const [description, setDescription] = useState("");
  const [busy, setBusy] = useState<"save" | "delete" | null>(null);
  const [sheetError, setSheetError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const start = (role: CustomRole | null) => {
    setEditing(role);
    setName(role?.name || "");
    setBaseRole(role?.baseRole || "EXECUTIVE");
    setCategory(role?.businessCategory || "COMMERCIAL");
    setDescription(role?.description || "");
    setSheetError(null);
    setOpen(true);
  };

  useLayoutEffect(() => {
    navigation.setOptions({
      headerRight: () => (
        <Pressable accessibilityRole="button" accessibilityLabel="New role" hitSlop={8} onPress={() => start(null)}>
          <Icon name="add-circle" size={24} color={colors.primary} />
        </Pressable>
      ),
    });
  }, [navigation, colors.primary]);

  const save = async () => {
    if (!name.trim()) return setSheetError("Give the role a name.");
    if (name.trim().length > 60) return setSheetError("Keep the name to 60 characters.");
    setBusy("save");
    setSheetError(null);
    try {
      const result = editing
        ? await updateCustomRole(editing._id, { name: name.trim(), businessCategory: category, ...(isAdmin ? { baseRole } : {}) })
        : await createCustomRole({ name: name.trim(), baseRole, businessCategory: category, description: description.trim() });
      const updated = "usersUpdated" in result && result.usersUpdated ? ` · ${result.usersUpdated} people updated` : "";
      setNotice(`${result.message || "Saved"}${updated}`);
      setOpen(false);
      reload();
    } catch (err) {
      setSheetError(errorMessage(err));
    } finally {
      setBusy(null);
    }
  };

  const remove = async () => {
    if (!editing) return;
    setBusy("delete");
    setSheetError(null);
    try {
      const result = await deleteCustomRole(editing._id);
      setNotice(result.pendingApproval ? result.message || "Delete request sent to an admin." : result.message);
      setOpen(false);
      reload();
    } catch (err) {
      setSheetError(errorMessage(err));
    } finally {
      setBusy(null);
    }
  };

  if (loading) return <Loading />;
  if (error || !data) return <ErrorState message={error || "Couldn't load roles."} onRetry={refresh} />;

  const baseRoles = data.catalogue?.baseRoles || [];
  const categories = data.catalogue?.businessCategories || [];
  const baseLocked = Boolean(editing) && !isAdmin;

  return (
    <Body refreshing={refreshing} onRefresh={refresh}>
      <Text variant="small" color="muted">
        Named roles are job titles your company uses. Each behaves as a built-in role; set what its holders reach on their page access.
      </Text>
      {notice ? (
        <Text variant="smallStrong" color={colors.success}>
          {notice}
        </Text>
      ) : null}

      {!data.roles.length ? (
        <EmptyState icon="id-card-outline" title="No named roles yet" message="Create one, then pick it for people from their profile." />
      ) : (
        <ListCard>
          {data.roles.map((role) => (
            <Pressable key={role._id} accessibilityRole="button" onPress={() => start(role)} style={({ pressed }) => [styles.row, pressed && { backgroundColor: colors.surfaceAlt }]}>
              <View style={styles.flex}>
                <Text variant="bodyStrong" style={styles.name}>
                  {role.name}
                </Text>
                <Text variant="small" color="muted">
                  Works as {roleLabel(role.baseRole)} · {CATEGORY_LABEL[role.businessCategory] || role.businessCategory}
                </Text>
              </View>
              <Icon name="chevron-forward" size={16} color={colors.textFaint} />
            </Pressable>
          ))}
        </ListCard>
      )}
      <Button variant="secondary" icon="add" label="New role" onPress={() => start(null)} />

      <Sheet
        visible={open}
        title={editing ? "Edit role" : "New role"}
        subtitle={editing ? "Renaming changes nobody's access." : undefined}
        onClose={() => setOpen(false)}
        footer={
          <>
            <InlineError message={sheetError} />
            <Button label={editing ? "Save role" : "Create role"} loading={busy === "save"} disabled={Boolean(busy)} onPress={save} />
            {editing ? <Button label="Delete role" variant="ghost" loading={busy === "delete"} disabled={Boolean(busy)} onPress={remove} /> : null}
          </>
        }
      >
        <Field label="Name" value={name} onChangeText={setName} placeholder="e.g. Senior Leasing Associate" maxLength={60} />
        <Select
          label="Works as"
          hint={baseLocked ? "Only an admin can change this." : undefined}
          disabled={baseLocked}
          options={baseRoles.map((key) => ({ key, label: roleLabel(key) }))}
          value={baseRole}
          onChange={setBaseRole}
        />
        <Select label="Business" options={categories.map((key) => ({ key, label: CATEGORY_LABEL[key] || key }))} value={category} onChange={setCategory} />
        {editing && (editing.baseRole !== baseRole || editing.businessCategory !== category) ? (
          <Badge label="Everyone on this role is updated to match" tone="warning" />
        ) : null}
        {!editing ? <Field label="Description (optional)" value={description} onChangeText={setDescription} multiline maxLength={300} /> : null}
      </Sheet>
    </Body>
  );
};

const styles = StyleSheet.create({
  flex: { flex: 1, minWidth: 0 },
  row: { flexDirection: "row", alignItems: "center", gap: 12, padding: 12 },
  name: { fontSize: 14 },
});
