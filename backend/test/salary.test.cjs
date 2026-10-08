// Salary and attendance deductions (8 Oct 2026).
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const { createRequire } = require("node:module");

const {
  calculateMonthlySalary,
  resolveSalaryForMonth,
  toPayrollPolicyView,
  DEFAULT_PAYROLL_POLICY,
} = require("../src/services/payroll.calc");

// October 2026: 31 days, the 1st is a Thursday, Sundays are the 4th, 11th,
// 18th and 25th - so 27 working days with Sunday off.
const OCT = "2026-10";
const day = (attendanceDate, status, extra = {}) => ({ attendanceDate, status, checkInAt: null, ...extra });
const worked = (attendanceDate, extra = {}) => day(attendanceDate, "PRESENT", { checkInAt: `${attendanceDate}T05:00:00.000Z`, ...extra });
const late = (attendanceDate) => worked(attendanceDate, { isLateCheckIn: true });
const line = (result, key) => result.lines.find((row) => row.key === key);

const calc = (overrides = {}) => calculateMonthlySalary({
  monthKey: OCT,
  todayKey: "2026-10-08",
  monthlySalary: 31000,
  policy: DEFAULT_PAYROLL_POLICY,
  weeklyOffDays: [0],
  days: [],
  ...overrides,
});

/* ------------------------------------------------------------ per-day rate -- */

test("the per-day rate follows the chosen basis", () => {
  assert.equal(calc().perDayRate, 1000, "31,000 over October's 31 days");
  assert.equal(calc({ policy: { perDayBasis: "WORKING_DAYS" } }).perDayRate, 1148.15, "over its 27 working days");
  assert.equal(calc({ policy: { perDayBasis: "FIXED_DAYS", fixedDaysPerMonth: 30 } }).perDayRate, 1033.33);
  assert.equal(calc({ policy: { perDayBasis: "FIXED_DAYS", fixedDaysPerMonth: 26 } }).divisor, 26);
});

/* ----------------------------------------------------------- deductions -- */

test("an absence costs a day and every three lates cost half a day, by default", () => {
  const result = calc({
    days: [worked("2026-10-01"), worked("2026-10-02"), late("2026-10-03"), day("2026-10-05", "ABSENT"),
      late("2026-10-06"), worked("2026-10-07"), late("2026-10-08")],
  });
  assert.equal(line(result, "absent").count, 1);
  assert.equal(line(result, "absent").amount, 1000);
  assert.deepEqual(line(result, "absent").dates, ["2026-10-05"]);
  assert.equal(line(result, "late").count, 3);
  assert.equal(line(result, "late").amount, 500);
  assert.equal(result.totalDeduction, 1500);
  assert.equal(result.netSalary, 29500);
  assert.equal(result.throughDate, "2026-10-08");
});

test("half days, unpaid leave and paid leave each follow their own rule", () => {
  const result = calc({
    days: [
      day("2026-10-01", "HALF_DAY", { checkInAt: "2026-10-01T05:00:00.000Z" }),
      day("2026-10-02", "LEAVE", { source: "UNPAID" }),
      day("2026-10-03", "LEAVE", { source: "SICK" }),
      day("2026-10-05", "LEAVE", { source: "MANUAL" }),
    ],
  });
  assert.equal(line(result, "halfDay").amount, 500);
  assert.equal(line(result, "unpaidLeave").amount, 1000);
  assert.equal(line(result, "paidLeave").count, 2, "approved leave and leave an admin marked are both paid");
  assert.equal(line(result, "paidLeave").amount, 0);
  assert.equal(result.totalDeduction, 1500);
});

test("an absence on a day with a pending or rejected leave request is unapproved leave", () => {
  const result = calc({
    policy: { unapprovedLeaveDays: 1.5 },
    days: [day("2026-10-05", "ABSENT"), day("2026-10-06", "ABSENT")],
    unapprovedLeaveDates: ["2026-10-06"],
  });
  assert.equal(line(result, "absent").count, 1);
  assert.equal(line(result, "unapprovedLeave").count, 1);
  assert.equal(line(result, "unapprovedLeave").amount, 1500);
});

test("days after today are not judged yet", () => {
  const result = calc({ days: [day("2026-10-20", "ABSENT"), day("2026-10-21", "LEAVE", { source: "UNPAID" })] });
  assert.equal(result.totalDeduction, 0);
  assert.equal(result.netSalary, 31000);
});

test("a month that has not started has nothing deducted", () => {
  const result = calc({ monthKey: "2026-11", days: [day("2026-11-02", "ABSENT")] });
  assert.equal(result.isFutureMonth, true);
  assert.equal(result.throughDate, null);
  assert.equal(result.totalDeduction, 0);
});

test("a past month is judged to its last day", () => {
  const result = calc({ todayKey: "2026-11-03", days: [day("2026-10-31", "ABSENT")] });
  assert.equal(result.throughDate, "2026-10-31");
  assert.equal(result.isMonthComplete, true);
  assert.equal(line(result, "absent").count, 1);
});

test("late rules: free lates first, then a flat amount per late", () => {
  const lates = ["2026-10-01", "2026-10-02", "2026-10-03", "2026-10-05", "2026-10-06"].map(late);
  const result = calc({
    policy: { lateGraceCount: 2, lateEveryCount: 1, lateDeductionUnit: "AMOUNT", lateDeductionValue: 100 },
    days: lates,
  });
  assert.equal(line(result, "late").count, 5);
  assert.equal(line(result, "late").chargeableCount, 3);
  assert.equal(line(result, "late").amount, 300);
});

test("a late check-in is not counted on a day with no check-in", () => {
  const result = calc({ days: [day("2026-10-05", "ABSENT", { isLateCheckIn: true })] });
  assert.equal(line(result, "late").count, 0);
});

test("days before the joining date are not paid, and not counted absent", () => {
  const result = calc({
    todayKey: "2026-10-31",
    joiningKey: "2026-10-16",
    days: [day("2026-10-05", "ABSENT"), day("2026-10-20", "ABSENT")],
  });
  assert.equal(line(result, "beforeJoining").count, 15);
  assert.equal(line(result, "beforeJoining").amount, 15000);
  assert.deepEqual(line(result, "absent").dates, ["2026-10-20"], "the 5th was before they joined");
  assert.equal(result.netSalary, 15000);
});

test("the deduction never exceeds the salary", () => {
  // Seven absences at 5 days' pay each is 35 days' pay - more than October has.
  const absences = ["2026-10-01", "2026-10-02", "2026-10-03", "2026-10-05", "2026-10-06", "2026-10-07", "2026-10-08"]
    .map((key) => day(key, "ABSENT"));
  const result = calc({ monthlySalary: 3000, policy: { absentDays: 5 }, days: absences });
  assert.equal(result.totalDeduction, 3000);
  assert.equal(result.netSalary, 0);
});

/* ------------------------------------------------------------- revisions -- */

test("the salary for a month is the revision in force then", () => {
  const revisions = [
    { monthlySalary: 20000, effectiveFrom: "2026-09", setAt: "2026-09-01T00:00:00Z" },
    { monthlySalary: 25000, effectiveFrom: "2026-11", setAt: "2026-10-05T00:00:00Z" },
    { monthlySalary: 21000, effectiveFrom: "2026-09", setAt: "2026-09-10T00:00:00Z" },
  ];
  assert.equal(resolveSalaryForMonth(revisions, "2026-08"), null, "nothing was set for August");
  assert.equal(resolveSalaryForMonth(revisions, "2026-10").monthlySalary, 21000, "the later correction to September's figure");
  assert.equal(resolveSalaryForMonth(revisions, "2026-11").monthlySalary, 25000, "the raise");
});

test("stored rules are normalised: missing or out-of-range values fall back", () => {
  const view = toPayrollPolicyView({ absentDays: -3, halfDayDays: "x", perDayBasis: "WEEKLY", lateEveryCount: 0 });
  assert.equal(view.absentDays, 0);
  assert.equal(view.halfDayDays, 0.5);
  assert.equal(view.perDayBasis, "CALENDAR_DAYS");
  assert.equal(view.lateEveryCount, 1);
});

/* ------------------------------------------------------------ the controller -- */

const companyId = "aaaaaaaaaaaaaaaaaaaaaaaa";
const adminId = "bbbbbbbbbbbbbbbbbbbbbbbb";
const managerId = "cccccccccccccccccccccccc";
const teamMemberId = "111111111111111111111111";
const outsiderId = "222222222222222222222222";
const executiveId = "333333333333333333333333";

const query = (value) => ({
  select() { return this; },
  sort() { return this; },
  lean() { return Promise.resolve(value); },
  then(resolve, reject) { return Promise.resolve(value).then(resolve, reject); },
});

const usersById = {
  [teamMemberId]: { _id: teamMemberId, name: "Ankit", role: "EXECUTIVE", isActive: true, companyId },
  [outsiderId]: { _id: outsiderId, name: "Other team", role: "EXECUTIVE", isActive: true, companyId },
  [executiveId]: { _id: executiveId, name: "Exec", role: "EXECUTIVE", isActive: true, companyId },
  [managerId]: { _id: managerId, name: "Manager", role: "MANAGER", isActive: true, companyId },
  [adminId]: { _id: adminId, name: "Admin", role: "ADMIN", isActive: true, companyId },
};

const loadController = () => {
  const writes = [];
  const filename = path.resolve(__dirname, "../src/controllers/salary.controller.js");
  const localRequire = createRequire(filename);
  const stubs = {
    "../models/EmployeeSalary": {
      find: () => query([]),
      updateOne: async (filter, update) => { writes.push({ filter, update }); return { acknowledged: true }; },
    },
    "../models/PayrollPolicy": { findOne: () => query(null), findOneAndUpdate: () => query({}) },
    "../models/LeaveRequest": { find: () => query([]) },
    "../models/User": {
      findOne: (filter) => query(usersById[String(filter._id)] || null),
      find: () => query([]),
    },
    "../config/logger": { error() {} },
    "../services/auditLog.service": { writeAuditLog: async () => {} },
    "./attendance.controller": {
      loadAttendanceDaysForUsers: async () => new Map(),
      resolvePolicyForCompany: async () => ({ timezone: "Asia/Kolkata", weeklyOffDays: [0] }),
      // The manager's team is Ankit; everybody else is outside it.
      ensureUserInScope: async ({ actor, targetUserId }) =>
        actor.role === "ADMIN" || String(targetUserId) === teamMemberId || String(targetUserId) === String(actor._id),
      getScopedUsersForAttendanceViewer: async () => [],
    },
  };
  const module = { exports: {} };
  vm.runInNewContext(fs.readFileSync(filename, "utf8"), {
    module,
    exports: module.exports,
    require: (name) => (name in stubs ? stubs[name] : localRequire(name)),
    process,
    console,
    Date,
  }, { filename });
  return { controller: module.exports, writes };
};

const call = async (handler, { user, params = {}, query: q = {}, body = {} }) => {
  const res = {
    statusCode: 200,
    body: null,
    status(code) { this.statusCode = code; return this; },
    json(payload) { this.body = payload; return this; },
  };
  await handler({ user: { companyId, ...user }, params, query: q, body }, res);
  return res;
};

const admin = { _id: adminId, role: "ADMIN", name: "Admin" };
const manager = { _id: managerId, role: "MANAGER", name: "Manager" };
const executive = { _id: executiveId, role: "EXECUTIVE", name: "Exec" };

test("an employee cannot list the team's salaries or open a colleague's", async () => {
  const { controller } = loadController();
  assert.equal((await call(controller.getTeamSalaries, { user: executive })).statusCode, 403);
  assert.equal((await call(controller.getUserSalary, { user: executive, params: { userId: teamMemberId } })).statusCode, 403);
});

test("an employee can open their own salary", async () => {
  const { controller } = loadController();
  const res = await call(controller.getUserSalary, { user: executive, params: { userId: executiveId }, query: { month: OCT } });
  assert.equal(res.statusCode, 200);
  assert.equal(res.body.salary, null, "nothing set yet");
});

test("a manager sets salaries for their own team only, and never their own", async () => {
  const { controller, writes } = loadController();
  const own = await call(controller.setUserSalary, { user: manager, params: { userId: managerId }, body: { monthlySalary: 90000 } });
  assert.equal(own.statusCode, 403);
  assert.match(own.body.message, /own salary/);

  const outside = await call(controller.setUserSalary, { user: manager, params: { userId: outsiderId }, body: { monthlySalary: 30000 } });
  assert.equal(outside.statusCode, 403);

  const team = await call(controller.setUserSalary, {
    user: manager,
    params: { userId: teamMemberId },
    body: { monthlySalary: 30000, effectiveFrom: "2026-10", note: "Joined on 30k" },
  });
  assert.equal(team.statusCode, 200);
  assert.equal(writes.length, 1);
  const pushed = writes[0].update.$push.revisions;
  assert.equal(pushed.monthlySalary, 30000);
  assert.equal(pushed.effectiveFrom, "2026-10");
  assert.equal(String(pushed.setBy), managerId, "who set it is kept");
});

test("an employee cannot set a salary, even their own", async () => {
  const { controller, writes } = loadController();
  const res = await call(controller.setUserSalary, { user: executive, params: { userId: executiveId }, body: { monthlySalary: 99999 } });
  assert.equal(res.statusCode, 403);
  assert.equal(writes.length, 0);
});

test("salary input is validated", async () => {
  const { controller } = loadController();
  const negative = await call(controller.setUserSalary, { user: admin, params: { userId: teamMemberId }, body: { monthlySalary: -5 } });
  assert.equal(negative.statusCode, 400);
  const badMonth = await call(controller.setUserSalary, { user: admin, params: { userId: teamMemberId }, body: { monthlySalary: 1000, effectiveFrom: "Oct" } });
  assert.equal(badMonth.statusCode, 400);
  const adminTarget = await call(controller.setUserSalary, { user: admin, params: { userId: adminId }, body: { monthlySalary: 1000 } });
  assert.equal(adminTarget.statusCode, 403, "nobody sets their own, admins included");
});

test("admins have no salary of their own", async () => {
  const { controller } = loadController();
  assert.equal((await call(controller.getMySalary, { user: admin })).statusCode, 403);
});

test("only admins and managers see or change the deduction rules", async () => {
  const { controller } = loadController();
  assert.equal((await call(controller.getPayrollPolicy, { user: executive })).statusCode, 403);
  assert.equal((await call(controller.updatePayrollPolicy, { user: executive, body: { absentDays: 0 } })).statusCode, 403);
  assert.equal((await call(controller.getPayrollPolicy, { user: manager })).statusCode, 200);
});

test("a rules update is refused field by field rather than quietly clamped", () => {
  const { controller } = loadController();
  const current = toPayrollPolicyView({});
  assert.match(controller.validatePolicyUpdate({ absentDays: -1 }, current).error, /Absent/);
  assert.match(controller.validatePolicyUpdate({ lateEveryCount: 2.5 }, current).error, /whole number/);
  assert.match(controller.validatePolicyUpdate({ lateDeductionValue: 50 }, current).error, /days/);
  assert.match(controller.validatePolicyUpdate({ perDayBasis: "HOURLY" }, current).error, /per-day/);

  const amount = controller.validatePolicyUpdate({ lateDeductionUnit: "AMOUNT", lateDeductionValue: 200 }, current);
  assert.equal(amount.error, undefined);
  assert.equal(amount.policy.lateDeductionValue, 200);
  assert.equal(amount.policy.absentDays, current.absentDays, "fields not sent keep their value");
});
