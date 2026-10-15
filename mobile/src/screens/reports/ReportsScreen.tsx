import React, { useLayoutEffect, useMemo, useState } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { useNavigation } from "@react-navigation/native";
import { listAllLeadsForReports } from "../../api/leads";
import { errorMessage } from "../../api/client";
import { buildReport, delta, reportCsvRows, type RangeKey, type ReportLead } from "../../lib/reports";
import { DateTimeField } from "../../components/DateTimeField";
import { toCsv } from "../../lib/csv";
import { shareTextFile } from "../../lib/shareFile";
import { useQuery } from "../../lib/useQuery";
import { useTheme } from "../../theme/ThemeProvider";
import { Avatar, Body, Card, EmptyState, ErrorState, Icon, Loading, Segmented, Text } from "../../ui";
import { compactRupees } from "../finance/FinanceScreen";

const RANGE_LABEL: Record<RangeKey, string> = { WEEK: "This week", MONTH: "This month", QUARTER: "This quarter", YEAR: "This year", CUSTOM: "Custom range" };
const daysAgo = (days: number) => {
  const date = new Date();
  date.setDate(date.getDate() - days);
  return date;
};

/* Design 30 - funnel, KPIs, leads by source, plus the web's executive table and lost reasons. Web: IntelligenceReports. */
export const ReportsScreen = () => {
  const navigation = useNavigation();
  const { colors } = useTheme();
  const [range, setRange] = useState<RangeKey>("MONTH");
  // Web default for a custom range: the last 30 days.
  const [custom, setCustom] = useState(() => ({ from: daysAgo(29), to: new Date() }));
  const [exportError, setExportError] = useState<string | null>(null);
  const { data, loading, error, refreshing, refresh } = useQuery(() => listAllLeadsForReports(), []);
  const report = useMemo(() => (data ? buildReport(data as ReportLead[], range, new Date(), custom) : null), [data, range, custom]);

  useLayoutEffect(() => {
    navigation.setOptions({
      headerRight: report
        ? () => (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Export CSV"
              hitSlop={8}
              onPress={() => {
                setExportError(null);
                shareTextFile(`reports_${range.toLowerCase()}.csv`, toCsv(reportCsvRows(report))).catch((err) => setExportError(errorMessage(err)));
              }}
            >
              <Icon name="download-outline" size={20} color={colors.primary} />
            </Pressable>
          )
        : undefined,
    });
  }, [navigation, report, range, colors.primary]);

  const segments = (
    <>
      <Segmented
        options={[
          { key: "WEEK", label: "Week" },
          { key: "MONTH", label: "Month" },
          { key: "QUARTER", label: "Qtr" },
          { key: "YEAR", label: "Year" },
          { key: "CUSTOM", label: "Custom" },
        ]}
        value={range}
        onChange={setRange}
      />
      {range === "CUSTOM" ? (
        <View style={styles.customRow}>
          <View style={styles.flex}>
            <DateTimeField label="From" mode="date" value={custom.from} onChange={(from) => from && setCustom((prev) => ({ ...prev, from }))} />
          </View>
          <View style={styles.flex}>
            <DateTimeField label="To" mode="date" value={custom.to} onChange={(to) => to && setCustom((prev) => ({ ...prev, to }))} />
          </View>
        </View>
      ) : null}
    </>
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

  const monthMax = Math.max(1, ...report.monthly.map((row) => row.leads));
  return (
    <Body refreshing={refreshing} onRefresh={refresh}>
      {segments}
      {exportError ? (
        <Text variant="small" color="danger">
          {exportError}
        </Text>
      ) : null}
      {report.transferred ? (
        <Card style={[styles.block, { backgroundColor: colors.primarySoft, borderWidth: 0 }]}>
          <Text variant="small" color="primary">
            <Text variant="smallStrong" color="primary">
              {report.transferred} transferred lead{report.transferred === 1 ? "" : "s"}
            </Text>{" "}
            in this period. Transfers are counted from each lead's history, whatever stage it is at now.
          </Text>
        </Card>
      ) : null}
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

          <Card style={styles.block}>
            <View style={styles.blockHead}>
              <Text variant="heading" style={styles.blockTitle}>
                Last six months
              </Text>
              <View style={styles.legend}>
                <View style={styles.legendItem}>
                  <View style={[styles.swatch, { backgroundColor: colors.primary }]} />
                  <Text variant="tiny" color="muted">
                    Leads
                  </Text>
                </View>
                <View style={styles.legendItem}>
                  <View style={[styles.swatch, { backgroundColor: colors.success }]} />
                  <Text variant="tiny" color="muted">
                    Closed
                  </Text>
                </View>
              </View>
            </View>
            <View style={styles.bars}>
              {report.monthly.map((row) => (
                <View key={row.label} style={styles.barCol} accessibilityLabel={`${row.label}: ${row.leads} leads, ${row.closed} closed`}>
                  <View style={styles.barPair}>
                    <View style={[styles.bar, { height: `${Math.max(4, (row.leads / monthMax) * 100)}%`, backgroundColor: colors.primary }]} />
                    <View style={[styles.bar, { height: `${Math.max(3, (row.closed / monthMax) * 100)}%`, backgroundColor: colors.success }]} />
                  </View>
                  <Text variant="tiny" color="muted">
                    {row.label}
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
  customRow: { flexDirection: "row", gap: 10 },
  bars: { flexDirection: "row", height: 120, gap: 8, alignItems: "flex-end" },
  barCol: { flex: 1, alignItems: "center", gap: 4, height: "100%" },
  barPair: { flex: 1, flexDirection: "row", alignItems: "flex-end", gap: 3, width: "100%", justifyContent: "center" },
  bar: { width: 9, borderRadius: 4 },
});
