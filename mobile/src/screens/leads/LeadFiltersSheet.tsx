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
import { Button, Field, Grabber, InlineError, Select, Text } from "../../ui";

const LEAD_ROLES = ["ADMIN", "MANAGER", "INSIDE_EXECUTIVE", "EXECUTIVE", "FIELD_EXECUTIVE"];
const toDate = (value?: string) => (value ? new Date(`${value}T00:00:00`) : null);

const STATUS_OPTIONS = [
  { key: "ALL", label: "Any" },
  { key: "NEW", label: "New" },
  { key: "CONTACTED", label: "Contacted" },
  { key: "INTERESTED", label: "Interested" },
  { key: "SITE_VISIT_SCHEDULED", label: "Visit scheduled" },
  { key: "SITE_VISIT", label: "Site visit" },
  { key: "CLOSED", label: "Closed" },
  { key: "LOST", label: "Lost" },
];

const SORTS = [
  { key: "nextFollowUp", label: "Next follow-up" },
  { key: "-createdAt", label: "Newest" },
  { key: "-budget", label: "Budget" },
];

/* Which follow-up preset (if any) the date filters currently match. */
const followUpPreset = (draft: LeadFilters) => {
  const today = isoDay(new Date());
  const week = new Date();
  week.setDate(week.getDate() + 6);
  if (draft.followUpTo && !draft.followUpDateFrom) return "OVERDUE";
  if (draft.followUpDateFrom === today && draft.followUpDateTo === today) return "TODAY";
  if (draft.followUpDateFrom === today && draft.followUpDateTo === isoDay(week)) return "WEEK";
  return "";
};

/* Design 16: bottom sheet of filter groups; the web's advanced filters follow under "More filters". */
export const LeadFiltersSheet = ({
  visible,
  value,
  status,
  onStatus,
  canFilterAssignee,
  onApply,
  onClose,
}: {
  visible: boolean;
  value: LeadFilters;
  status: string;
  onStatus: (next: string) => void;
  canFilterAssignee: boolean;
  onApply: (next: LeadFilters) => void;
  onClose: () => void;
}) => {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const [draft, setDraft] = useState<LeadFilters>(value);
  const [draftStatus, setDraftStatus] = useState(status);
  const [budget, setBudget] = useState({ min: "", max: "" });
  const [people, setPeople] = useState<TeamUser[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [more, setMore] = useState(false);

  useEffect(() => {
    if (!visible) return;
    setDraft(value);
    setDraftStatus(status);
    setBudget({ min: value.budgetMin ? String(value.budgetMin) : "", max: value.budgetMax ? String(value.budgetMax) : "" });
    setError(null);
  }, [visible, value, status]);

  useEffect(() => {
    if (visible && canFilterAssignee && !people.length) {
      listUsers()
        .then((users) => setPeople(users.filter((user) => user.isActive !== false && LEAD_ROLES.includes(user.role)).sort((a, b) => a.name.localeCompare(b.name))))
        .catch(() => {});
    }
  }, [visible, canFilterAssignee, people.length]);

  const set = (patch: Partial<LeadFilters>) => setDraft((prev) => ({ ...prev, ...patch }));
  const day = (key: keyof LeadFilters) => (next: Date | null) => set({ [key]: next ? isoDay(next) : "" } as Partial<LeadFilters>);
  const preset = followUpPreset(draft);
  const setPreset = (key: string) => {
    if (preset === key) return set({ followUpTo: "", followUpDateFrom: "", followUpDateTo: "" });
    const today = isoDay(new Date());
    if (key === "OVERDUE") return set({ followUpTo: new Date().toISOString(), followUpDateFrom: "", followUpDateTo: "" });
    if (key === "TODAY") return set({ followUpTo: "", followUpDateFrom: today, followUpDateTo: today });
    const week = new Date();
    week.setDate(week.getDate() + 6);
    return set({ followUpTo: "", followUpDateFrom: today, followUpDateTo: isoDay(week) });
  };

  const apply = () => {
    const next = { ...draft, budgetMin: parseAmount(budget.min), budgetMax: parseAmount(budget.max) };
    const problem = filterError(next);
    if (problem) return setError(problem);
    onApply(next);
    onStatus(draftStatus);
    onClose();
  };

  return (
    <Modal transparent visible={visible} animationType="slide" onRequestClose={onClose} statusBarTranslucent>
      <View style={[styles.backdrop, { backgroundColor: colors.overlay, paddingTop: insets.top + 44 }]}>
        <View style={[styles.panel, { backgroundColor: colors.surface }]}>
          <Grabber />
          <View style={styles.head}>
            <Text variant="title" style={styles.title}>
              Filter leads
            </Text>
            <Pressable
              accessibilityRole="button"
              onPress={() => {
                setDraft({});
                setDraftStatus("ALL");
                setBudget({ min: "", max: "" });
              }}
              hitSlop={10}
            >
              <Text variant="smallStrong" color="primary">
                Reset
              </Text>
            </Pressable>
          </View>
          <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
            <Select label="Status" options={STATUS_OPTIONS.map((option) => ({ key: option.key, label: option.label }))} value={draftStatus} onChange={setDraftStatus} />
            <View style={styles.row}>
              <View style={styles.flex}>
                <Select
                  label="Source"
                  placeholder="Any"
                  allowClear
                  clearLabel="Any source"
                  options={[
                    { key: "META", label: "Meta ads" },
                    { key: "MANUAL", label: "Added by team" },
                  ]}
                  value={draft.source || ""}
                  onChange={(source) => set({ source })}
                />
              </View>
              <View style={styles.flex}>
                <Select
                  label="Follow-up"
                  placeholder="Any time"
                  allowClear
                  clearLabel="Any time"
                  options={[
                    { key: "OVERDUE", label: "Overdue" },
                    { key: "TODAY", label: "Today" },
                    { key: "WEEK", label: "This week" },
                  ]}
                  value={preset || ""}
                  onChange={(key) => (key ? key !== preset && setPreset(key) : preset && setPreset(preset))}
                />
              </View>
            </View>
            <Select label="Sort by" placeholder="Default order" allowClear clearLabel="Default order" options={SORTS} value={draft.sortBy || ""} onChange={(sortBy) => set({ sortBy })} />

            <Pressable onPress={() => setMore(!more)} style={styles.moreToggle} accessibilityRole="button">
              <Text variant="smallStrong" color="primary">
                {more ? "Fewer filters" : "More filters"}
              </Text>
            </Pressable>

            {more ? (
              <>
                <View style={styles.row}>
                  <View style={styles.flex}>
                    <Select
                      label="Looking for"
                      placeholder="Any"
                      allowClear
                      clearLabel="Any"
                      options={(["COMMERCIAL", "RESIDENTIAL", "COWORKING"] as const).map((key) => ({ key, label: key.charAt(0) + key.slice(1).toLowerCase() }))}
                      value={draft.inventoryType || ""}
                      onChange={(inventoryType) => set({ inventoryType } as Partial<LeadFilters>)}
                    />
                  </View>
                  <View style={styles.flex}>
                    <Select
                      label="Deal"
                      placeholder="Any"
                      allowClear
                      clearLabel="Any"
                      options={(["SALE", "RENT", "LEASE"] as const).map((key) => ({ key, label: key === "SALE" ? "Buy" : key.charAt(0) + key.slice(1).toLowerCase() }))}
                      value={draft.transactionType || ""}
                      onChange={(transactionType) => set({ transactionType } as Partial<LeadFilters>)}
                    />
                  </View>
                </View>
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
                {canFilterAssignee ? (
                  <Select
                    label="Assigned to"
                    placeholder="Anyone"
                    allowClear
                    clearLabel="Anyone"
                    options={[{ key: "UNASSIGNED", label: "Unassigned" }, ...people.map((person) => ({ key: person._id, label: person.name, hint: roleLabel(person.role) }))]}
                    value={draft.assignedTo || ""}
                    onChange={(assignedTo) => set({ assignedTo })}
                  />
                ) : null}
                <Text variant="smallStrong" color="muted">
                  Added between
                </Text>
                <View style={styles.row}>
                  <View style={styles.flex}>
                    <DateTimeField label="From" variant="tile" mode="date" value={toDate(draft.createdFrom)} onChange={day("createdFrom")} />
                  </View>
                  <View style={styles.flex}>
                    <DateTimeField label="To" variant="tile" mode="date" value={toDate(draft.createdTo)} onChange={day("createdTo")} />
                  </View>
                </View>
              </>
            ) : null}
            <InlineError message={error} />
          </ScrollView>
          <View style={[styles.footer, { borderTopColor: colors.border, paddingBottom: Math.max(insets.bottom, 12) + 14 }]}>
            <Button label="Cancel" variant="secondary" style={styles.flex} onPress={onClose} />
            <Button label="Show leads" style={styles.wide} onPress={apply} />
          </View>
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  flex: { flex: 1 },
  wide: { flex: 2 },
  backdrop: { flex: 1 },
  panel: { flex: 1, borderTopLeftRadius: 26, borderTopRightRadius: 26, paddingTop: 10 },
  head: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 18, paddingTop: 12 },
  title: { fontSize: 19 },
  body: { padding: 18, gap: 16 },
  row: { flexDirection: "row", gap: 8 },
  moreToggle: { alignSelf: "flex-start" },
  footer: { flexDirection: "row", gap: 8, paddingHorizontal: 18, paddingTop: 12, borderTopWidth: 1 },
});
