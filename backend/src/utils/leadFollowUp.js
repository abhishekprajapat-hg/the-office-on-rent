const normalize = (value) => String(value || "").trim().toUpperCase();

/*
 * Statuses that end the conversation with the client. Nobody calls these leads
 * back, so they carry no follow-up date or purpose and the follow-up lists only
 * ever hold live leads. CLOSED has one exception: a deal closed on part payment
 * keeps its follow-up until the rest of the money is collected.
 */
const NO_FOLLOW_UP_STATUSES = Object.freeze(["CLOSED", "LOST", "INVALID", "MISSING_IN_ACTION"]);

const hasUnpaidPartialPayment = (lead) =>
  normalize(lead?.dealPayment?.paymentType) === "PARTIAL"
  && Number(lead?.dealPayment?.remainingAmount) > 0;

const hasUnpaidPartialCollection = (lead) =>
  normalize(lead?.status) === "CLOSED" && hasUnpaidPartialPayment(lead);

const shouldClearTerminalFollowUp = (status, lead) => {
  const normalizedStatus = normalize(status);
  if (!NO_FOLLOW_UP_STATUSES.includes(normalizedStatus)) return false;
  return normalizedStatus !== "CLOSED" || !hasUnpaidPartialPayment(lead);
};

// The same rule as a query: leads holding a follow-up they should not have.
const buildStaleFollowUpFilter = () => ({
  status: { $in: [...NO_FOLLOW_UP_STATUSES] },
  $or: [{ nextFollowUp: { $ne: null } }, { followUpPurpose: { $nin: ["", null] } }],
  $nor: [{ status: "CLOSED", "dealPayment.paymentType": "PARTIAL", "dealPayment.remainingAmount": { $gt: 0 } }],
});

/*
 * Status changes clear the follow-up as they happen; this removes the ones
 * left on leads that reached a dead status before the rule covered it.
 */
const clearStaleFollowUps = async () => {
  const Lead = require("../models/Lead");
  const result = await Lead.updateMany(buildStaleFollowUpFilter(), {
    $set: { nextFollowUp: null, followUpPurpose: "" },
  });
  return Number(result?.modifiedCount || 0);
};

module.exports = {
  NO_FOLLOW_UP_STATUSES,
  buildStaleFollowUpFilter,
  clearStaleFollowUps,
  hasUnpaidPartialCollection,
  shouldClearTerminalFollowUp,
};
