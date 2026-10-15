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
import { Button, Chip, Field, Grabber, InlineError, Text } from "../../ui";

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
  const pick = <K extends keyof LeadFilters>(key: K, option: LeadFilters[K]) => set({ [key]: draft[key] === option ? "" : option } as Partial<LeadFilters>);
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
            <Section title="Status">
              {STATUS_OPTIONS.map((option) => (
                <Chip key={option.key} label={option.label} selected={draftStatus === option.key} onPress={() => setDraftStatus(option.key)} />
              ))}
            </Section>
            <Section title="Source">
              <Chip label="Meta ads" selected={draft.source === "META"} onPress={() => pick("source", "META")} />
              <Chip label="Added by team" selected={draft.source === "MANUAL"} onPress={() => pick("source", "MANUAL")} />
            </Section>
            <Section title="Follow-up">
              <Chip label="Overdue" selected={preset === "OVERDUE"} onPress={() => setPreset("OVERDUE")} />
              <Chip label="Today" selected={preset === "TODAY"} onPress={() => setPreset("TODAY")} />
              <Chip label="This week" selected={preset === "WEEK"} onPress={() => setPreset("WEEK")} />
            </Section>
            <Section title="Sort by">
              {SORTS.map((sort) => (
                <Chip key={sort.key} label={sort.label} selected={(draft.sortBy || "") === sort.key} onPress={() => pick("sortBy", sort.key)} />
              ))}
            </Section>

            <Pressable onPress={() => setMore(!more)} style={styles.moreToggle} accessibilityRole="button">
              <Text variant="smallStrong" color="primary">
                {more ? "Fewer filters" : "More filters"}
              </Text>
            </Pressable>

            {more ? (
              <>
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

const Section = ({ title, children }: { title: string; children: React.ReactNode }) => (
  <View style={styles.section}>
    <Text variant="smallStrong" color="muted">
      {title}
    </Text>
    <View style={styles.chips}>{children}</View>
  </View>
);

const styles = StyleSheet.create({
  flex: { flex: 1 },
  wide: { flex: 2 },
  backdrop: { flex: 1 },
  panel: { flex: 1, borderTopLeftRadius: 26, borderTopRightRadius: 26, paddingTop: 10 },
  head: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 18, paddingTop: 12 },
  title: { fontSize: 19 },
  body: { padding: 18, gap: 16 },
  section: { gap: 8 },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  row: { flexDirection: "row", gap: 8 },
  moreToggle: { alignSelf: "flex-start" },
  footer: { flexDirection: "row", gap: 8, paddingHorizontal: 18, paddingTop: 12, borderTopWidth: 1 },
});
