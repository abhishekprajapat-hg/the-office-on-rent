// Further offices (8 Oct 2026): some employees work from another office, each
// office has its own geofence, and an admin or manager decides who may check
// in from it.
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const { createRequire } = require("node:module");
const AttendanceModel = require("../src/models/Attendance");
const { matchOfficeGeofence, resolveCheckInOffices } = require("../src/utils/attendanceGeofence");

const companyId = "aaaaaaaaaaaaaaaaaaaaaaaa";
const employeeId = "bbbbbbbbbbbbbbbbbbbbbbbb";
const managerId = "cccccccccccccccccccccccc";
const otherTeamId = "dddddddddddddddddddddddd";
const officeId = "eeeeeeeeeeeeeeeeeeeeeeee";

const indore = { latitude: 22.7196, longitude: 75.8577 };
const mumbai = { latitude: 19.076, longitude: 72.8777 };
const policy = {
  companyId,
  timezone: "Asia/Kolkata",
  geofenceEnabled: true,
  officeLatitude: indore.latitude,
  officeLongitude: indore.longitude,
  officeRadiusMeters: 200,
  offices: [{ _id: officeId, name: "Mumbai branch", ...mumbai, radiusMeters: 300, userIds: [employeeId, otherTeamId] }],
};

const query = (value) => ({
  select() { return this; }, populate() { return this; }, sort() { return this; },
  lean() { return Promise.resolve(value); },
  then(resolve, reject) { return Promise.resolve(value).then(resolve, reject); },
});
// Objects built inside the sandbox have its prototypes; compare plain copies.
const plain = (value) => JSON.parse(JSON.stringify(value));
const response = () => ({ code: 200, body: null, status(code) { this.code = code; return this; }, json(body) { this.body = body; return this; } });
// Runs the real controller with stubbed models; never touches a database.
const load = (stubs, exposed = "") => {
  const filename = path.resolve(__dirname, "../src/controllers/attendance.controller.js");
  const localRequire = createRequire(filename);
  const module = { exports: {} };
  vm.runInNewContext(fs.readFileSync(filename, "utf8") + exposed, {
    module, exports: module.exports,
    require: (name) => stubs[name] || localRequire(name),
    process, console, Date, setTimeout, clearTimeout,
  }, { filename });
  return module.exports;
};

test("everyone gets the main office; a further office only the people it lists", () => {
  assert.deepEqual(resolveCheckInOffices(policy, employeeId).map((row) => row.name), ["Main office", "Mumbai branch"]);
  assert.deepEqual(resolveCheckInOffices(policy, managerId).map((row) => row.name), ["Main office"]);
  const noMain = { ...policy, officeLatitude: null, officeLongitude: null };
  assert.deepEqual(resolveCheckInOffices(noMain, employeeId).map((row) => row.name), ["Mumbai branch"]);
});

test("a location matches the office it is inside, and otherwise names the nearest", () => {
  const offices = resolveCheckInOffices(policy, employeeId);
  const atBranch = matchOfficeGeofence({ offices, location: { ...mumbai, accuracy: 10 }, maxAccuracyBufferMeters: 150 });
  assert.equal(atBranch.match.office.name, "Mumbai branch");

  // ~2 km out of Mumbai: outside both, and Mumbai is the closer miss.
  const nearBranch = matchOfficeGeofence({ offices, location: { latitude: 19.094, longitude: 72.8777, accuracy: 10 }, maxAccuracyBufferMeters: 150 });
  assert.equal(nearBranch.match, null);
  assert.equal(nearBranch.nearest.office.name, "Mumbai branch");

  // Poor accuracy is forgiven up to the cap: 400 m out with a 150 m fix is 250 m, inside 300.
  const fuzzy = matchOfficeGeofence({ offices, location: { latitude: 19.0796, longitude: 72.8777, accuracy: 900 }, maxAccuracyBufferMeters: 150 });
  assert.equal(fuzzy.match.office.name, "Mumbai branch");
});

const checkInAt = async (userId, location) => {
  const day = new AttendanceModel({ companyId, userId, attendanceDate: "2026-10-08", breakSessions: [] });
  day.save = async function save() { return this; };
  const controller = load({
    "../models/Attendance": { ATTENDANCE_STATUS: AttendanceModel.ATTENDANCE_STATUS, ATTENDANCE_SOURCE: AttendanceModel.ATTENDANCE_SOURCE, findOne: () => query(day) },
    "../models/AttendancePolicy": { findOne: () => query(policy) },
  });
  const res = response();
  await controller.checkIn({ user: { _id: userId, companyId, role: "EXECUTIVE" }, body: { location: { ...location, accuracy: 10 } }, headers: {} }, res);
  return { res, day };
};

test("an employee allowed at the branch checks in there; one who is not is refused", async () => {
  const allowed = await checkInAt(employeeId, mumbai);
  assert.equal(allowed.res.code, 201, JSON.stringify(allowed.res.body));
  assert.equal(allowed.day.checkInLocation.officeName, "Mumbai branch");

  const refused = await checkInAt(managerId, mumbai);
  assert.equal(refused.res.code, 403);
  assert.equal(refused.day.checkInAt, null);

  const atMain = await checkInAt(managerId, indore);
  assert.equal(atMain.res.code, 201);
  assert.equal(atMain.day.checkInLocation.officeName, "Main office");
});

test("a manager changes access for their own team only", async () => {
  let written = null;
  const controller = load({
    "../models/AttendancePolicy": {
      findOne: () => query({ offices: policy.offices }),
      findOneAndUpdate: (filter, update) => {
        written = update;
        return query({ ...policy, offices: update.$set.offices });
      },
    },
    "../models/User": { findOne: () => query({ _id: managerId, name: "Manager", role: "MANAGER" }) },
    "../services/hierarchy.service": { getDescendantUsers: async () => [{ _id: employeeId, name: "Employee", role: "EXECUTIVE" }] },
  });

  // The manager removes their own employee and tries to add someone outside the team.
  const res = response();
  await controller.updateAttendanceOffices({
    user: { _id: managerId, companyId, role: "MANAGER" },
    body: { offices: [{ _id: officeId, name: "Mumbai branch", ...mumbai, radiusMeters: 300, userIds: [managerId] }, { name: "Pune", latitude: 18.52, longitude: 73.85, userIds: [otherTeamId] }] },
  }, res);

  assert.equal(res.code, 200, JSON.stringify(res.body));
  const [branch, pune] = written.$set.offices;
  assert.equal(String(branch._id), officeId, "an existing office keeps its id");
  assert.deepEqual(plain(branch.userIds).sort(), [managerId, otherTeamId].sort(), "the other team's member stays; the manager's employee is removed");
  assert.deepEqual(plain(pune.userIds), [], "someone outside the team cannot be added");
  assert.equal(written.$setOnInsert.offices, undefined);
  assert.deepEqual(plain(res.body.assignableUsers.map((row) => row._id)).sort(), [employeeId, managerId].sort());
});

test("offices need a name, coordinates and a name of their own", async () => {
  const controller = load({
    "../models/AttendancePolicy": { findOne: () => query(null), findOneAndUpdate: () => assert.fail("must not save") },
    "../models/User": { find: () => query([]) },
  });
  const cases = [
    [{ name: "", ...mumbai }, /needs a name/],
    [{ name: "Pune", latitude: "abc", longitude: 73.85 }, /valid latitude/],
    [{ name: "main office", ...mumbai }, /already an office/],
  ];
  for (const [office, message] of cases) {
    const res = response();
    await controller.updateAttendanceOffices({ user: { _id: managerId, companyId, role: "ADMIN" }, body: { offices: [office] } }, res);
    assert.equal(res.code, 400);
    assert.match(res.body.message, message);
  }
});

test("an employee is sent only their own offices, without who else may use them", () => {
  const { toPersonal, toView } = load({}, "\nmodule.exports.toPersonal = toPersonalPolicyView; module.exports.toView = toPolicyView;");
  const view = toView(policy);
  assert.deepEqual(plain(toPersonal(view, employeeId).offices), [{ _id: officeId, name: "Mumbai branch", ...mumbai, radiusMeters: 300 }]);
  assert.deepEqual(plain(toPersonal(view, managerId).offices), []);
});
