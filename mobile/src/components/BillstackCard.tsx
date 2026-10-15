import React, { useEffect, useRef, useState } from "react";
import { Linking, StyleSheet, View } from "react-native";
import { createBillingHandoff, getBillingStatus, retryBillingSync, type BillingEntity, type BillingState } from "../api/billing";
import { errorMessage } from "../api/client";
import { useAuth } from "../auth/AuthProvider";
import { Badge, Button, Card, Text } from "../ui";

const has = (permissions: string[] | undefined, role: string | undefined, permission: string) => role === "ADMIN" || Boolean(permissions?.includes(permission));

const STATUS_TONE: Record<string, "success" | "warning" | "danger" | "neutral"> = { SYNCED: "success", PENDING: "warning", SYNCING: "warning", FAILED: "danger" };

/* A failed sync is retried once automatically per customer per app session, as on web. */
const autoRetried = new Set<string>();

/*
 * BillStack billing for a lead or a coworking client (web: BillstackSection).
 * Shows the customer sync state, lets people with the grant retry it, and
 * opens BillStack to raise an invoice. Hidden without page.billing.view.
 */
export const BillstackCard = ({ entityType, entityId }: { entityType: BillingEntity; entityId: string }) => {
  const { user, access } = useAuth();
  const visible = has(access?.permissions, user?.role, "page.billing.view") && Boolean(entityId);
  const canSync = has(access?.permissions, user?.role, "page.billing.sync_customer");
  const canInvoice = has(access?.permissions, user?.role, "page.billing.create_invoice");
  const [state, setState] = useState<BillingState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<"sync" | "handoff" | null>(null);
  const alive = useRef(true);

  useEffect(() => {
    alive.current = true;
    if (!visible) return undefined;
    const refresh = async () => {
      try {
        const data = await getBillingStatus(entityType, entityId);
        if (!alive.current) return;
        setState(data);
        setError(null);
        const key = `${entityType}:${entityId}`;
        if (data?.syncStatus === "FAILED" && !autoRetried.has(key)) {
          autoRetried.add(key);
          const retried = await retryBillingSync(entityType, entityId).catch(() => null);
          if (alive.current && retried) setState(retried);
        }
      } catch (err) {
        if (alive.current) setError(errorMessage(err, "Billing is unavailable"));
      }
    };
    refresh();
    const timer = setInterval(refresh, 10000);
    return () => {
      alive.current = false;
      clearInterval(timer);
    };
  }, [visible, entityType, entityId]);

  if (!visible) return null;

  const perform = async (action: "sync" | "handoff") => {
    setBusy(action);
    setError(null);
    try {
      if (action === "handoff") {
        const url = await createBillingHandoff(entityType, entityId);
        if (!url) throw new Error("BillStack didn't return a link. Please retry.");
        await Linking.openURL(url);
      } else {
        setState(await retryBillingSync(entityType, entityId));
      }
    } catch (err) {
      setError(errorMessage(err, "BillStack request failed. Please retry."));
    } finally {
      if (alive.current) setBusy(null);
    }
  };

  const status = state?.syncStatus || "";
  const label = status ? status.replace(/_/g, " ").toLowerCase().replace(/^\w/, (c) => c.toUpperCase()) : error ? "Unavailable" : "Loading";

  return (
    <Card style={styles.card}>
      <View style={styles.head}>
        <Text variant="bodyStrong" style={styles.flex}>
          BillStack
        </Text>
        <Badge label={`Customer ${label.toLowerCase()}`} tone={STATUS_TONE[status] || "neutral"} />
      </View>
      {error || state?.lastSyncError ? (
        <Text variant="small" color="danger">
          {error || state?.lastSyncError}
        </Text>
      ) : null}
      {canSync || canInvoice ? (
        <View style={styles.actions}>
          {canSync ? <Button size="sm" variant="secondary" icon="sync-outline" label="Sync / retry" loading={busy === "sync"} disabled={Boolean(busy)} onPress={() => perform("sync")} style={styles.flex} /> : null}
          {canInvoice ? <Button size="sm" icon="receipt-outline" label="Create invoice" loading={busy === "handoff"} disabled={Boolean(busy)} onPress={() => perform("handoff")} style={styles.flex} /> : null}
        </View>
      ) : null}
      <Text variant="tiny" color="faint">
        Opens BillStack in your browser. Your BillStack login is required.
      </Text>
    </Card>
  );
};

const styles = StyleSheet.create({
  flex: { flex: 1, minWidth: 0 },
  card: { gap: 10 },
  head: { flexDirection: "row", alignItems: "center", gap: 8 },
  actions: { flexDirection: "row", gap: 8 },
});
