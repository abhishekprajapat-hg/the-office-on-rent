import React, { useEffect, useRef, useState } from "react";
import { Animated, Platform, Pressable, StyleSheet, View } from "react-native";
import { useLinkTo } from "@react-navigation/native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTheme } from "../theme/ThemeProvider";
import { font } from "../theme/tokens";
import { Icon, Text, type IconName } from "../ui";
import { inAppAlerts, useInAppAlert, type InAppAlert } from "./inAppAlert";

const ICON: Record<InAppAlert["kind"], IconName> = {
  chat: "chatbubble-ellipses",
  task: "checkbox",
  request: "shield-checkmark",
  broadcast: "megaphone",
  push: "notifications",
};

const SHOW_MS = 5000;

/*
 * Slides an alert down from the top while the app is open; tap to open it,
 * or it leaves on its own. Lives inside the NavigationContainer so a tap can
 * follow the alert's deep link.
 */
export const InAppBanner = () => {
  const alert = useInAppAlert();
  const { colors, scheme, reduceMotion } = useTheme();
  const insets = useSafeAreaInsets();
  const linkTo = useLinkTo();
  const [shown, setShown] = useState<InAppAlert | null>(null);
  const offset = useRef(new Animated.Value(-160)).current;

  useEffect(() => {
    if (alert) {
      setShown(alert);
      Animated.spring(offset, { toValue: 0, useNativeDriver: Platform.OS !== "web", speed: reduceMotion ? 100 : 16, bounciness: reduceMotion ? 0 : 6 }).start();
      const timer = setTimeout(() => inAppAlerts.dismiss(alert.id), SHOW_MS);
      return () => clearTimeout(timer);
    }
    Animated.timing(offset, { toValue: -160, duration: reduceMotion ? 0 : 180, useNativeDriver: Platform.OS !== "web" }).start(() => setShown(null));
    return undefined;
  }, [alert, offset, reduceMotion]);

  if (!shown) return null;

  const open = () => {
    inAppAlerts.dismiss(shown.id);
    if (!shown.link) return;
    try {
      linkTo(`/${shown.link}`);
    } catch {
      // A link to a screen this role can't open: the alert just closes.
    }
  };

  return (
    <Animated.View pointerEvents="box-none" style={[styles.wrap, { top: insets.top + 6, transform: [{ translateY: offset }] }]}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${shown.title}. ${shown.body}. Open`}
        accessibilityLiveRegion="polite"
        onPress={open}
        style={({ pressed }) => [
          styles.card,
          {
            backgroundColor: scheme === "dark" ? "rgba(30,36,58,0.98)" : "rgba(255,255,255,0.98)",
            borderColor: colors.border,
            opacity: pressed ? 0.9 : 1,
          },
        ]}
      >
        <View style={[styles.icon, { backgroundColor: colors.primarySoft }]}>
          <Icon name={ICON[shown.kind]} size={18} color={colors.primary} />
        </View>
        <View style={styles.texts}>
          <Text variant="smallStrong" numberOfLines={1} style={styles.title}>
            {shown.title}
          </Text>
          {shown.body ? (
            <Text variant="small" color="muted" numberOfLines={2}>
              {shown.body}
            </Text>
          ) : null}
        </View>
        <Pressable accessibilityRole="button" accessibilityLabel="Dismiss" hitSlop={10} onPress={() => inAppAlerts.dismiss(shown.id)}>
          <Icon name="close" size={18} color={colors.textFaint} />
        </Pressable>
      </Pressable>
    </Animated.View>
  );
};

const styles = StyleSheet.create({
  wrap: { position: "absolute", left: 12, right: 12, zIndex: 1000, elevation: 1000, alignItems: "center" },
  card: {
    width: "100%",
    maxWidth: 520,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    borderWidth: 1,
    borderRadius: 18,
    paddingHorizontal: 14,
    paddingVertical: 12,
    ...Platform.select({
      ios: { shadowColor: "#000", shadowOpacity: 0.2, shadowRadius: 18, shadowOffset: { width: 0, height: 10 } },
      android: { elevation: 12 },
      default: { boxShadow: "0 12px 34px rgba(0,0,0,0.22)" } as object,
    }),
  },
  icon: { width: 36, height: 36, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  texts: { flex: 1, minWidth: 0, gap: 1 },
  title: { fontFamily: font.bold },
});
