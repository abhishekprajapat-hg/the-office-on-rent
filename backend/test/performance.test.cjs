// Performance score. Since the requirements of 16 Oct 2026 (section 03):
// target 40%, tasks 20%, attendance 20%, punctuality 20%.
const test = require("node:test");
const assert = require("node:assert/strict");
const {
  scoreAttendance,
  scoreTasks,
  scoreSales,
  calculatePerformance,
  gradeFor,
  scorePunctuality,
  scoreTarget,
  PERFORMANCE_WEIGHTS,
} = require("../src/services/performance.calc");

test("weights are target 40, tasks 20, attendance 20, punctuality 20", () => {
  assert.deepEqual({ ...PERFORMANCE_WEIGHTS }, { target: 40, tasks: 20, attendance: 20, punctuality: 20 });
});

test("attendance part is the attendance percentage; punctuality is its own part", () => {
  const part = scoreAttendance({ workingDays: 20, attendancePercent: 90, punctualityPercent: 50, onTimeDays: 9, lateDays: 9, presentDays: 18 });
  assert.equal(part.score, 90);
  assert.equal(part.metrics.punctualityPercent, 50);
});

test("punctuality: late arrivals and half days count against it; nothing to judge without check-ins", () => {
  const part = scorePunctuality({ onTimeDays: 15, lateDays: 3, halfDays: 2, lateHalfDays: 0 });
  assert.equal(part.score, 75, "15 on time of 20 days");
  assert.equal(part.metrics.lateDays, 3);
  assert.equal(scorePunctuality({ onTimeDays: 0, lateDays: 0, halfDays: 0 }), null);
});

test("target: each target capped at 100%, averaged; remaining shown; none set = not scored", () => {
  const part = scoreTarget({
    target: { leadsTarget: 40, dealsTarget: 2, productionTarget: 30 },
    actuals: { leads: 20, deals: 3, production: 24 },
  });
  // leads 50%, deals 150% -> 100, production 80% -> avg 76.67
  assert.equal(part.score, 77);
  const deals = part.metrics.targets.find((t) => t.key === "deals");
  assert.equal(deals.percent, 150, "real achievement shown");
  assert.equal(deals.remaining, 0);
  assert.equal(part.metrics.targets.find((t) => t.key === "leads").remaining, 20);
  assert.equal(scoreTarget({ target: null, actuals: { leads: 5 } }), null);
});

test("punctuality is left out for somebody who never checked in", () => {
  assert.equal(scoreAttendance({ workingDays: 5, attendancePercent: 0, punctualityPercent: 0, onTimeDays: 0, lateDays: 0 }).score, 0);
  assert.equal(scoreAttendance({ workingDays: 0 }), null, "no working day yet: nothing to score");
});

test("tasks: on time counts fully, late half, overdue nothing", () => {
  const part = scoreTasks({
    from: "2026-10-01",
    to: "2026-10-31",
    todayKey: "2026-10-09",
    tasks: [
      { dueKey: "2026-10-02", completed: true, completedKey: "2026-10-02" },
      { dueKey: "2026-10-03", completed: true, completedKey: "2026-10-05" },
      { dueKey: "2026-10-04", completed: false },
      { dueKey: "2026-10-09", completed: false },
      { dueKey: "2026-10-20", completed: false },
      { dueKey: "2026-09-20", completed: true, completedKey: "2026-10-01" },
    ],
  });
  assert.equal(part.metrics.dueTasks, 3, "due today and next week are not judged yet; September's is not this month's");
  assert.equal(part.score, 50, "(1 + 0.5) of 3");
  assert.equal(part.metrics.completedThisMonth, 3);
});

test("no task due means the tasks part does not apply", () => {
  assert.equal(scoreTasks({ from: "2026-10-01", to: "2026-10-31", todayKey: "2026-10-09", tasks: [] }), null);
});

test("sales averages targets, conversion against a 20% benchmark, and follow-ups", () => {
  const part = scoreSales({
    leads: { total: 20, closed: 2, siteVisits: 4 },
    target: { leadsTarget: 40, siteVisitTarget: 4, revenueTarget: 0 },
    openLeads: { total: 10, overdueFollowUps: 2 },
  });
  // targets: leads 50%, visits 100% -> 75; conversion 10% of 20% -> 50; follow-ups 80
  assert.equal(part.score, 68);
  assert.equal(part.metrics.conversionPercent, 10);
  assert.equal(part.metrics.targetPercent, 75);
});

test("nothing to sell means the sales part does not apply", () => {
  assert.equal(scoreSales({ leads: {}, target: null, openLeads: {} }), null);
});

test("the overall score shares out the weight of a part that does not apply", () => {
  const attendance = { score: 80, metrics: {} };
  const tasks = { score: 60, metrics: {} };
  const both = calculatePerformance({ attendance, tasks });
  assert.equal(both.score, 70, "50/50 when only tasks and attendance apply");
  assert.equal(both.parts.attendance.effectiveWeight, 50);
  assert.equal(both.parts.target, null);

  const all = calculatePerformance({ target: { score: 90, metrics: {} }, tasks, attendance, punctuality: { score: 100, metrics: {} } });
  assert.equal(all.score, 84, "90x40 + 60x20 + 80x20 + 100x20, over 100");
  assert.equal(all.grade.label, "Average", "84 is in the 80-84.99 band");

  assert.equal(calculatePerformance({}).score, null);
});

test("grades", () => {
  // Bands set 21 Oct 2026.
  assert.equal(gradeFor(100).key, "EXCELLENT");
  assert.equal(gradeFor(95).key, "EXCELLENT");
  assert.equal(gradeFor(94.99).key, "GREAT");
  assert.equal(gradeFor(90).key, "GREAT");
  assert.equal(gradeFor(89.99).key, "GOOD");
  assert.equal(gradeFor(85).key, "GOOD");
  assert.equal(gradeFor(84.99).key, "AVERAGE");
  assert.equal(gradeFor(80).key, "AVERAGE");
  assert.equal(gradeFor(79.99).key, "BELOW_AVERAGE");
  assert.equal(gradeFor(75).key, "BELOW_AVERAGE");
  assert.equal(gradeFor(74.99).key, "NEEDS_IMPROVEMENT");
  assert.equal(gradeFor(0).key, "NEEDS_IMPROVEMENT");
  assert.equal(gradeFor(null), null);
});

test("the overall score keeps two decimals, so 94.99 isn't rounded up into Excellent", () => {
  // 95 x 80% + 94.95 x 20% = 94.99
  const result = calculatePerformance({ target: { score: 95 }, attendance: { score: 95 }, punctuality: { score: 95 }, tasks: { score: 94.95 } });
  assert.equal(result.score, 94.99);
  assert.equal(result.grade.key, "GREAT");
});

/* ------------------------------------------------------------ access -- */

const path = require("node:path");
const fs = require("node:fs");
const vm = require("node:vm");
const { createRequire } = require("node:module");

const companyId = "aaaaaaaaaaaaaaaaaaaaaaaa";
const query = (value) => ({
  select() { return this; }, sort() { return this; },
  lean() { return Promise.resolve(value); },
  then(resolve, reject) { return Promise.resolve(value).then(resolve, reject); },
});
const people = {
  "111111111111111111111111": { _id: "111111111111111111111111", name: "Team member", role: "EXECUTIVE", isActive: true },
  "222222222222222222222222": { _id: "222222222222222222222222", name: "Outsider", role: "EXECUTIVE", isActive: true },
  "333333333333333333333333": { _id: "333333333333333333333333", name: "Exec", role: "EXECUTIVE", isActive: true },
};

const loadController = () => {
  const filename = path.resolve(__dirname, "../src/controllers/performance.controller.js");
  const localRequire = createRequire(filename);
  const stubs = {
    "../models/Task": { find: () => query([]) },
    "../models/Lead": { find: () => query([]) },
    "../models/TargetAssignment": { find: () => query([]) },
    "../models/DailyReport": { aggregate: async () => [] },
    "../models/User": { findOne: (filter) => query(people[String(filter._id)] || null), find: () => query([]) },
    "../config/logger": { error() {} },
    "./attendance.controller": {
      loadAttendanceDaysForUsers: async () => new Map(),
      resolvePolicyForCompany: async () => ({ timezone: "Asia/Kolkata", weeklyOffDays: [0] }),
      ensureUserInScope: async ({ actor, targetUserId }) => actor.role === "ADMIN" || targetUserId === "111111111111111111111111",
      getScopedUsersForAttendanceViewer: async () => [],
    },
  };
  const module = { exports: {} };
  vm.runInNewContext(fs.readFileSync(filename, "utf8"), {
    module, exports: module.exports, process, console, Date,
    require: (name) => (name in stubs ? stubs[name] : localRequire(name)),
  }, { filename });
  return module.exports;
};

const call = async (handler, user, params = {}) => {
  const res = { statusCode: 200, body: null, status(code) { this.statusCode = code; return this; }, json(body) { this.body = body; return this; } };
  await handler({ user: { companyId, ...user }, params, query: { month: "2026-10" } }, res);
  return res;
};

const manager = { _id: "444444444444444444444444", role: "MANAGER" };
const executive = { _id: "333333333333333333333333", role: "EXECUTIVE" };

test("an employee sees only their own performance", async () => {
  const controller = loadController();
  assert.equal((await call(controller.getTeamPerformance, executive)).statusCode, 403);
  assert.equal((await call(controller.getUserPerformance, executive, { userId: "111111111111111111111111" })).statusCode, 403);
  const own = await call(controller.getUserPerformance, executive, { userId: executive._id });
  assert.equal(own.statusCode, 200);
  assert.equal(own.body.performance.score, null, "no records: nothing to score yet");
});

test("a manager sees their own team only", async () => {
  const controller = loadController();
  assert.equal((await call(controller.getUserPerformance, manager, { userId: "111111111111111111111111" })).statusCode, 200);
  assert.equal((await call(controller.getUserPerformance, manager, { userId: "222222222222222222222222" })).statusCode, 403);
  assert.equal((await call(controller.getTeamPerformance, manager)).statusCode, 200);
});
