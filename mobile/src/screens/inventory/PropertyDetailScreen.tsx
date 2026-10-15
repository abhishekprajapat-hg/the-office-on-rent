import React, { useState } from "react";
import { Image, Linking, NativeScrollEvent, NativeSyntheticEvent, Platform, Pressable, RefreshControl, ScrollView, Share, StyleSheet, useWindowDimensions, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { linkProperty, listLeads } from "../../api/leads";
import { PickerSheet } from "../../ui/PickerSheet";
import { errorMessage, mediaUrl, webOrigin } from "../../api/client";
import { createShareLink, getProperty } from "../../api/inventory";
import { listConversations, sendMessage } from "../../api/chat";
import { canOpenPage } from "../../api/access";
import { useAuth } from "../../auth/AuthProvider";
import { DOCUMENT_CHECKS, MODELS_BY_OWNERSHIP, OWNER_TYPES, OWNERSHIP } from "../../lib/propertyForm";
import { dialable, formatDate, whatsappNumber } from "../../lib/format";
import { formatRupees } from "../../lib/money";
import { amenityLabels, areaLine, floorLabel, fullAddress, FURNISHING, INVENTORY_STATUS, propertyTitle } from "../../lib/property";
import { useQuery } from "../../lib/useQuery";
import { PropertyMenu } from "./PropertyMenu";
import type { RootScreenProps } from "../../navigation/types";
import { useTheme } from "../../theme/ThemeProvider";
import { Badge, Button, ErrorState, FooterBar, Icon, IconTile, InlineError, ListCard, Loading, Text, type IconName } from "../../ui";

export const PropertyDetailScreen = ({ route, navigation }: RootScreenProps<"PropertyDetail">) => {
  const { id } = route.params;
  const { colors } = useTheme();
  const { width } = useWindowDimensions();
  const [slide, setSlide] = useState(0);
  const [sharing, setSharing] = useState(false);
  const [shareError, setShareError] = useState<string | null>(null);
  const [sharedUrl, setSharedUrl] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const { user, access } = useAuth();
  const canChat = canOpenPage(user, access, "chat");
  const [chatPick, setChatPick] = useState(false);
  const { data: rooms } = useQuery(() => (chatPick ? listConversations() : Promise.resolve([])), [chatPick]);

  const { data: property, loading, error, refreshing, refresh, reload } = useQuery(async () => {
    const result = await getProperty(id);
    if (!result) throw new Error("This property no longer exists.");
    return result;
  }, [id]);

  const insets = useSafeAreaInsets();
  const [linking, setLinking] = useState(false);
  const [linkNote, setLinkNote] = useState<{ ok?: string; error?: string } | null>(null);
  const { data: leadOptions } = useQuery(() => (linking ? listLeads({ page: 1, limit: 100 }).then((r) => r.leads) : Promise.resolve([])), [linking]);

  if (loading) return <Loading />;
  if (error || !property) return <ErrorState message={error || "Couldn't load this property."} onRetry={refresh} />;

  const images = (property.images || []).map((image) => mediaUrl(image)).filter(Boolean) as string[];
  const status = INVENTORY_STATUS[property.status || ""] || { label: property.status || "—", tone: "neutral" as const };
  const residential = property.inventoryType === "RESIDENTIAL" ? property.residentialDetails : null;
  const commercial = property.inventoryType !== "RESIDENTIAL" ? property.commercialDetails : null;
  const layout = commercial?.officeLayout;
  const amenities = amenityLabels((residential?.amenities || commercial?.amenities) as Record<string, unknown> | undefined);

  const share = async () => {
    setSharing(true);
    setShareError(null);
    let url = "";
    try {
      const { shareToken } = await createShareLink(property._id);
      url = `${webOrigin()}/shared/inventory/${shareToken}`;
      setSharedUrl(url);
      await Share.share({ message: `${propertyTitle(property)}\n${url}`, url });
    } catch (err) {
      // Dismissing the sheet isn't an error. In a browser the sheet may be
      // missing or refuse; the link is on screen to copy, so that's fine too.
      const dismissed = err instanceof Error && /cancel|dismiss|abort/i.test(err.message);
      if (!dismissed && !(url && Platform.OS === "web")) setShareError(errorMessage(err));
    } finally {
      setSharing(false);
    }
  };

  type Fact = { icon: IconName; label: string; value?: string };
  const allFacts: Fact[] = [
    { icon: "resize-outline", label: "Area", value: areaLine(property) },
    { icon: "layers-outline", label: "Floor", value: floorLabel(property) },
    { icon: "bed-outline", label: "Layout", value: residential?.bhkType || (layout?.totalCabins ? `${layout.totalCabins} cabins` : undefined) },
    { icon: "people-outline", label: "Seats", value: layout?.seats || layout?.workstations ? String(layout?.seats || layout?.workstations) : undefined },
    { icon: "water-outline", label: "Bathrooms", value: residential?.bathrooms ? String(residential.bathrooms) : undefined },
    { icon: "car-outline", label: "Parking", value: residential?.parking ? String(residential.parking) : undefined },
    { icon: "color-palette-outline", label: "Furnishing", value: FURNISHING[property.furnishingStatus || ""] },
    { icon: "pricetag-outline", label: "Category", value: commercial?.officeType ? humanize(commercial.officeType) : property.category },
  ];
  const facts = allFacts.filter((fact) => fact.value);

  const specs: { value: string; label: string }[] = [
    property.carpetArea || property.totalArea ? { value: Number(property.carpetArea || property.totalArea).toLocaleString("en-IN"), label: property.areaUnit || "sq ft" } : null,
    layout?.seats || layout?.workstations ? { value: String(layout?.seats || layout?.workstations), label: "seats" } : residential?.bhkType ? { value: residential.bhkType.replace(/_/g, " "), label: "layout" } : null,
    layout?.conferenceRooms ? { value: String(layout.conferenceRooms), label: "meeting" } : layout?.totalCabins ? { value: String(layout.totalCabins), label: "cabins" } : residential?.bathrooms ? { value: String(residential.bathrooms), label: "baths" } : null,
    typeof property.floorNumber === "number" ? { value: ordinal(property.floorNumber), label: property.totalFloors ? `of ${property.totalFloors} floors` : "floor" } : null,
  ].filter(Boolean) as { value: string; label: string }[];
  const terms: [string, string][] = [
    property.type !== "Rent" && property.price ? ["Sale price", formatRupees(property.price)] : null,
    property.type !== "Sale" && property.rent ? ["Rent", `${formatRupees(property.rent)} / mo`] : null,
    property.maintenanceCharges ? ["Maintenance", formatRupees(property.maintenanceCharges)] : null,
    property.depositMonths ? ["Security deposit", `${property.depositMonths} months`] : property.deposit ? ["Security deposit", formatRupees(property.deposit)] : null,
    property.lockInYears ? ["Lock-in", `${property.lockInYears} year${property.lockInYears === 1 ? "" : "s"}`] : null,
    property.agreementYears ? ["Agreement", `${property.agreementYears} years`] : null,
    FURNISHING[property.furnishingStatus || ""] ? ["Furnishing", FURNISHING[property.furnishingStatus || ""]!] : null,
    property.status === "Sold" && property.saleDetails?.leadId ? ["Closed with", `${property.saleDetails.leadId.name}${property.saleDetails.soldAt ? ` · ${formatDate(property.saleDetails.soldAt)}` : ""}`] : null,
    property.reservationReason ? ["Reserved", property.reservationReason] : null,
  ].filter(Boolean) as [string, string][];
  const extra = facts.filter((fact) => ["Bathrooms", "Parking", "Category"].includes(fact.label));
  const files = [
    ...(property.floorPlans || []).map((url, index) => ({ key: `plan${index}`, icon: "map-outline" as IconName, label: `Floor plan ${index + 1}`, url: mediaUrl(url) || url })),
    ...(property.documents || []).map((url, index) => ({ key: `doc${index}`, icon: "document-text-outline" as IconName, label: decodeURIComponent(url.split("?")[0]!.split("/").pop() || `Document ${index + 1}`).replace(/^\d{10,}-/, ""), url: mediaUrl(url) || url })),
    ...(property.videoTours || []).map((url, index) => ({ key: `video${index}`, icon: "videocam-outline" as IconName, label: `Video tour ${index + 1}`, url })),
  ];
  const papers = DOCUMENT_CHECKS.filter((item) => property.documentsAvailable?.[item.key]).map((item) => item.label);
  const ownership = [
    OWNER_TYPES.find((item) => item.key === property.ownerType)?.label,
    OWNERSHIP.find((item) => item.key === property.ownershipType)?.label,
    (MODELS_BY_OWNERSHIP[property.ownershipType || ""] || []).find((item) => item.key === property.businessModel)?.label,
    property.gstApplicable ? "GST applicable" : null,
  ].filter(Boolean) as string[];

  /* Sends the property's card into a chat (web: share from inventory to Team Chat). */
  const shareToChat = async (roomId: string) => {
    setChatPick(false);
    setShareError(null);
    try {
      await sendMessage(roomId, "", { sharedProperty: { inventoryId: property._id } });
      const room = (rooms || []).find((item) => item._id === roomId);
      setNotice(`Shared to ${room?.name || "the chat"}.`);
    } catch (err) {
      setShareError(errorMessage(err));
    }
  };

  return (
    <View style={[styles.flex, { backgroundColor: colors.bg }]}>
      <ScrollView contentContainerStyle={{ paddingBottom: 100 + insets.bottom }} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} />}>
        <View style={[styles.hero, { backgroundColor: colors.track }]}>
          {images.length ? (
            <ScrollView
              horizontal
              pagingEnabled
              showsHorizontalScrollIndicator={false}
              onMomentumScrollEnd={(event: NativeSyntheticEvent<NativeScrollEvent>) => setSlide(Math.round(event.nativeEvent.contentOffset.x / width))}
            >
              {images.map((uri) => (
                <Image key={uri} source={{ uri }} style={[styles.photo, { width }]} resizeMode="cover" />
              ))}
            </ScrollView>
          ) : (
            <View style={styles.noPhoto}>
              <Text variant="mono" color="faint" style={styles.noPhotoText}>
                no photos yet
              </Text>
            </View>
          )}
          <View style={[styles.overlay, { paddingTop: insets.top + 4 }]}>
            <Pressable accessibilityRole="button" accessibilityLabel="Back" onPress={() => navigation.goBack()} style={[styles.round, { backgroundColor: colors.surface }]}>
              <Icon name="chevron-back" size={20} color={colors.primary} />
            </Pressable>
            <View style={styles.overlayRight}>
              <Pressable accessibilityRole="button" accessibilityLabel="Share link" onPress={share} style={[styles.round, { backgroundColor: colors.surface }]}>
                <Icon name="share-social-outline" size={18} color={colors.primary} />
              </Pressable>
              {canChat ? (
                <Pressable accessibilityRole="button" accessibilityLabel="Share to a chat" onPress={() => setChatPick(true)} style={[styles.round, { backgroundColor: colors.surface }]}>
                  <Icon name="chatbubble-ellipses-outline" size={18} color={colors.primary} />
                </Pressable>
              ) : null}
              {property.siteLocation?.lat && property.siteLocation?.lng ? (
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Open in Maps"
                  onPress={() => Linking.openURL(`https://www.google.com/maps/search/?api=1&query=${property.siteLocation!.lat},${property.siteLocation!.lng}`)}
                  style={[styles.round, { backgroundColor: colors.surface }]}
                >
                  <Icon name="map-outline" size={18} color={colors.primary} />
                </Pressable>
              ) : null}
              <PropertyMenu property={property} onChanged={reload} onNotice={setNotice} />
            </View>
          </View>
          {images.length > 1 ? (
            <View style={styles.counter}>
              <Text variant="mono" color="#fff" style={styles.counterText}>
                {slide + 1}/{images.length}
              </Text>
            </View>
          ) : null}
        </View>

        <View style={[styles.panel, { backgroundColor: colors.bg }]}>
          <View style={styles.gapSm}>
            <View style={styles.badges}>
              <Badge label={status.label} tone={status.tone} />
              <Badge label={FURNISHING[property.furnishingStatus || ""] || (property.inventoryType === "RESIDENTIAL" ? "Residential" : "Commercial")} tone="primary" />
              {property.type ? <Badge label={property.type === "Both" ? "Sale & rent" : property.type} /> : null}
            </View>
            <Text variant="title" style={styles.title}>
              {propertyTitle(property)}
            </Text>
            <Text variant="small" color="muted">
              {[property.projectName, fullAddress(property)].filter(Boolean).join(", ")}
            </Text>
          </View>

          {specs.length ? (
            <View style={styles.specs}>
              {specs.map((spec) => (
                <View key={spec.label} style={[styles.spec, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                  <Text variant="bodyStrong" style={styles.specValue} numberOfLines={1}>
                    {spec.value}
                  </Text>
                  <Text variant="tiny" color="muted" style={styles.specLabel}>
                    {spec.label}
                  </Text>
                </View>
              ))}
            </View>
          ) : null}

          {terms.length ? (
            <ListCard>
              {terms.map(([label, value]) => (
                <View key={label} style={styles.term}>
                  <Text variant="small" color="muted" style={styles.termText}>
                    {label}
                  </Text>
                  <Text variant="smallStrong" style={[styles.termText, styles.termValue]} numberOfLines={2}>
                    {value}
                  </Text>
                </View>
              ))}
              {extra.map((fact) => (
                <View key={fact.label} style={styles.term}>
                  <Text variant="small" color="muted" style={styles.termText}>
                    {fact.label}
                  </Text>
                  <Text variant="smallStrong" style={[styles.termText, styles.termValue]}>
                    {fact.value}
                  </Text>
                </View>
              ))}
            </ListCard>
          ) : null}

          {amenities.length ? (
            <View style={styles.amenities}>
              {amenities.map((label) => (
                <Badge key={label} label={label} tone="primary" />
              ))}
            </View>
          ) : null}

          {files.length ? (
            <ListCard>
              {files.map((file) => (
                <Pressable
                  key={file.key}
                  accessibilityRole="link"
                  onPress={() => Linking.openURL(file.url).catch(() => {})}
                  style={({ pressed }) => [styles.fileRow, pressed && { backgroundColor: colors.surfaceAlt }]}
                >
                  <Icon name={file.icon} size={18} color={colors.primary} />
                  <Text variant="small" numberOfLines={1} style={styles.flex}>
                    {file.label}
                  </Text>
                  <Icon name="open-outline" size={15} color={colors.textFaint} />
                </Pressable>
              ))}
            </ListCard>
          ) : null}

          {papers.length || ownership.length ? (
            <View style={styles.amenities}>
              {ownership.map((label) => (
                <Badge key={label} label={label} tone="violet" />
              ))}
              {papers.map((label) => (
                <Badge key={label} label={`✓ ${label}`} tone="success" />
              ))}
            </View>
          ) : null}

          {property.ownerName ? (
            <PersonCard
              label="Owner"
              name={property.ownerName}
              sub={property.keyManagerName ? `Keys with ${property.keyManagerName}` : property.ownerNumber}
              phone={property.ownerNumber}
              whatsapp={property.ownerWhatsappNumber || property.ownerNumber}
            />
          ) : null}
          {property.keyManagerName ? <PersonCard label="Keys with" name={property.keyManagerName} sub={property.keyManagerNumber} phone={property.keyManagerNumber} /> : null}

          {notice ? (
            <Text variant="smallStrong" color={colors.success}>
              {notice}
            </Text>
          ) : null}
          <InlineError message={shareError || linkNote?.error || null} />
          {linkNote?.ok ? (
            <Text variant="small" color={colors.success} align="center">
              {linkNote.ok}
            </Text>
          ) : null}
          {sharedUrl && !shareError ? (
            <Text variant="tiny" color="faint" align="center" selectable>
              {sharedUrl}
            </Text>
          ) : null}
        </View>
      </ScrollView>

      <FooterBar>
        <Button
          variant="secondary"
          icon="logo-whatsapp"
          label="Share"
          style={styles.flex}
          loading={sharing}
          onPress={share}
        />
        <Button icon="link" label="Link to a lead" style={styles.wide} onPress={() => setLinking(true)} />
      </FooterBar>

      <PickerSheet
        visible={linking}
        title="Link to a lead"
        subtitle={`${propertyTitle(property)} will show on the lead's Properties tab.`}
        items={(leadOptions || []).map((lead) => ({ key: lead._id, label: lead.name, sub: [lead.projectInterested, lead.phone].filter(Boolean).join(" · "), avatar: true }))}
        onPick={async (leadId) => {
          setLinking(false);
          setLinkNote(null);
          try {
            await linkProperty(leadId, property._id);
            setLinkNote({ ok: `Linked to ${(leadOptions || []).find((lead) => lead._id === leadId)?.name || "the lead"}.` });
          } catch (err) {
            setLinkNote({ error: errorMessage(err) });
          }
        }}
        onClose={() => setLinking(false)}
        searchPlaceholder="Search your leads"
      />
      <PickerSheet
        visible={chatPick}
        title="Share to a chat"
        subtitle="Sends the property card; teammates open it from the chat."
        items={(rooms || [])
          .filter((room) => room.type !== "broadcast")
          .map((room) => ({
            key: room._id,
            label: room.name || room.participants.filter((person) => person._id !== (user?.id || user?._id)).map((person) => person.name).join(", ") || "Chat",
            sub: room.type === "group" ? "Group" : room.type === "lead" ? "Lead room" : "Direct",
            avatar: true,
          }))}
        onPick={shareToChat}
        onClose={() => setChatPick(false)}
        searchPlaceholder="Search chats"
      />
    </View>
  );
};

const ordinal = (n: number) => {
  if (n === 0) return "Ground";
  const tail = n % 100 >= 11 && n % 100 <= 13 ? "th" : ["th", "st", "nd", "rd"][n % 10] || "th";
  return `${n}${tail}`;
};

const PersonCard = ({ label, name, sub, phone, whatsapp }: { label: string; name: string; sub?: string; phone?: string; whatsapp?: string }) => {
  const { colors } = useTheme();
  const tel = dialable(phone);
  return (
    <View style={[styles.person, { backgroundColor: colors.surface, borderColor: colors.border }]}>
      <IconTile icon="person" tone="violet" />
      <View style={styles.flex}>
        <Text variant="bodyStrong" style={styles.personName} numberOfLines={1}>
          {label} · {name}
        </Text>
        {sub ? (
          <Text variant="small" color="muted" style={styles.personSub}>
            {sub}
          </Text>
        ) : null}
      </View>
      {whatsapp ? (
        <Pressable hitSlop={6} accessibilityLabel={`WhatsApp ${name}`} onPress={() => Linking.openURL(`https://wa.me/${whatsappNumber(whatsapp)}`)}>
          <Icon name="logo-whatsapp" size={18} color={colors.success} />
        </Pressable>
      ) : null}
      {tel ? (
        <Pressable hitSlop={6} accessibilityLabel={`Call ${name}`} onPress={() => Linking.openURL(`tel:${tel}`)}>
          <Icon name="call" size={18} color={colors.primary} />
        </Pressable>
      ) : null}
    </View>
  );
};

const humanize = (value: string) => value.replace(/_/g, " ").toLowerCase().replace(/^\w/, (c) => c.toUpperCase());

const styles = StyleSheet.create({
  fileRow: { flexDirection: "row", alignItems: "center", gap: 10, paddingHorizontal: 14, paddingVertical: 12 },
  flex: { flex: 1, minWidth: 0 },
  wide: { flex: 1.4 },
  hero: { height: 230 },
  photo: { height: 230 },
  noPhoto: { flex: 1, alignItems: "center", justifyContent: "center" },
  noPhotoText: { fontSize: 11 },
  overlay: { position: "absolute", left: 0, right: 0, top: 0, flexDirection: "row", justifyContent: "space-between", paddingHorizontal: 14 },
  overlayRight: { flexDirection: "row", gap: 8 },
  round: { width: 38, height: 38, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  counter: { position: "absolute", bottom: 32, alignSelf: "center", backgroundColor: "rgba(0,0,0,0.35)", borderRadius: 999, paddingHorizontal: 8, paddingVertical: 2 },
  counterText: { fontSize: 11 },
  panel: { marginTop: -22, borderTopLeftRadius: 22, borderTopRightRadius: 22, paddingHorizontal: 14, paddingTop: 16, gap: 12 },
  gapSm: { gap: 4 },
  badges: { flexDirection: "row", gap: 6, flexWrap: "wrap" },
  title: { fontSize: 19 },
  specs: { flexDirection: "row", gap: 6 },
  spec: { flex: 1, borderWidth: 1, borderRadius: 13, paddingVertical: 9, paddingHorizontal: 4, alignItems: "center", gap: 1 },
  specValue: { fontSize: 13.5, fontFamily: "PlusJakartaSans_800ExtraBold" },
  specLabel: { fontSize: 10, fontFamily: "PlusJakartaSans_600SemiBold" },
  term: { flexDirection: "row", justifyContent: "space-between", gap: 10, paddingHorizontal: 14, paddingVertical: 10 },
  termText: { fontSize: 12.5 },
  termValue: { flexShrink: 1, textAlign: "right" },
  amenities: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  person: { flexDirection: "row", alignItems: "center", gap: 10, padding: 12, borderRadius: 16, borderWidth: 1 },
  personName: { fontSize: 13 },
  personSub: { fontSize: 11.5 },
});
