import React, { useMemo, useState } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { listUsers } from "../../api/users";
import { useUser } from "../../auth/AuthProvider";
import { ROLE_LABELS, roleLabel } from "../../lib/roles";
import { useQuery } from "../../lib/useQuery";
import type { RootScreenProps } from "../../navigation/types";
import { useTheme } from "../../theme/ThemeProvider";
import { Avatar, Badge, Body, FilterBar, EmptyState, ErrorState, Field, HeaderButton, Icon, ListCard, Loading, Text } from "../../ui";

/* Everyone the admin or manager may manage; tap through to role, page access and password. */
export const UsersScreen = ({ route, navigation }: RootScreenProps<"Users">) => {
  const me = useUser();
  const { colors } = useTheme();
  const [query, setQuery] = useState("");
  const [role, setRole] = useState("ALL");
  const [showInactive, setShowInactive] = useState(false);
  const { data, loading, error, refreshing, refresh } = useQuery(() => listUsers(), []);
  const accessMode = route.params?.focus === "access";

  React.useLayoutEffect(() => {
    navigation.setOptions({
      title: accessMode ? "Page access" : "Users",
      headerRight: () => <HeaderButton icon="person-add" label="Add user" variant="secondary" onPress={() => navigation.navigate("AddUser")} />,
    });
  }, [navigation, accessMode]);

  const roles = useMemo(() => [...new Set((data || []).map((user) => user.role))], [data]);
  const rows = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return (data || [])
      .filter((user) => (showInactive ? user.isActive === false : user.isActive !== false))
      .filter((user) => role === "ALL" || user.role === role)
      .filter((user) => !needle || `${user.name} ${user.email || ""} ${user.phone || ""}`.toLowerCase().includes(needle))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [data, query, role, showInactive]);

  if (loading) return <Loading />;
  if (error) return <ErrorState message={error} onRetry={refresh} />;

  return (
    <Body refreshing={refreshing} onRefresh={refresh}>
      {accessMode ? (
        <View style={[styles.note, { backgroundColor: colors.primarySoft }]}>
          <Icon name="key" size={16} color={colors.primary} />
          <Text variant="small" color={colors.primary} style={styles.flex}>
            Pick a person to choose which modules they can open.
          </Text>
        </View>
      ) : null}
      <Field icon="search" compact surface value={query} onChangeText={setQuery} placeholder="Search name, email or phone" autoCorrect={false} />
      <FilterBar
        filters={[
          {
            label: "Role",
            icon: "people-outline",
            options: [
              { key: "ALL", label: "All roles", count: (data || []).filter((user) => (showInactive ? user.isActive === false : user.isActive !== false)).length },
              ...roles.map((key) => ({ key, label: ROLE_LABELS[key as keyof typeof ROLE_LABELS] || key, count: (data || []).filter((user) => user.role === key && (showInactive ? user.isActive === false : user.isActive !== false)).length })),
            ],
            value: role,
            onChange: setRole,
          },
          {
            label: "Status",
            icon: "power-outline",
            options: [
              { key: "ACTIVE", label: "Active" },
              { key: "INACTIVE", label: "Deactivated" },
            ],
            value: showInactive ? "INACTIVE" : "ACTIVE",
            onChange: (key: string) => setShowInactive(key === "INACTIVE"),
          },
        ]}
      />
      {rows.length ? (
        <ListCard>
          {rows.map((user) => (
            <Pressable key={user._id} accessibilityRole="button" onPress={() => navigation.navigate("UserDetail", { id: user._id, name: user.name })} style={styles.row}>
              <Avatar name={user.name} uri={user.profileImageUrl} size={40} tinted />
              <View style={styles.flex}>
                <Text variant="bodyStrong" numberOfLines={1} style={styles.name}>
                  {user.name}
                  {user._id === (me.id || me._id) ? " (you)" : ""}
                </Text>
                <Text variant="small" color="muted" numberOfLines={1}>
                  {[roleLabel(user.role), user.branch, user.email].filter(Boolean).join(" · ")}
                </Text>
              </View>
              {user.isActive === false ? <Badge label="Inactive" tone="neutral" /> : null}
              <Icon name="chevron-forward" size={16} color={colors.textFaint} />
            </Pressable>
          ))}
        </ListCard>
      ) : (
        <EmptyState icon="people-outline" title="No one matches" message="Try another name or role." />
      )}
    </Body>
  );
};

const styles = StyleSheet.create({
  flex: { flex: 1, minWidth: 0 },
  note: { flexDirection: "row", gap: 8, alignItems: "center", borderRadius: 14, padding: 12 },
  strip: { flexGrow: 0 },
  row: { flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: 14, paddingVertical: 11 },
  name: { fontSize: 14 },
  inactive: { alignSelf: "center", padding: 6 },
});
