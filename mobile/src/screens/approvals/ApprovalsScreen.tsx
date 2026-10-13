import React, { useMemo, useState } from "react";
import { FlatList, Linking, Pressable, RefreshControl, StyleSheet, View } from "react-native";
import { decide, loadApprovals, reasonRequired, type ApprovalItem, type ApprovalKind } from "../../api/approvals";
import { errorMessage, mediaUrl } from "../../api/client";
import { useUser } from "../../auth/AuthProvider";
import { formatWhen } from "../../lib/format";
import { useQuery } from "../../lib/useQuery";
import type { RootScreenProps } from "../../navigation/types";
import { useTheme } from "../../theme/ThemeProvider";
import { space, type Tone } from "../../theme/tokens";
import { Avatar, Badge, Button, Card, ChipRow, EmptyState, ErrorState, Field, Icon, InlineError, Loading, Text, type IconName } from "../../ui";

const KINDS: { key: "ALL" | ApprovalKind; label: string; icon: IconName }[] = [
  { key: "ALL", label: "All", icon: "file-tray-full-outline" },
  { key: "payment", label: "Payments", icon: "cash-outline" },
  { key: "leave", label: "Leave", icon: "airplane-outline" },
  { key: "delete", label: "Deletes", icon: "trash-outline" },
  { key: "inventory", label: "Inventory", icon: "business-outline" },
  { key: "status", label: "Status", icon: "swap-horizontal-outline" },
  { key: "user", label: "Users", icon: "person-remove-outline" },
];

const STATUS_TONE: Record<string, Tone> = { PENDING: "warning", APPROVED: "success", REJECTED: "danger", CANCELLED: "neutral" };

export const ApprovalsScreen = ({ navigation }: RootScreenProps<"Approvals">) => {
  const user = useUser();
  const { colors } = useTheme();
  const [kind, setKind] = useState<"ALL" | ApprovalKind>("ALL");
  const [show, setShow] = useState<"PENDING" | "DONE">("PENDING");
  const { data, loading, error, refreshing, refresh, reload } = useQuery(loadApprovals, []);

  const items = useMemo(
    () => (data || []).filter((item) => (kind === "ALL" || item.kind === kind) && (show === "PENDING" ? item.status === "PENDING" : item.status !== "PENDING")),
    [data, kind, show],
  );
  const pendingBy = (key: "ALL" | ApprovalKind) => (data || []).filter((item) => item.status === "PENDING" && (key === "ALL" || item.kind === key)).length;

  if (loading) return <Loading />;
  if (error) return <ErrorState message={error} onRetry={refresh} />;

  return (
    <FlatList
      style={{ backgroundColor: colors.bg }}
      contentContainerStyle={[styles.list, !items.length && styles.grow]}
      data={items}
      keyExtractor={(item) => `${item.kind}-${item.id}`}
      ItemSeparatorComponent={() => <View style={styles.separator} />}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={colors.primary} colors={[colors.primary]} />}
      ListHeaderComponent={
        <View style={styles.header}>
          <ChipRow
            options={[
              { key: "PENDING", label: "Waiting on you", count: pendingBy("ALL") },
              { key: "DONE", label: "Decided" },
            ]}
            value={show}
            onChange={(key) => setShow(key as typeof show)}
          />
          <ChipRow options={KINDS.map((item) => ({ key: item.key, label: item.label, count: show === "PENDING" ? pendingBy(item.key) : undefined }))} value={kind} onChange={(key) => setKind(key as typeof kind)} />
        </View>
      }
      ListEmptyComponent={
        <EmptyState icon="checkmark-done-circle-outline" title={show === "PENDING" ? "All clear" : "Nothing decided yet"} message={show === "PENDING" ? "Nothing is waiting for your approval." : undefined} />
      }
      renderItem={({ item }) => <ApprovalCard item={item} role={user.role} onDone={reload} onOpenLead={(leadId) => navigation.navigate("LeadDetail", { leadId })} />}
    />
  );
};

const ApprovalCard = ({ item, role, onDone, onOpenLead }: { item: ApprovalItem; role: string; onDone: () => void; onOpenLead: (id: string) => void }) => {
  const { colors } = useTheme();
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState<"approve" | "reject" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [writing, setWriting] = useState(false);
  const meta = KINDS.find((entry) => entry.key === item.kind)!;
  const pending = item.status === "PENDING";

  const act = async (approve: boolean) => {
    if (reasonRequired(item.kind, approve) && !note.trim()) {
      setWriting(true);
      return setError("Add a reason so the requester knows why.");
    }
    setBusy(approve ? "approve" : "reject");
    setError(null);
    try {
      await decide(item, approve, note, role);
      onDone();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(null);
    }
  };

  return (
    <Card style={styles.card}>
      <View style={styles.top}>
        <View style={[styles.kindIcon, { backgroundColor: colors.primarySoft }]}>
          <Icon name={meta.icon} size={18} color={colors.primary} />
        </View>
        <View style={styles.flex}>
          <Text variant="bodyStrong">{item.title}</Text>
          <Text variant="small" color="muted">
            {item.detail}
          </Text>
        </View>
        <Badge label={item.status.charAt(0) + item.status.slice(1).toLowerCase()} tone={STATUS_TONE[item.status] || "neutral"} />
      </View>
      {item.note ? (
        <Text variant="small" style={[styles.note, { backgroundColor: colors.surfaceAlt }]}>
          “{item.note}”
        </Text>
      ) : null}
      {(item.documents || []).map((doc) => (
        <Pressable key={doc.url} accessibilityRole="link" onPress={() => Linking.openURL(mediaUrl(doc.url) || doc.url)} style={styles.doc}>
          <Icon name="document-attach-outline" size={16} color={colors.primary} />
          <Text variant="small" color="primary" numberOfLines={1}>
            {doc.name || "Document"}
          </Text>
        </Pressable>
      ))}
      <View style={styles.by}>
        {item.requestedBy?.name ? <Avatar name={item.requestedBy.name} uri={item.requestedBy.profileImageUrl} size={20} /> : null}
        <Text variant="tiny" color="faint" style={styles.flex}>
          {[item.requestedBy?.name, formatWhen(item.createdAt)].filter(Boolean).join(" · ")}
        </Text>
        {item.leadId ? (
          <Pressable accessibilityRole="link" onPress={() => onOpenLead(item.leadId!)} hitSlop={8}>
            <Text variant="smallStrong" color="primary">
              Open lead
            </Text>
          </Pressable>
        ) : null}
      </View>
      {pending ? (
        <>
          {writing ? <Field value={note} onChangeText={setNote} placeholder="Note for the requester (optional unless rejecting)" multiline maxLength={500} /> : null}
          <InlineError message={error} />
          <View style={styles.actions}>
            {!writing ? <Button label="Add note" variant="ghost" size="sm" onPress={() => setWriting(true)} /> : null}
            <View style={styles.flex} />
            <Button label="Reject" variant="danger" size="sm" loading={busy === "reject"} onPress={() => act(false)} />
            <Button
              label={item.kind === "inventory" && role !== "ADMIN" ? "Pre-approve" : "Approve"}
              icon="checkmark"
              size="sm"
              loading={busy === "approve"}
              onPress={() => act(true)}
            />
          </View>
        </>
      ) : null}
    </Card>
  );
};

const styles = StyleSheet.create({
  flex: { flex: 1 },
  grow: { flexGrow: 1 },
  list: { paddingVertical: space.lg },
  header: { gap: space.sm, marginBottom: space.md },
  separator: { height: space.sm },
  card: { gap: space.sm, marginHorizontal: space.lg },
  top: { flexDirection: "row", alignItems: "flex-start", gap: space.md },
  kindIcon: { width: 34, height: 34, borderRadius: 10, alignItems: "center", justifyContent: "center" },
  note: { padding: space.sm, borderRadius: 8 },
  doc: { flexDirection: "row", alignItems: "center", gap: 6 },
  by: { flexDirection: "row", alignItems: "center", gap: space.sm },
  actions: { flexDirection: "row", alignItems: "center", gap: space.sm },
});
