import React, { useLayoutEffect, useState } from "react";
import { FlatList, Modal, Pressable, RefreshControl, StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { errorMessage } from "../../api/client";
import { assignLead, listLeads } from "../../api/leads";
import type { Lead } from "../../api/types";
import { listUsers, type TeamUser } from "../../api/users";
import { LeadRow } from "../../components/LeadRow";
import { roleLabel } from "../../lib/roles";
import { useQuery } from "../../lib/useQuery";
import type { RootScreenProps } from "../../navigation/types";
import { useTheme } from "../../theme/ThemeProvider";
import { radius, space } from "../../theme/tokens";
import { Avatar, Button, EmptyState, ErrorState, Icon, InlineError, Loading, Text } from "../../ui";

const TARGET_ROLES = ["ADMIN", "MANAGER", "INSIDE_EXECUTIVE", "EXECUTIVE", "FIELD_EXECUTIVE"];

/*
 * One person's (or the unassigned) open leads, with the web's selection bar:
 * tick several and hand them to someone else in one go.
 */
export const PersonLeadsScreen = ({ route, navigation }: RootScreenProps<"PersonLeads">) => {
  const { assignedTo, name } = route.params;
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const [selected, setSelected] = useState<string[]>([]);
  const [picking, setPicking] = useState(false);
  const [people, setPeople] = useState<TeamUser[]>([]);
  const [moving, setMoving] = useState(false);
  const [result, setResult] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const { data, loading, error: loadError, refreshing, refresh, reload } = useQuery(
    async () => (await listLeads({ page: 1, limit: 100, extra: { assignedTo } })).leads,
    [assignedTo],
  );

  useLayoutEffect(() => {
    navigation.setOptions({ title: name });
  }, [navigation, name]);

  const toggle = (lead: Lead) => setSelected((list) => (list.includes(lead._id) ? list.filter((id) => id !== lead._id) : [...list, lead._id]));

  const openPicker = async () => {
    setPicking(true);
    if (!people.length) {
      const users = await listUsers().catch(() => []);
      setPeople(users.filter((user) => user.isActive !== false && TARGET_ROLES.includes(user.role) && user._id !== assignedTo).sort((a, b) => a.name.localeCompare(b.name)));
    }
  };

  /* One request per lead (the API assigns one at a time); failures are counted, not fatal. */
  const moveTo = async (person: TeamUser) => {
    setPicking(false);
    setMoving(true);
    setError(null);
    let moved = 0;
    const failures: string[] = [];
    for (const id of selected) {
      try {
        await assignLead(id, person._id, `Bulk reassigned from ${name}`);
        moved += 1;
      } catch (err) {
        failures.push(errorMessage(err));
      }
    }
    setMoving(false);
    setSelected([]);
    setResult(`${moved} lead${moved === 1 ? "" : "s"} moved to ${person.name}.`);
    if (failures.length) setError(`${failures.length} couldn't be moved: ${failures[0]}`);
    reload();
  };

  if (loading) return <Loading />;
  if (loadError) return <ErrorState message={loadError} onRetry={refresh} />;

  const leads = data || [];

  return (
    <View style={[styles.root, { backgroundColor: colors.bg }]}>
      {result || error ? (
        <View style={styles.banner}>
          {result ? (
            <Text variant="small" color="primary">
              {result}
            </Text>
          ) : null}
          <InlineError message={error} />
        </View>
      ) : null}
      <FlatList
        data={leads}
        keyExtractor={(lead) => lead._id}
        contentContainerStyle={[styles.list, !leads.length && styles.grow]}
        ItemSeparatorComponent={() => <View style={styles.separator} />}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={colors.primary} colors={[colors.primary]} />}
        ListHeaderComponent={
          leads.length ? (
            <Text variant="small" color="muted" style={styles.hint}>
              Tick leads to reassign them together.
            </Text>
          ) : null
        }
        ListEmptyComponent={<EmptyState icon="checkmark-done" title="No leads here" />}
        renderItem={({ item }) => {
          const isOn = selected.includes(item._id);
          return (
            <View style={styles.item}>
              <Pressable accessibilityRole="checkbox" accessibilityState={{ checked: isOn }} accessibilityLabel={`Select ${item.name}`} hitSlop={8} onPress={() => toggle(item)}>
                <Icon name={isOn ? "checkbox" : "square-outline"} size={24} color={isOn ? colors.primary : colors.textFaint} />
              </Pressable>
              <View style={styles.flex}>
                <LeadRow lead={item} onPress={() => navigation.navigate("LeadDetail", { leadId: item._id, name: item.name })} />
              </View>
            </View>
          );
        }}
      />
      {selected.length ? (
        <View style={[styles.bar, { backgroundColor: colors.surface, borderTopColor: colors.border, paddingBottom: insets.bottom + space.md }]}>
          <Text variant="bodyStrong" style={styles.flex}>
            {selected.length} selected
          </Text>
          <Button label="Clear" variant="ghost" size="sm" onPress={() => setSelected([])} />
          <Button label="Reassign" icon="swap-horizontal" size="sm" loading={moving} onPress={openPicker} />
        </View>
      ) : null}

      <Modal transparent visible={picking} animationType="fade" onRequestClose={() => setPicking(false)}>
        <Pressable style={[styles.backdrop, { backgroundColor: colors.overlay }]} onPress={() => setPicking(false)}>
          <Pressable style={[styles.sheet, { backgroundColor: colors.surface, paddingBottom: insets.bottom + space.lg }]}>
            <Text variant="heading" style={styles.sheetTitle}>
              Move {selected.length} lead{selected.length === 1 ? "" : "s"} to
            </Text>
            <FlatList
              data={people}
              keyExtractor={(person) => person._id}
              style={styles.peopleList}
              ListEmptyComponent={<Loading />}
              renderItem={({ item }) => (
                <Pressable accessibilityRole="button" onPress={() => moveTo(item)} style={({ pressed }) => [styles.person, pressed && { backgroundColor: colors.surfaceAlt }]}>
                  <Avatar name={item.name} uri={item.profileImageUrl} size={34} />
                  <View style={styles.flex}>
                    <Text variant="body">{item.name}</Text>
                    <Text variant="tiny" color="faint">
                      {roleLabel(item.role)}
                    </Text>
                  </View>
                </Pressable>
              )}
            />
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
};

const styles = StyleSheet.create({
  root: { flex: 1 },
  flex: { flex: 1 },
  grow: { flexGrow: 1 },
  banner: { paddingHorizontal: space.lg, paddingTop: space.md, gap: space.sm },
  list: { padding: space.lg, paddingBottom: 120 },
  hint: { marginBottom: space.sm },
  separator: { height: space.sm },
  item: { flexDirection: "row", alignItems: "center", gap: space.sm },
  bar: { flexDirection: "row", alignItems: "center", gap: space.sm, paddingHorizontal: space.lg, paddingTop: space.md, borderTopWidth: StyleSheet.hairlineWidth },
  backdrop: { flex: 1, justifyContent: "flex-end" },
  sheet: { borderTopLeftRadius: radius.xl, borderTopRightRadius: radius.xl, paddingTop: space.lg, maxHeight: "75%" },
  sheetTitle: { paddingHorizontal: space.xl, paddingBottom: space.sm },
  peopleList: { flexGrow: 0 },
  person: { flexDirection: "row", alignItems: "center", gap: space.md, paddingHorizontal: space.xl, paddingVertical: space.md },
});
