import React, { useState } from "react";
import { Image, StyleSheet, View } from "react-native";
import { mediaUrl } from "../api/client";
import type { Property } from "../api/inventory";
import { INVENTORY_STATUS, priceLine, propertyTitle, specLine } from "../lib/property";
import { useTheme } from "../theme/ThemeProvider";
import { Badge, Card, Text } from "../ui";

/* Design 22 inventory card: 96px photo strip with status pill, title + price, place · size · furnishing. */
export const PropertyCard = ({ property, onPress }: { property: Property; onPress: () => void }) => {
  const { colors } = useTheme();
  const [broken, setBroken] = useState(false);
  const cover = mediaUrl(property.images?.[0]);
  const status = INVENTORY_STATUS[property.status || ""] || { label: property.status || "—", tone: "neutral" as const };
  const place = [property.area || property.location, property.city].filter(Boolean).join(", ");
  const photos = property.images?.length || 0;

  return (
    <Card onPress={onPress} padded={false} style={styles.card} accessibilityLabel={propertyTitle(property)}>
      <View style={[styles.cover, { backgroundColor: colors.surfaceAlt }]}>
        {cover && !broken ? (
          <Image source={{ uri: cover }} style={styles.image} resizeMode="cover" onError={() => setBroken(true)} />
        ) : (
          <Stripes />
        )}
        <View style={styles.badges}>
          <Badge label={status.label} tone={status.tone} />
          {property.type ? <Badge label={property.type === "Both" ? "Sale & rent" : property.type} tone="primary" /> : null}
        </View>
        <Text variant="mono" color={cover && !broken ? "#fff" : colors.textFaint} style={styles.count}>
          {photos ? `${photos} photo${photos === 1 ? "" : "s"}` : "no photo"}
        </Text>
      </View>
      <View style={styles.body}>
        <View style={styles.titleRow}>
          <Text variant="bodyStrong" numberOfLines={1} style={styles.title}>
            {propertyTitle(property)}
          </Text>
          <Text variant="smallStrong" color="primary" style={styles.price}>
            {priceLine(property)}
          </Text>
        </View>
        <Text variant="small" color="muted" numberOfLines={1} style={styles.sub}>
          {[place, specLine(property)].filter(Boolean).join(" · ")}
        </Text>
      </View>
    </Card>
  );
};

/* The design's diagonal placeholder stripes for a property without photos. */
const Stripes = () => {
  const { colors } = useTheme();
  return (
    <View style={[StyleSheet.absoluteFill, styles.stripes]}>
      {Array.from({ length: 30 }, (_, i) => (
        <View key={i} style={[styles.stripe, { left: i * 20 - 120, backgroundColor: colors.track }]} />
      ))}
    </View>
  );
};

const styles = StyleSheet.create({
  card: { overflow: "hidden" },
  cover: { height: 96, overflow: "hidden" },
  image: { ...StyleSheet.absoluteFillObject },
  stripes: { overflow: "hidden" },
  stripe: { position: "absolute", top: -60, width: 10, height: 240, transform: [{ rotate: "45deg" }], opacity: 0.6 },
  badges: { position: "absolute", top: 8, left: 8, flexDirection: "row", gap: 6 },
  count: { position: "absolute", top: 8, right: 10, fontSize: 10 },
  body: { paddingHorizontal: 12, paddingVertical: 10, gap: 3 },
  titleRow: { flexDirection: "row", gap: 8, alignItems: "baseline" },
  title: { flex: 1, fontSize: 13.5 },
  price: { fontSize: 13, fontFamily: "PlusJakartaSans_800ExtraBold" },
  sub: { fontSize: 11.5 },
});
