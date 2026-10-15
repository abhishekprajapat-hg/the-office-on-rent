import React, { useState } from "react";
import { Linking, Pressable, StyleSheet, View } from "react-native";
import { errorMessage } from "../../api/client";
import {
  CW_PAYMENT_METHODS,
  getCwClient,
  invoiceDue,
  isOpenInvoice,
  listBookings,
  listContracts,
  listCwInvoices,
  recordCwPayment,
  renewContract,
  type Contract,
  type CwInvoice,
} from "../../api/coworking";
import { DateTimeField } from "../../components/DateTimeField";
import { isoDay } from "../../lib/attendanceState";
import { dialable, formatDate } from "../../lib/format";
import { formatRupees, parseAmount } from "../../lib/money";
import { useQuery } from "../../lib/useQuery";
import type { RootScreenProps } from "../../navigation/types";
import { useTheme } from "../../theme/ThemeProvider";
import { Avatar, Badge, Body, Button, Chip, ErrorState, Field, GroupLabel, Icon, InlineError, ListCard, Loading, Sheet, Text } from "../../ui";

const CONTRACT_TONE = { DRAFT: "neutral", ACTIVE: "success", EXPIRING: "warning", EXPIRED: "neutral", TERMINATED: "danger" } as const;
const INVOICE_TONE = { PENDING: "warning", PARTIALLY_PAID: "warning", PAID: "success", OVERDUE: "danger", CANCELLED: "neutral" } as const;
const human = (value: string) => value.charAt(0) + value.slice(1).toLowerCase().replace(/_/g, " ");

export const ClientDetailScreen = ({ route, navigation }: RootScreenProps<"ClientDetail">) => {
  const { id } = route.params;
  const { colors } = useTheme();
  const { data, loading, error, refreshing, refresh, reload } = useQuery(async () => {
    const [client, contracts, invoices, bookings] = await Promise.all([
      getCwClient(id),
      listContracts({ clientId: id }),
      listCwInvoices({ clientId: id }).catch(() => [] as CwInvoice[]),
      listBookings({ clientId: id, limit: 20 }).catch(() => []),
    ]);
    if (!client) throw new Error("This client no longer exists.");
    return { client, contracts, invoices, bookings };
  }, [id]);

  const [paying, setPaying] = useState<CwInvoice | null>(null);
  const [amount, setAmount] = useState("");
  const [method, setMethod] = useState<string>("UPI");
  const [reference, setReference] = useState("");
  const [renewing, setRenewing] = useState<Contract | null>(null);
  const [newEnd, setNewEnd] = useState<Date | null>(null);
  const [newRent, setNewRent] = useState("");
  const [busy, setBusy] = useState(false);
  const [sheetError, setSheetError] = useState<string | null>(null);

  React.useLayoutEffect(() => {
    if (data?.client) navigation.setOptions({ title: data.client.companyName });
  }, [navigation, data?.client]);

  if (loading) return <Loading />;
  if (error || !data) return <ErrorState message={error || "Couldn't load this client."} onRetry={refresh} />;
  const { client, contracts, invoices, bookings } = data;
  const tel = dialable(client.phone);
  const outstanding = invoices.filter(isOpenInvoice).reduce((sum, item) => sum + invoiceDue(item), 0);

  const pay = async () => {
    const value = parseAmount(amount);
    if (!paying || !value) return setSheetError("Enter the amount received.");
    setBusy(true);
    setSheetError(null);
    try {
      await recordCwPayment({ invoiceId: paying._id, amount: value, method, transactionReference: reference.trim() || undefined, paymentDate: new Date().toISOString() });
      setPaying(null);
      reload();
    } catch (err) {
      setSheetError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  const renew = async () => {
    if (!renewing || !newEnd) return setSheetError("Pick the new end date.");
    setBusy(true);
    setSheetError(null);
    try {
      await renewContract(renewing._id, { newEndDate: isoDay(newEnd), newRent: parseAmount(newRent) ?? renewing.rent });
      setRenewing(null);
      reload();
    } catch (err) {
      setSheetError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Body refreshing={refreshing} onRefresh={refresh}>
      <View style={[styles.hero, { backgroundColor: colors.surface, borderColor: colors.border }]}>
        <Avatar name={client.companyName} size={54} />
        <View style={styles.flex}>
          <Text variant="heading" numberOfLines={2}>
            {client.companyName}
          </Text>
          <Text variant="small" color="muted">
            {[client.contactPerson, client.clientCode, client.clientType ? human(client.clientType) : ""].filter(Boolean).join(" · ")}
          </Text>
        </View>
        {client.status ? <Badge label={human(client.status)} tone={client.status === "ACTIVE" ? "success" : "neutral"} /> : null}
      </View>

      <View style={styles.actions}>
        {tel ? <Button label="Call" icon="call" variant="soft" style={styles.flex} onPress={() => Linking.openURL(`tel:${tel}`)} /> : null}
        {tel ? <Button label="WhatsApp" icon="logo-whatsapp" variant="soft" style={styles.flex} onPress={() => Linking.openURL(`https://wa.me/${tel.replace(/^\+/, "").replace(/^(\d{10})$/, "91$1")}`)} /> : null}
        {client.email ? <Button label="Email" icon="mail" variant="soft" style={styles.flex} onPress={() => Linking.openURL(`mailto:${client.email}`)} /> : null}
      </View>

      <ListCard>
        {[
          ["Phone", client.phone],
          ["Email", client.email],
          ["GST", client.gstNumber],
          ["KYC", client.kycStatus ? human(client.kycStatus) : ""],
          ["Outstanding", outstanding ? formatRupees(outstanding) : "Nothing due"],
        ]
          .filter(([, value]) => value)
          .map(([label, value]) => (
            <View key={label} style={styles.fact}>
              <Text variant="small" color="muted">
                {label}
              </Text>
              <Text variant="smallStrong" color={label === "Outstanding" && outstanding ? colors.danger : colors.text} selectable>
                {value}
              </Text>
            </View>
          ))}
      </ListCard>

      <GroupLabel>{`Contracts · ${contracts.length}`}</GroupLabel>
      {contracts.length ? (
        <ListCard>
          {contracts.map((item) => (
            <View key={item._id} style={styles.item}>
              <View style={styles.itemTop}>
                <Text variant="bodyStrong" style={styles.flex}>
                  {item.contractCode} · {typeof item.cabinId === "object" && item.cabinId ? item.cabinId.cabinCode : "Cabin"}
                  {item.seatCode ? ` / ${item.seatCode}` : ""}
                </Text>
                <Badge label={human(item.status)} tone={CONTRACT_TONE[item.status]} />
              </View>
              <Text variant="small" color="muted">
                {formatRupees(item.rent)} / mo · {formatDate(item.startDate)} – {formatDate(item.endDate)}
                {item.lockInPeriodMonths ? ` · ${item.lockInPeriodMonths}-month lock-in` : ""}
              </Text>
              {["ACTIVE", "EXPIRING"].includes(item.status) ? (
                <Pressable
                  accessibilityRole="button"
                  onPress={() => {
                    const next = new Date(item.endDate);
                    next.setFullYear(next.getFullYear() + 1);
                    setNewEnd(next);
                    setNewRent(String(item.rent));
                    setSheetError(null);
                    setRenewing(item);
                  }}
                >
                  <Text variant="smallStrong" color="primary">
                    Renew
                  </Text>
                </Pressable>
              ) : null}
            </View>
          ))}
        </ListCard>
      ) : (
        <Text variant="small" color="muted">
          No contracts yet.
        </Text>
      )}

      <GroupLabel>{`Invoices · ${invoices.length}`}</GroupLabel>
      {invoices.length ? (
        <ListCard>
          {invoices.map((item) => (
            <View key={item._id} style={styles.item}>
              <View style={styles.itemTop}>
                <Text variant="bodyStrong" style={styles.flex}>
                  {item.invoiceNumber}
                </Text>
                <Badge label={human(item.status)} tone={INVOICE_TONE[item.status]} />
              </View>
              <Text variant="small" color="muted">
                {formatRupees(item.totalAmount)}
                {item.amountPaid ? ` · paid ${formatRupees(item.amountPaid)}` : ""} · due {formatDate(item.dueDate)}
              </Text>
              {isOpenInvoice(item) ? (
                <Pressable
                  accessibilityRole="button"
                  onPress={() => {
                    setAmount(String(invoiceDue(item)));
                    setReference("");
                    setSheetError(null);
                    setPaying(item);
                  }}
                >
                  <Text variant="smallStrong" color="primary">
                    Record payment
                  </Text>
                </Pressable>
              ) : null}
            </View>
          ))}
        </ListCard>
      ) : (
        <Text variant="small" color="muted">
          No invoices yet.
        </Text>
      )}

      {bookings.length ? (
        <>
          <GroupLabel>Recent bookings</GroupLabel>
          <ListCard>
            {bookings.map((item) => (
              <View key={item._id} style={styles.fact}>
                <Text variant="small" style={styles.flex}>
                  {[item.cabinId?.cabinCode, item.seatCode].filter(Boolean).join(" / ")} · {formatDate(item.startDate)}
                </Text>
                <Text variant="tiny" color="muted">
                  {human(item.status)}
                </Text>
              </View>
            ))}
          </ListCard>
        </>
      ) : null}

      <Sheet
        visible={Boolean(paying)}
        title="Record payment"
        subtitle={paying ? `${paying.invoiceNumber} · ${formatRupees(invoiceDue(paying))} due` : ""}
        onClose={() => setPaying(null)}
        footer={<Button label="Save payment" icon="checkmark" loading={busy} onPress={pay} />}
      >
        <Field label="Amount" value={amount} onChangeText={setAmount} keyboardType="numeric" suffix="₹" />
        <View style={styles.chips}>
          {CW_PAYMENT_METHODS.map((key) => (
            <Chip key={key} label={key === "BANK_TRANSFER" ? "Bank transfer" : key === "UPI" ? "UPI" : human(key)} selected={method === key} onPress={() => setMethod(key)} />
          ))}
        </View>
        <Field label="Reference" value={reference} onChangeText={setReference} placeholder="UTR / cheque no. (optional)" />
        <InlineError message={sheetError} />
      </Sheet>

      <Sheet
        visible={Boolean(renewing)}
        title="Renew contract"
        subtitle={renewing ? `${renewing.contractCode} ends ${formatDate(renewing.endDate)}` : ""}
        onClose={() => setRenewing(null)}
        footer={<Button label="Renew" icon="refresh" loading={busy} onPress={renew} />}
      >
        <DateTimeField label="New end date" mode="date" variant="tile" value={newEnd} onChange={setNewEnd} minimumDate={renewing ? new Date(renewing.endDate) : undefined} />
        <Field label="New monthly rent" value={newRent} onChangeText={setNewRent} keyboardType="numeric" suffix="₹" />
        <View style={styles.note}>
          <Icon name="information-circle-outline" size={15} color={colors.textMuted} />
          <Text variant="tiny" color="muted" style={styles.flex}>
            Creates the follow-on contract; the current one stays until it ends.
          </Text>
        </View>
        <InlineError message={sheetError} />
      </Sheet>
    </Body>
  );
};

const styles = StyleSheet.create({
  flex: { flex: 1, minWidth: 0 },
  hero: { flexDirection: "row", alignItems: "center", gap: 12, padding: 14, borderRadius: 18, borderWidth: 1 },
  actions: { flexDirection: "row", gap: 8 },
  fact: { flexDirection: "row", justifyContent: "space-between", gap: 10, paddingHorizontal: 14, paddingVertical: 10 },
  item: { paddingHorizontal: 14, paddingVertical: 11, gap: 4 },
  itemTop: { flexDirection: "row", alignItems: "center", gap: 8 },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  note: { flexDirection: "row", gap: 6, alignItems: "flex-start" },
});
