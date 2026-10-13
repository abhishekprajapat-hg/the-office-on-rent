import React, { useMemo, useState } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { errorMessage } from "../../api/client";
import { completeFollowUp, listFollowUpsBetween } from "../../api/leads";
import { listTasks } from "../../api/tasks";
import { LeadRow } from "../../components/LeadRow";
import { TaskRow } from "../../components/TaskRow";
import { addMonths, dayKey, gridRange, groupByDay, monthGrid, MONTH_NAMES, WEEKDAYS } from "../../lib/calendar";
import { canUseLeads, canUseTasks } from "../../lib/roles";
import { sortTasks } from "../../lib/taskMeta";
import { useQuery } from "../../lib/useQuery";
import { useUser } from "../../auth/AuthProvider";
import type { RootScreenProps } from "../../navigation/types";
import { useTheme } from "../../theme/ThemeProvider";
import { radius, space } from "../../theme/tokens";
import { Body, Button, Card, ErrorState, Icon, InlineError, Loading, SectionTitle, Text } from "../../ui";

const settle = <T,>(promise: Promise<T>, fallback: T) => promise.catch(() => fallback);

export const ScheduleScreen = ({ navigation }: RootScreenProps<"Schedule">) => {
  const user = useUser();
  const { colors } = useTheme();
  const [cursor, setCursor] = useState(() => addMonths(new Date(), 0));
  const [selected, setSelected] = useState(() => dayKey(new Date()));
  const [busyLead, setBusyLead] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const { data, loading, error, refreshing, refresh, reload } = useQuery(async () => {
    const { from, to } = gridRange(cursor);
    const [leads, tasks] = await Promise.all([
      canUseLeads(user.role) ? settle(listFollowUpsBetween(from, to), []) : [],
      canUseTasks(user.role) ? settle(listTasks({ dueDateStart: from.toISOString(), dueDateEnd: to.toISOString() }), []) : [],
    ]);
    return {
      followUps: groupByDay(leads, (lead) => lead.nextFollowUp),
      tasks: groupByDay(tasks.filter((task) => task.status !== "COMPLETED"), (task) => task.dueDate),
    };
  }, [cursor.getTime(), user.role]);

  const days = useMemo(() => monthGrid(cursor), [cursor]);
  const today = dayKey(new Date());

  const dayFollowUps = (data?.followUps[selected] || [])
    .slice()
    .sort((a, b) => new Date(a.nextFollowUp || 0).getTime() - new Date(b.nextFollowUp || 0).getTime());
  const dayTasks = sortTasks(data?.tasks[selected] || []);

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

  const selectedDate = new Date(`${selected}T00:00:00`);

  return (
    <Body refreshing={refreshing} onRefresh={refresh}>
      <Card style={styles.calendar}>
        <View style={styles.monthRow}>
          <Pressable accessibilityRole="button" accessibilityLabel="Previous month" hitSlop={10} onPress={() => setCursor((value) => addMonths(value, -1))}>
            <Icon name="chevron-back" size={22} color={colors.primary} />
          </Pressable>
          <Text variant="heading">
            {MONTH_NAMES[cursor.getMonth()]} {cursor.getFullYear()}
          </Text>
          <Pressable accessibilityRole="button" accessibilityLabel="Next month" hitSlop={10} onPress={() => setCursor((value) => addMonths(value, 1))}>
            <Icon name="chevron-forward" size={22} color={colors.primary} />
          </Pressable>
        </View>
        <View style={styles.week}>
          {WEEKDAYS.map((label, index) => (
            <Text key={index} variant="tiny" color="faint" align="center" style={styles.cell}>
              {label}
            </Text>
          ))}
        </View>
        <View style={styles.grid}>
          {days.map((day) => {
            const isSelected = day.key === selected;
            const leadCount = data?.followUps[day.key]?.length || 0;
            const taskCount = data?.tasks[day.key]?.length || 0;
            return (
              <Pressable
                key={day.key}
                accessibilityRole="button"
                accessibilityState={{ selected: isSelected }}
                accessibilityLabel={`${day.date.getDate()} ${MONTH_NAMES[day.date.getMonth()]}: ${leadCount} follow-ups, ${taskCount} tasks`}
                onPress={() => {
                  setSelected(day.key);
                  if (!day.inMonth) setCursor(addMonths(day.date, 0));
                }}
                style={styles.cell}
              >
                <View
                  style={[
                    styles.dayCircle,
                    isSelected && { backgroundColor: colors.primary },
                    !isSelected && day.key === today && { borderColor: colors.primary, borderWidth: 1.5 },
                  ]}
                >
                  <Text variant="smallStrong" color={isSelected ? colors.onPrimary : day.inMonth ? colors.text : colors.textFaint}>
                    {day.date.getDate()}
                  </Text>
                </View>
                <View style={styles.dots}>
                  {leadCount ? <View style={[styles.dot, { backgroundColor: colors.primary }]} /> : null}
                  {taskCount ? <View style={[styles.dot, { backgroundColor: colors.info }]} /> : null}
                </View>
              </Pressable>
            );
          })}
        </View>
        <View style={styles.legend}>
          <View style={[styles.dot, { backgroundColor: colors.primary }]} />
          <Text variant="tiny" color="muted">
            Follow-ups
          </Text>
          <View style={[styles.dot, { backgroundColor: colors.info }]} />
          <Text variant="tiny" color="muted">
            Tasks due
          </Text>
          {selected !== today ? (
            <Pressable
              accessibilityRole="button"
              onPress={() => {
                setCursor(addMonths(new Date(), 0));
                setSelected(today);
              }}
              style={styles.todayLink}
            >
              <Text variant="smallStrong" color="primary">
                Today
              </Text>
            </Pressable>
          ) : null}
        </View>
      </Card>

      <Text variant="title">
        {selected === today ? "Today" : selectedDate.toLocaleDateString("en-IN", { weekday: "long", day: "numeric", month: "long" })}
      </Text>

      {loading ? (
        <Loading />
      ) : error ? (
        <ErrorState message={error} onRetry={refresh} />
      ) : (
        <>
          <InlineError message={actionError} />
          {canUseLeads(user.role) ? (
            <>
              <SectionTitle title={`Follow-ups · ${dayFollowUps.length}`} />
              {dayFollowUps.length ? (
                dayFollowUps.map((lead) => (
                  <View key={lead._id}>
                    <View>
                      <LeadRow lead={lead} onPress={() => navigation.navigate("LeadDetail", { leadId: lead._id, name: lead.name })} />
                      <View style={styles.followActions}>
                        <Button label="Done" icon="checkmark" size="sm" variant="secondary" loading={busyLead === lead._id} onPress={() => markDone(lead._id)} />
                        <Button label="Reschedule" icon="calendar-outline" size="sm" variant="ghost" onPress={() => navigation.navigate("UpdateLead", { leadId: lead._id })} />
                      </View>
                    </View>
                  </View>
                ))
              ) : (
                <Card>
                  <Text variant="small" color="muted">
                    No follow-ups on this day.
                  </Text>
                </Card>
              )}
            </>
          ) : null}

          {canUseTasks(user.role) ? (
            <>
              <SectionTitle title={`Tasks due · ${dayTasks.length}`} action="New task" onAction={() => navigation.navigate("NewTask")} />
              {dayTasks.length ? (
                dayTasks.map((task) => (
                  <TaskRow key={task._id} task={task} showAssignee onPress={() => navigation.navigate("TaskDetail", { taskId: task._id })} />
                ))
              ) : (
                <Card>
                  <Text variant="small" color="muted">
                    No open tasks due on this day.
                  </Text>
                </Card>
              )}
            </>
          ) : null}
        </>
      )}
    </Body>
  );
};

const styles = StyleSheet.create({
  flex: { flex: 1 },
  calendar: { gap: space.sm, paddingHorizontal: space.sm },
  monthRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: space.sm },
  week: { flexDirection: "row" },
  grid: { flexDirection: "row", flexWrap: "wrap" },
  cell: { width: `${100 / 7}%`, alignItems: "center", paddingVertical: 3 },
  dayCircle: { width: 34, height: 34, borderRadius: 17, alignItems: "center", justifyContent: "center" },
  dots: { flexDirection: "row", gap: 3, height: 6, marginTop: 2 },
  dot: { width: 6, height: 6, borderRadius: 3 },
  legend: { flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: space.sm, paddingTop: space.xs },
  todayLink: { marginLeft: "auto" },
  followActions: { flexDirection: "row", gap: space.sm, marginTop: space.xs },
});
