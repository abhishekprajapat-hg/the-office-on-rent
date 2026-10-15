import React from "react";
import { Image, StyleSheet, View, type StyleProp, type ViewStyle } from "react-native";

const LOGO = require("../../assets/logo.png");
// logo.png is 1531 × 728.
const RATIO = 1531 / 728;

/*
 * The full logo on its own white plate. The wordmark is drawn in black, so on
 * a dark screen it would vanish; the plate makes it look exactly the same in
 * light and dark mode.
 */
export const BrandLogo = ({ height = 48, style }: { height?: number; style?: StyleProp<ViewStyle> }) => {
  const pad = Math.round(height * 0.28);
  return (
    <View style={[styles.plate, { paddingHorizontal: pad, paddingVertical: Math.round(pad * 0.7), borderRadius: Math.round(height * 0.32) }, style]}>
      <Image source={LOGO} style={{ height, width: Math.round(height * RATIO) }} resizeMode="contain" accessibilityLabel="The Office On Rent" accessibilityIgnoresInvertColors />
    </View>
  );
};

const styles = StyleSheet.create({
  plate: { backgroundColor: "#ffffff", alignSelf: "flex-start", borderWidth: StyleSheet.hairlineWidth, borderColor: "rgba(14,22,48,0.08)" },
});
