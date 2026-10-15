import React, { useEffect, useState } from "react";
import { StyleSheet, View } from "react-native";
import { errorMessage } from "../../api/client";
import {
  addCompanyDeduction,
  getPayrollPolicy,
  removeCompanyDeduction,
  updateCompanyDeduction,
  updatePayrollPolicy,
  type NamedDeduction,
  type PayrollPolicy,
} from "../../api/salary";
import { PER_DAY_BASES, fromRuleDraft, ruleDraftError, toRuleDraft, type RuleDraft } from "../../lib/payroll";
import { useQuery } from "../../lib/useQuery";
import { useTheme } from "../../theme/ThemeProvider";
import { Body, Button, Chip, ErrorState, Field, GroupLabel, InlineError, Loading, Text } from "../../ui";
import { DeductionList, DeductionSheet, RulesEditor } from "./SalaryAdminKit";

const whole = (value: string, min: number, max: number) => {
  const n = Number(value);
  return Number.isInteger(n) && n >= min && n <= max;
};

/* Web: modules/salary deduction rules - how per-day pay is worked out, attendance deductions, company-wide named deductions. */
export const PayrollPolicyScreen = () => {
  const { colors } = useTheme();
  const { data, loading, error, refreshing, refresh, reload } = useQuery(getPayrollPolicy, []);
  const [basis, setBasis] = useState<PayrollPolicy["perDayBasis"]>("CALENDAR_DAYS");
  const [fixedDays, setFixedDays] = useState("30");
  const [lateGrace, setLateGrace] = useState("0");
  const [lateEvery, setLateEvery] = useState("1");
  const [rules, setRules] = useState<RuleDraft | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [deduction, setDeduction] = useState<{ open: boolean; editing: NamedDeduction | null }>({ open: false, editing: null });

  useEffect(() => {
    if (!data?.policy) return;
    setBasis(data.policy.perDayBasis);
    setFixedDays(String(data.policy.fixedDaysPerMonth));
    setLateGrace(String(data.policy.lateGraceCount));
    setLateEvery(String(data.policy.lateEveryCount));
    setRules(toRuleDraft(data.policy));
  }, [data]);

  if (loading) return <Loading />;
  if (error || !data) return <ErrorState message={error || "Couldn't load the deduction rules."} onRetry={refresh} />;

  const save = async () => {
    if (!rules) return;
    if (basis === "FIXED_DAYS" && !whole(fixedDays, 1, 31)) return setSaveError("Fixed days per month must be a whole number from 1 to 31.");
    if (!whole(lateGrace, 0, 31)) return setSaveError("Free late check-ins must be a whole number from 0 to 31.");
    if (!whole(lateEvery, 1, 31)) return setSaveError("Late check-ins per deduction must be a whole number from 1 to 31.");
    const invalid = ruleDraftError(rules);
    if (invalid) return setSaveError(invalid);
    setSaving(true);
    setSaveError(null);
    try {
      const result = await updatePayrollPolicy({
        perDayBasis: basis,
        ...(basis === "FIXED_DAYS" ? { fixedDaysPerMonth: Number(fixedDays) } : {}),
        lateGraceCount: Number(lateGrace),
        lateEveryCount: Number(lateEvery),
        ...fromRuleDraft(rules),
      });
      setNotice(result.message || "Deduction rules saved");
      reload();
    } catch (err) {
      setSaveError(errorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Body refreshing={refreshing} onRefresh={refresh}>
      <Text variant="small" color="muted">
        {data.isDefault ? "These are the default rules — nobody has changed them yet." : `Last changed${data.updatedByName ? ` by ${data.updatedByName}` : ""}.`} Individual people can have their own amounts, set from their salary.
      </Text>

      <GroupLabel>Per-day salary</GroupLabel>
      <View style={styles.chips}>
        {PER_DAY_BASES.map((item) => (
          <Chip key={item.key} label={item.label} selected={basis === item.key} onPress={() => setBasis(item.key)} />
        ))}
      </View>
      {basis === "FIXED_DAYS" ? <Field label="Days per month" value={fixedDays} onChangeText={(v) => setFixedDays(v.replace(/[^0-9]/g, ""))} keyboardType="number-pad" /> : null}

      <GroupLabel>Late check-ins</GroupLabel>
      <View style={styles.pair}>
        <View style={styles.flex}>
          <Field label="Free each month" value={lateGrace} onChangeText={(v) => setLateGrace(v.replace(/[^0-9]/g, ""))} keyboardType="number-pad" />
        </View>
        <View style={styles.flex}>
          <Field label="Then one deduction every" value={lateEvery} onChangeText={(v) => setLateEvery(v.replace(/[^0-9]/g, ""))} keyboardType="number-pad" />
        </View>
      </View>

      <GroupLabel>Attendance deductions</GroupLabel>
      {rules ? <RulesEditor draft={rules} onChange={setRules} /> : null}

      <InlineError message={saveError} />
      {notice ? (
        <Text variant="smallStrong" color={colors.success} align="center">
          {notice}
        </Text>
      ) : null}
      <Button icon="checkmark" label="Save rules" loading={saving} onPress={save} />

      <GroupLabel>Company-wide deductions</GroupLabel>
      <DeductionList items={data.customDeductions || []} empty="No company-wide named deductions." onPress={(item) => setDeduction({ open: true, editing: item })} />
      <Button variant="secondary" icon="add" label="Add a deduction" onPress={() => setDeduction({ open: true, editing: null })} />

      <DeductionSheet
        visible={deduction.open}
        editing={deduction.editing}
        subtitle="Applies to everyone with a salary"
        onClose={() => setDeduction({ open: false, editing: null })}
        onSave={(payload, id) => (id ? updateCompanyDeduction(id, payload) : addCompanyDeduction(payload))}
        onRemove={async (id) => (await removeCompanyDeduction(id)).message}
        onDone={(message) => {
          setNotice(message);
          reload();
        }}
      />
    </Body>
  );
};

const styles = StyleSheet.create({
  flex: { flex: 1, minWidth: 0 },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  pair: { flexDirection: "row", gap: 8 },
});
