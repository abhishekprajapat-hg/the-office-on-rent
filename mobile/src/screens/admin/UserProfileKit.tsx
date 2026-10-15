import React, { useEffect, useMemo, useState } from "react";
import { StyleSheet, View } from "react-native";
import { errorMessage } from "../../api/client";
import { updateUserByAdmin, type AdminProfileView } from "../../api/admin";
import type { AttendanceSummary, LeaveBalance } from "../../api/attendance";
import type { TeamUser } from "../../api/users";
import { formatMinutes } from "../../lib/format";
import { ROLE_LABELS } from "../../lib/roles";
import {
  BUSINESS_CATEGORIES,
  PARENT_ROLES,
  profileDraftError,
  profileDraftFrom,
  profilePatch,
  reportingCandidates,
  targetProgress,
  type ProfileDraft,
} from "../../lib/userAdmin";
import { useTheme } from "../../theme/ThemeProvider";
import { Button, Field, InlineError, MiniStat, ProgressBar, Segmented, Select, Sheet, Text, Toggle } from "../../ui";

/*
 * The parts of web UserDetailsEditor the mobile person page was missing:
 * editing someone's employment details, and the at-a-glance numbers.
 */

type Profile = AdminProfileView["profile"];

/* "Edit details" (web UserDetailsEditor form): contact, business category, who they report to, employment and, for a channel partner, inventory access and brokerage. */
export const EditDetailsSheet = ({
  visible,
  person,
  role,
  users,
  onClose,
  onSaved,
}: {
  visible: boolean;
  person: Profile;
  /* Their saved role: who they may report to follows it (a role change on the page is saved on its own). */
  role: string;
  users: TeamUser[];
  onClose: () => void;
  onSaved: () => void;
}) => {
  const { colors } = useTheme();
  const [draft, setDraft] = useState<ProfileDraft>(() => profileDraftFrom(person));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!visible) return;
    setDraft(profileDraftFrom(person));
    setError(null);
  }, [visible, person]);

  const set = <K extends keyof ProfileDraft>(key: K, value: ProfileDraft[K]) => setDraft((prev) => ({ ...prev, [key]: value }));
  const parents = PARENT_ROLES[role] || [];
  const candidates = useMemo(() => reportingCandidates(users, role, person._id), [users, role, person._id]);
  const partner = role === "CHANNEL_PARTNER";

  const save = async () => {
    const problem = profileDraftError(draft, role);
    if (problem) return setError(problem);
    setBusy(true);
    setError(null);
    try {
      await updateUserByAdmin(person._id, profilePatch(draft, role));
      onSaved();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Sheet visible={visible} title="Edit details" subtitle={person.name} onClose={onClose} footer={<Button label="Save details" icon="checkmark" loading={busy} onPress={save} />}>
      <Field label="Full name" value={draft.name} onChangeText={(value) => set("name", value)} placeholder="Full name" />
      <Field label="Email" value={draft.email} onChangeText={(value) => set("email", value)} autoCapitalize="none" keyboardType="email-address" placeholder="name@company.com" />
      <Field label="Phone" value={draft.phone} onChangeText={(value) => set("phone", value)} keyboardType="phone-pad" placeholder="Optional" />

      <Select label="Business category" options={BUSINESS_CATEGORIES.map((item) => ({ key: item.key, label: item.label }))} value={draft.roleType} onChange={(key) => set("roleType", key)} />

      {parents.length ? (
        <>
          {candidates.length ? (
            <Select
              label={`Reports to (${parents.map((key) => ROLE_LABELS[key as keyof typeof ROLE_LABELS] || key).join(" or ")})`}
              placeholder="Choose a person"
              icon="git-network-outline"
              options={candidates.map((user) => ({ key: user._id, label: user.name, hint: ROLE_LABELS[user.role as keyof typeof ROLE_LABELS] || user.role }))}
              value={draft.reportingToId}
              onChange={(key) => set("reportingToId", key)}
            />
          ) : (
            <Text variant="small" color={colors.warning}>
              No active {parents.map((key) => (ROLE_LABELS[key as keyof typeof ROLE_LABELS] || key).toLowerCase()).join(" or ")} to report to.
            </Text>
          )}
        </>
      ) : null}

      <View style={styles.row}>
        <View style={styles.half}>
          <Field label="Department" value={draft.department} onChangeText={(value) => set("department", value)} placeholder="Sales" />
        </View>
        <View style={styles.half}>
          <Field label="Branch" value={draft.branch} onChangeText={(value) => set("branch", value)} placeholder="Andheri" />
        </View>
      </View>
      <View style={styles.row}>
        <View style={styles.half}>
          <Field label="Shift" value={draft.shiftTiming} onChangeText={(value) => set("shiftTiming", value)} placeholder="10:00 – 19:00" />
        </View>
        <View style={styles.half}>
          <Field label="Monthly target" value={draft.monthlyTarget} onChangeText={(value) => set("monthlyTarget", value.replace(/[^\d.]/g, ""))} keyboardType="numeric" placeholder="10" />
        </View>
      </View>

      {partner ? (
        <>
          <View style={[styles.toggleRow, { borderColor: colors.border }]}>
            <View style={styles.flex}>
              <Text variant="bodyStrong">Can view inventory</Text>
              <Text variant="tiny" color="muted">
                Lets the partner browse listings to pitch them.
              </Text>
            </View>
            <Toggle value={draft.canViewInventory} label="Can view inventory" onChange={(value) => set("canViewInventory", value)} />
          </View>
          <Text variant="smallStrong" color="muted">
            Brokerage
          </Text>
          <Segmented
            options={[
              { key: "FLAT", label: "Flat per deal" },
              { key: "PERCENTAGE", label: "% of sell value" },
            ]}
            value={draft.brokerageMode}
            onChange={(mode) => set("brokerageMode", mode)}
          />
          <Field
            label={draft.brokerageMode === "PERCENTAGE" ? "Percentage" : "Amount (₹)"}
            value={draft.brokerageValue}
            onChangeText={(value) => set("brokerageValue", value.replace(/[^\d.]/g, ""))}
            keyboardType="numeric"
            suffix={draft.brokerageMode === "PERCENTAGE" ? "%" : undefined}
          />
          <Field label="Notes" value={draft.brokerageNotes} onChangeText={(value) => set("brokerageNotes", value.slice(0, 240))} placeholder="Optional" multiline />
        </>
      ) : null}
      <InlineError message={error} />
    </Sheet>
  );
};

/* The numbers the web page leads with: this month's attendance, task load, target, leave and leads. */
export const AtAGlance = ({
  attendance,
  tasks,
  target,
  leave,
  leads,
}: {
  attendance: AttendanceSummary | null;
  tasks: { total: number; completed: number; overdue: number; completionRate: number } | null;
  target: { target: number; achieved: number | null };
  leave: LeaveBalance | null;
  leads: AdminProfileView["performance"];
}) => {
  const { colors } = useTheme();
  const progress = target.achieved === null ? null : targetProgress(target.target, target.achieved);
  return (
    <View style={styles.glance}>
      {attendance ? (
        <Block title="Attendance this month" note={attendance.attendancePercent !== undefined ? `${Math.round(Number(attendance.attendancePercent) || 0)}% present` : undefined}>
          <View style={styles.strip}>
            <MiniStat value={Number(attendance.presentDays || 0)} label="Present" tone="success" tinted />
            <MiniStat value={Number(attendance.lateDays || 0)} label="Late" tone="warning" tinted />
            <MiniStat value={Number(attendance.absentDays || 0)} label="Absent" tone="danger" tinted />
            <MiniStat value={Number(attendance.leaveDays || 0)} label="Leave" tone="info" tinted />
          </View>
          {attendance.totalWorkedMinutes ? (
            <Text variant="tiny" color="muted">
              {formatMinutes(attendance.totalWorkedMinutes)} worked
              {attendance.punctualityPercent !== undefined ? ` · ${Math.round(Number(attendance.punctualityPercent) || 0)}% on time` : ""}
            </Text>
          ) : null}
        </Block>
      ) : null}
      {tasks ? (
        <Block title="Tasks" note={tasks.total ? `${tasks.completionRate}% done` : "None assigned"}>
          <View style={styles.strip}>
            <MiniStat value={tasks.total} label="Total" />
            <MiniStat value={tasks.completed} label="Done" tone="success" tinted />
            <MiniStat value={tasks.total - tasks.completed} label="Open" />
            <MiniStat value={tasks.overdue} label="Overdue" tone={tasks.overdue ? "danger" : undefined} tinted={Boolean(tasks.overdue)} />
          </View>
        </Block>
      ) : null}
      {progress ? (
        <Block title="Monthly target" note={`${progress.percent}%`}>
          <ProgressBar value={progress.percent / 100} color={progress.percent >= 100 ? colors.success : colors.primary} height={8} />
          <Text variant="tiny" color="muted">
            {progress.achieved} of {progress.target} closed · {progress.remaining} to go
          </Text>
        </Block>
      ) : null}
      {leads && Number(leads.totalLeads || 0) > 0 ? (
        <Block title="Leads" note={`${Math.round(Number(leads.conversionRate || 0))}% converted`}>
          <View style={styles.strip}>
            <MiniStat value={Number(leads.totalLeads || 0)} label="Leads" />
            <MiniStat value={Number(leads.closedLeads || 0)} label="Closed" tone="success" tinted />
            <MiniStat value={Number(leads.siteVisits || 0)} label="Visits" />
            <MiniStat value={Number(leads.overdueFollowUps || 0)} label="Overdue" tone={leads.overdueFollowUps ? "danger" : undefined} tinted={Boolean(leads.overdueFollowUps)} />
          </View>
        </Block>
      ) : null}
      {leave ? (
        <Block title="Leave balance">
          <View style={styles.strip}>
            <MiniStat value={leave.available} label="Available" tone="success" tinted />
            <MiniStat value={leave.used} label="Used" />
            <MiniStat value={leave.pending} label="Pending" tone={leave.pending ? "warning" : undefined} tinted={Boolean(leave.pending)} />
          </View>
        </Block>
      ) : null}
    </View>
  );
};

const Block = ({ title, note, children }: { title: string; note?: string; children: React.ReactNode }) => {
  const { colors } = useTheme();
  return (
    <View style={[styles.block, { backgroundColor: colors.surface, borderColor: colors.border }]}>
      <View style={styles.blockHead}>
        <Text variant="smallStrong" style={styles.flex}>
          {title}
        </Text>
        {note ? (
          <Text variant="tiny" color="muted">
            {note}
          </Text>
        ) : null}
      </View>
      {children}
    </View>
  );
};

const styles = StyleSheet.create({
  flex: { flex: 1, minWidth: 0 },
  row: { flexDirection: "row", gap: 10 },
  half: { flex: 1 },
  toggleRow: { flexDirection: "row", alignItems: "center", gap: 12, borderWidth: 1, borderRadius: 12, padding: 12 },
  glance: { gap: 10 },
  block: { borderWidth: 1, borderRadius: 16, padding: 12, gap: 8 },
  blockHead: { flexDirection: "row", alignItems: "center", gap: 8 },
  strip: { flexDirection: "row", gap: 6 },
});
