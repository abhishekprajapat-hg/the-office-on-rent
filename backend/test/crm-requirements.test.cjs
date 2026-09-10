const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const { createRequire } = require("node:module");
const { validateBreakTimeline } = require("../src/utils/attendanceBreaks");
const AttendanceModel = require("../src/models/Attendance");

const companyId = "aaaaaaaaaaaaaaaaaaaaaaaa";
const employeeId = "bbbbbbbbbbbbbbbbbbbbbbbb";
const managerId = "cccccccccccccccccccccccc";
const taskId = "dddddddddddddddddddddddd";
const otherId = "eeeeeeeeeeeeeeeeeeeeeeee";
const query = (value) => ({
  select() { return this; }, populate() { return this; }, sort() { return this; },
  lean() { return Promise.resolve(value); },
  then(resolve, reject) { return Promise.resolve(value).then(resolve, reject); },
});
const response = () => ({ code: 200, body: null, status(code) { this.code = code; return this; }, json(body) { this.body = body; return this; } });
// Execute the real controllers with isolated repositories; never connect to a database.
const load = (relative, stubs, exposed = "") => {
  const filename = path.resolve(__dirname, "../src", relative);
  const localRequire = createRequire(filename);
  const module = { exports: {} };
  vm.runInNewContext(fs.readFileSync(filename, "utf8") + exposed, {
    module, exports: module.exports,
    require: (name) => stubs[name] || localRequire(name),
    process, console, Date, setTimeout, clearTimeout,
  }, { filename });
  return module.exports;
};

test("lead list assignment filter intersects existing employee and tenant restrictions", () => {
  const { applyFilters } = load("controllers/lead.controller.js", {}, "\nmodule.exports.applyFilters = applyLeadListFilters;");
  const scope = { companyId, assignedTo: employeeId };
  applyFilters(scope, { assignedTo: otherId, source: "META", city: "Indore" });
  assert.equal(scope.assignedTo, employeeId);
  assert.equal(scope.companyId, companyId);
  assert.ok(scope.$and.some((clause) => clause.assignedTo === otherId));
  assert.equal(scope.source, "META");
});

for (const owner of ["assignedTo", "createdBy"]) {
  test(`task details allow populated ${owner} references`, async () => {
    const task = { companyId, assignedTo: { _id: otherId }, createdBy: { _id: otherId }, [owner]: { _id: employeeId, name: "Employee" } };
    const controller = load("controllers/task.controller.js", { "../models/Task": { findById: () => query(task) } });
    const res = response();
    await controller.getTaskById({ params: { taskId }, user: { _id: employeeId, companyId, role: "EXECUTIVE" } }, res);
    assert.equal(res.code, 200);
    assert.equal(res.body, task);
  });
}
test("task details reject an unrelated employee and cross-company admin", async () => {
  const controller = load("controllers/task.controller.js", { "../models/Task": { findById: () => query({ companyId, assignedTo: { _id: otherId }, createdBy: otherId }) } });
  for (const user of [{ _id: employeeId, companyId, role: "EXECUTIVE" }, { _id: managerId, companyId: otherId, role: "ADMIN" }]) {
    const res = response();
    await controller.getTaskById({ params: { taskId }, user }, res);
    assert.equal(res.code, 403);
  }
});
test("assigned-by-me filters retain company and employee access restrictions", async () => {
  let filter;
  const controller = load("controllers/task.controller.js", { "../models/Task": { find: (value) => { filter = value; return query([]); } } });
  const res = response();
  await controller.getTasks({ query: { scope: "assigned" }, user: { _id: employeeId, companyId, role: "EXECUTIVE" } }, res);
  assert.equal(res.code, 200);
  assert.equal(filter.companyId, companyId);
  assert.equal(filter.createdBy, employeeId);
  assert.equal(filter.$or.length, 2);
});
test("status-only updates notify the assignee of an update, not a reassignment", async () => {
  const task = { _id: taskId, companyId, assignedTo: employeeId, createdBy: managerId, title: "Follow up", status: "TODO", save: async function () { return this; } };
  const events = [];
  const io = { to: (room) => ({ emit: (event, payload) => events.push({ room, event, payload }) }) };
  const controller = load("controllers/task.controller.js", { "../models/Task": { findById: () => query(task) } });
  const res = response();
  await controller.updateTask({ params: { taskId }, body: { status: "COMPLETED" }, user: { _id: employeeId, companyId, role: "EXECUTIVE", name: "Employee" }, app: { get: () => io } }, res);
  assert.equal(res.code, 200);
  assert.equal(task.status, "COMPLETED");
  assert.equal(events.length, 1);
  assert.equal(events[0].room, `company:${companyId}:role:ADMIN`);
  assert.equal(events[0].payload.actorId, employeeId);
  assert.equal(events[0].payload.task, task);
  assert.doesNotMatch(events[0].payload.message, /reassigned/);
});
test("task deletion rejects cross-company admins", async () => {
  let deleted = false;
  const controller = load("controllers/task.controller.js", { "../models/Task": { findById: () => query({ companyId, createdBy: employeeId }), findByIdAndDelete: () => { deleted = true; } } });
  const res = response();
  await controller.deleteTask({ params: { taskId }, user: { _id: managerId, companyId: otherId, role: "ADMIN" } }, res);
  assert.equal(res.code, 403);
  assert.equal(deleted, false);
});

for (const [name, manager, roleType, expected] of [
  ["legacy commercial manager", { role: "MANAGER", isActive: true }, "COMMERCIAL", null],
  ["residential manager", { role: "MANAGER", isActive: true, roleType: "RESIDENTIAL" }, "RESIDENTIAL", null],
  ["inactive manager", { role: "MANAGER", isActive: false }, "COMMERCIAL", /inactive/],
  ["invalid role", { role: "EXECUTIVE", isActive: true }, "COMMERCIAL", /not a manager/],
  ["wrong property type", { role: "MANAGER", isActive: true, roleType: "COMMERCIAL" }, "RESIDENTIAL", /residential manager/],
  ["missing or cross-company manager", null, "COMMERCIAL", /not found in your company/],
]) {
  test(`inventory owner validation: ${name}`, async () => {
    let filter;
    const service = load("services/inventoryWorkflow.service.js", { "../models/User": { findOne: (value) => { filter = value; return query(manager && { _id: managerId, name: "Manager", ...manager }); } } }, "\nmodule.exports.testOwner = ensureManagerExistsInCompany;");
    const action = () => service.testOwner({ managerId, companyId, roleType });
    if (expected) await assert.rejects(action, expected);
    else assert.equal((await action())._id, managerId);
    assert.equal(filter.companyId, companyId);
    assert.equal(filter._id, managerId);
  });
}

const instant = (time) => new Date(`2026-09-01T${time}:00Z`);
const timeline = (sessions, checkOutAt = instant("17:00")) => ({ sessions, checkInAt: instant("09:00"), checkOutAt, now: instant("18:00") });
test("breaks accept adjacent, non-overlapping sessions", () => {
  assert.doesNotThrow(() => validateBreakTimeline(timeline([{ startAt: instant("12:00"), endAt: instant("12:30") }, { startAt: instant("12:30"), endAt: instant("13:00") }])));
});
for (const [name, sessions, checkout, expected] of [
  ["overlap", [{ startAt: instant("12:00"), endAt: instant("13:00") }, { startAt: instant("12:30"), endAt: instant("14:00") }], instant("17:00"), /overlap/],
  ["before check-in", [{ startAt: instant("08:00"), endAt: instant("09:30") }], instant("17:00"), /between check-in/],
  ["after check-out", [{ startAt: instant("16:00"), endAt: instant("17:30") }], instant("17:00"), /between check-in/],
  ["reversed times", [{ startAt: instant("13:00"), endAt: instant("12:00") }], instant("17:00"), /after its start/],
  ["open break after check-out", [{ startAt: instant("13:00") }], instant("17:00"), /requires a break end/],
  ["future time", [{ startAt: instant("19:00") }], null, /between check-in/],
  ["two open breaks", [{ startAt: instant("12:00") }, { startAt: instant("13:00") }], null, /overlap/],
]) test(`breaks reject ${name}`, () => assert.throws(() => validateBreakTimeline(timeline(sessions, checkout)), expected));

const correctionHarness = ({ role = "ADMIN", descendants = [], concurrent = false, stale = false } = {}) => {
  const doc = new AttendanceModel({ _id: taskId, companyId, userId: employeeId, attendanceDate: "2026-09-01", checkInAt: instant("09:00"), checkOutAt: instant("17:00"), updatedAt: instant("17:00"), breakSessions: [] });
  let mutation = null;
  const model = {
    ATTENDANCE_STATUS: AttendanceModel.ATTENDANCE_STATUS,
    ATTENDANCE_SOURCE: AttendanceModel.ATTENDANCE_SOURCE,
    findOne: () => query(doc),
    findOneAndUpdate: async (filter, update) => {
      mutation = { filter, update };
      if (concurrent) return null;
      doc.set(update.$set);
      doc.breakAudit.push(update.$push.breakAudit);
      assert.equal(doc.validateSync(), undefined);
      return doc;
    },
  };
  const controller = load("controllers/attendance.controller.js", {
    "../models/Attendance": model,
    "../models/User": { findOne: () => query({ _id: employeeId, role: "EXECUTIVE" }) },
    "../models/AttendancePolicy": { findOne: () => query(null) },
    "../services/hierarchy.service": { getDescendantUsers: async () => descendants },
  });
  const req = {
    user: { _id: managerId, name: "Manager", companyId, role },
    params: { userId: employeeId, date: "2026-09-01" },
    body: { startAt: instant("12:00").toISOString(), endAt: instant("12:30").toISOString(), reason: "Employee forgot to record lunch", expectedUpdatedAt: (stale ? instant("16:00") : doc.updatedAt).toISOString() },
  };
  return { controller, req, doc, mutation: () => mutation };
};
test("admin break override persists audit attribution and recalculates working hours", async () => {
  const h = correctionHarness(); const res = response();
  await h.controller.correctUserBreak(h.req, res);
  assert.equal(res.code, 200, JSON.stringify(res.body));
  assert.equal(res.body.attendance.totalBreakMinutes, 30);
  assert.equal(res.body.attendance.workedMinutes, 450);
  assert.equal(res.body.attendance.breakSessions[0].correctedByName, "Manager");
  assert.equal(res.body.attendance.breakAudit.length, 1);
  assert.equal(String(res.body.attendance.breakAudit[0].actorId), managerId);
  assert.equal(res.body.attendance.breakAudit[0].before, null);
  assert.equal(h.mutation().filter.companyId, companyId);
});
test("editing a break preserves the previous values in audit history", async () => {
  const h = correctionHarness();
  h.doc.breakSessions = [{ startAt: instant("12:00"), endAt: instant("12:15") }];
  h.req.body.sessionIndex = 0;
  const res = response(); await h.controller.correctUserBreak(h.req, res);
  assert.equal(res.code, 200);
  assert.equal(res.body.attendance.breakAudit[0].before.endAt.toISOString(), instant("12:15").toISOString());
  assert.equal(res.body.attendance.breakAudit[0].after.endAt.toISOString(), instant("12:30").toISOString());
});
for (const [name, config, expected] of [
  ["employee override", { role: "EXECUTIVE" }, 403],
  ["manager outside hierarchy", { role: "MANAGER" }, 403],
  ["manager inside hierarchy", { role: "MANAGER", descendants: [{ _id: employeeId }] }, 200],
  ["stale form", { stale: true }, 409],
  ["concurrent attendance write", { concurrent: true }, 409],
]) test(`break correction: ${name}`, async () => {
  const h = correctionHarness(config); const res = response();
  await h.controller.correctUserBreak(h.req, res);
  assert.equal(res.code, expected, JSON.stringify(res.body));
  if (expected === 403 || config.stale) assert.equal(h.mutation(), null);
});

for (const role of ["EXECUTIVE", "MANAGER", "ADMIN"]) {
  for (const field of ["title", "description", "priority", "dueDate", "assignedTo", "leadId", "subtasks", "tags", "createdBy"]) {
    test(`receiver ${role} cannot modify ${field}, even alongside a valid status`, async () => {
      let saved = false;
      const task = { _id: taskId, companyId, assignedTo: employeeId, createdBy: managerId, status: "TODO", save: async function () { saved = true; return this; } };
      const controller = load("controllers/task.controller.js", { "../models/Task": { findById: () => query(task) } });
      const res = response();
      await controller.updateTask({ params: { taskId }, body: { status: "COMPLETED", [field]: null }, user: { _id: employeeId, companyId, role } }, res);
      assert.equal(res.code, 403);
      assert.equal(task.status, "TODO");
      assert.equal(saved, false);
    });
  }
  test(`receiver ${role} can change status`, async () => {
    const task = { _id: taskId, companyId, assignedTo: employeeId, createdBy: managerId, status: "TODO", save: async function () { return this; } };
    const controller = load("controllers/task.controller.js", { "../models/Task": { findById: () => query(task) } });
    const res = response();
    await controller.updateTask({ params: { taskId }, body: { status: "IN_PROGRESS" }, user: { _id: employeeId, companyId, role }, app: { get: () => null } }, res);
    assert.equal(res.code, 200);
    assert.equal(task.status, "IN_PROGRESS");
  });
  test(`receiver ${role} cannot delete assigned task`, async () => {
    const controller = load("controllers/task.controller.js", { "../models/Task": { findById: () => query({ companyId, assignedTo: employeeId, createdBy: managerId }) } });
    const res = response();
    await controller.deleteTask({ params: { taskId }, user: { _id: employeeId, companyId, role } }, res);
    assert.equal(res.code, 403);
  });
}
test("task creator retains editing access", async () => {
  const task = { _id: taskId, companyId, assignedTo: employeeId, createdBy: managerId, title: "Before", save: async function () { return this; } };
  const controller = load("controllers/task.controller.js", { "../models/Task": { findById: () => query(task) } });
  const res = response();
  await controller.updateTask({ params: { taskId }, body: { title: "After", subtasks: [{ title: "Checklist", isCompleted: false }] }, user: { _id: managerId, companyId, role: "EXECUTIVE" }, app: { get: () => null } }, res);
  assert.equal(res.code, 200);
  assert.equal(task.title, "After");
  assert.equal(task.subtasks.length, 1);
});

test("admin status changes notify only the employee", async () => {
  const task = { _id: taskId, companyId, assignedTo: employeeId, createdBy: managerId, title: "Task", status: "TODO", save: async function () { return this; } };
  const events = [];
  const io = { to: room => ({ emit: (name, payload) => events.push({ room, name, payload }) }) };
  const controller = load("controllers/task.controller.js", { "../models/Task": { findById: () => query(task) } });
  const req = { params: { taskId }, body: { status: "IN_PROGRESS" }, user: { _id: managerId, companyId, role: "ADMIN", name: "Admin" }, app: { get: () => io } };
  const res = response(); await controller.updateTask(req, res);
  assert.equal(res.code, 200);
  assert.equal(events.length, 1);
  assert.equal(events[0].room, `user:${employeeId}`);
  assert.equal(events[0].payload.actorId, managerId);
  events.length = 0;
  await controller.updateTask(req, response());
  assert.equal(events.length, 0, "unchanged status must not generate another notification");
});

for (const inventoryType of ["COMMERCIAL", "RESIDENTIAL"]) {
  test(`Both user can access ${inventoryType} leads and inventory`, () => {
    const user = { _id: employeeId, companyId, role: "EXECUTIVE", roleType: "BOTH" };
    const leadController = load("controllers/lead.controller.js", {}, "\nmodule.exports.testType = assertLeadTypeMatchesUser; module.exports.testScope = addLeadRoleTypeScope; module.exports.testInventory = buildCompanyInventoryQuery;");
    assert.equal(leadController.testType({ inventoryType }, user), null);
    const scope = { companyId, assignedTo: employeeId };
    assert.equal(leadController.testScope(scope, user), scope);
    assert.equal(scope.assignedTo, employeeId);
    assert.equal(scope.$and, undefined);
    const inventoryQuery = leadController.testInventory({ inventoryId: taskId, companyId, user });
    assert.equal(inventoryQuery.companyId, companyId);
    assert.equal(inventoryQuery.inventoryType, undefined);
    const inventory = load("services/inventoryWorkflow.service.js", {}, "\nmodule.exports.testType = ensureInventoryTypeAllowedForUser;");
    assert.doesNotThrow(() => inventory.testType({ user, inventoryType }));
    assert.throws(() => inventory.testType({ user: { ...user, roleType: inventoryType === "COMMERCIAL" ? "RESIDENTIAL" : "COMMERCIAL" }, inventoryType }), /only/);
  });
  test(`Both manager accepts ${inventoryType} inventory ownership`, async () => {
    const service = load("services/inventoryWorkflow.service.js", { "../models/User": { findOne: () => query({ _id: managerId, role: "MANAGER", roleType: "BOTH", isActive: true }) } }, "\nmodule.exports.testOwner = ensureManagerExistsInCompany;");
    assert.equal((await service.testOwner({ managerId, companyId, roleType: inventoryType }))._id, managerId);
  });
}
test("User schema and authentication retain Both role type", () => {
  const UserModel = require("../src/models/User");
  assert.ok(UserModel.schema.path("roleType").enumValues.includes("BOTH"));
  const auth = load("controllers/auth.controller.js", {}, "\nmodule.exports.testNormalize = normalizeRoleType;");
  assert.equal(auth.testNormalize("both"), "BOTH");
});
