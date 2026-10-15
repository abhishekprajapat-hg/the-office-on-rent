import React, { useEffect, useState } from "react";
import { StyleSheet, View } from "react-native";
import { FACINGS, OFFICE_TYPES, UNIT_SPECS, UNIT_STATUSES, unitError, withDimension, type UnitDraft, type UnitGroup } from "../../lib/projectUnits";
import { Button, Field, InlineError, Select, Sheet } from "../../ui";

/* One office, shop or showroom on a commercial project (web Projects unit card). */
export const UnitSheet = ({
  group,
  unit,
  index,
  onSave,
  onRemove,
  onClose,
}: {
  group: UnitGroup;
  unit: UnitDraft | null;
  index: number;
  onSave: (unit: UnitDraft) => void;
  onRemove: () => void;
  onClose: () => void;
}) => {
  const spec = UNIT_SPECS[group];
  const [draft, setDraft] = useState<UnitDraft | null>(unit);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    setDraft(unit);
    setError(null);
  }, [unit]);
  if (!draft) return null;

  const set = (key: string) => (value: string) => setDraft((prev) => (prev ? { ...prev, [key]: value } : prev));
  const decimal = (key: string) => (value: string) => set(key)(value.replace(/[^\d.]/g, ""));
  const save = () => {
    const problem = unitError(draft, `${spec.label} ${index + 1}`);
    if (problem) return setError(problem);
    onSave(draft);
  };

  return (
    <Sheet
      visible={Boolean(unit)}
      title={`${spec.label} ${draft[spec.codeField] || index + 1}`}
      subtitle="Length × breadth fills the carpet area."
      onClose={onClose}
      footer={
        <View style={styles.row}>
          <View style={styles.flex}>
            <Button label="Remove" variant="danger" icon="trash-outline" onPress={onRemove} />
          </View>
          <View style={styles.wide}>
            <Button label="Done" icon="checkmark" onPress={save} />
          </View>
        </View>
      }
    >
      <View style={styles.row}>
        <View style={styles.flex}>
          <Field label="Code" value={draft[spec.codeField] || ""} onChangeText={set(spec.codeField)} autoCapitalize="characters" />
        </View>
        <View style={styles.flex}>
          <Field label="Floor" value={draft.floorNumber || ""} onChangeText={(value) => set("floorNumber")(value.replace(/[^\d-]/g, ""))} keyboardType="numbers-and-punctuation" placeholder="0 = ground" />
        </View>
      </View>
      {group === "offices" ? (
        <>
          <Field label="Office name (optional)" value={draft.officeName || ""} onChangeText={set("officeName")} placeholder="Marketing office" />
          <Select label="Office type" allowClear clearLabel="Not set" placeholder="Not set" options={OFFICE_TYPES.map((item) => ({ key: item.key, label: item.label }))} value={draft.officeType} onChange={set("officeType")} />
        </>
      ) : null}
      <View style={styles.row}>
        <View style={styles.flex}>
          <Field label="Length *" value={draft.length || ""} onChangeText={(value) => setDraft((prev) => (prev ? withDimension(prev, "length", value.replace(/[^\d.]/g, "")) : prev))} keyboardType="decimal-pad" suffix="ft" />
        </View>
        <View style={styles.flex}>
          <Field label="Breadth *" value={draft.breadth || ""} onChangeText={(value) => setDraft((prev) => (prev ? withDimension(prev, "breadth", value.replace(/[^\d.]/g, "")) : prev))} keyboardType="decimal-pad" suffix="ft" />
        </View>
        <View style={styles.flex}>
          <Field label="Height" value={draft.height || ""} onChangeText={decimal("height")} keyboardType="decimal-pad" suffix="ft" />
        </View>
      </View>
      <View style={styles.row}>
        <View style={styles.flex}>
          <Field label="Carpet" value={draft.carpetArea || ""} onChangeText={decimal("carpetArea")} keyboardType="decimal-pad" suffix="sq ft" />
        </View>
        <View style={styles.flex}>
          <Field label="Built-up" value={draft.builtUpArea || ""} onChangeText={decimal("builtUpArea")} keyboardType="decimal-pad" suffix="sq ft" />
        </View>
      </View>
      {group === "offices" ? <Field label="Super built-up" value={draft.superBuiltUpArea || ""} onChangeText={decimal("superBuiltUpArea")} keyboardType="decimal-pad" suffix="sq ft" /> : null}
      {group === "showrooms" ? (
        <View style={styles.row}>
          <View style={styles.flex}>
            <Field label="Entrance width" value={draft.entranceWidth || ""} onChangeText={decimal("entranceWidth")} keyboardType="decimal-pad" suffix="ft" />
          </View>
          <View style={styles.flex}>
            <Field label="Ceiling height" value={draft.ceilingHeight || ""} onChangeText={decimal("ceilingHeight")} keyboardType="decimal-pad" suffix="ft" />
          </View>
        </View>
      ) : null}
      <View style={styles.row}>
        <View style={styles.flex}>
          <Select label="Facing" allowClear clearLabel="Not set" placeholder="Not set" options={FACINGS.map((item) => ({ key: item.key, label: item.label }))} value={draft.facing} onChange={set("facing")} />
        </View>
        <View style={styles.flex}>
          <Select label="Status" options={UNIT_STATUSES.map((item) => ({ key: item.key, label: item.label }))} value={draft.status} onChange={set("status")} />
        </View>
      </View>
      <View style={styles.row}>
        <View style={styles.flex}>
          <Field label="Starting rate" value={draft.startingRate || ""} onChangeText={decimal("startingRate")} keyboardType="decimal-pad" suffix="₹/sq ft" />
        </View>
        <View style={styles.flex}>
          <Field label="Current rate" value={draft.currentRate || ""} onChangeText={decimal("currentRate")} keyboardType="decimal-pad" suffix="₹/sq ft" />
        </View>
      </View>
      <Field label={group === "offices" ? "Reserved parking" : "Parking"} value={draft[spec.parkingField] || ""} onChangeText={(value) => set(spec.parkingField)(value.replace(/\D/g, ""))} keyboardType="number-pad" />
      {group === "offices" ? (
        <>
          <Field label="PLC" value={draft.plc || ""} onChangeText={set("plc")} placeholder="Optional" />
          <Field label="Remarks" value={draft.remarks || ""} onChangeText={set("remarks")} placeholder="Optional" multiline />
        </>
      ) : null}
      <InlineError message={error} />
    </Sheet>
  );
};

const styles = StyleSheet.create({
  flex: { flex: 1, minWidth: 0 },
  wide: { flex: 2 },
  row: { flexDirection: "row", gap: 8 },
});
