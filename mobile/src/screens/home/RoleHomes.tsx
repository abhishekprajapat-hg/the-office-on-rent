import React, { useEffect, useState } from "react";
import { Linking } from "react-native";
import * as Location from "expo-location";
import { useNavigation } from "@react-navigation/native";
import { getAttendancePolicy } from "../../api/admin";
import { loadApprovals, type ApprovalItem, type ApprovalKind } from "../../api/approvals";
import { getMyAttendance, getTeamAttendance, getViolations } from "../../api/attendance";
import { canOpenPage, canPage, canPageAction } from "../../api/access";
import { openDirectChat, sendMessage } from "../../api/chat";
import { listConversations } from "../../api/chat";
import { fetchBoard, fetchClientBirthdays } from "../../api/coworkingBoard";
import { summarize, upcomingBirthdays } from "../../lib/coworkingBoard";
import { getFinanceOverview } from "../../api/finance";
import { listInventory } from "../../api/inventory";
import { countLeads, getLeadSummary, getTodayFollowUps, listVisitsBetween, type VisitLead } from "../../api/leads";
import { getTeamPerformance } from "../../api/performance";
import { getTaskStats, listTasks } from "../../api/tasks";
import type { Lead, Task } from "../../api/types";
import { listUsers } from "../../api/users";
import { useAuth, useUser } from "../../auth/AuthProvider";
import { dayPhase, PHASE_LABEL, workedMinutesSoFar } from "../../lib/attendanceState";
import { dialable, formatClock, formatTime, initials, isOverdue, monthKeyOf } from "../../lib/format";
import { roleLabel } from "../../lib/roles";
import { dayKey, isTaskOverdue } from "../../lib/taskMeta";
import { setTabBadges } from "../../lib/tabBadges";
import { useLeadSearch } from "../../lib/useLeadSearch";
import { useQuery } from "../../lib/useQuery";
import { Button, Sheet, Text } from "../../ui";
import { openSitePhoto } from "../../components/SitePhotoFlow";
import { PickerSheet } from "../../ui/PickerSheet";
import { compactRupees } from "../finance/FinanceScreen";
import { HERO, RoleHome, type HomeTone, type RowSpec, type SectionSpec } from "./RoleHomeKit";

const settle = <T,>(promise: Promise<T>) => promise.catch(() => null);
const n = (value?: number | null) => (value === null || value === undefined ? "–" : value.toLocaleString("en-IN"));
const startOfToday = () => {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
};
const endOfToday = () => {
  const d = new Date();
  d.setHours(23, 59, 59, 999);
  return d;
};
const monthName = () => new Date().toLocaleDateString("en-IN", { month: "short" });
const clock = (minutes?: number) => (minutes === undefined ? "" : `${Math.floor(minutes / 60) % 12 || 12}:${String(minutes % 60).padStart(2, "0")}`);
const shortTime = (value?: string | null) => (value ? formatTime(value).replace(/:00 /, " ").replace(" AM", " AM").replace(" PM", " PM") : "");
const scoreTone = (score?: number | null): HomeTone => (score === null || score === undefined ? "mut" : score >= 80 ? "ok" : score >= 60 ? "warn" : "bad");
const LEAVE = ["LEAVE", "ON_LEAVE", "WEEK_OFF", "HOLIDAY"];

/* Lead picker used by "Log call" and "WhatsApp" quick actions. */
const LeadPicker = ({ open, title, onPick, onClose }: { open: boolean; title: string; onPick: (lead: Lead) => void; onClose: () => void }) => {
  const { leads, search } = useLeadSearch(open);
  return (
    <PickerSheet
      visible={open}
      title={title}
      searchPlaceholder="Search leads by name or phone"
      onSearch={search}
      items={(leads || []).map((lead) => ({ key: lead._id, label: lead.name, sub: [lead.phone, lead.projectInterested].filter(Boolean).join(" · "), avatar: true }))}
      onPick={(key) => {
        const lead = (leads || []).find((item) => item._id === key);
        onClose();
        if (lead) onPick(lead);
      }}
      onClose={onClose}
    />
  );
};

const whatsapp = (phone?: string) => {
  const digits = String(dialable(phone) || "").replace(/\D/g, "");
  if (digits) Linking.openURL(`https://wa.me/${digits.length === 10 ? `91${digits}` : digits}`).catch(() => {});
};
const call = (phone?: string) => {
  const tel = dialable(phone);
  if (tel) Linking.openURL(`tel:${tel}`).catch(() => {});
};

/* =============================================================== A · Admin */
export const AdminHome = () => {
  const navigation = useNavigation();
  const me = useUser();
  const [showAllOut, setShowAllOut] = useState(false);
  const [remindOpen, setRemindOpen] = useState(false);
  const [reminding, setReminding] = useState(false);
  const [remindNote, setRemindNote] = useState<string | null>(null);
  const month = monthKeyOf();
  const { data, loading, refreshing, refresh } = useQuery(async () => {
    const [team, policy, approvals, finance, newLeads, taskStats, violations, scores, users] = await Promise.all([
      settle(getTeamAttendance()),
      settle(getAttendancePolicy()),
      settle(loadApprovals()),
      settle(getFinanceOverview(month)),
      settle(countLeads({ createdFrom: dayKey() })),
      settle(getTaskStats()),
      settle(getViolations(month)),
      settle(getTeamPerformance(month)),
      settle(listUsers()),
    ]);
    return { team, policy, approvals, finance, newLeads, taskStats, violations, scores, users };
  }, []);

  const rows = (data?.team?.rows || []).filter((row) => row.user._id !== (me.id || me._id));
  const status = (row: (typeof rows)[number]) => String(row.attendance?.status || "").toUpperCase();
  const checkedIn = rows.filter((row) => row.attendance?.checkInAt);
  const inField = checkedIn.filter((row) => row.user.role === "FIELD_EXECUTIVE").length;
  const notIn = rows.filter((row) => !row.attendance?.checkInAt && !LEAVE.includes(status(row)));
  const phoneOf = new Map((data?.users || []).map((user) => [user._id, user.phone]));
  const pending = (data?.approvals || []).filter((item) => item.status === "PENDING");
  const alerts = (data?.violations?.violations || []).filter((item) => item.active && !item.excused).length;
  const policy = data?.policy;
  const graceEnd = policy ? (policy.shiftStartMinutes || 0) + (policy.graceMinutes || 0) : undefined;
  const top = [...(data?.scores || [])].filter((row) => row.performance?.score !== null && row.performance?.score !== undefined).sort((a, b) => (b.performance.score || 0) - (a.performance.score || 0)).slice(0, 3);
  const checkInOf = new Map(rows.map((row) => [row.user._id, row.attendance?.checkInAt]));

  useEffect(() => {
    setTabBadges({ ApprovalsTab: pending.length });
  }, [pending.length]);

  const remind = async () => {
    setReminding(true);
    let sent = 0;
    for (const row of notIn) {
      try {
        const room = await openDirectChat(row.user._id);
        if (room) {
          await sendMessage(room._id, `Hi ${row.user.name.split(" ")[0]}, a reminder to check in for today on the CRM app.`);
          sent += 1;
        }
      } catch {
        // keep going; the count below says how many went out
      }
    }
    setReminding(false);
    setRemindOpen(false);
    setRemindNote(sent ? `Reminder sent to ${sent} ${sent === 1 ? "person" : "people"} by chat.` : "Couldn't send the reminders. Check your connection.");
  };

  const outRows: RowSpec[] = (showAllOut ? notIn : notIn.slice(0, 3)).map((row) => ({
    key: row.user._id,
    avatar: initials(row.user.name),
    tone: "blue",
    title: row.user.name,
    sub: roleLabel(row.user.role),
    right: phoneOf.get(row.user._id) ? "Call" : undefined,
    onRight: () => call(phoneOf.get(row.user._id)),
  }));

  const approvalRows: RowSpec[] = pending.slice(0, 3).map((item) => approvalRow(item, () => navigation.navigate("Tabs", { screen: "ApprovalsTab" })));

  return (
    <RoleHome
      loading={loading}
      refreshing={refreshing}
      onRefresh={refresh}
      hero={
        data
          ? {
              icon: "people",
              label: "Attendance today",
              tag: graceEnd !== undefined ? `Grace till ${clock(graceEnd)}` : undefined,
              value: `${checkedIn.length} / ${rows.length}`,
              unit: "checked in",
              bar: [
                { label: "In office", value: checkedIn.length - inField, color: HERO.white },
                { label: "In field", value: inField, color: HERO.sky },
                { label: "Not in", value: notIn.length, color: HERO.dim },
              ],
              cta: notIn.length
                ? { label: `Remind ${notIn.length} ${notIn.length === 1 ? "person" : "people"}`, icon: "paper-plane", onPress: () => setRemindOpen(true) }
                : { label: "Everyone's in", icon: "checkmark-done", onPress: () => {}, disabled: true },
            }
          : null
      }
      actions={[
        { icon: "person-add-outline", label: "Add user", onPress: () => navigation.navigate("AddUser") },
        { icon: "megaphone-outline", label: "Broadcast", onPress: () => navigation.navigate("Broadcast") },
        { icon: "key-outline", label: "Access", onPress: () => navigation.navigate("Users", { focus: "access" }) },
        { icon: "bar-chart-outline", label: "Reports", onPress: () => navigation.navigate("Reports") },
      ]}
      stats={[
        { icon: "trending-up", value: data?.finance?.summary ? compactRupees(data.finance.summary.income) : "–", label: `Revenue · ${monthName()}`, tone: "ok", onPress: () => navigation.navigate("Finance") },
        { icon: "people", value: n(data?.newLeads), label: "New leads today", tone: "blue", onPress: () => navigation.navigate("Tabs", { screen: "Leads" }) },
        { icon: "checkbox", value: data?.taskStats ? n((data.taskStats.total || 0) - (data.taskStats.COMPLETED || 0)) : "–", label: "Open tasks", tone: "vio", onPress: () => navigation.navigate("Tabs", { screen: "Tasks" }) },
        { icon: "warning", value: n(data ? alerts : undefined), label: "Alerts", tone: "warn", onPress: () => navigation.navigate("AdminConsole") },
      ]}
      sections={[
        { title: "Approvals", link: pending.length ? `All ${pending.length}` : "History", onLink: () => navigation.navigate("Tabs", { screen: "ApprovalsTab" }), loading: loading && !data, rows: approvalRows, empty: "All clear — nothing to approve" },
        ...(notIn.length
          ? [{ title: "Not checked in", link: notIn.length > 3 ? (showAllOut ? "Show less" : `All ${notIn.length}`) : undefined, onLink: () => setShowAllOut(!showAllOut), rows: outRows } as SectionSpec]
          : data
            ? [{ title: "Not checked in", empty: "Everyone expected today is in" } as SectionSpec]
            : []),
        {
          title: "Top performers",
          link: "Leaderboard",
          onLink: () => navigation.navigate("Leaderboard"),
          loading: loading && !data,
          rows: top.map((row) => ({
            key: row.user._id,
            avatar: initials(row.user.name),
            tone: "ok",
            title: row.user.name,
            sub: [roleLabel(row.user.role), checkInOf.get(row.user._id) ? `in ${formatTime(checkInOf.get(row.user._id))}` : ""].filter(Boolean).join(" · "),
            right: String(Math.round(row.performance.score || 0)),
            rightTone: scoreTone(row.performance.score),
          })),
        },
      ]}
      footer={
        <>
          {remindNote ? (
            <Text variant="small" color="muted" align="center">
              {remindNote}
            </Text>
          ) : null}
          <Sheet
            visible={remindOpen}
            title={`Remind ${notIn.length} ${notIn.length === 1 ? "person" : "people"}?`}
            subtitle="Each gets a chat message (and a push notification) asking them to check in."
            onClose={() => setRemindOpen(false)}
            footer={<Button label="Send reminders" icon="paper-plane" loading={reminding} onPress={remind} />}
          >
            <Text variant="small" color="muted">
              {notIn.map((row) => row.user.name).join(", ")}
            </Text>
          </Sheet>
        </>
      }
    />
  );
};

const APPROVAL_LOOK: Record<ApprovalKind, { icon: "cash" | "trash" | "airplane" | "business" | "swap-horizontal" | "person-remove" | "time"; tone: HomeTone }> = {
  payment: { icon: "cash", tone: "ok" },
  delete: { icon: "trash", tone: "warn" },
  leave: { icon: "airplane", tone: "vio" },
  inventory: { icon: "business", tone: "blue" },
  status: { icon: "swap-horizontal", tone: "blue" },
  user: { icon: "person-remove", tone: "bad" },
  fix: { icon: "time", tone: "warn" },
};
const approvalRow = (item: ApprovalItem, onPress: () => void): RowSpec => ({
  key: `${item.kind}-${item.id}`,
  page: "admin_console",
  icon: APPROVAL_LOOK[item.kind].icon,
  tone: APPROVAL_LOOK[item.kind].tone,
  title: item.title,
  sub: item.detail,
  right: "Review",
  onPress,
  onRight: onPress,
});

/* ============================================================= B · Manager */
export const ManagerHome = () => {
  const navigation = useNavigation();
  const me = useUser();
  const { access } = useAuth();
  const allowed = (page: string) => canOpenPage(me, access, page);
  const month = monthKeyOf();
  const { data, loading, refreshing, refresh } = useQuery(async () => {
    const [team, approvals, summary, visits, pool, scores] = await Promise.all([
      allowed("attendance") ? settle(getTeamAttendance()) : null,
      allowed("admin_console") ? settle(loadApprovals()) : null,
      allowed("leads") ? settle(getLeadSummary()) : null,
      allowed("leads") ? settle(listVisitsBetween(startOfToday(), endOfToday())) : null,
      allowed("leads") ? settle(countLeads({ assignedTo: "UNASSIGNED" })) : null,
      allowed("performance") ? settle(getTeamPerformance(month)) : null,
    ]);
    return { team, approvals, summary, visits, pool, scores };
  }, [access, month]);

  const rows = (data?.team?.rows || []).filter((row) => row.user._id !== (me.id || me._id));
  const status = (row: (typeof rows)[number]) => String(row.attendance?.status || "").toUpperCase();
  const present = rows.filter((row) => row.attendance?.checkInAt).length;
  const expected = rows.filter((row) => !LEAVE.includes(status(row))).length;
  const by = data?.summary?.byStatus || {};
  const interested = (by.INTERESTED || 0) + (by.FOLLOW_UP || 0) + (by.FOLLOW_UP_1 || 0) + (by.FOLLOW_UP_2 || 0);
  const visitsCount = (by.SITE_VISIT_SCHEDULED || 0) + (by.SITE_VISIT || 0);
  const todayVisits = (data?.visits || []).filter((lead) => ["SITE_VISIT_SCHEDULED", "SITE_VISIT"].includes(String(lead.status))).length;
  const pending = (data?.approvals || []).filter((item) => item.status === "PENDING");
  const payments = pending.filter((item) => item.kind === "payment").length;
  const overdue = data?.summary?.overdueFollowUps || 0;
  const scoreOf = new Map((data?.scores || []).map((row) => [row.user._id, row.performance?.score]));

  useEffect(() => {
    setTabBadges({ Leads: overdue });
  }, [overdue]);

  const kinds = [...new Set(pending.map((item) => item.kind))];
  const attention: RowSpec[] = [
    ...(overdue ? [{ key: "overdue", page: "leads", icon: "alarm" as const, tone: "bad" as HomeTone, title: `${overdue} follow-up${overdue === 1 ? "" : "s"} overdue`, sub: "Across your team", right: "Review", onPress: () => navigation.navigate("Tabs", { screen: "Leads" }), onRight: () => navigation.navigate("Tabs", { screen: "Leads" }) }] : []),
    ...kinds.map((kind) => {
      const items = pending.filter((item) => item.kind === kind);
      const people = [...new Set(items.map((item) => item.requestedBy?.name).filter(Boolean))];
      const first = items[0]!;
      return {
        ...approvalRow(first, () => navigation.navigate("Approvals")),
        key: kind,
        title: items.length === 1 ? first.title : `${items.length} ${KIND_WORD[kind]}`,
        sub: items.length === 1 ? first.detail : people.length ? `From ${people.slice(0, 2).join(", ")}${people.length > 2 ? "…" : ""}` : first.detail,
      };
    }),
  ].slice(0, 4);

  const team: RowSpec[] = [...rows]
    .sort((a, b) => (scoreOf.get(b.user._id) ?? -1) - (scoreOf.get(a.user._id) ?? -1))
    .slice(0, 4)
    .map((row) => {
      const s = status(row);
      const score = scoreOf.get(row.user._id);
      return {
        key: row.user._id,
        page: "leads",
        avatar: initials(row.user.name),
        tone: "blue",
        title: row.user.name,
        sub: row.attendance?.checkInAt ? `In ${formatTime(row.attendance.checkInAt)}${row.attendance.checkOutAt ? ` · out ${formatTime(row.attendance.checkOutAt)}` : ""}` : LEAVE.includes(s) ? "On leave" : "Not checked in",
        right: score === null || score === undefined ? "—" : String(Math.round(score)),
        rightTone: row.attendance?.checkInAt ? scoreTone(score) : "warn",
        onPress: () => navigation.navigate("PersonLeads", { assignedTo: row.user._id, name: row.user.name }),
      };
    });

  return (
    <RoleHome
      loading={loading}
      refreshing={refreshing}
      onRefresh={refresh}
      hero={
        data?.summary
          ? {
              page: "leads",
              icon: "trending-up",
              label: "Team pipeline",
              tag: new Date().toLocaleDateString("en-IN", { month: "long" }),
              value: n(data.summary.open),
              unit: "leads in play",
              bar: [
                { label: "Interested", value: interested, color: HERO.sky },
                { label: "Visits", value: visitsCount, color: HERO.white },
                { label: "Closed", value: data.summary.closed, color: HERO.gold },
              ],
              cta: data.pool ? { label: `Assign ${data.pool} new lead${data.pool === 1 ? "" : "s"}`, icon: "git-branch", page: "leads", action: "assign", onPress: () => navigation.navigate("LeadPool") } : { label: "Open team pipeline", icon: "git-network", page: "leads", onPress: () => navigation.navigate("TeamPipeline") },
            }
          : null
      }
      actions={[
        { icon: "file-tray-full-outline", label: "Lead pool", page: "leads", onPress: () => navigation.navigate("LeadPool") },
        { icon: "swap-horizontal-outline", label: "Transfer", page: "leads", action: "assign", onPress: () => navigation.navigate("TeamPipeline") },
        { icon: "calendar-outline", label: "Schedule", page: "calendar", onPress: () => navigation.navigate("Schedule") },
        { icon: "trophy-outline", label: "Targets", page: "targets", onPress: () => navigation.navigate("Targets") },
      ]}
      stats={[
        { icon: "finger-print", value: data?.team ? `${present} / ${expected}` : "–", label: "Team checked in", tone: "ok", page: "attendance", onPress: () => navigation.navigate("AttendanceHistory") },
        { icon: "alarm", value: n(data?.summary ? overdue : undefined), label: "Follow-ups overdue", tone: "bad", page: "leads", onPress: () => navigation.navigate("Tabs", { screen: "Leads" }) },
        { icon: "navigate", value: n(data?.visits ? todayVisits : undefined), label: "Site visits today", tone: "blue", page: "calendar", onPress: () => navigation.navigate("Schedule") },
        { icon: "cash", value: n(data?.approvals ? payments : undefined), label: "Payments pending", tone: "warn", page: "finance", onPress: () => navigation.navigate("Finance") },
      ]}
      sections={[
        { title: "Needs attention", link: "See all", linkPage: "admin_console", onLink: () => navigation.navigate("Approvals"), loading: loading && !data, rows: attention, empty: "All clear — nothing needs you" },
        { title: "Team today", page: "leads", link: "Pipeline", onLink: () => navigation.navigate("TeamPipeline"), loading: loading && !data, rows: team },
      ]}
    />
  );
};

const KIND_WORD: Record<ApprovalKind, string> = {
  payment: "payments to approve",
  delete: "delete requests",
  leave: "leave requests",
  inventory: "property requests",
  status: "status changes",
  user: "user removals",
  fix: "attendance fixes",
};

/* ===================================================== C · Sales executive */
export const SalesHome = ({ partner }: { partner?: boolean }) => {
  const navigation = useNavigation();
  const me = useUser();
  const { access } = useAuth();
  const leadPage = canOpenPage(me, access, "my_leads") ? "my_leads" : "leads";
  const leadsAllowed = canOpenPage(me, access, "leads") || canOpenPage(me, access, "my_leads");
  const tasksAllowed = canOpenPage(me, access, "tasks");
  const attendanceAllowed = canOpenPage(me, access, "attendance");
  const myId = me.id || me._id || "";
  const [picker, setPicker] = useState<"" | "call" | "whatsapp">("");
  const { data, loading, refreshing, refresh } = useQuery(async () => {
    const [attendance, summary, followUps, tasks] = await Promise.all([
      attendanceAllowed ? settle(getMyAttendance()) : null,
      leadsAllowed ? settle(getLeadSummary()) : null,
      leadsAllowed ? settle(getTodayFollowUps(3)) : null,
      tasksAllowed ? settle(listTasks({ assignedTo: myId })) : null,
    ]);
    return { attendance, summary, followUps, tasks };
  }, [myId, leadsAllowed, tasksAllowed, attendanceAllowed]);

  const s = data?.summary;
  const due = s?.followUpsDue || 0;
  useEffect(() => {
    setTabBadges({ Leads: due });
  }, [due]);

  const today = data?.attendance?.today;
  const phase = dayPhase(today);
  const worked = workedMinutesSoFar(today);
  const policy = data?.attendance?.policy;
  const shift = policy?.shiftStartMinutes !== undefined && policy?.shiftEndMinutes !== undefined ? Math.max(60, policy.shiftEndMinutes - policy.shiftStartMinutes) : 540;
  const openTasks = (data?.tasks || []).filter((task) => task.status !== "COMPLETED").sort((a, b) => String(a.dueDate || "9").localeCompare(String(b.dueDate || "9")));

  const nextUp: RowSpec[] = (data?.followUps || []).map((lead) => {
    const late = isOverdue(lead.nextFollowUp);
    return {
      key: lead._id,
      avatar: initials(lead.name),
      tone: "blue",
      title: lead.name,
      sub: lead.projectInterested || lead.city || lead.phone,
      right: `${shortTime(lead.nextFollowUp)}${late ? " late" : ""}`.trim(),
      rightTone: late ? "bad" : "blue",
      onPress: () => navigation.navigate("LeadDetail", { leadId: lead._id, name: lead.name }),
    };
  });

  const taskRows: RowSpec[] = openTasks.slice(0, 3).map((task) => taskRow(task, () => navigation.navigate("TaskDetail", { taskId: task._id })));

  const hero = partner || !attendanceAllowed
    ? s
      ? {
          page: leadPage,
          icon: "people" as const,
          label: "My leads",
          tag: `${s.followUpsDue} due`,
          value: n(s.open),
          unit: "open leads",
          bar: [
            { label: "New", value: s.byStatus?.NEW || 0, color: HERO.white },
            { label: "Interested", value: s.byStatus?.INTERESTED || 0, color: HERO.sky },
            { label: "Closed", value: s.closed, color: HERO.gold },
          ],
          cta: { label: "Add a lead", icon: "person-add" as const, page: leadPage, action: "create", onPress: () => navigation.navigate("AddLead") },
        }
      : null
    : data?.attendance
      ? {
          page: "attendance",
          icon: "finger-print" as const,
          label: "My day",
          tag: PHASE_LABEL[phase],
          value: formatClock(worked),
          unit: `of ${Math.round(shift / 60)}h`,
          bar: [
            { label: "Worked", value: worked, display: formatClock(worked), color: HERO.white },
            { label: "Left", value: Math.max(0, shift - worked), display: formatClock(Math.max(0, shift - worked)), color: HERO.dim },
          ],
          cta: {
            label: phase === "not_started" ? "Check in now" : phase === "on_break" ? "End break" : phase === "done" ? "View attendance" : "Break or check out",
            icon: (phase === "on_break" ? "cafe" : phase === "done" ? "calendar" : "finger-print") as "finger-print",
            onPress: () => navigation.navigate("Tabs", { screen: "Attendance" }),
          },
        }
      : null;

  return (
    <RoleHome
      loading={loading}
      refreshing={refreshing}
      onRefresh={refresh}
      hero={hero}
      actions={[
        { icon: "call-outline", label: "Log call", page: leadPage, action: "follow_up", onPress: () => setPicker("call") },
        { icon: "person-add-outline", label: "Add lead", page: leadPage, action: "create", onPress: () => navigation.navigate("AddLead") },
        { icon: "logo-whatsapp", label: "WhatsApp", page: leadPage, onPress: () => setPicker("whatsapp") },
        { icon: "business-outline", label: "Inventory", page: "inventory", onPress: () => navigation.navigate("Inventory") },
      ]}
      stats={[
        { icon: "alarm", value: n(s?.followUpsDue), label: "Follow-ups today", tone: "bad", page: "calendar", onPress: () => navigation.navigate("Schedule") },
        { icon: "sparkles", value: n(s ? s.byStatus?.NEW || 0 : undefined), label: "New leads", tone: "vio", page: leadPage, onPress: () => navigation.navigate("Tabs", { screen: "Leads" }) },
        { icon: "navigate", value: n(s ? s.byStatus?.SITE_VISIT_SCHEDULED || 0 : undefined), label: "Site visits", tone: "blue", page: "calendar", onPress: () => navigation.navigate("Schedule") },
        { icon: "trophy", value: n(s?.closed), label: "Closed", tone: "ok", page: "leaderboard", onPress: () => navigation.navigate("Leaderboard") },
      ]}
      sections={[
        { title: "Next up", page: leadPage, link: s?.followUpsDue ? `All ${s.followUpsDue}` : "Schedule", linkPage: "calendar", onLink: () => navigation.navigate("Schedule"), loading: loading && !data, rows: nextUp, empty: "No follow-ups left for today" },
        { title: "My tasks", page: "tasks", link: "All tasks", onLink: () => navigation.navigate("Tabs", { screen: "Tasks" }), loading: loading && !data, rows: taskRows, empty: "No open tasks" } as SectionSpec,
      ]}
      footer={
        <LeadPicker
          open={Boolean(picker)}
          title={picker === "call" ? "Log a call with…" : "WhatsApp…"}
          onClose={() => setPicker("")}
          onPick={(lead) => {
            if (picker === "call") {
              call(lead.phone);
              navigation.navigate("UpdateLead", { leadId: lead._id });
            } else whatsapp(lead.phone);
          }}
        />
      }
    />
  );
};

const taskRow = (task: Task, onPress: () => void): RowSpec => {
  const overdue = isTaskOverdue(task);
  const dueToday = task.dueDate && dayKey(task.dueDate) === dayKey();
  const leadName = task.leadId && typeof task.leadId === "object" ? task.leadId.name : "";
  const tag = (task.tags || [])[0]?.toLowerCase() || "";
  const icon = tag.includes("call") ? "call" : tag.includes("meet") ? "people" : tag.includes("visit") ? "navigate" : tag.includes("shoot") || tag.includes("photo") ? "camera" : "document-text";
  return {
    key: task._id,
    icon,
    tone: task.priority === "HIGH" ? "warn" : "mut",
    title: task.title,
    sub: [leadName, task.priority === "HIGH" ? "High" : task.priority === "LOW" ? "Low" : ""].filter(Boolean).join(" · ") || "No lead linked",
    right: task.dueDate ? (overdue ? "Overdue" : dueToday ? "Today" : new Date(task.dueDate).toLocaleDateString("en-IN", { day: "numeric", month: "short" })) : undefined,
    rightTone: overdue ? "bad" : task.priority === "HIGH" ? "warn" : "mut",
    onPress,
  };
};

/* ===================================================== D · Field executive */
const km = (a: { lat: number; lng: number }, b: { lat: number; lng: number }) => {
  const rad = (d: number) => (d * Math.PI) / 180;
  const dLat = rad(b.lat - a.lat);
  const dLng = rad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 6371 * 2 * Math.asin(Math.sqrt(h));
};

export const FieldHome = () => {
  const navigation = useNavigation();
  const me = useUser();
  const { access } = useAuth();
  const leadsAllowed = canOpenPage(me, access, "leads") || canOpenPage(me, access, "my_leads");
  const tasksAllowed = canOpenPage(me, access, "tasks");
  const myId = me.id || me._id || "";
  const [here, setHere] = useState<{ lat: number; lng: number } | null>(null);
  const { data, loading, refreshing, refresh } = useQuery(async () => {
    const [visits, tasks, summary] = await Promise.all([
      leadsAllowed ? settle(listVisitsBetween(startOfToday(), endOfToday())) : null,
      tasksAllowed ? settle(listTasks({ assignedTo: myId })) : null,
      leadsAllowed ? settle(getLeadSummary()) : null,
    ]);
    return { visits, tasks, summary };
  }, [myId, leadsAllowed, tasksAllowed]);

  useEffect(() => {
    // Distance to the next visit only if location is already allowed - never prompt from the home screen.
    Location.getForegroundPermissionsAsync()
      .then((perm) => (perm.granted ? Location.getLastKnownPositionAsync() : null))
      .then((pos) => pos && setHere({ lat: pos.coords.latitude, lng: pos.coords.longitude }))
      .catch(() => {});
  }, []);

  const visits = (data?.visits || []).filter((lead) => ["SITE_VISIT_SCHEDULED", "SITE_VISIT", "CLOSED", "INTERESTED"].includes(String(lead.status)) || lead.nextFollowUp);
  const done = (lead: VisitLead) => lead.status !== "SITE_VISIT_SCHEDULED";
  const left = visits.filter((lead) => !done(lead));
  const next = left[0] || null;
  const openTasks = (data?.tasks || []).filter((task) => task.status !== "COMPLETED");
  const dueTasks = openTasks.filter((task) => task.dueDate && dayKey(task.dueDate) <= dayKey()).length;

  useEffect(() => {
    setTabBadges({ Tasks: dueTasks });
  }, [dueTasks]);

  const pin = next?.siteLocation?.lat && next?.siteLocation?.lng ? { lat: next.siteLocation.lat, lng: next.siteLocation.lng } : null;
  const distance = pin && here ? `${km(here, pin).toFixed(1)} km away` : next?.city || undefined;
  const navigate = () => {
    if (!next) return navigation.navigate("Tabs", { screen: "VisitsTab" });
    const url = pin ? `https://www.google.com/maps/dir/?api=1&destination=${pin.lat},${pin.lng}` : `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent([next.projectInterested, next.city].filter(Boolean).join(", ") || next.name)}`;
    Linking.openURL(url).catch(() => {});
  };

  return (
    <RoleHome
      loading={loading}
      refreshing={refreshing}
      onRefresh={refresh}
      hero={
        data
          ? {
              page: "field_ops",
              icon: "navigate",
              label: next ? `Next visit · ${shortTime(next.nextFollowUp)}` : "Visits today",
              tag: next ? distance : undefined,
              value: next ? next.projectInterested || next.name : visits.length ? "All done" : "No visits",
              unit: next && next.projectInterested && next.projectInterested.length <= 14 ? next.name : "",
              bar: visits.length
                ? [
                    { label: "Done", value: visits.length - left.length, color: HERO.white },
                    { label: "Left", value: left.length, color: HERO.dim },
                  ]
                : [],
              cta: next ? { label: "Start navigation", icon: "navigate", onPress: navigate } : { label: "Open field map", icon: "map", onPress: navigate },
            }
          : null
      }
      actions={[
        { icon: "location-outline", label: "Mark arrived", page: "my_leads", action: "edit", onPress: () => (next ? navigation.navigate("UpdateLead", { leadId: next._id }) : navigation.navigate("Tabs", { screen: "VisitsTab" })) },
        { icon: "camera-outline", label: "Site photos", page: "field_ops", action: "edit", onPress: openSitePhoto },
        { icon: "finger-print-outline", label: "Attendance", page: "attendance", onPress: () => navigation.navigate("Tabs", { screen: "Attendance" }) },
        { icon: "call-outline", label: "Call client", page: "my_leads", onPress: () => (next ? call(next.phone) : navigation.navigate("Tabs", { screen: "Leads" })) },
      ]}
      stats={[
        { icon: "checkmark-circle", value: data?.visits ? `${visits.length - left.length} / ${visits.length}` : "–", label: "Visits done", tone: "ok", page: "field_ops", onPress: () => navigation.navigate("Tabs", { screen: "VisitsTab" }) },
        { icon: "map", value: n(data?.visits ? left.length : undefined), label: "Visits left", tone: "blue", page: "field_ops", onPress: () => navigation.navigate("Tabs", { screen: "VisitsTab" }) },
        { icon: "alarm", value: n(data?.summary?.followUpsDue), label: "Follow-ups today", tone: "warn", page: "calendar", onPress: () => navigation.navigate("Schedule") },
        { icon: "checkbox", value: n(data?.tasks ? openTasks.length : undefined), label: "Open tasks", tone: "vio", page: "tasks", onPress: () => navigation.navigate("Tabs", { screen: "Tasks" }) },
      ]}
      sections={[
        {
          title: "Today's route",
          page: "field_ops",
          link: "Map",
          onLink: () => navigation.navigate("Tabs", { screen: "VisitsTab" }),
          loading: loading && !data,
          empty: "No site visits scheduled today",
          rows: visits.map((lead, index) => ({
            key: lead._id,
            page: "my_leads",
            avatar: String(index + 1),
            tone: "blue",
            title: lead.projectInterested || lead.name,
            sub: [lead.name, shortTime(lead.nextFollowUp)].filter(Boolean).join(" · "),
            right: done(lead) ? "Done" : lead._id === next?._id ? "Next" : "Later",
            rightTone: done(lead) ? "ok" : lead._id === next?._id ? "blue" : "mut",
            onPress: () => navigation.navigate("LeadDetail", { leadId: lead._id, name: lead.name }),
          })),
        },
      ]}
    />
  );
};

/* ================================================== E · Community manager */
/*
 * The coworking desk's home, read off the same booking board the web uses:
 * occupancy, what is free, renewals within 45 days, dues and birthdays.
 */
export const CommunityHome = () => {
  const navigation = useNavigation();
  const me = useUser();
  const { access } = useAuth();
  const bookingAllowed = canOpenPage(me, access, "coworking_booking");
  const clientsAllowed = canOpenPage(me, access, "coworking_clients");
  const { data, loading, refreshing, refresh, error } = useQuery(async () => {
    if (!bookingAllowed && !clientsAllowed) return null;
    const [snapshot, birthdays] = await Promise.all([fetchBoard(), clientsAllowed ? settle(fetchClientBirthdays()) : null]);
    return { cabins: snapshot.state.cabins, birthdays: birthdays || [] };
  }, [bookingAllowed, clientsAllowed]);

  const cabins = data?.cabins || [];
  const summary = summarize(cabins);
  const booked = summary.counts.BOOKED;
  const hold = summary.counts.RESERVED;
  const free = summary.counts.VACANT;
  const total = cabins.length;
  const onBoard = [...new Map(cabins.filter((cabin) => cabin.client).map((cabin) => [cabin.client!.id, cabin.client!])).values()];
  const remote = (data?.birthdays || []).map((client) => ({ ...client, id: client._id, name: client.companyName || "" }));
  const birthdays = upcomingBirthdays([...new Map([...remote, ...onBoard].map((client) => [String(client.id || client.name), client])).values()] as { id: string; name?: string; contactPerson?: string; dateOfBirth?: string }[]);
  const openBoard = () => navigation.navigate("Tabs", { screen: "BookingsTab" });
  const openClients = () => navigation.navigate("Tabs", { screen: "ClientsTab" });
  const onboard = () => navigation.navigate("Bookings", { select: true });

  return (
    <RoleHome
      loading={loading}
      refreshing={refreshing}
      onRefresh={refresh}
      hero={
        data
          ? {
              page: "coworking_booking",
              icon: "grid",
              label: "Coworking space · occupancy",
              tag: `${free} cabin${free === 1 ? "" : "s"} free`,
              value: `${summary.percent}%`,
              unit: `of ${total} cabins`,
              bar: [
                { label: "Booked", value: booked, color: HERO.white },
                { label: "Hold", value: hold, color: HERO.gold },
                { label: "Free", value: free, color: HERO.dim },
              ],
              cta: { label: "Onboard client", icon: "person-add", page: "coworking_booking", action: "edit", onPress: onboard },
            }
          : null
      }
      actions={[
        { icon: "grid-outline", label: "Board", page: "coworking_booking", onPress: openBoard },
        { icon: "person-add-outline", label: "Onboard", page: "coworking_booking", action: "edit", onPress: onboard },
        { icon: "briefcase-outline", label: "Clients", page: "coworking_clients", onPress: openClients },
        { icon: "time-outline", label: "Activity", page: "coworking_booking", onPress: () => navigation.navigate("BoardActivity") },
      ]}
      stats={[
        { icon: "cash", value: data ? compactRupees(summary.monthlyRevenue) : "–", label: "Rent a month", tone: "blue", page: "coworking_booking", onPress: openBoard },
        { icon: "enter", value: n(data ? free : undefined), label: `Vacant · ${summary.vacantCapacity} seats`, tone: "vio", page: "coworking_booking", onPress: openBoard },
        { icon: "refresh-circle", value: n(data ? summary.freeingSoon.length : undefined), label: "Ending in 45 days", tone: "warn", page: "coworking_booking", onPress: openBoard },
        { icon: "alert-circle", value: data ? compactRupees(summary.overdueAmount) : "–", label: `Dues · ${summary.overdue.length} cabin${summary.overdue.length === 1 ? "" : "s"}`, tone: "bad", page: "coworking_clients", onPress: openClients },
      ]}
      sections={
        error && !data
          ? [{ title: "Coworking", empty: "Your account can't open the coworking desk yet. Ask an admin for Booking Board access." }]
          : [
              {
                title: "Freeing up in 45 days",
                page: "coworking_booking",
                link: summary.freeingSoon.length > 4 ? `All ${summary.freeingSoon.length}` : "Board",
                onLink: openBoard,
                loading: loading && !data,
                empty: "No agreement ends in the next 45 days",
                rows: summary.freeingSoon.slice(0, 4).map(
                  (cabin) =>
                    ({
                      key: cabin.code,
                      avatar: initials(cabin.client?.name),
                      tone: (cabin.contract?.duesAmount || 0) > 0 ? "bad" : "blue",
                      title: `${cabin.label} · ${cabin.client?.name || ""}`,
                      sub: `${cabin.seats} seater · ${compactRupees(cabin.contract?.monthlyRent || 0)}/mo${(cabin.contract?.duesAmount || 0) > 0 ? ` · ${compactRupees(cabin.contract!.duesAmount)} due` : ""}`,
                      right: `${cabin.contract?.endsInDays}d`,
                      rightTone: "warn",
                      onPress: () => navigation.navigate("Cabin", { code: cabin.code }),
                    }) as RowSpec,
                ),
              },
              {
                title: "Birthdays this week",
                page: "coworking_clients",
                loading: loading && !data,
                empty: "No client birthdays in the next 7 days",
                rows: birthdays.slice(0, 4).map(
                  (client) =>
                    ({
                      key: String(client.id || client.name),
                      avatar: initials(client.contactPerson || client.name),
                      tone: "vio",
                      title: client.contactPerson || client.name || "Client",
                      sub: client.contactPerson && client.name ? client.name : "Coworking client",
                      right: client.daysUntil === 0 ? "Today" : `${client.daysUntil}d`,
                      rightTone: client.daysUntil === 0 ? "ok" : "blue",
                    }) as RowSpec,
                ),
              },
            ]
      }
    />
  );
};

/* ================================================ F · Production executive */
export const ProductionHome = () => {
  const navigation = useNavigation();
  const me = useUser();
  const { access, accessLoading, refreshAccess } = useAuth();
  const myId = me.id || me._id || "";
  const tasksAllowed = canPage(access, "tasks");
  const calendarAllowed = canPage(access, "calendar");
  const targetsAllowed = canPage(access, "targets");
  const attendanceAllowed = canPage(access, "attendance");
  const chatAllowed = canPage(access, "chat");
  const { data, loading, error, refreshing, refresh } = useQuery(async () => {
    const [tasks, conversations, attendance] = await Promise.all([
      tasksAllowed ? listTasks({ assignedTo: myId }) : Promise.resolve([] as Task[]),
      chatAllowed ? settle(listConversations()) : Promise.resolve(null),
      attendanceAllowed ? settle(getMyAttendance({ limit: 1 })) : Promise.resolve(null),
    ]);
    return {
      tasks,
      unread: conversations ? conversations.reduce((sum, room) => sum + (room.unreadCount || 0), 0) : undefined,
      attendance: attendance ? attendance.today : undefined,
    };
  }, [myId, tasksAllowed, chatAllowed, attendanceAllowed]);

  const all = data?.tasks || [];
  const open = all.filter((task) => task.status !== "COMPLETED");
  const dueToday = open.filter((task) => task.dueDate && dayKey(task.dueDate) <= dayKey());
  const upcoming = open.filter((task) => task.dueDate && dayKey(task.dueDate) > dayKey());

  useEffect(() => {
    setTabBadges({ Tasks: dueToday.length });
  }, [dueToday.length]);

  return (
    <RoleHome
      loading={accessLoading || (tasksAllowed && loading)}
      refreshing={refreshing}
      onRefresh={() => { refreshAccess(); refresh(); }}
      hero={
        tasksAllowed && data
          ? {
              icon: "checkbox",
              label: "My work",
              tag: dueToday.length ? `${dueToday.length} due today` : undefined,
              value: n(open.length),
              unit: "open tasks",
              bar: [
                { label: "Done", value: all.length - open.length, color: HERO.white },
                { label: "Open", value: open.length, color: HERO.gold },
              ],
              cta: canPageAction(access, "tasks", "create")
                ? { label: "New task", icon: "add-circle", onPress: () => navigation.navigate("NewTask") }
                : { label: "Open tasks", icon: "checkbox", onPress: () => navigation.navigate("Tabs", { screen: "Tasks" }) },
            }
          : null
      }
      actions={[
        calendarAllowed ? { icon: "calendar-outline" as const, label: "Calendar", onPress: () => navigation.navigate("Schedule") } : null,
        targetsAllowed ? { icon: "trophy-outline" as const, label: "Targets", onPress: () => navigation.navigate("Targets") } : null,
        attendanceAllowed ? { icon: "finger-print-outline" as const, label: "Attendance", onPress: () => navigation.navigate("Tabs", { screen: "Attendance" }) } : null,
        chatAllowed ? { icon: "chatbubbles-outline" as const, label: "Team chat", onPress: () => navigation.navigate("Chats") } : null,
        tasksAllowed ? { icon: "checkbox-outline" as const, label: "Tasks", onPress: () => navigation.navigate("Tabs", { screen: "Tasks" }) } : null,
      ].filter(Boolean) as { icon: "calendar-outline" | "trophy-outline" | "finger-print-outline" | "chatbubbles-outline" | "checkbox-outline"; label: string; onPress: () => void }[]}
      stats={[
        tasksAllowed ? { icon: "checkbox" as const, value: n(data ? open.length : undefined), label: "Open tasks", tone: "blue" as const, onPress: () => navigation.navigate("Tabs", { screen: "Tasks" }) } : null,
        tasksAllowed ? { icon: "alarm" as const, value: n(data ? dueToday.length : undefined), label: "Due today", tone: "warn" as const, onPress: () => calendarAllowed ? navigation.navigate("Schedule") : navigation.navigate("Tabs", { screen: "Tasks" }) } : null,
        chatAllowed ? { icon: "chatbubble" as const, value: n(data?.unread), label: "Unread chats", tone: "vio" as const, onPress: () => navigation.navigate("Chats") } : null,
        attendanceAllowed ? { icon: "finger-print" as const, value: data?.attendance === undefined ? "–" : data.attendance?.checkInAt ? "In" : "Out", label: "Attendance", tone: "ok" as const, onPress: () => navigation.navigate("Tabs", { screen: "Attendance" }) } : null,
      ].filter(Boolean) as { icon: "checkbox" | "alarm" | "chatbubble" | "finger-print"; value: string; label: string; tone: "blue" | "warn" | "vio" | "ok"; onPress: () => void }[]}
      sections={tasksAllowed ? [
        { title: "Due today", link: calendarAllowed ? "Calendar" : "Tasks", onLink: () => calendarAllowed ? navigation.navigate("Schedule") : navigation.navigate("Tabs", { screen: "Tasks" }), loading: loading && !data, rows: dueToday.slice(0, 3).map((task) => taskRow(task, () => navigation.navigate("TaskDetail", { taskId: task._id }))), empty: "Nothing due today" },
        { title: "Upcoming tasks", link: "All tasks", onLink: () => navigation.navigate("Tabs", { screen: "Tasks" }), loading: loading && !data, rows: upcoming.slice(0, 3).map((task) => taskRow(task, () => navigation.navigate("TaskDetail", { taskId: task._id }))), empty: "No upcoming tasks" },
      ] : []}
      showNotifications
      footer={!access && !accessLoading ? <Text variant="small" color="muted">Unable to load access. Pull down to retry.</Text> : error ? <Text variant="small" color="muted">{error}</Text> : null}
    />
  );
};

