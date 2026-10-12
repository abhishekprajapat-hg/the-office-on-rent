/*
 * Statuses that were retired (12 Oct 2026) and what each became. "Not picking
 * calls" is now counted out as NPC 1-3; the two "Requirement after" statuses
 * became an ordinary first follow-up, keeping the callback date they had.
 * Old names still arriving - an older app, a bulk sheet - are read as the new.
 */
const LEGACY_LEAD_STATUSES = Object.freeze({
  NOT_PICKING_CALLS: "NPC_1",
  REQUIREMENT_AFTER_1_MONTH: "FOLLOW_UP_1",
  REQUIREMENT_AFTER_2_MONTH: "FOLLOW_UP_1",
  REQUIREMENT_AFTER_2_MONTHS: "FOLLOW_UP_1",
});

// Moves stored leads and status requests off the retired statuses.
const migrateLegacyLeadStatuses = async () => {
  const Lead = require("../models/Lead");
  const LeadStatusRequest = require("../models/LeadStatusRequest");
  let migratedCount = 0;
  for (const [from, to] of Object.entries(LEGACY_LEAD_STATUSES)) {
    // Raw collection writes: the old values no longer pass the schema enum.
    const leads = await Lead.collection.updateMany({ status: from }, { $set: { status: to } });
    const requests = await LeadStatusRequest.collection.updateMany({ proposedStatus: from }, { $set: { proposedStatus: to } });
    migratedCount += Number(leads.modifiedCount || 0) + Number(requests.modifiedCount || 0);
  }
  return migratedCount;
};

module.exports = { LEGACY_LEAD_STATUSES, migrateLegacyLeadStatuses };
