import React, { useEffect, useState } from "react";
import { Modal, Pressable, ScrollView, StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { listUsers, type TeamUser } from "../../api/users";
import { DateTimeField } from "../../components/DateTimeField";
import { isoDay } from "../../lib/attendanceState";
import { filterError, type LeadFilters } from "../../lib/leadFilters";
import { formatPrice, parseAmount } from "../../lib/money";
import { roleLabel } from "../../lib/roles";
import { useTheme } from "../../theme/ThemeProvider";
import { radius, space } from "../../theme/tokens";
import { Button, Chip, Field, InlineError, Text } from "../../ui";

const LEAD_ROLES = ["ADMIN", "MANAGER", "INSIDE_EXECUTIVE", "EXECUTIVE", "FIELD_EXECUTIVE"];
const toDate = (value?: string) => (value ? new Date(`${value}T00:00:00`) : null);

export const LeadFiltersSheet = ({
  visible,
  value,
  canFilterAssignee,
  onApply,
  onClose,
}: {
  visible: boolean;
  value: LeadFilters;
  canFilterAssignee: boolean;
  onApply: (next: LeadFilters) => void;
  onClose: () => void;
}) => {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const [draft, setDraft] = useState<LeadFilters>(value);
  const [budget, setBudget] = useState({ min: "", max: "" });
  const [people, setPeople] = useState<TeamUser[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!visible) return;
    setDraft(value);
    setBudget({ min: value.budgetMin ? String(value.budgetMin) : "", max: value.budgetMax ? String(value.budgetMax) : "" });
    setError(null);
  }, [visible, value]);

  useEffect(() => {
    if (visible && canFilterAssignee && !people.length) {
      listUsers()
        .then((users) => setPeople(users.filter((user) => user.isActive !== false && LEAD_ROLES.includes(user.role)).sort((a, b) => a.name.localeCompare(b.name))))
        .catch(() => {});
    }
  }, [visible, canFilterAssignee, people.length]);

  const set = (patch: Partial<LeadFilters>) => setDraft((prev) => ({ ...prev, ...patch }));
  const pick = <K extends keyof LeadFilters>(key: K, option: LeadFilters[K]) => set({ [key]: draft[key] === option ? "" : option } as Partial<LeadFilters>);
  const day = (key: keyof LeadFilters) => (next: Date | null) => set({ [key]: next ? isoDay(next) : "" } as Partial<LeadFilters>);

  const apply = () => {
    const next = { ...draft, budgetMin: parseAmount(budget.min), budgetMax: parseAmount(budget.max) };
    const problem = filterError(next);
    if (problem) return setError(problem);
    onApply(next);
    onClose();
  };

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose} presentationStyle="pageSheet">
      <View style={[styles.root, { backgroundColor: colors.bg, paddingTop: insets.top || space.lg }]}>
        <View style={styles.head}>
          <Pressable accessibilityRole="button" onPress={onClose} hitSlop={10}>
            <Text variant="bodyStrong" color="primary">
              Cancel
            </Text>
          </Pressable>
          <Text variant="heading">Filters</Text>
          <Pressable
            accessibilityRole="button"
            onPress={() => {
              setDraft({});
              setBudget({ min: "", max: "" });
            }}
            hitSlop={10}
          >
            <Text variant="bodyStrong" color="primary">
              Reset
            </Text>
          </Pressable>
        </View>
        <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
          <Section title="Looking for">
            {(["COMMERCIAL", "RESIDENTIAL", "COWORKING"] as const).map((key) => (
              <Chip key={key} label={key.charAt(0) + key.slice(1).toLowerCase()} selected={draft.inventoryType === key} onPress={() => pick("inventoryType", key)} />
            ))}
            {(["SALE", "RENT", "LEASE"] as const).map((key) => (
              <Chip key={key} label={key === "SALE" ? "Buy" : key.charAt(0) + key.slice(1).toLowerCase()} selected={draft.transactionType === key} onPress={() => pick("transactionType", key)} />
            ))}
          </Section>

          <Text variant="smallStrong" color="muted">
            Budget
          </Text>
          <View style={styles.row}>
            <View style={styles.flex}>
              <Field value={budget.min} onChangeText={(min) => setBudget((prev) => ({ ...prev, min }))} placeholder="From, e.g. 50 lakh" hint={parseAmount(budget.min) ? formatPrice(parseAmount(budget.min)) : undefined} />
            </View>
            <View style={styles.flex}>
              <Field value={budget.max} onChangeText={(max) => setBudget((prev) => ({ ...prev, max }))} placeholder="Up to, e.g. 1 cr" hint={parseAmount(budget.max) ? formatPrice(parseAmount(budget.max)) : undefined} />
            </View>
          </View>

          <Field label="City" value={draft.city || ""} onChangeText={(city) => set({ city })} placeholder="Any city" />
          <Field label="Project" value={draft.project || ""} onChangeText={(project) => set({ project })} placeholder="Any project" />

          <Section title="Came in through">
            <Chip label="Meta ads" selected={draft.source === "META"} onPress={() => pick("source", "META")} />
            <Chip label="Added by team" selected={draft.source === "MANUAL"} onPress={() => pick("source", "MANUAL")} />
          </Section>

          {canFilterAssignee ? (
            <Section title="Assigned to">
              <Chip label="Unassigned" selected={draft.assignedTo === "UNASSIGNED"} onPress={() => pick("assignedTo", "UNASSIGNED")} />
              {people.map((person) => (
                <Chip key={person._id} label={`${person.name} · ${roleLabel(person.role)}`} selected={draft.assignedTo === person._id} onPress={() => pick("assignedTo", person._id)} />
              ))}
            </Section>
          ) : null}

          <Text variant="smallStrong" color="muted">
            Added between
          </Text>
          <View style={styles.row}>
            <View style={styles.flex}>
              <DateTimeField label="From" mode="date" value={toDate(draft.createdFrom)} onChange={day("createdFrom")} clearable />
            </View>
            <View style={styles.flex}>
              <DateTimeField label="To" mode="date" value={toDate(draft.createdTo)} onChange={day("createdTo")} clearable />
            </View>
          </View>
          <Text variant="smallStrong" color="muted">
            Follow-up between
          </Text>
          <View style={styles.row}>
            <View style={styles.flex}>
              <DateTimeField label="From" mode="date" value={toDate(draft.followUpDateFrom)} onChange={day("followUpDateFrom")} clearable />
            </View>
            <View style={styles.flex}>
              <DateTimeField label="To" mode="date" value={toDate(draft.followUpDateTo)} onChange={day("followUpDateTo")} clearable />
            </View>
          </View>
          <InlineError message={error} />
        </ScrollView>
        <View style={[styles.footer, { borderTopColor: colors.border, backgroundColor: colors.surface, paddingBottom: insets.bottom + space.md }]}>
          <Button label="Show leads" icon="funnel" onPress={apply} />
        </View>
      </View>
    </Modal>
  );
};

const Section = ({ title, children }: { title: string; children: React.ReactNode }) => (
  <View style={styles.section}>
    <Text variant="smallStrong" color="muted">
      {title}
    </Text>
    <View style={styles.chips}>{children}</View>
  </View>
);

const styles = StyleSheet.create({
  root: { flex: 1 },
  flex: { flex: 1 },
  head: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: space.lg, paddingBottom: space.md },
  body: { padding: space.lg, gap: space.lg },
  section: { gap: space.sm },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: space.sm },
  row: { flexDirection: "row", gap: space.md },
  footer: { paddingHorizontal: space.lg, paddingTop: space.md, borderTopWidth: StyleSheet.hairlineWidth, borderRadius: radius.sm },
});
