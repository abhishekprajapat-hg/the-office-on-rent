import React, { useLayoutEffect, useState } from "react";
import { Pressable, ScrollView, Share, StyleSheet, View } from "react-native";
import { useNavigation } from "@react-navigation/native";
import { isForbidden } from "../../api/client";
import { getMySalary, type Salary } from "../../api/salary";
import { formatDate, monthKeyOf, monthLabel, rupees, shiftMonth } from "../../lib/format";
import { useQuery } from "../../lib/useQuery";
import { useTheme } from "../../theme/ThemeProvider";
import { Body, Button, EmptyState, ErrorState, GroupLabel, Icon, ListCard, Loading, Text, FilterDropdown } from "../../ui";

const BASIS: Record<string, string> = { CALENDAR_DAYS: "days in the month", WORKING_DAYS: "working days", FIXED_DAYS: "fixed days" };

const dayOf = (key?: string | null) => (key ? new Date(`${key}T00:00:00`) : null);

/* "Up to Mon, 12 Oct" / "Whole month" / "Month not started" */
const coverage = (salary: Salary) => {
  if (salary.isFutureMonth) return "This month has not started — nothing is deducted yet";
  if (salary.isMonthComplete) return "Whole month";
  return `Up to ${formatDate(dayOf(salary.throughDate))}`;
};

/* Design 13: month chips, blue payable card, line items, day tiles. Web: modules/salary (my salary). */
export const SalaryScreen = () => {
  const navigation = useNavigation();
  const { colors } = useTheme();
  const current = monthKeyOf();
  const [month, setMonth] = useState(current);
  const { data, loading, error, refreshing, refresh } = useQuery(
    // A 403 means this account has no salary record (admins) - shown as such, not as an error.
    () => getMySalary(month).catch((err) => (isForbidden(err) ? null : Promise.reject(err))),
    [month],
  );

  useLayoutEffect(() => {
    navigation.setOptions({
      headerRight: () => (
        <Pressable accessibilityRole="button" accessibilityLabel="Refresh" onPress={refresh} hitSlop={8}>
          <Icon name="refresh" size={20} color={colors.primary} />
        </Pressable>
      ),
    });
  }, [navigation, refresh, colors.primary]);

  const months = [0, -1, -2, -3, -4, -5].map((delta) => shiftMonth(current, delta));

  const chips = (
    <FilterDropdown
      label="Month"
      icon="calendar-outline"
      defaultKey={months[0]}
      options={months.map((key) => ({ key, label: monthLabel(key) }))}
      value={month}
      onChange={setMonth}
    />
  );

  if (loading) return <Loading />;
  if (error) return <ErrorState message={error} onRetry={refresh} />;
  if (!data) return <EmptyState icon="wallet-outline" title="No salary record" message="Admin accounts don't have a salary in the CRM." />;

  const salary = data.salary;
  if (!salary) {
    return (
      <Body refreshing={refreshing} onRefresh={refresh}>
        {chips}
        <EmptyState icon="wallet-outline" title="Salary not set up" message="Your admin hasn't entered a monthly salary for you yet." />
      </Body>
    );
  }

  const deductions = salary.lines.filter((line) => line.amount > 0 || (line.count ?? 0) > 0);
  const late = salary.lines.find((line) => line.key === "late");
  const deductedDays = salary.lines
    .filter((line) => !line.custom && line.unit === "DAYS" && line.key !== "late")
    .reduce((sum, line) => sum + (line.chargeableCount ?? line.count ?? 0) * (line.value ?? 1), 0);
  const paidDays = Math.max(0, salary.workingDaysInMonth - deductedDays);

  return (
    <Body refreshing={refreshing} onRefresh={refresh}>
      {chips}

      <View style={[styles.hero, { backgroundColor: colors.hero }]}>
        <Text variant="smallStrong" color={colors.onPrimaryMuted} style={styles.heroLabel}>
          Payable after deductions · {salary.isMonthComplete ? "final" : "so far"}
        </Text>
        <Text variant="display" color={colors.onPrimary} style={styles.heroValue}>
          {rupees(salary.netSalary)}
        </Text>
        <View style={styles.heroRow}>
          <Text variant="small" color="#dfe6fd">
            Gross {rupees(salary.monthlySalary)}
          </Text>
          <Text variant="small" color="#dfe6fd">
            Deducted {rupees(salary.totalDeduction)}
          </Text>
        </View>
      </View>

      <View style={[styles.lines, { backgroundColor: colors.surface, borderColor: colors.border }]}>
        <Line label="Base salary" value={rupees(salary.monthlySalary)} first />
        {deductions.map((line) => (
          <Line
            key={line.key}
            label={`${line.label}${line.count ? ` (${line.count})` : ""}`}
            value={line.amount ? `− ${rupees(line.amount)}` : "—"}
            color={line.amount ? colors.danger : colors.textFaint}
          />
        ))}
        <Line label="Net payable" value={rupees(salary.netSalary)} strong />
      </View>

      <View style={styles.tiles}>
        <DayTile value={salary.workingDaysInMonth} label="Working days" />
        <DayTile value={Number.isInteger(paidDays) ? paidDays : paidDays.toFixed(2)} label="Paid days" />
        <DayTile value={late?.count ?? 0} label="Late marks" />
      </View>

      <Text variant="small" color="muted" style={styles.note}>
        {coverage(salary)} · per day {rupees(salary.perDayRate)} ({rupees(salary.monthlySalary)} ÷ {salary.divisor} {BASIS[salary.perDayBasis] || "days"})
      </Text>

      <Button
        variant="secondary"
        icon="document-text-outline"
        label={`Share ${monthLabel(month).split(" ")[0]} payslip`}
        onPress={() =>
          Share.share({
            title: `Payslip · ${monthLabel(month)}`,
            message: [
              `Payslip · ${monthLabel(month)}${salary.isMonthComplete ? "" : " (so far)"}`,
              `Gross: ${rupees(salary.monthlySalary)}`,
              ...deductions.map((line) => `${line.label}${line.count ? ` (${line.count})` : ""}: − ${rupees(line.amount)}`),
              `Total deducted: ${rupees(salary.totalDeduction)}`,
              `Net payable: ${rupees(salary.netSalary)}`,
              `Working days ${salary.workingDaysInMonth} · per day ${rupees(salary.perDayRate)}`,
            ].join("\n"),
          }).catch(() => {})
        }
      />

      {data.revisions?.length ? (
        <>
          <GroupLabel>Salary history</GroupLabel>
          <ListCard>
            {data.revisions.map((revision, index) => (
              <View key={index} style={styles.revision}>
                <Text variant="small" color="muted" style={styles.flex}>
                  From {formatDate(dayOf(revision.effectiveFrom?.slice(0, 10)))}
                </Text>
                <Text variant="mono" style={styles.mono}>
                  {rupees(revision.monthlySalary)}
                </Text>
              </View>
            ))}
          </ListCard>
        </>
      ) : null}
    </Body>
  );
};

const Line = ({ label, value, color, first, strong }: { label: string; value: string; color?: string; first?: boolean; strong?: boolean }) => {
  const { colors } = useTheme();
  return (
    <View style={[styles.line, !first && { borderTopColor: colors.border, borderTopWidth: 1 }]}>
      <Text variant={strong ? "smallStrong" : "small"} color={strong ? colors.text : colors.textMuted} style={styles.lineLabel}>
        {label}
      </Text>
      <Text variant="mono" color={color || colors.text} style={styles.mono}>
        {value}
      </Text>
    </View>
  );
};

const DayTile = ({ value, label }: { value: number | string; label: string }) => {
  const { colors } = useTheme();
  return (
    <View style={[styles.tile, { backgroundColor: colors.surface, borderColor: colors.border }]}>
      <Text variant="heading" style={styles.tileValue}>
        {String(value)}
      </Text>
      <Text variant="tiny" color="muted" style={styles.tileLabel}>
        {label}
      </Text>
    </View>
  );
};

const styles = StyleSheet.create({
  flex: { flex: 1 },
  chipScroll: { flexGrow: 0 },
  chips: { gap: 6, alignItems: "center" },
  chip: { paddingHorizontal: 12, paddingVertical: 7, borderRadius: 999 },
  hero: { borderRadius: 22, padding: 18, gap: 6 },
  heroLabel: { fontFamily: "PlusJakartaSans_600SemiBold" },
  heroValue: { fontSize: 34, lineHeight: 40 },
  heroRow: { flexDirection: "row", gap: 14 },
  lines: { borderRadius: 20, borderWidth: 1, paddingHorizontal: 14, paddingVertical: 4 },
  line: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingVertical: 11, gap: 10 },
  lineLabel: { fontSize: 13, flex: 1 },
  mono: { fontSize: 13 },
  tiles: { flexDirection: "row", gap: 8 },
  tile: { flex: 1, borderRadius: 16, borderWidth: 1, padding: 12 },
  tileValue: { fontSize: 19, lineHeight: 24 },
  tileLabel: { fontSize: 11, fontFamily: "PlusJakartaSans_600SemiBold" },
  note: { fontSize: 11.5, textAlign: "center" },
  revision: { flexDirection: "row", alignItems: "center", paddingHorizontal: 12, paddingVertical: 11 },
});
