const mongoose = require("mongoose");
const R = require("../constants/relationship.constants");
const D = require("../constants/database.constants");

// Leads that were refused because the number belongs to a broker. Kept on the
// broker rather than in the lead collection: the whole point is that these
// never became leads, but refusing them silently would leave nothing to check
// when somebody asks why an enquiry never arrived.
const blockedLeadSchema = new mongoose.Schema({
 name: { type: String, default: "", maxlength: 200 },
 phone: { type: String, default: "", maxlength: 20 },
 origin: { type: String, enum: ["MANUAL", "META", "BULK"], default: "MANUAL" },
 attemptedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
 at: { type: Date, default: Date.now },
}, { _id: false });

const schema = new mongoose.Schema({
 companyId: { type: mongoose.Schema.Types.ObjectId, ref: "Company", required: true },
 /* OWNER and BROKER keep their databases; CONTACT is anyone else who gives
  * information - guards, maintenance staff, building/property managers
  * (Database module, Oct 2026). */
 kind: { type: String, enum: D.CONTACT_KINDS, required: true },
 /* Required for owners and brokers; a CONTACT may be saved without a number
  * (e.g. "Aditya Gateway security desk") until one is known. */
 phone: { type: String, default: "", required: function phoneRequired() { return this.kind !== "CONTACT"; } },
 name: { type: String, required: true, maxlength: 200 },
 /* Database module (1.2 / 1.3). */
 contactCode: { type: String, trim: true, maxlength: 20, default: "" },
 roles: { type: [{ type: String, enum: D.CONTACT_ROLES }], default: [] },
 // A desk or counter rather than a named person.
 isContactPoint: { type: Boolean, default: false },
 ownerType: { type: String, enum: D.OWNER_TYPES, default: "" },
 sourceNote: { type: String, default: "", maxlength: 1000 },
 archived: { type: Boolean, default: false },
 email: { type: String, default: "", maxlength: 200 }, notes: { type: String, default: "", maxlength: 3000 },
 propertyDetails: { type: String, default: "", maxlength: 4000 },
 company: { type: String, default: "", maxlength: 200 },
 city: { type: String, default: "", maxlength: 120 },
 leadIds: [{ type: mongoose.Schema.Types.ObjectId, ref: "Lead" }],
 inventoryIds: [{ type: mongoose.Schema.Types.ObjectId, ref: "Inventory" }],
 blockedLeadCount: { type: Number, default: 0, min: 0 },
 blockedLeads: { type: [blockedLeadSchema], default: [] },
 createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },

 /* ---- Broker & channel partner profile (requirements 16 Oct 2026, 6.1) ---- */
 alternatePhone: { type: String, default: "", maxlength: 20 },
 whatsapp: { type: String, default: "", maxlength: 20 },
 designation: { type: String, default: "", maxlength: 120 },
 brokerType: { type: String, enum: R.BROKER_TYPES, default: "" },
 firmId: { type: mongoose.Schema.Types.ObjectId, ref: "BrokerFirm", default: null },
 segments: { type: [{ type: String, enum: R.SEGMENTS }], default: [] },
 areas: { type: [{ type: String, trim: true, maxlength: 120 }], default: [] },
 projects: { type: [{ type: String, trim: true, maxlength: 160 }], default: [] },
 propertyTypes: { type: [{ type: String, trim: true, maxlength: 80 }], default: [] },
 transactionTypes: { type: [{ type: String, enum: R.TRANSACTION_TYPES }], default: [] },
 customerTypes: { type: [{ type: String, enum: R.CUSTOMER_TYPES }], default: [] },
 marketNotes: { type: String, default: "", maxlength: 3000 },
 relationshipStatus: { type: String, enum: R.RELATIONSHIP_STATUSES, default: "" },
 relationshipOwnerId: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
 lastContactAt: { type: Date, default: null },
 nextFollowUpAt: { type: Date, default: null },
 preferredContact: { type: String, enum: R.CONTACT_METHODS, default: "" },
 relationshipNotes: { type: String, default: "", maxlength: 3000 },
 /* 3 Nov 2026 (3.1): Regular Broker or Channel Partner, and the hand-set Preferred CP mark. */
 registrationType: { type: String, enum: R.BROKER_REGISTRATION_TYPES, default: "REGULAR_BROKER" },
 preferredPartner: { type: Boolean, default: false },
 cpStatus: { type: String, enum: R.CP_STATUSES, default: "NOT_ONBOARDED" },
 cpOnboardedAt: { type: Date, default: null },
 cpApprovedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
 /* CP KYC scans (Aadhaar, PAN). Files live under uploads/broker-kyc, which only
  * Admin / Manager can open. Visible to Admin/Manager only. */
 cpDocuments: { type: [{ type: { type: String, enum: R.CP_DOCUMENT_TYPES, default: "OTHER" }, name: String, url: String, uploadedAt: Date, _id: false }], default: [] },
 /* The CRM login (CHANNEL_PARTNER user) made for this broker, if any. */
 cpUserId: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
 /* Visible to Admin/Manager only (see RESTRICTED_CONTACT_FIELDS). */
 brokerageTerms: { type: String, default: "", maxlength: 2000 },
 netRateNotes: { type: String, default: "", maxlength: 2000 },
 internalRemarks: { type: String, default: "", maxlength: 3000 },
 /* RERA list import (6.5). Imported is not verified, active or a CP. */
 reraNumber: { type: String, default: "", maxlength: 80 },
 source: { type: String, enum: R.CONTACT_SOURCES, default: "" },
 importStatus: { type: String, enum: R.IMPORT_STATUSES, default: "" },
 verified: { type: Boolean, default: false },
 /* Owners: when the details were last checked (17.1). */
 lastVerifiedAt: { type: Date, default: null },
 /* The same person kept as both owner and broker, linked on purpose (17.1). */
 linkedContactId: { type: mongoose.Schema.Types.ObjectId, ref: "CrmContact", default: null },
}, { timestamps: true });
// One record per number and kind. Contacts without a number are allowed, so
// the rule only covers rows that have one (the older index without this
// filter is replaced at start-up - see services/database.service.js).
schema.index({ companyId: 1, kind: 1, phone: 1 }, { unique: true, name: "contact_phone_unique", partialFilterExpression: { phone: { $type: "string", $gt: "" } } });
schema.index({ companyId: 1, contactCode: 1 }, { partialFilterExpression: { contactCode: { $type: "string", $gt: "" } } });
schema.index({ companyId: 1, roles: 1 });
// The lead gate looks a broker up by number on every intake, so it gets its own index.
schema.index({ companyId: 1, kind: 1, phone: 1, blockedLeadCount: -1 });
schema.index({ companyId: 1, kind: 1, reraNumber: 1 }, { partialFilterExpression: { reraNumber: { $gt: "" } } });
schema.index({ companyId: 1, firmId: 1 });
module.exports = mongoose.model("CrmContact", schema);
