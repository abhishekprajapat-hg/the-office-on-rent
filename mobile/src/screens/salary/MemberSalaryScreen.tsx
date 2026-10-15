import React, { useLayoutEffect, useState } from "react";
import { StyleSheet, View } from "react-native";
import { errorMessage } from "../../api/client";
import {
  addMemberDeduction,
  getMemberSalary,
  removeMemberDeduction,
  setMemberRules,
  setMemberSalary,
  updateMemberDeduction,
  type NamedDeduction,
} from "../../api/salary";
import { formatDate, monthKeyOf, monthLabel, rupees, shiftMonth } from "../../lib/format";
import { RULE_KEYS, describeRule, fromRuleDraft, ruleDraftError, toRuleDraft, type RuleDraft } from "../../lib/payroll";
import { useQuery } from "../../lib/useQuery";
import type { RootScreenProps } from "../../navigation/types";
import { useTheme } from "../../theme/ThemeProvider";
import { Body, Button, ErrorState, Field, FilterDropdown, GroupLabel, InlineError, ListCard, Loading, Sheet, Text } from "../../ui";
import { DeductionList, DeductionSheet, MonthStepper, RulesEditor } from "./SalaryAdminKit";

/* Web: modules/salary person view - one person's pay for a month, their salary, own deductions and rules. */
export const MemberSalaryScreen = ({ route, navigation }: RootScreenProps<"MemberSalary">) => {
  const { userId, name } = route.params;
  const { colors } = useTheme();
  const current = monthKeyOf();
  const [month, setMonth] = useState(current);
  const [notice, setNotice] = useState<string | null>(null);
  const [salaryOpen, setSalaryOpen] = useState(false);
  const [amount, setAmount] = useState("");
  const [effectiveFrom, setEffectiveFrom] = useState(current);
  const [note, setNote] = useState("");
  const [rulesOpen, setRulesOpen] = useState(false);
  const [rules, setRules] = useState<RuleDraft | null>(null);
  const [deduction, setDeduction] = useState<{ open: boolean; editing: NamedDeduction | null }>({ open: false, editing: null });
  const [busy, setBusy] = useState(false);
  const [sheetError, setSheetError] = useState<string | null>(null);
  const { data, loading, error, refreshing, refresh, reload } = useQuery(() => getMemberSalary(userId, month), [userId, month]);

  useLayoutEffect(() => {
    navigation.setOptions({ title: data?.user?.name || name || "Salary" });
  }, [navigation, data, name]);

  const done = (message: string) => {
    setNotice(message);
    reload();
  };

  if (loading) return <Loading />;
  if (error || !data) return <ErrorState message={error || "Couldn't load this salary."} onRetry={refresh} />;

  const salary = data.salary;
  const person = data.user?.name || name;
  const months = [1, 0, -1, -2, -3, -4, -5].map((delta) => shiftMonth(current, delta));
  const lines = salary?.lines.filter((line) => line.amount > 0 || (line.count ?? 0) > 0) || [];
  const shownRules = data.deductionRules || data.companyRules;

  const openSalary = () => {
    setAmount(data.latestMonthlySalary ? String(data.latestMonthlySalary) : "");
    setEffectiveFrom(current);
    setNote("");
    setSheetError(null);
    setSalaryOpen(true);
  };
  const saveSalary = async () => {
    const value = Number(amount);
    if (!amount.trim() || !Number.isFinite(value) || value < 0) return setSheetError("Enter the monthly salary.");
    setBusy(true);
    setSheetError(null);
    try {
      done(await setMemberSalary(userId, { monthlySalary: value, effectiveFrom, note: note.trim() }));
      setSalaryOpen(false);
    } catch (err) {
      setSheetError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  const openRules = () => {
    setRules(toRuleDraft(shownRules || {}));
    setSheetError(null);
    setRulesOpen(true);
  };
  const saveRules = async (useCompany = false) => {
    if (!useCompany && rules) {
      const invalid = ruleDraftError(rules);
      if (invalid) return setSheetError(invalid);
    }
    setBusy(true);
    setSheetError(null);
    try {
      done(await setMemberRules(userId, useCompany || !rules ? { useCompanyRules: true } : fromRuleDraft(rules)));
      setRulesOpen(false);
    } catch (err) {
      setSheetError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Body refreshing={refreshing} onRefresh={refresh}>
      <FilterDropdown label="Month" icon="calendar-outline" defaultKey={current} options={months.map((key) => ({ key, label: monthLabel(key) }))} value={month} onChange={setMonth} />

      {notice ? (
        <Text variant="smallStrong" color={colors.success}>
          {notice}
        </Text>
      ) : null}

      {salary ? (
        <>
          <View style={[styles.hero, { backgroundColor: colors.hero }]}>
            <Text variant="smallStrong" color={colors.onPrimaryMuted}>
              Payable · {salary.isMonthComplete ? "final" : "so far"}
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
          {lines.length ? (
            <ListCard>
              {lines.map((line) => (
                <View key={line.key} style={styles.line}>
                  <Text variant="small" color="muted" style={styles.flex}>
                    {line.label}
                    {line.count ? ` (${line.count})` : ""}
                  </Text>
                  <Text variant="mono" color={line.amount ? colors.danger : colors.textFaint} style={styles.mono}>
                    {line.amount ? `− ${rupees(line.amount)}` : "—"}
                  </Text>
                </View>
              ))}
            </ListCard>
          ) : null}
        </>
      ) : (
        <Text variant="small" color="muted">
          No salary set for {monthLabel(month)}.
        </Text>
      )}
      <Button icon="wallet-outline" label={data.latestMonthlySalary ? "Change salary" : "Set salary"} onPress={openSalary} />

      <GroupLabel>Attendance deductions</GroupLabel>
      <ListCard>
        <View style={styles.line}>
          <Text variant="small" style={styles.flex}>
            {data.deductionRules ? `Own amounts${data.deductionRules.updatedByName ? ` · set by ${data.deductionRules.updatedByName}` : ""}` : "Follows the company's rules"}
          </Text>
        </View>
        {RULE_KEYS.map(({ key, label }) => (
          <View key={key} style={styles.line}>
            <Text variant="small" color="muted" style={styles.flex}>
              {label}
            </Text>
            <Text variant="small">{describeRule(shownRules?.[key])}</Text>
          </View>
        ))}
      </ListCard>
      <Button variant="secondary" icon="options-outline" label="Edit their deductions" onPress={openRules} />

      <GroupLabel>Their own deductions</GroupLabel>
      <DeductionList items={data.deductions || []} empty="No named deductions for this person." onPress={(item) => setDeduction({ open: true, editing: item })} />
      <Button variant="secondary" icon="add" label="Add a deduction" onPress={() => setDeduction({ open: true, editing: null })} />

      {data.revisions?.length ? (
        <>
          <GroupLabel>Salary history</GroupLabel>
          <ListCard>
            {data.revisions.map((revision, index) => (
              <View key={index} style={styles.line}>
                <View style={styles.flex}>
                  <Text variant="small">From {revision.effectiveFrom ? monthLabel(revision.effectiveFrom.slice(0, 7)) : "—"}</Text>
                  {revision.setByName || revision.note ? (
                    <Text variant="tiny" color="faint">
                      {[revision.setByName, revision.setAt ? formatDate(revision.setAt) : "", revision.note].filter(Boolean).join(" · ")}
                    </Text>
                  ) : null}
                </View>
                <Text variant="mono" style={styles.mono}>
                  {rupees(revision.monthlySalary)}
                </Text>
              </View>
            ))}
          </ListCard>
        </>
      ) : null}

      <Sheet
        visible={salaryOpen}
        title={data.latestMonthlySalary ? "Change salary" : "Set salary"}
        subtitle={`${person} · earlier months keep their old figure`}
        onClose={() => setSalaryOpen(false)}
        footer={
          <>
            <InlineError message={sheetError} />
            <Button label="Save salary" loading={busy} onPress={saveSalary} />
          </>
        }
      >
        <Field label="Monthly salary" value={amount} onChangeText={(next) => setAmount(next.replace(/[^0-9.]/g, ""))} keyboardType="decimal-pad" suffix="₹" />
        <MonthStepper label="Effective from" value={effectiveFrom} onChange={setEffectiveFrom} />
        <Field label="Note (optional)" value={note} onChangeText={setNote} placeholder="e.g. Annual increment" maxLength={240} />
      </Sheet>

      <Sheet
        visible={rulesOpen}
        title="Their attendance deductions"
        subtitle={`${person} · used in place of the company's rules`}
        onClose={() => setRulesOpen(false)}
        footer={
          <>
            <InlineError message={sheetError} />
            <Button label="Save their amounts" loading={busy} onPress={() => saveRules(false)} />
            {data.deductionRules ? <Button label="Go back to company rules" variant="ghost" disabled={busy} onPress={() => saveRules(true)} /> : null}
          </>
        }
      >
        {rules ? <RulesEditor draft={rules} onChange={setRules} /> : null}
      </Sheet>

      <DeductionSheet
        visible={deduction.open}
        editing={deduction.editing}
        subtitle={person}
        onClose={() => setDeduction({ open: false, editing: null })}
        onSave={(payload, id) => (id ? updateMemberDeduction(userId, id, payload) : addMemberDeduction(userId, payload))}
        onRemove={async (id) => (await removeMemberDeduction(userId, id)).message}
        onDone={done}
      />
    </Body>
  );
};

const styles = StyleSheet.create({
  flex: { flex: 1, minWidth: 0 },
  hero: { borderRadius: 22, padding: 18, gap: 6 },
  heroValue: { fontSize: 32, lineHeight: 38 },
  heroRow: { flexDirection: "row", gap: 14 },
  line: { flexDirection: "row", alignItems: "center", gap: 10, paddingHorizontal: 14, paddingVertical: 11 },
  mono: { fontSize: 13 },
});
