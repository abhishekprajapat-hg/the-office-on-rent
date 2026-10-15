import React, { useEffect, useMemo, useRef, useState } from "react";
import { Linking, Pressable, ScrollView, StyleSheet, useWindowDimensions, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import * as Location from "expo-location";
import { useNavigation } from "@react-navigation/native";
import { listInventory } from "../../api/inventory";
import { listLeadsForFieldOps, listVisitsBetween, type VisitLead } from "../../api/leads";
import { getFieldLocations, listUsers, updateMyLiveLocation } from "../../api/users";
import { useUser } from "../../auth/AuthProvider";
import { FieldMap } from "../../components/map/FieldMap";
import type { MapPin } from "../../components/map/types";
import { buildFieldDashboard, directionsUrl, validPoint, type FieldLead } from "../../lib/fieldOps";
import { formatAgo, formatTime, formatWhen } from "../../lib/format";
import { statusMeta } from "../../lib/leadStatus";
import { propertyTitle } from "../../lib/property";
import { isManagement } from "../../lib/roles";
import { useQuery } from "../../lib/useQuery";
import { useTheme } from "../../theme/ThemeProvider";
import { useInTabs } from "../../lib/useInTabs";
import { Badge, Button, Grabber, Icon, Loading, MiniStat, Segmented, Text } from "../../ui";

const DONE = new Set(["SITE_VISIT", "CLOSED", "INTERESTED", "REQUESTED", "QUALIFIED_LEAD"]);
const SEND_EVERY_MS = 60_000;
const LIVE_REFRESH_MS = 30_000;
type Tab = "visits" | "team" | "queue" | "places";

/*
 * Design 27 - today's route over a map, live tracking and the visit list; for
 * managers also the web's workload, task queue, dispatch queue and quick
 * locate (modules/field/FieldOps).
 */
export const FieldOpsScreen = () => {
  const navigation = useNavigation();
  const user = useUser();
  const { colors } = useTheme();
  const inTabs = useInTabs();
  const insets = useSafeAreaInsets();
  const { height } = useWindowDimensions();
  const manager = isManagement(user.role);
  const [tab, setTab] = useState<Tab>("visits");
  const [tracking, setTracking] = useState(false);
  const [lastSent, setLastSent] = useState<Date | null>(null);
  const [trackError, setTrackError] = useState<string | null>(null);
  const [me, setMe] = useState<{ lat: number; lng: number } | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [focus, setFocus] = useState<{ lat: number; lng: number; key: string } | null>(null);
  const watcher = useRef<Location.LocationSubscription | null>(null);
  const lastPush = useRef(0);

  const { data, loading, refresh } = useQuery(async () => {
    const start = new Date();
    start.setHours(0, 0, 0, 0);
    const end = new Date(start);
    end.setHours(23, 59, 59, 999);
    const [visits, team, leads, users, places] = await Promise.all([
      listVisitsBetween(start, end).catch(() => []),
      manager ? getFieldLocations().catch(() => null) : Promise.resolve(null),
      manager ? listLeadsForFieldOps().catch(() => []) : Promise.resolve([]),
      manager ? listUsers().catch(() => []) : Promise.resolve([]),
      manager ? listInventory({ page: 1, limit: 100 }).then((res) => res.items).catch(() => []) : Promise.resolve([]),
    ]);
    return {
      visits: visits.filter((lead) => ["SITE_VISIT_SCHEDULED", "SITE_VISIT", "SITE_VISIT_OVERDUE"].includes(String(lead.status)) || lead.nextFollowUp),
      team,
      leads,
      users,
      places: places.filter((place) => validPoint(place.siteLocation?.lat, place.siteLocation?.lng)),
    };
  }, [manager]);

  // Teammates' positions refresh on their own every 30s (web LIVE_LOCATION_REFRESH_INTERVAL_MS).
  const [live, setLive] = useState(data?.team || null);
  useEffect(() => setLive(data?.team || null), [data?.team]);
  useEffect(() => {
    if (!manager) return undefined;
    const timer = setInterval(() => getFieldLocations().then(setLive, () => {}), LIVE_REFRESH_MS);
    return () => clearInterval(timer);
  }, [manager]);

  // Live tracking: while on, share a position at most once a minute (web: field executive live location).
  useEffect(() => {
    if (!tracking) {
      watcher.current?.remove();
      watcher.current = null;
      return;
    }
    let cancelled = false;
    (async () => {
      const permission = await Location.requestForegroundPermissionsAsync();
      if (permission.status !== "granted") {
        setTrackError("Allow location to share where you are.");
        setTracking(false);
        return;
      }
      watcher.current = await Location.watchPositionAsync({ accuracy: Location.Accuracy.Balanced, distanceInterval: 50, timeInterval: 30_000 }, (position) => {
        if (cancelled) return;
        const point = { lat: position.coords.latitude, lng: position.coords.longitude };
        setMe(point);
        if (Date.now() - lastPush.current < SEND_EVERY_MS) return;
        lastPush.current = Date.now();
        updateMyLiveLocation({ ...point, accuracy: position.coords.accuracy })
          .then(() => setLastSent(new Date()))
          .catch(() => setTrackError("Couldn't share your location — will retry."));
      });
    })();
    return () => {
      cancelled = true;
      watcher.current?.remove();
      watcher.current = null;
    };
  }, [tracking]);

  const merged = useMemo(() => {
    const byId = new Map((live?.users || []).map((row) => [row._id, row]));
    return (data?.users || []).map((person) => ({ ...person, liveLocation: byId.get(person._id)?.liveLocation || null, isLocationFresh: byId.get(person._id)?.isLocationFresh }));
  }, [data?.users, live]);
  const dashboard = useMemo(() => buildFieldDashboard((data?.leads || []) as FieldLead[], merged), [data?.leads, merged]);
  const chosen = dashboard.workload.find((row) => row.executive._id === selected) || null;

  const visits = data?.visits || [];
  const doneCount = visits.filter((lead) => DONE.has(String(lead.status))).length;
  const next = visits.find((lead) => !DONE.has(String(lead.status)));
  const sheetHeight = Math.round(height * 0.58);

  const visitPins: MapPin[] = visits
    .filter((lead) => validPoint(lead.siteLocation?.lat, lead.siteLocation?.lng))
    .map((lead) => ({
      key: `v${lead._id}`,
      lat: lead.siteLocation!.lat!,
      lng: lead.siteLocation!.lng!,
      label: String(visits.indexOf(lead) + 1),
      title: lead.projectInterested || lead.name,
      subtitle: [formatTime(lead.nextFollowUp), lead.city].filter(Boolean).join(" · "),
      color: DONE.has(String(lead.status)) ? colors.success : lead === next ? colors.primary : colors.textFaint,
    }));
  const teamPins: MapPin[] = (live?.users || [])
    .filter((person) => validPoint(person.liveLocation?.lat, person.liveLocation?.lng))
    .map((person) => ({
      key: `u${person._id}`,
      lat: person.liveLocation!.lat!,
      lng: person.liveLocation!.lng!,
      label: initials(person.name),
      title: person.name,
      subtitle: person.liveLocation?.updatedAt ? `seen ${formatAgo(person.liveLocation.updatedAt)}` : undefined,
      color: person._id === selected ? colors.primary : person.isLocationFresh ? colors.violet : colors.textFaint,
    }));
  const placePins: MapPin[] = (data?.places || []).map((place) => ({
    key: `p${place._id}`,
    lat: Number(place.siteLocation!.lat),
    lng: Number(place.siteLocation!.lng),
    label: "◆",
    title: propertyTitle(place),
    subtitle: place.location,
    color: colors.warning,
  }));
  const pins = tab === "places" ? placePins : tab === "queue" ? [] : [...(tab === "visits" ? visitPins : []), ...teamPins];

  const openPin = (pin: MapPin) => {
    const id = pin.key.slice(1);
    if (pin.key.startsWith("v")) navigation.navigate("LeadDetail", { leadId: id });
    else if (pin.key.startsWith("p")) navigation.navigate("PropertyDetail", { id });
    else {
      setSelected(id);
      setTab("team");
    }
  };

  /* Quick locate (web FieldOpsQuickLocateSection): pick a teammate, the map moves to them. */
  const locate = (id: string) => {
    setSelected(id);
    const row = dashboard.workload.find((item) => item.executive._id === id);
    if (row?.live) setFocus({ ...row.live, key: `${id}:${Date.now()}` });
  };
  const directionsTo = (to: { lat: number; lng: number }) => Linking.openURL(directionsUrl(to, chosen?.live || me)).catch(() => {});

  return (
    <View style={styles.root}>
      <FieldMap pins={pins} me={me} bottomInset={sheetHeight} focus={focus} onPinPress={openPin} />

      <View style={[styles.top, { paddingTop: insets.top + 4 }]} pointerEvents="box-none">
        {inTabs ? null : (
          <Pressable accessibilityRole="button" accessibilityLabel="Back" onPress={() => navigation.goBack()} style={[styles.topButton, { backgroundColor: colors.surface }]}>
            <Icon name="chevron-back" size={20} color={colors.primary} />
          </Pressable>
        )}
        <Pressable
          accessibilityRole="switch"
          accessibilityState={{ checked: tracking }}
          onPress={() => {
            setTrackError(null);
            setTracking(!tracking);
          }}
          style={[styles.trackPill, { backgroundColor: colors.surface }]}
        >
          <View style={[styles.liveDot, { backgroundColor: tracking ? colors.success : colors.textFaint }]} />
          <Text variant="smallStrong" style={styles.flex}>
            {tracking ? "Live tracking on" : "Live tracking off"}
          </Text>
          <Text variant="tiny" color="muted" style={styles.regular}>
            {trackError ? trackError : tracking ? (lastSent ? `shared ${formatAgo(lastSent)}` : "locating…") : "tap to share"}
          </Text>
        </Pressable>
      </View>

      <View style={[styles.sheet, { backgroundColor: colors.surface, paddingBottom: Math.max(insets.bottom, 12) + 14, maxHeight: sheetHeight }]}>
        <Grabber />
        {manager ? (
          <Segmented
            options={[
              { key: "visits", label: "Visits" },
              { key: "team", label: `Team · ${dashboard.fieldExecutives.length}` },
              { key: "queue", label: `Queue · ${dashboard.unassignedQueue.length}` },
              { key: "places", label: "Places" },
            ]}
            value={tab}
            onChange={setTab}
          />
        ) : null}
        {loading ? (
          <Loading />
        ) : (
          <ScrollView style={styles.list} contentContainerStyle={styles.listContent}>
            {tab === "visits" ? (
              <>
                <View style={styles.sheetHead}>
                  <Text variant="title" style={styles.sheetTitle}>
                    Today's visits
                  </Text>
                  <Text variant="small" color="muted">
                    {doneCount} of {visits.length} done
                  </Text>
                </View>
                {visits.length ? (
                  visits.map((lead, index) => <VisitRow key={lead._id} lead={lead} index={index} next={lead === next} onPress={() => navigation.navigate("LeadDetail", { leadId: lead._id, name: lead.name })} />)
                ) : (
                  <Text variant="small" color="muted">
                    No site visits scheduled for today.
                  </Text>
                )}
              </>
            ) : null}

            {tab === "team" ? (
              <>
                <View style={styles.stats}>
                  <MiniStat value={dashboard.fieldExecutives.length} label="Field execs" />
                  <MiniStat value={`${dashboard.coveragePercent}%`} label="Tracked" tone="violet" tinted />
                  <MiniStat value={dashboard.siteVisitLeads.length} label="Site visits" tone="primary" tinted />
                </View>
                <View style={styles.stats}>
                  <MiniStat value={dashboard.overdueFollowUps.length} label="Overdue" tone={dashboard.overdueFollowUps.length ? "danger" : undefined} tinted={Boolean(dashboard.overdueFollowUps.length)} />
                  <MiniStat value={dashboard.unassignedQueue.length} label="Unassigned" tone="warning" tinted />
                  <MiniStat value={dashboard.averageLoad} label="Avg load" />
                </View>
                {dashboard.workload.length ? (
                  dashboard.workload.map((row) => (
                    <Pressable
                      key={row.executive._id}
                      accessibilityRole="button"
                      onPress={() => locate(row.executive._id)}
                      style={[styles.row, { borderColor: row.executive._id === selected ? colors.primary : colors.border, backgroundColor: row.executive._id === selected ? colors.primarySoft : colors.surface }]}
                    >
                      <View style={[styles.liveDot, { backgroundColor: row.live ? (row.executive.isLocationFresh === false ? colors.warning : colors.success) : colors.textFaint }]} />
                      <View style={styles.flex}>
                        <Text variant="bodyStrong" numberOfLines={1}>
                          {row.executive.name}
                        </Text>
                        <Text variant="tiny" color="muted">
                          {row.activeAssigned} active · {row.siteVisits} visits · {row.todaysVisits} today{row.overdue ? ` · ${row.overdue} overdue` : ""}
                        </Text>
                      </View>
                      <Text variant="tiny" color="muted">
                        {row.executive.liveLocation?.updatedAt ? formatAgo(row.executive.liveLocation.updatedAt) : "no location"}
                      </Text>
                    </Pressable>
                  ))
                ) : (
                  <Text variant="small" color="muted">
                    No field executives in your team.
                  </Text>
                )}
                {chosen ? (
                  <View style={styles.queue}>
                    <View style={styles.sheetHead}>
                      <Text variant="label" color="faint">
                        {chosen.executive.name}'s queue
                      </Text>
                      {chosen.executive.phone ? (
                        <Pressable accessibilityRole="button" hitSlop={6} onPress={() => Linking.openURL(`tel:${chosen.executive.phone}`).catch(() => {})}>
                          <Text variant="smallStrong" color="primary">
                            Call
                          </Text>
                        </Pressable>
                      ) : null}
                    </View>
                    {chosen.rows.length ? (
                      chosen.rows.slice(0, 15).map((lead) => <LeadLine key={lead._id} lead={lead} onPress={() => navigation.navigate("LeadDetail", { leadId: lead._id, name: lead.name })} />)
                    ) : (
                      <Text variant="small" color="muted">
                        Nothing assigned right now.
                      </Text>
                    )}
                  </View>
                ) : null}
              </>
            ) : null}

            {tab === "queue" ? (
              <>
                <Text variant="small" color="muted">
                  Active leads with no owner yet. Open one to assign it.
                </Text>
                {dashboard.unassignedQueue.length ? (
                  dashboard.unassignedQueue.slice(0, 40).map((lead) => <LeadLine key={lead._id} lead={lead} onPress={() => navigation.navigate("LeadDetail", { leadId: lead._id, name: lead.name })} />)
                ) : (
                  <Text variant="small" color="muted">
                    The dispatch queue is empty.
                  </Text>
                )}
              </>
            ) : null}

            {tab === "places" ? (
              <>
                <Text variant="small" color="muted">
                  Properties pinned on the map. Directions start from {chosen?.live ? chosen.executive.name : me ? "you" : "where you are"}.
                </Text>
                {(data?.places || []).length ? (
                  (data?.places || []).map((place) => {
                    const point = { lat: Number(place.siteLocation!.lat), lng: Number(place.siteLocation!.lng) };
                    return (
                      <Pressable key={place._id} accessibilityRole="button" onPress={() => setFocus({ ...point, key: `${place._id}:${Date.now()}` })} style={[styles.row, { borderColor: colors.border }]}>
                        <Icon name="business-outline" size={18} color={colors.warning} />
                        <View style={styles.flex}>
                          <Text variant="bodyStrong" numberOfLines={1}>
                            {propertyTitle(place)}
                          </Text>
                          <Text variant="tiny" color="muted" numberOfLines={1}>
                            {[place.location, place.status].filter(Boolean).join(" · ")}
                          </Text>
                        </View>
                        <Pressable accessibilityRole="button" accessibilityLabel="Directions" hitSlop={8} onPress={() => directionsTo(point)}>
                          <Icon name="navigate" size={18} color={colors.primary} />
                        </Pressable>
                      </Pressable>
                    );
                  })
                ) : (
                  <Text variant="small" color="muted">
                    No properties have a map pin yet. Pin one from its edit form.
                  </Text>
                )}
              </>
            ) : null}
          </ScrollView>
        )}
        {tab === "visits" ? (
          next ? (
            <Button icon="location" label={`Mark arrived at ${next.projectInterested || next.name}`} onPress={() => navigation.navigate("UpdateLead", { leadId: next._id })} />
          ) : (
            <Button variant="secondary" icon="refresh" label="Refresh" onPress={refresh} />
          )
        ) : null}
      </View>
    </View>
  );
};

const initials = (name: string) =>
  name
    .split(/\s+/)
    .map((part) => part[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

const LeadLine = ({ lead, onPress }: { lead: FieldLead; onPress: () => void }) => {
  const { colors } = useTheme();
  const status = statusMeta(lead.status);
  const overdue = lead.nextFollowUp ? new Date(lead.nextFollowUp) < new Date() : false;
  return (
    <Pressable accessibilityRole="button" onPress={onPress} style={[styles.row, { borderColor: colors.border }]}>
      <View style={styles.flex}>
        <Text variant="smallStrong" numberOfLines={1}>
          {lead.name}
        </Text>
        <Text variant="tiny" color={overdue ? colors.danger : colors.textMuted} numberOfLines={1}>
          {[lead.projectInterested, lead.city, lead.nextFollowUp ? `${overdue ? "overdue " : ""}${formatWhen(lead.nextFollowUp)}` : null].filter(Boolean).join(" · ")}
        </Text>
      </View>
      <Badge label={status.label} tone={status.tone} />
    </Pressable>
  );
};

const VisitRow = ({ lead, index, next, onPress }: { lead: VisitLead; index: number; next: boolean; onPress: () => void }) => {
  const { colors } = useTheme();
  const done = DONE.has(String(lead.status));
  const tint = done ? colors.success : next ? colors.primary : colors.textFaint;
  return (
    <Pressable onPress={onPress} style={[styles.visit, { backgroundColor: next ? colors.primarySoft : colors.surface, borderColor: next ? colors.primary : colors.border }]}>
      <View style={[styles.num, { backgroundColor: tint }]}>
        <Text variant="smallStrong" color={colors.onPrimary}>
          {index + 1}
        </Text>
      </View>
      <View style={styles.flex}>
        <Text variant="bodyStrong" style={styles.visitTitle} numberOfLines={1}>
          {[lead.projectInterested, lead.name].filter(Boolean).join(" · ")}
        </Text>
        <Text variant="small" color="muted" style={styles.visitSub} numberOfLines={1}>
          {[formatTime(lead.nextFollowUp), lead.city, lead.siteLocation?.lat ? "pinned" : "no pin"].filter(Boolean).join(" · ")}
        </Text>
      </View>
      <Text variant="smallStrong" color={tint}>
        {done ? "Done" : next ? "Next" : "Later"}
      </Text>
      {lead.siteLocation?.lat ? (
        <Pressable hitSlop={8} accessibilityLabel="Directions" onPress={() => Linking.openURL(directionsUrl({ lat: lead.siteLocation!.lat!, lng: lead.siteLocation!.lng! }))}>
          <Icon name="navigate" size={16} color={colors.primary} />
        </Pressable>
      ) : null}
    </Pressable>
  );
};

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#e7ecf5" },
  flex: { flex: 1, minWidth: 0 },
  regular: { fontFamily: "PlusJakartaSans_500Medium" },
  top: { flexDirection: "row", gap: 8, paddingHorizontal: 14 },
  topButton: { width: 40, height: 40, borderRadius: 13, alignItems: "center", justifyContent: "center", elevation: 2, shadowColor: "#0e1630", shadowOpacity: 0.1, shadowRadius: 6, shadowOffset: { width: 0, height: 4 } },
  trackPill: { flex: 1, height: 40, borderRadius: 13, flexDirection: "row", alignItems: "center", gap: 8, paddingHorizontal: 12, elevation: 2, shadowColor: "#0e1630", shadowOpacity: 0.1, shadowRadius: 6, shadowOffset: { width: 0, height: 4 } },
  liveDot: { width: 8, height: 8, borderRadius: 4 },
  sheet: { position: "absolute", left: 0, right: 0, bottom: 0, borderTopLeftRadius: 26, borderTopRightRadius: 26, paddingTop: 10, paddingHorizontal: 16, gap: 10, elevation: 8, shadowColor: "#0e1630", shadowOpacity: 0.1, shadowRadius: 15, shadowOffset: { width: 0, height: -8 } },
  sheetHead: { flexDirection: "row", alignItems: "baseline", justifyContent: "space-between" },
  sheetTitle: { fontSize: 17 },
  list: { flexGrow: 0 },
  listContent: { gap: 8, paddingBottom: 4 },
  stats: { flexDirection: "row", gap: 6 },
  row: { flexDirection: "row", alignItems: "center", gap: 10, padding: 10, borderRadius: 14, borderWidth: 1 },
  queue: { gap: 6, paddingTop: 6 },
  visit: { flexDirection: "row", alignItems: "center", gap: 10, padding: 10, borderRadius: 14, borderWidth: 1 },
  num: { width: 28, height: 28, borderRadius: 9, alignItems: "center", justifyContent: "center" },
  visitTitle: { fontSize: 13 },
  visitSub: { fontSize: 11.5 },
});
