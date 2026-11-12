const mongoose = require("mongoose");
const D = require("../constants/database.constants");

/*
 * A dated event in the Database module (1.6): a call and its outcome, a source
 * reporting a property, an availability verification, an ownership or
 * relationship change. Rows are only ever added; the latest one is the current
 * state and the earlier ones stay as history.
 */
const dbInteractionSchema = new mongoose.Schema(
  {
    companyId: { type: mongoose.Schema.Types.ObjectId, ref: "Company", required: true, index: true },
    type: { type: String, enum: D.INTERACTION_TYPES, required: true },
    at: { type: Date, default: Date.now },
    contactId: { type: mongoose.Schema.Types.ObjectId, ref: "CrmContact", default: null },
    buildingId: { type: mongoose.Schema.Types.ObjectId, ref: "Building", default: null },
    inventoryId: { type: mongoose.Schema.Types.ObjectId, ref: "Inventory", default: null },
    // Calls
    outcome: { type: String, enum: [...D.CALL_OUTCOMES, ""], default: "" },
    // Source reports: the role the source held and the facts they gave.
    sourceRole: { type: String, enum: [...D.CONTACT_ROLES, ""], default: "" },
    reportedFacts: { type: String, trim: true, maxlength: 2000, default: "" },
    // Verification
    verificationState: { type: String, enum: [...D.VERIFICATION_STATES, ""], default: "" },
    availabilityChange: { type: String, trim: true, maxlength: 300, default: "" },
    notes: { type: String, trim: true, maxlength: 3000, default: "" },
    nextStep: { type: String, trim: true, maxlength: 300, default: "" },
    nextFollowUpAt: { type: Date, default: null },
    byUserId: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
    byName: { type: String, default: "" },
  },
  { timestamps: true },
);

dbInteractionSchema.index({ companyId: 1, contactId: 1, at: -1 });
dbInteractionSchema.index({ companyId: 1, buildingId: 1, at: -1 });
dbInteractionSchema.index({ companyId: 1, inventoryId: 1, at: -1 });
dbInteractionSchema.index({ companyId: 1, nextFollowUpAt: 1 });

module.exports = mongoose.model("DbInteraction", dbInteractionSchema);
