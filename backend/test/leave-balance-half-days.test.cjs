// Every two half days use one leave from the balance (21 Oct 2026).
const test = require("node:test");
const assert = require("node:assert/strict");
const { computeLeaveBalance, halfDayLeaveUsed } = require("../src/services/leaveBalance");

test("two half days take one leave off the balance", () => {
  const b = computeLeaveBalance({ accrued: 5, approvedDays: 1, halfDays: 2 });
  assert.equal(b.halfDayLeaveUsed, 1);
  assert.equal(b.used, 2);
  assert.equal(b.available, 3);
});

test("a single half day doesn't, until its pair arrives", () => {
  assert.equal(halfDayLeaveUsed(0), 0);
  assert.equal(halfDayLeaveUsed(1), 0);
  assert.equal(halfDayLeaveUsed(3), 1);
  assert.equal(halfDayLeaveUsed(4), 2);
  assert.equal(computeLeaveBalance({ accrued: 3, halfDays: 1 }).available, 3);
});

test("the balance never goes below zero; pending requests don't count", () => {
  const b = computeLeaveBalance({ accrued: 1, approvedDays: 1, pendingDays: 2, halfDays: 4 });
  assert.equal(b.available, 0);
  assert.equal(b.pending, 2);
  assert.equal(b.used, 3);
});
