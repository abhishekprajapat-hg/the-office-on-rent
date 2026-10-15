import React, { useState } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { canOpenPage } from "../../api/access";
import { getRevenueReport } from "../../api/finance";
import { useAuth } from "../../auth/AuthProvider";
import { isoDay } from "../../lib/attendanceState";
import { formatDate, monthKeyOf, monthLabel, rupees, shiftMonth } from "../../lib/format";
import { useQuery } from "../../lib/useQuery";
import type { RootScreenProps } from "../../navigation/types";
import { useTheme } from "../../theme/ThemeProvider";
import type { Tone } from "../../theme/tokens";
import { ActionSheet, Badge, Body, Card, EmptyState, ErrorState, FilterDropdown, GroupLabel, Icon, ListCard, Loading, Segmented, Text } from "../../ui";
import { DateTimeField } from "../../components/DateTimeField";
import { toCsv } from "../../lib/csv";
import { shareTextFile } from "../../lib/shareFile";
import { brokerageReportRows, financialYearStart, payoutReportRows, rentalReportRows, summaryReportRows } from "../../lib/revenueCsv";
import { errorMessage } from "../../api/client";

type Period = "month" | "last" | "quarter" | "year" | "fy" | "custom";
const PERIODS: { key: Period; label: string }[] = [
  { key: "month", label: "This month" },
  { key: "last", label: "Last month" },
  { key: "quarter", label: "Last 3 months" },
  { key: "year", label: "Last 12 months" },
  { key: "fy", label: "This financial year" },
  { key: "custom", label: "Custom range" },
];

/* From / to (YYYY-MM-DD) for a period, ending today for the current ones. */
const rangeFor = (period: Period, custom: { from: Date; to: Date }, now = new Date()) => {
  if (period === "custom") {
    const [first, last] = custom.from <= custom.to ? [custom.from, custom.to] : [custom.to, custom.from];
    return { from: isoDay(first), to: isoDay(last) };
  }
  if (period === "fy") return { from: financialYearStart(now), to: isoDay(now) };
  const current = monthKeyOf(now);
  const first = (key: string) => `${key}-01`;
  if (period === "last") {
    const key = shiftMonth(current, -1);
    const [y, m] = key.split("-").map(Number);
    return { from: first(key), to: isoDay(new Date(y!, m!, 0)) };
  }
  const back = period === "quarter" ? -2 : period === "year" ? -11 : 0;
  return { from: first(shiftMonth(current, back)), to: isoDay(now) };
};

const PAYMENT_TONE: Record<string, Tone> = { RECEIVED: "success", PARTIAL: "warning", PENDING: "danger" };
const MODEL_LABEL: Record<string, string> = { RENTAL_BROKERAGE: "Rental brokerage", BUY_SELL: "Buy & sell" };

type RevenueTab = "deals" | "payouts" | "enterprise";

/* Web: modules/finance/RevenueCenter - revenue by stream for a period, closed deals, payouts, enterprise leases. */
export const RevenueScreen = ({ navigation }: RootScreenProps<"Revenue">) => {
  const { colors } = useTheme();
  const { user, access } = useAuth();
  const canOpenLeads = canOpenPage(user, access, "leads") || canOpenPage(user, access, "my_leads");
  const [period, setPeriod] = useState<Period>("month");
  const [view, setView] = useState<RevenueTab>("deals");
  const [custom, setCustom] = useState(() => ({ from: new Date(new Date().getFullYear(), new Date().getMonth(), 1), to: new Date() }));
  const [exportOpen, setExportOpen] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);
  const range = rangeFor(period, custom);
  const { data, loading, error, refreshing, refresh } = useQuery(() => getRevenueReport(range), [range.from, range.to]);

  const periodLabel =
    period === "month"
      ? monthLabel(monthKeyOf())
      : period === "last"
        ? monthLabel(shiftMonth(monthKeyOf(), -1))
        : period === "custom"
          ? `${formatDate(range.from)} – ${formatDate(range.to)}`
          : PERIODS.find((p) => p.key === period)!.label;

  React.useLayoutEffect(() => {
    navigation.setOptions({
      headerRight: data
        ? () => (
            <Pressable accessibilityRole="button" accessibilityLabel="Export CSV" hitSlop={8} onPress={() => setExportOpen(true)}>
              <Icon name="download-outline" size={20} color={colors.primary} />
            </Pressable>
          )
        : undefined,
    });
  }, [navigation, data, colors.primary]);

  /* Web "Export CSV", one file per report, named for the period. */
  const exportReport = (name: string, rows: unknown[][]) => {
    setExportError(null);
    shareTextFile(`${name}_${range.from}_to_${range.to}.csv`, toCsv(rows)).catch((err) => setExportError(errorMessage(err)));
  };

  return (
    <Body refreshing={refreshing} onRefresh={refresh}>
      <FilterDropdown label="Period" icon="calendar-outline" defaultKey="month" options={PERIODS} value={period} onChange={setPeriod} />
      {period === "custom" ? (
        <View style={styles.customRow}>
          <View style={styles.flexOne}>
            <DateTimeField label="From" mode="date" value={custom.from} onChange={(from) => from && setCustom((prev) => ({ ...prev, from }))} />
          </View>
          <View style={styles.flexOne}>
            <DateTimeField label="To" mode="date" value={custom.to} onChange={(to) => to && setCustom((prev) => ({ ...prev, to }))} />
          </View>
        </View>
      ) : null}
      {exportError ? (
        <Text variant="small" color="danger">
          {exportError}
        </Text>
      ) : null}
      {data ? (
        <ActionSheet
          visible={exportOpen}
          title="Export CSV"
          onClose={() => setExportOpen(false)}
          actions={[
            { key: "brokerage", label: "Brokerage deals", icon: "briefcase-outline", onPress: () => exportReport("brokerage-report", brokerageReportRows(data.deals)) },
            { key: "payouts", label: "Broker payouts", icon: "people-outline", onPress: () => exportReport("broker-payouts", payoutReportRows(data.payouts)) },
            { key: "rental", label: "Rental revenue", icon: "business-outline", onPress: () => exportReport("rental-revenue", rentalReportRows(data)) },
            { key: "summary", label: "Overall summary", icon: "document-text-outline", onPress: () => exportReport("revenue-summary", summaryReportRows(data)) },
          ]}
        />
      ) : null}

      {loading ? (
        <Loading />
      ) : error || !data ? (
        <ErrorState message={error || "Couldn't load the revenue report."} onRetry={refresh} />
      ) : (
        <>
          <View style={[styles.hero, { backgroundColor: colors.hero }]}>
            <Text variant="smallStrong" color={colors.onPrimaryMuted}>
              Total revenue · {periodLabel}
            </Text>
            <Text variant="display" color={colors.onPrimary} style={styles.heroValue}>
              {rupees(data.summary.totalRevenue)}
            </Text>
            <View style={styles.heroRow}>
              <Text variant="small" color="#dfe6fd">
                Rental {rupees(data.summary.rentalIncome)}
              </Text>
              <Text variant="small" color="#dfe6fd">
                Brokerage {rupees(data.summary.brokerageRevenue)}
              </Text>
            </View>
            <Text variant="tiny" color={colors.onPrimaryMuted}>
              Net after lease costs {rupees(data.summary.netRevenue)}
            </Text>
          </View>

          <GroupLabel>Rental income</GroupLabel>
          <ListCard>
            <Line label="Coworking collected" value={rupees(data.rental.coworking.collected)} />
            <Line label="Coworking invoiced" value={rupees(data.rental.coworking.invoiced)} />
            <Line label="Coworking outstanding (all open invoices)" value={rupees(data.rental.coworking.outstanding)} />
            <Line label={`Enterprise client rent · ${plural(data.rental.enterprise.count, "space")}`} value={rupees(data.rental.enterprise.clientRent)} />
            <Line label="Enterprise lease cost" value={`− ${rupees(data.rental.enterprise.leaseRent)}`} />
          </ListCard>

          <GroupLabel>Brokerage</GroupLabel>
          <ListCard>
            <Line label={`Received · ${plural(data.brokerage.count, "deal")}`} value={rupees(data.brokerage.brokerageReceived)} strong />
            <Line label="Distributed to other parties" value={rupees(data.brokerage.brokerageDistributed)} />
            <Line label="Gross (received + distributed)" value={rupees(data.brokerage.grossBrokerage)} />
            <Line label="Still to come" value={rupees(data.brokerage.pendingBrokerage)} />
            <Line label={`Rental brokerage · ${data.brokerage.rentalBrokerage.count}`} value={rupees(data.brokerage.rentalBrokerage.brokerageReceived)} />
            <Line label={`Buy & sell · ${data.brokerage.buySell.count}`} value={rupees(data.brokerage.buySell.brokerageReceived)} />
          </ListCard>

          <Segmented
            options={[
              { key: "deals", label: `Deals · ${data.deals.length}` },
              { key: "payouts", label: `Payouts · ${data.payouts.length}` },
              { key: "enterprise", label: `Leases · ${data.enterprise.length}` },
            ]}
            value={view}
            onChange={setView}
          />

          {view === "deals" ? (
            data.deals.length ? (
              <ListCard>
                {data.deals.map((deal) => (
                  <Pressable
                    key={deal.leadId}
                    accessibilityRole={canOpenLeads ? "button" : undefined}
                    disabled={!canOpenLeads}
                    onPress={() => navigation.navigate("LeadDetail", { leadId: deal.leadId, name: deal.client })}
                    style={({ pressed }) => [styles.row, pressed && { backgroundColor: colors.surfaceAlt }]}
                  >
                    <View style={styles.flex}>
                      <Text variant="bodyStrong" numberOfLines={1} style={styles.rowTitle}>
                        {deal.client || `Deal ${deal.dealId}`}
                      </Text>
                      <Text variant="small" color="muted" numberOfLines={1}>
                        {[MODEL_LABEL[deal.model] || deal.model, deal.property, deal.closingExecutive, deal.closingDate ? formatDate(deal.closingDate) : ""].filter(Boolean).join(" · ")}
                      </Text>
                    </View>
                    <View style={styles.right}>
                      <Text variant="mono" style={styles.mono}>
                        {rupees(deal.brokerageReceived)}
                      </Text>
                      <Badge label={deal.brokeragePaymentStatus.toLowerCase()} tone={PAYMENT_TONE[deal.brokeragePaymentStatus] || "neutral"} />
                    </View>
                  </Pressable>
                ))}
              </ListCard>
            ) : (
              <EmptyState icon="briefcase-outline" title="No closed deals" message="No deal closed with brokerage in this period." />
            )
          ) : null}

          {view === "payouts" ? (
            data.payouts.length ? (
              <ListCard>
                {data.payouts.map((row, index) => (
                  <View key={`${row.dealId}-${index}`} style={styles.row}>
                    <View style={styles.flex}>
                      <Text variant="bodyStrong" numberOfLines={1} style={styles.rowTitle}>
                        {row.recipientName || row.recipientType || "Payout"}
                      </Text>
                      <Text variant="small" color="muted" numberOfLines={1}>
                        {[row.recipientName ? row.recipientType : "", row.client, row.paidDate ? formatDate(row.paidDate) : ""].filter(Boolean).join(" · ")}
                      </Text>
                    </View>
                    <Text variant="mono" style={styles.mono}>
                      {rupees(row.amount)}
                    </Text>
                  </View>
                ))}
              </ListCard>
            ) : (
              <EmptyState icon="people-outline" title="No payouts" message="Nothing was distributed to other parties in this period." />
            )
          ) : null}

          {view === "enterprise" ? (
            data.enterprise.length ? (
              <ListCard>
                {data.enterprise.map((row) => (
                  <View key={row.inventoryId} style={styles.row}>
                    <View style={styles.flex}>
                      <Text variant="bodyStrong" numberOfLines={1} style={styles.rowTitle}>
                        {row.property || "Enterprise space"}
                      </Text>
                      <Text variant="small" color="muted" numberOfLines={1}>
                        {[row.client, `rent ${rupees(row.clientRent)} − lease ${rupees(row.leaseRent)}`].filter(Boolean).join(" · ")}
                      </Text>
                    </View>
                    <Text variant="mono" color={row.monthlyProfit < 0 ? colors.danger : colors.text} style={styles.mono}>
                      {rupees(row.monthlyProfit)}/mo
                    </Text>
                  </View>
                ))}
              </ListCard>
            ) : (
              <EmptyState icon="business-outline" title="No enterprise spaces" message="Spaces leased and sublet show here." />
            )
          ) : null}

          <Card>
            <Text variant="tiny" color="faint">
              Only brokerage received is company revenue; what was distributed is shown for audit. Enterprise figures are monthly rent × {data.range.months} month{data.range.months > 1 ? "s" : ""}.
            </Text>
          </Card>
        </>
      )}
    </Body>
  );
};

const plural = (count: number, noun: string) => `${count} ${noun}${count === 1 ? "" : "s"}`;

const Line = ({ label, value, strong }: { label: string; value: string; strong?: boolean }) => (
  <View style={styles.line}>
    <Text variant={strong ? "smallStrong" : "small"} color={strong ? "text" : "muted"} style={styles.flex}>
      {label}
    </Text>
    <Text variant="mono" style={styles.mono}>
      {value}
    </Text>
  </View>
);

const styles = StyleSheet.create({
  flexOne: { flex: 1, minWidth: 0 },
  customRow: { flexDirection: "row", gap: 10 },
  flex: { flex: 1, minWidth: 0 },
  hero: { borderRadius: 22, padding: 18, gap: 6 },
  heroValue: { fontSize: 32, lineHeight: 38 },
  heroRow: { flexDirection: "row", gap: 14 },
  line: { flexDirection: "row", alignItems: "center", gap: 10, paddingHorizontal: 14, paddingVertical: 11 },
  row: { flexDirection: "row", alignItems: "center", gap: 12, padding: 12 },
  rowTitle: { fontSize: 13.5 },
  right: { alignItems: "flex-end", gap: 4 },
  mono: { fontSize: 12.5 },
});
