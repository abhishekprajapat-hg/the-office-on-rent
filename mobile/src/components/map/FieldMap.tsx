import React, { useEffect, useRef } from "react";
import { Platform, StyleSheet, View } from "react-native";
import MapView, { Marker, PROVIDER_GOOGLE } from "react-native-maps";
import Constants from "expo-constants";
import { Text } from "../../ui";
import { SchematicMap } from "./SchematicMap";
import type { FieldMapProps } from "./types";

// Google Maps on Android needs a key at build time (app.config.js, GOOGLE_MAPS_ANDROID_API_KEY); iOS uses Apple Maps.
const hasAndroidKey = Boolean((Constants.expoConfig?.android as { config?: { googleMaps?: { apiKey?: string } } } | undefined)?.config?.googleMaps?.apiKey);

/* Field ops map (web FieldOpsMapSection): visits, teammates and properties by their real coordinates. */
export const FieldMap = (props: FieldMapProps) => {
  const { pins, me, bottomInset = 0, focus, onPinPress } = props;
  const map = useRef<MapView>(null);
  const points = [...pins.map((pin) => ({ latitude: pin.lat, longitude: pin.lng })), ...(me ? [{ latitude: me.lat, longitude: me.lng }] : [])];
  const signature = points.map((point) => `${point.latitude.toFixed(4)},${point.longitude.toFixed(4)}`).join("|");

  useEffect(() => {
    if (!points.length) return;
    const timer = setTimeout(() => {
      if (points.length === 1) map.current?.animateToRegion({ ...points[0]!, latitudeDelta: 0.02, longitudeDelta: 0.02 }, 400);
      else map.current?.fitToCoordinates(points, { edgePadding: { top: 120, right: 50, bottom: bottomInset + 40, left: 50 }, animated: true });
    }, 300);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [signature, bottomInset]);

  useEffect(() => {
    if (focus) map.current?.animateToRegion({ latitude: focus.lat, longitude: focus.lng, latitudeDelta: 0.01, longitudeDelta: 0.01 }, 400);
  }, [focus?.key]);

  if (Platform.OS === "android" && !hasAndroidKey) return <SchematicMap {...props} />;

  return (
    <MapView
      ref={map}
      style={StyleSheet.absoluteFill}
      provider={Platform.OS === "android" ? PROVIDER_GOOGLE : undefined}
      showsUserLocation={Boolean(me)}
      showsMyLocationButton={false}
      toolbarEnabled={false}
      mapPadding={{ top: 0, right: 0, bottom: bottomInset, left: 0 }}
      initialRegion={{ latitude: 28.6139, longitude: 77.209, latitudeDelta: 0.5, longitudeDelta: 0.5 }}
    >
      {pins.map((pin) => (
        <Marker key={pin.key} coordinate={{ latitude: pin.lat, longitude: pin.lng }} title={pin.title} description={pin.subtitle} onCalloutPress={() => onPinPress?.(pin)}>
          <View style={[styles.pin, { backgroundColor: pin.color }]}>
            <Text variant="tiny" color="#fff" style={styles.pinText}>
              {pin.label}
            </Text>
          </View>
        </Marker>
      ))}
    </MapView>
  );
};

const styles = StyleSheet.create({
  pin: { minWidth: 28, height: 28, paddingHorizontal: 6, borderRadius: 14, alignItems: "center", justifyContent: "center", borderWidth: 2, borderColor: "#fff" },
  pinText: { fontSize: 11, fontFamily: "PlusJakartaSans_800ExtraBold" },
});
