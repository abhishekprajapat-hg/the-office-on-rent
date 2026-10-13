import React, { useState } from "react";
import { Image, StyleSheet, View } from "react-native";
import { mediaUrl } from "../api/client";
import type { Property } from "../api/inventory";
import { INVENTORY_STATUS, priceLine, propertyTitle, specLine } from "../lib/property";
import { useTheme } from "../theme/ThemeProvider";
import { radius, space } from "../theme/tokens";
import { Badge, Card, Icon, Text } from "../ui";

export const PropertyCard = ({ property, onPress }: { property: Property; onPress: () => void }) => {
  const { colors } = useTheme();
  const [broken, setBroken] = useState(false);
  const cover = mediaUrl(property.images?.[0]);
  const status = INVENTORY_STATUS[property.status || ""] || { label: property.status || "—", tone: "neutral" as const };
  const place = [property.area, property.city].filter(Boolean).join(", ") || property.location;

  return (
    <Card onPress={onPress} padded={false} style={styles.card} accessibilityLabel={propertyTitle(property)}>
      <View style={[styles.cover, { backgroundColor: colors.surfaceAlt }]}>
        {cover && !broken ? (
          <Image source={{ uri: cover }} style={styles.image} resizeMode="cover" onError={() => setBroken(true)} />
        ) : (
          <Icon name={property.inventoryType === "RESIDENTIAL" ? "home-outline" : "business-outline"} size={28} color={colors.textFaint} />
        )}
        <View style={styles.badges}>
          <Badge label={status.label} tone={status.tone} />
          {property.type ? <Badge label={property.type === "Both" ? "Sale & rent" : property.type} tone="info" /> : null}
        </View>
      </View>
      <View style={styles.body}>
        <Text variant="heading" color="primary">
          {priceLine(property)}
        </Text>
        <Text variant="bodyStrong" numberOfLines={1}>
          {propertyTitle(property)}
        </Text>
        {place ? (
          <View style={styles.inline}>
            <Icon name="location-outline" size={14} color={colors.textMuted} />
            <Text variant="small" color="muted" numberOfLines={1} style={styles.flex}>
              {place}
            </Text>
          </View>
        ) : null}
        <Text variant="tiny" color="faint" numberOfLines={1}>
          {specLine(property)}
        </Text>
      </View>
    </Card>
  );
};

const styles = StyleSheet.create({
  flex: { flex: 1 },
  card: { overflow: "hidden" },
  cover: { height: 150, alignItems: "center", justifyContent: "center", borderTopLeftRadius: radius.lg, borderTopRightRadius: radius.lg, overflow: "hidden" },
  image: { ...StyleSheet.absoluteFillObject },
  badges: { position: "absolute", top: space.sm, left: space.sm, flexDirection: "row", gap: 6 },
  body: { padding: space.md, gap: 3 },
  inline: { flexDirection: "row", alignItems: "center", gap: 4 },
});
