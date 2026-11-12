const mongoose = require("mongoose");
const D = require("../constants/database.constants");

/*
 * How a contact connects to a building, a property or an owner (Database
 * module, 1.1 / 1.2). Status, scope and authority live here, on the
 * connection, because one person can be current at one building and former at
 * another.
 *
 * Exactly one target per row: buildingId, inventoryId or ownerId (another
 * CrmContact, for representatives of an owner). Ownership of a property is a
 * row with role OWNER on inventoryId; ending it marks it FORMER with endedAt,
 * so ownership history is kept.
 */
const dbRelationshipSchema = new mongoose.Schema(
  {
    companyId: { type: mongoose.Schema.Types.ObjectId, ref: "Company", required: true, index: true },
    contactId: { type: mongoose.Schema.Types.ObjectId, ref: "CrmContact", required: true },
    buildingId: { type: mongoose.Schema.Types.ObjectId, ref: "Building", default: null },
    inventoryId: { type: mongoose.Schema.Types.ObjectId, ref: "Inventory", default: null },
    ownerId: { type: mongoose.Schema.Types.ObjectId, ref: "CrmContact", default: null },
    role: { type: String, enum: D.CONTACT_ROLES, required: true },
    scope: { type: String, enum: D.RELATIONSHIP_SCOPES, default: "OTHER" },
    // Floors / units / properties the scope covers, in words ("Floors 3-5", "Units 401, 402").
    scopeNote: { type: String, trim: true, maxlength: 300, default: "" },
    status: { type: String, enum: D.RELATIONSHIP_STATES, default: "CURRENT" },
    authority: { type: String, enum: D.AUTHORITY_LEVELS, default: "UNCONFIRMED" },
    // Joint ownership share, when known (e.g. "50%").
    share: { type: String, trim: true, maxlength: 40, default: "" },
    source: { type: String, trim: true, maxlength: 300, default: "" },
    notes: { type: String, trim: true, maxlength: 2000, default: "" },
    startedAt: { type: Date, default: Date.now },
    endedAt: { type: Date, default: null },
    endedReason: { type: String, trim: true, maxlength: 300, default: "" },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
    updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
  },
  { timestamps: true },
);

dbRelationshipSchema.index({ companyId: 1, contactId: 1 });
dbRelationshipSchema.index({ companyId: 1, buildingId: 1 });
dbRelationshipSchema.index({ companyId: 1, inventoryId: 1, role: 1 });
dbRelationshipSchema.index({ companyId: 1, ownerId: 1 });

module.exports = mongoose.model("DbRelationship", dbRelationshipSchema);
