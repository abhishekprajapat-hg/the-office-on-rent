import React, { useLayoutEffect, useMemo, useState } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { getTeamSalaries } from "../../api/salary";
import { monthKeyOf, monthLabel, rupees, shiftMonth } from "../../lib/format";
import { useQuery } from "../../lib/useQuery";
import type { RootScreenProps } from "../../navigation/types";
import { useTheme } from "../../theme/ThemeProvider";
import { Avatar, Badge, Body, EmptyState, ErrorState, Field, FilterDropdown, Icon, ListCard, Loading, Text } from "../../ui";

/* Web: modules/salary team view - this month's pay for everyone the viewer manages. */
export const TeamSalaryScreen = ({ navigation }: RootScreenProps<"TeamSalary">) => {
  const { colors } = useTheme();
  const current = monthKeyOf();
  const [month, setMonth] = useState(current);
  const [query, setQuery] = useState("");
  const { data, loading, error, refreshing, refresh } = useQuery(() => getTeamSalaries(month), [month]);

  useLayoutEffect(() => {
    navigation.setOptions({
      headerRight: () => (
        <Pressable accessibilityRole="button" accessibilityLabel="Deduction rules" hitSlop={8} onPress={() => navigation.navigate("PayrollPolicy")}>
          <Icon name="options-outline" size={20} color={colors.primary} />
        </Pressable>
      ),
    });
  }, [navigation, colors.primary]);

  const months = [1, 0, -1, -2, -3, -4, -5].map((delta) => shiftMonth(current, delta));
  const rows = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return (data?.rows || []).filter((row) => !needle || row.user.name.toLowerCase().includes(needle));
  }, [data, query]);

  if (loading) return <Loading />;
  if (error) return <ErrorState message={error} onRetry={refresh} />;

  const totals = data?.totals;

  return (
    <Body refreshing={refreshing} onRefresh={refresh}>
      <FilterDropdown label="Month" icon="calendar-outline" defaultKey={current} options={months.map((key) => ({ key, label: monthLabel(key) }))} value={month} onChange={setMonth} />

      {totals ? (
        <View style={[styles.hero, { backgroundColor: colors.hero }]}>
          <Text variant="smallStrong" color={colors.onPrimaryMuted}>
            Net payable · {monthLabel(month)}
          </Text>
          <Text variant="display" color={colors.onPrimary} style={styles.heroValue}>
            {rupees(totals.netPayable)}
          </Text>
          <View style={styles.heroRow}>
            <Text variant="small" color="#dfe6fd">
              Payroll {rupees(totals.monthlyPayroll)}
            </Text>
            <Text variant="small" color="#dfe6fd">
              Deducted {rupees(totals.totalDeduction)}
            </Text>
          </View>
          <Text variant="tiny" color={colors.onPrimaryMuted}>
            {totals.withSalary} of {totals.employees} people have a salary set
          </Text>
        </View>
      ) : null}

      <Field compact icon="search-outline" value={query} onChangeText={setQuery} placeholder="Search people" />

      {!rows.length ? (
        <EmptyState icon="wallet-outline" title="No one to show" message={query ? "No one matches your search." : "There's no one in your team yet."} />
      ) : (
        <ListCard>
          {rows.map((row) => (
            <Pressable
              key={row.user._id}
              accessibilityRole="button"
              onPress={() => navigation.navigate("MemberSalary", { userId: row.user._id, name: row.user.name })}
              style={({ pressed }) => [styles.row, pressed && { backgroundColor: colors.surfaceAlt }]}
            >
              <Avatar name={row.user.name} uri={row.user.profileImageUrl} size={38} />
              <View style={styles.flex}>
                <Text variant="bodyStrong" numberOfLines={1} style={styles.name}>
                  {row.user.name}
                </Text>
                <Text variant="small" color="muted" numberOfLines={1}>
                  {row.salary ? `Gross ${rupees(row.salary.monthlySalary)} · deducted ${rupees(row.salary.totalDeduction)}` : "No salary set"}
                  {row.ownRules ? " · own rules" : ""}
                </Text>
              </View>
              {row.salary ? (
                <Text variant="mono" style={styles.mono}>
                  {rupees(row.salary.netSalary)}
                </Text>
              ) : (
                <Badge label="Set up" tone="warning" />
              )}
            </Pressable>
          ))}
        </ListCard>
      )}
    </Body>
  );
};

const styles = StyleSheet.create({
  flex: { flex: 1, minWidth: 0 },
  hero: { borderRadius: 22, padding: 18, gap: 6 },
  heroValue: { fontSize: 32, lineHeight: 38 },
  heroRow: { flexDirection: "row", gap: 14 },
  row: { flexDirection: "row", alignItems: "center", gap: 12, padding: 12 },
  name: { fontSize: 14 },
  mono: { fontSize: 13 },
});
