import React, { useLayoutEffect, useState } from "react";
import { Linking, Platform, Pressable, ScrollView, StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { errorMessage } from "../../api/client";
import { deleteLead, getDiary, getLeadActivity, getLeadDetail } from "../../api/leads";
import { listTasks } from "../../api/tasks";
import { useUser } from "../../auth/AuthProvider";
import { dialable, isOverdue, whatsappNumber } from "../../lib/format";
import { leadTemperature, statusMeta, TEMPERATURE } from "../../lib/leadStatus";
import { isManagement } from "../../lib/roles";
import { useQuery } from "../../lib/useQuery";
import type { RootScreenProps } from "../../navigation/types";
import { useTheme } from "../../theme/ThemeProvider";
import { radius, space } from "../../theme/tokens";
import { ActionSheet, type SheetAction } from "../../ui/ActionSheet";
import { Avatar, Badge, Body, Button, Card, ErrorState, Icon, InlineError, Loading, Text, type IconName } from "../../ui";
import { LeadActivityTab, LeadNotesTab, LeadOverviewTab, LeadPropertiesTab, LeadRequirementsTab } from "./LeadDetailTabs";

const TABS = [
  { key: "overview", label: "Overview" },
  { key: "requirements", label: "Requirements" },
  { key: "properties", label: "Properties" },
  { key: "notes", label: "Notes" },
  { key: "activity", label: "Tasks & activity" },
] as const;

type TabKey = (typeof TABS)[number]["key"];

export const LeadDetailScreen = ({ route, navigation }: RootScreenProps<"LeadDetail">) => {
  const { leadId, name } = route.params;
  const user = useUser();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const [tab, setTab] = useState<TabKey>("overview");
  const [menuOpen, setMenuOpen] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const query = useQuery(async () => {
    const [lead, activity, diary, tasks] = await Promise.all([
      getLeadDetail(leadId),
      getLeadActivity(leadId, 40).catch(() => []),
      getDiary(leadId).catch(() => []),
      listTasks({ leadId }).catch(() => []),
    ]);
    if (!lead) throw new Error("This lead no longer exists.");
    return { lead, activity, diary, tasks };
  }, [leadId]);
  const { data, loading, error, refreshing, refresh, reload } = query;

  useLayoutEffect(() => {
    navigation.setOptions({
      title: data?.lead.name || name || "Lead",
      headerRight: () => (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="More lead actions"
          hitSlop={10}
          onPress={() => setMenuOpen(true)}
          style={Platform.OS === "web" ? styles.webInset : undefined}
        >
          <Icon name="ellipsis-horizontal-circle" size={26} color={colors.primary} />
        </Pressable>
      ),
    });
  }, [navigation, data?.lead.name, name, colors.primary]);

  if (loading) return <Loading />;
  if (error || !data) return <ErrorState message={error || "Couldn't load this lead."} onRetry={refresh} />;

  const { lead } = data;
  const status = statusMeta(lead.status);
  const temperature = TEMPERATURE[leadTemperature(lead)];
  const phone = dialable(lead.phone);
  const canDelete = isManagement(user.role);

  const contact: { icon: IconName; label: string; onPress?: () => void }[] = [
    { icon: "call", label: "Call", onPress: phone ? () => Linking.openURL(`tel:${phone}`) : undefined },
    { icon: "logo-whatsapp", label: "WhatsApp", onPress: phone ? () => Linking.openURL(`https://wa.me/${whatsappNumber(lead.phone)}`) : undefined },
    { icon: "mail", label: "Email", onPress: lead.email ? () => Linking.openURL(`mailto:${lead.email}`) : undefined },
    { icon: "chatbubble-ellipses", label: "SMS", onPress: phone ? () => Linking.openURL(`sms:${phone}`) : undefined },
  ];

  const runDelete = async () => {
    setActionError(null);
    try {
      const result = await deleteLead(lead._id);
      if (result.pendingApproval) {
        setNotice(result.message || "Delete request sent. An admin will review it.");
        setConfirmDelete(false);
      } else {
        navigation.goBack();
      }
    } catch (err) {
      setActionError(errorMessage(err));
      setConfirmDelete(false);
    }
  };

  const menu: SheetAction[] = [
    { key: "edit", label: "Edit details", icon: "create-outline", onPress: () => navigation.navigate("EditLead", { leadId: lead._id }) },
    { key: "req", label: "Edit requirements", icon: "options-outline", onPress: () => navigation.navigate("EditRequirements", { leadId: lead._id }) },
    { key: "transfer", label: "Transfer lead", icon: "swap-horizontal-outline", hint: "Hand it to a teammate", onPress: () => navigation.navigate("TransferLead", { leadId: lead._id }) },
    { key: "task", label: "Add task", icon: "add-circle-outline", onPress: () => navigation.navigate("NewTask", { leadId: lead._id, leadName: lead.name }) },
    ...(canDelete
      ? [{ key: "delete", label: "Delete lead", icon: "trash-outline" as IconName, destructive: true, hint: user.role === "ADMIN" ? undefined : "Needs an admin's approval", onPress: () => setConfirmDelete(true) }]
      : []),
  ];

  return (
    <View style={styles.flex}>
      <Body refreshing={refreshing} onRefresh={refresh} style={styles.body}>
        <Card style={styles.hero}>
          <Avatar name={lead.name} size={64} />
          <Text variant="title" align="center">
            {lead.name}
          </Text>
          <Text variant="body" color="muted">
            {lead.phone}
          </Text>
          <View style={styles.badges}>
            <Badge label={status.label} tone={status.tone} />
            {temperature ? <Badge label={temperature.label} tone={temperature.tone} /> : null}
            {isOverdue(lead.nextFollowUp) ? <Badge label="Follow-up overdue" tone="danger" /> : null}
          </View>
          <View style={styles.actions}>
            {contact.map((action) => (
              <Pressable
                key={action.label}
                accessibilityRole="button"
                accessibilityLabel={action.label}
                disabled={!action.onPress}
                onPress={action.onPress}
                style={({ pressed }) => [styles.action, { opacity: action.onPress ? (pressed ? 0.6 : 1) : 0.35 }]}
              >
                <View style={[styles.actionIcon, { backgroundColor: colors.primarySoft }]}>
                  <Icon name={action.icon} size={20} color={colors.primary} />
                </View>
                <Text variant="tiny" color="muted">
                  {action.label}
                </Text>
              </Pressable>
            ))}
          </View>
        </Card>

        {notice ? (
          <Card style={{ backgroundColor: colors.primarySoft, borderWidth: 0 }}>
            <Text variant="small" color="primary">
              {notice}
            </Text>
          </Card>
        ) : null}
        <InlineError message={actionError} />
        {confirmDelete ? (
          <Card style={styles.confirm}>
            <Text variant="bodyStrong">Delete {lead.name}?</Text>
            <Text variant="small" color="muted">
              {user.role === "ADMIN" ? "This removes the lead and its history." : "An admin will be asked to approve the delete."}
            </Text>
            <View style={styles.row}>
              <Button label="Keep" variant="secondary" style={styles.flex} onPress={() => setConfirmDelete(false)} />
              <Button label="Delete" variant="danger" icon="trash-outline" style={styles.flex} onPress={runDelete} />
            </View>
          </Card>
        ) : null}

        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.tabs}>
          {TABS.map((item) => {
            const active = item.key === tab;
            return (
              <Pressable
                key={item.key}
                accessibilityRole="tab"
                accessibilityState={{ selected: active }}
                onPress={() => setTab(item.key)}
                style={[styles.tab, active && { borderBottomColor: colors.primary }]}
              >
                <Text variant="smallStrong" color={active ? "primary" : "muted"}>
                  {item.label}
                  {item.key === "notes" && data.diary.length ? ` · ${data.diary.length}` : ""}
                  {item.key === "properties" && lead.relatedInventoryIds?.length ? ` · ${lead.relatedInventoryIds.length}` : ""}
                </Text>
              </Pressable>
            );
          })}
        </ScrollView>

        {tab === "overview" ? <LeadOverviewTab lead={lead} onEditRequirements={() => setTab("requirements")} /> : null}
        {tab === "requirements" ? <LeadRequirementsTab lead={lead} onEdit={() => navigation.navigate("EditRequirements", { leadId: lead._id })} /> : null}
        {tab === "properties" ? <LeadPropertiesTab lead={lead} onChanged={reload} /> : null}
        {tab === "notes" ? <LeadNotesTab leadId={lead._id} entries={data.diary} onAdded={reload} /> : null}
        {tab === "activity" ? <LeadActivityTab lead={lead} activity={data.activity} tasks={data.tasks} /> : null}
      </Body>

      <View style={[styles.footer, { backgroundColor: colors.surface, borderTopColor: colors.border, paddingBottom: insets.bottom + space.md }]}>
        <Button label="Add task" variant="secondary" icon="add-circle-outline" style={styles.flex} onPress={() => navigation.navigate("NewTask", { leadId: lead._id, leadName: lead.name })} />
        <Button label="Update status" icon="swap-horizontal" style={styles.flex} onPress={() => navigation.navigate("UpdateLead", { leadId: lead._id })} />
      </View>

      <ActionSheet visible={menuOpen} title={lead.name} actions={menu} onClose={() => setMenuOpen(false)} />
    </View>
  );
};

const styles = StyleSheet.create({
  flex: { flex: 1 },
  body: { paddingBottom: 100 },
  webInset: { marginRight: space.lg },
  hero: { alignItems: "center", gap: space.xs, paddingTop: space.xl },
  badges: { flexDirection: "row", flexWrap: "wrap", justifyContent: "center", gap: space.sm, marginTop: space.xs },
  actions: { flexDirection: "row", justifyContent: "space-around", alignSelf: "stretch", marginTop: space.lg },
  action: { alignItems: "center", gap: 6, minWidth: 60 },
  actionIcon: { width: 46, height: 46, borderRadius: 23, alignItems: "center", justifyContent: "center" },
  confirm: { gap: space.sm },
  row: { flexDirection: "row", gap: space.md },
  tabs: { gap: space.lg, paddingHorizontal: space.xs },
  tab: { paddingVertical: space.sm, borderBottomWidth: 2, borderBottomColor: "transparent", borderRadius: radius.sm },
  footer: { flexDirection: "row", gap: space.md, paddingHorizontal: space.lg, paddingTop: space.md, borderTopWidth: StyleSheet.hairlineWidth },
});
