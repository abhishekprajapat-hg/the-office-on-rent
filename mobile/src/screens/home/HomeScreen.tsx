import React from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { useNavigation } from "@react-navigation/native";
import { getMyAttendance } from "../../api/attendance";
import { getLeadSummary, getTodayFollowUps } from "../../api/leads";
import { listTasks } from "../../api/tasks";
import { useUser } from "../../auth/AuthProvider";
import { LeadRow } from "../../components/LeadRow";
import { TaskRow } from "../../components/TaskRow";
import { dayPhase, PHASE_LABEL, workedMinutesSoFar } from "../../lib/attendanceState";
import { firstName, formatMinutes, formatTime, greeting } from "../../lib/format";
import { countByStage, LEAD_STAGES } from "../../lib/leadStatus";
import { canMarkAttendance, canUseLeads, canUseTasks, roleLabel } from "../../lib/roles";
import { sortTasks } from "../../lib/taskMeta";
import { useQuery } from "../../lib/useQuery";
import { useTheme } from "../../theme/ThemeProvider";
import { radius, space, toneColors, type Tone } from "../../theme/tokens";
import { Avatar, Card, EmptyState, Icon, Loading, Screen, SectionTitle, Text, type IconName } from "../../ui";

/* Settles each source separately, so one module the role can't open doesn't blank the dashboard. */
const settle = <T,>(promise: Promise<T>) => promise.catch(() => null);

export const HomeScreen = () => {
  const user = useUser();
  const navigation = useNavigation();
  const { colors } = useTheme();
  const role = user.role;
  const userId = user.id || user._id;

  const { data, loading, refreshing, refresh } = useQuery(async () => {
    const [summary, followUps, tasks, attendance] = await Promise.all([
      canUseLeads(role) ? settle(getLeadSummary()) : null,
      canUseLeads(role) ? settle(getTodayFollowUps(5)) : null,
      // The same "for me" query the Tasks tab makes, so the two never disagree.
      canUseTasks(role) && userId ? settle(listTasks({ assignedTo: userId })) : null,
      canMarkAttendance(role) ? settle(getMyAttendance()) : null,
    ]);
    const myOpenTasks = sortTasks((tasks || []).filter((task) => task.status !== "COMPLETED")).slice(0, 3);
    return { summary, followUps, myOpenTasks, attendance };
  }, [role, userId]);

  const goTab = (tab: "Leads" | "Tasks" | "Attendance" | "More") => navigation.navigate("Tabs", { screen: tab });

  const summary = data?.summary;
  const stages = countByStage(summary?.byStatus);
  const stageMax = Math.max(1, ...Object.values(stages));
  const conversion = summary && summary.total ? Math.round((summary.closed / summary.total) * 100) : 0;

  return (
    <Screen refreshing={refreshing} onRefresh={refresh}>
      <View style={styles.header}>
        <View style={styles.headerText}>
          <Text variant="small" color="muted">
            {greeting()}
          </Text>
          <Text variant="display" numberOfLines={1}>
            {firstName(user.name) || "Welcome"}
          </Text>
          <Text variant="small" color="faint">
            {roleLabel(role)}
          </Text>
        </View>
        <Pressable accessibilityRole="button" accessibilityLabel="Open profile" onPress={() => navigation.navigate("Profile")}>
          <Avatar name={user.name} uri={user.profileImageUrl || undefined} size={48} />
        </Pressable>
      </View>

      {loading ? (
        <View style={styles.loading}>
          <Loading />
        </View>
      ) : (
        <>
          {data?.attendance ? (
            <AttendanceStrip
              phase={dayPhase(data.attendance.today)}
              checkInAt={data.attendance.today?.checkInAt}
              worked={workedMinutesSoFar(data.attendance.today)}
              onPress={() => goTab("Attendance")}
            />
          ) : null}

          {summary ? (
            <View style={styles.grid}>
              <StatTile icon="people" tone="primary" label="Open leads" value={summary.open} hint={`${summary.total} total`} onPress={() => goTab("Leads")} />
              <StatTile
                icon="alarm"
                tone={summary.overdueFollowUps ? "danger" : "warning"}
                label="Follow-ups due"
                value={summary.followUpsDue}
                hint={summary.overdueFollowUps ? `${summary.overdueFollowUps} overdue` : `${summary.followUpsToday} today`}
                onPress={() => goTab("Leads")}
              />
              <StatTile icon="call" tone="info" label="First calls pending" value={summary.pendingFirstCalls} hint="New, not yet contacted" onPress={() => goTab("Leads")} />
              <StatTile icon="trophy" tone="success" label="Closed" value={summary.closed} hint={`${conversion}% conversion`} onPress={() => goTab("Leads")} />
            </View>
          ) : null}

          {data?.followUps ? (
            <>
              <SectionTitle title="Today's follow-ups" action="Schedule" onAction={() => navigation.navigate("Schedule")} />
              {data.followUps.length ? (
                <View style={styles.list}>
                  {data.followUps.map((lead) => (
                    <LeadRow key={lead._id} lead={lead} onPress={() => navigation.navigate("LeadDetail", { leadId: lead._id, name: lead.name })} />
                  ))}
                </View>
              ) : (
                <Card>
                  <InlineEmpty icon="checkmark-done" text="No follow-ups due today." />
                </Card>
              )}
            </>
          ) : null}

          {canUseTasks(role) ? (
            <>
              <SectionTitle title="My open tasks" action="All tasks" onAction={() => goTab("Tasks")} />
              {data?.myOpenTasks.length ? (
                <View style={styles.list}>
                  {data.myOpenTasks.map((task) => (
                    <TaskRow key={task._id} task={task} onPress={() => navigation.navigate("TaskDetail", { taskId: task._id })} />
                  ))}
                </View>
              ) : (
                <Card>
                  <InlineEmpty icon="sparkles" text="You're all caught up." />
                </Card>
              )}
            </>
          ) : null}

          {summary ? (
            <>
              <SectionTitle title="Pipeline" />
              <Card style={styles.pipeline}>
                {LEAD_STAGES.map((stage) => (
                  <View key={stage.key} style={styles.stageRow}>
                    <Text variant="small" color="muted" style={styles.stageLabel}>
                      {stage.label}
                    </Text>
                    <View style={[styles.track, { backgroundColor: colors.surfaceAlt }]}>
                      <View
                        style={[
                          styles.fill,
                          {
                            backgroundColor: stage.key === "CLOSED" ? colors.success : colors.primary,
                            width: `${Math.max(2, (stages[stage.key] / stageMax) * 100)}%`,
                          },
                        ]}
                      />
                    </View>
                    <Text variant="smallStrong" style={styles.stageCount}>
                      {stages[stage.key]}
                    </Text>
                  </View>
                ))}
              </Card>
            </>
          ) : null}

          {!summary && !data?.attendance && !canUseTasks(role) ? (
            <EmptyState icon="grid-outline" title="Nothing to show yet" message="Open More to find the modules your role uses." />
          ) : null}
        </>
      )}
    </Screen>
  );
};

const AttendanceStrip = ({
  phase,
  checkInAt,
  worked,
  onPress,
}: {
  phase: ReturnType<typeof dayPhase>;
  checkInAt?: string | null;
  worked: number;
  onPress: () => void;
}) => {
  const { colors } = useTheme();
  const tone: Tone = phase === "working" ? "success" : phase === "on_break" ? "warning" : phase === "done" ? "neutral" : "primary";
  const { fg, bg } = toneColors(colors, tone);
  const detail =
    phase === "not_started"
      ? "Tap to check in for today"
      : phase === "done"
        ? `Worked ${formatMinutes(worked)} today`
        : `Since ${formatTime(checkInAt)} · ${formatMinutes(worked)} worked`;
  return (
    <Card onPress={onPress} style={styles.strip} accessibilityLabel={`Attendance: ${PHASE_LABEL[phase]}`}>
      <View style={[styles.stripIcon, { backgroundColor: bg }]}>
        <Icon name={phase === "on_break" ? "cafe" : phase === "done" ? "moon" : "finger-print"} size={22} color={fg} />
      </View>
      <View style={styles.flex}>
        <Text variant="bodyStrong">{PHASE_LABEL[phase]}</Text>
        <Text variant="small" color="muted">
          {detail}
        </Text>
      </View>
      {phase === "not_started" ? (
        <View style={[styles.pill, { backgroundColor: colors.primary }]}>
          <Text variant="smallStrong" color="onPrimary">
            Check in
          </Text>
        </View>
      ) : (
        <Icon name="chevron-forward" size={18} color={colors.textFaint} />
      )}
    </Card>
  );
};

const StatTile = ({
  icon,
  tone,
  label,
  value,
  hint,
  onPress,
}: {
  icon: IconName;
  tone: Tone;
  label: string;
  value: number;
  hint?: string;
  onPress?: () => void;
}) => {
  const { colors } = useTheme();
  const { fg, bg } = toneColors(colors, tone);
  return (
    <Card onPress={onPress} style={styles.tile} accessibilityLabel={`${label}: ${value}`}>
      <View style={[styles.tileIcon, { backgroundColor: bg }]}>
        <Icon name={icon} size={18} color={fg} />
      </View>
      <Text variant="title">{value.toLocaleString("en-IN")}</Text>
      <Text variant="smallStrong" numberOfLines={1}>
        {label}
      </Text>
      {hint ? (
        <Text variant="tiny" color={tone === "danger" ? colors.danger : colors.textFaint} numberOfLines={1}>
          {hint}
        </Text>
      ) : null}
    </Card>
  );
};

const InlineEmpty = ({ icon, text }: { icon: IconName; text: string }) => {
  const { colors } = useTheme();
  return (
    <View style={styles.inlineEmpty}>
      <Icon name={icon} size={18} color={colors.primary} />
      <Text variant="small" color="muted">
        {text}
      </Text>
    </View>
  );
};

const styles = StyleSheet.create({
  flex: { flex: 1 },
  header: { flexDirection: "row", alignItems: "center", paddingTop: space.md, gap: space.md },
  headerText: { flex: 1 },
  loading: { paddingVertical: 80 },
  strip: { flexDirection: "row", alignItems: "center", gap: space.md },
  stripIcon: { width: 44, height: 44, borderRadius: radius.md, alignItems: "center", justifyContent: "center" },
  pill: { borderRadius: radius.pill, paddingHorizontal: 14, paddingVertical: 8 },
  grid: { flexDirection: "row", flexWrap: "wrap", gap: space.md },
  tile: { flexBasis: "47%", flexGrow: 1, gap: 2 },
  tileIcon: { width: 34, height: 34, borderRadius: radius.sm, alignItems: "center", justifyContent: "center", marginBottom: space.sm },
  list: { gap: space.sm },
  inlineEmpty: { flexDirection: "row", alignItems: "center", gap: space.sm },
  pipeline: { gap: space.md },
  stageRow: { flexDirection: "row", alignItems: "center", gap: space.md },
  stageLabel: { width: 76 },
  track: { flex: 1, height: 8, borderRadius: 4, overflow: "hidden" },
  fill: { height: 8, borderRadius: 4 },
  stageCount: { width: 32, textAlign: "right" },
});
