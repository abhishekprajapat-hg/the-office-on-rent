// Setting somebody's attendance by hand (8 Oct 2026): LEAVE joins PRESENT,
// HALF_DAY and ABSENT, and any date can be set from the person's calendar.
const test = require("node:test");
const assert = require("node:assert/strict");

const {
  applyManualAttendanceStatus,
  MANUAL_ATTENDANCE_STATUSES,
} = require("../src/controllers/attendance.controller");

const policy = { fullDayMinutes: 450, halfDayMinutes: 240 };
const actorId = "64b000000000000000000001";
const now = new Date("2026-10-08T07:00:00.000Z");

// A day somebody checked in on, took a break and checked out.
const checkedInDay = () => ({
  status: "PRESENT",
  source: "WEB",
  checkInAt: new Date("2026-10-05T04:40:00.000Z"),
  checkOutAt: new Date("2026-10-05T13:10:00.000Z"),
  workedMinutes: 480,
  totalBreakMinutes: 30,
  breakSessions: [{
    startAt: new Date("2026-10-05T08:00:00.000Z"),
    endAt: new Date("2026-10-05T08:30:00.000Z"),
    durationMinutes: 30,
  }],
  checkInNote: "",
  checkOutNote: "Leaving",
  metadata: { checkInIp: "10.0.0.1" },
});

test("leave is one of the statuses an admin or manager may set", () => {
  assert.deepEqual([...MANUAL_ATTENDANCE_STATUSES].sort(), ["ABSENT", "HALF_DAY", "LEAVE", "PRESENT"]);
});

test("marking leave clears the day's check-in, breaks and hours", () => {
  const day = applyManualAttendanceStatus(checkedInDay(), { status: "LEAVE", policy, actorId, now });
  assert.equal(day.status, "LEAVE");
  assert.equal(day.source, "MANUAL");
  assert.equal(day.checkInAt, null);
  assert.equal(day.checkOutAt, null);
  assert.equal(day.workedMinutes, 0);
  assert.equal(day.totalBreakMinutes, 0);
  assert.deepEqual(day.breakSessions, []);
  assert.equal(day.checkOutNote, "");
  assert.equal(day.checkInNote, "Marked on leave manually");
});

test("absent behaves as before", () => {
  const day = applyManualAttendanceStatus(checkedInDay(), { status: "ABSENT", policy, actorId, now });
  assert.equal(day.status, "ABSENT");
  assert.equal(day.checkInAt, null);
  assert.equal(day.workedMinutes, 0);
  assert.equal(day.checkInNote, "Marked absent manually");
});

test("present and half day keep the check-in and credit the policy hours", () => {
  const present = applyManualAttendanceStatus(checkedInDay(), { status: "PRESENT", policy, actorId, now });
  assert.ok(present.checkInAt, "check-in survives");
  assert.equal(present.workedMinutes, 450);
  assert.equal(present.totalBreakMinutes, 30);
  assert.equal(present.breakSessions.length, 1);
  assert.equal(present.checkInNote, "Marked present manually");

  const half = applyManualAttendanceStatus(checkedInDay(), { status: "HALF_DAY", policy, actorId, now });
  assert.equal(half.workedMinutes, 240);
  assert.equal(half.checkInNote, "Marked half day manually");
});

test("a day nobody touched can be set too - a backdated row starts empty", () => {
  const day = applyManualAttendanceStatus({}, { status: "LEAVE", policy, actorId, now });
  assert.equal(day.status, "LEAVE");
  assert.equal(day.workedMinutes, 0);
});

test("who changed it, when and why is kept, alongside what was there", () => {
  const day = applyManualAttendanceStatus(checkedInDay(), {
    status: "LEAVE",
    note: "Was at a family function, told me on the phone",
    policy,
    actorId,
    now,
  });
  assert.equal(day.metadata.manualStatusBy, actorId);
  assert.equal(day.metadata.manualStatusAt, now);
  assert.equal(day.metadata.manualStatusNote, "Was at a family function, told me on the phone");
  assert.equal(day.checkInNote, "Was at a family function, told me on the phone");
  assert.equal(day.metadata.checkInIp, "10.0.0.1", "existing metadata is not wiped");
});
