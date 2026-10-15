import React, { useMemo, useState } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { invoiceDue, isOpenInvoice, listContracts, listCwClients, listCwInvoices, refId, type Contract, type CwClient, type CwInvoice } from "../../api/coworking";
import { compactRupees } from "../finance/FinanceScreen";
import { formatRupees } from "../../lib/money";
import { useQuery } from "../../lib/useQuery";
import type { RootScreenProps } from "../../navigation/types";
import { useTheme } from "../../theme/ThemeProvider";
import { Avatar, Badge, Body, Segmented, EmptyState, ErrorState, Field, HeaderButton, Loading, Text } from "../../ui";

type Tab = "ACTIVE" | "RENEWING" | "DUES";
const RENEW_WINDOW_DAYS = 45;
const monthYear = (value: string) => new Date(value).toLocaleDateString("en-IN", { month: "short", year: "numeric" });
const dayMonth = (value: string) => new Date(value).toLocaleDateString("en-IN", { day: "numeric", month: "short" });
const humanType = (value?: string) => (value === "SME" ? "SME" : value ? value.charAt(0) + value.slice(1).toLowerCase().replace(/_/g, " ") : "");

export type ClientRow = {
  client: CwClient;
  contracts: Contract[];
  invoices: CwInvoice[];
  rent: number;
  endsOn: string | null;
  renewing: boolean;
  due: number;
  dueOn: string | null;
};

export const buildClientRows = (clients: CwClient[], contracts: Contract[], invoices: CwInvoice[]): ClientRow[] => {
  const soon = Date.now() + RENEW_WINDOW_DAYS * 86400000;
  return clients.map((client) => {
    const mine = contracts.filter((item) => refId(item.clientId as { _id: string } | string) === client._id && ["ACTIVE", "EXPIRING"].includes(item.status));
    const open = invoices.filter((item) => refId(item.clientId as { _id: string } | string) === client._id && isOpenInvoice(item));
    const ends = mine.map((item) => item.endDate).sort();
    const dues = open.map((item) => item.dueDate).sort();
    return {
      client,
      contracts: mine,
      invoices: open,
      rent: mine.reduce((sum, item) => sum + (item.rent || 0), 0),
      endsOn: ends[0] || null,
      renewing: mine.some((item) => item.status === "EXPIRING" || new Date(item.endDate).getTime() <= soon),
      due: open.reduce((sum, item) => sum + invoiceDue(item), 0),
      dueOn: dues[0] || null,
    };
  });
};

/* Design 36: coworking clients split into Active, Renewing (contracts ending soon) and Dues (open invoices). */
export const ClientsScreen = ({ navigation }: RootScreenProps<"Clients">) => {
  const { colors } = useTheme();
  const [tab, setTab] = useState<Tab>("ACTIVE");
  const [query, setQuery] = useState("");
  const { data, loading, error, refreshing, refresh } = useQuery(async () => {
    const [clients, contracts, invoices] = await Promise.all([
      listCwClients({ status: "ACTIVE" }),
      listContracts(),
      listCwInvoices().catch(() => [] as CwInvoice[]),
    ]);
    return buildClientRows(clients, contracts, invoices);
  }, []);

  React.useLayoutEffect(() => {
    navigation.setOptions({ headerRight: () => <HeaderButton icon="person-add" label="Add client" variant="secondary" onPress={() => navigation.navigate("AddClient")} /> });
  }, [navigation]);

  const counts = {
    ACTIVE: data?.length || 0,
    RENEWING: (data || []).filter((row) => row.renewing).length,
    DUES: (data || []).filter((row) => row.due > 0).length,
  };
  const rows = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return (data || [])
      .filter((row) => (tab === "RENEWING" ? row.renewing : tab === "DUES" ? row.due > 0 : true))
      .filter((row) => !needle || `${row.client.companyName} ${row.client.contactPerson || ""} ${row.client.phone || ""}`.toLowerCase().includes(needle))
      .sort((a, b) =>
        tab === "RENEWING" ? String(a.endsOn).localeCompare(String(b.endsOn)) : tab === "DUES" ? b.due - a.due : a.client.companyName.localeCompare(b.client.companyName),
      );
  }, [data, tab, query]);

  if (loading) return <Loading />;
  if (error) return <ErrorState message={error} onRetry={refresh} />;

  return (
    <Body refreshing={refreshing} onRefresh={refresh}>
      <Segmented
        options={[
          { key: "ACTIVE", label: `Active · ${counts.ACTIVE}` },
          { key: "RENEWING", label: `Renewing · ${counts.RENEWING}` },
          { key: "DUES", label: `Dues · ${counts.DUES}` },
        ]}
        value={tab}
        onChange={setTab}
      />
      {(data?.length || 0) > 6 ? <Field icon="search" compact surface value={query} onChangeText={setQuery} placeholder="Search clients" /> : null}
      {rows.length ? (
        rows.map((row) => {
          const status = row.due > 0 && tab !== "RENEWING" ? { label: "Dues", tone: "danger" as const } : row.renewing ? { label: "Renewing", tone: "warning" as const } : { label: "Active", tone: "success" as const };
          const months = row.endsOn ? Math.max(0, Math.round((new Date(row.endsOn).getTime() - Date.now()) / (30.4 * 86400000))) : null;
          const seats = row.contracts.length ? `${row.contracts.length} ${row.contracts[0]!.contractType === "SEAT" ? "seat" : "cabin"}${row.contracts.length === 1 ? "" : "s"}` : "No active contract";
          const right =
            status.label === "Dues" && row.dueOn
              ? `${compactRupees(row.due)} due ${dayMonth(row.dueOn)}`
              : status.label === "Renewing" && row.endsOn
                ? `Renews ${dayMonth(row.endsOn)}`
                : row.endsOn
                  ? `Ends ${monthYear(row.endsOn)}`
                  : "";
          return (
            <Pressable
              key={row.client._id}
              accessibilityRole="button"
              onPress={() => navigation.navigate("ClientDetail", { id: row.client._id })}
              style={({ pressed }) => [styles.card, { backgroundColor: colors.surface, borderColor: colors.border }, pressed && { opacity: 0.8 }]}
            >
              <View style={styles.top}>
                <Avatar name={row.client.companyName} size={42} />
                <View style={styles.flex}>
                  <Text variant="bodyStrong" numberOfLines={1} style={styles.name}>
                    {row.client.companyName}
                  </Text>
                  <Text variant="small" color="muted" numberOfLines={1}>
                    {[humanType(row.client.clientType), seats].filter(Boolean).join(" · ")}
                  </Text>
                </View>
                <Badge label={status.label} tone={status.tone} />
              </View>
              <View style={[styles.bottom, { borderTopColor: colors.border }]}>
                <Text variant="small" color="muted" style={styles.flex}>
                  {row.rent ? `${formatRupees(row.rent)} / mo${months !== null && months > 0 && status.label === "Active" ? ` · ${months} months` : ""}` : row.client.contactPerson || ""}
                </Text>
                <Text variant="smallStrong">{right}</Text>
              </View>
            </Pressable>
          );
        })
      ) : (
        <EmptyState
          icon={tab === "DUES" ? "checkmark-done" : "people-outline"}
          title={tab === "DUES" ? "No dues" : tab === "RENEWING" ? "Nothing up for renewal" : "No active clients"}
          message={tab === "DUES" ? "Every invoice is paid." : tab === "RENEWING" ? `No contract ends in the next ${RENEW_WINDOW_DAYS} days.` : "Add a client to start booking."}
        />
      )}
    </Body>
  );
};

const styles = StyleSheet.create({
  flex: { flex: 1, minWidth: 0 },
  chips: { flexDirection: "row", gap: 6 },
  card: { borderWidth: 1, borderRadius: 18 },
  top: { flexDirection: "row", alignItems: "center", gap: 12, padding: 14 },
  name: { fontSize: 14 },
  bottom: { flexDirection: "row", alignItems: "center", gap: 10, borderTopWidth: 1, paddingHorizontal: 14, paddingVertical: 11 },
});
