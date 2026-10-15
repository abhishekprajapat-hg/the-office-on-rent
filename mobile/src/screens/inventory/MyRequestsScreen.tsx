import React, { useState } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { canOpenPage } from "../../api/access";
import { cancelDeleteRequest, listMyDeleteRequests } from "../../api/approvals";
import { errorMessage } from "../../api/client";
import { listMyInventoryRequests, type InventoryRequest, type Property } from "../../api/inventory";
import { useAuth } from "../../auth/AuthProvider";
import { formatAgo } from "../../lib/format";
import { propertyTitle } from "../../lib/property";
import { useQuery } from "../../lib/useQuery";
import type { RootScreenProps } from "../../navigation/types";
import { useTheme } from "../../theme/ThemeProvider";
import type { Tone } from "../../theme/tokens";
import { Badge, Body, Button, EmptyState, ErrorState, GroupLabel, InlineError, ListCard, Loading, Text } from "../../ui";

const STATUS_TONE: Record<string, Tone> = { PENDING: "warning", APPROVED: "success", REJECTED: "danger", CANCELLED: "neutral" };
const TYPE_LABEL: Record<string, string> = { create: "New listing", update: "Change", delete: "Delete" };

const requestTitle = (request: InventoryRequest) => {
  const target = request.inventoryId && typeof request.inventoryId === "object" ? (request.inventoryId as Property) : null;
  if (target) return propertyTitle(target);
  const proposed = request.proposedData || {};
  return [proposed.projectName, proposed.towerName].filter(Boolean).join(" · ") || "Property";
};

/* Web: AssetVault "My requests" plus the requester's side of delete approvals (cancel while pending). */
export const MyRequestsScreen = ({ navigation }: RootScreenProps<"MyRequests">) => {
  const { colors } = useTheme();
  const { user, access } = useAuth();
  const withInventory = canOpenPage(user, access, "inventory");
  const [busy, setBusy] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const { data, loading, error, refreshing, refresh, reload } = useQuery(async () => {
    const [inventory, deletes] = await Promise.all([withInventory ? listMyInventoryRequests().catch(() => []) : [], listMyDeleteRequests().catch(() => [])]);
    return { inventory, deletes };
  }, [withInventory]);

  const cancel = async (id: string) => {
    setBusy(id);
    setActionError(null);
    try {
      setNotice(await cancelDeleteRequest(id));
      reload();
    } catch (err) {
      setActionError(errorMessage(err));
    } finally {
      setBusy(null);
    }
  };

  if (loading) return <Loading />;
  if (error || !data) return <ErrorState message={error || "Couldn't load your requests."} onRetry={refresh} />;

  return (
    <Body refreshing={refreshing} onRefresh={refresh}>
      {notice ? (
        <Text variant="smallStrong" color={colors.success}>
          {notice}
        </Text>
      ) : null}
      <InlineError message={actionError} />

      {withInventory ? (
        <>
          <GroupLabel>Inventory requests</GroupLabel>
          {data.inventory.length ? (
            <ListCard>
              {data.inventory.map((request) => {
                const status = String(request.status || "").toUpperCase();
                const targetId = request.inventoryId && typeof request.inventoryId === "object" ? (request.inventoryId as Property)._id : typeof request.inventoryId === "string" ? request.inventoryId : "";
                return (
                  <Pressable
                    key={request._id}
                    disabled={!targetId || request.type === "delete"}
                    onPress={() => targetId && navigation.navigate("PropertyDetail", { id: targetId })}
                    style={({ pressed }) => [styles.row, pressed && { backgroundColor: colors.surfaceAlt }]}
                  >
                    <View style={styles.flex}>
                      <Text variant="bodyStrong" numberOfLines={1} style={styles.title}>
                        {requestTitle(request)}
                      </Text>
                      <Text variant="small" color="muted" numberOfLines={2}>
                        {[TYPE_LABEL[request.type] || request.type, formatAgo(request.createdAt), request.rejectionReason ? `“${request.rejectionReason}”` : ""].filter(Boolean).join(" · ")}
                      </Text>
                    </View>
                    <Badge label={status.toLowerCase()} tone={STATUS_TONE[status] || "neutral"} />
                  </Pressable>
                );
              })}
            </ListCard>
          ) : (
            <Text variant="small" color="muted">
              You haven't sent any inventory requests.
            </Text>
          )}
        </>
      ) : null}

      <GroupLabel>Delete requests</GroupLabel>
      {data.deletes.length ? (
        <ListCard>
          {data.deletes.map((request) => {
            const status = String(request.status || "").toUpperCase();
            return (
              <View key={request._id} style={styles.row}>
                <View style={styles.flex}>
                  <Text variant="bodyStrong" numberOfLines={1} style={styles.title}>
                    {[request.entityLabel, request.entityName].filter(Boolean).join(" · ") || "Record"}
                  </Text>
                  <Text variant="small" color="muted" numberOfLines={2}>
                    {[formatAgo(request.createdAt), request.reason, request.reviewNote ? `${request.reviewedBy?.name || "Admin"}: “${request.reviewNote}”` : ""].filter(Boolean).join(" · ")}
                  </Text>
                </View>
                {status === "PENDING" ? (
                  <Button size="sm" variant="secondary" label="Cancel" loading={busy === request._id} onPress={() => cancel(request._id)} />
                ) : (
                  <Badge label={status.toLowerCase()} tone={STATUS_TONE[status] || "neutral"} />
                )}
              </View>
            );
          })}
        </ListCard>
      ) : (
        <EmptyState icon="trash-outline" title="No delete requests" message="Deletes you ask an admin to approve show here." />
      )}
    </Body>
  );
};

const styles = StyleSheet.create({
  flex: { flex: 1, minWidth: 0 },
  row: { flexDirection: "row", alignItems: "center", gap: 12, padding: 12 },
  title: { fontSize: 13.5 },
});
