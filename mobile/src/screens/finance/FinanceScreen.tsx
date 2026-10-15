import React, { useLayoutEffect, useState } from "react";
import { Linking, Pressable, ScrollView, StyleSheet, View } from "react-native";
import { useNavigation } from "@react-navigation/native";
import { decide, loadApprovals, type ApprovalItem } from "../../api/approvals";
import { errorMessage, isForbidden, mediaUrl } from "../../api/client";
import { getFinanceOverview, listDealPayments, listInvoices, listTransactions, type Transaction } from "../../api/finance";
import { useUser } from "../../auth/AuthProvider";
import { formatDate, monthKeyOf, monthLabel, shiftMonth } from "../../lib/format";
import { isManagement } from "../../lib/roles";
import { useQuery } from "../../lib/useQuery";
import { useTheme } from "../../theme/ThemeProvider";
import type { Tone } from "../../theme/tokens";
import { Badge, Body, Button, EmptyState, ErrorState, Icon, IconTile, InlineError, ListCard, Loading, Text, type IconName, FilterDropdown } from "../../ui";

/* ₹18.6 L / ₹45K / ₹1,25,000 */
export const compactRupees = (value?: number | null) => {
  const amount = Math.abs(Number(value) || 0);
  const sign = (Number(value) || 0) < 0 ? "−" : "";
  if (amount >= 1e7) return `${sign}₹${(amount / 1e7).toFixed(amount >= 1e8 ? 0 : 1)} Cr`;
  if (amount >= 1e5) return `${sign}₹${(amount / 1e5).toFixed(1)} L`;
  if (amount >= 1e4) return `${sign}₹${Math.round(amount / 1e3)}K`;
  return `${sign}₹${Math.round(amount).toLocaleString("en-IN")}`;
};
const fullRupees = (value?: number | null) => `₹${Math.round(Number(value) || 0).toLocaleString("en-IN")}`;

const MODE_ICON: Record<string, IconName> = { UPI: "phone-portrait-outline", CASH: "cash-outline", CHECK: "document-outline", CHEQUE: "document-outline", NET_BANKING_NEFTRTGSIMPS: "card-outline", BANK_TRANSFER: "card-outline" };
const MODE_LABEL: Record<string, string> = { UPI: "UPI", CASH: "Cash", CHECK: "Cheque", CHEQUE: "Cheque", NET_BANKING_NEFTRTGSIMPS: "NEFT", BANK_TRANSFER: "NEFT", CARD: "Card" };
const INVOICE_TONE: Record<string, Tone> = { PAID: "success", PARTIALLY_PAID: "warning", PENDING: "primary", OVERDUE: "danger", DRAFT: "neutral", CANCELLED: "neutral" };

type Tab = "PENDING" | "APPROVED" | "TRANSACTIONS" | "INVOICES" | "EXPENSES";

/* Design 28 - collected this month, deal payments to approve, ledger. Web: modules/finance + /finance API. */
export const FinanceScreen = () => {
  const navigation = useNavigation();
  const user = useUser();
  const { colors } = useTheme();
  const manager = isManagement(user.role);
  const [tab, setTab] = useState<Tab>("PENDING");
  const month = monthKeyOf();

  const { data, loading, error, refreshing, refresh } = useQuery(async () => {
    const overview = await getFinanceOverview(month).catch((err) => (isForbidden(err) ? null : Promise.reject(err)));
    const previous = overview ? await getFinanceOverview(shiftMonth(month, -1)).catch(() => null) : null;
    const approvals = manager ? (await loadApprovals()).filter((item) => item.kind === "payment") : [];
    const deals = manager ? [] : await listDealPayments().catch(() => []);
    return { overview, previous, approvals, deals };
  }, [month, manager]);

  useLayoutEffect(() => {
    navigation.setOptions({
      headerRight: data?.overview
        ? () => (
            <Pressable accessibilityRole="button" accessibilityLabel="Record a payment" onPress={() => navigation.navigate("RecordPayment")} hitSlop={8}>
              <Icon name="add-circle" size={24} color={colors.primary} />
            </Pressable>
          )
        : undefined,
    });
  }, [navigation, colors.primary, data?.overview]);

  if (loading) return <Loading />;
  if (error || !data) return <ErrorState message={error || "Couldn't load finance."} onRetry={refresh} />;

  const summary = data.overview?.summary;
  const prev = data.previous?.summary;
  const growth = summary && prev && prev.collected ? Math.round(((summary.collected - prev.collected) / prev.collected) * 100) : null;
  const pendingApprovals = data.approvals.filter((item) => String(item.status).toUpperCase() === "PENDING");
  const decided = data.approvals.filter((item) => String(item.status).toUpperCase() !== "PENDING");
  const myPending = data.deals.filter((lead) => String(lead.dealPayment?.approvalStatus || "PENDING").toUpperCase() === "PENDING" && lead.dealPayment?.mode);
  const myDecided = data.deals.filter((lead) => lead.dealPayment?.mode && String(lead.dealPayment?.approvalStatus || "").toUpperCase() !== "PENDING");

  const tabs: { key: Tab; label: string }[] = [
    { key: "PENDING", label: `Pending · ${manager ? pendingApprovals.length : myPending.length}` },
    { key: "APPROVED", label: "Decided" },
    ...(summary
      ? ([
          { key: "TRANSACTIONS", label: "Transactions" },
          { key: "INVOICES", label: "Invoices" },
          { key: "EXPENSES", label: "Expenses" },
        ] as { key: Tab; label: string }[])
      : []),
  ];

  return (
    <Body refreshing={refreshing} onRefresh={refresh}>
      {summary ? (
        <View style={[styles.hero, { backgroundColor: colors.hero }]}>
          <View style={styles.heroHead}>
            <Text variant="smallStrong" color={colors.onPrimaryMuted} style={styles.heroLabel}>
              Collected · {monthLabel(month).split(" ")[0]}
            </Text>
            {growth !== null ? (
              <View style={styles.growth}>
                <Text variant="tiny" color={colors.onPrimary}>
                  {growth >= 0 ? "+" : ""}
                  {growth}% vs {monthLabel(shiftMonth(month, -1), true)}
                </Text>
              </View>
            ) : null}
          </View>
          <Text variant="display" color={colors.onPrimary} style={styles.heroValue}>
            {compactRupees(summary.collected)}
          </Text>
          <View style={styles.strip}>
            <HeroTile value={compactRupees(summary.receivables)} label="Pending" />
            <HeroTile value={compactRupees(summary.overdue)} label="Overdue" />
            <HeroTile value={String(summary.receivablesCount)} label="Open invoices" />
          </View>
          <View style={styles.heroFoot}>
            <Text variant="tiny" color={colors.onPrimaryMuted}>
              Income {compactRupees(summary.income)} · Expenses {compactRupees(summary.expenses)} · Net {compactRupees(summary.net)}
            </Text>
          </View>
        </View>
      ) : null}

      <FilterDropdown label="Showing" icon="layers-outline" options={tabs} value={tab} onChange={setTab} />

      {tab === "PENDING" ? (
        manager ? (
          pendingApprovals.length ? (
            pendingApprovals.map((item) => <PaymentCard key={item.id} item={item} role={user.role} onDone={refresh} />)
          ) : (
            <EmptyState icon="checkmark-done" title="No payments to approve" message="Deal payments recorded by the team land here." />
          )
        ) : myPending.length ? (
          <DealList leads={myPending} />
        ) : (
          <EmptyState icon="cash-outline" title="Nothing pending" message="Payments you record on a closed deal wait here for approval." />
        )
      ) : null}

      {tab === "APPROVED" ? (
        manager ? (
          decided.length ? (
            <ListCard>
              {decided.slice(0, 40).map((item) => (
                <View key={item.id} style={styles.row}>
                  <IconTile icon="cash-outline" tone={String(item.status).toUpperCase() === "APPROVED" ? "success" : "danger"} />
                  <View style={styles.flex}>
                    <Text variant="bodyStrong" style={styles.rowTitle} numberOfLines={1}>
                      {String((item.raw as { name?: string }).name || item.title)}
                    </Text>
                    <Text variant="small" color="muted" style={styles.rowSub} numberOfLines={1}>
                      {item.detail}
                    </Text>
                  </View>
                  <Badge label={String(item.status).toLowerCase().replace(/^\w/, (c) => c.toUpperCase())} tone={String(item.status).toUpperCase() === "APPROVED" ? "success" : "danger"} />
                </View>
              ))}
            </ListCard>
          ) : (
            <EmptyState icon="time-outline" title="Nothing decided yet" />
          )
        ) : myDecided.length ? (
          <DealList leads={myDecided} />
        ) : (
          <EmptyState icon="time-outline" title="Nothing decided yet" />
        )
      ) : null}

      {tab === "TRANSACTIONS" ? <Ledger type="ALL" month={month} /> : null}
      {tab === "EXPENSES" ? <Ledger type="EXPENSE" month={month} /> : null}
      {tab === "INVOICES" ? <Invoices /> : null}
    </Body>
  );
};

const HeroTile = ({ value, label }: { value: string; label: string }) => {
  const { colors } = useTheme();
  return (
    <View style={styles.heroTile}>
      <Text variant="bodyStrong" color={colors.onPrimary} style={styles.heroTileValue}>
        {value}
      </Text>
      <Text variant="tiny" color={colors.onPrimaryMuted} style={styles.regular}>
        {label}
      </Text>
    </View>
  );
};

/* Deal payment awaiting a manager: Reject · View proof · Approve. */
const PaymentCard = ({ item, role, onDone }: { item: ApprovalItem; role: string; onDone: () => void }) => {
  const { colors } = useTheme();
  const [busy, setBusy] = useState<null | "approve" | "reject">(null);
  const [error, setError] = useState<string | null>(null);
  const lead = item.raw as { name?: string; dealPayment?: { mode?: string; paymentType?: string }; brokerageReceived?: number };
  const mode = String(lead.dealPayment?.mode || "");
  const run = async (approve: boolean) => {
    setBusy(approve ? "approve" : "reject");
    setError(null);
    try {
      await decide(item, approve, "", role);
      onDone();
    } catch (err) {
      setError(errorMessage(err));
      setBusy(null);
    }
  };
  const proof = item.documents?.[0];
  return (
    <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
      <View style={styles.cardHead}>
        <IconTile icon={MODE_ICON[mode] || "cash-outline"} tone="warning" size={38} iconSize={18} />
        <View style={styles.flex}>
          <Text variant="bodyStrong" style={styles.rowTitle} numberOfLines={1}>
            {lead.name || item.title}
          </Text>
          <Text variant="small" color="muted" style={styles.rowSub} numberOfLines={2}>
            {[lead.dealPayment?.paymentType === "PARTIAL" ? "Part payment" : "Full payment", MODE_LABEL[mode] || mode, item.requestedBy?.name ? `by ${item.requestedBy.name}` : ""].filter(Boolean).join(" · ")}
          </Text>
        </View>
        {lead.brokerageReceived ? (
          <Text variant="mono" style={styles.amount}>
            {fullRupees(lead.brokerageReceived)}
          </Text>
        ) : null}
      </View>
      {item.note ? (
        <Text variant="small" color="muted">
          {item.note}
        </Text>
      ) : null}
      <InlineError message={error} />
      <View style={styles.actions}>
        <Button size="sm" variant="secondary" label="Reject" style={styles.flex} loading={busy === "reject"} onPress={() => run(false)} />
        <Button size="sm" variant="soft" label="View proof" style={styles.flex} disabled={!proof} onPress={() => proof && Linking.openURL(mediaUrl(proof.url) || proof.url)} />
        <Button size="sm" label="Approve" style={styles.flex} loading={busy === "approve"} onPress={() => run(true)} />
      </View>
    </View>
  );
};

const DealList = ({ leads }: { leads: Awaited<ReturnType<typeof listDealPayments>> }) => {
  const navigation = useNavigation();
  return (
    <ListCard>
      {leads.map((lead) => {
        const status = String(lead.dealPayment?.approvalStatus || "PENDING").toUpperCase();
        const mode = String(lead.dealPayment?.mode || "");
        return (
          <Pressable key={lead._id} onPress={() => navigation.navigate("LeadDetail", { leadId: lead._id, name: lead.name })} style={styles.row}>
            <IconTile icon={MODE_ICON[mode] || "cash-outline"} tone={status === "APPROVED" ? "success" : status === "REJECTED" ? "danger" : "warning"} />
            <View style={styles.flex}>
              <Text variant="bodyStrong" style={styles.rowTitle} numberOfLines={1}>
                {lead.name}
              </Text>
              <Text variant="small" color="muted" style={styles.rowSub} numberOfLines={1}>
                {[lead.dealPayment?.paymentType === "PARTIAL" ? `Part paid · ${fullRupees(lead.dealPayment?.remainingAmount)} due` : "Paid in full", MODE_LABEL[mode] || mode].filter(Boolean).join(" · ")}
              </Text>
            </View>
            <Badge label={status.toLowerCase().replace(/^\w/, (c) => c.toUpperCase())} tone={status === "APPROVED" ? "success" : status === "REJECTED" ? "danger" : "warning"} />
          </Pressable>
        );
      })}
    </ListCard>
  );
};

const Ledger = ({ type, month }: { type: "ALL" | "EXPENSE"; month: string }) => {
  const { colors } = useTheme();
  const [all, setAll] = useState(false);
  const { data, loading, error, refresh } = useQuery(() => listTransactions({ type, ...(all ? {} : { month }) }), [type, month, all]);
  if (loading) return <Loading />;
  if (error || !data) return <ErrorState message={error || "Couldn't load transactions."} onRetry={refresh} />;
  return (
    <>
      <View style={styles.totals}>
        <Text variant="small" color="muted" style={styles.flex}>
          {all ? "All time" : monthLabel(month)} · in {compactRupees(data.totals.in)} · out {compactRupees(data.totals.out)}
        </Text>
        <Pressable onPress={() => setAll(!all)} hitSlop={8}>
          <Text variant="smallStrong" color="primary">
            {all ? "This month" : "All time"}
          </Text>
        </Pressable>
      </View>
      {data.transactions.length ? (
        <ListCard>
          {data.transactions.map((row: Transaction) => (
            <View key={row.id} style={styles.row}>
              <IconTile icon={row.kind === "INCOME" ? "arrow-down" : "arrow-up"} tone={row.kind === "INCOME" ? "success" : "danger"} />
              <View style={styles.flex}>
                <Text variant="bodyStrong" style={styles.rowTitle} numberOfLines={1}>
                  {row.title}
                </Text>
                <Text variant="small" color="muted" style={styles.rowSub} numberOfLines={1}>
                  {[row.party, row.category.replace(/_/g, " ").toLowerCase(), MODE_LABEL[row.method] || row.method.toLowerCase(), formatDate(row.date)].filter(Boolean).join(" · ")}
                </Text>
              </View>
              <View style={styles.right}>
                <Text variant="mono" color={row.amount < 0 ? colors.danger : colors.success} style={styles.amount}>
                  {row.amount < 0 ? "−" : "+"} {fullRupees(Math.abs(row.amount))}
                </Text>
                {row.status !== "PAID" ? <Badge label={row.status.toLowerCase()} tone={row.status === "PENDING" ? "warning" : "neutral"} /> : null}
              </View>
            </View>
          ))}
        </ListCard>
      ) : (
        <EmptyState icon="receipt-outline" title="No entries" message="Payments and expenses recorded here or on the web appear in this list." />
      )}
    </>
  );
};

const Invoices = () => {
  const { data, loading, error, refresh } = useQuery(() => listInvoices(), []);
  if (loading) return <Loading />;
  if (error) return <ErrorState message={error} onRetry={refresh} />;
  if (!data?.length) return <EmptyState icon="document-text-outline" title="No invoices" message="Coworking invoices appear here." />;
  return (
    <ListCard>
      {data.map((invoice) => {
        const status = String(invoice.status || "PENDING").toUpperCase();
        const balance = Math.max(0, (invoice.totalAmount || 0) - (invoice.amountPaid || 0));
        return (
          <View key={invoice._id} style={styles.row}>
            <IconTile icon="document-text" tone={INVOICE_TONE[status] || "neutral"} />
            <View style={styles.flex}>
              <Text variant="bodyStrong" style={styles.rowTitle} numberOfLines={1}>
                {invoice.clientId?.companyName || invoice.clientId?.name || invoice.invoiceNumber || "Invoice"}
              </Text>
              <Text variant="small" color="muted" style={styles.rowSub} numberOfLines={1}>
                {[invoice.invoiceNumber, invoice.dueDate ? `due ${formatDate(invoice.dueDate)}` : "", balance ? `${fullRupees(balance)} open` : ""].filter(Boolean).join(" · ")}
              </Text>
            </View>
            <View style={styles.right}>
              <Text variant="mono" style={styles.amount}>
                {fullRupees(invoice.totalAmount)}
              </Text>
              <Badge label={status.replace(/_/g, " ").toLowerCase()} tone={INVOICE_TONE[status] || "neutral"} />
            </View>
          </View>
        );
      })}
    </ListCard>
  );
};

const styles = StyleSheet.create({
  flex: { flex: 1, minWidth: 0 },
  regular: { fontFamily: "PlusJakartaSans_400Regular" },
  hero: { borderRadius: 22, padding: 16, gap: 12 },
  heroHead: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  heroLabel: { fontFamily: "PlusJakartaSans_600SemiBold" },
  growth: { backgroundColor: "rgba(255,255,255,0.16)", borderRadius: 999, paddingHorizontal: 8, paddingVertical: 3 },
  heroValue: { fontSize: 32, lineHeight: 38 },
  strip: { flexDirection: "row", gap: 6 },
  heroTile: { flex: 1, backgroundColor: "rgba(255,255,255,0.12)", borderRadius: 12, padding: 8 },
  heroTileValue: { fontSize: 14, fontFamily: "PlusJakartaSans_800ExtraBold" },
  heroFoot: { marginTop: -2 },
  chipScroll: { flexGrow: 0 },
  chips: { gap: 6, alignItems: "center" },
  chip: { paddingHorizontal: 12, paddingVertical: 7, borderRadius: 999 },
  card: { borderWidth: 1, borderRadius: 18, padding: 12, gap: 10 },
  cardHead: { flexDirection: "row", alignItems: "center", gap: 10 },
  actions: { flexDirection: "row", gap: 6 },
  row: { flexDirection: "row", alignItems: "center", gap: 10, paddingHorizontal: 12, paddingVertical: 11 },
  rowTitle: { fontSize: 13.5 },
  rowSub: { fontSize: 11.5 },
  amount: { fontSize: 13.5, fontFamily: "JetBrainsMono_500Medium" },
  right: { alignItems: "flex-end", gap: 3 },
  totals: { flexDirection: "row", alignItems: "center", gap: 8 },
});
