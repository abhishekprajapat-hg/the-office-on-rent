import React, { useLayoutEffect, useMemo, useState } from "react";
import { FlatList, Pressable, RefreshControl, StyleSheet, View } from "react-native";
import { useNavigation } from "@react-navigation/native";
import { errorMessage } from "../../api/client";
import { assignLead, listLeads } from "../../api/leads";
import type { Lead } from "../../api/types";
import { listUsers, rebalanceExecutives } from "../../api/users";
import { roleLabel } from "../../lib/roles";
import { useQuery } from "../../lib/useQuery";
import { useTheme } from "../../theme/ThemeProvider";
import { gutter } from "../../theme/tokens";
import { ActionSheet, CheckSquare, EmptyState, ErrorState, Icon, InlineError, Loading, Text } from "../../ui";
import { PickerSheet } from "../../ui/PickerSheet";

const DAY = 24 * 60 * 60 * 1000;

const sourceLabel = (lead: Lead) => lead.sourceChannel || (lead.source === "META" ? "Meta ads" : "Manual");

/* "6 min ago" / "1h ago" / "Yesterday" / "2 days" */
const age = (value?: string) => {
  if (!value) return "";
  const ms = Date.now() - new Date(value).getTime();
  const minutes = Math.floor(ms / 60000);
  if (minutes < 60) return `${Math.max(1, minutes)} min ago`;
  if (minutes < 24 * 60) return `${Math.floor(minutes / 60)}h ago`;
  const days = Math.floor(ms / DAY);
  return days === 1 ? "Yesterday" : `${days} days`;
};

/* Design 21 - unassigned leads a manager hands out. Web: leads "Unassigned" view + /users/rebalance-executives. */
export const LeadPoolScreen = () => {
  const navigation = useNavigation();
  const { colors } = useTheme();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [picking, setPicking] = useState(false);
  const [confirmAuto, setConfirmAuto] = useState(false);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const { data, loading, error, refreshing, refresh } = useQuery(async () => {
    const [pool, team] = await Promise.all([
      listLeads({ page: 1, limit: 100, extra: { assignedTo: "UNASSIGNED", sortBy: "createdAt" } }),
      listUsers().catch(() => []),
    ]);
    return { leads: pool.leads, total: pool.pagination?.totalCount ?? pool.leads.length, team };
  }, []);

  useLayoutEffect(() => {
    navigation.setOptions({
      headerRight: () => (
        <Pressable accessibilityRole="button" onPress={() => setConfirmAuto(true)} hitSlop={8}>
          <Text variant="smallStrong" color="primary">
            Auto-assign
          </Text>
        </Pressable>
      ),
    });
  }, [navigation]);

  const leads = data?.leads || [];
  const older = leads.filter((lead) => lead.createdAt && Date.now() - new Date(lead.createdAt).getTime() > DAY).length;
  const people = useMemo(
    () =>
      (data?.team || [])
        .filter((person) => person.isActive !== false && !["ADMIN", "CHANNEL_PARTNER", "COWORKING_ADMIN"].includes(person.role))
        .map((person) => ({ key: person._id, label: person.name, sub: [roleLabel(person.role), person.branch].filter(Boolean).join(" · "), avatar: true })),
    [data?.team],
  );

  const toggle = (id: string) =>
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const assignTo = async (userId: string) => {
    setPicking(false);
    setBusy(true);
    setActionError(null);
    const ids = [...selected];
    const results = await Promise.allSettled(ids.map((id) => assignLead(id, userId, "Assigned from the lead pool")));
    const failed = results.filter((result) => result.status === "rejected");
    const who = people.find((person) => person.key === userId)?.label || "teammate";
    setNotice(`${ids.length - failed.length} lead${ids.length - failed.length === 1 ? "" : "s"} assigned to ${who}.`);
    if (failed.length) setActionError(`${failed.length} couldn't be assigned: ${errorMessage((failed[0] as PromiseRejectedResult).reason)}`);
    setSelected(new Set());
    setBusy(false);
    refresh();
  };

  const autoAssign = async () => {
    setBusy(true);
    setActionError(null);
    try {
      const result = await rebalanceExecutives();
      setNotice(result.message || "Leads spread across the team.");
      refresh();
    } catch (err) {
      setActionError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  if (loading) return <Loading />;
  if (error) return <ErrorState message={error} onRetry={refresh} />;

  const header = (
    <View style={styles.headerBlock}>
      <View style={styles.tiles}>
        <View style={[styles.tile, { backgroundColor: colors.hero }]}>
          <Text variant="stat" color={colors.onPrimary}>
            {String(data?.total ?? 0)}
          </Text>
          <Text variant="smallStrong" color={colors.onPrimaryMuted} style={styles.tileLabel}>
            Unassigned
          </Text>
        </View>
        <View style={[styles.tile, { backgroundColor: colors.surface, borderColor: colors.border, borderWidth: 1 }]}>
          <Text variant="stat" color={colors.warning}>
            {String(older)}
          </Text>
          <Text variant="smallStrong" color="muted" style={styles.tileLabel}>
            Older than 24h
          </Text>
        </View>
      </View>
      {selected.size ? (
        <View style={[styles.bar, { backgroundColor: colors.ink }]}>
          <Pressable accessibilityRole="button" accessibilityLabel="Clear selection" onPress={() => setSelected(new Set())} style={[styles.barCheck, { backgroundColor: colors.onInk }]}>
            <Icon name="checkmark" size={14} color={colors.ink} />
          </Pressable>
          <Text variant="bodyStrong" color={colors.onInk} style={styles.flex}>
            {selected.size} selected
          </Text>
          <Pressable accessibilityRole="button" onPress={() => setPicking(true)} style={[styles.assign, { backgroundColor: colors.primary }]} disabled={busy}>
            <Text variant="smallStrong" color={colors.onPrimary}>
              {busy ? "Assigning…" : "Assign to…"}
            </Text>
          </Pressable>
        </View>
      ) : null}
      {notice ? (
        <View style={[styles.notice, { backgroundColor: colors.successSoft }]}>
          <Text variant="small" color={colors.success}>
            {notice}
          </Text>
        </View>
      ) : null}
      <InlineError message={actionError} />
    </View>
  );

  return (
    <>
      <FlatList
        style={{ backgroundColor: colors.bg }}
        data={leads}
        keyExtractor={(lead) => lead._id}
        ListHeaderComponent={header}
        contentContainerStyle={[styles.list, !leads.length && styles.grow]}
        ItemSeparatorComponent={() => <View style={styles.sep} />}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={colors.primary} colors={[colors.primary]} />}
        ListEmptyComponent={<EmptyState icon="file-tray-outline" title="The pool is empty" message="Every lead has an owner. New unassigned leads land here." />}
        renderItem={({ item }) => {
          const on = selected.has(item._id);
          const old = item.createdAt && Date.now() - new Date(item.createdAt).getTime() > DAY;
          return (
            <Pressable
              onPress={() => toggle(item._id)}
              onLongPress={() => navigation.navigate("LeadDetail", { leadId: item._id, name: item.name })}
              accessibilityRole="checkbox"
              accessibilityState={{ checked: on }}
              accessibilityLabel={item.name}
              style={[styles.card, { backgroundColor: colors.surface, borderColor: on ? colors.primary : colors.border }]}
            >
              <CheckSquare checked={on} size={20} />
              <View style={styles.flex}>
                <Text variant="bodyStrong" numberOfLines={1} style={styles.name}>
                  {item.name}
                </Text>
                <Text variant="small" color="muted" numberOfLines={1} style={styles.sub}>
                  {[item.projectInterested, item.city].filter(Boolean).join(" · ") || item.phone}
                </Text>
              </View>
              <View style={styles.meta}>
                <View style={[styles.src, { backgroundColor: colors.surfaceAlt }]}>
                  <Text variant="tiny" color="muted">
                    {sourceLabel(item)}
                  </Text>
                </View>
                <Text variant="tiny" color={old ? colors.warning : colors.textFaint} style={styles.age}>
                  {age(item.createdAt)}
                </Text>
              </View>
            </Pressable>
          );
        }}
      />
      <PickerSheet
        visible={picking}
        title={`Assign ${selected.size} lead${selected.size === 1 ? "" : "s"}`}
        subtitle="They move with their tasks and history."
        items={people}
        onPick={assignTo}
        onClose={() => setPicking(false)}
        searchPlaceholder="Search teammates"
      />
      <ActionSheet
        visible={confirmAuto}
        title="Spread open leads evenly across the team, including every unassigned lead?"
        onClose={() => setConfirmAuto(false)}
        actions={[{ key: "go", label: "Auto-assign now", icon: "shuffle", onPress: autoAssign }]}
      />
    </>
  );
};

const styles = StyleSheet.create({
  flex: { flex: 1, minWidth: 0 },
  grow: { flexGrow: 1 },
  list: { padding: gutter, paddingBottom: 40 },
  headerBlock: { gap: 10, marginBottom: 10 },
  tiles: { flexDirection: "row", gap: 8 },
  tile: { flex: 1, borderRadius: 16, padding: 12 },
  tileLabel: { fontSize: 11.5, fontFamily: "PlusJakartaSans_600SemiBold" },
  bar: { flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 10, paddingHorizontal: 12, borderRadius: 14 },
  barCheck: { width: 20, height: 20, borderRadius: 6, alignItems: "center", justifyContent: "center" },
  assign: { paddingHorizontal: 10, paddingVertical: 6, borderRadius: 10 },
  notice: { borderRadius: 12, padding: 10 },
  sep: { height: 6 },
  card: { flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 11, paddingHorizontal: 12, borderRadius: 15, borderWidth: 1.5 },
  name: { fontSize: 13.5 },
  sub: { fontSize: 11.5 },
  meta: { alignItems: "flex-end", gap: 2 },
  src: { paddingHorizontal: 7, paddingVertical: 2, borderRadius: 999 },
  age: { fontFamily: "PlusJakartaSans_600SemiBold" },
});
