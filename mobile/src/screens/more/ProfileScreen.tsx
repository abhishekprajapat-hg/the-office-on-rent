import React, { useEffect, useLayoutEffect, useState } from "react";
import { ActivityIndicator, Image, Linking, Modal, Pressable, StyleSheet, View } from "react-native";
import { useNavigation } from "@react-navigation/native";
import { getLeaveBalance } from "../../api/attendance";
import { errorMessage, mediaUrl } from "../../api/client";
import { getMyProfile, updateMyProfile, type Profile } from "../../api/profile";
import { session } from "../../api/session";
import { useAuth } from "../../auth/AuthProvider";
import { AttachButton } from "../../components/AttachButton";
import { dialable, formatDate, formatWhen } from "../../lib/format";
import { validateNewLead } from "../../lib/leadForm";
import { isManagement, roleLabel } from "../../lib/roles";
import { useQuery } from "../../lib/useQuery";
import { useTheme } from "../../theme/ThemeProvider";
import { Avatar, Body, Button, Card, ErrorState, Field, GroupLabel, Icon, InlineError, ListCard, Loading, MiniStat, Text, type IconName } from "../../ui";

/* Same role-based numbers as the web profile's metric cards. */
const summaryCards = (role: string, summary: Record<string, number> = {}): { label: string; value: number }[] => {
  if (role === "ADMIN")
    return [
      { label: "Active users", value: summary.users ?? 0 },
      { label: "Managers", value: summary.managers ?? 0 },
      { label: "Executives", value: summary.executives ?? 0 },
      { label: "Field execs", value: summary.fieldExecutives ?? 0 },
      { label: "Leads", value: summary.leads ?? 0 },
      { label: "Inventory", value: summary.inventory ?? 0 },
    ];
  if (isManagement(role))
    return [
      { label: "Team", value: summary.teamMembers ?? 0 },
      { label: "Executives", value: summary.executives ?? 0 },
      { label: "Field team", value: summary.fieldExecutives ?? 0 },
      { label: "Partners", value: summary.channelPartners ?? 0 },
      { label: "Team leads", value: summary.teamLeads ?? 0 },
      { label: "Follow-ups today", value: summary.dueFollowUpsToday ?? 0 },
    ];
  return [
    { label: "Assigned", value: summary.assignedLeads ?? 0 },
    { label: "Open", value: summary.openLeads ?? 0 },
    { label: "Closed", value: summary.closedLeads ?? 0 },
    { label: "Follow-ups today", value: summary.dueFollowUpsToday ?? 0 },
  ];
};

/* Design 42: white header band with the avatar, a details list, plus the web profile's extras. */
export const ProfileScreen = () => {
  const navigation = useNavigation();
  const { colors } = useTheme();
  const { refreshUser } = useAuth();
  const { data, loading, error, refreshing, refresh, setData } = useQuery(async () => {
    const [profile, leave] = await Promise.all([getMyProfile(), getLeaveBalance().catch(() => null)]);
    if (!profile) throw new Error("Couldn't load your profile.");
    return { profile, leave };
  }, []);
  const profile = data?.profile;

  const [editing, setEditing] = useState(false);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [viewPhoto, setViewPhoto] = useState(false);

  useEffect(() => {
    if (profile && !editing) {
      setName(profile.name || "");
      setPhone(profile.phone || "");
    }
  }, [profile, editing]);

  useLayoutEffect(() => {
    navigation.setOptions({
      headerStyle: { backgroundColor: colors.surface },
      headerRight: () => (
        <Pressable accessibilityRole="button" hitSlop={8} onPress={() => setEditing((value) => !value)}>
          <Text variant="bodyStrong" color="primary" style={styles.headerAction}>
            {editing ? "Done" : "Edit"}
          </Text>
        </Pressable>
      ),
    });
  }, [navigation, colors.surface, editing]);

  if (loading) return <Loading />;
  if (error || !profile) return <ErrorState message={error || "Couldn't load your profile."} onRetry={refresh} />;

  const patchProfile = (patch: Partial<Profile>) => setData({ ...data!, profile: { ...profile, ...patch } });
  const syncStoredUser = async (patch: Record<string, string>) => {
    const stored = await session.getUser();
    if (stored) await session.setUser({ ...stored, ...patch });
    refreshUser();
  };

  // Same rules as a lead's contact details: a real name, and a 10-digit mobile if one is given.
  const checks = validateNewLead({ name, phone, email: "" });
  const problem = checks.name || (phone.trim() ? checks.phone : undefined);

  const save = async () => {
    if (problem) return setSaveError(problem);
    setSaving(true);
    setSaveError(null);
    try {
      const updated = await updateMyProfile({ name: name.trim(), phone: phone.trim() });
      patchProfile({ ...(updated || {}), name: name.trim(), phone: phone.trim() });
      await syncStoredUser({ name: name.trim(), phone: phone.trim() });
      setEditing(false);
      setNotice("Profile updated.");
    } catch (err) {
      setSaveError(errorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  const setPhoto = async (url: string) => {
    await updateMyProfile({ profileImageUrl: url });
    patchProfile({ profileImageUrl: url });
    await syncStoredUser({ profileImageUrl: url });
  };

  const manager = profile.manager || (profile.parentId ? { ...profile.parentId } : null);
  const cards = summaryCards(profile.role, profile.summary);
  if (profile.role !== "ADMIN" && data?.leave) cards.push({ label: "Leave left", value: data.leave.available });
  const rows: { icon: IconName; label: string; value?: string; onPress?: () => void }[] = [
    { icon: "mail-outline", label: "Email", value: profile.email },
    { icon: "call-outline", label: "Phone", value: profile.phone || "Not added" },
    {
      icon: "people-outline",
      label: "Reports to",
      value: manager?.name || "—",
      onPress: manager?.phone ? () => Linking.openURL(`tel:${dialable(manager.phone)}`) : manager?.email ? () => Linking.openURL(`mailto:${manager.email}`) : undefined,
    },
    { icon: "location-outline", label: "Office", value: profile.branch || "Not assigned" },
    { icon: "briefcase-outline", label: "Department", value: profile.department || "Not assigned" },
    { icon: "calendar-outline", label: "Joined", value: profile.joiningDate ? formatDate(profile.joiningDate) : "—" },
    { icon: "time-outline", label: "Shift", value: profile.shiftTiming || "—" },
  ];

  return (
    <Body refreshing={refreshing} onRefresh={refresh} style={styles.body}>
      <View style={[styles.band, { backgroundColor: colors.surface, borderBottomColor: colors.border }]}>
        <View>
          <Avatar name={profile.name} uri={profile.profileImageUrl} size={84} solid />
          <AttachButton
            category="profile-images"
            label="Profile photo"
            imagesOnly
            onUploaded={(file) => setPhoto(file.url)}
            extraActions={
              profile.profileImageUrl
                ? [
                    { key: "view", label: "View photo", icon: "eye-outline", onPress: () => setViewPhoto(true) },
                    { key: "remove", label: "Remove photo", icon: "trash-outline", destructive: true, onPress: () => setPhoto("").catch((err) => setSaveError(errorMessage(err))) },
                  ]
                : []
            }
            renderTrigger={(open, busy) => (
              <Pressable accessibilityRole="button" accessibilityLabel="Change profile photo" onPress={open} style={[styles.camera, { backgroundColor: colors.surface }]}>
                {busy ? <ActivityIndicator size="small" color={colors.primary} /> : <Icon name="camera" size={15} color={colors.primary} />}
              </Pressable>
            )}
          />
        </View>
        <Text variant="title" align="center" style={styles.name}>
          {profile.name}
        </Text>
        <Text variant="small" color="muted" style={styles.role}>
          {profile.customRoleName || roleLabel(profile.role)} · {profile.employeeId || profile.employeeCode}
        </Text>
      </View>

      <View style={styles.content}>
        {editing ? (
          <Card style={styles.form}>
            <Field label="Full name" value={name} onChangeText={setName} autoCapitalize="words" maxLength={80} />
            <Field label="Phone" value={phone} onChangeText={setPhone} keyboardType="phone-pad" maxLength={25} />
            <Text variant="small" color="faint">
              Email, role and work details are managed by your admin.
            </Text>
            <InlineError message={saveError} />
            <View style={styles.row}>
              <Button label="Cancel" variant="secondary" style={styles.flex} onPress={() => { setEditing(false); setSaveError(null); }} />
              <Button label="Save" icon="checkmark" style={styles.flex} loading={saving} onPress={save} />
            </View>
          </Card>
        ) : null}
        {notice && !editing ? (
          <Text variant="small" color="primary" align="center">
            {notice}
          </Text>
        ) : null}
        {!editing ? <InlineError message={saveError} /> : null}

        <ListCard>
          {rows.map((row) => (
            <Pressable key={row.label} disabled={!row.onPress} onPress={row.onPress} style={styles.info} accessibilityRole={row.onPress ? "button" : undefined}>
              <Icon name={row.icon} size={17} color={colors.textFaint} />
              <Text variant="small" color="muted" style={styles.infoLabel}>
                {row.label}
              </Text>
              <Text variant="smallStrong" style={styles.infoValue} numberOfLines={1}>
                {row.value || "—"}
              </Text>
            </Pressable>
          ))}
        </ListCard>

        <GroupLabel>At a glance</GroupLabel>
        <View style={styles.grid}>
          {cards.map((card) => (
            <View key={card.label} style={styles.cell}>
              <MiniStat value={card.value} label={card.label} />
            </View>
          ))}
        </View>

        <GroupLabel>Account</GroupLabel>
        <ListCard>
          <View style={styles.info}>
            <Icon name="shield-checkmark-outline" size={17} color={colors.textFaint} />
            <Text variant="small" color="muted" style={styles.infoLabel}>
              Status
            </Text>
            <Text variant="smallStrong" color={profile.isActive === false ? colors.danger : colors.success} style={styles.infoValue}>
              {profile.isActive === false ? "Inactive" : "Active"}
            </Text>
          </View>
          {profile.lastLoginAt ? (
            <View style={styles.info}>
              <Icon name="log-in-outline" size={17} color={colors.textFaint} />
              <Text variant="small" color="muted" style={styles.infoLabel}>
                Last sign-in
              </Text>
              <Text variant="smallStrong" style={styles.infoValue}>
                {formatWhen(profile.lastLoginAt)}
              </Text>
            </View>
          ) : null}
          {profile.createdAt ? (
            <View style={styles.info}>
              <Icon name="person-add-outline" size={17} color={colors.textFaint} />
              <Text variant="small" color="muted" style={styles.infoLabel}>
                Member since
              </Text>
              <Text variant="smallStrong" style={styles.infoValue}>
                {formatDate(profile.createdAt)}
              </Text>
            </View>
          ) : null}
          <Pressable onPress={() => navigation.navigate("Settings")} style={styles.info} accessibilityRole="button">
            <Icon name="settings-outline" size={17} color={colors.textFaint} />
            <Text variant="small" color="muted" style={styles.infoLabel}>
              Settings
            </Text>
            <Text variant="smallStrong" style={styles.infoValue}>
              Notifications, theme
            </Text>
            <Icon name="chevron-forward" size={15} color={colors.textFaint} />
          </Pressable>
        </ListCard>
      </View>

      <Modal visible={viewPhoto} transparent animationType="fade" onRequestClose={() => setViewPhoto(false)}>
        <Pressable style={[styles.photoBackdrop, { backgroundColor: colors.overlay }]} onPress={() => setViewPhoto(false)} accessibilityLabel="Close photo">
          {profile.profileImageUrl ? <Image source={{ uri: mediaUrl(profile.profileImageUrl) }} style={styles.photo} resizeMode="contain" /> : null}
        </Pressable>
      </Modal>
    </Body>
  );
};

const styles = StyleSheet.create({
  flex: { flex: 1 },
  body: { paddingHorizontal: 0, paddingTop: 0, gap: 0 },
  headerAction: { fontSize: 13, fontFamily: "PlusJakartaSans_800ExtraBold" },
  band: { alignItems: "center", gap: 6, paddingTop: 12, paddingBottom: 18, borderBottomWidth: 1 },
  camera: {
    position: "absolute",
    right: -4,
    bottom: -4,
    width: 30,
    height: 30,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#0e1630",
    shadowOpacity: 0.15,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 3,
  },
  name: { fontSize: 19 },
  role: { fontSize: 12.5 },
  content: { padding: 14, gap: 12 },
  form: { gap: 12 },
  row: { flexDirection: "row", gap: 8 },
  info: { flexDirection: "row", alignItems: "center", gap: 10, minHeight: 48, paddingHorizontal: 14 },
  infoLabel: { flex: 1, fontSize: 12.5 },
  infoValue: { fontSize: 12.5, maxWidth: "62%", textAlign: "right" },
  grid: { flexDirection: "row", flexWrap: "wrap", marginHorizontal: -3 },
  cell: { width: "33.33%", padding: 3 },
  photoBackdrop: { flex: 1, alignItems: "center", justifyContent: "center", padding: 20 },
  photo: { width: "100%", height: "70%" },
});
