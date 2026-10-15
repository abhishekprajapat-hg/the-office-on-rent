import React, { useState } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { useTheme } from "../../theme/ThemeProvider";
import { Text } from "../../ui";
import type { MapPin, FieldMapProps } from "./types";

/*
 * A drawn street grid with pins placed by their real coordinates, scaled to
 * fit: the browser preview's map, and the phone's when no Google Maps key is set.
 */
export const SchematicMap = ({ pins, me, bottomInset = 0, onPinPress }: FieldMapProps) => {
  const { colors } = useTheme();
  const [size, setSize] = useState({ w: 0, h: 0 });
  const points = [...pins.map((pin) => ({ lat: pin.lat, lng: pin.lng })), ...(me ? [me] : [])];
  const lats = points.map((p) => p.lat);
  const lngs = points.map((p) => p.lng);
  const minLat = Math.min(...lats);
  const maxLat = Math.max(...lats);
  const minLng = Math.min(...lngs);
  const maxLng = Math.max(...lngs);
  const usableH = Math.max(120, size.h - bottomInset - 120);
  const place = (lat: number, lng: number) => {
    const x = maxLng === minLng ? 0.5 : (lng - minLng) / (maxLng - minLng);
    const y = maxLat === minLat ? 0.5 : 1 - (lat - minLat) / (maxLat - minLat);
    return { left: 40 + x * (size.w - 80), top: 100 + y * Math.max(40, usableH - 40) };
  };
  return (
    <View style={[StyleSheet.absoluteFill, { backgroundColor: "#e7ecf5" }]} onLayout={(event) => setSize({ w: event.nativeEvent.layout.width, h: event.nativeEvent.layout.height })}>
      {Array.from({ length: 24 }, (_, i) => (
        <View key={`h${i}`} style={[styles.gridH, { top: i * 44 }]} />
      ))}
      {Array.from({ length: 12 }, (_, i) => (
        <View key={`v${i}`} style={[styles.gridV, { left: i * 44 }]} />
      ))}
      <View style={styles.roadA} />
      <View style={styles.roadB} />
      {size.w
        ? pins.map((pin: MapPin) => (
            <Pressable key={pin.key} accessibilityLabel={pin.title || pin.label} disabled={!onPinPress} onPress={() => onPinPress?.(pin)} style={[styles.pinWrap, place(pin.lat, pin.lng)]}>
              <View style={[styles.pin, { backgroundColor: pin.color }]}>
                <Text variant="tiny" color="#fff" style={styles.pinText}>
                  {pin.label}
                </Text>
              </View>
            </Pressable>
          ))
        : null}
      {size.w && me ? <View style={[styles.me, place(me.lat, me.lng), { backgroundColor: colors.primary }]} /> : null}
    </View>
  );
};

const styles = StyleSheet.create({
  gridH: { position: "absolute", left: 0, right: 0, height: 1, backgroundColor: "#d9e0ee" },
  gridV: { position: "absolute", top: 0, bottom: 0, width: 1, backgroundColor: "#d9e0ee" },
  roadA: { position: "absolute", left: -20, right: -20, top: 250, height: 16, backgroundColor: "#fff", transform: [{ rotate: "-14deg" }] },
  roadB: { position: "absolute", top: -20, bottom: -20, left: 200, width: 14, backgroundColor: "#fff", transform: [{ rotate: "8deg" }] },
  pinWrap: { position: "absolute", marginLeft: -15, marginTop: -30 },
  pin: { width: 30, height: 30, borderTopLeftRadius: 15, borderTopRightRadius: 15, borderBottomRightRadius: 15, borderBottomLeftRadius: 0, transform: [{ rotate: "-45deg" }], alignItems: "center", justifyContent: "center", elevation: 3, shadowColor: "#0e1630", shadowOpacity: 0.25, shadowRadius: 5, shadowOffset: { width: 0, height: 4 } },
  pinText: { transform: [{ rotate: "45deg" }], fontSize: 11, fontFamily: "PlusJakartaSans_800ExtraBold" },
  me: { position: "absolute", width: 18, height: 18, borderRadius: 9, marginLeft: -9, marginTop: -9, borderWidth: 3, borderColor: "#fff" },
});
