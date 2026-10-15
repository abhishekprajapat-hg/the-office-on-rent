import React, { useEffect, useState } from "react";
import { biometricLabel, unlock } from "../../lib/biometric";
import { Linking, Platform, Pressable, StyleSheet, View } from "react-native";
import Constants from "expo-constants";
import { errorMessage, webOrigin } from "../../api/client";
import { useAuth } from "../../auth/AuthProvider";
import { prefs, usePrefs } from "../../lib/prefs";
import { sendTestPush } from "../../notifications/pushRegistration";
import { useTheme, type ThemePreference } from "../../theme/ThemeProvider";
import { ActionSheet, Body, GroupLabel, Icon, IconTile, ListCard, Text, Toggle, type IconName } from "../../ui";

const THEME_LABEL: Record<ThemePreference, string> = { system: "System", light: "Light", dark: "Dark" };

/* Design 43: Notifications / App / Account groups, toggles and values, version line. */
export const SettingsScreen = () => {
  const { colors, preference, setPreference } = useTheme();
  const { signOut } = useAuth();
  const settings = usePrefs();
  const [themeOpen, setThemeOpen] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const [bio, setBio] = useState<string | null>(null);
  useEffect(() => {
    biometricLabel().then(setBio);
  }, []);

  const onSignOut = async () => {
    // Two taps, so a stray touch doesn't sign anyone out.
    if (!confirm) {
      setConfirm(true);
      setTimeout(() => setConfirm(false), 4000);
      return;
    }
    setSigningOut(true);
    await signOut();
  };

  return (
    <Body style={styles.body}>
      <View style={styles.group}>
        <GroupLabel>Notifications</GroupLabel>
        <ListCard style={styles.card}>
          <Row icon="notifications" label="Push notifications" right={<Toggle label="Push notifications" value={settings.push} onChange={(push) => prefs.set({ push })} />} />
          <Row icon="alarm" label="Follow-up reminders" right={<Toggle label="Follow-up reminders" value={settings.reminders} onChange={(reminders) => prefs.set({ reminders })} />} />
          <Row icon="chatbubble" label="Chat sounds" right={<Toggle label="Chat sounds" value={settings.chatSounds} onChange={(chatSounds) => prefs.set({ chatSounds })} />} />
          {Platform.OS !== "web" ? (
            <Row
              icon="paper-plane"
              label="Send a test notification"
              chevron
              onPress={() => {
                setNote(null);
                sendTestPush()
                  .then((res) => setNote(res?.message || "Sent. It should arrive in a few seconds."))
                  .catch((err) => setNote(errorMessage(err)));
              }}
            />
          ) : null}
        </ListCard>
        {note ? (
          <Text variant="small" color="muted">
            {note}
          </Text>
        ) : null}
      </View>

      <View style={styles.group}>
        <GroupLabel>App</GroupLabel>
        <ListCard style={styles.card}>
          <Row icon="moon" label="Appearance" value={THEME_LABEL[preference]} onPress={() => setThemeOpen(true)} />
          <Row icon="language" label="Language" value="English" />
          {bio ? (
            <Row
              icon="finger-print"
              label={`Unlock with ${bio}`}
              right={
                <Toggle
                  label={`Unlock with ${bio}`}
                  value={settings.biometricLock}
                  onChange={async (next) => {
                    // Confirm it works before relying on it to open the app.
                    if (next && !(await unlock(`Turn on ${bio}`))) return;
                    prefs.set({ biometricLock: next });
                  }}
                />
              }
            />
          ) : null}
        </ListCard>
      </View>

      <View style={styles.group}>
        <GroupLabel>Account</GroupLabel>
        <ListCard style={styles.card}>
          <Row
            icon="key"
            label="Change password"
            onPress={() => setNote("Passwords are reset by your admin from Admin → Users. Ask them for a new one.")}
          />
          <Row icon="shield-checkmark" label="Privacy policy" onPress={() => Linking.openURL(`${webOrigin()}/privacy-policy`)} />
          <Row icon="document-text" label="Terms and conditions" onPress={() => Linking.openURL(`${webOrigin()}/terms-and-conditions`)} />
          <Row icon="log-out" label={signingOut ? "Signing out…" : confirm ? "Tap again to sign out" : "Sign out"} danger onPress={signingOut ? undefined : onSignOut} />
        </ListCard>
      </View>

      <Text variant="mono" color={colors.textFaint} align="center" style={styles.version}>
        v{Constants.expoConfig?.version || "2.0.0"} · Office On Rent
      </Text>

      <ActionSheet
        visible={themeOpen}
        title="Appearance"
        onClose={() => setThemeOpen(false)}
        actions={(["system", "light", "dark"] as ThemePreference[]).map((key) => ({
          key,
          label: THEME_LABEL[key],
          icon: (key === "system" ? "phone-portrait-outline" : key === "light" ? "sunny-outline" : "moon-outline") as IconName,
          hint: key === preference ? "Current" : undefined,
          onPress: () => setPreference(key),
        }))}
      />
    </Body>
  );
};

const Row = ({
  icon,
  label,
  value,
  right,
  onPress,
  danger,
  chevron,
}: {
  icon: IconName;
  label: string;
  value?: string;
  right?: React.ReactNode;
  onPress?: () => void;
  danger?: boolean;
  chevron?: boolean;
}) => {
  const { colors } = useTheme();
  return (
    <Pressable
      disabled={!onPress}
      onPress={onPress}
      accessibilityRole={onPress ? "button" : undefined}
      style={({ pressed }) => [styles.row, pressed && { backgroundColor: colors.surfaceAlt }]}
    >
      <IconTile icon={icon} tone={danger ? "danger" : "primary"} size={30} iconSize={16} />
      <Text variant="bodyStrong" color={danger ? colors.danger : colors.text} style={styles.label}>
        {label}
      </Text>
      {value ? (
        <Text variant="small" color="muted">
          {value}
        </Text>
      ) : null}
      {right}
      {chevron ? <Icon name="chevron-forward" size={16} color={colors.textFaint} /> : null}
    </Pressable>
  );
};

const styles = StyleSheet.create({
  body: { gap: 12, paddingTop: 4 },
  group: { gap: 6 },
  card: {},
  row: { flexDirection: "row", alignItems: "center", gap: 10, height: 48, paddingHorizontal: 12 },
  label: { flex: 1, fontSize: 13.5, fontFamily: "PlusJakartaSans_600SemiBold" },
  version: { fontSize: 11 },
});
