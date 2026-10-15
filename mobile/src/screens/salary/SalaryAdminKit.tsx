import React, { useEffect, useState } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { errorMessage } from "../../api/client";
import type { DeductionUnit, NamedDeduction, NamedDeductionInput } from "../../api/salary";
import { monthKeyOf, monthLabel, shiftMonth } from "../../lib/format";
import { RULE_KEYS, UNITS, describeRule, describeSchedule, validateNamedDeduction, type RuleDraft } from "../../lib/payroll";
import { useTheme } from "../../theme/ThemeProvider";
import { Button, Field, Icon, InlineError, ListCard, Select, Sheet, Text } from "../../ui";

/* Prev / next month picker; "" (optional) shows as "No end". */
export const MonthStepper = ({ label, value, onChange, optional }: { label: string; value: string; onChange: (key: string) => void; optional?: boolean }) => {
  const { colors } = useTheme();
  const base = value || monthKeyOf();
  return (
    <View style={styles.stepperWrap}>
      <Text variant="smallStrong" color="muted">
        {label}
      </Text>
      <View style={[styles.stepper, { backgroundColor: colors.surfaceAlt }]}>
        <Pressable accessibilityRole="button" accessibilityLabel={`${label}: earlier`} hitSlop={8} onPress={() => onChange(shiftMonth(base, -1))}>
          <Icon name="chevron-back" size={18} color={colors.textMuted} />
        </Pressable>
        <Text variant="bodyStrong" style={styles.stepperValue}>
          {value ? monthLabel(value) : "No end"}
        </Text>
        <Pressable accessibilityRole="button" accessibilityLabel={`${label}: later`} hitSlop={8} onPress={() => onChange(shiftMonth(base, 1))}>
          <Icon name="chevron-forward" size={18} color={colors.textMuted} />
        </Pressable>
        {optional && value ? (
          <Pressable accessibilityRole="button" accessibilityLabel={`Clear ${label}`} hitSlop={8} onPress={() => onChange("")}>
            <Icon name="close-circle" size={18} color={colors.textFaint} />
          </Pressable>
        ) : null}
      </View>
    </View>
  );
};

/* The six attendance deduction rules, each with its own unit (web: PayrollPolicy / employee rules form). */
export const RulesEditor = ({ draft, onChange }: { draft: RuleDraft; onChange: (next: RuleDraft) => void }) => (
  <View style={styles.rules}>
    {RULE_KEYS.map(({ key, label, hint }) => (
      <View key={key} style={styles.rule}>
        <Text variant="bodyStrong" style={styles.ruleLabel}>
          {label}
        </Text>
        <Text variant="tiny" color="faint">
          {hint}
        </Text>
        <View style={styles.pair}>
          <View style={styles.flex}>
            <Select title={`${label}: cut as`} options={UNITS.map((unit) => ({ key: unit.key, label: unit.label }))} value={draft[key].unit} onChange={(unit) => onChange({ ...draft, [key]: { ...draft[key], unit } })} />
          </View>
          <View style={styles.flex}>
            <Field
              value={draft[key].value}
              onChangeText={(value) => onChange({ ...draft, [key]: { ...draft[key], value: value.replace(/[^0-9.]/g, "") } })}
              keyboardType="decimal-pad"
              suffix={draft[key].unit === "AMOUNT" ? "₹" : draft[key].unit === "PERCENT" ? "%" : "days"}
              accessibilityLabel={`${label} value`}
            />
          </View>
        </View>
      </View>
    ))}
  </View>
);

/* Named deductions (loan EMI, canteen, advance…) as a list; tap to edit. */
export const DeductionList = ({ items, onPress, empty }: { items: NamedDeduction[]; onPress?: (item: NamedDeduction) => void; empty: string }) => {
  const { colors } = useTheme();
  if (!items.length) {
    return (
      <Text variant="small" color="muted">
        {empty}
      </Text>
    );
  }
  return (
    <ListCard>
      {items.map((item) => (
        <Pressable
          key={item._id}
          disabled={!onPress}
          accessibilityRole={onPress ? "button" : undefined}
          onPress={() => onPress?.(item)}
          style={({ pressed }) => [styles.row, pressed && { backgroundColor: colors.surfaceAlt }]}
        >
          <View style={styles.flex}>
            <Text variant="bodyStrong" style={styles.rowTitle}>
              {item.name}
            </Text>
            <Text variant="small" color="muted">
              {describeSchedule(item, monthLabel)}
            </Text>
          </View>
          <Text variant="mono" style={styles.mono}>
            {describeRule(item)}
          </Text>
        </Pressable>
      ))}
    </ListCard>
  );
};

type DeductionSheetProps = {
  visible: boolean;
  editing: NamedDeduction | null;
  subtitle?: string;
  onClose: () => void;
  onSave: (payload: NamedDeductionInput, id?: string) => Promise<string>;
  onRemove: (id: string) => Promise<string>;
  onDone: (message: string) => void;
};

/* Add / edit / remove one named deduction. A manager's removal becomes an admin approval request. */
export const DeductionSheet = ({ visible, editing, subtitle, onClose, onSave, onRemove, onDone }: DeductionSheetProps) => {
  const [name, setName] = useState("");
  const [unit, setUnit] = useState<DeductionUnit>("AMOUNT");
  const [value, setValue] = useState("");
  const [frequency, setFrequency] = useState<"MONTHLY" | "ONCE">("MONTHLY");
  const [fromMonth, setFromMonth] = useState(monthKeyOf());
  const [toMonth, setToMonth] = useState("");
  const [busy, setBusy] = useState<"save" | "remove" | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!visible) return;
    setName(editing?.name || "");
    setUnit(editing?.unit || "AMOUNT");
    setValue(editing ? String(editing.value) : "");
    setFrequency(editing?.frequency || "MONTHLY");
    setFromMonth(editing?.fromMonth || monthKeyOf());
    setToMonth(editing?.frequency === "ONCE" ? "" : editing?.toMonth || "");
    setError(null);
  }, [visible, editing]);

  const save = async () => {
    const checked = validateNamedDeduction({ name, unit, value, frequency, fromMonth, toMonth });
    if ("error" in checked) return setError(checked.error);
    setBusy("save");
    setError(null);
    try {
      onDone(await onSave(checked.deduction, editing?._id));
      onClose();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(null);
    }
  };

  const remove = async () => {
    if (!editing) return;
    setBusy("remove");
    setError(null);
    try {
      onDone(await onRemove(editing._id));
      onClose();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(null);
    }
  };

  return (
    <Sheet
      visible={visible}
      title={editing ? "Edit deduction" : "New deduction"}
      subtitle={subtitle}
      onClose={onClose}
      footer={
        <>
          <InlineError message={error} />
          <Button label={editing ? "Save deduction" : "Add deduction"} loading={busy === "save"} onPress={save} />
          {editing ? <Button label="Remove" variant="ghost" loading={busy === "remove"} onPress={remove} /> : null}
        </>
      }
    >
      <Field label="Name" value={name} onChangeText={setName} placeholder="e.g. Loan EMI, canteen, advance" maxLength={60} />
      <View style={styles.pair}>
        <View style={styles.flex}>
          <Select label="Cut as" options={UNITS.map((item) => ({ key: item.key, label: item.label }))} value={unit} onChange={setUnit} />
        </View>
        <View style={styles.flex}>
          <Field
            label="Amount"
            value={value}
            onChangeText={(next) => setValue(next.replace(/[^0-9.]/g, ""))}
            keyboardType="decimal-pad"
            suffix={unit === "AMOUNT" ? "₹" : unit === "PERCENT" ? "%" : "days"}
          />
        </View>
      </View>
      <Select
        label="Repeats"
        options={[
          { key: "MONTHLY", label: "Every month" },
          { key: "ONCE", label: "One month only" },
        ]}
        value={frequency}
        onChange={setFrequency}
      />
      <MonthStepper label={frequency === "ONCE" ? "Month" : "From"} value={fromMonth} onChange={setFromMonth} />
      {frequency === "MONTHLY" ? <MonthStepper label="Until" value={toMonth} onChange={setToMonth} optional /> : null}
    </Sheet>
  );
};

const styles = StyleSheet.create({
  flex: { flex: 1, minWidth: 0 },
  pair: { flexDirection: "row", gap: 10, alignItems: "flex-end" },
  rules: { gap: 16 },
  rule: { gap: 6 },
  ruleLabel: { fontSize: 14 },
  row: { flexDirection: "row", alignItems: "center", gap: 12, padding: 12 },
  rowTitle: { fontSize: 13.5 },
  mono: { fontSize: 12.5 },
  stepperWrap: { gap: 6 },
  stepper: { flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: 14, paddingVertical: 10, borderRadius: 14 },
  stepperValue: { flex: 1, textAlign: "center" },
});
