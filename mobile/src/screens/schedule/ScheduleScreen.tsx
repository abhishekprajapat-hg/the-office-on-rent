import React, { useMemo, useState } from "react";
import { Pressable, RefreshControl, ScrollView, StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { errorMessage } from "../../api/client";
import { completeFollowUp, listFollowUpsBetween, updateLeadStatus } from "../../api/leads";
import type { Lead, Task } from "../../api/types";
import { listTasks, updateTask } from "../../api/tasks";
import { isUnpaidCollection } from "../../lib/followUp";
import { FollowUpNoteSheet, ScheduleFollowUpSheet } from "./ScheduleSheets";
import { canDoPageAction, canOpenPage } from "../../api/access";
import { addMonths, dayKey, gridRange, groupByDay, monthGrid, MONTH_NAMES, WEEKDAYS } from "../../lib/calendar";
import { useAuth } from "../../auth/AuthProvider";
import { useQuery } from "../../lib/useQuery";
import { useUser } from "../../auth/AuthProvider";
import type { RootScreenProps } from "../../navigation/types";
import { useTheme } from "../../theme/ThemeProvider";
import { ActivityIndicator } from "react-native";
import { ActionSheet, ErrorState, Icon, InlineError, Sheet, Text, type IconName, type SheetAction } from "../../ui";

const settle = <T,>(promise: Promise<T>, fallback: T) => promise.catch(() => fallback);
const mondayOf = (date: Date) => {
  const start = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  start.setDate(start.getDate() - ((start.getDay() + 6) % 7));
  return start;
};
const hourLabel = (hour: number) => `${hour % 12 || 12} ${hour < 12 ? "AM" : "PM"}`;
const PRIORITY: Record<string, string> = { URGENT: "Urgent", HIGH: "High priority", MEDIUM: "Medium priority", LOW: "Low priority" };
const VISIT_STATUSES = ["SITE_VISIT_SCHEDULED", "SITE_VISIT"];

type Item =
  | { kind: "lead"; at: Date; lead: Lead }
  | { kind: "task"; at: Date; task: Task; allDay: boolean };

/* Design 32: a Monday-first week strip over an hourly agenda of follow-ups, site visits and tasks due. */
export const ScheduleScreen = ({ navigation }: RootScreenProps<"Schedule">) => {
  const user = useUser();
  const { access } = useAuth();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const [selected, setSelected] = useState(() => dayKey(new Date()));
  const [picking, setPicking] = useState(false);
  const [cursor, setCursor] = useState(() => addMonths(new Date(), 0));
  const [busyLead, setBusyLead] = useState<string | null>(null);
  const [busyTask, setBusyTask] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  const [scheduling, setScheduling] = useState<{ lead: Lead | null } | null>(null);
  const [acting, setActing] = useState<Lead | null>(null);
  const [noting, setNoting] = useState<Lead | null>(null);
  const [clearing, setClearing] = useState<Lead | null>(null);
  const canEditLeads = canDoPageAction(user, access, "leads", "edit") || canDoPageAction(user, access, "my_leads", "edit");
  const canFollowUp = canDoPageAction(user, access, "leads", "follow_up") || canDoPageAction(user, access, "my_leads", "follow_up");
  const canAddTask = canDoPageAction(user, access, "tasks", "create");

  const selectedDate = new Date(`${selected}T00:00:00`);
  const weekStart = mondayOf(selectedDate);
  const week = Array.from({ length: 7 }, (_, index) => new Date(weekStart.getFullYear(), weekStart.getMonth(), weekStart.getDate() + index));
  // Fetch the whole month grid around the week, so the month picker shows its dots too.
  const range = gridRange(picking ? cursor : selectedDate);
  const from = new Date(Math.min(range.from.getTime(), weekStart.getTime()));
  const to = new Date(Math.max(range.to.getTime(), week[6]!.getTime() + 86400000));

  const { data, error, refreshing, refresh, reload, loading } = useQuery(async () => {
    const [leads, tasks] = await Promise.all([
      canOpenPage(user, access, "leads") || canOpenPage(user, access, "my_leads") ? settle(listFollowUpsBetween(from, to), []) : [],
      canOpenPage(user, access, "tasks") ? settle(listTasks({ dueDateStart: from.toISOString(), dueDateEnd: to.toISOString() }), []) : [],
    ]);
    return {
      followUps: groupByDay(leads, (lead) => lead.nextFollowUp),
      tasks: groupByDay(tasks.filter((task) => task.status !== "COMPLETED"), (task) => task.dueDate),
    };
  }, [from.getTime(), to.getTime(), user.role, access]);

  const busyDays = (key: string) => (data?.followUps[key]?.length || 0) + (data?.tasks[key]?.length || 0);
  const today = dayKey(new Date());

  const items: Item[] = useMemo(() => {
    const leads = (data?.followUps[selected] || []).map((lead) => ({ kind: "lead" as const, at: new Date(lead.nextFollowUp || 0), lead }));
    const tasks = (data?.tasks[selected] || []).map((task) => {
      const at = new Date(task.dueDate || 0);
      return { kind: "task" as const, at, task, allDay: at.getHours() === 0 && at.getMinutes() === 0 };
    });
    return [...leads, ...tasks].sort((a, b) => a.at.getTime() - b.at.getTime());
  }, [data, selected]);

  const allDay = items.filter((item) => item.kind === "task" && item.allDay);
  const timed = items.filter((item) => !(item.kind === "task" && item.allDay));
  const hours = timed.map((item) => item.at.getHours());
  const first = Math.min(9, ...hours);
  const last = Math.max(18, ...hours);

  const markDone = async (leadId: string) => {
    setBusyLead(leadId);
    setActionError(null);
    try {
      await completeFollowUp(leadId);
      reload();
    } catch (err) {
      setActionError(errorMessage(err));
    } finally {
      setBusyLead(null);
    }
  };

  /* Clearing deletes the follow-up without logging it done (web "Delete follow-up"). */
  const clearFollowUp = async (lead: Lead) => {
    setBusyLead(lead._id);
    setActionError(null);
    try {
      await updateLeadStatus(lead._id, { status: lead.status || "NEW", nextFollowUp: null });
      reload();
    } catch (err) {
      setActionError(errorMessage(err));
    } finally {
      setBusyLead(null);
    }
  };

  const tickTask = async (task: Task) => {
    setBusyTask(task._id);
    setActionError(null);
    try {
      await updateTask(task._id, { status: "COMPLETED" });
      reload();
    } catch (err) {
      setActionError(errorMessage(err));
    } finally {
      setBusyTask(null);
    }
  };

  const open = (item: Item) => (item.kind === "lead" ? setActing(item.lead) : navigation.navigate("TaskDetail", { taskId: item.task._id }));

  const leadActions = (lead: Lead): SheetAction[] => {
    const collecting = isUnpaidCollection(lead);
    return [
      { key: "open", label: "Open lead", icon: "person-outline", onPress: () => navigation.navigate("LeadDetail", { leadId: lead._id, name: lead.name }) },
      ...(canFollowUp ? [{ key: "note", label: "Add a note", icon: "create-outline" as IconName, onPress: () => setNoting(lead) }] : []),
      ...(canEditLeads ? [{ key: "move", label: "Reschedule", icon: "time-outline" as IconName, onPress: () => setScheduling({ lead }) }] : []),
      ...(canFollowUp && !collecting ? [{ key: "done", label: "Mark done", icon: "checkmark-circle-outline" as IconName, onPress: () => markDone(lead._id) }] : []),
      ...(canEditLeads && !collecting
        ? [{ key: "clear", label: "Clear follow-up", icon: "trash-outline" as IconName, hint: "Removes it without marking it done", destructive: true, onPress: () => setClearing(lead) }]
        : []),
    ];
  };

  const renderEvent = (item: Item) => {
    let tone = { fg: colors.textMuted, bg: colors.track };
    let title = "";
    let sub = "";
    if (item.kind === "lead") {
      const visit = VISIT_STATUSES.includes(item.lead.status || "");
      tone = visit ? { fg: colors.primary, bg: colors.primarySoft } : { fg: colors.violet, bg: colors.violetSoft };
      title = `${visit ? "Site visit" : isUnpaidCollection(item.lead) ? "Collect payment" : "Call"} · ${item.lead.name}`;
      sub = visit ? item.lead.projectInterested || "Site visit" : `Follow-up${item.at.getMinutes() ? ` · ${item.at.toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit" })}` : ""}`;
    } else {
      const urgent = ["HIGH", "URGENT"].includes(item.task.priority);
      tone = urgent ? { fg: colors.warning, bg: colors.warningSoft } : { fg: colors.textMuted, bg: colors.track };
      title = item.task.title;
      sub = ["Task", PRIORITY[item.task.priority] || ""].filter(Boolean).join(" · ");
    }
    const key = item.kind === "lead" ? `l${item.lead._id}` : `t${item.task._id}`;
    return (
      <Pressable key={key} accessibilityRole="button" onPress={() => open(item)} style={({ pressed }) => [styles.event, { backgroundColor: tone.bg, opacity: pressed ? 0.8 : 1 }]}>
        <View style={styles.flex}>
          <Text variant="bodyStrong" color={tone.fg} numberOfLines={1} style={styles.eventTitle}>
            {title}
          </Text>
          <Text variant="small" color="muted" numberOfLines={1}>
            {sub}
          </Text>
        </View>
        {item.kind === "lead" && canFollowUp && !isUnpaidCollection(item.lead) ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`Mark follow-up with ${item.lead.name} done`}
            hitSlop={8}
            onPress={() => markDone(item.lead._id)}
            style={[styles.doneButton, { borderColor: tone.fg }]}
          >
            {busyLead === item.lead._id ? <ActivityIndicator size="small" color={tone.fg} /> : <Icon name="checkmark" size={15} color={tone.fg} />}
          </Pressable>
        ) : null}
        {item.kind === "task" ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`Mark ${item.task.title} done`}
            hitSlop={8}
            onPress={() => tickTask(item.task)}
            style={[styles.doneButton, { borderColor: tone.fg }]}
          >
            {busyTask === item.task._id ? <ActivityIndicator size="small" color={tone.fg} /> : <Icon name="checkmark" size={15} color={tone.fg} />}
          </Pressable>
        ) : null}
      </Pressable>
    );
  };

  return (
    <View style={[styles.flex, { backgroundColor: colors.bg }]}>
      <View style={[styles.top, { backgroundColor: colors.surface, borderBottomColor: colors.border, paddingTop: insets.top + 8 }]}>
        <View style={styles.headRow}>
          <Pressable accessibilityRole="button" accessibilityLabel="Back" hitSlop={10} onPress={() => navigation.goBack()}>
            <Icon name="chevron-back" size={24} color={colors.primary} />
          </Pressable>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Pick a month"
            onPress={() => {
              setCursor(addMonths(selectedDate, 0));
              setPicking(true);
            }}
            style={styles.titleWrap}
          >
            <Text variant="title" style={styles.title}>
              {MONTH_NAMES[selectedDate.getMonth()]}
            </Text>
            <Icon name="chevron-down" size={16} color={colors.textMuted} />
          </Pressable>
          {selected !== today ? (
            <Pressable accessibilityRole="button" onPress={() => setSelected(today)} hitSlop={8} style={styles.todayLink}>
              <Text variant="smallStrong" color="primary">
                Today
              </Text>
            </Pressable>
          ) : null}
          {canAddTask || canEditLeads ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Add to schedule"
              onPress={() => (canEditLeads ? setAddOpen(true) : navigation.navigate("NewTask"))}
              style={[styles.add, { backgroundColor: colors.primary }]}
            >
              <Icon name="add" size={24} color={colors.onPrimary} />
            </Pressable>
          ) : null}
        </View>
        <View style={styles.weekRow}>
          <Pressable accessibilityLabel="Previous week" hitSlop={6} onPress={() => setSelected(dayKey(new Date(weekStart.getTime() - 7 * 86400000)))} style={styles.arrow}>
            <Icon name="chevron-back" size={14} color={colors.textFaint} />
          </Pressable>
          {week.map((date, index) => {
            const key = dayKey(date);
            const active = key === selected;
            const count = busyDays(key);
            return (
              <Pressable
                key={key}
                accessibilityRole="button"
                accessibilityState={{ selected: active }}
                accessibilityLabel={`${date.toDateString()}, ${count} items`}
                onPress={() => setSelected(key)}
                style={[styles.day, active && { backgroundColor: colors.primary }]}
              >
                <Text variant="smallStrong" color={active ? colors.onPrimary : colors.textMuted} style={styles.dayLetter}>
                  {WEEKDAYS[index]}
                </Text>
                <Text variant="title" color={active ? colors.onPrimary : key === today ? colors.primary : colors.text} style={styles.dayNumber}>
                  {date.getDate()}
                </Text>
                <View style={[styles.dot, { backgroundColor: count ? (active ? colors.onPrimary : colors.primary) : "transparent" }]} />
              </Pressable>
            );
          })}
          <Pressable accessibilityLabel="Next week" hitSlop={6} onPress={() => setSelected(dayKey(new Date(weekStart.getTime() + 7 * 86400000)))} style={styles.arrow}>
            <Icon name="chevron-forward" size={14} color={colors.textFaint} />
          </Pressable>
        </View>
      </View>

      {error && !data ? (
        <ErrorState message={error} onRetry={refresh} />
      ) : (
        <ScrollView contentContainerStyle={[styles.agenda, { paddingBottom: insets.bottom + 30 }]} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} />}>
          <InlineError message={actionError} />
          {loading && !data ? <ActivityIndicator color={colors.primary} style={styles.loading} /> : null}
          {allDay.length ? (
            <View style={styles.hour}>
              <Text variant="mono" color="muted" style={styles.hourLabel}>
                DUE
              </Text>
              <View style={[styles.slot, { borderTopColor: colors.border }]}>{allDay.map(renderEvent)}</View>
            </View>
          ) : null}
          {Array.from({ length: last - first + 1 }, (_, index) => first + index).map((hour) => {
            const inHour = timed.filter((item) => item.at.getHours() === hour);
            return (
              <View key={hour} style={styles.hour}>
                <Text variant="mono" color="muted" style={styles.hourLabel}>
                  {hourLabel(hour)}
                </Text>
                <View style={[styles.slot, { borderTopColor: colors.border }]}>{inHour.map(renderEvent)}</View>
              </View>
            );
          })}
          {data && !items.length ? (
            <Text variant="small" color="muted" align="center" style={styles.empty}>
              Nothing scheduled{selected === today ? " today" : ""}.
            </Text>
          ) : null}
        </ScrollView>
      )}

      <ActionSheet
        visible={addOpen}
        title="Add to schedule"
        onClose={() => setAddOpen(false)}
        actions={[
          { key: "follow", label: "Schedule a follow-up", hint: "For any lead you can see", icon: "alarm-outline", onPress: () => setScheduling({ lead: null }) },
          ...(canAddTask ? [{ key: "task", label: "New task", icon: "checkbox-outline" as IconName, onPress: () => navigation.navigate("NewTask") }] : []),
        ]}
      />
      <ActionSheet visible={Boolean(acting)} title={acting?.name} onClose={() => setActing(null)} actions={acting ? leadActions(acting) : []} />
      <ActionSheet
        visible={Boolean(clearing)}
        title={`Clear the follow-up with ${clearing?.name || "this lead"}?`}
        onClose={() => setClearing(null)}
        actions={clearing ? [{ key: "confirm", label: "Clear follow-up", icon: "trash-outline", destructive: true, onPress: () => clearFollowUp(clearing) }] : []}
      />
      <ScheduleFollowUpSheet
        visible={Boolean(scheduling)}
        day={selectedDate}
        lead={scheduling?.lead}
        onClose={() => setScheduling(null)}
        onSaved={(at) => {
          setScheduling(null);
          setSelected(dayKey(at));
          reload();
        }}
      />
      <FollowUpNoteSheet lead={noting} onClose={() => setNoting(null)} />
      <Sheet visible={picking} title={`${MONTH_NAMES[cursor.getMonth()]} ${cursor.getFullYear()}`} onClose={() => setPicking(false)}>
        <View style={styles.monthNav}>
          <Pressable accessibilityLabel="Previous month" hitSlop={10} onPress={() => setCursor((value) => addMonths(value, -1))}>
            <Icon name="chevron-back" size={22} color={colors.primary} />
          </Pressable>
          <Pressable accessibilityLabel="Next month" hitSlop={10} onPress={() => setCursor((value) => addMonths(value, 1))}>
            <Icon name="chevron-forward" size={22} color={colors.primary} />
          </Pressable>
        </View>
        <View style={styles.grid}>
          {WEEKDAYS.map((label, index) => (
            <Text key={`h${index}`} variant="tiny" color="faint" align="center" style={styles.cell}>
              {label}
            </Text>
          ))}
          {monthGrid(cursor).map((day) => {
            const active = day.key === selected;
            return (
              <Pressable
                key={day.key}
                onPress={() => {
                  setSelected(day.key);
                  setPicking(false);
                }}
                style={styles.cell}
              >
                <View style={[styles.circle, active && { backgroundColor: colors.primary }, !active && day.key === today && { borderColor: colors.primary, borderWidth: 1.5 }]}>
                  <Text variant="smallStrong" color={active ? colors.onPrimary : day.inMonth ? colors.text : colors.textFaint}>
                    {day.date.getDate()}
                  </Text>
                </View>
                <View style={[styles.dot, { backgroundColor: busyDays(day.key) ? colors.primary : "transparent" }]} />
              </Pressable>
            );
          })}
        </View>
      </Sheet>
    </View>
  );
};

const styles = StyleSheet.create({
  flex: { flex: 1, minWidth: 0 },
  top: { paddingHorizontal: 14, paddingBottom: 12, borderBottomWidth: 1, gap: 12 },
  headRow: { flexDirection: "row", alignItems: "center", gap: 12 },
  titleWrap: { flexDirection: "row", alignItems: "center", gap: 6, flex: 1 },
  title: { fontSize: 24 },
  todayLink: { paddingHorizontal: 4 },
  add: { width: 44, height: 44, borderRadius: 14, alignItems: "center", justifyContent: "center" },
  weekRow: { flexDirection: "row", alignItems: "center" },
  arrow: { width: 12, alignItems: "center" },
  day: { flex: 1, alignItems: "center", paddingVertical: 7, borderRadius: 14, gap: 1 },
  dayLetter: { fontSize: 11 },
  dayNumber: { fontSize: 17 },
  dot: { width: 5, height: 5, borderRadius: 3, marginTop: 2 },
  agenda: { paddingHorizontal: 14, paddingTop: 12 },
  loading: { marginVertical: 20 },
  hour: { flexDirection: "row", minHeight: 68 },
  hourLabel: { width: 52, fontSize: 11, paddingTop: 8 },
  slot: { flex: 1, borderTopWidth: 1, paddingTop: 7, paddingBottom: 7, gap: 6 },
  event: { flexDirection: "row", alignItems: "center", gap: 10, borderRadius: 14, paddingHorizontal: 12, paddingVertical: 9 },
  eventTitle: { fontSize: 13.5 },
  doneButton: { width: 28, height: 28, borderRadius: 14, borderWidth: 1.5, alignItems: "center", justifyContent: "center" },
  empty: { marginTop: 16 },
  monthNav: { flexDirection: "row", justifyContent: "space-between" },
  grid: { flexDirection: "row", flexWrap: "wrap" },
  cell: { width: `${100 / 7}%`, alignItems: "center", paddingVertical: 3 },
  circle: { width: 34, height: 34, borderRadius: 17, alignItems: "center", justifyContent: "center" },
});
