import React, { useEffect, useRef, useState } from "react";
import { Linking, Pressable, ScrollView, StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import * as Location from "expo-location";
import { useNavigation } from "@react-navigation/native";
import { listVisitsBetween, type VisitLead } from "../../api/leads";
import { getFieldLocations, updateMyLiveLocation } from "../../api/users";
import { useUser } from "../../auth/AuthProvider";
import { formatAgo, formatTime } from "../../lib/format";
import { isManagement } from "../../lib/roles";
import { useQuery } from "../../lib/useQuery";
import { useTheme } from "../../theme/ThemeProvider";
import { useInTabs } from "../../lib/useInTabs";
import { Button, Grabber, Icon, Loading, Text } from "../../ui";

const DONE = new Set(["SITE_VISIT", "CLOSED", "INTERESTED", "REQUESTED", "QUALIFIED_LEAD"]);
const SEND_EVERY_MS = 60_000;

type Pin = { key: string; lat: number; lng: number; label: string; color: string };

/* Design 27 - today's route over a map, live tracking, and the visit list. Web: modules/field/FieldOps. */
export const FieldOpsScreen = () => {
  const navigation = useNavigation();
  const user = useUser();
  const { colors } = useTheme();
  const inTabs = useInTabs();
  const insets = useSafeAreaInsets();
  const manager = isManagement(user.role);
  const [tracking, setTracking] = useState(false);
  const [lastSent, setLastSent] = useState<Date | null>(null);
  const [trackError, setTrackError] = useState<string | null>(null);
  const [me, setMe] = useState<{ lat: number; lng: number } | null>(null);
  const watcher = useRef<Location.LocationSubscription | null>(null);
  const lastPush = useRef(0);

  const { data, loading, refresh } = useQuery(async () => {
    const start = new Date();
    start.setHours(0, 0, 0, 0);
    const end = new Date(start);
    end.setHours(23, 59, 59, 999);
    const [visits, team] = await Promise.all([listVisitsBetween(start, end).catch(() => []), manager ? getFieldLocations().catch(() => null) : Promise.resolve(null)]);
    return { visits: visits.filter((lead) => ["SITE_VISIT_SCHEDULED", "SITE_VISIT", "SITE_VISIT_OVERDUE"].includes(String(lead.status)) || lead.nextFollowUp), team };
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

  const visits = data?.visits || [];
  const doneCount = visits.filter((lead) => DONE.has(String(lead.status))).length;
  const next = visits.find((lead) => !DONE.has(String(lead.status)));
  const pins: Pin[] = [
    ...visits
      .filter((lead) => lead.siteLocation?.lat && lead.siteLocation?.lng)
      .map((lead, index) => ({
        key: lead._id,
        lat: lead.siteLocation!.lat!,
        lng: lead.siteLocation!.lng!,
        label: String(visits.indexOf(lead) + 1 || index + 1),
        color: DONE.has(String(lead.status)) ? colors.success : lead === next ? colors.primary : colors.textFaint,
      })),
    ...(data?.team?.users || [])
      .filter((person) => person.liveLocation?.lat && person.liveLocation?.lng)
      .map((person) => ({
        key: person._id,
        lat: person.liveLocation!.lat!,
        lng: person.liveLocation!.lng!,
        label: person.name
          .split(/\s+/)
          .map((part) => part[0])
          .join("")
          .slice(0, 2)
          .toUpperCase(),
        color: person.isLocationFresh ? colors.violet : colors.textFaint,
      })),
  ];

  return (
    <View style={[styles.root, { backgroundColor: "#e7ecf5" }]}>
      <SchematicMap pins={pins} me={me} />

      <View style={[styles.top, { paddingTop: insets.top + 4 }]}>
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

      <View style={[styles.sheet, { backgroundColor: colors.surface, paddingBottom: Math.max(insets.bottom, 12) + 14 }]}>
        <Grabber />
        <View style={styles.sheetHead}>
          <Text variant="title" style={styles.sheetTitle}>
            Today's visits
          </Text>
          <Text variant="small" color="muted">
            {doneCount} of {visits.length} done
          </Text>
        </View>
        {loading ? (
          <Loading />
        ) : (
          <ScrollView style={styles.list} contentContainerStyle={styles.listContent}>
            {visits.length ? (
              visits.map((lead, index) => <VisitRow key={lead._id} lead={lead} index={index} next={lead === next} onPress={() => navigation.navigate("LeadDetail", { leadId: lead._id, name: lead.name })} />)
            ) : (
              <Text variant="small" color="muted">
                No site visits scheduled for today.
              </Text>
            )}
            {manager && data?.team?.users.length ? (
              <View style={styles.team}>
                <Text variant="label" color="faint">
                  Team in the field
                </Text>
                {data.team.users.map((person) => (
                  <Pressable
                    key={person._id}
                    disabled={!person.liveLocation?.lat}
                    onPress={() => Linking.openURL(`https://www.google.com/maps/search/?api=1&query=${person.liveLocation?.lat},${person.liveLocation?.lng}`)}
                    style={styles.teamRow}
                  >
                    <View style={[styles.liveDot, { backgroundColor: person.isLocationFresh ? colors.success : colors.textFaint }]} />
                    <Text variant="smallStrong" style={styles.flex} numberOfLines={1}>
                      {person.name}
                    </Text>
                    <Text variant="tiny" color="muted" style={styles.regular}>
                      {person.liveLocation?.updatedAt ? `seen ${formatAgo(person.liveLocation.updatedAt)}` : "no location yet"}
                    </Text>
                  </Pressable>
                ))}
              </View>
            ) : null}
          </ScrollView>
        )}
        {next ? (
          <Button icon="location" label={`Mark arrived at ${next.projectInterested || next.name}`} onPress={() => navigation.navigate("UpdateLead", { leadId: next._id })} />
        ) : (
          <Button variant="secondary" icon="refresh" label="Refresh" onPress={refresh} />
        )}
      </View>
    </View>
  );
};

const VisitRow = ({ lead, index, next, onPress }: { lead: VisitLead; index: number; next: boolean; onPress: () => void }) => {
  const { colors } = useTheme();
  const done = DONE.has(String(lead.status));
  const tint = done ? colors.success : next ? colors.primary : colors.textFaint;
  return (
    <Pressable
      onPress={onPress}
      style={[styles.visit, { backgroundColor: next ? colors.primarySoft : colors.surface, borderColor: next ? colors.primary : colors.border }]}
    >
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
        <Pressable
          hitSlop={8}
          accessibilityLabel="Directions"
          onPress={() => Linking.openURL(`https://www.google.com/maps/dir/?api=1&destination=${lead.siteLocation!.lat},${lead.siteLocation!.lng}`)}
        >
          <Icon name="navigate" size={16} color={colors.primary} />
        </Pressable>
      ) : null}
    </Pressable>
  );
};

/* A drawn street grid with pins placed by their real coordinates, scaled to fit (no native map dependency). */
const SchematicMap = ({ pins, me }: { pins: Pin[]; me: { lat: number; lng: number } | null }) => {
  const { colors } = useTheme();
  const [size, setSize] = useState({ w: 0, h: 0 });
  const points = [...pins.map((pin) => ({ lat: pin.lat, lng: pin.lng })), ...(me ? [me] : [])];
  const lats = points.map((p) => p.lat);
  const lngs = points.map((p) => p.lng);
  const minLat = Math.min(...lats);
  const maxLat = Math.max(...lats);
  const minLng = Math.min(...lngs);
  const maxLng = Math.max(...lngs);
  const usableH = size.h * 0.45;
  const place = (lat: number, lng: number) => {
    const x = maxLng === minLng ? 0.5 : (lng - minLng) / (maxLng - minLng);
    const y = maxLat === minLat ? 0.5 : 1 - (lat - minLat) / (maxLat - minLat);
    return { left: 40 + x * (size.w - 80), top: 110 + y * Math.max(60, usableH - 60) };
  };
  return (
    <View style={StyleSheet.absoluteFill} onLayout={(event) => setSize({ w: event.nativeEvent.layout.width, h: event.nativeEvent.layout.height })}>
      {Array.from({ length: 24 }, (_, i) => (
        <View key={`h${i}`} style={[styles.gridH, { top: i * 44 }]} />
      ))}
      {Array.from({ length: 12 }, (_, i) => (
        <View key={`v${i}`} style={[styles.gridV, { left: i * 44 }]} />
      ))}
      <View style={styles.roadA} />
      <View style={styles.roadB} />
      {size.w
        ? pins.map((pin) => (
            <View key={pin.key} style={[styles.pinWrap, place(pin.lat, pin.lng)]}>
              <View style={[styles.pin, { backgroundColor: pin.color }]}>
                <Text variant="tiny" color="#fff" style={styles.pinText}>
                  {pin.label}
                </Text>
              </View>
            </View>
          ))
        : null}
      {size.w && me ? <View style={[styles.me, place(me.lat, me.lng), { backgroundColor: colors.primary }]} /> : null}
    </View>
  );
};

const styles = StyleSheet.create({
  root: { flex: 1 },
  flex: { flex: 1, minWidth: 0 },
  regular: { fontFamily: "PlusJakartaSans_500Medium" },
  gridH: { position: "absolute", left: 0, right: 0, height: 1, backgroundColor: "#d9e0ee" },
  gridV: { position: "absolute", top: 0, bottom: 0, width: 1, backgroundColor: "#d9e0ee" },
  roadA: { position: "absolute", left: -20, right: -20, top: 250, height: 16, backgroundColor: "#fff", transform: [{ rotate: "-14deg" }] },
  roadB: { position: "absolute", top: -20, bottom: -20, left: 200, width: 14, backgroundColor: "#fff", transform: [{ rotate: "8deg" }] },
  pinWrap: { position: "absolute", marginLeft: -15, marginTop: -30 },
  pin: { width: 30, height: 30, borderTopLeftRadius: 15, borderTopRightRadius: 15, borderBottomRightRadius: 15, borderBottomLeftRadius: 0, transform: [{ rotate: "-45deg" }], alignItems: "center", justifyContent: "center", elevation: 3, shadowColor: "#0e1630", shadowOpacity: 0.25, shadowRadius: 5, shadowOffset: { width: 0, height: 4 } },
  pinText: { transform: [{ rotate: "45deg" }], fontSize: 11, fontFamily: "PlusJakartaSans_800ExtraBold" },
  me: { position: "absolute", width: 18, height: 18, borderRadius: 9, marginLeft: -9, marginTop: -9, borderWidth: 3, borderColor: "#fff" },
  top: { flexDirection: "row", gap: 8, paddingHorizontal: 14 },
  topButton: { width: 40, height: 40, borderRadius: 13, alignItems: "center", justifyContent: "center", elevation: 2, shadowColor: "#0e1630", shadowOpacity: 0.1, shadowRadius: 6, shadowOffset: { width: 0, height: 4 } },
  trackPill: { flex: 1, height: 40, borderRadius: 13, flexDirection: "row", alignItems: "center", gap: 8, paddingHorizontal: 12, elevation: 2, shadowColor: "#0e1630", shadowOpacity: 0.1, shadowRadius: 6, shadowOffset: { width: 0, height: 4 } },
  liveDot: { width: 8, height: 8, borderRadius: 4 },
  sheet: { position: "absolute", left: 0, right: 0, bottom: 0, borderTopLeftRadius: 26, borderTopRightRadius: 26, paddingTop: 10, paddingHorizontal: 16, gap: 10, maxHeight: "58%", elevation: 8, shadowColor: "#0e1630", shadowOpacity: 0.1, shadowRadius: 15, shadowOffset: { width: 0, height: -8 } },
  sheetHead: { flexDirection: "row", alignItems: "baseline", justifyContent: "space-between" },
  sheetTitle: { fontSize: 17 },
  list: { flexGrow: 0 },
  listContent: { gap: 8 },
  visit: { flexDirection: "row", alignItems: "center", gap: 10, padding: 10, borderRadius: 14, borderWidth: 1 },
  num: { width: 28, height: 28, borderRadius: 9, alignItems: "center", justifyContent: "center" },
  visitTitle: { fontSize: 13 },
  visitSub: { fontSize: 11.5 },
  team: { gap: 6, paddingTop: 6 },
  teamRow: { flexDirection: "row", alignItems: "center", gap: 8, paddingVertical: 4 },
});
