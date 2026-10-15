import React, { useLayoutEffect, useState } from "react";
import { Linking, Pressable, StyleSheet, View } from "react-native";
import { canDoPageAction, canOpenPage } from "../../api/access";
import { mediaUrl } from "../../api/client";
import { useAuth } from "../../auth/AuthProvider";
import { STATUS_META, type BoardAction, type Cabin } from "../../lib/coworkingBoard";
import { kycStatusOf } from "../../lib/coworkingKyc";
import { formatDate, initials, rupees } from "../../lib/format";
import { useBoard } from "../../lib/useBoard";
import type { RootScreenProps } from "../../navigation/types";
import { useTheme } from "../../theme/ThemeProvider";
import { Badge, Body, Button, Card, Chip, ErrorState, FactRow, Field, GroupLabel, InlineError, ListCard, Loading, ProgressBar, Sheet, Text } from "../../ui";

const DAY = 24 * 60 * 60 * 1000;
const daysBetween = (from: string, to: string) => Math.max(0, Math.round((new Date(to).getTime() - new Date(from).getTime()) / DAY));
const HOLD_DAYS = [3, 7, 14, 30];

const MESSAGES: Partial<Record<BoardAction["type"], (cabin: Cabin) => string>> = {
  RELEASE: (cabin) => `${cabin.label} released. ${cabin.client?.name} moved to its history.`,
  RENEW: (cabin) => `${cabin.label} renewed by 12 months.`,
  CONFIRM_HOLD: (cabin) => `${cabin.label} confirmed for ${cabin.client?.name}.`,
  DROP_HOLD: (cabin) => `Hold dropped on ${cabin.label}.`,
  RECORD_PAYMENT: (cabin) => `Payment recorded for ${cabin.label}.`,
  SET_UNAVAILABLE: (cabin) => `${cabin.label} taken off the market.`,
  RETURN_TO_INVENTORY: (cabin) => `${cabin.label} is back in inventory.`,
};

/* Web: CabinDetailPanel + HoldCabinDialog + TransferCabinDialog. Who is in the cabin, on what terms, who was before, and every action on it. */
export const CabinScreen = ({ route, navigation }: RootScreenProps<"Cabin">) => {
  const { code } = route.params;
  const { colors } = useTheme();
  const { user, access } = useAuth();
  const canEdit = canDoPageAction(user, access, "coworking_booking", "edit") || canDoPageAction(user, access, "coworking_booking", "create");
  const clientsAllowed = canOpenPage(user, access, "coworking_clients");
  const { board, loading, error, refresh, refreshing, busy, actionError, run } = useBoard();
  const [notice, setNotice] = useState<string | null>(null);
  const [holdOpen, setHoldOpen] = useState(false);
  const [holdName, setHoldName] = useState("");
  const [holdDays, setHoldDays] = useState(7);
  const [moveOpen, setMoveOpen] = useState(false);
  const [target, setTarget] = useState("");
  const [confirmRelease, setConfirmRelease] = useState(false);
  const cabin = board?.cabins.find((item) => item.code === code) || null;

  useLayoutEffect(() => {
    navigation.setOptions({ title: cabin ? `Cabin ${cabin.label}` : "Cabin" });
  }, [navigation, cabin]);

  if (loading) return <Loading />;
  if (error || !board) return <ErrorState message={error || "Couldn't load the board."} onRetry={refresh} />;
  if (!cabin) return <ErrorState message="This cabin isn't on the board." onRetry={refresh} />;

  const act = async (action: BoardAction) => {
    setNotice(null);
    const before = cabin;
    if (await run(action)) setNotice(MESSAGES[action.type]?.(before) || "Saved.");
  };

  const meta = STATUS_META[cabin.status];
  const contract = cabin.contract;
  const isLet = (cabin.status === "BOOKED" || cabin.status === "RESERVED") && cabin.client && contract;
  const unavailable = cabin.status === "BLOCKED" || cabin.status === "MAINTENANCE";
  const termDays = contract ? daysBetween(contract.startDate, contract.endDate) : 0;
  const elapsed = contract ? Math.max(0, termDays - (contract.endsInDays ?? 0)) : 0;
  const dob = cabin.client?.dateOfBirth || cabin.client?.documents?.find((doc) => doc.extractedDateOfBirth)?.extractedDateOfBirth || "";
  const kyc = cabin.client ? kycStatusOf({ kind: cabin.client.kind || "company", documents: cabin.client.documents }) : null;
  const vacantTargets = board.cabins.filter((item) => item.status === "VACANT" && item.code !== cabin.code).sort((a, b) => a.seats - b.seats || a.code.localeCompare(b.code));
  const chosen = vacantTargets.find((item) => item.code === target);
  const isCompany = (cabin.client?.kind || "company") === "company";

  return (
    <Body refreshing={refreshing} onRefresh={refresh}>
      <Card style={styles.head}>
        <View style={styles.headRow}>
          <Text variant="title">{cabin.label}</Text>
          <Badge label={meta.label} tone={cabin.status === "BOOKED" ? "success" : cabin.status === "RESERVED" ? "warning" : cabin.status === "VACANT" ? "danger" : cabin.status === "BLOCKED" ? "violet" : "neutral"} />
        </View>
        <Text variant="small" color="muted">
          {cabin.seats} seater · Wing {cabin.wing} · Coworking space
        </Text>
        <View style={styles.facts}>
          <View style={[styles.fact, { borderColor: colors.border }]}>
            <Text variant="tiny" color="muted">
              Capacity
            </Text>
            <Text variant="bodyStrong">{cabin.seats} seater</Text>
          </View>
          <View style={[styles.fact, { borderColor: colors.border }]}>
            <Text variant="tiny" color="muted">
              Monthly rent
            </Text>
            <Text variant="bodyStrong">{rupees(cabin.monthlyRent)}</Text>
          </View>
        </View>
      </Card>

      {notice ? (
        <Text variant="smallStrong" color={colors.success}>
          {notice}
        </Text>
      ) : null}
      <InlineError message={actionError} />

      {isLet ? (
        <>
          <GroupLabel>{cabin.status === "RESERVED" ? "Held for" : "Current client"}</GroupLabel>
          <Card style={styles.gap}>
            <View style={styles.headRow}>
              <View style={[styles.avatar, { backgroundColor: colors.primary }]}>
                <Text variant="smallStrong" color={colors.onPrimary}>
                  {initials(cabin.client!.name)}
                </Text>
              </View>
              <View style={styles.flex}>
                <Text variant="bodyStrong" numberOfLines={1}>
                  {cabin.client!.name}
                </Text>
                <Text variant="small" color="muted" numberOfLines={1}>
                  {[cabin.client!.industry, cabin.client!.since ? `with us since ${formatDate(cabin.client!.since)}` : ""].filter(Boolean).join(" · ")}
                </Text>
              </View>
            </View>
            <FactRow label={isCompany ? "Signing authority 1" : "Contact"} value={cabin.client!.contactPerson || "—"} />
            {cabin.client!.signingAuthority2 ? <FactRow label="Signing authority 2" value={cabin.client!.signingAuthority2} /> : null}
            {cabin.client!.secondPersonName ? <FactRow label="Person 2" value={cabin.client!.secondPersonName} /> : null}
            <FactRow icon="call-outline" label="Phone" value={cabin.client!.phone || "—"} />
            <FactRow icon="mail-outline" label="Email" value={cabin.client!.email || "—"} />
            <FactRow label="GSTIN" value={cabin.client!.gstin || "—"} />
            <View style={styles.pair}>
              {cabin.client!.phone ? <Button size="sm" variant="secondary" icon="call-outline" label="Call" style={styles.flex} onPress={() => Linking.openURL(`tel:${cabin.client!.phone}`)} /> : null}
              {canEdit ? (
                <Button size="sm" variant="secondary" icon="create-outline" label="Edit client" style={styles.flex} onPress={() => navigation.navigate("Onboard", { clientId: cabin.client!.id })} />
              ) : null}
            </View>
            {clientsAllowed ? <Button size="sm" variant="secondary" icon="open-outline" label="Open client record" onPress={() => navigation.navigate("ClientDetail", { id: cabin.client!.id })} /> : null}
          </Card>

          <GroupLabel>{`Agreement · ${contract!.id}`}</GroupLabel>
          <Card style={styles.gap}>
            <Text variant="small">
              {formatDate(contract!.startDate)} – {formatDate(contract!.endDate)}
            </Text>
            {cabin.status === "BOOKED" ? (
              <>
                <ProgressBar value={termDays ? elapsed / termDays : 0} color={(contract!.endsInDays ?? 99) <= 45 ? colors.warning : colors.primary} />
                <Text variant="small" color={(contract!.endsInDays ?? 99) <= 45 ? colors.warning : colors.textMuted}>
                  {contract!.endsInDays} days left · lock-in {contract!.lockInMonths ?? 0} months
                </Text>
              </>
            ) : (
              <Text variant="smallStrong" color={colors.warning}>
                Hold expires {formatDate(cabin.holdExpiresAt)} · moves in {formatDate(contract!.startDate)}
              </Text>
            )}
            <FactRow label="Monthly rent" value={rupees(contract!.monthlyRent)} />
            <FactRow
              label="Deposit"
              value={`${rupees(contract!.deposit)}${contract!.depositMode === "custom" ? " (custom)" : contract!.depositMonths ? ` (${contract!.depositMonths} ${contract!.depositMonths === 1 ? "month" : "months"})` : ""}`}
            />
            <FactRow label="Token paid" value={rupees(contract!.tokenAmount || 0)} />
            <FactRow label="Notice period" value={`${contract!.noticePeriodDays ?? 30} days`} />
            <FactRow label="Date of birth" value={dob ? formatDate(dob) : "—"} />
            <Text variant="smallStrong" style={styles.subhead}>
              Security cheque
            </Text>
            <FactRow label="Cheque number" value={contract!.securityCheque?.number || "—"} />
            <FactRow label="Bank" value={contract!.securityCheque?.bank || "—"} />
            <FactRow label="Amount" value={rupees(Number(contract!.securityCheque?.amount) || 0)} />
            <FactRow label="Cheque date" value={contract!.securityCheque?.date || "—"} />
            {contract!.securityCheque?.file?.url ? (
              <Button size="sm" variant="ghost" icon="document-outline" label={`View ${contract!.securityCheque.file.fileName || "cheque"}`} onPress={() => Linking.openURL(mediaUrl(contract!.securityCheque!.file!.url) || contract!.securityCheque!.file!.url)} />
            ) : (
              <FactRow label="Cheque copy" value="Not uploaded" />
            )}
            <FactRow label="Payment status" value={contract!.duesAmount > 0 ? "Overdue" : "Paid"} valueColor={contract!.duesAmount > 0 ? colors.danger : colors.success} />
            <FactRow label="Next due date" value={formatDate(contract!.nextInvoiceDate)} />
            <FactRow label="Next invoice" value={rupees(contract!.nextInvoiceAmount)} />
            {contract!.notes ? (
              <Text variant="small" color="muted">
                {contract!.notes}
              </Text>
            ) : null}

            {contract!.duesAmount > 0 ? (
              <View style={[styles.dues, { backgroundColor: colors.dangerSoft }]}>
                <Text variant="smallStrong" color="danger">
                  {rupees(contract!.duesAmount)} overdue. Settle before renewing.
                </Text>
                {canEdit ? <Button size="sm" variant="secondary" icon="cash-outline" label="Record payment" loading={busy} onPress={() => act({ type: "RECORD_PAYMENT", cabinCode: cabin.code })} /> : null}
              </View>
            ) : null}

            {canEdit ? (
              cabin.status === "BOOKED" ? (
                <>
                  <View style={styles.pair}>
                    <Button size="sm" variant="secondary" icon="calendar-outline" label="Renew 12m" style={styles.flex} disabled={busy} onPress={() => act({ type: "RENEW", cabinCode: cabin.code, months: 12 })} />
                    <Button size="sm" variant="secondary" icon="swap-horizontal-outline" label="Move cabin" style={styles.flex} disabled={busy} onPress={() => { setTarget(""); setMoveOpen(true); }} />
                  </View>
                  {confirmRelease ? (
                    <View style={styles.pair}>
                      <Button size="sm" variant="secondary" label="Keep" style={styles.flex} onPress={() => setConfirmRelease(false)} />
                      <Button size="sm" variant="danger" icon="log-out-outline" label="Release now" style={styles.flex} loading={busy} onPress={() => { setConfirmRelease(false); act({ type: "RELEASE", cabinCode: cabin.code }); }} />
                    </View>
                  ) : (
                    <Button size="sm" variant="danger" icon="log-out-outline" label="Release cabin" disabled={busy} onPress={() => setConfirmRelease(true)} />
                  )}
                </>
              ) : (
                <View style={styles.pair}>
                  <Button size="sm" label="Confirm booking" style={styles.flex} loading={busy} onPress={() => act({ type: "CONFIRM_HOLD", cabinCode: cabin.code })} />
                  <Button size="sm" variant="secondary" label="Drop hold" style={styles.flex} disabled={busy} onPress={() => act({ type: "DROP_HOLD", cabinCode: cabin.code })} />
                </View>
              )
            ) : null}
          </Card>

          {kyc ? (
            <>
              <GroupLabel>{`Client documents · ${cabin.client!.documents?.length || 0}`}</GroupLabel>
              <Card style={styles.gap}>
                <Text variant="smallStrong" color={kyc.complete ? colors.success : colors.warning}>
                  {kyc.complete ? "KYC complete" : `${kyc.uploaded} of ${kyc.required} required documents`}
                </Text>
                {!kyc.complete ? (
                  <Text variant="small" color="muted">
                    Still needed: {kyc.missing.map((doc) => doc.label).join(", ")}.
                  </Text>
                ) : null}
                {clientsAllowed ? <Button size="sm" variant="secondary" icon="folder-open-outline" label="Manage documents in client profile" onPress={() => navigation.navigate("ClientDetail", { id: cabin.client!.id })} /> : null}
              </Card>
            </>
          ) : null}
        </>
      ) : null}

      {cabin.status === "VACANT" ? (
        <>
          <GroupLabel>Available to let</GroupLabel>
          <Card style={styles.gap}>
            <Text variant="small">
              Free since {formatDate(cabin.vacantSince) || "—"} · <Text variant="smallStrong">{cabin.vacantDays ?? 0} days</Text> idle
            </Text>
            <FactRow label="Deposit" value={`${rupees(cabin.deposit)} (2 months)`} />
            <FactRow label="Includes" value={cabin.amenities.join(", ") || "Not configured"} />
            {canEdit ? (
              <>
                <Button icon="person-add" label="Onboard client" onPress={() => navigation.navigate("Onboard", { codes: [cabin.code] })} />
                <Button size="sm" variant="secondary" icon="timer-outline" label="Hold for a lead" onPress={() => { setHoldName(""); setHoldDays(7); setHoldOpen(true); }} />
                <View style={styles.pair}>
                  <Button size="sm" variant="ghost" icon="ban-outline" label="Block" style={styles.flex} disabled={busy} onPress={() => act({ type: "SET_UNAVAILABLE", cabinCode: cabin.code, status: "BLOCKED", reason: "Blocked from the board." })} />
                  <Button size="sm" variant="ghost" icon="construct-outline" label="Upkeep" style={styles.flex} disabled={busy} onPress={() => act({ type: "SET_UNAVAILABLE", cabinCode: cabin.code, status: "MAINTENANCE", reason: "Sent for upkeep from the board." })} />
                </View>
              </>
            ) : null}
          </Card>
        </>
      ) : null}

      {unavailable ? (
        <>
          <GroupLabel>Off the market</GroupLabel>
          <Card style={styles.gap}>
            <Text variant="small">{cabin.unavailableReason || "No reason recorded."}</Text>
            {canEdit ? <Button size="sm" variant="secondary" icon="refresh-outline" label="Return to inventory" loading={busy} onPress={() => act({ type: "RETURN_TO_INVENTORY", cabinCode: cabin.code })} /> : null}
          </Card>
        </>
      ) : null}

      <GroupLabel>{`Previous clients · ${cabin.previousClientCount}`}</GroupLabel>
      {cabin.previousClients.length ? (
        <ListCard>
          {cabin.previousClients.map((stay) => (
            <View key={stay.id} style={styles.stay}>
              <View style={[styles.smallAvatar, { backgroundColor: colors.surfaceAlt }]}>
                <Text variant="tiny" color="muted">
                  {initials(stay.name)}
                </Text>
              </View>
              <View style={styles.flex}>
                <Text variant="smallStrong" numberOfLines={1}>
                  {stay.name}
                </Text>
                <Text variant="tiny" color="muted">
                  {formatDate(stay.from)} – {formatDate(stay.to)} · {Math.max(1, Math.round(daysBetween(stay.from, stay.to) / 30))} months
                </Text>
              </View>
            </View>
          ))}
        </ListCard>
      ) : (
        <Text variant="small" color="muted">
          No earlier tenant on record.
        </Text>
      )}

      <Sheet
        visible={holdOpen}
        title={`Hold cabin ${cabin.label}`}
        subtitle={`${cabin.seats} seater · ${rupees(cabin.monthlyRent)} per month`}
        onClose={() => setHoldOpen(false)}
        footer={
          <Button
            icon="timer-outline"
            label={`Hold for ${holdDays} days`}
            disabled={!holdName.trim()}
            loading={busy}
            onPress={async () => {
              setHoldOpen(false);
              setNotice(null);
              if (await run({ type: "HOLD", cabinCode: cabin.code, name: holdName.trim(), days: holdDays })) setNotice(`${cabin.label} held for ${holdName.trim()} for ${holdDays} days.`);
            }}
          />
        }
      >
        <Field label="Lead or company name" value={holdName} onChangeText={setHoldName} placeholder="Who is this held for?" />
        <View style={styles.chips}>
          {HOLD_DAYS.map((days) => (
            <Chip key={days} label={`${days} days`} selected={holdDays === days} onPress={() => setHoldDays(days)} />
          ))}
        </View>
        <Text variant="small" color={colors.warning}>
          The cabin shows as Reserved and can't be onboarded to anyone else. If the hold lapses, the board releases it automatically and logs it.
        </Text>
      </Sheet>

      <Sheet
        visible={moveOpen}
        title={`Move ${cabin.client?.name || "client"} out of ${cabin.label}`}
        subtitle="The agreement carries over. Only the room and its rent change."
        onClose={() => setMoveOpen(false)}
        footer={
          <Button
            icon="swap-horizontal"
            label={`Move to ${chosen?.label || "…"}`}
            disabled={!chosen}
            loading={busy}
            onPress={async () => {
              if (!chosen) return;
              setMoveOpen(false);
              setNotice(null);
              const name = cabin.client?.name;
              if (await run({ type: "TRANSFER", fromCode: cabin.code, toCode: chosen.code })) {
                setNotice(`${name} moved to ${chosen.label}.`);
                navigation.replace("Cabin", { code: chosen.code });
              }
            }}
          />
        }
      >
        {chosen ? (
          <Text variant="small">
            {cabin.label} ({cabin.seats} seater, {rupees(contract?.monthlyRent ?? cabin.monthlyRent)}/mo) → {chosen.label} ({chosen.seats} seater, {rupees(chosen.monthlyRent)}/mo
            {chosen.monthlyRent !== cabin.monthlyRent ? `, ${chosen.monthlyRent > cabin.monthlyRent ? "+" : ""}${rupees(chosen.monthlyRent - cabin.monthlyRent)}` : ", same rent"})
          </Text>
        ) : null}
        <Text variant="smallStrong" color="muted">
          Vacant cabins ({vacantTargets.length})
        </Text>
        {vacantTargets.length ? (
          <View style={styles.chips}>
            {vacantTargets.map((item) => (
              <Pressable
                key={item.code}
                accessibilityRole="radio"
                accessibilityState={{ checked: target === item.code }}
                onPress={() => setTarget(item.code)}
                style={[styles.option, { borderColor: target === item.code ? colors.primary : colors.border, backgroundColor: target === item.code ? colors.primarySoft : colors.surface }]}
              >
                <Text variant="smallStrong">{item.label}</Text>
                <Text variant="tiny" color="muted">
                  {item.seats} seater · {rupees(item.monthlyRent)}
                </Text>
              </Pressable>
            ))}
          </View>
        ) : (
          <Text variant="small" color="muted">
            No vacant cabin to move into. Release one first, or drop a hold.
          </Text>
        )}
      </Sheet>
    </Body>
  );
};

const styles = StyleSheet.create({
  flex: { flex: 1, minWidth: 0 },
  head: { gap: 6 },
  headRow: { flexDirection: "row", alignItems: "center", gap: 10 },
  facts: { flexDirection: "row", gap: 8, marginTop: 4 },
  fact: { flex: 1, borderWidth: 1, borderRadius: 12, padding: 10, gap: 2 },
  gap: { gap: 8 },
  avatar: { width: 38, height: 38, borderRadius: 19, alignItems: "center", justifyContent: "center" },
  smallAvatar: { width: 30, height: 30, borderRadius: 15, alignItems: "center", justifyContent: "center" },
  pair: { flexDirection: "row", gap: 8 },
  subhead: { marginTop: 6 },
  dues: { borderRadius: 12, padding: 10, gap: 8 },
  stay: { flexDirection: "row", alignItems: "center", gap: 10, padding: 12 },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  option: { borderWidth: 1, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 8, minWidth: "30%" },
});
