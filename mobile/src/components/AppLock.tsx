import React, { useCallback, useEffect, useRef, useState } from "react";
import { AppState, StyleSheet, View } from "react-native";
import { BrandLogo } from "./BrandLogo";
import { useAuth } from "../auth/AuthProvider";
import { biometricLabel, unlock } from "../lib/biometric";
import { prefs, usePrefs } from "../lib/prefs";
import { useTheme } from "../theme/ThemeProvider";
import { Button, Text } from "../ui";

const RELOCK_AFTER_MS = 5 * 60 * 1000;

/*
 * "Unlock with Face ID" (design 43): when it's on, the app opens behind this
 * cover and asks for the phone's biometrics - on launch and after five
 * minutes in the background.
 */
export const AppLock = ({ children }: { children: React.ReactNode }) => {
  const { user, signOut } = useAuth();
  const settings = usePrefs();
  const { colors } = useTheme();
  const [locked, setLocked] = useState(true);
  const [label, setLabel] = useState("Face ID");
  const [ready, setReady] = useState(false);
  const backgroundedAt = useRef<number | null>(null);

  useEffect(() => {
    prefs.load().then(() => setReady(true));
    biometricLabel().then((value) => value && setLabel(value));
  }, []);

  const attempt = useCallback(async () => {
    if (await unlock()) setLocked(false);
  }, []);

  const active = ready && Boolean(user) && settings.biometricLock;

  useEffect(() => {
    if (active && locked) attempt();
  }, [active]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const sub = AppState.addEventListener("change", (state) => {
      if (state === "background") backgroundedAt.current = Date.now();
      if (state === "active" && backgroundedAt.current && Date.now() - backgroundedAt.current > RELOCK_AFTER_MS && prefs.get().biometricLock) {
        setLocked(true);
        attempt();
      }
    });
    return () => sub.remove();
  }, [attempt]);

  if (!active || !locked) return <>{children}</>;

  return (
    <View style={[styles.cover, { backgroundColor: colors.bg }]}>
      <BrandLogo height={44} style={styles.logo} />
      <Text variant="title" align="center">
        Locked
      </Text>
      <Text variant="small" color="muted" align="center">
        Unlock with {label} to continue as {user?.name}.
      </Text>
      <Button label={`Unlock with ${label}`} icon="finger-print" onPress={attempt} style={styles.button} />
      <Button label="Sign out" variant="ghost" onPress={() => signOut()} />
    </View>
  );
};

const styles = StyleSheet.create({
  cover: { flex: 1, alignItems: "center", justifyContent: "center", padding: 32, gap: 10 },
  logo: { alignSelf: "center", marginBottom: 8 },
  button: { alignSelf: "stretch", marginTop: 12 },
});
