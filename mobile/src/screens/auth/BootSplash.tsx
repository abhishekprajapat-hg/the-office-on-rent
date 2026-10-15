import React, { useEffect, useRef } from "react";
import { Animated, Easing, Image, StyleSheet, View } from "react-native";
import { StatusBar } from "expo-status-bar";
import { useTheme } from "../../theme/ThemeProvider";
import { Text } from "../../ui";

/* Design 01: blue screen, logo on a white card, "CRM", and a progress bar while the session is restored. */
export const BootSplash = () => {
  const { colors } = useTheme();
  const progress = useRef(new Animated.Value(0.15)).current;
  useEffect(() => {
    const run = Animated.timing(progress, { toValue: 0.92, duration: 2400, easing: Easing.out(Easing.cubic), useNativeDriver: false });
    run.start();
    return () => run.stop();
  }, [progress]);
  return (
    <View style={[styles.root, { backgroundColor: colors.hero }]} accessibilityLabel="Restoring your session">
      <StatusBar style="light" />
      <View style={styles.center}>
        <View style={styles.card}>
          <Image source={require("../../../assets/logo.png")} style={styles.logo} resizeMode="contain" accessibilityIgnoresInvertColors />
        </View>
        <Text variant="smallStrong" color={colors.onPrimaryMuted} style={styles.crm}>
          CRM
        </Text>
      </View>
      <View style={styles.bottom}>
        <View style={styles.track}>
          <Animated.View style={[styles.fill, { width: progress.interpolate({ inputRange: [0, 1], outputRange: ["0%", "100%"] }) }]} />
        </View>
        <Text variant="small" color={colors.onPrimaryMuted}>
          Restoring your session…
        </Text>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  root: { flex: 1 },
  center: { ...StyleSheet.absoluteFillObject, alignItems: "center", justifyContent: "center", gap: 22 },
  card: {
    backgroundColor: "#fff",
    borderRadius: 26,
    paddingVertical: 18,
    paddingHorizontal: 22,
    shadowColor: "#000",
    shadowOpacity: 0.18,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: 20 },
    elevation: 8,
  },
  logo: { height: 64, width: 135 },
  crm: { fontSize: 13, letterSpacing: 2.6 },
  bottom: { position: "absolute", left: 0, right: 0, bottom: 60, alignItems: "center", gap: 12 },
  track: { width: 120, height: 4, borderRadius: 2, backgroundColor: "rgba(255,255,255,0.2)", overflow: "hidden" },
  fill: { height: "100%", backgroundColor: "#fff", borderRadius: 2 },
});
