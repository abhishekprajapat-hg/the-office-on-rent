import React, { useLayoutEffect, useState } from "react";
import { Image, Linking, NativeScrollEvent, NativeSyntheticEvent, Platform, ScrollView, Share, StyleSheet, useWindowDimensions, View } from "react-native";
import { errorMessage, mediaUrl, webOrigin } from "../../api/client";
import { createShareLink, getProperty } from "../../api/inventory";
import { dialable, formatDate, whatsappNumber } from "../../lib/format";
import { formatPrice, formatRupees } from "../../lib/money";
import { amenityLabels, areaLine, floorLabel, fullAddress, FURNISHING, INVENTORY_STATUS, propertyTitle } from "../../lib/property";
import { useQuery } from "../../lib/useQuery";
import type { RootScreenProps } from "../../navigation/types";
import { useTheme } from "../../theme/ThemeProvider";
import { radius, space } from "../../theme/tokens";
import { Avatar, Badge, Body, Button, Card, ErrorState, Icon, InlineError, Loading, SectionTitle, Text, type IconName } from "../../ui";

export const PropertyDetailScreen = ({ route, navigation }: RootScreenProps<"PropertyDetail">) => {
  const { id } = route.params;
  const { colors } = useTheme();
  const { width } = useWindowDimensions();
  const [slide, setSlide] = useState(0);
  const [sharing, setSharing] = useState(false);
  const [shareError, setShareError] = useState<string | null>(null);
  const [sharedUrl, setSharedUrl] = useState<string | null>(null);

  const { data: property, loading, error, refreshing, refresh } = useQuery(async () => {
    const result = await getProperty(id);
    if (!result) throw new Error("This property no longer exists.");
    return result;
  }, [id]);

  useLayoutEffect(() => {
    if (property) navigation.setOptions({ title: property.propertyId || "Property" });
  }, [navigation, property]);

  if (loading) return <Loading />;
  if (error || !property) return <ErrorState message={error || "Couldn't load this property."} onRetry={refresh} />;

  const images = (property.images || []).map((image) => mediaUrl(image)).filter(Boolean) as string[];
  const status = INVENTORY_STATUS[property.status || ""] || { label: property.status || "—", tone: "neutral" as const };
  const residential = property.inventoryType === "RESIDENTIAL" ? property.residentialDetails : null;
  const commercial = property.inventoryType !== "RESIDENTIAL" ? property.commercialDetails : null;
  const layout = commercial?.officeLayout;
  const amenities = amenityLabels((residential?.amenities || commercial?.amenities) as Record<string, unknown> | undefined);
  const galleryWidth = width - space.lg * 2;

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

  return (
    <Body refreshing={refreshing} onRefresh={refresh}>
      {images.length ? (
        <View>
          <ScrollView
            horizontal
            pagingEnabled
            showsHorizontalScrollIndicator={false}
            style={[styles.gallery, { width: galleryWidth }]}
            onMomentumScrollEnd={(event: NativeSyntheticEvent<NativeScrollEvent>) =>
              setSlide(Math.round(event.nativeEvent.contentOffset.x / galleryWidth))
            }
          >
            {images.map((uri) => (
              <Image key={uri} source={{ uri }} style={[styles.photo, { width: galleryWidth }]} resizeMode="cover" />
            ))}
          </ScrollView>
          {images.length > 1 ? (
            <View style={styles.dots}>
              {images.map((uri, index) => (
                <View key={uri} style={[styles.dot, { backgroundColor: index === slide ? colors.primary : colors.border }]} />
              ))}
            </View>
          ) : null}
        </View>
      ) : null}

      <Card style={styles.gapSm}>
        <View style={styles.badges}>
          <Badge label={status.label} tone={status.tone} />
          <Badge label={property.inventoryType === "RESIDENTIAL" ? "Residential" : "Commercial"} tone="info" />
        </View>
        <Text variant="title">{propertyTitle(property)}</Text>
        <View style={styles.inline}>
          <Icon name="location-outline" size={16} color={colors.textMuted} />
          <Text variant="small" color="muted" style={styles.flex}>
            {fullAddress(property)}
          </Text>
        </View>
        {property.status === "Sold" && property.saleDetails?.leadId ? (
          <Text variant="small" color="muted">
            Closed with {property.saleDetails.leadId.name}
            {property.saleDetails.soldAt ? ` on ${formatDate(property.saleDetails.soldAt)}` : ""}
          </Text>
        ) : null}
        {property.reservationReason ? (
          <Text variant="small" color="muted">
            Reserved: {property.reservationReason}
          </Text>
        ) : null}
      </Card>

      <Card style={styles.money}>
        {property.type !== "Rent" && property.price ? <Money label="Sale price" value={formatPrice(property.price)} exact={formatRupees(property.price)} /> : null}
        {property.type !== "Sale" && property.rent ? <Money label="Monthly rent" value={formatPrice(property.rent)} exact={formatRupees(property.rent)} /> : null}
        {property.type !== "Sale" && property.deposit ? (
          <Money label="Deposit" value={formatPrice(property.deposit)} exact={property.depositMonths ? `${property.depositMonths} months` : formatRupees(property.deposit)} />
        ) : null}
        {property.lockInYears || property.agreementYears ? (
          <Text variant="small" color="muted" style={styles.terms}>
            {[property.agreementYears ? `${property.agreementYears}-year agreement` : "", property.lockInYears ? `${property.lockInYears}-year lock-in` : ""].filter(Boolean).join(" · ")}
          </Text>
        ) : null}
      </Card>

      {facts.length ? (
        <>
          <SectionTitle title="Key facts" />
          <View style={styles.facts}>
            {facts.map((fact) => (
              <Card key={fact.label} style={styles.fact}>
                <Icon name={fact.icon} size={18} color={colors.primary} />
                <Text variant="tiny" color="faint">
                  {fact.label}
                </Text>
                <Text variant="smallStrong" numberOfLines={1}>
                  {fact.value}
                </Text>
              </Card>
            ))}
          </View>
        </>
      ) : null}

      {amenities.length ? (
        <>
          <SectionTitle title="Amenities" />
          <View style={styles.amenities}>
            {amenities.map((label) => (
              <View key={label} style={[styles.amenity, { backgroundColor: colors.primarySoft }]}>
                <Icon name="checkmark" size={14} color={colors.primary} />
                <Text variant="small" color="primary">
                  {label}
                </Text>
              </View>
            ))}
          </View>
        </>
      ) : null}

      {property.ownerName || property.keyManagerName ? (
        <>
          <SectionTitle title="Contacts" />
          <Card style={styles.rows}>
            {property.ownerName ? (
              <Contact label="Owner" name={property.ownerName} phone={property.ownerNumber} whatsapp={property.ownerWhatsappNumber || property.ownerNumber} />
            ) : null}
            {property.keyManagerName ? <Contact label="Keys with" name={property.keyManagerName} phone={property.keyManagerNumber} last /> : null}
          </Card>
        </>
      ) : null}

      <InlineError message={shareError} />
      {sharedUrl && !shareError ? (
        <Text variant="tiny" color="faint" align="center" selectable>
          {sharedUrl}
        </Text>
      ) : null}
      <Button label="Share with a client" icon="share-social-outline" loading={sharing} onPress={share} />
      {property.siteLocation?.lat && property.siteLocation?.lng ? (
        <Button
          label="Open in Maps"
          icon="map-outline"
          variant="secondary"
          onPress={() => Linking.openURL(`https://www.google.com/maps/search/?api=1&query=${property.siteLocation!.lat},${property.siteLocation!.lng}`)}
        />
      ) : null}
    </Body>
  );
};

const humanize = (value: string) => value.replace(/_/g, " ").toLowerCase().replace(/^\w/, (c) => c.toUpperCase());

const Money = ({ label, value, exact }: { label: string; value: string; exact?: string }) => (
  <View style={styles.moneyItem}>
    <Text variant="tiny" color="faint">
      {label}
    </Text>
    <Text variant="title" color="primary">
      {value}
    </Text>
    {exact ? (
      <Text variant="tiny" color="muted">
        {exact}
      </Text>
    ) : null}
  </View>
);

const Contact = ({ label, name, phone, whatsapp, last }: { label: string; name: string; phone?: string; whatsapp?: string; last?: boolean }) => {
  const { colors } = useTheme();
  const tel = dialable(phone);
  return (
    <View style={[styles.contact, !last && { borderBottomColor: colors.border, borderBottomWidth: StyleSheet.hairlineWidth }]}>
      <Avatar name={name} size={36} />
      <View style={styles.flex}>
        <Text variant="tiny" color="faint">
          {label}
        </Text>
        <Text variant="bodyStrong">{name}</Text>
        {phone ? (
          <Text variant="small" color="muted">
            {phone}
          </Text>
        ) : null}
      </View>
      {tel ? <Button label="Call" icon="call" size="sm" variant="secondary" onPress={() => Linking.openURL(`tel:${tel}`)} /> : null}
      {whatsapp ? (
        <Button label="" accessibilityLabel={`WhatsApp ${name}`} icon="logo-whatsapp" size="sm" variant="secondary" onPress={() => Linking.openURL(`https://wa.me/${whatsappNumber(whatsapp)}`)} />
      ) : null}
    </View>
  );
};

const styles = StyleSheet.create({
  flex: { flex: 1 },
  gallery: { borderRadius: radius.lg },
  photo: { height: 220, borderRadius: radius.lg },
  dots: { flexDirection: "row", justifyContent: "center", gap: 6, marginTop: space.sm },
  dot: { width: 7, height: 7, borderRadius: 4 },
  gapSm: { gap: space.sm },
  badges: { flexDirection: "row", gap: space.sm },
  inline: { flexDirection: "row", alignItems: "flex-start", gap: 4 },
  money: { flexDirection: "row", flexWrap: "wrap", gap: space.lg },
  moneyItem: { minWidth: 90, gap: 2 },
  terms: { flexBasis: "100%" },
  facts: { flexDirection: "row", flexWrap: "wrap", gap: space.sm },
  fact: { flexBasis: "31%", flexGrow: 1, gap: 4, padding: space.md },
  amenities: { flexDirection: "row", flexWrap: "wrap", gap: space.sm },
  amenity: { flexDirection: "row", alignItems: "center", gap: 4, borderRadius: radius.pill, paddingHorizontal: 10, paddingVertical: 6 },
  rows: { paddingVertical: space.xs },
  contact: { flexDirection: "row", alignItems: "center", gap: space.md, paddingVertical: space.md },
});
