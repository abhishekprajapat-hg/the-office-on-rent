const assert = require("node:assert/strict");
const test = require("node:test");
const {
  NO_FOLLOW_UP_STATUSES,
  buildStaleFollowUpFilter,
  hasUnpaidPartialCollection,
  shouldClearTerminalFollowUp,
} = require("../src/utils/leadFollowUp");

test("lost, invalid and missing leads clear pending follow-ups", () => {
  assert.equal(shouldClearTerminalFollowUp("LOST", {}), true);
  assert.equal(shouldClearTerminalFollowUp("INVALID", {}), true);
  assert.equal(shouldClearTerminalFollowUp("MISSING_IN_ACTION", {}), true);
  assert.equal(shouldClearTerminalFollowUp("missing_in_action", null), true);
  assert.equal(shouldClearTerminalFollowUp("CONTACTED", {}), false);
  assert.equal(shouldClearTerminalFollowUp("QUALIFIED_LEAD", {}), false);
  assert.equal(shouldClearTerminalFollowUp("NOT_PICKING_CALLS", {}), false);
});

test("closed partial-payment collection stays scheduled until paid", () => {
  const unpaid = { status: "CLOSED", dealPayment: { paymentType: "PARTIAL", remainingAmount: 2500 } };
  const paid = { status: "CLOSED", dealPayment: { paymentType: "PARTIAL", remainingAmount: 0 } };
  assert.equal(hasUnpaidPartialCollection(unpaid), true);
  assert.equal(shouldClearTerminalFollowUp("CLOSED", unpaid), false);
  assert.equal(shouldClearTerminalFollowUp("CLOSED", paid), true);
  assert.equal(shouldClearTerminalFollowUp("CLOSED", { dealPayment: { paymentType: "FULL" } }), true);
  // Only a closed deal keeps a collection follow-up; a lost one does not.
  assert.equal(shouldClearTerminalFollowUp("LOST", unpaid), true);
});

test("the cleanup query targets the same statuses and spares unpaid closed deals", () => {
  const filter = buildStaleFollowUpFilter();
  assert.deepEqual(filter.status.$in, [...NO_FOLLOW_UP_STATUSES]);
  assert.deepEqual(filter.$nor, [
    { status: "CLOSED", "dealPayment.paymentType": "PARTIAL", "dealPayment.remainingAmount": { $gt: 0 } },
  ]);
  // Each call builds its own object, so a query that casts it in place cannot
  // change the next one.
  filter.status.$in.push("NEW");
  assert.equal(buildStaleFollowUpFilter().status.$in.includes("NEW"), false);
});
