import React, { useEffect, useMemo, useState } from "react";
import { Pressable, ScrollView, StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTheme } from "../../theme/ThemeProvider";
import { formatWhen } from "../../lib/format";
import { errorMessage } from "../../api/client";
import { addLeadNote, getLeadDetail, updateLeadDetails, type LeadDetail } from "../../api/leads";
import { updateMyLiveLocation } from "../../api/users";
import { syncFollowUpReminders } from "../../notifications/followUpReminders";
import { getProperty } from "../../api/inventory";
import { propertyTitle } from "../../lib/property";
import { useFocusEffect } from "@react-navigation/native";
import { useUser } from "../../auth/AuthProvider";
import { Chip } from "../../ui/Chip";
import { DateTimeField } from "../../components/DateTimeField";
import { followUpQuickPicks, toFollowUpPayload } from "../../lib/followUp";
import { LEAD_STATUS, normalizeStatus, suggestsFollowUp } from "../../lib/leadStatus";
import { currentPosition } from "../../lib/location";
import { isManagement } from "../../lib/roles";
import type { RootScreenProps } from "../../navigation/types";
import { Button, ErrorState, Field, Grabber, InlineError, Loading, Text } from "../../ui";
import { DealClosureSection, dealPayload, type DealDraft } from "./DealClosureSection";

/* The status picker, grouped the way the web colours them, so twenty options read as six choices. */
const GROUPS: { title: string; statuses: string[] }[] = [
  { title: "Open", statuses: ["NEW", "CONTACTED"] },
  { title: "Following up", statuses: ["FOLLOW_UP_1", "FOLLOW_UP_2", "FOLLOW_UP_3"] },
  { title: "Warm", statuses: ["QUALIFIED_LEAD", "INTERESTED", "REQUESTED"] },
  { title: "Visit", statuses: ["SITE_VISIT_SCHEDULED", "SITE_VISIT"] },
  { title: "Not responding", statuses: ["NPC_1", "NPC_2", "NPC_3", "MISSING_IN_ACTION", "SITE_VISIT_OVERDUE"] },
  { title: "Outcome", statuses: ["CLOSED", "LOST", "INVALID", "OWNER", "BROKER"] },
];

const DEAL_STATUSES = ["CLOSED", "REQUESTED"];

export const UpdateLeadScreen = ({ route, navigation }: RootScreenProps<"UpdateLead">) => {
  const { leadId } = route.params;
  const user = useUser();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const isAdmin = user.role === "ADMIN";
  // Admins and managers close deals themselves; anyone else's closing waits for approval.
  const closesDirectly = isManagement(user.role);
  const [lead, setLead] = useState<LeadDetail | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [status, setStatus] = useState("NEW");
  const [followUp, setFollowUp] = useState<Date | null>(null);
  const [originalFollowUp, setOriginalFollowUp] = useState<number | null>(null);
  const [note, setNote] = useState("");
  const [deal, setDeal] = useState<DealDraft>({ mode: "", paymentType: "", remaining: "", reference: "", note: "", documents: [], brokerageReceived: "", brokerageAgreed: "", brokerageDistributed: "", brokerageSource: "" });
  const [site, setSite] = useState<{ lat: number; lng: number } | null>(null);
  const [locating, setLocating] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const picks = useMemo(() => followUpQuickPicks(), []);
  const [selectedProperty, setSelectedProperty] = useState<string | null>(null);

  // Re-read the selected property whenever we come back from picking one.
  useFocusEffect(
    React.useCallback(() => {
      getLeadDetail(leadId)
        .then(async (value) => {
          const id = typeof value?.inventoryId === "string" ? value.inventoryId : value?.inventoryId?._id;
          if (!id) return setSelectedProperty(null);
          const property = await getProperty(id).catch(() => null);
          setSelectedProperty(property ? propertyTitle(property) : "Selected property");
        })
        .catch(() => {});
    }, [leadId]),
  );

  useEffect(() => {
    getLeadDetail(leadId)
      .then((value) => {
        if (!value) throw new Error("This lead no longer exists.");
        setLead(value);
        setStatus(normalizeStatus(value.status));
        const existing = value.nextFollowUp ? new Date(value.nextFollowUp) : null;
        setFollowUp(existing);
        setOriginalFollowUp(existing ? existing.getTime() : null);
        const payment = value.dealPayment || {};
        setDeal({
          mode: payment.mode || "",
          paymentType: payment.paymentType || "",
          remaining: payment.remainingAmount ? String(payment.remainingAmount) : "",
          reference: payment.paymentReference || "",
          note: payment.note || "",
          documents: value.closureDocuments || [],
          brokerageReceived: value.brokerageReceived != null ? String(value.brokerageReceived) : "",
          brokerageAgreed: value.brokerageAgreed != null ? String(value.brokerageAgreed) : "",
          brokerageDistributed: value.brokerageDistributed ? String(value.brokerageDistributed) : "",
          brokerageSource: value.brokerageSource || "",
        });
      })
      .catch((err) => setLoadError(errorMessage(err)));
  }, [leadId]);

  if (loadError) return <ErrorState message={loadError} onRetry={() => navigation.goBack()} />;
  if (!lead) return <Loading />;

  const originalStatus = normalizeStatus(lead.status);
  const isDeal = DEAL_STATUSES.includes(status);
  // A part-paid deal needs a date to collect the rest; the server insists on it.
  const collectingBalance = isDeal && deal.paymentType === "PARTIAL";
  const wantsFollowUp = suggestsFollowUp(status) || collectingBalance;
  const hasSite = Boolean(lead.siteLocation?.lat && lead.siteLocation?.lng) || Boolean(site);

  const useMyLocationAsSite = async () => {
    setLocating(true);
    setError(null);
    try {
      const point = await currentPosition();
      setSite({ lat: point.latitude, lng: point.longitude });
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setLocating(false);
    }
  };

  const save = async () => {
    setError(null);
    const payload: Record<string, unknown> = {
      status,
      // A closed or lost lead has nothing left to call back about.
      nextFollowUp: wantsFollowUp ? toFollowUpPayload(followUp) : null,
    };
    if (isDeal && !selectedProperty) return setError("Choose the property this deal closes on first.");
    if (collectingBalance && !followUp) return setError("Pick when the remaining payment will be collected.");
    if (isDeal) {
      const built = dealPayload(deal);
      if ("error" in built) return setError(built.error || null);
      Object.assign(payload, built);
    }
    if (site) payload.siteLocation = { lat: site.lat, lng: site.lng };
    setSaving(true);
    try {
      // A field executive marks a visit from the site: the server checks a fresh live position.
      if (status === "SITE_VISIT" && originalStatus !== "SITE_VISIT" && user.role === "FIELD_EXECUTIVE") {
        const point = await currentPosition();
        await updateMyLiveLocation({ lat: point.latitude, lng: point.longitude, accuracy: point.accuracy });
      }
      const { status: nextStatus, ...rest } = payload;
      await updateLeadDetails(leadId, String(nextStatus), rest);
      syncFollowUpReminders().catch(() => {});
      if (note.trim()) {
        // The status is saved either way; a failed note is reported, not fatal.
        await addLeadNote(leadId, note).catch(() => {
          throw new Error("Status saved, but the note couldn't be added. Please try adding it again.");
        });
      }
      navigation.goBack();
    } catch (err) {
      setError(errorMessage(err));
      setSaving(false);
    }
  };

  const unchanged =
    status === originalStatus && !note.trim() && (followUp?.getTime() ?? null) === originalFollowUp && !site && !isDeal;

  const pickTiles = picks.slice(0, 3);
  const pickedQuick = pickTiles.some((pick) => followUp && Math.abs(followUp.getTime() - pick.date.getTime()) < 60000);

  return (
    <View style={[styles.backdrop, { backgroundColor: colors.overlay }]}>
      <Pressable style={styles.dismiss} onPress={() => navigation.goBack()} accessibilityLabel="Close" />
      <View style={[styles.panel, { backgroundColor: colors.surface, paddingBottom: Math.max(insets.bottom, 12) + 14 }]}>
        <Grabber />
        <View style={styles.head}>
          <Text variant="title" style={styles.title}>
            Update status
          </Text>
          <Text variant="small" color="muted" style={styles.sub}>
            {lead.name} · now {LEAD_STATUS[originalStatus]?.label || originalStatus}
          </Text>
        </View>
        <ScrollView style={styles.scroll} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          <View style={styles.chips}>
            {GROUPS.flatMap((group) => group.statuses)
              // Only an admin may set Requested directly; for everyone else it is what closing becomes.
              .filter((key) => key !== "REQUESTED" || isAdmin || originalStatus === "REQUESTED")
              .map((key) => (
                <Chip
                  key={key}
                  label={LEAD_STATUS[key]!.label}
                  tone={LEAD_STATUS[key]!.tone}
                  dot={toneDot(LEAD_STATUS[key]!.tone)}
                  selected={status === key}
                  onPress={() => setStatus(key)}
                />
              ))}
          </View>

          {isDeal ? (
            <View style={styles.gap}>
              <Text variant="smallStrong" color="muted">
                Property being closed
              </Text>
              <Text variant="small" color={selectedProperty ? "text" : "danger"}>
                {selectedProperty || "No property selected. A deal can only close against a selected property."}
              </Text>
              <Button
                label={selectedProperty ? "Change property" : "Choose the property"}
                icon="business-outline"
                variant="secondary"
                size="sm"
                onPress={() => navigation.navigate("PickProperty", { leadId, select: true })}
              />
            </View>
          ) : null}
          {isDeal ? <DealClosureSection draft={deal} onChange={setDeal} needsApproval={!closesDirectly} /> : null}

          {wantsFollowUp ? (
            <View style={styles.gap}>
              <Text variant="smallStrong" color="muted">
                {collectingBalance ? "Collect the rest on" : status === "SITE_VISIT_SCHEDULED" ? "Visit time" : "Next follow-up"}
              </Text>
              <View style={styles.grid}>
                {pickTiles.map((pick) => {
                  const on = Boolean(followUp && Math.abs(followUp.getTime() - pick.date.getTime()) < 60000);
                  return (
                    <Pressable
                      key={pick.key}
                      onPress={() => setFollowUp(pick.date)}
                      accessibilityRole="radio"
                      accessibilityState={{ selected: on }}
                      style={[styles.tile, { backgroundColor: on ? colors.primarySoft : colors.surface, borderColor: on ? colors.primary : colors.border }]}
                    >
                      <Text variant="smallStrong" color={on ? colors.primary : colors.text} style={styles.tileTitle}>
                        {pick.label}
                      </Text>
                      <Text variant="tiny" color="muted" style={styles.tileSub}>
                        {formatWhen(pick.date)}
                      </Text>
                    </Pressable>
                  );
                })}
                <View style={[styles.tile, styles.pickTile, { borderColor: !pickedQuick && followUp ? colors.primary : colors.border, backgroundColor: !pickedQuick && followUp ? colors.primarySoft : colors.surface }]}>
                  <DateTimeField label="Pick date…" variant="tile" value={!pickedQuick ? followUp : null} onChange={setFollowUp} minimumDate={new Date()} />
                </View>
              </View>
              {followUp && !pickedQuick ? null : null}
            </View>
          ) : null}

          {(status === "SITE_VISIT_SCHEDULED" || status === "SITE_VISIT") && isManagement(user.role) ? (
            <View style={styles.gap}>
              <Text variant="smallStrong" color="muted">
                Site location
              </Text>
              <Text variant="small" color="muted">
                {site
                  ? `Will be saved as ${site.lat.toFixed(5)}, ${site.lng.toFixed(5)}.`
                  : hasSite
                    ? "Set. Field executives must be within range of it to mark the visit."
                    : "Not set yet. Field executives can only mark a visit once the site is pinned."}
              </Text>
              <Button label="Use my current location" icon="locate-outline" variant="secondary" size="sm" loading={locating} onPress={useMyLocationAsSite} />
            </View>
          ) : null}

          {status === "SITE_VISIT" && user.role === "FIELD_EXECUTIVE" ? (
            <Text variant="small" color="muted">
              Your current location is sent with this update; you need to be at the site.
            </Text>
          ) : null}

          <Field value={note} onChangeText={setNote} placeholder="What happened on this call?" multiline maxLength={1000} />
          <InlineError message={error} />
        </ScrollView>
        <Button label={isDeal && !closesDirectly && originalStatus !== "CLOSED" ? "Send for approval" : "Save update"} onPress={save} loading={saving} disabled={unchanged} />
      </View>
    </View>
  );
};

const toneDot = (tone: string) => {
  const map: Record<string, string> = { primary: "#2549d6", info: "#2549d6", violet: "#7a4fd8", warning: "#b86e00", danger: "#d0392b", success: "#12925f", neutral: "#5a6380" };
  return map[tone] || map.neutral!;
};

const styles = StyleSheet.create({
  backdrop: { flex: 1, justifyContent: "flex-end" },
  dismiss: { flex: 1 },
  panel: { borderTopLeftRadius: 26, borderTopRightRadius: 26, paddingTop: 10, paddingHorizontal: 18, gap: 14, maxHeight: "92%" },
  head: { gap: 2 },
  title: { fontSize: 19 },
  sub: { fontSize: 12.5 },
  scroll: { flexGrow: 0 },
  content: { gap: 14 },
  gap: { gap: 8 },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  grid: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  tile: { width: "48.5%", flexGrow: 1, borderWidth: 1.5, borderRadius: 13, paddingVertical: 10, paddingHorizontal: 12 },
  tileTitle: { fontSize: 12.5 },
  tileSub: { fontFamily: "PlusJakartaSans_400Regular" },
  pickTile: { padding: 0, overflow: "hidden" },
});
