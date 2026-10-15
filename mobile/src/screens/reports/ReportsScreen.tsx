import React, { useLayoutEffect, useMemo, useState } from "react";
import { Pressable, Share, StyleSheet, View } from "react-native";
import { useNavigation } from "@react-navigation/native";
import { listAllLeadsForReports } from "../../api/leads";
import { formatDate } from "../../lib/format";
import { buildReport, delta, type RangeKey, type ReportLead } from "../../lib/reports";
import { useQuery } from "../../lib/useQuery";
import { useTheme } from "../../theme/ThemeProvider";
import { Avatar, Body, Card, EmptyState, ErrorState, Icon, Loading, Segmented, Text } from "../../ui";
import { compactRupees } from "../finance/FinanceScreen";

const RANGE_LABEL: Record<RangeKey, string> = { WEEK: "This week", MONTH: "This month", QUARTER: "This quarter" };

/* Design 30 - funnel, KPIs, leads by source, plus the web's executive table and lost reasons. Web: IntelligenceReports. */
export const ReportsScreen = () => {
  const navigation = useNavigation();
  const { colors } = useTheme();
  const [range, setRange] = useState<RangeKey>("MONTH");
  const { data, loading, error, refreshing, refresh } = useQuery(() => listAllLeadsForReports(), []);
  const report = useMemo(() => (data ? buildReport(data as ReportLead[], range) : null), [data, range]);

  useLayoutEffect(() => {
    navigation.setOptions({
      headerRight: report
        ? () => (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Share report"
              hitSlop={8}
              onPress={() => {
                const s = report.summary;
                const lines = [
                  `Lead report · ${RANGE_LABEL[range]} (${formatDate(report.bounds.from)} – ${formatDate(report.bounds.to)})`,
                  `Leads received: ${s.received}`,
                  `Site visits: ${s.visits}`,
                  `Closed: ${s.closed} (${s.conversion.toFixed(1)}%)`,
                  `Revenue: ${compactRupees(s.revenue)}`,
                  `Avg. days to close: ${Math.round(s.avgDaysToClose)}`,
                  "",
                  "Funnel",
                  ...report.funnel.map((row) => `${row.label}: ${row.value}`),
                  "",
                  "Leads by source",
                  ...report.sourceMix.map((row) => `${row.label}: ${row.count} (${row.share}%)`),
                  "",
                  "Top performers",
                  ...report.executives.map((row) => `${row.name}: ${row.leads} leads, ${row.visits} visits, ${row.closed} closed`),
                ];
                Share.share({ message: lines.join("\n") }).catch(() => {});
              }}
            >
              <Icon name="share-outline" size={20} color={colors.primary} />
            </Pressable>
          )
        : undefined,
    });
  }, [navigation, report, range, colors.primary]);

  const segments = (
    <Segmented
      options={[
        { key: "WEEK", label: "Week" },
        { key: "MONTH", label: "Month" },
        { key: "QUARTER", label: "Quarter" },
      ]}
      value={range}
      onChange={setRange}
    />
  );

  if (loading) return <Loading label="Crunching your leads…" />;
  if (error || !report) return <ErrorState message={error || "Couldn't build the report."} onRetry={refresh} />;

  const s = report.summary;
  const p = report.previous;
  const max = Math.max(1, report.funnel[0]!.value);
  const funnelColors = [colors.primary, "#4a6ae0", "#7b93ea", colors.violet, colors.success];
  const sourceColors = [colors.primary, colors.violet, colors.warning, colors.success, colors.textFaint];
  const kpis = [
    { label: "Revenue", value: compactRupees(s.revenue), change: delta(s.revenue, p.revenue) },
    { label: "Avg deal", value: compactRupees(s.avgDeal), change: delta(s.avgDeal, p.avgDeal) },
    {
      label: "Response time",
      value: s.medianResponseMinutes === null ? "—" : s.medianResponseMinutes < 120 ? `${Math.round(s.medianResponseMinutes)} min` : `${Math.round(s.medianResponseMinutes / 60)} h`,
      change: delta(s.medianResponseMinutes ?? 0, p.medianResponseMinutes ?? 0, true),
    },
    { label: "Lost", value: String(s.lost), change: delta(s.lost, p.lost, true) },
  ];

  return (
    <Body refreshing={refreshing} onRefresh={refresh}>
      {segments}
      {!s.received ? (
        <EmptyState icon="bar-chart-outline" title="No leads in this period" message="Pick a longer range, or check back once leads come in." />
      ) : (
        <>
          <Card style={styles.block}>
            <View style={styles.blockHead}>
              <Text variant="heading" style={styles.blockTitle}>
                Conversion funnel
              </Text>
              <Text variant="small" color="muted">
                {RANGE_LABEL[range]}
              </Text>
            </View>
            {report.funnel.map((row, index) => (
              <View key={row.label} style={styles.funnelRow}>
                <Text variant="small" color="muted" style={styles.funnelLabel}>
                  {row.label}
                </Text>
                <View style={[styles.funnelTrack, { backgroundColor: colors.surfaceAlt }]}>
                  <View style={[styles.funnelFill, { width: `${(row.value / max) * 100}%`, backgroundColor: funnelColors[index] }]} />
                </View>
                <Text variant="smallStrong" style={styles.funnelValue}>
                  {row.value}
                </Text>
              </View>
            ))}
          </Card>

          <View style={styles.kpis}>
            {kpis.map((kpi) => (
              <View key={kpi.label} style={[styles.kpi, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                <Text variant="label" color="faint">
                  {kpi.label}
                </Text>
                <Text variant="heading" style={styles.kpiValue}>
                  {kpi.value}
                </Text>
                <Text variant="tiny" color={kpi.change.good === null ? colors.textFaint : kpi.change.good ? colors.success : colors.danger}>
                  {kpi.change.text}
                </Text>
              </View>
            ))}
          </View>

          <Card style={styles.block}>
            <Text variant="heading" style={styles.blockTitle}>
              Leads by source
            </Text>
            <View style={styles.stack}>
              {report.sourceMix.map((row, index) => (
                <View key={row.label} style={{ flex: Math.max(row.count, 0.0001), backgroundColor: sourceColors[index % sourceColors.length] }} />
              ))}
            </View>
            <View style={styles.legend}>
              {report.sourceMix.map((row, index) => (
                <View key={row.label} style={styles.legendItem}>
                  <View style={[styles.swatch, { backgroundColor: sourceColors[index % sourceColors.length] }]} />
                  <Text variant="tiny" color="muted" style={styles.legendText}>
                    {row.label} {row.share}%
                  </Text>
                </View>
              ))}
            </View>
          </Card>

          {report.executives.length ? (
            <Card style={styles.block}>
              <Text variant="heading" style={styles.blockTitle}>
                Top performers
              </Text>
              {report.executives.map((row) => (
                <View key={row.key} style={styles.exec}>
                  <Avatar name={row.name} size={30} />
                  <Text variant="smallStrong" style={styles.flex} numberOfLines={1}>
                    {row.name}
                  </Text>
                  <Text variant="tiny" color="muted">
                    {row.leads} leads · {row.visits} visits · {row.closed} closed
                  </Text>
                </View>
              ))}
            </Card>
          ) : null}

          {report.lostReasons.length ? (
            <Card style={styles.block}>
              <Text variant="heading" style={styles.blockTitle}>
                Why leads were lost
              </Text>
              {report.lostReasons.map((row) => (
                <View key={row.label} style={styles.funnelRow}>
                  <Text variant="small" color="muted" style={styles.lostLabel}>
                    {row.label}
                  </Text>
                  <View style={[styles.funnelTrack, { backgroundColor: colors.surfaceAlt }]}>
                    <View style={[styles.funnelFill, { width: `${(row.count / report.lostReasons[0]!.count) * 100}%`, backgroundColor: colors.danger }]} />
                  </View>
                  <Text variant="smallStrong" style={styles.funnelValue}>
                    {row.count}
                  </Text>
                </View>
              ))}
            </Card>
          ) : null}

          <Text variant="tiny" color="faint" align="center">
            {s.received} leads · {s.visits} site visits · {s.conversion.toFixed(1)}% converted · {Math.round(s.avgDaysToClose)} days to close on average
          </Text>
        </>
      )}
    </Body>
  );
};

const styles = StyleSheet.create({
  flex: { flex: 1, minWidth: 0 },
  block: { gap: 12, borderRadius: 20 },
  blockHead: { flexDirection: "row", justifyContent: "space-between", alignItems: "baseline" },
  blockTitle: { fontSize: 13 },
  funnelRow: { flexDirection: "row", alignItems: "center", gap: 10 },
  funnelLabel: { width: 74, fontSize: 11.5, fontFamily: "PlusJakartaSans_600SemiBold" },
  lostLabel: { width: 110, fontSize: 11.5, fontFamily: "PlusJakartaSans_600SemiBold" },
  funnelTrack: { flex: 1, height: 22, borderRadius: 7, overflow: "hidden" },
  funnelFill: { height: "100%", borderRadius: 7 },
  funnelValue: { width: 34, textAlign: "right", fontSize: 12.5, fontFamily: "PlusJakartaSans_800ExtraBold" },
  kpis: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  kpi: { width: "48%", flexGrow: 1, borderWidth: 1, borderRadius: 16, padding: 12, gap: 2 },
  kpiValue: { fontSize: 19, lineHeight: 24 },
  stack: { flexDirection: "row", height: 12, borderRadius: 6, overflow: "hidden", gap: 2 },
  legend: { flexDirection: "row", flexWrap: "wrap", columnGap: 12, rowGap: 6 },
  legendItem: { flexDirection: "row", alignItems: "center", gap: 5 },
  swatch: { width: 8, height: 8, borderRadius: 2 },
  legendText: { fontFamily: "PlusJakartaSans_600SemiBold", fontSize: 11.5 },
  exec: { flexDirection: "row", alignItems: "center", gap: 10 },
});
