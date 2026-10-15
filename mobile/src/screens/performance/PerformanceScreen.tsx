import React, { useState } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { isForbidden } from "../../api/client";
import { getMyPerformance, getTeamPerformance, type Grade, type MyPerformance, type PerformancePart } from "../../api/performance";
import { useUser } from "../../auth/AuthProvider";
import { monthKeyOf, monthLabel, rupees, shiftMonth } from "../../lib/format";
import { isManagement, roleLabel } from "../../lib/roles";
import { useQuery } from "../../lib/useQuery";
import { useTheme } from "../../theme/ThemeProvider";
import type { Tone } from "../../theme/tokens";
import { Avatar, Badge, Body, Card, EmptyState, ErrorState, FactRow, GroupLabel, Icon, ListCard, Loading, ProgressBar, Ring, Segmented, Text } from "../../ui";

const GRADE_TONE: Record<string, Tone> = { EXCELLENT: "success", GOOD: "primary", AVERAGE: "warning", NEEDS_IMPROVEMENT: "danger" };
const NEXT_GRADE: { min: number; label: string }[] = [
  { min: 50, label: "Average" },
  { min: 70, label: "Good" },
  { min: 85, label: "Excellent" },
];
const PARTS: { key: "attendance" | "tasks" | "sales"; label: string; tone: Tone }[] = [
  { key: "attendance", label: "Attendance", tone: "success" },
  { key: "tasks", label: "Tasks on time", tone: "primary" },
  { key: "sales", label: "Sales", tone: "violet" },
];

const gradeTone = (grade: Grade) => GRADE_TONE[grade?.key || ""] || "neutral";

/* The detail lines under each part - the same facts the web's breakdown shows. */
const describePart = (key: string, part: PerformancePart): [string, string][] => {
  const m = (part?.metrics || {}) as Record<string, any>;
  if (key === "attendance") {
    return [
      ["Attendance", `${m.attendancePercent}% of ${m.workingDays} working days`],
      ["Punctuality", m.punctualityPercent === null || m.punctualityPercent === undefined ? "No check-ins" : `${m.punctualityPercent}% on time`],
      ["Present / half day / absent", `${m.presentDays} / ${m.halfDays} / ${m.absentDays}`],
      ["Late check-ins", String(m.lateDays)],
      ["Leave / week off", `${m.leaveDays} / ${m.weekOffDays}`],
      ["Hours worked", `${m.workedHours} h`],
    ];
  }
  if (key === "tasks") {
    return [
      ["Due this month", String(m.dueTasks)],
      ["Done on time", `${m.completedOnTime} (${m.onTimePercent}%)`],
      ["Done late", String(m.completedLate)],
      ["Overdue, still open", String(m.overdue)],
      ["Completed this month", String(m.completedThisMonth)],
    ];
  }
  const rows: [string, string][] = [
    ["Leads this month", String(m.leads)],
    ["Closed", `${m.closed}${m.conversionPercent === null || m.conversionPercent === undefined ? "" : ` (${m.conversionPercent}%)`}`],
    ["Site visits", String(m.siteVisits)],
  ];
  if (m.target) {
    const goals = Object.entries(m.target as Record<string, { goal: number; achieved: number }>).map(([name, row]) => {
      const fmt = name === "revenue" ? rupees : String;
      return `${fmt(row.achieved)} / ${fmt(row.goal)} ${({ leads: "leads", siteVisits: "visits", revenue: "revenue" } as Record<string, string>)[name]}`;
    });
    rows.push(["Target", `${m.targetPercent}% · ${goals.join(", ")}`]);
  } else rows.push(["Target", "None set this month"]);
  if (m.openLeads) rows.push(["Follow-ups up to date", `${m.followUpPercent}% of ${m.openLeads} open leads`]);
  return rows;
};

/* Design 14: score ring, how it's scored, last 5 months. Web: modules/performance. */
export const PerformanceScreen = () => {
  const user = useUser();
  const manager = isManagement(user.role);
  const scored = user.role !== "ADMIN";
  const [tab, setTab] = useState<"mine" | "team">(scored ? "mine" : "team");
  return (
    <Body>
      {manager && scored ? (
        <Segmented
          options={[
            { key: "mine", label: "Mine" },
            { key: "team", label: "Team" },
          ]}
          value={tab}
          onChange={setTab}
        />
      ) : null}
      {tab === "mine" ? <Mine /> : <Team />}
    </Body>
  );
};

const Mine = () => {
  const { colors } = useTheme();
  const current = monthKeyOf();
  const months = [-4, -3, -2, -1, 0].map((delta) => shiftMonth(current, delta));
  const [open, setOpen] = useState<string | null>(null);
  const { data, loading, error, refresh } = useQuery(async () => {
    const rows = await Promise.all(
      months.map((key) => getMyPerformance(key).catch((err) => (isForbidden(err) ? Promise.reject(err) : null))),
    );
    return rows as (MyPerformance | null)[];
  }, [current]);

  if (loading) return <Loading />;
  if (error) return <ErrorState message={error} onRetry={refresh} />;
  const now = data?.[4];
  if (!now?.performance) return <EmptyState icon="speedometer-outline" title="No score yet" message="Your score appears once you have attendance, tasks or leads this month." />;

  const perf = now.performance;
  const score = perf.score ?? 0;
  const prev = data?.[3]?.performance?.score;
  const next = NEXT_GRADE.find((grade) => score < grade.min);
  const delta = prev === null || prev === undefined ? null : score - prev;

  return (
    <>
      <Card style={styles.hero}>
        <Ring size={110} stroke={10} progress={score / 100}>
          <Text variant="display" style={styles.score}>
            {perf.score === null ? "—" : String(score)}
          </Text>
          <Text variant="tiny" color="faint">
            / 100
          </Text>
        </Ring>
        <View style={styles.heroText}>
          {perf.grade ? <Badge label={perf.grade.label} tone={gradeTone(perf.grade)} /> : null}
          <Text variant="heading">{monthLabel(current).split(" ")[0]} so far</Text>
          <Text variant="small" color="muted" style={styles.heroSub}>
            {delta === null ? "First month on record." : delta === 0 ? `Same as ${monthLabel(months[3]!, true)}.` : `${delta > 0 ? "Up" : "Down"} ${Math.abs(delta)} point${Math.abs(delta) === 1 ? "" : "s"} from ${monthLabel(months[3]!).split(" ")[0]}.`}
            {next ? ` ${next.min - score} more for ${next.label}.` : ""}
          </Text>
        </View>
      </Card>

      <Card style={styles.block}>
        <Text variant="heading" style={styles.blockTitle}>
          How it's scored
        </Text>
        {PARTS.map(({ key, label, tone }) => {
          const part = perf.parts[key];
          const fg = tone === "success" ? colors.success : tone === "violet" ? colors.violet : colors.primary;
          return (
            <Pressable key={key} onPress={() => setOpen(open === key ? null : key)} accessibilityRole="button" accessibilityLabel={`${label} details`} style={styles.part}>
              <View style={styles.partHead}>
                <Text variant="smallStrong" style={styles.partLabel}>
                  {label}
                  <Text variant="tiny" color="faint">{part ? `  · ${part.effectiveWeight}% of score` : "  · not counted"}</Text>
                </Text>
                <Text variant="smallStrong" style={styles.partValue}>
                  {part ? String(part.score) : "—"}
                </Text>
                <Icon name={open === key ? "chevron-up" : "chevron-down"} size={14} color={colors.textFaint} />
              </View>
              <ProgressBar height={8} value={(part?.score ?? 0) / 100} color={fg} />
              {open === key && part ? (
                <View style={styles.facts}>
                  {describePart(key, part).map(([factLabel, value]) => (
                    <FactRow key={factLabel} label={factLabel} value={value} />
                  ))}
                </View>
              ) : null}
            </Pressable>
          );
        })}
      </Card>

      <Card style={styles.block}>
        <Text variant="heading" style={styles.blockTitle}>
          Last 5 months
        </Text>
        <View style={styles.trend}>
          {months.map((key, index) => {
            const value = data?.[index]?.performance?.score;
            return (
              <View key={key} style={styles.bar}>
                <Text variant="tiny" color="muted">
                  {value ?? "—"}
                </Text>
                <View style={[styles.barFill, { height: `${Math.max(4, value ?? 0) * 0.78}%`, backgroundColor: index === 4 ? colors.primary : colors.primarySoft }]} />
                <Text variant="tiny" color="faint">
                  {monthLabel(key, true)}
                </Text>
              </View>
            );
          })}
        </View>
      </Card>
    </>
  );
};

const Team = () => {
  const month = monthKeyOf();
  const { data, loading, error, refresh } = useQuery(() => getTeamPerformance(month), [month]);
  if (loading) return <Loading />;
  if (error) return <ErrorState message={error} onRetry={refresh} />;
  const rows = [...(data || [])].sort((a, b) => (b.performance.score ?? -1) - (a.performance.score ?? -1));
  if (!rows.length) return <EmptyState icon="people-outline" title="No one to score" message="People you manage show up here." />;
  const scoredRows = rows.filter((row) => row.performance.score !== null);
  const average = scoredRows.length ? Math.round(scoredRows.reduce((sum, row) => sum + (row.performance.score || 0), 0) / scoredRows.length) : null;
  return (
    <>
      <View style={styles.teamStats}>
        <TeamStat value={rows.length} label="People" />
        <TeamStat value={average ?? "—"} label="Team average" />
        <TeamStat value={rows.filter((row) => row.performance.grade?.key === "NEEDS_IMPROVEMENT").length} label="Need help" />
      </View>
      <GroupLabel>{monthLabel(month)}</GroupLabel>
      <ListCard>
        {rows.map((row) => (
          <View key={row.user._id} style={styles.teamRow}>
            <Avatar name={row.user.name} uri={row.user.profileImageUrl} size={36} />
            <View style={styles.flex}>
              <Text variant="bodyStrong" style={styles.teamName} numberOfLines={1}>
                {row.user.name}
              </Text>
              <Text variant="small" color="muted" numberOfLines={1} style={styles.teamSub}>
                {[roleLabel(row.user.role), row.performance.grade?.label].filter(Boolean).join(" · ")}
              </Text>
            </View>
            <View style={styles.teamScore}>
              <Text variant="heading" color={undefined}>
                {row.performance.score ?? "—"}
              </Text>
              <Text variant="label" color="faint" style={styles.scoreLabel}>
                score
              </Text>
            </View>
          </View>
        ))}
      </ListCard>
    </>
  );
};

const TeamStat = ({ value, label }: { value: number | string; label: string }) => {
  const { colors } = useTheme();
  return (
    <View style={[styles.teamStat, { backgroundColor: colors.surface, borderColor: colors.border }]}>
      <Text variant="heading" style={styles.statValue}>
        {String(value)}
      </Text>
      <Text variant="tiny" color="muted">
        {label}
      </Text>
    </View>
  );
};

const styles = StyleSheet.create({
  flex: { flex: 1, minWidth: 0 },
  hero: { flexDirection: "row", alignItems: "center", gap: 18, padding: 18, borderRadius: 22 },
  score: { fontSize: 30, lineHeight: 34 },
  heroText: { flex: 1, gap: 4 },
  heroSub: { lineHeight: 17 },
  block: { gap: 12, borderRadius: 20 },
  blockTitle: { fontSize: 13 },
  part: { gap: 5 },
  partHead: { flexDirection: "row", alignItems: "center", gap: 6 },
  partLabel: { flex: 1, fontSize: 12.5, fontFamily: "PlusJakartaSans_600SemiBold" },
  partValue: { fontSize: 12.5, fontFamily: "PlusJakartaSans_800ExtraBold" },
  facts: { paddingTop: 2 },
  trend: { flexDirection: "row", alignItems: "flex-end", gap: 12, height: 110 },
  bar: { flex: 1, height: "100%", alignItems: "center", justifyContent: "flex-end", gap: 5 },
  barFill: { width: "100%", borderRadius: 8 },
  teamStats: { flexDirection: "row", gap: 8 },
  teamStat: { flex: 1, borderWidth: 1, borderRadius: 14, padding: 10, alignItems: "center" },
  statValue: { fontSize: 18 },
  teamRow: { flexDirection: "row", alignItems: "center", gap: 10, paddingHorizontal: 12, paddingVertical: 10 },
  teamName: { fontSize: 13 },
  teamSub: { fontSize: 11.5 },
  teamScore: { alignItems: "flex-end" },
  scoreLabel: { fontSize: 9.5, letterSpacing: 0 },
});
