import React, { useLayoutEffect, useMemo, useState } from "react";
import { Pressable, Share, StyleSheet, View } from "react-native";
import { useNavigation } from "@react-navigation/native";
import { canOpenPage } from "../../api/access";
import { fetchClientBirthdays } from "../../api/coworkingBoard";
import { useAuth } from "../../auth/AuthProvider";
import { directoryFrom, upcomingBirthdays, type DirectoryClient } from "../../lib/coworkingBoard";
import { clientsCsv, kycStatusOf } from "../../lib/coworkingKyc";
import { initials } from "../../lib/format";
import { useBoard } from "../../lib/useBoard";
import { useQuery } from "../../lib/useQuery";
import { useTheme } from "../../theme/ThemeProvider";
import { Body, Card, Chip, EmptyState, ErrorState, Field, HeaderButton, Icon, ListCard, Loading, Text } from "../../ui";

type Tab = "all" | "active" | "former" | "kyc";

/*
 * Web: coworking/clients/ClientsPage. Everyone who has ever held a cabin,
 * derived from the board itself - current tenants from the cabins they sit in,
 * former ones from each cabin's history. There is no separate client table to
 * fall out of step with the board.
 */
export const ClientsScreen = () => {
  const navigation = useNavigation();
  const { colors } = useTheme();
  const { user, access } = useAuth();
  const { board, loading, error, refresh, refreshing } = useBoard();
  const { data: remoteBirthdays } = useQuery(() => fetchClientBirthdays().catch(() => []), []);
  const [tab, setTab] = useState<Tab>("all");
  const [query, setQuery] = useState("");
  const directory = useMemo(() => directoryFrom(board?.cabins || []), [board]);

  useLayoutEffect(() => {
    navigation.setOptions({
      headerRight: () => (
        <View style={styles.headerActions}>
          <HeaderButton icon="download-outline" label="Export CSV" variant="secondary" onPress={() => Share.share({ title: "Coworking clients", message: clientsCsv(directory) }).catch(() => {})} />
          {canOpenPage(user, access, "coworking_booking") ? <HeaderButton icon="grid-outline" label="Booking board" onPress={() => navigation.navigate("Bookings")} /> : null}
        </View>
      ),
    });
  }, [navigation, directory, user, access]);

  if (loading) return <Loading />;
  if (error || !board) return <ErrorState message={error || "Couldn't load clients."} onRetry={refresh} />;

  const active = directory.filter((client) => client.kind === "active");
  const former = directory.filter((client) => client.kind === "former");
  const kycDue = (client: DirectoryClient) => client.kind === "active" && !kycStatusOf({ kind: client.entityKind, documents: client.documents }).complete;
  const pendingKyc = active.filter(kycDue);
  const term = query.trim().toLowerCase();
  const shown = directory
    .filter((client) => (tab === "all" ? true : tab === "kyc" ? kycDue(client) : client.kind === tab))
    .filter((client) =>
      term
        ? `${client.name} ${client.industry || ""} ${client.contactPerson || ""} ${client.phone || ""} ${client.cabins.map((cabin) => cabin.label).join(" ")} ${client.stays.map((stay) => stay.cabinLabel).join(" ")}`.toLowerCase().includes(term)
        : true,
    );
  const remote = (remoteBirthdays || []).map((client) => ({ ...client, id: client._id, name: client.companyName || "" }));
  const birthdays = upcomingBirthdays([...new Map([...remote, ...directory].map((client) => [String(client.id || client.name), client])).values()] as { id: string; name?: string; contactPerson?: string; dateOfBirth?: string }[]);

  return (
    <Body refreshing={refreshing} onRefresh={refresh}>
      <Text variant="small" color="muted">
        {active.length} current · {former.length} former{pendingKyc.length ? ` · ${pendingKyc.length} awaiting documents` : ""}
      </Text>
      {birthdays.length ? (
        <Card style={[styles.birthdays, { backgroundColor: colors.violetSoft, borderColor: colors.violetSoft }]}>
          <Text variant="smallStrong" color={colors.violet}>
            Birthday reminders
          </Text>
          {birthdays.map((client) => (
            <Text key={String(client.id || client.name)} variant="small" color={colors.violet}>
              {client.contactPerson || client.name}: {client.daysUntil === 0 ? "birthday today" : `in ${client.daysUntil} day${client.daysUntil === 1 ? "" : "s"}`}
            </Text>
          ))}
        </Card>
      ) : null}
      <Field compact icon="search-outline" value={query} onChangeText={setQuery} placeholder="Search name, contact or cabin" />
      <View style={styles.chips}>
        <Chip variant="filter" label="All" count={directory.length} selected={tab === "all"} onPress={() => setTab("all")} />
        <Chip variant="filter" label="Current" count={active.length} selected={tab === "active"} onPress={() => setTab("active")} />
        <Chip variant="filter" label="Former" count={former.length} selected={tab === "former"} onPress={() => setTab("former")} />
        <Chip variant="filter" label="KYC due" count={pendingKyc.length} selected={tab === "kyc"} onPress={() => setTab("kyc")} />
      </View>

      {!shown.length ? (
        <EmptyState icon="people-outline" title={directory.length ? "No client matches that" : "No clients yet"} message={directory.length ? "Try another search or filter." : "Onboard a client from the booking board and they appear here."} />
      ) : (
        <ListCard>
          {shown.map((client) => (
            <Pressable
              key={client.id}
              accessibilityRole="button"
              onPress={() => navigation.navigate("ClientDetail", { id: client.id })}
              style={({ pressed }) => [styles.row, pressed && { backgroundColor: colors.surfaceAlt }]}
            >
              <View style={[styles.avatar, { backgroundColor: client.kind === "active" ? colors.primary : colors.textFaint }]}>
                <Text variant="tiny" color={colors.onPrimary}>
                  {initials(client.name)}
                </Text>
              </View>
              <View style={styles.flex}>
                <View style={styles.nameRow}>
                  <Text variant="bodyStrong" numberOfLines={1} style={styles.name}>
                    {client.name}
                  </Text>
                  {client.returning ? <Icon name="repeat" size={13} color={colors.primary} /> : null}
                  {client.duesAmount > 0 ? <Icon name="alert-circle" size={13} color={colors.danger} /> : null}
                  {kycDue(client) ? <Icon name="document-text" size={13} color={colors.warning} /> : null}
                </View>
                <Text variant="small" color="muted" numberOfLines={1}>
                  {client.kind === "active"
                    ? `${client.cabins.length} ${client.cabins.length === 1 ? "cabin" : "cabins"} · ${client.capacity} seats`
                    : `${client.stays.length} past ${client.stays.length === 1 ? "stay" : "stays"} · ${client.totalMonths} mo`}
                </Text>
              </View>
              <Icon name="chevron-forward" size={16} color={colors.textFaint} />
            </Pressable>
          ))}
        </ListCard>
      )}
    </Body>
  );
};

const styles = StyleSheet.create({
  flex: { flex: 1, minWidth: 0 },
  headerActions: { flexDirection: "row", gap: 8 },
  birthdays: { gap: 4 },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  row: { flexDirection: "row", alignItems: "center", gap: 12, padding: 12 },
  avatar: { width: 36, height: 36, borderRadius: 18, alignItems: "center", justifyContent: "center" },
  nameRow: { flexDirection: "row", alignItems: "center", gap: 5 },
  name: { flexShrink: 1, fontSize: 14 },
});
