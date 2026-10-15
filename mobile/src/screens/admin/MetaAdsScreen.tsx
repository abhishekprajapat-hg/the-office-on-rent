import React, { useMemo, useState } from "react";
import { StyleSheet, View } from "react-native";
import { api, errorMessage } from "../../api/client";
import { getMetaIntegration, updateMetaIntegration } from "../../api/admin";
import type { Lead } from "../../api/types";
import { isoDay } from "../../lib/attendanceState";
import { chatTime } from "../../lib/chat";
import { useQuery } from "../../lib/useQuery";
import type { RootScreenProps } from "../../navigation/types";
import { useTheme } from "../../theme/ThemeProvider";
import { Body, Button, Field, GroupLabel, HeaderButton, Icon, InlineError, ListCard, Loading, Text } from "../../ui";

type MetaLead = Lead & { metaFormId?: string; metaPageId?: string };
const QUALIFIED = ["INTERESTED", "SITE_VISIT_SCHEDULED", "SITE_VISIT", "NEGOTIATION", "CLOSED"];
const DAY = 86400000;

/*
 * Design 40. The CRM receives Meta leads by webhook but never sees ad spend,
 * so this shows what it does know: connection health, lead volume and
 * quality per lead form, and the page/token settings the web admin edits.
 */
export const MetaAdsScreen = ({ navigation }: RootScreenProps<"MetaAds">) => {
  const { colors } = useTheme();
  const integration = useQuery(() => getMetaIntegration().catch(() => null), []);
  const leads = useQuery(async () => {
    const rows: MetaLead[] = [];
    for (let page = 1; page <= 10; page += 1) {
      const res = await api.get<{ leads: MetaLead[]; pagination?: { hasNextPage?: boolean } }>("/leads", {
        params: { page, limit: 200, source: "META", createdFrom: isoDay(new Date(Date.now() - 30 * DAY)), fields: "_id,status,createdAt,metaFormId,metaPageId,projectInterested" },
      });
      rows.push(...(res.data?.leads || []));
      if (!res.data?.pagination?.hasNextPage) break;
    }
    return rows;
  }, []);

  const [pageIds, setPageIds] = useState<string | null>(null);
  const [token, setToken] = useState("");
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saved, setSaved] = useState<string | null>(null);

  React.useLayoutEffect(() => {
    navigation.setOptions({
      headerRight: () => (
        <HeaderButton
          icon="refresh"
          label="Refresh"
          variant="secondary"
          onPress={() => {
            integration.refresh();
            leads.refresh();
          }}
        />
      ),
    });
  }, [navigation]);

  const stats = useMemo(() => {
    const all = leads.data || [];
    const week = all.filter((lead) => Date.now() - new Date(lead.createdAt || 0).getTime() <= 7 * DAY);
    const qualified = (list: MetaLead[]) => list.filter((lead) => QUALIFIED.includes(String(lead.status))).length;
    const forms = new Map<string, MetaLead[]>();
    week.forEach((lead) => {
      const key = lead.metaFormId || "unknown";
      forms.set(key, [...(forms.get(key) || []), lead]);
    });
    const campaigns = [...forms.entries()]
      .map(([form, list]) => {
        const names = new Map<string, number>();
        list.forEach((lead) => lead.projectInterested && names.set(lead.projectInterested, (names.get(lead.projectInterested) || 0) + 1));
        const top = [...names.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];
        return { form, name: top || (form === "unknown" ? "Unlabelled form" : `Form …${form.slice(-6)}`), leads: list.length, qualified: qualified(list), latest: list.map((lead) => lead.createdAt || "").sort().pop() };
      })
      .sort((a, b) => b.leads - a.leads);
    return {
      week: week.length,
      month: all.length,
      qualifiedPct: all.length ? Math.round((qualified(all) / all.length) * 100) : 0,
      closed: all.filter((lead) => lead.status === "CLOSED").length,
      latest: all.map((lead) => lead.createdAt || "").sort().pop(),
      campaigns,
    };
  }, [leads.data]);

  const meta = integration.data;
  const ready = Boolean(meta?.readiness?.isReady);
  const ids = pageIds ?? (meta?.pageIds || []).join(", ");

  const save = async () => {
    setSaving(true);
    setSaveError(null);
    setSaved(null);
    try {
      const updated = await updateMetaIntegration({ pageIds: ids.split(/[\s,]+/).filter(Boolean), ...(token.trim() ? { accessToken: token.trim() } : {}) });
      setToken("");
      setPageIds(null);
      integration.reload();
      setSaved(updated?.readiness?.message || "Saved. Meta subscription re-synced.");
    } catch (err) {
      setSaveError(errorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  if (leads.loading && integration.loading) return <Loading />;

  return (
    <Body
      refreshing={leads.refreshing}
      onRefresh={() => {
        integration.refresh();
        leads.refresh();
      }}
    >
      <View style={[styles.banner, { backgroundColor: ready ? colors.successSoft : colors.warningSoft }]}>
        <Icon name={ready ? "checkmark-circle" : "alert-circle"} size={18} color={ready ? colors.success : colors.warning} />
        <Text variant="smallStrong" color={ready ? colors.success : colors.warning} style={styles.flex}>
          {meta
            ? ready
              ? `Connected · ${meta.readiness?.readyPages ?? meta.pageIds.length} page${meta.pageIds.length === 1 ? "" : "s"}${stats.latest ? ` · last lead ${chatTime(stats.latest)}` : ""}`
              : meta.readiness?.message || "Not connected"
            : "Connection status is visible to admins and managers"}
        </Text>
      </View>

      <View style={styles.grid}>
        {[
          ["Leads (7d)", String(stats.week)],
          ["Leads (30d)", String(stats.month)],
          ["Qualified", `${stats.qualifiedPct}%`],
          ["Closed (30d)", String(stats.closed)],
        ].map(([label, value]) => (
          <View key={label} style={[styles.stat, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <Text variant="tiny" color="muted" style={styles.statLabel}>
              {label!.toUpperCase()}
            </Text>
            <Text variant="title" style={styles.statValue}>
              {value}
            </Text>
          </View>
        ))}
      </View>
      <InlineError message={leads.error} />

      <GroupLabel>Lead forms · last 7 days</GroupLabel>
      {stats.campaigns.length ? (
        stats.campaigns.map((item) => (
          <View key={item.form} style={[styles.campaign, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <View style={styles.campaignTop}>
              <View style={[styles.dot, { backgroundColor: item.leads ? colors.success : colors.textFaint }]} />
              <Text variant="bodyStrong" numberOfLines={1} style={[styles.flex, styles.campaignName]}>
                {item.name}
              </Text>
            </View>
            <View style={styles.campaignStats}>
              <Text variant="small" color="muted">
                <Text variant="smallStrong">{item.leads}</Text> leads
              </Text>
              <Text variant="small" color="muted">
                <Text variant="smallStrong">{item.qualified}</Text> qualified
              </Text>
              <Text variant="small" color="muted">
                {item.latest ? `latest ${chatTime(item.latest)}` : ""}
              </Text>
            </View>
          </View>
        ))
      ) : (
        <Text variant="small" color="muted">
          No Meta leads in the last 7 days.
        </Text>
      )}
      <Text variant="tiny" color="faint">
        Spend and cost per lead live in Meta Ads Manager; the CRM only receives the leads.
      </Text>

      {meta ? (
        <>
          <GroupLabel>Connection</GroupLabel>
          <ListCard>
            <View style={styles.form}>
              <Field label="Facebook page IDs" value={ids} onChangeText={setPageIds} placeholder="Comma-separated" autoCapitalize="none" />
              <Field
                label="Page access token"
                value={token}
                onChangeText={setToken}
                secure
                autoCapitalize="none"
                placeholder={meta.accessTokenConfigured ? `Saved (${meta.accessTokenPreview || "hidden"}) · paste to replace` : "Paste the long-lived token"}
              />
              {meta.webhook && Object.values(meta.webhook)[0] ? (
                <Text variant="tiny" color="faint" selectable>
                  Webhook: {Object.values(meta.webhook)[0]}
                </Text>
              ) : null}
              <InlineError message={saveError} />
              {saved ? (
                <Text variant="small" color={colors.success}>
                  {saved}
                </Text>
              ) : null}
              <Button label="Save & re-sync" icon="sync" variant="secondary" loading={saving} onPress={save} />
            </View>
          </ListCard>
        </>
      ) : null}
    </Body>
  );
};

const styles = StyleSheet.create({
  flex: { flex: 1, minWidth: 0 },
  banner: { flexDirection: "row", alignItems: "center", gap: 8, borderRadius: 14, paddingHorizontal: 14, paddingVertical: 11 },
  grid: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  stat: { width: "48.6%", borderWidth: 1, borderRadius: 16, padding: 12, gap: 2 },
  statLabel: { fontFamily: "PlusJakartaSans_700Bold", letterSpacing: 0.4 },
  statValue: { fontSize: 22 },
  campaign: { borderWidth: 1, borderRadius: 16, padding: 14, gap: 8 },
  campaignTop: { flexDirection: "row", alignItems: "center", gap: 8 },
  campaignName: { fontSize: 14 },
  dot: { width: 8, height: 8, borderRadius: 4 },
  campaignStats: { flexDirection: "row", gap: 16 },
  form: { padding: 14, gap: 12 },
});
