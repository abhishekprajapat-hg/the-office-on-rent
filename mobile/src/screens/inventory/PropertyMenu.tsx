import React, { useEffect, useState } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { useNavigation } from "@react-navigation/native";
import { canDoPageAction } from "../../api/access";
import { errorMessage } from "../../api/client";
import { deleteProperty, requestPropertyDelete, requestPropertyUpdate, updateProperty, type InventoryStatus, type Property, type PropertyPatch } from "../../api/inventory";
import { listLeads } from "../../api/leads";
import type { Lead } from "../../api/types";
import { useAuth } from "../../auth/AuthProvider";
import { SOLD_PAYMENT_MODES, inventoryAccess, validateSale } from "../../lib/inventoryAccess";
import { parseAmount } from "../../lib/money";
import { propertyTitle } from "../../lib/property";
import { useTheme } from "../../theme/ThemeProvider";
import { ActionSheet, Button, Chip, Field, Icon, InlineError, Sheet, Text, type SheetAction } from "../../ui";

const STATUSES: InventoryStatus[] = ["Available", "Blocked", "Sold"];

/* A lead to block or sell the property for: inline search, no sheet on top of a sheet. */
const LeadSearch = ({ selected, onPick }: { selected: { id: string; name: string } | null; onPick: (lead: { id: string; name: string }) => void }) => {
  const { colors } = useTheme();
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Lead[]>([]);
  useEffect(() => {
    let alive = true;
    const timer = setTimeout(() => {
      listLeads({ page: 1, limit: 6, search: query })
        .then((res) => alive && setResults(res.leads))
        .catch(() => alive && setResults([]));
    }, 300);
    return () => {
      alive = false;
      clearTimeout(timer);
    };
  }, [query]);
  return (
    <View style={styles.gap}>
      <Text variant="smallStrong" color="muted">
        Lead{selected ? ` · ${selected.name}` : ""}
      </Text>
      <Field compact icon="search-outline" value={query} onChangeText={setQuery} placeholder="Search leads by name or phone" />
      {results.map((lead) => {
        const on = selected?.id === lead._id;
        return (
          <Pressable
            key={lead._id}
            accessibilityRole="radio"
            accessibilityState={{ checked: on }}
            onPress={() => onPick({ id: lead._id, name: lead.name })}
            style={[styles.lead, { backgroundColor: on ? colors.primarySoft : colors.surfaceAlt }]}
          >
            <Text variant="small" style={styles.flex} numberOfLines={1}>
              {lead.name} · {lead.phone}
            </Text>
            {on ? <Icon name="checkmark" size={16} color={colors.primary} /> : null}
          </Pressable>
        );
      })}
    </View>
  );
};

/*
 * The property's "more" menu (web AssetVault row actions): edit, change
 * status (Blocked and Sold need a lead), activity log, delete. Admins and
 * managers act directly; executives send requests an admin approves.
 */
export const PropertyMenu = ({ property, onChanged, onNotice }: { property: Property; onChanged: () => void; onNotice: (message: string) => void }) => {
  const navigation = useNavigation();
  const { colors } = useTheme();
  const { user, access } = useAuth();
  const can = inventoryAccess(user?.role, access);
  // Edits and status changes are PATCHes / update requests, which the server gates on the inventory edit action.
  const editGranted = canDoPageAction(user, access, "inventory", "edit");
  const [menu, setMenu] = useState(false);
  const [statusOpen, setStatusOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [status, setStatus] = useState<InventoryStatus>("Available");
  const [lead, setLead] = useState<{ id: string; name: string } | null>(null);
  const [reason, setReason] = useState("");
  const [sale, setSale] = useState({ paymentMode: "UPI", paymentType: "FULL" as "FULL" | "PARTIAL", total: "", remaining: "", reference: "", note: "" });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const actions: SheetAction[] = [
    can.canEdit && editGranted
      ? { key: "edit", label: can.canManage ? "Edit property" : "Request an edit", icon: "create-outline", hint: can.canManage ? undefined : "An admin approves the change", onPress: () => navigation.navigate("AddProperty", { id: property._id }) }
      : null,
    can.canChangeStatus && editGranted
      ? {
          key: "status",
          label: "Change status",
          icon: "swap-horizontal-outline",
          hint: can.canManage ? `Now ${property.status || "—"}` : "An admin approves the change",
          onPress: () => {
            setStatus((property.status as InventoryStatus) || "Available");
            setLead(null);
            setReason("");
            setError(null);
            setStatusOpen(true);
          },
        }
      : null,
    can.canSeeActivity ? { key: "activity", label: "Activity log", icon: "time-outline", onPress: () => navigation.navigate("PropertyActivity", { id: property._id, title: propertyTitle(property) }) } : null,
    can.canDeleteDirect || can.canRequestDelete
      ? {
          key: "delete",
          label: can.canDeleteDirect ? "Delete property" : "Request delete",
          icon: "trash-outline",
          destructive: true,
          hint: can.canDeleteDirect ? undefined : "An admin approves the delete",
          onPress: () => {
            setReason("");
            setError(null);
            setDeleteOpen(true);
          },
        }
      : null,
  ].filter(Boolean) as SheetAction[];

  if (!actions.length) return null;

  const saveStatus = async () => {
    const patch: PropertyPatch = { status };
    if (status === "Available") {
      patch.reservationReason = "";
      patch.reservationLeadId = null;
    }
    if (status === "Blocked") {
      if (!lead) return setError("Pick the lead this property is blocked for.");
      if (!reason.trim()) return setError("Say why it's blocked.");
      patch.reservationLeadId = lead.id;
      patch.reservationReason = reason.trim();
    }
    if (status === "Sold") {
      const totalAmount = parseAmount(sale.total);
      const remainingAmount = sale.paymentType === "PARTIAL" ? parseAmount(sale.remaining) : 0;
      const invalid = validateSale({ leadId: lead?.id || "", paymentMode: sale.paymentMode, paymentType: sale.paymentType, totalAmount, remainingAmount, paymentReference: sale.reference });
      if (invalid) return setError(invalid);
      patch.saleDetails = {
        leadId: lead!.id,
        paymentMode: sale.paymentMode,
        paymentType: sale.paymentType,
        totalAmount: totalAmount!,
        remainingAmount: remainingAmount || 0,
        paymentReference: sale.paymentMode === "CASH" ? "" : sale.reference.trim(),
        note: sale.note.trim(),
        soldAt: new Date().toISOString(),
      };
    }
    setBusy(true);
    setError(null);
    try {
      if (can.canManage) {
        await updateProperty(property._id, patch);
        onNotice(`Marked ${status.toLowerCase()}.`);
      } else {
        await requestPropertyUpdate(property._id, patch, status === "Blocked" ? reason.trim() : undefined);
        onNotice("Status change sent to an admin for approval.");
      }
      setStatusOpen(false);
      onChanged();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  const runDelete = async () => {
    setBusy(true);
    setError(null);
    try {
      if (can.canDeleteDirect) {
        const result = await deleteProperty(property._id);
        setDeleteOpen(false);
        if (result.pendingApproval) {
          onNotice(result.message || "Delete request sent to an admin for approval.");
        } else {
          navigation.goBack();
        }
      } else {
        await requestPropertyDelete(property._id, reason.trim() || "Delete requested from the mobile app");
        setDeleteOpen(false);
        onNotice("Delete request sent to an admin for approval.");
      }
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <Pressable accessibilityRole="button" accessibilityLabel="More actions" onPress={() => setMenu(true)} style={[styles.round, { backgroundColor: colors.surface }]}>
        <Icon name="ellipsis-horizontal" size={18} color={colors.primary} />
      </Pressable>
      <ActionSheet visible={menu} title={propertyTitle(property)} actions={actions} onClose={() => setMenu(false)} />

      <Sheet
        visible={statusOpen}
        title="Change status"
        subtitle={can.canManage ? propertyTitle(property) : "Goes to an admin for approval"}
        onClose={() => setStatusOpen(false)}
        footer={
          <>
            <InlineError message={error} />
            <Button label={can.canManage ? "Save status" : "Send request"} loading={busy} disabled={status === property.status && status === "Available"} onPress={saveStatus} />
          </>
        }
      >
        <View style={styles.chips}>
          {STATUSES.map((item) => (
            <Chip key={item} label={item} selected={status === item} onPress={() => setStatus(item)} />
          ))}
        </View>
        {status === "Blocked" || status === "Sold" ? <LeadSearch selected={lead} onPick={setLead} /> : null}
        {status === "Blocked" ? <Field label="Reason" value={reason} onChangeText={setReason} placeholder="e.g. Token received, agreement next week" multiline /> : null}
        {status === "Sold" ? (
          <>
            <View style={styles.chips}>
              {SOLD_PAYMENT_MODES.map((mode) => (
                <Chip key={mode.key} label={mode.label} selected={sale.paymentMode === mode.key} onPress={() => setSale((prev) => ({ ...prev, paymentMode: mode.key }))} />
              ))}
            </View>
            <View style={styles.chips}>
              <Chip label="Full payment" selected={sale.paymentType === "FULL"} onPress={() => setSale((prev) => ({ ...prev, paymentType: "FULL" }))} />
              <Chip label="Part payment" selected={sale.paymentType === "PARTIAL"} onPress={() => setSale((prev) => ({ ...prev, paymentType: "PARTIAL" }))} />
            </View>
            <Field label="Sold for" value={sale.total} onChangeText={(total) => setSale((prev) => ({ ...prev, total }))} placeholder="e.g. 1.2 cr" suffix="₹" />
            {sale.paymentType === "PARTIAL" ? <Field label="Still to come" value={sale.remaining} onChangeText={(remaining) => setSale((prev) => ({ ...prev, remaining }))} placeholder="e.g. 20 lakh" suffix="₹" /> : null}
            {sale.paymentMode !== "CASH" ? <Field label="Payment reference" value={sale.reference} onChangeText={(reference) => setSale((prev) => ({ ...prev, reference }))} placeholder="UTR / cheque number" /> : null}
            <Field label="Note (optional)" value={sale.note} onChangeText={(note) => setSale((prev) => ({ ...prev, note }))} />
          </>
        ) : null}
      </Sheet>

      <Sheet
        visible={deleteOpen}
        title={can.canDeleteDirect ? "Delete this property?" : "Ask to delete this property"}
        subtitle={can.canDeleteDirect ? "It's removed from inventory for everyone." : "An admin approves deletes."}
        onClose={() => setDeleteOpen(false)}
        footer={
          <>
            <InlineError message={error} />
            <Button label={can.canDeleteDirect ? "Delete" : "Send request"} variant="danger" loading={busy} onPress={runDelete} />
          </>
        }
      >
        {!can.canDeleteDirect ? <Field label="Reason" value={reason} onChangeText={setReason} placeholder="Why should it be removed?" multiline /> : null}
      </Sheet>
    </>
  );
};

const styles = StyleSheet.create({
  flex: { flex: 1, minWidth: 0 },
  gap: { gap: 8 },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  lead: { flexDirection: "row", alignItems: "center", gap: 8, paddingHorizontal: 12, paddingVertical: 10, borderRadius: 12 },
  round: { width: 38, height: 38, borderRadius: 12, alignItems: "center", justifyContent: "center" },
});
