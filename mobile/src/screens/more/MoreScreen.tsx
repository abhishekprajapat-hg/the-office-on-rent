import React, { useState } from "react";
import { Linking, Pressable, StyleSheet, View } from "react-native";
import Constants from "expo-constants";
import { useNavigation } from "@react-navigation/native";
import { errorMessage, webOrigin } from "../../api/client";
import { sendTestPush } from "../../notifications/pushRegistration";
import { Platform } from "react-native";
import { useAuth, useUser } from "../../auth/AuthProvider";
import { canUseInventory, canUseLeads, canUseTasks, isManagement, roleLabel } from "../../lib/roles";
import { useTheme, type ThemePreference } from "../../theme/ThemeProvider";
import { radius, space } from "../../theme/tokens";
import { Avatar, Button, Card, Icon, Screen, SectionTitle, Text, type IconName } from "../../ui";


const THEMES: { key: ThemePreference; label: string; icon: IconName }[] = [
  { key: "system", label: "System", icon: "phone-portrait-outline" },
  { key: "light", label: "Light", icon: "sunny-outline" },
  { key: "dark", label: "Dark", icon: "moon-outline" },
];

export const MoreScreen = () => {
  const user = useUser();
  const { signOut } = useAuth();
  const navigation = useNavigation();
  const { colors, preference, setPreference } = useTheme();
  const [signingOut, setSigningOut] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const [pushNote, setPushNote] = useState<string | null>(null);

  const onSignOut = async () => {
    // Two taps, so a stray touch at the bottom of the screen doesn't sign anyone out.
    if (!confirm) {
      setConfirm(true);
      setTimeout(() => setConfirm(false), 4000);
      return;
    }
    setSigningOut(true);
    await signOut();
  };

  return (
    <Screen title="More">
      <Card onPress={() => navigation.navigate("Profile")} style={styles.profile} accessibilityLabel="Open profile">
        <Avatar name={user.name} uri={user.profileImageUrl} size={56} />
        <View style={styles.flex}>
          <Text variant="heading">{user.name}</Text>
          <Text variant="small" color="muted">
            {roleLabel(user.role)}
          </Text>
          <Text variant="tiny" color="faint" numberOfLines={1}>
            {user.email}
          </Text>
        </View>
        <Icon name="chevron-forward" size={18} color={colors.textFaint} />
      </Card>

      <SectionTitle title="Workspace" />
      <Card style={styles.rows}>
        {isManagement(user.role) ? <Row icon="checkmark-done-circle-outline" label="Approvals" onPress={() => navigation.navigate("Approvals")} chevron /> : null}
        <Row icon="chatbubbles-outline" label="Chats" onPress={() => navigation.navigate("Chats")} chevron />
        {canUseLeads(user.role) || canUseTasks(user.role) ? (
          <Row icon="calendar-outline" label="Schedule" onPress={() => navigation.navigate("Schedule")} chevron last={!canUseInventory(user.role, user.canViewInventory)} />
        ) : null}
        {canUseInventory(user.role, user.canViewInventory) ? (
          <Row icon="business-outline" label="Inventory" onPress={() => navigation.navigate("Inventory")} chevron last />
        ) : null}
      </Card>

      <SectionTitle title="Appearance" />
      <View style={[styles.segment, { backgroundColor: colors.surfaceAlt }]}>
        {THEMES.map((item) => {
          const active = item.key === preference;
          return (
            <Pressable
              key={item.key}
              accessibilityRole="radio"
              accessibilityState={{ selected: active }}
              accessibilityLabel={`${item.label} theme`}
              onPress={() => setPreference(item.key)}
              style={[styles.segmentItem, active && { backgroundColor: colors.surface }]}
            >
              <Icon name={item.icon} size={18} color={active ? colors.primary : colors.textMuted} />
              <Text variant="smallStrong" color={active ? "text" : "muted"}>
                {item.label}
              </Text>
            </Pressable>
          );
        })}
      </View>

      {Platform.OS !== "web" ? (
        <>
          <SectionTitle title="Notifications" />
          <Card style={styles.rows}>
            <Row
              icon="notifications-outline"
              label="Send a test notification"
              chevron
              last
              onPress={() => {
                setPushNote(null);
                sendTestPush()
                  .then((res) => setPushNote(res?.message || "Sent. It should arrive in a few seconds."))
                  .catch((err) => setPushNote(errorMessage(err)));
              }}
            />
          </Card>
          {pushNote ? (
            <Text variant="small" color="muted">
              {pushNote}
            </Text>
          ) : null}
        </>
      ) : null}

      <SectionTitle title="About" />
      <Card style={styles.rows}>
        <Row icon="shield-checkmark-outline" label="Privacy policy" onPress={() => Linking.openURL(`${webOrigin()}/privacy-policy`)} />
        <Row icon="document-text-outline" label="Terms and conditions" onPress={() => Linking.openURL(`${webOrigin()}/terms-and-conditions`)} />
        <Row icon="information-circle-outline" label="Version" value={Constants.expoConfig?.version || "2.0.0"} last />
      </Card>

      <Button
        label={confirm ? "Tap again to sign out" : "Sign out"}
        icon="log-out-outline"
        variant="danger"
        loading={signingOut}
        onPress={onSignOut}
      />
    </Screen>
  );
};

const Row = ({ icon, label, value, onPress, last, chevron }: { icon: IconName; label: string; value?: string; onPress?: () => void; last?: boolean; chevron?: boolean }) => {
  const { colors } = useTheme();
  return (
    <Pressable
      accessibilityRole={onPress ? (chevron ? "button" : "link") : undefined}
      disabled={!onPress}
      onPress={onPress}
      style={({ pressed }) => [
        styles.row,
        !last && { borderBottomColor: colors.border, borderBottomWidth: StyleSheet.hairlineWidth },
        pressed && { opacity: 0.6 },
      ]}
    >
      <Icon name={icon} size={20} color={colors.textMuted} />
      <Text variant="body" style={styles.flex}>
        {label}
      </Text>
      {value ? (
        <Text variant="small" color="muted">
          {value}
        </Text>
      ) : (
        <Icon name={chevron ? "chevron-forward" : "open-outline"} size={chevron ? 18 : 16} color={colors.textFaint} />
      )}
    </Pressable>
  );
};

const styles = StyleSheet.create({
  flex: { flex: 1 },
  profile: { flexDirection: "row", alignItems: "center", gap: space.md },
  segment: { flexDirection: "row", borderRadius: radius.md, padding: 3 },
  segmentItem: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, paddingVertical: 10, borderRadius: radius.sm },
  rows: { paddingVertical: space.xs },
  row: { flexDirection: "row", alignItems: "center", gap: space.md, paddingVertical: space.md },
});
