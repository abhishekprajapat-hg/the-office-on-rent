// Daily reports + checkout gate (requirements 16 Oct 2026, sections 01-02).
const test = require("node:test");
const assert = require("node:assert/strict");

const { resolveDailyReportFormKey, DAILY_REPORT_FORMS } = require("../src/constants/dailyReport.constants");
const { normalizeSubmission, summarizeEmployee, parseDateRange, DailyReportValidationError } = require("../src/services/dailyReport.service");

test("each role and segment gets its own form; nobody picks", () => {
  const f = (role, roleType) => resolveDailyReportFormKey({ role, roleType });
  assert.equal(f("EXECUTIVE", "COMMERCIAL"), "COMMERCIAL_EXECUTIVE");
  assert.equal(f("INSIDE_EXECUTIVE", "BOTH"), "COMMERCIAL_EXECUTIVE");
  assert.equal(f("EXECUTIVE", "COWORKING"), "COWORKING_EXECUTIVE");
  assert.equal(f("FIELD_EXECUTIVE", "COMMERCIAL"), "COMMERCIAL_FIELD_EXECUTIVE");
  assert.equal(f("FIELD_EXECUTIVE", "RESIDENTIAL"), "RESIDENTIAL_FIELD_EXECUTIVE");
  assert.equal(f("MANAGER", "RESIDENTIAL"), "RESIDENTIAL_MANAGER");
  assert.equal(f("PRODUCTION_EXECUTIVE", "COMMERCIAL"), "PRODUCTION");
  assert.equal(f("COMMUNITY_MANAGER", "COMMERCIAL"), "PRODUCTION");
  assert.equal(f("COWORKING_ADMIN", "COWORKING"), "COWORKING_ADMIN");
  assert.equal(f("ADMIN", "COMMERCIAL"), null);
  assert.equal(f("CHANNEL_PARTNER", "COMMERCIAL"), null);
});

test("forms carry the fields the brief lists", () => {
  const keys = (k) => DAILY_REPORT_FORMS[k].fields.map((x) => x.key);
  assert.deepEqual(keys("COMMERCIAL_EXECUTIVE"), ["newLeadCalls", "followUpCalls", "inventoryCalls", "siteVisitsScheduled", "otherWork"]);
  assert.ok(keys("COWORKING_EXECUTIVE").includes("cabinsClosed"));
  assert.ok(keys("COMMERCIAL_FIELD_EXECUTIVE").includes("newInventorySourced"));
  assert.ok(!keys("RESIDENTIAL_MANAGER").includes("siteVisitsCompleted"), "manager form has no visits-completed field");
  assert.ok(keys("PRODUCTION").includes("postsPublished"));
  assert.equal(DAILY_REPORT_FORMS.COWORKING_ADMIN.hasIssues, true);
});

const zeroCounts = (formKey) => Object.fromEntries(
  DAILY_REPORT_FORMS[formKey].fields.filter((f) => f.kind === "count").map((f) => [f.key, 0]),
);

test("zero is a valid answer everywhere", () => {
  for (const key of Object.keys(DAILY_REPORT_FORMS)) {
    const out = normalizeSubmission(key, { counts: zeroCounts(key) });
    Object.values(out.counts).forEach((v) => assert.equal(v, 0));
  }
});

test("a blank count is refused (enter 0), negatives and fractions too", () => {
  const counts = zeroCounts("COMMERCIAL_EXECUTIVE");
  delete counts.newLeadCalls;
  assert.throws(() => normalizeSubmission("COMMERCIAL_EXECUTIVE", { counts }), DailyReportValidationError);
  assert.throws(() => normalizeSubmission("COMMERCIAL_EXECUTIVE", { counts: { ...zeroCounts("COMMERCIAL_EXECUTIVE"), newLeadCalls: -1 } }), /0 or more/);
  assert.throws(() => normalizeSubmission("COMMERCIAL_EXECUTIVE", { counts: { ...zeroCounts("COMMERCIAL_EXECUTIVE"), newLeadCalls: 2.5 } }), /whole number/);
  const ok = normalizeSubmission("COMMERCIAL_EXECUTIVE", { counts: { ...zeroCounts("COMMERCIAL_EXECUTIVE"), newLeadCalls: "12" } });
  assert.equal(ok.counts.newLeadCalls, 12);
});

test("cabins cleaned must be 0-65", () => {
  assert.throws(() => normalizeSubmission("COWORKING_ADMIN", { counts: { cabinsCleaned: 66 } }), /between 0 and 65/);
  assert.equal(normalizeSubmission("COWORKING_ADMIN", { counts: { cabinsCleaned: 65 } }).counts.cabinsCleaned, 65);
});

test("new + follow-up calls can't be more than total calls", () => {
  const base = zeroCounts("COMMERCIAL_FIELD_EXECUTIVE");
  assert.throws(
    () => normalizeSubmission("COMMERCIAL_FIELD_EXECUTIVE", { counts: { ...base, totalCalls: 5, newLeadCalls: 4, followUpCalls: 2 } }),
    /can't be more than Total calls/,
  );
  const ok = normalizeSubmission("COMMERCIAL_FIELD_EXECUTIVE", { counts: { ...base, totalCalls: 10, newLeadCalls: 4, followUpCalls: 2 } });
  assert.equal(ok.counts.totalCalls, 10);
});

test("coworking admin can log several issues in one report; empty rows are dropped", () => {
  const out = normalizeSubmission("COWORKING_ADMIN", {
    counts: { cabinsCleaned: 20 },
    issues: [
      { category: "MAINTENANCE", description: "Wi-Fi router down", location: "2nd floor", actionTaken: "Restarted", status: "RESOLVED", priority: "HIGH" },
      { category: "HOUSEKEEPING", description: "Washroom cleaning complaint" },
      { category: "", description: "" },
    ],
  });
  assert.equal(out.issues.length, 2);
  assert.equal(out.issues[1].status, "PENDING");
  assert.equal(out.issues[1].priority, "MEDIUM");
  assert.throws(() => normalizeSubmission("COWORKING_ADMIN", { counts: { cabinsCleaned: 1 }, issues: [{ category: "BAD", description: "x" }] }), /category/);
  assert.throws(() => normalizeSubmission("COWORKING_ADMIN", { counts: { cabinsCleaned: 1 }, issues: [{ category: "OTHER", description: "" }] }), /description/);
});

test("other forms ignore issues", () => {
  const out = normalizeSubmission("COMMERCIAL_EXECUTIVE", { counts: zeroCounts("COMMERCIAL_EXECUTIVE"), issues: [{ category: "OTHER", description: "x" }] });
  assert.deepEqual(out.issues, []);
});

test("period totals are plain sums; averages divide by days reported; missing days are not zero", () => {
  const user = { _id: "u1", name: "Divya", role: "EXECUTIVE", roleType: "COMMERCIAL" };
  const r = (reportDate, newLeadCalls, followUpCalls) => ({
    reportDate, formKey: "COMMERCIAL_EXECUTIVE", counts: { newLeadCalls, followUpCalls, inventoryCalls: 0, siteVisitsScheduled: 0 }, notes: {}, issues: [], amendments: [],
  });
  const s = summarizeEmployee({
    user,
    reports: [r("2026-10-02", 10, 4), r("2026-10-01", 6, 2)],
    workedDates: ["2026-10-01", "2026-10-02", "2026-10-03"],
  });
  assert.equal(s.totals.newLeadCalls, 16);
  assert.equal(s.totals.followUpCalls, 6);
  assert.equal(s.daysSubmitted, 2);
  assert.equal(s.averages.newLeadCalls, 8, "16 / 2 reported days, not / 3 worked days");
  assert.deepEqual(s.missingDates, ["2026-10-03"]);
  assert.deepEqual(s.days.map((d) => d.reportDate), ["2026-10-01", "2026-10-02"], "daily rows in date order");
  assert.equal(s.totals.totalCalls, undefined, "no invented grand total of calls");
  // Totals reconcile to the daily rows.
  assert.equal(s.days.reduce((a, d) => a + d.counts.newLeadCalls, 0), s.totals.newLeadCalls);
});

test("date range: single day, custom range, across months; bad input refused", () => {
  assert.deepEqual(parseDateRange({}, "2026-10-19"), { from: "2026-10-19", to: "2026-10-19" });
  assert.deepEqual(parseDateRange({ date: "2026-10-05" }, "2026-10-19"), { from: "2026-10-05", to: "2026-10-05" });
  assert.deepEqual(parseDateRange({ from: "2026-09-15", to: "2026-10-15" }, "x"), { from: "2026-09-15", to: "2026-10-15" });
  assert.throws(() => parseDateRange({ from: "2026-10-15", to: "2026-10-01" }, "x"), /after/);
  assert.throws(() => parseDateRange({ from: "15/10/2026" }, "x"), /YYYY-MM-DD/);
});

test("filters narrow the scoped people by person, role and segment", () => {
  const { filterScopedUsers } = require("../src/controllers/dailyReport.controller")._test;
  const people = [
    { _id: "a", role: "EXECUTIVE", roleType: "COMMERCIAL" },
    { _id: "b", role: "FIELD_EXECUTIVE", roleType: "RESIDENTIAL" },
    { _id: "c", role: "EXECUTIVE", roleType: "COWORKING" },
  ];
  assert.deepEqual(filterScopedUsers(people, { role: "EXECUTIVE" }).map((p) => p._id), ["a", "c"]);
  assert.deepEqual(filterScopedUsers(people, { roleType: "residential" }).map((p) => p._id), ["b"]);
  assert.deepEqual(filterScopedUsers(people, { userId: "a,c" }).map((p) => p._id), ["a", "c"]);
  // A userId outside scope can't be added by asking for it.
  assert.deepEqual(filterScopedUsers(people, { userId: "zzz" }), []);
});

test("checkout gate: roles with a form are held until the report exists; Admin never", async () => {
  const DailyReport = require("../src/models/DailyReport");
  const { isDailyReportMissing } = require("../src/controllers/attendance.controller");
  const original = DailyReport.exists;
  try {
    DailyReport.exists = async () => null;
    assert.equal(await isDailyReportMissing({ user: { role: "EXECUTIVE", roleType: "COMMERCIAL", companyId: "c", _id: "u" }, attendanceDate: "2026-10-19" }), true);
    assert.equal(await isDailyReportMissing({ user: { role: "ADMIN", companyId: "c", _id: "u" }, attendanceDate: "2026-10-19" }), false);
    DailyReport.exists = async () => ({ _id: "r" });
    assert.equal(await isDailyReportMissing({ user: { role: "EXECUTIVE", roleType: "COMMERCIAL", companyId: "c", _id: "u" }, attendanceDate: "2026-10-19" }), false);
  } finally {
    DailyReport.exists = original;
  }
});

test("one report per person per day is enforced by the database", () => {
  const DailyReport = require("../src/models/DailyReport");
  const unique = DailyReport.schema.indexes().find(([fields, opts]) => fields.userId && fields.reportDate && opts.unique);
  assert.ok(unique);
});
