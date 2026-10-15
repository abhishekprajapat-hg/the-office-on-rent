import React, { useLayoutEffect, useMemo, useState } from "react";
import { Linking, Pressable, StyleSheet, View } from "react-native";
import { canDoPageAction, canOpenPage } from "../../api/access";
import { useAuth } from "../../auth/AuthProvider";
import { BillstackCard } from "../../components/BillstackCard";
import { DocumentChecklist } from "../../components/coworking/DocumentChecklist";
import { StatusDot } from "../../components/coworking/CabinTile";
import { directoryFrom, type BoardDocument } from "../../lib/coworkingBoard";
import { CLIENT_KINDS, kycStatusOf } from "../../lib/coworkingKyc";
import { formatDate, initials, rupees } from "../../lib/format";
import { useBoard } from "../../lib/useBoard";
import type { RootScreenProps } from "../../navigation/types";
import { useTheme } from "../../theme/ThemeProvider";
import { Badge, Body, Button, Card, ErrorState, FactRow, GroupLabel, Icon, InlineError, ListCard, Loading, Text } from "../../ui";

/*
 * Web: coworking/clients/components/ClientProfile. One client, current or
 * former: what they pay, the cabins they hold, their documents (editable here),
 * and every earlier stay.
 */
export const ClientDetailScreen = ({ route, navigation }: RootScreenProps<"ClientDetail">) => {
  const { id } = route.params;
  const { colors } = useTheme();
  const { user, access } = useAuth();
  const canEdit = canDoPageAction(user, access, "coworking_clients", "edit") || canDoPageAction(user, access, "coworking_booking", "edit");
  const boardAllowed = canOpenPage(user, access, "coworking_booking");
  const { board, loading, error, refresh, refreshing, busy, actionError, run } = useBoard();
  const [notice, setNotice] = useState<string | null>(null);
  const client = useMemo(() => directoryFrom(board?.cabins || []).find((item) => item.id === id) || null, [board, id]);

  useLayoutEffect(() => {
    navigation.setOptions({ title: client?.name || "Client" });
  }, [navigation, client?.name]);

  if (loading) return <Loading />;
  if (error || !board) return <ErrorState message={error || "Couldn't load this client."} onRetry={refresh} />;
  if (!client) return <ErrorState message="This client isn't on the booking board any more." onRetry={refresh} />;

  const isActive = client.kind === "active";
  const kyc = kycStatusOf({ kind: client.entityKind, documents: client.documents });
  const kindLabel = CLIENT_KINDS.find((option) => option.id === client.entityKind)?.label;
  const dob = client.dateOfBirth || client.documents.find((doc) => doc.extractedDateOfBirth)?.extractedDateOfBirth;
  const booked = client.cabins.find((cabin) => cabin.status === "BOOKED");
  const openCabin = (code: string) => boardAllowed && navigation.navigate("Cabin", { code });

  const saveDocuments = async (documents: BoardDocument[]) => {
    setNotice(null);
    if (await run({ type: "SET_CLIENT_DOCUMENTS", clientId: client.id, documents })) setNotice("Documents updated.");
  };

  return (
    <Body refreshing={refreshing} onRefresh={refresh}>
      <Card style={styles.head}>
        <View style={styles.headRow}>
          <View style={[styles.avatar, { backgroundColor: isActive ? colors.primary : colors.textFaint }]}>
            <Text variant="bodyStrong" color={colors.onPrimary}>
              {initials(client.name)}
            </Text>
          </View>
          <View style={styles.flex}>
            <Text variant="title" numberOfLines={2}>
              {client.name}
            </Text>
            <Text variant="small" color="muted">
              {client.industry || "Industry not recorded"}
              {isActive && client.since ? ` · with us since ${formatDate(client.since)}` : ""}
              {!isActive && client.lastLeft ? ` · left ${formatDate(client.lastLeft)}` : ""}
            </Text>
          </View>
        </View>
        <View style={styles.badges}>
          <Badge label={isActive ? "Current client" : "Former client"} tone={isActive ? "success" : "neutral"} />
          {kindLabel ? <Badge label={`${kindLabel}${client.entityType ? ` · ${client.entityType}` : ""}`} /> : null}
          <Badge label={kyc.complete ? "KYC complete" : `KYC ${kyc.uploaded}/${kyc.required}`} tone={kyc.complete ? "success" : "warning"} />
          {client.returning ? <Badge label="Returning" tone="primary" /> : null}
        </View>
      </Card>

      <View style={styles.stats}>
        {isActive ? (
          <>
            <Stat label="Monthly rent" value={rupees(client.monthlyRent)} />
            <Stat label="Cabins" value={String(client.cabins.length)} />
            <Stat label="Seats" value={String(client.capacity)} />
          </>
        ) : (
          <>
            <Stat label="Cabins held" value={String(client.stays.length)} />
            <Stat label="Total tenancy" value={`${client.totalMonths} mo`} />
            <Stat label="Last seen" value={formatDate(client.lastLeft) || "—"} />
          </>
        )}
      </View>

      {notice ? (
        <Text variant="smallStrong" color={colors.success}>
          {notice}
        </Text>
      ) : null}
      <InlineError message={actionError} />

      {client.duesAmount > 0 ? (
        <Card style={[styles.gap, { backgroundColor: colors.dangerSoft, borderColor: colors.dangerSoft }]}>
          <Text variant="smallStrong" color="danger">
            {rupees(client.duesAmount)} overdue
          </Text>
          {canEdit
            ? client.cabins
                .filter((cabin) => (cabin.contract?.duesAmount || 0) > 0)
                .map((cabin) => (
                  <Button
                    key={cabin.code}
                    size="sm"
                    variant="secondary"
                    icon="cash-outline"
                    label={`Record payment for ${cabin.label}`}
                    loading={busy}
                    onPress={async () => {
                      setNotice(null);
                      if (await run({ type: "RECORD_PAYMENT", cabinCode: cabin.code })) setNotice(`Payment recorded for ${cabin.label}.`);
                    }}
                  />
                ))
            : null}
        </Card>
      ) : null}

      {booked ? <BillstackCard entityType="board" entityId={booked.code} /> : null}

      <GroupLabel>Contact</GroupLabel>
      <Card>
        <FactRow label={client.entityKind === "company" ? "Signing authority 1" : "Contact"} value={client.contactPerson || "Not recorded"} />
        {client.signingAuthority2 ? <FactRow label="Signing authority 2" value={client.signingAuthority2} /> : null}
        {client.secondPersonName ? <FactRow label="Person 2" value={client.secondPersonName} /> : null}
        <FactRow label="Work profile" value={client.industry || "Not recorded"} />
        <FactRow icon="call-outline" label="Phone" value={client.phone || "Not recorded"} />
        <FactRow icon="mail-outline" label="Email" value={client.email || "Not recorded"} />
        <FactRow label="GSTIN" value={client.gstin || "Not recorded"} />
        <FactRow label="Date of birth" value={dob ? formatDate(dob) : "Not recorded"} />
        <View style={styles.pair}>
          {client.phone ? <Button size="sm" variant="secondary" icon="call-outline" label="Call" style={styles.flex} onPress={() => Linking.openURL(`tel:${client.phone}`)} /> : null}
          {client.email ? <Button size="sm" variant="secondary" icon="mail-outline" label="Email" style={styles.flex} onPress={() => Linking.openURL(`mailto:${client.email}`)} /> : null}
        </View>
        {isActive && canEdit && client.cabins.some((cabin) => cabin.contract) ? (
          <Button size="sm" variant="secondary" icon="create-outline" label="Edit client and agreement" style={styles.top} onPress={() => navigation.navigate("Onboard", { clientId: client.id })} />
        ) : null}
      </Card>

      {isActive ? (
        <>
          <GroupLabel>{`Cabins held · ${client.cabins.length}`}</GroupLabel>
          <ListCard>
            {client.cabins.map((cabin) => (
              <Pressable key={cabin.code} accessibilityRole="button" disabled={!boardAllowed} onPress={() => openCabin(cabin.code)} style={({ pressed }) => [styles.row, pressed && { backgroundColor: colors.surfaceAlt }]}>
                <StatusDot status={cabin.status} />
                <Text variant="bodyStrong">{cabin.label}</Text>
                <Text variant="small" color="muted" style={styles.flex}>
                  {cabin.seats} seater
                </Text>
                <View style={styles.right}>
                  <Text variant="smallStrong">{rupees(cabin.contract?.monthlyRent ?? cabin.monthlyRent)}</Text>
                  <Text variant="tiny" color={(cabin.contract?.endsInDays ?? 99) <= 45 ? colors.warning : colors.textMuted}>
                    {cabin.contract ? `${cabin.contract.endsInDays}d left` : "—"}
                  </Text>
                </View>
                {boardAllowed ? <Icon name="chevron-forward" size={15} color={colors.textFaint} /> : null}
              </Pressable>
            ))}
          </ListCard>
          {client.earliestEnd ? (
            <Text variant="small" color="muted">
              Next renewal {formatDate(client.earliestEnd)}
            </Text>
          ) : null}
        </>
      ) : null}

      <GroupLabel>{`Documents · ${kyc.totalUploaded}/${kyc.total}`}</GroupLabel>
      <DocumentChecklist kind={client.entityKind || "company"} documents={client.documents || []} onChange={saveDocuments} readOnly={!canEdit || busy} />

      <GroupLabel>{`Tenancy history · ${client.stays.length}`}</GroupLabel>
      {client.stays.length ? (
        <>
          <ListCard>
            {client.stays.map((stay) => (
              <Pressable key={stay.id} accessibilityRole="button" disabled={!boardAllowed} onPress={() => openCabin(stay.cabinCode)} style={styles.row}>
                <Text variant="smallStrong" color={boardAllowed ? colors.primary : colors.text}>
                  {stay.cabinLabel}
                </Text>
                <Text variant="small" color="muted">
                  {stay.seats} seater
                </Text>
                <Text variant="small" style={styles.flex} numberOfLines={1}>
                  {formatDate(stay.from)} – {formatDate(stay.to)}
                </Text>
                <Text variant="small" color="muted">
                  {stay.months} mo
                </Text>
              </Pressable>
            ))}
          </ListCard>
          <Text variant="small" color="muted">
            {client.totalMonths ? `${client.totalMonths} ${client.totalMonths === 1 ? "month" : "months"} of earlier tenancy.` : "No earlier tenancy on record."}
          </Text>
        </>
      ) : (
        <Text variant="small" color="muted">
          This is their first tenancy in this coworking space.
        </Text>
      )}
    </Body>
  );
};

const Stat = ({ label, value }: { label: string; value: string }) => {
  const { colors } = useTheme();
  return (
    <View style={[styles.stat, { borderColor: colors.border, backgroundColor: colors.surface }]}>
      <Text variant="tiny" color="muted">
        {label}
      </Text>
      <Text variant="bodyStrong" numberOfLines={1}>
        {value}
      </Text>
    </View>
  );
};

const styles = StyleSheet.create({
  flex: { flex: 1, minWidth: 0 },
  head: { gap: 10 },
  headRow: { flexDirection: "row", alignItems: "center", gap: 12 },
  avatar: { width: 48, height: 48, borderRadius: 24, alignItems: "center", justifyContent: "center" },
  badges: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  stats: { flexDirection: "row", gap: 8 },
  stat: { flex: 1, borderWidth: 1, borderRadius: 14, padding: 10, gap: 2 },
  gap: { gap: 8 },
  pair: { flexDirection: "row", gap: 8, marginTop: 8 },
  top: { marginTop: 8 },
  row: { flexDirection: "row", alignItems: "center", gap: 10, padding: 12 },
  right: { alignItems: "flex-end" },
});
