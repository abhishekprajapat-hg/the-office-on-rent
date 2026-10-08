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
    policy: { unapprovedLeave: { unit: "DAYS", value: 1.5 } },
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
    policy: { lateGraceCount: 2, lateEveryCount: 1, late: { unit: "AMOUNT", value: 100 } },
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
  const result = calc({ monthlySalary: 3000, policy: { absent: { unit: "DAYS", value: 5 } }, days: absences });
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
  const view = toPayrollPolicyView({
    absent: { unit: "DAYS", value: -3 },
    halfDay: { unit: "DAYS", value: "x" },
    unpaidLeave: { unit: "PERCENT", value: 250 },
    paidLeave: { unit: "WEEKS", value: 2 },
    perDayBasis: "WEEKLY",
    lateEveryCount: 0,
  });
  assert.deepEqual(view.absent, { unit: "DAYS", value: 0 });
  assert.deepEqual(view.halfDay, { unit: "DAYS", value: 0.5 });
  assert.deepEqual(view.unpaidLeave, { unit: "PERCENT", value: 100 }, "a percentage never passes 100");
  assert.deepEqual(view.paidLeave, { unit: "DAYS", value: 2 }, "an unknown unit falls back to days");
  assert.equal(view.perDayBasis, "CALENDAR_DAYS");
  assert.equal(view.lateEveryCount, 1);
});

test("a changed unit never inherits the default's number", () => {
  // The default absence is 1 day's pay; switching it to rupees with no value
  // must not quietly become a 1 rupee deduction.
  assert.deepEqual(toPayrollPolicyView({ absent: { unit: "AMOUNT" } }).absent, { unit: "AMOUNT", value: 0 });
});

test("rules saved before units existed are read as days of pay", () => {
  const view = toPayrollPolicyView({ absentDays: 2, halfDayDays: 0.75, lateDeductionUnit: "AMOUNT", lateDeductionValue: 150 });
  assert.deepEqual(view.absent, { unit: "DAYS", value: 2 });
  assert.deepEqual(view.halfDay, { unit: "DAYS", value: 0.75 });
  assert.deepEqual(view.late, { unit: "AMOUNT", value: 150 });
  assert.deepEqual(view.unapprovedLeave, { unit: "DAYS", value: 1 }, "anything not saved keeps its default");
});

/* ------------------------------------------------- amount and percentage -- */

test("a day's deduction can be a fixed amount", () => {
  const result = calc({
    policy: { absent: { unit: "AMOUNT", value: 750 }, halfDay: { unit: "AMOUNT", value: 300 } },
    days: [day("2026-10-05", "ABSENT"), day("2026-10-06", "ABSENT"), day("2026-10-07", "HALF_DAY", { checkInAt: "2026-10-07T05:00:00.000Z" })],
  });
  assert.equal(line(result, "absent").amount, 1500);
  assert.equal(line(result, "absent").rule, "₹750 each");
  assert.equal(line(result, "halfDay").amount, 300);
  assert.equal(result.netSalary, 31000 - 1800);
});

test("a day's deduction can be a percentage of the monthly salary", () => {
  const result = calc({
    monthlySalary: 40000,
    policy: { absent: { unit: "PERCENT", value: 5 }, halfDay: { unit: "PERCENT", value: 2.5 } },
    days: [day("2026-10-05", "ABSENT"), day("2026-10-06", "HALF_DAY", { checkInAt: "2026-10-06T05:00:00.000Z" })],
  });
  assert.equal(line(result, "absent").amount, 2000, "5% of 40,000");
  assert.equal(line(result, "absent").rule, "5% of salary each");
  assert.equal(line(result, "halfDay").amount, 1000, "2.5% of 40,000");
  assert.equal(result.totalDeduction, 3000);
});

test("each rule keeps its own unit", () => {
  const result = calc({
    policy: {
      absent: { unit: "DAYS", value: 1 },
      unpaidLeave: { unit: "AMOUNT", value: 500 },
      unapprovedLeave: { unit: "PERCENT", value: 10 },
    },
    days: [day("2026-10-05", "ABSENT"), day("2026-10-06", "LEAVE", { source: "UNPAID" }), day("2026-10-07", "ABSENT")],
    unapprovedLeaveDates: ["2026-10-07"],
  });
  assert.equal(line(result, "absent").amount, 1000, "a day's pay at 1,000 a day");
  assert.equal(line(result, "unpaidLeave").amount, 500);
  assert.equal(line(result, "unapprovedLeave").amount, 3100, "10% of 31,000");
  assert.equal(result.totalDeduction, 4600);
});

test("late check-ins can cost a percentage too", () => {
  const lates = ["2026-10-01", "2026-10-02", "2026-10-03", "2026-10-05", "2026-10-06", "2026-10-07"].map(late);
  const result = calc({ policy: { lateEveryCount: 3, late: { unit: "PERCENT", value: 1 } }, days: lates });
  assert.equal(line(result, "late").amount, 620, "two blocks of 3, at 1% of 31,000 each");
  assert.equal(line(result, "late").rule, "1% of salary for every 3 late check-ins");
});

test("a rule worth nothing says so", () => {
  const result = calc({ policy: { absent: { unit: "AMOUNT", value: 0 } }, days: [day("2026-10-05", "ABSENT")] });
  assert.equal(line(result, "absent").rule, "No deduction");
  assert.equal(line(result, "absent").amount, 0);
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
      findOne: () => query(null),
      updateOne: async (filter, update) => { writes.push({ filter, update }); return { acknowledged: true }; },
      findOneAndUpdate: (filter, update) => {
        writes.push({ model: "EmployeeSalary", filter, update });
        return query({ deductions: update.$push ? [{ _id: "d1", ...update.$push.deductions }] : [] });
      },
    },
    "../models/PayrollPolicy": {
      findOne: () => query(null),
      findOneAndUpdate: (filter, update) => {
        writes.push({ model: "PayrollPolicy", filter, update });
        return query({ customDeductions: update.$push ? [{ _id: "c1", ...update.$push.customDeductions }] : [] });
      },
    },
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
  assert.equal((await call(controller.updatePayrollPolicy, { user: executive, body: { absent: { unit: "DAYS", value: 0 } } })).statusCode, 403);
  assert.equal((await call(controller.getPayrollPolicy, { user: manager })).statusCode, 200);
});

test("a rules update is refused field by field rather than quietly clamped", () => {
  const { controller } = loadController();
  const current = toPayrollPolicyView({});
  assert.match(controller.validatePolicyUpdate({ absent: { unit: "DAYS", value: -1 } }, current).error, /Absent/);
  assert.match(controller.validatePolicyUpdate({ lateEveryCount: 2.5 }, current).error, /whole number/);
  assert.match(controller.validatePolicyUpdate({ late: { unit: "DAYS", value: 50 } }, current).error, /days of pay/);
  assert.match(controller.validatePolicyUpdate({ perDayBasis: "HOURLY" }, current).error, /per-day/);
  assert.match(controller.validatePolicyUpdate({ halfDay: { unit: "WEEKS", value: 1 } }, current).error, /rupees or a percentage/);
  assert.match(controller.validatePolicyUpdate({ halfDay: 0.5 }, current).error, /unit and a value/);

  const amount = controller.validatePolicyUpdate({ late: { unit: "AMOUNT", value: 200 } }, current);
  assert.equal(amount.error, undefined);
  assert.deepEqual({ ...amount.policy.late }, { unit: "AMOUNT", value: 200 });
  assert.equal(amount.policy.absent, current.absent, "fields not sent keep their value");
});

test("a rule's value is checked against its own unit", () => {
  const { controller } = loadController();
  const current = toPayrollPolicyView({});
  // 50 is too many days of pay, a fine percentage, and a fine amount.
  assert.match(controller.validatePolicyUpdate({ absent: { unit: "DAYS", value: 50 } }, current).error, /5 days of pay/);
  assert.equal(controller.validatePolicyUpdate({ absent: { unit: "PERCENT", value: 50 } }, current).error, undefined);
  assert.equal(controller.validatePolicyUpdate({ absent: { unit: "AMOUNT", value: 50 } }, current).error, undefined);
  assert.match(controller.validatePolicyUpdate({ absent: { unit: "PERCENT", value: 101 } }, current).error, /100%/);
  assert.match(controller.validatePolicyUpdate({ absent: { unit: "AMOUNT", value: 200001 } }, current).error, /1,00,000/);
});

/* ------------------------------------------------------ named deductions -- */

const named = (overrides) => ({ id: "x", name: "PF", unit: "PERCENT", value: 12, frequency: "MONTHLY", fromMonth: "2026-09", toMonth: "", scope: "COMPANY", ...overrides });
const customLines = (result) => result.lines.filter((row) => row.custom);

test("a named deduction is taken in every month it covers", () => {
  const result = calc({
    customDeductions: [
      named({ id: "pf" }),
      named({ id: "tax", name: "Professional tax", unit: "AMOUNT", value: 200, fromMonth: "2026-10" }),
      named({ id: "fine", name: "Uniform", unit: "DAYS", value: 0.5, frequency: "ONCE", fromMonth: "2026-10", toMonth: "2026-10", scope: "EMPLOYEE" }),
    ],
  });
  const lines = customLines(result);
  assert.deepEqual(lines.map((row) => row.label), ["PF", "Professional tax", "Uniform"]);
  assert.equal(lines[0].amount, 3720, "12% of 31,000");
  assert.equal(lines[0].rule, "12% of salary every month");
  assert.equal(lines[1].amount, 200);
  assert.equal(lines[2].amount, 500, "half a day at 1,000 a day");
  assert.equal(lines[2].rule, "Half a day's pay this month only");
  assert.equal(lines[2].scope, "EMPLOYEE");
  assert.equal(result.totalDeduction, 4420);
});

test("a named deduction outside its months is left out", () => {
  const result = calc({
    customDeductions: [
      named({ id: "later", fromMonth: "2026-11" }),
      named({ id: "ended", fromMonth: "2026-01", toMonth: "2026-09" }),
      named({ id: "once-before", frequency: "ONCE", fromMonth: "2026-09", toMonth: "2026-09" }),
      named({ id: "until-oct", name: "Loan", unit: "AMOUNT", value: 1000, fromMonth: "2026-06", toMonth: "2026-10" }),
    ],
  });
  assert.deepEqual(customLines(result).map((row) => row.label), ["Loan"], "only the one still running in October");
});

test("named deductions apply to a month that has not started, unlike absences", () => {
  const result = calc({
    monthKey: "2026-11",
    days: [day("2026-11-02", "ABSENT")],
    customDeductions: [named({ unit: "AMOUNT", value: 500 })],
  });
  assert.equal(line(result, "absent").count, 0);
  assert.equal(result.totalDeduction, 500);
});

test("named deductions count towards the cap on the salary", () => {
  const result = calc({ monthlySalary: 1000, customDeductions: [named({ unit: "AMOUNT", value: 5000 })] });
  assert.equal(result.totalDeduction, 1000);
  assert.equal(result.netSalary, 0);
});

test("a named deduction is checked before it is saved", () => {
  const { controller } = loadController();
  const ok = { name: "PF", unit: "PERCENT", value: 12, frequency: "MONTHLY", fromMonth: "2026-10" };
  assert.equal(controller.validateCustomDeduction(ok).error, undefined);
  assert.equal(controller.validateCustomDeduction(ok).deduction.toMonth, "", "no end month means it keeps running");

  assert.match(controller.validateCustomDeduction({ ...ok, name: "  " }).error, /name/);
  assert.match(controller.validateCustomDeduction({ ...ok, name: "x".repeat(61) }).error, /60/);
  assert.match(controller.validateCustomDeduction({ ...ok, value: 0 }).error, /more than 0/);
  assert.match(controller.validateCustomDeduction({ ...ok, value: 101 }).error, /100%/);
  assert.match(controller.validateCustomDeduction({ ...ok, unit: "AMOUNT", value: 100001 }).error, /1,00,000/);
  assert.match(controller.validateCustomDeduction({ ...ok, unit: "WEEKS" }).error, /days of pay, rupees/);
  assert.match(controller.validateCustomDeduction({ ...ok, frequency: "YEARLY" }).error, /every month or one month/);
  assert.match(controller.validateCustomDeduction({ ...ok, fromMonth: "" }).error, /starts from/);
  assert.match(controller.validateCustomDeduction({ ...ok, toMonth: "2026-09" }).error, /before the start/);

  const once = controller.validateCustomDeduction({ ...ok, frequency: "ONCE", toMonth: "2027-01" });
  assert.equal(once.deduction.toMonth, "2026-10", "one month only ends in the month it starts");

  const edited = controller.validateCustomDeduction({ value: 10 }, { ...ok, toMonth: "" });
  assert.equal(edited.deduction.value, 10);
  assert.equal(edited.deduction.name, "PF", "an edit keeps what it does not change");
});

test("only admins and managers add a company-wide deduction", async () => {
  const { controller, writes } = loadController();
  const body = { name: "PF", unit: "PERCENT", value: 12, frequency: "MONTHLY", fromMonth: "2026-10" };
  assert.equal((await call(controller.addCompanyDeduction, { user: executive, body })).statusCode, 403);
  assert.equal(writes.length, 0);

  const res = await call(controller.addCompanyDeduction, { user: manager, body });
  assert.equal(res.statusCode, 201);
  const pushed = writes[0].update.$push.customDeductions;
  assert.equal(pushed.name, "PF");
  assert.equal(String(pushed.createdBy), managerId, "who added it is kept");
  assert.equal(res.body.customDeductions[0].scope, "COMPANY");
});

test("a person's own deductions follow the same rules as their salary", async () => {
  const { controller, writes } = loadController();
  const body = { name: "Advance recovery", unit: "AMOUNT", value: 2000, frequency: "ONCE", fromMonth: "2026-10" };
  const add = (user, userId) => {
    let passed = false;
    return call(async (req, res) => {
      await controller.ensureEmployeeDeductionAccess(req, res, () => { passed = true; });
      if (passed) await controller.addEmployeeDeduction(req, res);
    }, { user, params: { userId }, body });
  };

  assert.equal((await add(executive, teamMemberId)).statusCode, 403, "employees cannot");
  assert.equal((await add(manager, managerId)).statusCode, 403, "nobody on themselves");
  assert.equal((await add(manager, outsiderId)).statusCode, 403, "a manager only on their own team");
  assert.equal(writes.length, 0);

  const res = await add(manager, teamMemberId);
  assert.equal(res.statusCode, 201);
  assert.equal(writes[0].model, "EmployeeSalary");
  assert.equal(String(writes[0].filter.userId), teamMemberId);
  assert.equal(writes[0].update.$push.deductions.toMonth, "2026-10");
  assert.equal(res.body.deductions[0].scope, "EMPLOYEE");
});

test("removing a named deduction goes through admin approval for managers", () => {
  const source = fs.readFileSync(path.resolve(__dirname, "../src/routes/salary.routes.js"), "utf8");
  assert.match(source, /router\.delete\(\s*"\/policy\/deductions\/:deductionId",[\s\S]*?requireAdminApprovalForDelete\("salary_company_deduction"/);
  assert.match(
    source,
    /router\.delete\(\s*"\/users\/:userId\/deductions\/:deductionId",[\s\S]*?ensureEmployeeDeductionAccess,[\s\S]*?requireAdminApprovalForDelete\("salary_employee_deduction"/,
    "the team check runs before a request is raised",
  );
});

/* ------------------------------------------- one person's own amounts -- */

const { mergeEmployeeRules } = require("../src/services/payroll.calc");

test("a person's own amounts replace the company's: ₹30,000, ₹1,000 per absence, ₹500 per half day", () => {
  const company = toPayrollPolicyView({});
  const rules = mergeEmployeeRules(company, {
    absent: { unit: "AMOUNT", value: 1000 },
    halfDay: { unit: "AMOUNT", value: 500 },
  });
  const result = calc({
    monthlySalary: 30000,
    policy: rules,
    days: [
      day("2026-10-05", "ABSENT"),
      day("2026-10-06", "ABSENT"),
      day("2026-10-07", "HALF_DAY", { checkInAt: "2026-10-07T05:00:00.000Z" }),
    ],
  });
  assert.equal(line(result, "absent").amount, 2000);
  assert.equal(line(result, "absent").rule, "₹1,000 each");
  assert.equal(line(result, "halfDay").amount, 500);
  assert.equal(result.netSalary, 27500);
});

test("what a person's own amounts leave out still comes from the company", () => {
  const company = toPayrollPolicyView({ perDayBasis: "FIXED_DAYS", fixedDaysPerMonth: 26, late: { unit: "AMOUNT", value: 150 } });
  const rules = mergeEmployeeRules(company, { absent: { unit: "AMOUNT", value: 1000 }, perDayBasis: "CALENDAR_DAYS" });
  assert.deepEqual(rules.absent, { unit: "AMOUNT", value: 1000 });
  assert.deepEqual(rules.late, { unit: "AMOUNT", value: 150 });
  assert.equal(rules.perDayBasis, "FIXED_DAYS", "how a day's pay is worked out stays the company's");
  assert.deepEqual(mergeEmployeeRules(company, null).absent, company.absent, "no own amounts: the company's rules");
});

test("an admin or the person's manager sets their amounts; nobody else, and never their own", async () => {
  const { controller, writes } = loadController();
  const body = { absent: { unit: "AMOUNT", value: 1000 }, halfDay: { unit: "AMOUNT", value: 500 } };
  const setRules = (user, userId, payload = body) => {
    let passed = false;
    return call(async (req, res) => {
      await controller.ensureEmployeeDeductionAccess(req, res, () => { passed = true; });
      if (passed) await controller.setEmployeeRules(req, res);
    }, { user, params: { userId }, body: payload });
  };

  assert.equal((await setRules(executive, teamMemberId)).statusCode, 403, "employees cannot");
  assert.equal((await setRules(manager, managerId)).statusCode, 403, "nobody on themselves");
  assert.equal((await setRules(manager, outsiderId)).statusCode, 403, "a manager only on their own team");
  assert.equal(writes.length, 0);

  assert.equal((await setRules(manager, teamMemberId, { absent: { unit: "AMOUNT", value: -5 } })).statusCode, 400);

  const res = await setRules(manager, teamMemberId);
  assert.equal(res.statusCode, 200);
  const stored = writes[0].update.$set.deductionRules;
  assert.deepEqual({ ...stored.absent }, { unit: "AMOUNT", value: 1000 });
  assert.deepEqual({ ...stored.halfDay }, { unit: "AMOUNT", value: 500 });
  assert.deepEqual({ ...stored.unpaidLeave }, { unit: "DAYS", value: 1 }, "fields not sent are filled from the company's rules");
  assert.equal(String(stored.updatedBy), managerId);
  assert.equal(stored.perDayBasis, undefined, "the per-day basis is never stored per person");

  const reset = await setRules(admin, teamMemberId, { useCompanyRules: true });
  assert.equal(reset.statusCode, 200);
  assert.equal(writes[1].update.$set.deductionRules, null);
});
