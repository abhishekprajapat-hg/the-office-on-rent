import React, { useEffect, useState } from "react";
import { StyleSheet, View } from "react-native";
import { errorMessage } from "../../api/client";
import { getMyProfile, updateMyProfile } from "../../api/profile";
import { session } from "../../api/session";
import { useAuth } from "../../auth/AuthProvider";
import { AttachButton } from "../../components/AttachButton";
import { formatDate } from "../../lib/format";
import { validateNewLead } from "../../lib/leadForm";
import { roleLabel } from "../../lib/roles";
import { useQuery } from "../../lib/useQuery";
import { useTheme } from "../../theme/ThemeProvider";
import { space } from "../../theme/tokens";
import { Avatar, Body, Button, Card, ErrorState, Field, Icon, InlineError, Loading, SectionTitle, Text, type IconName } from "../../ui";

export const ProfileScreen = () => {
  const { colors } = useTheme();
  const { refreshUser } = useAuth();
  const { data: profile, loading, error, refreshing, refresh, setData } = useQuery(async () => {
    const result = await getMyProfile();
    if (!result) throw new Error("Couldn't load your profile.");
    return result;
  }, []);

  const [editing, setEditing] = useState(false);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (profile && !editing) {
      setName(profile.name || "");
      setPhone(profile.phone || "");
    }
  }, [profile, editing]);

  if (loading) return <Loading />;
  if (error || !profile) return <ErrorState message={error || "Couldn't load your profile."} onRetry={refresh} />;

  // Same rules as a lead's contact details: a real name, and a 10-digit mobile if one is given.
  const checks = validateNewLead({ name, phone, email: "" });
  const problem = checks.name || (phone.trim() ? checks.phone : undefined);

  const save = async () => {
    if (problem) return setSaveError(problem);
    setSaving(true);
    setSaveError(null);
    try {
      const updated = await updateMyProfile({ name: name.trim(), phone: phone.trim() });
      setData({ ...profile, ...(updated || {}), name: name.trim(), phone: phone.trim() });
      // Keep the signed-in user (greeting, avatar) in step with the edit.
      const stored = await session.getUser();
      if (stored) await session.setUser({ ...stored, name: name.trim(), phone: phone.trim() });
      refreshUser();
      setEditing(false);
      setSaved(true);
    } catch (err) {
      setSaveError(errorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Body refreshing={refreshing} onRefresh={refresh}>
      <Card style={styles.hero}>
        <Avatar name={profile.name} uri={profile.profileImageUrl} size={84} />
        <AttachButton
          category="profile-images"
          label={profile.profileImageUrl ? "Change photo" : "Add photo"}
          imagesOnly
          onUploaded={async (file) => {
            await updateMyProfile({ profileImageUrl: file.url });
            setData({ ...profile, profileImageUrl: file.url });
            const stored = await session.getUser();
            if (stored) await session.setUser({ ...stored, profileImageUrl: file.url });
            refreshUser();
          }}
        />
        <Text variant="title" align="center">
          {profile.name}
        </Text>
        <Text variant="small" color="muted">
          {roleLabel(profile.role)}
          {profile.employeeCode ? ` · ${profile.employeeCode}` : ""}
        </Text>
      </Card>

      {editing ? (
        <Card style={styles.form}>
          <Field label="Name" value={name} onChangeText={setName} autoCapitalize="words" />
          <Field label="Phone" value={phone} onChangeText={setPhone} keyboardType="phone-pad" />
          <InlineError message={saveError} />
          <View style={styles.row}>
            <Button
              label="Cancel"
              variant="secondary"
              style={styles.flex}
              onPress={() => {
                setEditing(false);
                setSaveError(null);
              }}
            />
            <Button label="Save" icon="checkmark" style={styles.flex} loading={saving} onPress={save} />
          </View>
        </Card>
      ) : (
        <>
          {saved ? (
            <Text variant="small" color="primary" align="center">
              Profile updated.
            </Text>
          ) : null}
          <Button
            label="Edit name and phone"
            icon="create-outline"
            variant="secondary"
            onPress={() => {
              setSaved(false);
              setEditing(true);
            }}
          />
        </>
      )}

      <SectionTitle title="Contact" />
      <Card style={styles.rows}>
        <Info icon="mail-outline" label="Email" value={profile.email} />
        <Info icon="call-outline" label="Phone" value={profile.phone} last />
      </Card>

      <SectionTitle title="Work" />
      <Card style={styles.rows}>
        <Info icon="briefcase-outline" label="Department" value={profile.department} />
        <Info icon="business-outline" label="Branch" value={profile.branch} />
        <Info icon="time-outline" label="Shift" value={profile.shiftTiming} />
        <Info icon="calendar-outline" label="Joined" value={profile.joiningDate ? formatDate(profile.joiningDate) : undefined} />
        <View style={styles.info}>
          <Icon name="people-outline" size={18} color={colors.textMuted} />
          <Text variant="small" color="muted" style={styles.label}>
            Reports to
          </Text>
          <View style={styles.manager}>
            {profile.parentId ? <Avatar name={profile.parentId.name} uri={profile.parentId.profileImageUrl} size={24} /> : null}
            <Text variant="small" color={profile.parentId ? "text" : "faint"} numberOfLines={1}>
              {profile.parentId?.name || "—"}
            </Text>
          </View>
        </View>
      </Card>
      <Text variant="tiny" color="faint" align="center">
        Work details are managed by your admin.
      </Text>
    </Body>
  );
};

const Info = ({ icon, label, value, last }: { icon: IconName; label: string; value?: string; last?: boolean }) => {
  const { colors } = useTheme();
  return (
    <View style={[styles.info, !last && { borderBottomColor: colors.border, borderBottomWidth: StyleSheet.hairlineWidth }]}>
      <Icon name={icon} size={18} color={colors.textMuted} />
      <Text variant="small" color="muted" style={styles.label}>
        {label}
      </Text>
      <Text variant="small" color={value ? "text" : "faint"} style={styles.value} numberOfLines={1}>
        {value || "—"}
      </Text>
    </View>
  );
};

const styles = StyleSheet.create({
  flex: { flex: 1 },
  hero: { alignItems: "center", gap: space.xs, paddingVertical: space.xl },
  form: { gap: space.md },
  row: { flexDirection: "row", gap: space.md },
  rows: { paddingVertical: space.xs },
  info: { flexDirection: "row", alignItems: "center", gap: space.md, paddingVertical: space.md },
  label: { width: 88 },
  value: { flex: 1, textAlign: "right" },
  manager: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "flex-end", gap: space.sm },
});
