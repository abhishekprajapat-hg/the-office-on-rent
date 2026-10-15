import React, { useEffect, useLayoutEffect, useMemo, useState } from "react";
import { Pressable, ScrollView, Share, StyleSheet, useWindowDimensions, View } from "react-native";
import { useNavigation, useRoute, type RouteProp } from "@react-navigation/native";
import { canDoPageAction, canOpenPage } from "../../api/access";
import { fetchClientBirthdays } from "../../api/coworkingBoard";
import { useAuth } from "../../auth/AuthProvider";
import { CabinTile, StatusDot } from "../../components/coworking/CabinTile";
import { SEAT_BANDS, STATUS_META, STATUS_ORDER, WINGS, boardCsv, summarize, upcomingBirthdays, type Cabin, type CabinStatus } from "../../lib/coworkingBoard";
import { PASSAGE_BAND, PLAN_CABINS, PLAN_RATIO, SHARED_ROOMS } from "../../lib/coworkingPlan";
import { rupees } from "../../lib/format";
import { useBoard } from "../../lib/useBoard";
import { useQuery } from "../../lib/useQuery";
import type { RootStackParamList } from "../../navigation/types";
import { useTheme } from "../../theme/ThemeProvider";
import { ActionSheet, Body, Button, Card, ErrorState, Field, FilterBar, HeaderButton, Icon, InlineError, Loading, ProgressBar, Segmented, Text } from "../../ui";

/*
 * Web: modules/coworking/booking/BookingBoard. The 65 cabins of the floor by
 * wing or on the plan; tap a cabin to open it, or switch on "Select cabins" to
 * pick vacant ones and onboard a client into all of them at once. Filters dim
 * rather than remove, as on web, so the floor never shows gaps.
 */
export const BookingBoardScreen = () => {
  const navigation = useNavigation();
  const route = useRoute<RouteProp<RootStackParamList, "Bookings">>();
  const { colors } = useTheme();
  const { width } = useWindowDimensions();
  const { user, access } = useAuth();
  const canEdit = canDoPageAction(user, access, "coworking_booking", "edit") || canDoPageAction(user, access, "coworking_booking", "create");
  const clientsAllowed = canOpenPage(user, access, "coworking_clients");
  const { board, loading, error, refresh, refreshing, busy, actionError, undo, undoable, setActionError } = useBoard();
  const { data: remoteBirthdays } = useQuery(() => (clientsAllowed ? fetchClientBirthdays().catch(() => []) : Promise.resolve([])), [clientsAllowed]);
  const [view, setView] = useState<"wings" | "layout">("wings");
  const [statusFilter, setStatusFilter] = useState<CabinStatus | "all">("all");
  const [wing, setWing] = useState("");
  const [band, setBand] = useState("");
  const [search, setSearch] = useState("");
  const [selectMode, setSelectMode] = useState(Boolean(route.params?.select));
  const [cart, setCart] = useState<string[]>([]);
  const [tools, setTools] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [collapsed, setCollapsed] = useState<string[]>([]);

  useEffect(() => {
    if (route.params?.select) setSelectMode(true);
  }, [route.params?.select]);

  useLayoutEffect(() => {
    navigation.setOptions({
      headerRight: () => <HeaderButton icon="ellipsis-horizontal" label="Board tools" variant="secondary" onPress={() => setTools(true)} />,
    });
  }, [navigation]);

  const cabins = board?.cabins || [];
  const passesNonStatus = (cabin: Cabin) => {
    if (wing && cabin.wing !== wing) return false;
    if (band && !SEAT_BANDS.find((item) => item.id === band)?.test(cabin)) return false;
    const query = search.trim().toLowerCase();
    if (!query) return true;
    return `${cabin.label} ${cabin.code} ${cabin.client?.name || ""} ${cabin.client?.contactPerson || ""}`.toLowerCase().includes(query);
  };
  const matches = (cabin: Cabin) => passesNonStatus(cabin) && (statusFilter === "all" || cabin.status === statusFilter);
  const scoped = cabins.filter(passesNonStatus);
  const summary = useMemo(() => summarize(scoped), [scoped]);
  const birthdays = useMemo(() => {
    const onBoard = [...new Map(cabins.filter((cabin) => cabin.client).map((cabin) => [cabin.client!.id, cabin.client!])).values()];
    const remote = (remoteBirthdays || []).map((client) => ({ ...client, id: client._id, name: client.companyName || "" }));
    const unique = [...new Map([...remote, ...onBoard].map((client) => [String(client.id || client.name), client])).values()];
    return upcomingBirthdays(unique as { id: string; name?: string; contactPerson?: string; dateOfBirth?: string }[]);
  }, [cabins, remoteBirthdays]);

  if (loading) return <Loading />;
  if (error || !board) return <ErrorState message={error || "Couldn't load the booking board."} onRetry={refresh} />;

  const cartCabins = cart.map((code) => cabins.find((cabin) => cabin.code === code)).filter(Boolean) as Cabin[];
  const vacantCount = cabins.filter((cabin) => cabin.status === "VACANT").length;

  const onCabin = (cabin: Cabin) => {
    if (selectMode && cabin.status === "VACANT") {
      setCart((current) => (current.includes(cabin.code) ? current.filter((code) => code !== cabin.code) : [...current, cabin.code]));
      return;
    }
    if (selectMode) setNotice(`${cabin.label} is ${STATUS_META[cabin.status].label.toLowerCase()} and can't be allotted. Opened its details instead.`);
    navigation.navigate("Cabin", { code: cabin.code });
  };

  const toggleSelect = () => {
    if (selectMode) setCart([]);
    setSelectMode(!selectMode);
  };

  const exportCsv = () => Share.share({ title: "Coworking booking board", message: boardCsv(cabins) }).catch(() => {});

  const planWidth = Math.max(760, width * 1.8);
  const planHeight = planWidth / PLAN_RATIO;

  return (
    <View style={styles.flex}>
      <Body refreshing={refreshing} onRefresh={refresh} footerSpace={cartCabins.length > 0}>
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

        <Card style={styles.occupancy}>
          <View style={styles.rowBetween}>
            <Text variant="bodyStrong">Occupancy</Text>
            <Text variant="display" style={styles.percent}>
              {summary.percent}%
            </Text>
          </View>
          <Text variant="small" color="muted">
            {summary.letCabins} of {scoped.length} cabins let · {rupees(summary.monthlyRevenue)} a month · {summary.counts.VACANT} vacant seating {summary.vacantCapacity}
          </Text>
          <ProgressBar value={summary.percent / 100} />
        </Card>

        {canEdit ? (
          <Button
            icon="person-add"
            label={selectMode ? "Tap vacant cabins to allot" : "Onboard client"}
            variant={selectMode ? "soft" : "primary"}
            disabled={!vacantCount}
            onPress={() => {
              setSelectMode(true);
              setNotice("Pick the vacant cabins to allot, then continue from the bar at the bottom.");
            }}
          />
        ) : null}
        {notice ? (
          <Text variant="small" color="primary">
            {notice}
          </Text>
        ) : null}
        <InlineError message={actionError} />

        <Field compact icon="search-outline" value={search} onChangeText={setSearch} placeholder="Search cabins, clients…" />
        <Segmented
          options={[
            { key: "wings", label: "Wings" },
            { key: "layout", label: "Floor plan" },
          ]}
          value={view}
          onChange={setView}
        />

        <FilterBar
          filters={[
            {
              label: "Status",
              icon: "funnel-outline",
              options: [{ key: "all", label: "All cabins", count: summary.counts.all }, ...STATUS_ORDER.map((status) => ({ key: status, label: STATUS_META[status].label, count: summary.counts[status] }))],
              value: statusFilter,
              onChange: setStatusFilter,
            },
            { label: "Wing", options: [{ key: "", label: "All wings" }, ...WINGS.map((item) => ({ key: item.id, label: `Wing ${item.id}` }))], value: wing, onChange: setWing },
            { label: "Seats", options: [{ key: "", label: "Any size" }, ...SEAT_BANDS.map((item) => ({ key: item.id, label: item.label }))], value: band, onChange: setBand },
          ]}
        />
        {canEdit ? (
          <Button
            size="sm"
            variant={selectMode ? "primary" : "secondary"}
            icon={selectMode ? "checkbox" : "checkbox-outline"}
            label={selectMode ? "Selecting cabins · tap to stop" : "Select cabins"}
            onPress={toggleSelect}
          />
        ) : null}

        {view === "wings" ? (
          WINGS.map((item) => {
            const wingCabins = cabins.filter((cabin) => cabin.wing === item.id).sort((a, b) => Number(a.code.slice(1)) - Number(b.code.slice(1)));
            const vacant = wingCabins.filter((cabin) => cabin.status === "VACANT");
            const open = !collapsed.includes(item.id);
            return (
              <Card key={item.id} style={styles.wing}>
                <Pressable
                  accessibilityRole="button"
                  accessibilityState={{ expanded: open }}
                  onPress={() => setCollapsed((prev) => (open ? [...prev, item.id] : prev.filter((id) => id !== item.id)))}
                  style={styles.wingHead}
                >
                  <View style={styles.flex}>
                    <Text variant="bodyStrong">
                      {item.label} <Text variant="small" color="faint">{item.hint}</Text>
                    </Text>
                    <Text variant="tiny" color="muted">
                      <Text variant="tiny" color={vacant.length ? STATUS_META.VACANT.color : colors.textFaint}>
                        {vacant.length} vacant
                      </Text>
                      {` · ${wingCabins.length} cabins · ${vacant.reduce((sum, cabin) => sum + cabin.seats, 0)} of ${wingCabins.reduce((sum, cabin) => sum + cabin.seats, 0)} seats free`}
                    </Text>
                  </View>
                  <Icon name={open ? "chevron-up" : "chevron-down"} size={16} color={colors.textFaint} />
                </Pressable>
                {open ? (
                  <View style={styles.grid}>
                    {wingCabins.map((cabin) => (
                      <View key={cabin.code} style={styles.cell}>
                        <CabinTile cabin={cabin} onPress={onCabin} inCart={cart.includes(cabin.code)} dimmed={!matches(cabin)} />
                      </View>
                    ))}
                  </View>
                ) : null}
              </Card>
            );
          })
        ) : (
          <Card style={styles.planCard}>
            <View style={styles.legend}>
              {STATUS_ORDER.map((status) => (
                <View key={status} style={styles.legendItem}>
                  <StatusDot status={status} />
                  <Text variant="tiny" color="muted">
                    {STATUS_META[status].label}
                  </Text>
                </View>
              ))}
            </View>
            <ScrollView horizontal showsHorizontalScrollIndicator>
              <View style={{ width: planWidth, height: planHeight, backgroundColor: colors.surfaceAlt, borderRadius: 12 }}>
                <View
                  style={[
                    styles.room,
                    { left: `${PASSAGE_BAND.left}%`, top: `${PASSAGE_BAND.top}%`, width: `${PASSAGE_BAND.width}%`, height: `${PASSAGE_BAND.height}%`, borderColor: "transparent" },
                  ]}
                >
                  <Text variant="tiny" color="faint" style={styles.roomLabel}>
                    PASSAGE
                  </Text>
                </View>
                {SHARED_ROOMS.map((room) => (
                  <View
                    key={room.id}
                    style={[styles.room, { left: `${room.left}%`, top: `${room.top}%`, width: `${room.width}%`, height: `${room.height}%`, borderColor: colors.border }]}
                  >
                    <Text variant="tiny" color="faint" style={styles.roomLabel} numberOfLines={2}>
                      {room.label.toUpperCase()}
                    </Text>
                  </View>
                ))}
                {cabins.map((cabin) => {
                  const box = PLAN_CABINS[cabin.code];
                  if (!box) return null;
                  return (
                    <CabinTile
                      key={cabin.code}
                      variant="plan"
                      cabin={cabin}
                      onPress={onCabin}
                      inCart={cart.includes(cabin.code)}
                      dimmed={!matches(cabin)}
                      style={{ left: `${box[0]}%`, top: `${box[1]}%`, width: `${box[2]}%`, height: `${box[3]}%` }}
                    />
                  );
                })}
              </View>
            </ScrollView>
            <Text variant="tiny" color="faint">
              Scroll sideways to see the whole floor. Tap a cabin to open it.
            </Text>
          </Card>
        )}

        {summary.freeingSoon.length || summary.overdue.length ? (
          <Card style={styles.freeing}>
            <Text variant="bodyStrong">Freeing up in 45 days</Text>
            {summary.freeingSoon.length ? (
              summary.freeingSoon.slice(0, 6).map((cabin) => (
                <Pressable key={cabin.code} accessibilityRole="button" onPress={() => navigation.navigate("Cabin", { code: cabin.code })} style={styles.freeRow}>
                  <Text variant="smallStrong">{cabin.label}</Text>
                  <Text variant="small" color="muted" numberOfLines={1} style={styles.flex}>
                    {cabin.client?.name}
                  </Text>
                  <Text variant="smallStrong" color={colors.warning}>
                    {cabin.contract?.endsInDays}d
                  </Text>
                </Pressable>
              ))
            ) : (
              <Text variant="small" color="muted">
                Nothing ends in the next 45 days.
              </Text>
            )}
            {summary.freeingSoon.length > 6 ? (
              <Text variant="tiny" color="faint">
                +{summary.freeingSoon.length - 6} more ending within 45 days
              </Text>
            ) : null}
            {summary.overdue.length ? (
              <Text variant="smallStrong" color="danger">
                {rupees(summary.overdueAmount)} overdue across {summary.overdue.length} {summary.overdue.length === 1 ? "cabin" : "cabins"}.
              </Text>
            ) : null}
          </Card>
        ) : null}
      </Body>

      {cartCabins.length ? (
        <View style={[styles.cart, { backgroundColor: colors.surface, borderTopColor: colors.border }]}>
          <View style={styles.flex}>
            <Text variant="bodyStrong">
              {cartCabins.length} {cartCabins.length === 1 ? "cabin" : "cabins"} · {cartCabins.reduce((sum, cabin) => sum + cabin.seats, 0)} seats
            </Text>
            <Text variant="tiny" color="muted" numberOfLines={1}>
              {cartCabins.map((cabin) => cabin.label).join(", ")} · {rupees(cartCabins.reduce((sum, cabin) => sum + cabin.monthlyRent, 0))}/mo list
            </Text>
          </View>
          <Button size="sm" variant="ghost" label="Clear" onPress={() => setCart([])} />
          <Button
            size="sm"
            icon="person-add"
            label="Onboard"
            onPress={() => {
              const codes = cart;
              setCart([]);
              setSelectMode(false);
              navigation.navigate("Onboard", { codes });
            }}
          />
        </View>
      ) : null}

      <ActionSheet
        visible={tools}
        title="Booking board"
        onClose={() => setTools(false)}
        actions={[
          ...(clientsAllowed ? [{ key: "clients", label: "Clients", icon: "people-outline" as const, onPress: () => navigation.navigate("Clients") }] : []),
          { key: "activity", label: "Activity", icon: "time-outline", hint: `${board.activity.length} recorded`, onPress: () => navigation.navigate("BoardActivity") },
          { key: "export", label: "Export CSV", icon: "download-outline", hint: "Share the floor as a spreadsheet", onPress: exportCsv },
          ...(undoable && canEdit
            ? [
                {
                  key: "undo",
                  label: busy ? "Undoing…" : "Undo",
                  icon: "arrow-undo-outline" as const,
                  hint: `Undo: ${undoable.title}`,
                  onPress: async () => {
                    setActionError(null);
                    if (await undo()) setNotice(`Undone: ${undoable.title}`);
                  },
                },
              ]
            : []),
        ]}
      />
    </View>
  );
};


const styles = StyleSheet.create({
  flex: { flex: 1, minWidth: 0 },
  rowBetween: { flexDirection: "row", alignItems: "baseline", justifyContent: "space-between" },
  birthdays: { gap: 4 },
  occupancy: { gap: 6 },
  percent: { fontSize: 26, lineHeight: 30 },
  wing: { gap: 10, padding: 12 },
  wingHead: { flexDirection: "row", alignItems: "center", gap: 8 },
  grid: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  cell: { width: "31.8%" },
  planCard: { gap: 10, padding: 12 },
  legend: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  legendItem: { flexDirection: "row", alignItems: "center", gap: 4 },
  room: { position: "absolute", borderWidth: 1, borderStyle: "dashed", borderRadius: 4, alignItems: "center", justifyContent: "center", padding: 2 },
  roomLabel: { fontSize: 8, textAlign: "center", letterSpacing: 0.5 },
  freeing: { gap: 6 },
  freeRow: { flexDirection: "row", alignItems: "center", gap: 8, paddingVertical: 4 },
  cart: { position: "absolute", left: 0, right: 0, bottom: 0, flexDirection: "row", alignItems: "center", gap: 8, paddingHorizontal: 14, paddingVertical: 12, borderTopWidth: 1 },
});
