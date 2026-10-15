import React, { useEffect, useRef, useState } from "react";
import { ActivityIndicator, FlatList, KeyboardAvoidingView, Platform, Pressable, StyleSheet, TextInput, View } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { askAssistant, type AssistantInventory, type AssistantLead, type AssistantPerformer } from "../../api/assistant";
import { canOpenPage } from "../../api/access";
import { errorMessage } from "../../api/client";
import { useAuth, useUser } from "../../auth/AuthProvider";
import { SUGGESTED_PROMPTS, navTarget, trimHistory, type AssistantMessage, type NavTarget } from "../../lib/assistant";
import { statusMeta } from "../../lib/leadStatus";
import { formatPrice } from "../../lib/money";
import type { RootScreenProps } from "../../navigation/types";
import { useTheme } from "../../theme/ThemeProvider";
import { ActionSheet, Avatar, Badge, Chip, HeaderButton, Icon, Text } from "../../ui";

const newId = () => `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

/*
 * Office assistant (web Admin → Command console): ask about leads, inventory
 * and who is performing, in plain words. Answers come from the server and
 * stay within what the asker may see; results open the lead or property.
 */
export const AssistantScreen = ({ navigation }: RootScreenProps<"Assistant">) => {
  const me = useUser();
  const { access } = useAuth();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const storageKey = `assistant_history:${me.id || me._id}`;
  const [messages, setMessages] = useState<AssistantMessage[]>([]);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [menu, setMenu] = useState(false);
  const loaded = useRef(false);

  useEffect(() => {
    AsyncStorage.getItem(storageKey)
      .then((raw) => {
        if (raw) setMessages(JSON.parse(raw) as AssistantMessage[]);
      })
      .catch(() => {})
      .finally(() => {
        loaded.current = true;
      });
  }, [storageKey]);
  useEffect(() => {
    if (loaded.current) AsyncStorage.setItem(storageKey, JSON.stringify(trimHistory(messages))).catch(() => {});
  }, [messages, storageKey]);

  React.useLayoutEffect(() => {
    navigation.setOptions({ headerRight: () => (messages.length ? <HeaderButton icon="ellipsis-horizontal" label="More" onPress={() => setMenu(true)} /> : null) });
  });

  const go = (target: NavTarget) => {
    if (target.route === "Tabs") navigation.navigate("Tabs", { screen: target.tab as never });
    else navigation.navigate(target.route as never);
  };

  const ask = async (text: string) => {
    const query = text.trim();
    if (!query || busy) return;
    setDraft("");
    const mine: AssistantMessage = { id: newId(), from: "me", text: query, at: new Date().toISOString() };
    setMessages((prev) => trimHistory([...prev, mine]));
    const target = navTarget(query);
    if (target && (!target.page || canOpenPage(me, access, target.page))) {
      setMessages((prev) => trimHistory([...prev, { id: newId(), from: "assistant", text: `Opening ${target.label}.`, at: new Date().toISOString(), nav: target }]));
      go(target);
      return;
    }
    setBusy(true);
    try {
      const reply = await askAssistant(query);
      setMessages((prev) => trimHistory([...prev, { id: newId(), from: "assistant", text: reply.answer || "No answer for that.", at: new Date().toISOString(), intent: reply.intent, data: reply.data }]));
    } catch (err) {
      setMessages((prev) => trimHistory([...prev, { id: newId(), from: "assistant", text: errorMessage(err), at: new Date().toISOString(), error: true }]));
    } finally {
      setBusy(false);
    }
  };

  const reversed = [...messages].reverse();

  return (
    <KeyboardAvoidingView style={[styles.root, { backgroundColor: colors.bg }]} behavior={Platform.OS === "ios" ? "padding" : undefined} keyboardVerticalOffset={Platform.OS === "ios" ? 90 : 0}>
      <FlatList
        inverted
        data={reversed}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.list}
        ListHeaderComponent={
          busy ? (
            <View style={[styles.bubble, styles.theirs, { backgroundColor: colors.surface, borderColor: colors.border }]}>
              <ActivityIndicator size="small" color={colors.primary} />
            </View>
          ) : null
        }
        ListFooterComponent={
          <View style={styles.intro}>
            <View style={[styles.introIcon, { backgroundColor: colors.primarySoft }]}>
              <Icon name="sparkles" size={22} color={colors.primary} />
            </View>
            <Text variant="heading" align="center">
              Ask about your leads and inventory
            </Text>
            <Text variant="small" color="muted" align="center">
              Answers only cover what you can see in the CRM.
            </Text>
            <View style={styles.prompts}>
              {SUGGESTED_PROMPTS.map((prompt) => (
                <Chip key={prompt} label={prompt} onPress={() => ask(prompt)} />
              ))}
            </View>
          </View>
        }
        renderItem={({ item }) =>
          item.from === "me" ? (
            <View style={[styles.bubble, styles.mine, { backgroundColor: colors.primary }]}>
              <Text variant="body" color={colors.onPrimary}>
                {item.text}
              </Text>
            </View>
          ) : (
            <View style={[styles.bubble, styles.theirs, { backgroundColor: item.error ? colors.dangerSoft : colors.surface, borderColor: item.error ? colors.dangerSoft : colors.border }]}>
              <Text variant="body" color={item.error ? colors.danger : colors.text}>
                {item.text}
              </Text>
              {item.nav ? (
                <Pressable accessibilityRole="button" onPress={() => go(item.nav!)} hitSlop={6}>
                  <Text variant="smallStrong" color="primary">
                    Open {item.nav.label}
                  </Text>
                </Pressable>
              ) : null}
              {item.data ? <ReplyData data={item.data} navigation={navigation} /> : null}
            </View>
          )
        }
      />
      <View style={[styles.composer, { borderTopColor: colors.border, backgroundColor: colors.bg, paddingBottom: Math.max(insets.bottom, 10) }]}>
        <TextInput
          value={draft}
          onChangeText={setDraft}
          placeholder="Ask something, e.g. interested leads this week"
          placeholderTextColor={colors.textFaint}
          multiline
          maxLength={300}
          onSubmitEditing={() => ask(draft)}
          blurOnSubmit
          returnKeyType="send"
          style={[styles.input, { color: colors.text, backgroundColor: colors.surface, borderColor: colors.border }]}
          accessibilityLabel="Ask the assistant"
        />
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Ask"
          disabled={!draft.trim() || busy}
          onPress={() => ask(draft)}
          style={[styles.send, { backgroundColor: colors.primary, opacity: draft.trim() && !busy ? 1 : 0.55 }]}
        >
          <Icon name="arrow-up" size={20} color={colors.onPrimary} />
        </Pressable>
      </View>
      <ActionSheet
        visible={menu}
        title="Assistant"
        onClose={() => setMenu(false)}
        actions={[{ key: "clear", icon: "trash-bin-outline", label: "Clear conversation", hint: "On this phone only", destructive: true, onPress: () => setMessages([]) }]}
      />
    </KeyboardAvoidingView>
  );
};

/* Results under an answer: leads and properties open, performers and status counts read at a glance. */
const ReplyData = ({ data, navigation }: { data: Record<string, unknown>; navigation: RootScreenProps<"Assistant">["navigation"] }) => {
  const { colors } = useTheme();
  const leads = [...((data.leads as AssistantLead[]) || []), ...((data.interestedLeads as AssistantLead[]) || [])].slice(0, 8);
  const inventory = [...((data.inventory as AssistantInventory[]) || []), ...((data.soldInventory as AssistantInventory[]) || [])].slice(0, 8);
  const performers = ((data.performers as AssistantPerformer[]) || []).slice(0, 5);
  const counts = [
    { title: "Leads by status", rows: data.leadByStatus as Record<string, number> | undefined, label: (key: string) => statusMeta(key).label },
    { title: "Inventory by status", rows: data.inventoryByStatus as Record<string, number> | undefined, label: (key: string) => key },
  ].filter((group) => group.rows && Object.keys(group.rows).length);

  return (
    <View style={styles.data}>
      {leads.map((lead) => (
        <Pressable
          key={`lead-${lead.id}`}
          accessibilityRole="button"
          onPress={() => navigation.navigate("LeadDetail", { leadId: String(lead.id), name: lead.name })}
          style={({ pressed }) => [styles.result, { borderColor: colors.border, backgroundColor: pressed ? colors.surfaceAlt : colors.bg }]}
        >
          <Avatar name={lead.name} size={30} />
          <View style={styles.flex}>
            <Text variant="smallStrong" numberOfLines={1}>
              {lead.name}
            </Text>
            <Text variant="tiny" color="muted" numberOfLines={1}>
              {[lead.projectInterested !== "-" ? lead.projectInterested : null, lead.assignee].filter(Boolean).join(" · ")}
            </Text>
          </View>
          {lead.status && lead.status !== "-" ? <Badge label={statusMeta(lead.status).label} tone={statusMeta(lead.status).tone} /> : null}
        </Pressable>
      ))}
      {inventory.map((item) => (
        <Pressable
          key={`inv-${item.id}`}
          accessibilityRole="button"
          onPress={() => navigation.navigate("PropertyDetail", { id: String(item.id) })}
          style={({ pressed }) => [styles.result, { borderColor: colors.border, backgroundColor: pressed ? colors.surfaceAlt : colors.bg }]}
        >
          <Icon name="business-outline" size={18} color={colors.textMuted} />
          <View style={styles.flex}>
            <Text variant="smallStrong" numberOfLines={1}>
              {item.label || "Property"}
            </Text>
            <Text variant="tiny" color="muted" numberOfLines={1}>
              {[item.location !== "-" ? item.location : null, item.price ? formatPrice(item.price) : null, item.soldThrough && item.soldThrough !== "-" ? `via ${item.soldThrough}` : null].filter(Boolean).join(" · ")}
            </Text>
          </View>
          {item.status ? <Badge label={item.status} tone={item.status === "Sold" ? "success" : item.status === "Available" ? "primary" : "neutral"} /> : null}
        </Pressable>
      ))}
      {performers.map((row) => (
        <View key={`p-${row.userId}`} style={[styles.result, { borderColor: colors.border, backgroundColor: colors.bg }]}>
          <Text variant="smallStrong" color="muted" style={styles.rank}>
            #{row.rank}
          </Text>
          <Avatar name={row.name} uri={row.profileImageUrl} size={30} />
          <View style={styles.flex}>
            <Text variant="smallStrong" numberOfLines={1}>
              {row.name}
            </Text>
            <Text variant="tiny" color="muted">
              {row.closedLeads} closed of {row.totalLeads} · {row.conversionRate}%
            </Text>
          </View>
        </View>
      ))}
      {counts.map((group) => (
        <View key={group.title} style={styles.counts}>
          <Text variant="tiny" color="muted">
            {group.title.toUpperCase()}
          </Text>
          <View style={styles.prompts}>
            {Object.entries(group.rows!)
              .sort((a, b) => b[1] - a[1])
              .map(([key, count]) => (
                <View key={key} style={[styles.count, { backgroundColor: colors.surfaceAlt }]}>
                  <Text variant="tiny">
                    {group.label(key)} · {count}
                  </Text>
                </View>
              ))}
          </View>
        </View>
      ))}
    </View>
  );
};

const styles = StyleSheet.create({
  root: { flex: 1 },
  flex: { flex: 1, minWidth: 0 },
  list: { padding: 14, gap: 10, flexGrow: 1 },
  intro: { alignItems: "center", gap: 8, paddingVertical: 20 },
  introIcon: { width: 48, height: 48, borderRadius: 16, alignItems: "center", justifyContent: "center" },
  prompts: { flexDirection: "row", flexWrap: "wrap", gap: 6, justifyContent: "center" },
  bubble: { maxWidth: "88%", borderRadius: 18, paddingHorizontal: 14, paddingVertical: 10, gap: 8 },
  mine: { alignSelf: "flex-end", borderBottomRightRadius: 6 },
  theirs: { alignSelf: "flex-start", borderWidth: 1, borderBottomLeftRadius: 6, minWidth: "60%" },
  data: { gap: 6 },
  result: { flexDirection: "row", alignItems: "center", gap: 10, borderWidth: 1, borderRadius: 12, padding: 8 },
  rank: { width: 24 },
  counts: { gap: 4 },
  count: { borderRadius: 8, paddingHorizontal: 8, paddingVertical: 4 },
  composer: { flexDirection: "row", alignItems: "flex-end", gap: 8, paddingHorizontal: 12, paddingTop: 8, borderTopWidth: StyleSheet.hairlineWidth },
  input: { flex: 1, minHeight: 44, maxHeight: 120, borderWidth: 1, borderRadius: 22, paddingHorizontal: 16, paddingTop: 12, paddingBottom: 12, fontSize: 14, fontFamily: "PlusJakartaSans_500Medium" },
  send: { width: 44, height: 44, borderRadius: 22, alignItems: "center", justifyContent: "center" },
});
