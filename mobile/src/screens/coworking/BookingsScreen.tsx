import React, { useEffect, useMemo, useState } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { errorMessage } from "../../api/client";
import {
  bookingAction,
  getFloorView,
  listBookings,
  listFloors,
  refId,
  type Booking,
  type BookingAction,
  type BookingStatus,
  type CabinStatus,
  type FloorCabin,
} from "../../api/coworking";
import { isoDay } from "../../lib/attendanceState";
import { formatDate } from "../../lib/format";
import { formatRupees } from "../../lib/money";
import { useQuery } from "../../lib/useQuery";
import type { RootScreenProps } from "../../navigation/types";
import { useTheme } from "../../theme/ThemeProvider";
import { ActionSheet, Badge, Body, Button, EmptyState, ErrorState, GroupLabel, HeaderButton, Icon, InlineError, ListCard, Loading, MiniStat, Sheet, Text, type SheetAction } from "../../ui";
import { PickerSheet } from "../../ui/PickerSheet";

const STATUS_TONE: Record<BookingStatus, "primary" | "success" | "warning" | "danger" | "neutral"> = {
  PENDING: "warning",
  CONFIRMED: "primary",
  ACTIVE: "success",
  COMPLETED: "neutral",
  CANCELLED: "danger",
  NO_SHOW: "danger",
};
const STATUS_LABEL: Record<BookingStatus, string> = {
  PENDING: "Pending",
  CONFIRMED: "Confirmed",
  ACTIVE: "Checked in",
  COMPLETED: "Completed",
  CANCELLED: "Cancelled",
  NO_SHOW: "No-show",
};
const CABIN_LABEL: Record<CabinStatus, string> = { VACANT: "Free", BOOKED: "Booked", RESERVED: "On hold", BLOCKED: "Blocked", MAINTENANCE: "Maintenance" };
const HOURS = Array.from({ length: 10 }, (_, index) => 9 + index); // 9 AM – 7 PM

const minutes = (time?: string) => {
  const [h, m] = String(time || "").split(":").map(Number);
  return Number.isFinite(h) ? h! * 60 + (m || 0) : null;
};

/* Design 35: pick a floor, see occupancy and the cabin map, today's room timelines and the bookings to act on. */
export const BookingsScreen = ({ navigation }: RootScreenProps<"Bookings">) => {
  const { colors } = useTheme();
  const [floorId, setFloorId] = useState<string | null>(null);
  const [pickingFloor, setPickingFloor] = useState(false);
  const [cabin, setCabin] = useState<FloorCabin | null>(null);
  const [acting, setActing] = useState<Booking | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const today = isoDay(new Date());

  const floors = useQuery(() => listFloors(), []);
  useEffect(() => {
    if (!floorId && floors.data?.length) setFloorId(floors.data[0]!._id);
  }, [floors.data, floorId]);

  const view = useQuery(() => (floorId ? getFloorView(floorId) : Promise.resolve(null)), [floorId]);
  const bookings = useQuery(async () => {
    const weekAhead = new Date();
    weekAhead.setDate(weekAhead.getDate() + 14);
    return listBookings({ from: isoDay(new Date(Date.now() - 30 * 86400000)), to: isoDay(weekAhead) });
  }, []);

  React.useLayoutEffect(() => {
    navigation.setOptions({
      headerRight: () => <HeaderButton icon="add" label="New booking" onPress={() => navigation.navigate("NewBooking", { floorId: floorId || undefined })} />,
    });
  }, [navigation, floorId]);

  const floor = floors.data?.find((item) => item._id === floorId);
  const floorTitle = floor ? [typeof floor.propertyId === "object" ? floor.propertyId?.name : "", floor.name].filter(Boolean).join(" · ") : "Choose a floor";
  const cabinIds = new Set((view.data?.cabins || []).map((item) => item._id));

  const todays = useMemo(
    () =>
      (bookings.data || []).filter(
        (item) =>
          item.startTime &&
          ["PENDING", "CONFIRMED", "ACTIVE"].includes(item.status) &&
          item.startDate.slice(0, 10) <= today &&
          item.endDate.slice(0, 10) >= today &&
          (!view.data || cabinIds.has(refId(item.cabinId))),
      ),
    [bookings.data, today, view.data],
  );
  const rooms = useMemo(() => {
    const byCabin = new Map<string, { code: string; items: Booking[] }>();
    todays.forEach((item) => {
      const key = refId(item.cabinId);
      const entry = byCabin.get(key) || { code: typeof item.cabinId === "object" && item.cabinId ? item.cabinId.cabinCode : "Room", items: [] };
      entry.items.push(item);
      byCabin.set(key, entry);
    });
    return [...byCabin.values()];
  }, [todays]);

  const open = (bookings.data || [])
    .filter((item) => ["PENDING", "CONFIRMED", "ACTIVE"].includes(item.status))
    .sort((a, b) => a.startDate.localeCompare(b.startDate));

  const act = async (booking: Booking, action: BookingAction) => {
    setActionError(null);
    try {
      await bookingAction(booking._id, action, action === "cancel" ? "Cancelled from the mobile app" : undefined);
      bookings.reload();
      view.reload();
    } catch (err) {
      setActionError(errorMessage(err));
    }
  };

  const actionsFor = (booking: Booking): SheetAction[] => {
    const list: SheetAction[] = [];
    if (booking.status === "PENDING") list.push({ key: "confirm", icon: "checkmark-circle-outline", label: "Confirm", onPress: () => act(booking, "confirm") });
    if (booking.status === "CONFIRMED") list.push({ key: "activate", icon: "log-in-outline", label: "Check in", onPress: () => act(booking, "activate") });
    if (booking.status === "ACTIVE") list.push({ key: "complete", icon: "flag-outline", label: "Complete", onPress: () => act(booking, "complete") });
    if (booking.status !== "ACTIVE") list.push({ key: "noshow", icon: "eye-off-outline", label: "Mark no-show", onPress: () => act(booking, "no-show") });
    list.push({ key: "cancel", icon: "close-circle-outline", label: "Cancel booking", destructive: true, onPress: () => act(booking, "cancel") });
    return list;
  };

  if (floors.loading) return <Loading />;
  if (floors.error) return <ErrorState message={floors.error} onRetry={floors.refresh} />;
  if (!floors.data?.length) return <EmptyState icon="business-outline" title="No floors yet" message="Add a coworking property and its floors from the web app first." />;

  const counts = view.data?.counts;
  const total = counts?.total || 0;
  const occupancy = total ? Math.round((((counts?.BOOKED || 0) + (counts?.RESERVED || 0)) / total) * 100) : 0;

  const tileColor = (status: CabinStatus) =>
    status === "BOOKED"
      ? { bg: colors.primary, fg: colors.onPrimary }
      : status === "RESERVED"
        ? { bg: colors.warning, fg: colors.onPrimary }
        : status === "VACANT"
          ? { bg: colors.track, fg: colors.textMuted }
          : { bg: colors.dangerSoft, fg: colors.danger };

  return (
    <Body
      refreshing={view.refreshing || bookings.refreshing}
      onRefresh={() => {
        view.refresh();
        bookings.refresh();
      }}
    >
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Change floor"
        onPress={() => setPickingFloor(true)}
        style={[styles.floorPick, { backgroundColor: colors.surface, borderColor: colors.border }]}
      >
        <Icon name="business" size={18} color={colors.primary} />
        <Text variant="bodyStrong" style={styles.flex} numberOfLines={1}>
          {floorTitle}
        </Text>
        <Icon name="chevron-down" size={18} color={colors.textMuted} />
      </Pressable>

      <View style={styles.stats}>
        <MiniStat value={`${occupancy}%`} label="Occupancy" tone="primary" tinted />
        <MiniStat value={counts?.VACANT ?? "–"} label="Free desks" tone="success" tinted />
        <MiniStat value={counts?.RESERVED ?? "–"} label="On hold" tone="warning" tinted />
      </View>

      <View style={[styles.mapCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
        <View style={styles.mapHead}>
          <Text variant="bodyStrong">Desk map</Text>
          <View style={styles.legend}>
            {(["BOOKED", "VACANT", "RESERVED"] as CabinStatus[]).map((status) => (
              <View key={status} style={styles.legendItem}>
                <View style={[styles.legendDot, { backgroundColor: tileColor(status).bg }]} />
                <Text variant="tiny" color="muted">
                  {status === "BOOKED" ? "Booked" : status === "VACANT" ? "Free" : "Hold"}
                </Text>
              </View>
            ))}
          </View>
        </View>
        {view.loading ? (
          <Loading />
        ) : view.error ? (
          <InlineError message={view.error} />
        ) : view.data?.cabins.length ? (
          <View style={styles.grid}>
            {view.data.cabins.map((item) => {
              const tone = tileColor(item.status);
              return (
                <Pressable
                  key={item._id}
                  accessibilityRole="button"
                  accessibilityLabel={`${item.cabinCode}, ${CABIN_LABEL[item.status]}`}
                  onPress={() => setCabin(item)}
                  style={[styles.tile, { backgroundColor: tone.bg }]}
                >
                  <Text variant="tiny" color={tone.fg} style={styles.tileText} numberOfLines={1}>
                    {item.cabinCode}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        ) : (
          <Text variant="small" color="muted">
            No cabins on this floor yet.
          </Text>
        )}
      </View>

      <GroupLabel>Meeting rooms · today</GroupLabel>
      {rooms.length ? (
        rooms.map((room) => {
          const booked = new Set<number>();
          room.items.forEach((item) => {
            const start = minutes(item.startTime) ?? 9 * 60;
            const end = minutes(item.endTime) ?? start + 60;
            HOURS.forEach((hour) => {
              if (hour * 60 < end && (hour + 1) * 60 > start) booked.add(hour);
            });
          });
          const now = new Date().getHours();
          const freeNow = !booked.has(now);
          return (
            <View key={room.code} style={[styles.room, { backgroundColor: colors.surface, borderColor: colors.border }]}>
              <View style={styles.roomHead}>
                <Text variant="bodyStrong" style={styles.flex}>
                  {room.code}
                </Text>
                <Text variant="tiny" color="muted">
                  {freeNow ? "Free now" : `${room.items.length} booking${room.items.length === 1 ? "" : "s"}`}
                </Text>
              </View>
              <View style={styles.slots}>
                {HOURS.map((hour) => (
                  <View key={hour} style={[styles.slot, { backgroundColor: booked.has(hour) ? colors.primary : colors.track }]} />
                ))}
              </View>
            </View>
          );
        })
      ) : (
        <Text variant="small" color="muted">
          No hourly room bookings today.
        </Text>
      )}

      <GroupLabel>{`Open bookings · ${open.length}`}</GroupLabel>
      <InlineError message={actionError} />
      {bookings.loading ? (
        <Loading />
      ) : open.length ? (
        <ListCard>
          {open.map((item) => (
            <Pressable key={item._id} accessibilityRole="button" onPress={() => setActing(item)} style={styles.bookingRow}>
              <View style={styles.flex}>
                <Text variant="bodyStrong" numberOfLines={1} style={styles.bookingName}>
                  {item.clientId?.companyName || "Client"}
                </Text>
                <Text variant="small" color="muted" numberOfLines={1}>
                  {[item.cabinId?.cabinCode, item.seatCode, `${formatDate(item.startDate)}${item.endDate.slice(0, 10) !== item.startDate.slice(0, 10) ? ` – ${formatDate(item.endDate)}` : ""}`, item.startTime ? `${item.startTime}–${item.endTime || ""}` : ""]
                    .filter(Boolean)
                    .join(" · ")}
                </Text>
              </View>
              <Badge label={STATUS_LABEL[item.status]} tone={STATUS_TONE[item.status]} />
            </Pressable>
          ))}
        </ListCard>
      ) : (
        <Text variant="small" color="muted">
          Nothing pending, confirmed or checked in.
        </Text>
      )}

      <PickerSheet
        visible={pickingFloor}
        title="Floor"
        items={(floors.data || []).map((item) => ({ key: item._id, label: item.name, sub: typeof item.propertyId === "object" ? item.propertyId?.name : undefined }))}
        selected={floorId || undefined}
        onPick={(key) => {
          setFloorId(key);
          setPickingFloor(false);
        }}
        onClose={() => setPickingFloor(false)}
      />

      <Sheet
        visible={Boolean(cabin)}
        title={cabin ? `${cabin.cabinCode}${cabin.name && cabin.name !== cabin.cabinCode ? ` · ${cabin.name}` : ""}` : ""}
        subtitle={cabin ? `${CABIN_LABEL[cabin.status]} · ${cabin.capacity || 1} seat${cabin.capacity === 1 ? "" : "s"}${cabin.occupiedSeats ? ` · ${cabin.occupiedSeats} occupied` : ""}` : ""}
        onClose={() => setCabin(null)}
        footer={
          cabin && cabin.status === "VACANT" ? (
            <Button
              label="Book this cabin"
              icon="add"
              onPress={() => {
                const id = cabin._id;
                setCabin(null);
                navigation.navigate("NewBooking", { floorId: floorId || undefined, cabinId: id });
              }}
            />
          ) : undefined
        }
      >
        {cabin?.monthlyRent ? (
          <Text variant="small" color="muted">
            Rent {formatRupees(cabin.monthlyRent)} / month
          </Text>
        ) : null}
        {cabin?.blockReason ? (
          <Text variant="small" color="danger">
            {cabin.blockReason}
          </Text>
        ) : null}
        {(cabin?.currentClients || []).map((client, index) => (
          <View key={`${client._id || index}`} style={styles.clientLine}>
            <Icon name="person-circle-outline" size={18} color={colors.primary} />
            <Text variant="smallStrong" style={styles.flex}>
              {client.companyName || client.contactPerson}
            </Text>
            {client.endDate ? (
              <Text variant="tiny" color="muted">
                until {formatDate(client.endDate)}
              </Text>
            ) : null}
          </View>
        ))}
        {(cabin?.upcoming || []).map((item, index) => (
          <Text key={index} variant="small" color="muted">
            Next: {item.client?.companyName || "Client"}
            {item.startDate ? ` from ${formatDate(item.startDate)}` : ""}
          </Text>
        ))}
      </Sheet>

      <ActionSheet
        visible={Boolean(acting)}
        title={acting ? `${acting.clientId?.companyName || "Booking"} · ${acting.cabinId?.cabinCode || ""}` : ""}
        actions={acting ? actionsFor(acting) : []}
        onClose={() => setActing(null)}
      />
    </Body>
  );
};

const styles = StyleSheet.create({
  flex: { flex: 1, minWidth: 0 },
  floorPick: { flexDirection: "row", alignItems: "center", gap: 10, borderWidth: 1, borderRadius: 14, paddingHorizontal: 14, height: 48 },
  stats: { flexDirection: "row", gap: 8 },
  mapCard: { borderWidth: 1, borderRadius: 18, padding: 14, gap: 12 },
  mapHead: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  legend: { flexDirection: "row", gap: 10 },
  legendItem: { flexDirection: "row", alignItems: "center", gap: 4 },
  legendDot: { width: 8, height: 8, borderRadius: 2 },
  grid: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  tile: { width: "10.4%", aspectRatio: 1, borderRadius: 8, alignItems: "center", justifyContent: "center" },
  tileText: { fontSize: 9.5, fontFamily: "PlusJakartaSans_700Bold" },
  room: { borderWidth: 1, borderRadius: 16, padding: 12, gap: 10 },
  roomHead: { flexDirection: "row", alignItems: "center" },
  slots: { flexDirection: "row", gap: 3 },
  slot: { flex: 1, height: 14, borderRadius: 4 },
  bookingRow: { flexDirection: "row", alignItems: "center", gap: 10, paddingHorizontal: 14, paddingVertical: 11 },
  bookingName: { fontSize: 13.5 },
  clientLine: { flexDirection: "row", alignItems: "center", gap: 8 },
});
