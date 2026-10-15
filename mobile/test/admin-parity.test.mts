import { test } from "node:test";
import assert from "node:assert/strict";
import { atTimeOn, canCorrectBreaks, canManageBreakNow, canSetStatusOn, isLeaveRequestDay, statusClearsCheckIn, teamBucket, todayKeyIn } from "../src/lib/attendanceAdmin.ts";
import { describeRule, describeSchedule, fromRuleDraft, ruleDraftError, ruleError, toRuleDraft, validateNamedDeduction } from "../src/lib/payroll.ts";
import { activityLabel, describeChanges, inventoryAccess, validateSale } from "../src/lib/inventoryAccess.ts";
import { validateProjectDraft, type ProjectDraft } from "../src/lib/projectForm.ts";

test("manual attendance statuses that wipe a worked day", () => {
  assert.equal(statusClearsCheckIn("ABSENT"), true);
  assert.equal(statusClearsCheckIn("leave"), true);
  assert.equal(statusClearsCheckIn("WEEK_OFF"), true);
  assert.equal(statusClearsCheckIn("PRESENT"), false);
  assert.equal(statusClearsCheckIn("HALF_DAY"), false);
});

test("a day's status can be set up to today, never ahead", () => {
  assert.equal(canSetStatusOn("2026-10-15", "2026-10-15"), true);
  assert.equal(canSetStatusOn("2026-09-30", "2026-10-15"), true);
  assert.equal(canSetStatusOn("2026-10-16", "2026-10-15"), false);
  assert.equal(canSetStatusOn(undefined, "2026-10-15"), false);
});

test("break actions follow the server's rules", () => {
  assert.equal(canCorrectBreaks({ checkInAt: "2026-10-15T04:00:00Z" }), true);
  assert.equal(canCorrectBreaks({ status: "ABSENT" }), false);
  assert.equal(canManageBreakNow({ checkInAt: "2026-10-15T04:00:00Z" }), true);
  assert.equal(canManageBreakNow({ checkInAt: "2026-10-15T04:00:00Z", checkOutAt: "2026-10-15T13:00:00Z" }), false);
  assert.equal(isLeaveRequestDay({ _id: "leave:abc:2026-10-01" }), true);
  assert.equal(isLeaveRequestDay({ _id: "65f0" }), false);
});

test("team day buckets", () => {
  assert.equal(teamBucket({ checkInAt: "x" }), "in");
  assert.equal(teamBucket({ checkInAt: "x", isOnBreak: true }), "break");
  assert.equal(teamBucket({ checkInAt: "x", checkOutAt: "y" }), "out");
  assert.equal(teamBucket({ status: "LEAVE" }), "leave");
  assert.equal(teamBucket({ status: "WEEK_OFF" }), "leave");
  assert.equal(teamBucket({ status: "ABSENT" }), "absent");
  assert.equal(teamBucket(null), "absent");
});

test("times picked on a phone land on the attendance date", () => {
  const placed = atTimeOn("2026-10-12", new Date(2026, 0, 1, 14, 35));
  assert.equal(placed.getFullYear(), 2026);
  assert.equal(placed.getMonth(), 9);
  assert.equal(placed.getDate(), 12);
  assert.equal(placed.getHours(), 14);
  assert.equal(placed.getMinutes(), 35);
  assert.match(todayKeyIn("Asia/Kolkata", new Date(Date.UTC(2026, 9, 14, 20, 0))), /^2026-10-15$/);
  assert.match(todayKeyIn("Not/AZone"), /^\d{4}-\d{2}-\d{2}$/);
});

test("deduction rules read in their own unit", () => {
  assert.equal(describeRule({ unit: "DAYS", value: 1 }), "1 day of pay");
  assert.equal(describeRule({ unit: "DAYS", value: 0.5 }), "0.5 days of pay");
  assert.equal(describeRule({ unit: "DAYS", value: 0 }), "Nothing");
  assert.equal(describeRule({ unit: "AMOUNT", value: 1500 }), "₹1,500");
  assert.equal(describeRule({ unit: "PERCENT", value: 5 }), "5% of salary");
  assert.equal(ruleError("Absent", { unit: "DAYS", value: "6" }), "Absent can be at most 5 days of pay");
  assert.equal(ruleError("Absent", { unit: "AMOUNT", value: "6" }), null);
  assert.equal(ruleError("Absent", { unit: "PERCENT", value: "" }), "Absent needs a number");
});

test("rule drafts round-trip", () => {
  const draft = toRuleDraft({ absent: { unit: "DAYS", value: 1 }, late: { unit: "AMOUNT", value: 200 } });
  assert.equal(draft.halfDay.unit, "DAYS");
  assert.equal(draft.halfDay.value, "0");
  assert.equal(ruleDraftError(draft), null);
  assert.deepEqual(fromRuleDraft(draft).late, { unit: "AMOUNT", value: 200 });
  assert.match(String(ruleDraftError({ ...draft, paidLeave: { unit: "PERCENT", value: "101" } })), /Paid leave/);
});

test("named deductions are checked like the server checks them", () => {
  const ok = validateNamedDeduction({ name: " Loan EMI ", unit: "AMOUNT", value: "2500", frequency: "MONTHLY", fromMonth: "2026-10", toMonth: "" });
  assert.deepEqual(ok, { deduction: { name: "Loan EMI", unit: "AMOUNT", value: 2500, frequency: "MONTHLY", fromMonth: "2026-10", toMonth: "" } });
  const once = validateNamedDeduction({ name: "Advance", unit: "AMOUNT", value: "1000", frequency: "ONCE", fromMonth: "2026-11", toMonth: "2027-01" });
  assert.equal("deduction" in once && once.deduction.toMonth, "2026-11");
  assert.ok("error" in validateNamedDeduction({ name: "", unit: "AMOUNT", value: "1", frequency: "MONTHLY", fromMonth: "2026-10", toMonth: "" }));
  assert.ok("error" in validateNamedDeduction({ name: "X", unit: "PERCENT", value: "120", frequency: "MONTHLY", fromMonth: "2026-10", toMonth: "" }));
  assert.ok("error" in validateNamedDeduction({ name: "X", unit: "AMOUNT", value: "10", frequency: "MONTHLY", fromMonth: "2026-10", toMonth: "2026-09" }));
  const label = (key: string) => key;
  assert.equal(describeSchedule({ frequency: "ONCE", fromMonth: "2026-10" }, label), "2026-10 only");
  assert.equal(describeSchedule({ frequency: "MONTHLY", fromMonth: "2026-10", toMonth: "2027-03" }, label), "2026-10 – 2027-03");
  assert.equal(describeSchedule({ frequency: "MONTHLY", fromMonth: "2026-10" }, label), "Every month from 2026-10");
});

test("inventory permissions mirror the web", () => {
  const admin = inventoryAccess("ADMIN", null);
  assert.equal(admin.canManage && admin.canDeleteDirect && !admin.canRequestDelete, true);
  const manager = inventoryAccess("MANAGER", { permissions: ["page.inventory.delete"], enforcePageAccess: true, hasExplicitPageOverride: true });
  assert.equal(manager.canManage, true);
  assert.equal(manager.canDeleteDirect, false); // a manager's delete is always a request
  assert.equal(manager.canRequestDelete, true);
  const exec = inventoryAccess("EXECUTIVE", { permissions: ["page.inventory.view", "page.inventory.edit"], enforcePageAccess: false });
  assert.equal(exec.canManage, false);
  assert.equal(exec.canEdit, true);
  assert.equal(exec.canRequestDelete, true);
  assert.equal(exec.canSeeActivity, false);
  const granted = inventoryAccess("EXECUTIVE", { permissions: ["page.inventory.edit"], enforcePageAccess: true, hasExplicitPageOverride: true });
  assert.equal(granted.canManage, true);
  const partner = inventoryAccess("CHANNEL_PARTNER", { permissions: ["page.inventory.view"], enforcePageAccess: false });
  assert.equal(partner.canEdit || partner.canChangeStatus || partner.canRequestDelete, false);
});

test("sold needs a buyer and the payment", () => {
  const base = { leadId: "l1", paymentMode: "UPI", paymentType: "FULL" as const, totalAmount: 5000000, remainingAmount: 0, paymentReference: "UTR1" };
  assert.equal(validateSale(base), null);
  assert.equal(validateSale({ ...base, leadId: "" }), "Pick the lead it was sold to");
  assert.equal(validateSale({ ...base, paymentReference: "" }), "Enter the payment reference");
  assert.equal(validateSale({ ...base, paymentMode: "CASH", paymentReference: "" }), null);
  assert.equal(validateSale({ ...base, paymentType: "PARTIAL", remainingAmount: null }), "Enter the amount still to come");
  assert.equal(validateSale({ ...base, totalAmount: null }), "Enter the sold amount");
});

test("property activity reads as plain changes", () => {
  assert.equal(activityLabel("DIRECT_UPDATE"), "Edited");
  assert.equal(activityLabel("SOMETHING_NEW"), "something new");
  assert.deepEqual(describeChanges({ status: "Available", updatedAt: "x" }, { status: "Blocked", reservationReason: "Token", updatedAt: "y" }), [
    "status: Available → Blocked",
    "reservation reason: — → Token",
  ]);
  assert.deepEqual(describeChanges(null, { images: ["a", "b"] }), ["images: — → 2 items"]);
});

const project = (patch: Partial<ProjectDraft> = {}): ProjectDraft => ({
  projectCategory: "RESIDENTIAL",
  projectType: "PLOTTING",
  projectName: "Green Acres",
  totalLandArea: "12 acres",
  status: "PRE_LAUNCH",
  startingRate: 4000,
  currentRate: 4500,
  totalPlots: "120",
  plotsAvailable: "40",
  plotSize: "",
  customPlotSize: "",
  numberOfFlats: "",
  numberOfFloors: "",
  flatsPerFloor: "",
  bhk: [],
  totalFloors: "",
  officesPerFloor: "",
  ownerManagerMobile: "",
  brokerManagerMobile: "",
  ...patch,
});

test("project form checks follow the server's per-type rules", () => {
  assert.equal(validateProjectDraft(project()), null);
  assert.equal(validateProjectDraft(project({ currentRate: 3000 })), "The current rate can't be below the starting rate");
  assert.equal(validateProjectDraft(project({ plotsAvailable: "200" })), "Plots available can't exceed total plots");
  assert.equal(validateProjectDraft(project({ plotSize: "CUSTOM" })), "Enter the custom plot size");
  assert.equal(validateProjectDraft(project({ projectType: "" })), "Pick the project type");
  const building = project({ projectType: "BUILDING", numberOfFlats: "80", numberOfFloors: "10", flatsPerFloor: "8", bhk: [{ bhk: "2_BHK", size: "1100" }] });
  assert.equal(validateProjectDraft(building), null);
  assert.equal(validateProjectDraft({ ...building, bhk: [] }), "Add at least one BHK configuration");
  assert.equal(validateProjectDraft({ ...building, bhk: [{ bhk: "2_5_BHK", size: "1" }, { bhk: "2_5_BHK", size: "2" }] }), "2.5 BHK is listed twice");
  assert.equal(validateProjectDraft(project({ projectCategory: "COMMERCIAL", totalFloors: "12", officesPerFloor: "6" })), null);
  assert.equal(validateProjectDraft(project({ projectCategory: "COMMERCIAL", totalFloors: "12" })), "Enter offices per floor");
  assert.equal(validateProjectDraft(project({ ownerManagerMobile: "98765" })), "Owner manager mobile must be 10 digits");
});
