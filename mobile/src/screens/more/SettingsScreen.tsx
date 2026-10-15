import React, { useEffect, useState } from "react";
import { biometricLabel, unlock } from "../../lib/biometric";
import { Platform, Pressable, StyleSheet, View } from "react-native";
import { useNavigation } from "@react-navigation/native";
import Constants from "expo-constants";
import { errorMessage } from "../../api/client";
import { useAuth } from "../../auth/AuthProvider";
import { IDLE_SIGN_OUT_CHOICES, idleLabel, prefs, usePrefs } from "../../lib/prefs";
import { registerForPush, sendTestPush, usePushStatus } from "../../notifications/pushRegistration";
import { pushStatusLabel } from "../../lib/pushStatus";
import { ACCENTS } from "../../theme/accents";
import { useTheme, type ThemePreference } from "../../theme/ThemeProvider";
import { ActionSheet, Body, GroupLabel, Icon, IconTile, ListCard, Sheet, Text, Toggle, type IconName } from "../../ui";

const THEME_LABEL: Record<ThemePreference, string> = { system: "System", light: "Light", dark: "Dark" };

/* Design 43: Notifications / App / Account groups, toggles and values, version line. */
export const SettingsScreen = () => {
  const { colors, preference, setPreference } = useTheme();
  const { signOut } = useAuth();
  const settings = usePrefs();
  const pushStatus = usePushStatus();
  const navigation = useNavigation();
  const [themeOpen, setThemeOpen] = useState(false);
  const [accentOpen, setAccentOpen] = useState(false);
  const [idleOpen, setIdleOpen] = useState(false);
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
          {Platform.OS !== "web" && settings.push ? (
            <Row
              icon={pushStatus.state === "registered" ? "checkmark-circle" : "alert-circle"}
              label="This phone"
              value={pushStatusLabel(pushStatus)}
              chevron={pushStatus.state === "error" || pushStatus.state === "denied" || pushStatus.state === "idle"}
              onPress={
                pushStatus.state === "error" || pushStatus.state === "denied" || pushStatus.state === "idle"
                  ? () => {
                      setNote(null);
                      registerForPush()
                        .then((token) => token && setNote("This phone is set up for notifications."))
                        .catch(() => {});
                    }
                  : undefined
              }
            />
          ) : null}
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
        {settings.push && pushStatus.detail ? (
          <Text variant="small" color={pushStatus.state === "registered" ? "muted" : "danger"}>
            {pushStatus.detail}
          </Text>
        ) : null}
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
        <GroupLabel>Display</GroupLabel>
        <ListCard style={styles.card}>
          <Row icon="color-palette" label="Colour theme" value={ACCENTS.find((item) => item.id === settings.accent)?.label || "Classic Blue"} onPress={() => setAccentOpen(true)} />
          <Row icon="contrast" label="High contrast" right={<Toggle label="High contrast" value={settings.highContrast} onChange={(highContrast) => prefs.set({ highContrast })} />} />
          <Row icon="pause-circle" label="Reduce motion" right={<Toggle label="Reduce motion" value={settings.reduceMotion} onChange={(reduceMotion) => prefs.set({ reduceMotion })} />} />
          <Row icon="timer" label="Sign out when idle" value={idleLabel(settings.idleSignOutMinutes)} onPress={() => setIdleOpen(true)} />
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
          <Row icon="shield-checkmark" label="Privacy policy" chevron onPress={() => navigation.navigate("Legal", { doc: "privacy" })} />
          <Row icon="document-text" label="Terms and conditions" chevron onPress={() => navigation.navigate("Legal", { doc: "terms" })} />
          <Row icon="log-out" label={signingOut ? "Signing out…" : confirm ? "Tap again to sign out" : "Sign out"} danger onPress={signingOut ? undefined : onSignOut} />
        </ListCard>
      </View>

      <Text variant="mono" color={colors.textFaint} align="center" style={styles.version}>
        v{Constants.expoConfig?.version || "2.1.0"} · Office On Rent
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
      <ActionSheet
        visible={idleOpen}
        title="Sign out when idle"
        onClose={() => setIdleOpen(false)}
        actions={IDLE_SIGN_OUT_CHOICES.map((minutes) => ({
          key: String(minutes),
          label: idleLabel(minutes),
          icon: (minutes ? "timer-outline" : "infinite-outline") as IconName,
          hint: minutes === settings.idleSignOutMinutes ? "Current" : undefined,
          onPress: () => prefs.set({ idleSignOutMinutes: minutes }),
        }))}
      />
      <Sheet visible={accentOpen} title="Colour theme" subtitle="Recolours buttons, links and highlights on this phone." onClose={() => setAccentOpen(false)}>
        <ListCard>
          {ACCENTS.map((item) => {
            const active = item.id === settings.accent;
            return (
              <Pressable
                key={item.id}
                accessibilityRole="radio"
                accessibilityState={{ checked: active }}
                onPress={() => prefs.set({ accent: item.id })}
                style={({ pressed }) => [styles.accentRow, pressed && { backgroundColor: colors.surfaceAlt }]}
              >
                <View style={[styles.swatch, { backgroundColor: item.swatch }]} />
                <View style={styles.accentText}>
                  <Text variant="bodyStrong">{item.label}</Text>
                  <Text variant="tiny" color="muted">
                    {item.description}
                  </Text>
                </View>
                {active ? <Icon name="checkmark-circle" size={20} color={colors.primary} /> : null}
              </Pressable>
            );
          })}
        </ListCard>
      </Sheet>
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
  accentRow: { flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: 14, paddingVertical: 10 },
  swatch: { width: 26, height: 26, borderRadius: 13 },
  accentText: { flex: 1, minWidth: 0 },
});
