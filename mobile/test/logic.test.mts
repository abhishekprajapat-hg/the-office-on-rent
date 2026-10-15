import { test } from "node:test";
import assert from "node:assert/strict";
import { countByStage, leadTemperature, normalizeStatus, statusMeta, statusStage, suggestsFollowUp } from "../src/lib/leadStatus.ts";
import { dayPhase, workedMinutesSoFar } from "../src/lib/attendanceState.ts";
import { sortTasks } from "../src/lib/taskMeta.ts";
import { followUpQuickPicks, toFollowUpPayload } from "../src/lib/followUp.ts";
import { validateNewLead } from "../src/lib/leadForm.ts";

test("follow-up quick picks adapt to the time of day", () => {
  const morning = followUpQuickPicks(new Date(2026, 9, 12, 10, 15)); // Monday 10:15
  assert.deepEqual(morning.map((pick) => pick.key), ["2h", "eve", "tom", "3d", "mon"]);
  assert.equal(morning[0]!.date.getHours(), 12);
  assert.equal(morning[1]!.date.getHours(), 18);
  const nextMonday = morning.find((pick) => pick.key === "mon")!.date;
  assert.equal(nextMonday.getDay(), 1);
  assert.equal(nextMonday.getDate(), 19); // a week out, not today

  const late = followUpQuickPicks(new Date(2026, 9, 14, 19, 30)); // Wednesday 19:30
  assert.deepEqual(late.map((pick) => pick.key), ["tom", "3d", "mon"]);
  assert.equal(late.find((pick) => pick.key === "mon")!.date.getDate(), 19);
});

test("follow-up payload is an explicit instant or null", () => {
  assert.equal(toFollowUpPayload(null), null);
  assert.equal(toFollowUpPayload(new Date(Date.UTC(2026, 9, 12, 6, 30))), "2026-10-12T06:30:00.000Z");
});

test("new lead validation", () => {
  assert.deepEqual(validateNewLead({ name: "Riya Sharma", phone: "98765 43210", email: "" }), {});
  assert.deepEqual(validateNewLead({ name: "Riya", phone: "+91 98765 43210", email: "riya@x.in" }), {});
  const bad = validateNewLead({ name: "R", phone: "12345", email: "nope" });
  assert.ok(bad.name && bad.phone && bad.email);
  assert.equal(validateNewLead({ name: "Riya", phone: "", email: "" }).phone, "Enter a phone number");
});

test("retired lead statuses read as their replacements", () => {
  assert.equal(normalizeStatus("NOT_PICKING_CALLS"), "NPC_1");
  assert.equal(normalizeStatus("requirement after 2 months"), "FOLLOW_UP_1");
  assert.equal(normalizeStatus(""), "NEW");
  assert.equal(statusMeta("NOT_PICKING_CALLS").label, "NPC 1");
});

test("unknown statuses still get a readable label", () => {
  assert.deepEqual(statusMeta("SOMETHING_ELSE"), { label: "Something else", tone: "neutral" });
});

test("statuses map onto the five stages like the web stepper", () => {
  assert.equal(statusStage("FOLLOW_UP_2"), "CONTACTED");
  assert.equal(statusStage("QUALIFIED_LEAD"), "INTERESTED");
  assert.equal(statusStage("NPC_3"), "SITE_VISIT");
  assert.equal(statusStage("CLOSED"), "CLOSED");
  assert.equal(statusStage("LOST"), null);
  assert.equal(statusStage("BROKER"), null);
});

test("countByStage rolls up the summary and skips off-path statuses", () => {
  assert.deepEqual(countByStage({ NEW: 35, CONTACTED: 4, FOLLOW_UP_2: 1, INTERESTED: 2, REQUESTED: 2, SITE_VISIT: 4, NPC_1: 1, CLOSED: 14, LOST: 7 }), {
    NEW: 35,
    CONTACTED: 5,
    INTERESTED: 4,
    SITE_VISIT: 5,
    CLOSED: 14,
  });
});

test("follow-up suggestion and temperature fallback", () => {
  assert.equal(suggestsFollowUp("CONTACTED"), true);
  assert.equal(suggestsFollowUp("CLOSED"), false);
  assert.equal(leadTemperature({ temperature: "", hotClient: true }), "HOT");
  assert.equal(leadTemperature({ temperature: "COLD", hotClient: true }), "COLD");
  assert.equal(leadTemperature({}), "");
});

const at = (h: number, m = 0) => new Date(2026, 9, 12, h, m).toISOString();

test("dayPhase", () => {
  assert.equal(dayPhase(null), "not_started");
  assert.equal(dayPhase({ checkInAt: at(10) }), "working");
  assert.equal(dayPhase({ checkInAt: at(10), breakSessions: [{ startAt: at(13) }] }), "on_break");
  assert.equal(dayPhase({ checkInAt: at(10), breakSessions: [{ startAt: at(13), endAt: at(13, 30) }] }), "working");
  assert.equal(dayPhase({ checkInAt: at(10), checkOutAt: at(19) }), "done");
});

test("workedMinutesSoFar subtracts finished and running breaks", () => {
  const now = new Date(2026, 9, 12, 14, 0);
  assert.equal(workedMinutesSoFar({ checkInAt: at(10) }, now), 240);
  assert.equal(workedMinutesSoFar({ checkInAt: at(10), breakSessions: [{ startAt: at(13), endAt: at(13, 30) }] }, now), 210);
  assert.equal(workedMinutesSoFar({ checkInAt: at(10), breakSessions: [{ startAt: at(13, 45) }] }, now), 225);
  assert.equal(workedMinutesSoFar({ checkInAt: at(10), checkOutAt: at(19), workedMinutes: 500 }, now), 500);
  assert.equal(workedMinutesSoFar(null, now), 0);
});

test("sortTasks: open first, then due date, then priority", () => {
  const tasks = [
    { id: "done", status: "COMPLETED", dueDate: "2026-10-01", priority: "HIGH" },
    { id: "undated", status: "TODO", dueDate: null, priority: "HIGH" },
    { id: "late-low", status: "TODO", dueDate: "2026-10-10", priority: "LOW" },
    { id: "late-high", status: "TODO", dueDate: "2026-10-10", priority: "HIGH" },
    { id: "soon", status: "IN_PROGRESS", dueDate: "2026-10-05", priority: "MEDIUM" },
  ];
  assert.deepEqual(sortTasks(tasks).map((task) => task.id), ["soon", "late-high", "late-low", "undated", "done"]);
});

import { breakStartedAt, dayStatusMeta, daySpan, isoDay, minutesToClock } from "../src/lib/attendanceState.ts";

test("the server's isOnBreak / activeBreakStartedAt count as a running break", () => {
  const now = new Date(2026, 9, 12, 14, 0);
  const today = { checkInAt: at(10), isOnBreak: true, activeBreakStartedAt: at(13, 30), breakSessions: [] };
  assert.equal(dayPhase(today), "on_break");
  assert.equal(breakStartedAt(today), at(13, 30));
  assert.equal(workedMinutesSoFar(today, now), 210);
});

test("attendance helpers", () => {
  assert.equal(minutesToClock(600), "10:00 AM");
  assert.equal(minutesToClock(1140), "7:00 PM");
  assert.equal(minutesToClock(720), "12:00 PM");
  assert.equal(minutesToClock(undefined), "");
  assert.equal(isoDay(new Date(2026, 0, 5)), "2026-01-05");
  assert.equal(daySpan("2026-10-12", "2026-10-12"), 1);
  assert.equal(daySpan("2026-10-30", "2026-11-02"), 4);
  assert.equal(daySpan("2026-10-13", "2026-10-12"), 0);
  assert.equal(dayStatusMeta({ status: "PRESENT", isLateCheckIn: true }).label, "Late");
  assert.equal(dayStatusMeta({ status: "ABSENT" }).tone, "danger");
  assert.equal(dayStatusMeta({ status: "SOMETHING_NEW" }).label, "Something new");
});

import { formatPrice, formatRupees, parseAmount } from "../src/lib/money.ts";
import { validateProperty } from "../src/lib/propertyForm.ts";

test("prices read in lakh and crore", () => {
  assert.equal(formatPrice(62000), "₹62,000");
  assert.equal(formatPrice(6500000), "₹65 L");
  assert.equal(formatPrice(4550000), "₹45.5 L");
  assert.equal(formatPrice(12500000), "₹1.25 Cr");
  assert.equal(formatPrice(100000000), "₹10 Cr");
  assert.equal(formatPrice(0), "");
  assert.equal(formatPrice(null), "");
  assert.equal(formatRupees(1234567), "₹12,34,567");
  assert.equal(formatRupees(999), "₹999");
});

test("amounts parse the way people type them", () => {
  assert.equal(parseAmount("65,00,000"), 6500000);
  assert.equal(parseAmount("65 lakh"), 6500000);
  assert.equal(parseAmount("1.2 Cr"), 12000000);
  assert.equal(parseAmount("45k"), 45000);
  assert.equal(parseAmount("₹ 62000"), 62000);
  assert.equal(parseAmount(""), null);
  assert.equal(parseAmount("abc"), null);
});

test("property form asks for the right price per deal type", () => {
  const base = { projectName: "Cyber Park", towerName: "Tower B", location: "Sector 39", price: null, rent: null };
  assert.deepEqual(Object.keys(validateProperty({ ...base, type: "Rent" })), ["rent"]);
  assert.deepEqual(Object.keys(validateProperty({ ...base, type: "Sale" })), ["price"]);
  assert.deepEqual(Object.keys(validateProperty({ ...base, type: "Both" })), ["price", "rent"]);
  assert.deepEqual(validateProperty({ ...base, type: "Both", price: 1, rent: 1 }), {});
  assert.ok(validateProperty({ ...base, projectName: " ", type: "Sale", price: 5 }).projectName);
});

import { addMonths, dayKey, gridRange, groupByDay, monthGrid } from "../src/lib/calendar.ts";

test("month grid starts on Monday and covers six weeks", () => {
  const grid = monthGrid(new Date(2026, 9, 1)); // October 2026 starts on a Thursday
  assert.equal(grid.length, 42);
  assert.equal(grid[0]!.key, "2026-09-28"); // the Monday before
  assert.equal(grid[0]!.inMonth, false);
  assert.equal(grid[3]!.key, "2026-10-01");
  assert.equal(grid.filter((day) => day.inMonth).length, 31);
  const { from, to } = gridRange(new Date(2026, 9, 1));
  assert.equal(dayKey(from), "2026-09-28");
  assert.equal(dayKey(to), "2026-11-08");
  assert.equal(to.getHours(), 23);
});

test("month stepping crosses years and groupByDay uses local days", () => {
  assert.equal(dayKey(addMonths(new Date(2026, 11, 15), 1)), "2027-01-01");
  assert.equal(dayKey(addMonths(new Date(2026, 0, 31), -1)), "2025-12-01");
  const groups = groupByDay(
    [{ at: new Date(2026, 9, 12, 9).toISOString() }, { at: new Date(2026, 9, 12, 23, 30).toISOString() }, { at: null }, { at: "bad" }],
    (item) => item.at,
  );
  assert.deepEqual(Object.keys(groups), ["2026-10-12"]);
  assert.equal(groups["2026-10-12"]!.length, 2);
});

import { chatTime, conversationTitle, mergeMessage, receipt, startsNewDay } from "../src/lib/chat.ts";

test("conversation titles", () => {
  const me = { _id: "me", name: "Priya" };
  const a = { _id: "a", name: "Aditya" };
  const b = { _id: "b", name: "Divya" };
  assert.equal(conversationTitle({ type: "direct", participants: [me, a] }, "me"), "Aditya");
  assert.equal(conversationTitle({ type: "group", participants: [me, a, b] }, "me"), "Aditya +1");
  assert.equal(conversationTitle({ type: "group", name: "Sales", participants: [me, a] }, "me"), "Sales");
  assert.equal(conversationTitle({ type: "lead", participants: [me, a], leadId: { name: "Riya" } }, "me"), "Lead: Riya");
});

test("receipts count only other people", () => {
  const base = { _id: "m", sender: { _id: "me", name: "" }, createdAt: "2026-10-12T10:00:00Z" };
  assert.equal(receipt({ ...base, deliveredTo: [{ user: "me" }], seenBy: [{ user: "me" }] }, "me"), "sent");
  assert.equal(receipt({ ...base, deliveredTo: [{ user: "me" }, { user: "a" }] }, "me"), "delivered");
  assert.equal(receipt({ ...base, deliveredTo: [{ user: "a" }], seenBy: [{ user: "a" }] }, "me"), "seen");
  assert.equal(receipt({ ...base, localState: "failed" }, "me"), "failed");
});

test("chat times", () => {
  const now = new Date(2026, 9, 12, 15, 0); // Monday
  assert.equal(chatTime(new Date(2026, 9, 12, 9, 5).toISOString(), now), "9:05 AM");
  assert.equal(chatTime(new Date(2026, 9, 11, 20).toISOString(), now), "Yesterday");
  assert.equal(chatTime(new Date(2026, 9, 8, 20).toISOString(), now), "Thu");
  assert.equal(chatTime(new Date(2026, 8, 1).toISOString(), now), "1 Sep");
  assert.equal(chatTime(undefined, now), "");
});

test("mergeMessage swaps the optimistic copy and keeps order", () => {
  const m = (id: string, at: string) => ({ _id: id, sender: null, createdAt: at });
  let list = [m("1", "2026-10-12T10:00:00Z"), m("local-9", "2026-10-12T10:05:00Z")];
  list = mergeMessage(list, m("2", "2026-10-12T10:05:01Z"), "local-9");
  assert.deepEqual(list.map((x) => x._id), ["1", "2"]);
  list = mergeMessage(list, m("2", "2026-10-12T10:05:01Z")); // socket echo of the same message
  assert.deepEqual(list.map((x) => x._id), ["1", "2"]);
  list = mergeMessage(list, m("0", "2026-10-12T09:00:00Z")); // older page
  assert.deepEqual(list.map((x) => x._id), ["0", "1", "2"]);
  assert.equal(startsNewDay([m("a", "2026-10-11T10:00:00"), m("b", "2026-10-12T10:00:00")], 1), true);
});

import { budgetLabel, missingDetails, requirementSummary } from "../src/lib/leadDepth.ts";

test("missing details checklist", () => {
  assert.deepEqual(missingDetails({ status: "NEW" }), ["Email", "Preferred location", "Property type", "Buy / rent / lease", "Budget", "Next follow-up"]);
  const complete = { status: "CONTACTED", email: "a@b.in", city: "Noida", nextFollowUp: "2026-10-13", requirements: { inventoryType: "RESIDENTIAL", transactionType: "SALE", budgetMax: 8000000 } };
  assert.deepEqual(missingDetails(complete), []);
  assert.deepEqual(missingDetails({ ...complete, status: "CLOSED", nextFollowUp: null }), []);
});

test("requirement summary and budget", () => {
  assert.equal(budgetLabel(6000000, 8000000), "₹60 L – ₹80 L");
  assert.equal(budgetLabel(null, 12500000), "Up to ₹1.25 Cr");
  assert.equal(budgetLabel(null, null), "");
  assert.equal(
    requirementSummary({ inventoryType: "RESIDENTIAL", transactionType: "SALE", residential: { bhkType: "2BHK" }, budgetMin: 6000000, budgetMax: 8000000 }),
    "Residential 2BHK to buy · ₹60 L – ₹80 L",
  );
  assert.equal(requirementSummary({ inventoryType: "COMMERCIAL", transactionType: "LEASE" }), "Commercial on lease");
  assert.equal(requirementSummary(undefined), "");
});

import { activeFilterCount, filterError, filterParams } from "../src/lib/leadFilters.ts";

test("lead filters become clean query params", () => {
  assert.deepEqual(filterParams({ source: "", city: " Noida ", budgetMin: 5000000, budgetMax: null, inventoryType: "RESIDENTIAL" }), {
    city: "Noida",
    budgetMin: "5000000",
    inventoryType: "RESIDENTIAL",
  });
  assert.equal(activeFilterCount({}), 0);
  assert.equal(activeFilterCount({ budgetMin: 1, budgetMax: 2, createdFrom: "2026-10-01", city: "x" }), 3);
  assert.equal(filterError({ budgetMin: 9, budgetMax: 2 }), "Minimum budget is higher than the maximum.");
  assert.equal(filterError({ createdFrom: "2026-10-12", createdTo: "2026-10-01" }), "A 'from' date is after its 'to' date.");
  assert.equal(filterError({ createdFrom: "2026-10-01", createdTo: "2026-10-12" }), null);
});

import { parseMatrices, resolveBulkLeadStatus, normalizeBulkAmount } from "../src/lib/bulkLeads.ts";

test("bulk sheet parsing matches the web parser", () => {
  const matrix = [
    ["Leads export"],
    ["Client Name", "Mobile No", "Location", "Requirement", "Budget", "Lead Status", "Follow Up Date"],
    ["Riya Sharma", "+91 98100-01002", "Noida", "20 seats office", "1.5 lakh", "interested", "15/10/2026"],
    ["", "9810001099", "Gurugram", "2 cabins", "", "npc 2", ""],
    ["No phone person", "abc", "", "", "", "", ""],
  ];
  const rows = parseMatrices([{ name: "Sheet1", matrix }], "COMMERCIAL");
  assert.equal(rows.length, 2);
  assert.equal(rows[0].name, "Riya Sharma");
  assert.equal(rows[0].phone, "9810001002");
  assert.equal(rows[0].status, "INTERESTED");
  assert.equal(rows[0].requirements.commercial.seats, 20);
  assert.equal(rows[0].requirements.budgetMax, 150000);
  assert.equal(new Date(rows[0].nextFollowUp).getDate(), 15);
  assert.equal(rows[1].name, "Lead 9810001099");
  assert.equal(rows[1].status, "NPC_2");
  assert.equal(rows[1].requirements.commercial.cabins, 2);
  // Summary sheets the web skips are skipped here too.
  assert.equal(parseMatrices([{ name: "Performance", matrix }], "COMMERCIAL").length, 0);
});

test("bulk status and amount heuristics", () => {
  assert.equal(resolveBulkLeadStatus({ sheetName: "", row: { status: "Site visit scheduled" } }), "SITE_VISIT_SCHEDULED");
  assert.equal(resolveBulkLeadStatus({ sheetName: "Closed deals", row: {} }), "CLOSED");
  assert.equal(resolveBulkLeadStatus({ sheetName: "", row: {} }), "NEW");
  assert.equal(normalizeBulkAmount("45 k"), 45000);
  assert.equal(normalizeBulkAmount("2.5 lakh"), 250000);
});

import { planReminders } from "../src/lib/reminderPlan.ts";

test("follow-up reminders: 10 minutes early, skip past and closed, never doubled", () => {
  const now = new Date(2026, 9, 12, 10, 0);
  const at = (h: number, m = 0) => new Date(2026, 9, 12, h, m).toISOString();
  const plan = planReminders(
    [
      { _id: "a", name: "Riya", phone: "98", nextFollowUp: at(15, 30), status: "CONTACTED" },
      { _id: "b", name: "Past", nextFollowUp: at(9), status: "NEW" },
      { _id: "c", name: "Closed", nextFollowUp: at(16), status: "CLOSED" },
      { _id: "d", name: "Soon", nextFollowUp: at(10, 5), status: "NEW" },
      { _id: "e", name: "None", nextFollowUp: null, status: "NEW" },
    ],
    now,
  );
  assert.deepEqual(plan.map((item) => item.leadId), ["d", "a"]);
  assert.equal(plan[1]!.at.getHours() * 60 + plan[1]!.at.getMinutes(), 15 * 60 + 20);
  assert.equal(plan[0]!.at.getTime(), now.getTime() + 60000); // inside the window -> in a minute
  assert.equal(plan[1]!.title, "Follow up with Riya");
  assert.equal(plan[1]!.body, "Due at 3:30 PM · 98");
  assert.equal(plan[1]!.key, `followup:a:${new Date(at(15, 30)).getTime()}`);
  assert.equal(planReminders([{ _id: "x", name: "x", nextFollowUp: at(18) }], now, 10, 0).length, 0);
});

import { activityLabel, completionRate, workloadFor } from "../src/lib/workload.ts";

test("workload matches the web's thresholds", () => {
  assert.equal(workloadFor(null), "offline");
  assert.equal(workloadFor({ total: 4, COMPLETED: 4, overdue: 0 }), "available");
  assert.equal(workloadFor({ total: 4, COMPLETED: 1, overdue: 0 }), "balanced");
  assert.equal(workloadFor({ total: 6, COMPLETED: 1, overdue: 0 }), "busy");
  assert.equal(workloadFor({ total: 2, COMPLETED: 0, overdue: 1 }), "busy");
  assert.equal(completionRate({ total: 8, COMPLETED: 4 }), 50);
  assert.equal(completionRate({ total: 0 }), 0);
  assert.equal(activityLabel("COMMENTED"), "commented");
  assert.equal(activityLabel("STATUS_CHANGED", "To do → Done"), "changed the status: To do → Done");
});

import { pushRoute } from "../src/lib/pushRoute.ts";

test("push notifications open the right screen", () => {
  const id = "6ac49e3d6f4d766faefaa841";
  assert.equal(pushRoute({ url: "/chat", tag: `chat:${id}` }), `chats/${id}`);
  assert.equal(pushRoute({ url: "/tasks", tag: `task:${id}:abc` }), `tasks/${id}`);
  assert.equal(pushRoute({ url: "/tasks" }), "tasks");
  assert.equal(pushRoute({ url: `/leads/${id}` }), `leads/${id}`);
  assert.equal(pushRoute({ url: "/admin/notifications?tab=payments" }), "approvals");
  assert.equal(pushRoute({ url: "/" }), "");
  assert.equal(pushRoute(null), "");
});
