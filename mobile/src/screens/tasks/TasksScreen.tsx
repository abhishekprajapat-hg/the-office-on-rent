import React, { useMemo, useState } from "react";
import { Pressable, RefreshControl, SectionList, StyleSheet, TextInput, View } from "react-native";
import { useNavigation } from "@react-navigation/native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { errorMessage } from "../../api/client";
import { createTask, deleteTask, getAssignees, listTasks, updateTask } from "../../api/tasks";
import type { PersonRef, Task } from "../../api/types";
import { useUser } from "../../auth/AuthProvider";
import { TaskRow } from "../../components/TaskRow";
import { isManagement, roleLabel } from "../../lib/roles";
import { dayKey, isSubtaskDone, isTaskOverdue, PRIORITY, STATUS_ORDER, TASK_STATUS, TASK_STATUS_TONE } from "../../lib/taskMeta";
import { useQuery } from "../../lib/useQuery";
import { useTheme } from "../../theme/ThemeProvider";
import { gutter, toneColors } from "../../theme/tokens";
import {
  ActionSheet,
  Avatar,
  Button,
  EmptyState,
  ErrorState,
  Field,
  FilterBar,
  HeaderButton,
  Icon,
  InlineError,
  Loading,
  OfflineBanner,
  Sheet,
  Text,
  type FilterDef,
  type SheetAction,
} from "../../ui";

type View_ = "all" | "assigned" | "created" | "overdue" | "completed" | "team";
type Person = NonNullable<PersonRef>;
const refId = (value: unknown) => String((value && typeof value === "object" ? (value as { _id?: string })._id : value) || "");

/*
 * The web's task workspace on a phone: views (All, Assigned to me, My tasks,
 * Overdue, Completed and - for managers - Team) with counts, member / status /
 * priority filters, search across tasks and subtasks, a quick "Add a task"
 * line, a list grouped by when it's due or a board grouped by status, and a
 * team directory to open anyone's tasks and assign them work.
 */
export const TasksScreen = () => {
  const user = useUser();
  const navigation = useNavigation();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const myId = user.id || user._id || "";
  const manager = isManagement(user.role);

  const [view, setView] = useState<View_>("all");
  const [member, setMember] = useState("");
  const [status, setStatus] = useState("");
  const [priority, setPriority] = useState("");
  const [search, setSearch] = useState("");
  const [layout, setLayout] = useState<"list" | "board">("list");
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({ completed: true });
  const [teamMemberId, setTeamMemberId] = useState("");
  const [quickTitle, setQuickTitle] = useState("");
  const [quickBusy, setQuickBusy] = useState(false);
  const [menuTask, setMenuTask] = useState<Task | null>(null);
  const [moveTask, setMoveTask] = useState<Task | null>(null);
  const [deleting, setDeleting] = useState<Task | null>(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const { data, loading, error, refreshing, refresh, setData, reload } = useQuery(async () => {
    const [tasks, people] = await Promise.all([listTasks({}), getAssignees().catch(() => [] as Person[])]);
    return { tasks, people };
  }, []);
  const tasks = data?.tasks || [];

  const people = useMemo(() => {
    const list = [...(data?.people || [])].filter((person) => (person as Person & { isActive?: boolean }).isActive !== false);
    if (myId && !list.some((person) => person._id === myId)) list.unshift({ _id: myId, name: user.name, role: user.role });
    return list.sort((a, b) => a.name.localeCompare(b.name));
  }, [data?.people, myId, user.name, user.role]);

  const assignedHere = (task: Task) => refId(task.assignedTo) === myId || (task.subtasks || []).some((subtask) => refId(subtask.assignedTo) === myId);
  const createdHere = (task: Task) => refId(task.createdBy) === myId;
  const canManage = (task: Task) => {
    const creator = createdHere(task);
    const receiver = refId(task.assignedTo) === myId && !creator;
    return creator || (!receiver && manager);
  };

  const counts = useMemo(
    () => ({
      all: tasks.length,
      assigned: tasks.filter((task) => assignedHere(task) && !createdHere(task)).length,
      created: tasks.filter(createdHere).length,
      overdue: tasks.filter(isTaskOverdue).length,
      completed: tasks.filter((task) => task.status === "COMPLETED").length,
      team: people.length,
    }),
    [tasks, people.length, myId],
  );

  const viewTasks = useMemo(
    () =>
      tasks.filter((task) => {
        if (view === "assigned") return assignedHere(task) && !createdHere(task);
        if (view === "created") return createdHere(task);
        if (view === "team") return Boolean(teamMemberId) && refId(task.assignedTo) === teamMemberId;
        if (view === "completed") return task.status === "COMPLETED";
        if (view === "overdue") return isTaskOverdue(task);
        return true;
      }),
    [tasks, view, teamMemberId, myId],
  );

  const visible = useMemo(() => {
    const needle = search.trim().toLowerCase();
    return viewTasks
      .filter((task) => {
        const subText = (task.subtasks || []).map((subtask) => `${subtask.title || ""} ${subtask.description || ""}`).join(" ");
        if (needle && !`${task.title} ${task.description || ""} ${subText}`.toLowerCase().includes(needle)) return false;
        if (member && refId(task.assignedTo) !== member && !(task.subtasks || []).some((subtask) => refId(subtask.assignedTo) === member)) return false;
        if (status === "OVERDUE") {
          if (!isTaskOverdue(task)) return false;
        } else if (status && task.status !== status && !(task.subtasks || []).some((subtask) => (subtask.status || (subtask.isCompleted ? "COMPLETED" : "TODO")) === status)) return false;
        if (priority && task.priority !== priority && !(task.subtasks || []).some((subtask) => subtask.priority === priority)) return false;
        return true;
      })
      .sort((a, b) => {
        if (a.status === "COMPLETED" && b.status !== "COMPLETED") return 1;
        if (b.status === "COMPLETED" && a.status !== "COMPLETED") return -1;
        const aDue = a.dueDate ? new Date(a.dueDate).getTime() : Number.MAX_SAFE_INTEGER;
        const bDue = b.dueDate ? new Date(b.dueDate).getTime() : Number.MAX_SAFE_INTEGER;
        return aDue - bDue;
      });
  }, [viewTasks, search, member, status, priority]);

  const sections = useMemo(() => {
    if (layout === "board") {
      return STATUS_ORDER.map((key) => ({ key, label: TASK_STATUS[key]!.label, tone: TASK_STATUS_TONE[key] ?? "neutral", data: visible.filter((task) => task.status === key) }));
    }
    const today = dayKey();
    // As on the web: overdue and undated work sits under Today (flagged on the row).
    const groups = { today: [] as Task[], upcoming: [] as Task[], completed: [] as Task[] };
    visible.forEach((task) => {
      if (task.status === "COMPLETED") groups.completed.push(task);
      else if (!task.dueDate || dayKey(task.dueDate) <= today) groups.today.push(task);
      else groups.upcoming.push(task);
    });
    return [
      { key: "today", label: "Today", tone: "primary" as const, data: groups.today },
      { key: "upcoming", label: "Upcoming", tone: "violet" as const, data: groups.upcoming },
      { key: "completed", label: "Completed", tone: "success" as const, data: groups.completed },
    ].filter((group) => group.data.length);
  }, [visible, layout]);

  const replaceTask = (updated: Task) => setData((current) => (current ? { ...current, tasks: current.tasks.map((task) => (task._id === updated._id ? { ...task, ...updated } : task)) } : current));

  const patchTask = async (task: Task, patch: { status?: string }) => {
    setActionError(null);
    if (patch.status === "COMPLETED" && (task.subtasks || []).some((subtask) => !isSubtaskDone(subtask))) {
      setActionError("Complete every subtask before completing the parent task.");
      return;
    }
    replaceTask({ ...task, ...patch });
    try {
      const updated = await updateTask(task._id, patch);
      if (updated) replaceTask(updated);
    } catch (err) {
      replaceTask(task);
      setActionError(errorMessage(err));
    }
  };

  const selectedMember = view === "team" ? people.find((person) => person._id === teamMemberId) || null : null;
  const quickAssignee = teamMemberId || member || myId;

  const quickAdd = async () => {
    const title = quickTitle.trim();
    if (!title || quickBusy) return;
    setQuickBusy(true);
    setActionError(null);
    try {
      const due = new Date();
      due.setHours(18, 0, 0, 0);
      const created = await createTask({ title, description: "", status: "TODO", priority: "MEDIUM", dueDate: due.toISOString(), assignedTo: quickAssignee, leadId: null, tags: [], subtasks: [] });
      if (created) setData((current) => (current ? { ...current, tasks: [created, ...current.tasks] } : current));
      setQuickTitle("");
      setCollapsed((prev) => ({ ...prev, today: false }));
      const who = people.find((person) => person._id === quickAssignee);
      setNotice(quickAssignee !== myId && who ? `Task added for ${who.name}.` : "Task added.");
    } catch (err) {
      setActionError(errorMessage(err));
    } finally {
      setQuickBusy(false);
    }
  };

  const openNew = (assignTo?: string, lock?: boolean) => navigation.navigate("NewTask", assignTo ? { assignTo, lockAssignee: lock } : undefined);

  const confirmDelete = async () => {
    if (!deleting) return;
    setBusy(true);
    try {
      const result = await deleteTask(deleting._id);
      if (result.pendingApproval) setNotice(result.message || "Delete request sent. An admin will review it.");
      else {
        setData((current) => (current ? { ...current, tasks: current.tasks.filter((task) => task._id !== deleting._id) } : current));
        setNotice("Task deleted.");
      }
      setDeleting(null);
      reload();
    } catch (err) {
      setActionError(errorMessage(err));
      setDeleting(null);
    } finally {
      setBusy(false);
    }
  };

  const menuActions = (task: Task): SheetAction[] => [
    { key: "open", icon: "open-outline", label: "Open task", onPress: () => navigation.navigate("TaskDetail", { taskId: task._id }) },
    ...(canManage(task) ? [{ key: "edit", icon: "create-outline" as const, label: "Edit task", onPress: () => navigation.navigate("NewTask", { taskId: task._id }) }] : []),
    ...(canManage(task) || refId(task.assignedTo) === myId
      ? [{ key: "move", icon: "swap-horizontal-outline" as const, label: "Move to…", hint: TASK_STATUS[task.status]?.label, onPress: () => setTimeout(() => setMoveTask(task), 250) }]
      : []),
    ...(canManage(task)
      ? [{ key: "delete", icon: "trash-outline" as const, label: "Delete task", destructive: true, hint: user.role === "MANAGER" ? "Sends a request to an admin" : undefined, onPress: () => setTimeout(() => setDeleting(task), 250) }]
      : []),
  ];

  const viewOptions: { key: View_; label: string; count: number }[] = [
    ...(manager ? [{ key: "team" as const, label: "Team", count: counts.team }] : []),
    { key: "all", label: "All tasks", count: counts.all },
    { key: "assigned", label: "Assigned to me", count: counts.assigned },
    { key: "created", label: "My tasks", count: counts.created },
    { key: "overdue", label: "Overdue", count: counts.overdue },
    { key: "completed", label: "Completed", count: counts.completed },
  ];
  const directory = view === "team" && !selectedMember;

  const filters: FilterDef<any>[] = [
    {
      label: "View",
      icon: "albums-outline",
      options: viewOptions,
      value: view,
      defaultKey: "all",
      onChange: (key: View_) => {
        setView(key);
        setTeamMemberId("");
        setMember("");
        setSearch("");
      },
    },
    ...(!directory
      ? [
          ...(view !== "team"
            ? [{ label: "Member", icon: "person-outline" as const, options: [{ key: "", label: "All members" }, ...people.map((person) => ({ key: person._id, label: person._id === myId ? `${person.name} (me)` : person.name }))], value: member, onChange: setMember }]
            : []),
          {
            label: "Status",
            icon: "ellipse-outline" as const,
            options: [{ key: "", label: "Any status" }, ...STATUS_ORDER.map((key) => ({ key, label: TASK_STATUS[key]!.label })), { key: "OVERDUE", label: "Overdue" }],
            value: status,
            onChange: setStatus,
          },
          {
            label: "Priority",
            icon: "flag-outline" as const,
            options: [{ key: "", label: "Any priority" }, ...(["HIGH", "MEDIUM", "LOW"] as const).map((key) => ({ key, label: PRIORITY[key]!.label }))],
            value: priority,
            onChange: setPriority,
          },
        ]
      : []),
  ];

  const memberStats = (personId: string) => {
    const mine = tasks.filter((task) => refId(task.assignedTo) === personId);
    return {
      open: mine.filter((task) => task.status !== "COMPLETED").length,
      overdue: mine.filter(isTaskOverdue).length,
      done: mine.filter((task) => task.status === "COMPLETED").length,
    };
  };

  const header = (
    <View style={styles.headerBlock}>
      <View style={styles.searchRow}>
        <View style={styles.flex}>
          <Field icon="search" surface compact value={search} onChangeText={setSearch} placeholder={directory ? "Search team…" : "Search tasks and subtasks"} autoCorrect={false} />
        </View>
        {!directory ? (
          <View style={[styles.layout, { backgroundColor: colors.track }]}>
            {(["list", "board"] as const).map((key) => (
              <Pressable
                key={key}
                accessibilityRole="tab"
                accessibilityState={{ selected: layout === key }}
                accessibilityLabel={key === "list" ? "List view" : "Board view"}
                onPress={() => setLayout(key)}
                style={[styles.layoutItem, layout === key && { backgroundColor: colors.surface }]}
              >
                <Icon name={key === "list" ? "list" : "grid-outline"} size={17} color={layout === key ? colors.primary : colors.textMuted} />
              </Pressable>
            ))}
          </View>
        ) : null}
      </View>
      <FilterBar filters={filters} />
      {selectedMember ? (
        <View style={[styles.memberBar, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <Pressable accessibilityRole="button" accessibilityLabel="All team members" hitSlop={8} onPress={() => setTeamMemberId("")}>
            <Icon name="chevron-back" size={20} color={colors.primary} />
          </Pressable>
          <Avatar name={selectedMember.name} uri={selectedMember.profileImageUrl} size={40} tinted />
          <View style={styles.flex}>
            <Text variant="bodyStrong" numberOfLines={1}>
              {selectedMember.name}
            </Text>
            <Text variant="tiny" color="muted" numberOfLines={1}>
              {roleLabel(selectedMember.role)} · {memberStats(selectedMember._id).open} open · {memberStats(selectedMember._id).done} completed
            </Text>
          </View>
          <Button label="Assign" icon="add" size="sm" onPress={() => openNew(selectedMember._id, true)} />
        </View>
      ) : null}
      {!directory && view !== "completed" ? (
        <View style={[styles.quick, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <Icon name="add" size={20} color={colors.primary} />
          <TextInput
            value={quickTitle}
            onChangeText={setQuickTitle}
            placeholder={quickAssignee !== myId ? `Add a task for ${people.find((person) => person._id === quickAssignee)?.name.split(" ")[0] || "them"}` : "Add a task"}
            placeholderTextColor={colors.textFaint}
            maxLength={180}
            returnKeyType="done"
            onSubmitEditing={quickAdd}
            style={[styles.quickInput, { color: colors.text }]}
            accessibilityLabel="Quick task title"
          />
          <Pressable
            accessibilityRole="button"
            disabled={quickBusy}
            onPress={() => (quickTitle.trim() ? quickAdd() : openNew(selectedMember?._id, Boolean(selectedMember)))}
            hitSlop={8}
          >
            <Text variant="smallStrong" color="primary">
              {quickBusy ? "Adding…" : quickTitle.trim() ? "Add" : "Details"}
            </Text>
          </Pressable>
        </View>
      ) : null}
      {notice ? (
        <Pressable onPress={() => setNotice(null)} style={[styles.notice, { backgroundColor: colors.successSoft }]}>
          <Icon name="checkmark-circle" size={16} color={colors.success} />
          <Text variant="small" color={colors.success} style={styles.flex}>
            {notice}
          </Text>
        </Pressable>
      ) : null}
      <InlineError message={actionError} />
    </View>
  );

  return (
    <View style={[styles.root, { backgroundColor: colors.bg, paddingTop: insets.top }]}>
      <View style={styles.header}>
        <View style={styles.flex}>
          <Text variant="display">Tasks</Text>
          <Text variant="small" color="muted">
            {data ? `${tasks.filter((task) => task.status !== "COMPLETED").length} open · ${counts.overdue} overdue` : " "}
          </Text>
        </View>
        {manager ? <HeaderButton icon="bar-chart-outline" label="Team workload" variant="secondary" onPress={() => navigation.navigate("TeamWorkload")} /> : null}
        <HeaderButton icon="add" label="New task" onPress={() => openNew(selectedMember?._id, Boolean(selectedMember))} />
      </View>
      <View style={styles.offline}>
        <OfflineBanner />
      </View>

      {loading ? (
        <Loading />
      ) : error && !data ? (
        <ErrorState message={error} onRetry={refresh} />
      ) : directory ? (
        <SectionList
          sections={[{ key: "people", data: people.filter((person) => `${person.name} ${roleLabel(person.role)}`.toLowerCase().includes(search.trim().toLowerCase())) }]}
          keyExtractor={(person) => person._id}
          ListHeaderComponent={header}
          renderSectionHeader={() => (
            <Text variant="smallStrong" color="muted" style={styles.groupHead}>
              Team members · select one to see their tasks
            </Text>
          )}
          renderItem={({ item }) => {
            const stats = memberStats(item._id);
            return (
              <Pressable
                accessibilityRole="button"
                onPress={() => {
                  setTeamMemberId(item._id);
                  setStatus("");
                  setSearch("");
                }}
                style={[styles.memberCard, { backgroundColor: colors.surface, borderColor: colors.border }]}
              >
                <View style={styles.memberTop}>
                  <Avatar name={item.name} uri={item.profileImageUrl} size={42} tinted />
                  <View style={styles.flex}>
                    <Text variant="bodyStrong" numberOfLines={1}>
                      {item.name}
                      {item._id === myId ? " (me)" : ""}
                    </Text>
                    <Text variant="small" color="muted">
                      {roleLabel(item.role)}
                    </Text>
                  </View>
                  <Icon name="chevron-forward" size={17} color={colors.textFaint} />
                </View>
                <View style={styles.memberStats}>
                  <Stat value={stats.open} label="Open" />
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={`${item.name}'s overdue tasks`}
                    onPress={() => {
                      setTeamMemberId(item._id);
                      setStatus("OVERDUE");
                    }}
                    style={styles.flex}
                  >
                    <Stat value={stats.overdue} label="Overdue" danger={stats.overdue > 0} />
                  </Pressable>
                  <Stat value={stats.done} label="Done" />
                  <Button label="Assign task" icon="add" size="sm" variant="soft" onPress={() => openNew(item._id, true)} />
                </View>
              </Pressable>
            );
          }}
          ItemSeparatorComponent={() => <View style={styles.sep} />}
          contentContainerStyle={[styles.list, { paddingBottom: insets.bottom + 40 }]}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={colors.primary} colors={[colors.primary]} />}
          ListEmptyComponent={<EmptyState icon="people-outline" title="No team members found" message="Try a different name or role." />}
        />
      ) : (
        <SectionList
          sections={sections.map((section) => ({ ...section, data: layout === "list" && collapsed[section.key] ? [] : section.data, total: section.data.length }))}
          keyExtractor={(task) => task._id}
          stickySectionHeadersEnabled={false}
          ListHeaderComponent={header}
          renderSectionHeader={({ section }) => {
            const tone = toneColors(colors, section.tone);
            const isCollapsed = layout === "list" && collapsed[section.key];
            return (
              <Pressable
                accessibilityRole="button"
                accessibilityState={{ expanded: !isCollapsed }}
                disabled={layout === "board"}
                onPress={() => setCollapsed((prev) => ({ ...prev, [section.key]: !prev[section.key] }))}
                style={styles.groupHeadRow}
              >
                {layout === "list" ? <Icon name={isCollapsed ? "chevron-forward" : "chevron-down"} size={15} color={colors.textMuted} /> : <View style={[styles.dot, { backgroundColor: tone.fg }]} />}
                <Text variant="smallStrong" color={section.key === "overdue" ? colors.danger : colors.text}>
                  {section.label}
                </Text>
                <Text variant="small" color="faint">
                  {section.total}
                </Text>
              </Pressable>
            );
          }}
          renderSectionFooter={({ section }) =>
            layout === "board" && !section.total ? (
              <Text variant="small" color="faint" style={styles.emptyColumn}>
                Nothing here
              </Text>
            ) : null
          }
          renderItem={({ item }) => (
            <View style={styles.rowWrap}>
              <TaskRow
                task={item}
                showAssignee
                onPress={() => navigation.navigate("TaskDetail", { taskId: item._id })}
                onToggle={canManage(item) || refId(item.assignedTo) === myId ? () => patchTask(item, { status: item.status === "COMPLETED" ? "TODO" : "COMPLETED" }) : undefined}
                onMenu={() => setMenuTask(item)}
              />
            </View>
          )}
          contentContainerStyle={[styles.list, { paddingBottom: insets.bottom + 40 }]}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={colors.primary} colors={[colors.primary]} />}
          ListEmptyComponent={
            <EmptyState
              icon="clipboard-outline"
              title="No tasks found"
              message={search || member || status || priority ? "Clear a filter or try a different search." : selectedMember ? `${selectedMember.name} has no assigned tasks yet.` : "Create a task to start organizing the work."}
              actionLabel={search || member || status || priority ? "Clear filters" : "New task"}
              onAction={() => {
                if (search || member || status || priority) {
                  setSearch("");
                  setMember("");
                  setStatus("");
                  setPriority("");
                } else openNew(selectedMember?._id, Boolean(selectedMember));
              }}
            />
          }
        />
      )}

      <ActionSheet visible={Boolean(menuTask)} title={menuTask?.title} actions={menuTask ? menuActions(menuTask) : []} onClose={() => setMenuTask(null)} />
      <ActionSheet
        visible={Boolean(moveTask)}
        title="Move to"
        onClose={() => setMoveTask(null)}
        actions={STATUS_ORDER.map((key) => ({
          key,
          label: TASK_STATUS[key]!.label,
          icon: moveTask?.status === key ? "radio-button-on" : "radio-button-off",
          hint: key === "COMPLETED" && moveTask && (moveTask.subtasks || []).some((subtask) => !isSubtaskDone(subtask)) ? "Finish the subtasks first" : undefined,
          onPress: () => moveTask && moveTask.status !== key && patchTask(moveTask, { status: key }),
        }))}
      />
      <Sheet
        visible={Boolean(deleting)}
        title={user.role === "MANAGER" ? "Ask an admin to delete this task?" : "Delete this task?"}
        subtitle={deleting ? `“${deleting.title}” with its subtasks, comments and files.${user.role === "MANAGER" ? "" : " This can't be undone."}` : ""}
        onClose={() => setDeleting(null)}
        footer={
          <View style={styles.row}>
            <Button label="Keep" variant="secondary" style={styles.flex} onPress={() => setDeleting(null)} />
            <Button label={user.role === "MANAGER" ? "Send request" : "Delete"} variant="danger" icon="trash-outline" style={styles.flex} loading={busy} onPress={confirmDelete} />
          </View>
        }
      >
        <View />
      </Sheet>
    </View>
  );
};

const Stat = ({ value, label, danger }: { value: number; label: string; danger?: boolean }) => {
  const { colors } = useTheme();
  return (
    <View style={styles.stat}>
      <Text variant="bodyStrong" color={danger ? colors.danger : colors.text} style={styles.statValue}>
        {value}
      </Text>
      <Text variant="tiny" color={danger ? colors.danger : colors.textMuted}>
        {label}
      </Text>
    </View>
  );
};

const styles = StyleSheet.create({
  root: { flex: 1 },
  flex: { flex: 1, minWidth: 0 },
  row: { flexDirection: "row", gap: 8 },
  header: { flexDirection: "row", alignItems: "center", paddingHorizontal: gutter, paddingTop: 4, gap: 8 },
  offline: { paddingTop: 10, marginBottom: -8 },
  headerBlock: { gap: 10, paddingTop: 12, paddingBottom: 6 },
  searchRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  layout: { flexDirection: "row", borderRadius: 12, padding: 3 },
  layoutItem: { width: 38, height: 38, borderRadius: 10, alignItems: "center", justifyContent: "center" },
  memberBar: { flexDirection: "row", alignItems: "center", gap: 10, borderWidth: 1, borderRadius: 16, padding: 10 },
  quick: { flexDirection: "row", alignItems: "center", gap: 10, borderWidth: 1, borderRadius: 14, paddingHorizontal: 12, height: 48 },
  quickInput: { flex: 1, fontFamily: "PlusJakartaSans_500Medium", fontSize: 14, ...({ outlineStyle: "none" } as object) },
  notice: { flexDirection: "row", alignItems: "center", gap: 8, borderRadius: 12, padding: 10 },
  list: { paddingHorizontal: gutter },
  groupHead: { paddingTop: 8, paddingBottom: 8 },
  groupHeadRow: { flexDirection: "row", alignItems: "center", gap: 6, paddingTop: 12, paddingBottom: 8 },
  dot: { width: 8, height: 8, borderRadius: 4 },
  emptyColumn: { paddingBottom: 6, paddingLeft: 14 },
  rowWrap: { paddingBottom: 6 },
  sep: { height: 8 },
  memberCard: { borderWidth: 1, borderRadius: 18, padding: 12, gap: 10 },
  memberTop: { flexDirection: "row", alignItems: "center", gap: 10 },
  memberStats: { flexDirection: "row", alignItems: "center", gap: 6 },
  stat: { flex: 1, alignItems: "center" },
  statValue: { fontSize: 16 },
});
