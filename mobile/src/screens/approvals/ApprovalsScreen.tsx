import React, { useMemo, useState } from "react";
import { FlatList, Linking, Pressable, RefreshControl, StyleSheet, View } from "react-native";
import { decide, loadApprovals, reasonRequired, type ApprovalItem, type ApprovalKind } from "../../api/approvals";
import { errorMessage, mediaUrl } from "../../api/client";
import { useUser } from "../../auth/AuthProvider";
import { formatWhen } from "../../lib/format";
import { useQuery } from "../../lib/useQuery";
import type { RootScreenProps } from "../../navigation/types";
import { useTheme } from "../../theme/ThemeProvider";
import { space, toneColors, type Tone } from "../../theme/tokens";
import { Avatar, Badge, Button, Card, FilterBar, EmptyState, ErrorState, Field, Icon, InlineError, Loading, Text, type IconName } from "../../ui";

const KINDS: { key: "ALL" | ApprovalKind; label: string; icon: IconName; tone: Tone }[] = [
  { key: "ALL", label: "All", icon: "file-tray-full-outline", tone: "primary" },
  { key: "leave", label: "Leave", icon: "airplane", tone: "primary" },
  { key: "delete", label: "Deletes", icon: "trash", tone: "danger" },
  { key: "fix", label: "Fixes", icon: "time", tone: "warning" },
  { key: "payment", label: "Payments", icon: "cash", tone: "success" },
  { key: "inventory", label: "Inventory", icon: "business", tone: "primary" },
  { key: "status", label: "Status", icon: "swap-horizontal", tone: "violet" },
  { key: "user", label: "Users", icon: "person-remove", tone: "danger" },
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
          <FilterBar
            inset
            filters={[
              {
                label: "Type",
                icon: "file-tray-full-outline",
                options: KINDS.filter((item) => item.key === "ALL" || (data || []).some((entry) => entry.kind === item.key)).map((item) => ({
                  key: item.key,
                  label: item.key === "ALL" ? "Everything" : item.label,
                  count: show === "PENDING" ? pendingBy(item.key) : undefined,
                })),
                value: kind,
                onChange: (key: string) => setKind(key as typeof kind),
              },
              {
                label: "Show",
                icon: "time-outline",
                options: [
                  { key: "PENDING", label: "Waiting", count: pendingBy("ALL"), hint: "Needs your decision" },
                  { key: "DONE", label: "Decided", hint: "Approved or rejected" },
                ],
                value: show,
                onChange: (key: string) => setShow(key as typeof show),
              },
            ]}
          />
        </View>
      }
      ListEmptyComponent={
        <EmptyState icon="checkmark-done-circle-outline" title={show === "PENDING" ? "All clear" : "Nothing decided yet"} message={show === "PENDING" ? "Nothing is waiting for your approval." : undefined} />
      }
      renderItem={({ item }) => <ApprovalCard item={item} role={user.role} onDone={reload} onOpenLead={(leadId) => navigation.navigate("LeadDetail", { leadId })} />}
    />
  );
};

const ago = (value?: string) => {
  if (!value) return "";
  const minutes = Math.max(0, Math.round((Date.now() - new Date(value).getTime()) / 60000));
  if (minutes < 60) return `${minutes}m`;
  if (minutes < 60 * 24) return `${Math.round(minutes / 60)}h`;
  if (minutes < 60 * 48) return "Yesterday";
  return new Date(value).toLocaleDateString("en-IN", { day: "numeric", month: "short" });
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
        <View style={[styles.kindIcon, { backgroundColor: toneColors(colors, meta.tone).bg }]}>
          <Icon name={meta.icon} size={18} color={toneColors(colors, meta.tone).fg} />
        </View>
        <View style={styles.flex}>
          <View style={styles.titleRow}>
            <Text variant="bodyStrong" style={[styles.flex, styles.title]}>
              {item.title}
            </Text>
            {pending ? (
              <Text variant="tiny" color="faint">
                {ago(item.createdAt)}
              </Text>
            ) : (
              <Badge label={item.status.charAt(0) + item.status.slice(1).toLowerCase()} tone={STATUS_TONE[item.status] || "neutral"} />
            )}
          </View>
          <Text variant="small" color="muted">
            {item.detail}
            {item.note ? ` — “${item.note}”` : ""}
          </Text>
        </View>
      </View>
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
        {pending && !writing ? (
          <Pressable accessibilityRole="button" onPress={() => setWriting(true)} hitSlop={8}>
            <Text variant="smallStrong" color="primary">
              Note
            </Text>
          </Pressable>
        ) : null}
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
            <Pressable accessibilityRole="button" onPress={() => act(false)} disabled={Boolean(busy)} style={[styles.reject, { borderColor: colors.border }]}>
              <Text variant="bodyStrong" color="danger">
                {busy === "reject" ? "Rejecting…" : item.kind === "fix" ? "Warn" : "Reject"}
              </Text>
            </Pressable>
            <Button
              label={item.kind === "inventory" && role !== "ADMIN" ? "Pre-approve" : item.kind === "fix" ? "Excuse" : "Approve"}
              size="sm"
              style={[styles.flex, styles.approve]}
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
  chipStrip: { flexGrow: 0 },
  chipScroll: { gap: 6, paddingHorizontal: space.lg, alignItems: "center" },
  toggle: { alignSelf: "flex-end", paddingHorizontal: space.lg },
  approve: { minHeight: 42, height: 42, borderRadius: 12 },
  titleRow: { flexDirection: "row", alignItems: "flex-start", gap: 8 },
  title: { fontSize: 14 },
  reject: { flex: 1, height: 42, borderRadius: 12, borderWidth: 1, alignItems: "center", justifyContent: "center" },
  separator: { height: space.sm },
  card: { gap: space.sm, marginHorizontal: space.lg },
  top: { flexDirection: "row", alignItems: "flex-start", gap: space.md },
  kindIcon: { width: 38, height: 38, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  note: { padding: space.sm, borderRadius: 8 },
  doc: { flexDirection: "row", alignItems: "center", gap: 6 },
  by: { flexDirection: "row", alignItems: "center", gap: space.sm },
  actions: { flexDirection: "row", alignItems: "center", gap: 8 },
});
