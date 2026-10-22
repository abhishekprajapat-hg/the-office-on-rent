// Salary, leave and attendance corrections (requirements 16 Oct 2026, section 04).
const test = require("node:test");
const assert = require("node:assert/strict");
const { calculateMonthlySalary } = require("../src/services/payroll.calc");
const cal = require("../src/services/workCalendar");

// October 2026: 31 days, Sundays on 4, 11, 18, 25.
const base = { monthKey: "2026-10", todayKey: "2026-11-05", monthlySalary: 31000, weeklyOffDays: [0] };
const line = (out, key) => out.lines.find((l) => l.key === key);
const leave = (date, source) => ({ attendanceDate: date, status: "LEAVE", source });

test("approved CRM leave is paid up to the entitlement; the rest costs like unpaid leave", () => {
  const out = calculateMonthlySalary({ ...base, days: [leave("2026-10-05", "CASUAL"), leave("2026-10-06", "SICK"), leave("2026-10-07", "CASUAL")] });
  assert.equal(line(out, "paidLeave").count, 1, "default entitlement: 1 paid day");
  assert.equal(line(out, "paidLeave").amount, 0);
  assert.equal(line(out, "leaveBeyondEntitlement").count, 2);
  assert.equal(line(out, "leaveBeyondEntitlement").amount, 2000, "2 days at 1000/day");
  assert.deepEqual(out.paidLeave, { entitlement: 1, used: 1, remaining: 0, beyondEntitlement: 2 });
  const generous = calculateMonthlySalary({ ...base, policy: { paidLeavePerMonth: 3 }, days: [leave("2026-10-05", "CASUAL"), leave("2026-10-06", "SICK")] });
  assert.equal(generous.paidLeave.remaining, 1);
  assert.equal(line(generous, "leaveBeyondEntitlement").count, 0);
});

test("a day marked Leave by hand is not paid leave unless the company says so", () => {
  const out = calculateMonthlySalary({ ...base, days: [leave("2026-10-05", "MANUAL")] });
  assert.equal(line(out, "paidLeave").count, 0);
  assert.equal(line(out, "unpaidLeave").count, 1);
  const allowed = calculateMonthlySalary({ ...base, policy: { manualLeaveIsPaid: true }, days: [leave("2026-10-05", "MANUAL")] });
  assert.equal(line(allowed, "paidLeave").count, 1);
});

test("a day is never both paid leave and absent; pending leave is never paid", () => {
  const out = calculateMonthlySalary({
    ...base,
    days: [{ attendanceDate: "2026-10-08", status: "ABSENT" }],
    unapprovedLeaveDates: ["2026-10-08"],
  });
  assert.equal(line(out, "unapprovedLeave").count, 1);
  assert.equal(line(out, "paidLeave").count, 0);
  assert.equal(line(out, "absent").count, 0);
});

test("half day and late never both charge the same arrival", () => {
  const out = calculateMonthlySalary({
    ...base,
    policy: { lateEveryCount: 1, late: { unit: "DAYS", value: 0.5 } },
    days: [
      { attendanceDate: "2026-10-05", status: "HALF_DAY", checkInAt: "2026-10-05T08:40:00Z", isLateCheckIn: true },
      { attendanceDate: "2026-10-06", status: "PRESENT", checkInAt: "2026-10-06T05:40:00Z", isLateCheckIn: true },
    ],
  });
  assert.equal(line(out, "halfDay").count, 1);
  assert.deepEqual(line(out, "late").dates, ["2026-10-06"], "only the full day that started late is a late");
});

test("half-day cutoff: arriving at or after 2:00 PM is a half day even after a long stay", () => {
  const { resolveAttendanceStatus, isAfterHalfDayCutoff } = require("../src/controllers/attendance.controller");
  const policy = { timezone: "Asia/Kolkata", halfDayMinutes: 240, fullDayMinutes: 450, halfDayCheckInCutoffMinutes: 840 };
  const at2pm = new Date("2026-10-05T08:30:00Z"); // 14:00 IST
  const at159 = new Date("2026-10-05T08:29:00Z");
  assert.equal(isAfterHalfDayCutoff(at2pm, policy), true, "cutoff is inclusive");
  assert.equal(isAfterHalfDayCutoff(at159, policy), false);
  assert.equal(resolveAttendanceStatus({ attendanceDate: "2026-10-05", checkInAt: at2pm, workedMinutes: 480, policy }), "HALF_DAY");
  assert.equal(resolveAttendanceStatus({ attendanceDate: "2026-10-05", checkInAt: at159, workedMinutes: 480, policy }), "PRESENT");
  assert.equal(resolveAttendanceStatus({ attendanceDate: "2026-10-05", checkInAt: at2pm, workedMinutes: 480, policy: { ...policy, halfDayCheckInCutoffMinutes: null } }), "PRESENT", "switch-off works");
});

test("own weekly offs with effective dates: Production off Monday from the 12th", () => {
  const schedule = [{ days: [1], effectiveFrom: "2026-10-12" }];
  assert.deepEqual(cal.weeklyOffDaysOn(schedule, "2026-10-05", [0]), [0], "before the change: company Sunday");
  assert.deepEqual(cal.weeklyOffDaysOn(schedule, "2026-10-12", [0]), [1]);
  const off = cal.makeOffDayChecker({ schedule, policy: { weeklyOffDays: [0] } });
  assert.equal(off("2026-10-04"), true, "Sunday before the change");
  assert.equal(off("2026-10-11"), true);
  assert.equal(off("2026-10-18"), false, "Sunday after the change is a working day");
  assert.equal(off("2026-10-19"), true, "Monday after the change");

  const out = calculateMonthlySalary({
    ...base,
    isWeeklyOff: off,
    days: [
      { attendanceDate: "2026-10-19", status: "ABSENT" },
      { attendanceDate: "2026-10-18", status: "PRESENT", checkInAt: "2026-10-18T04:30:00Z" },
    ],
  });
  assert.equal(line(out, "absent").count, 0, "no deduction on a scheduled weekly off");
  assert.deepEqual(out.workedOnOffDays, [], "Sunday is now a working day, so no off-day work");
  const sundayWork = calculateMonthlySalary({ ...base, days: [{ attendanceDate: "2026-10-11", status: "PRESENT", checkInAt: "2026-10-11T04:30:00Z" }] });
  assert.deepEqual(sundayWork.workedOnOffDays, ["2026-10-11"], "work on a weekly off is recorded");
  assert.equal(sundayWork.totalDeduction, 0);
});

test("company holidays are never absences and don't count as working days", () => {
  const out = calculateMonthlySalary({ ...base, holidayDates: ["2026-10-20"], days: [{ attendanceDate: "2026-10-20", status: "ABSENT" }] });
  assert.equal(line(out, "absent").count, 0);
  assert.deepEqual(out.holidays, ["2026-10-20"]);
  assert.equal(out.workingDaysInMonth, 26, "31 days - 4 Sundays - 1 holiday");
  assert.equal(cal.isOffDate("2026-10-20", { policy: { weeklyOffDays: [0], holidays: [{ date: "2026-10-20", name: "Diwali" }] } }), true);
});

test("the current 30/31-day divisor is unchanged", () => {
  const out = calculateMonthlySalary({ ...base, days: [] });
  assert.equal(out.perDayBasis, "CALENDAR_DAYS");
  assert.equal(out.divisor, 31);
});
