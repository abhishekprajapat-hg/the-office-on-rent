const mongoose = require("mongoose");
const E = require("../constants/enterprise.constants");

/*
 * One agreement on one side of an Enterprise Office (2.2 / 2.3): the owner-side
 * master lease (side OWNER, with the landlord) or a tenant-side agreement
 * (side TENANT, with an EnterpriseTenant). Dates are kept separately because
 * signing, possession, commencement and rent commencement are often different
 * days, and lock-in, notice and expiry are different clauses. Every term the
 * schedule uses is data on the agreement, never a global rule.
 */
const escalationSchema = new mongoose.Schema({
  effectiveDate: { type: Date, required: true },
  method: { type: String, enum: E.ESCALATION_METHODS, required: true },
  // PERCENT: % on the rent in force; AMOUNT: added to it; NEW_RENT: replaces it.
  value: { type: Number, required: true, min: 0 },
  note: { type: String, trim: true, maxlength: 300, default: "" },
});

const chargeSchema = new mongoose.Schema({
  chargeType: { type: String, enum: E.CHARGE_TYPES, default: "OTHER" },
  label: { type: String, required: true, trim: true, maxlength: 120 },
  amount: { type: Number, required: true, min: 0 },
  frequency: { type: String, enum: E.CHARGE_FREQUENCIES, default: "MONTHLY" },
  dueDate: { type: Date, default: null },
  note: { type: String, trim: true, maxlength: 300, default: "" },
});

const enterpriseAgreementSchema = new mongoose.Schema(
  {
    companyId: { type: mongoose.Schema.Types.ObjectId, ref: "Company", required: true, index: true },
    agreementCode: { type: String, required: true, trim: true, maxlength: 20 },
    side: { type: String, enum: E.AGREEMENT_SIDES, required: true },
    officeId: { type: mongoose.Schema.Types.ObjectId, ref: "EnterpriseOffice", required: true, index: true },
    // As written in the executed document (lease deed, leave and licence, ...).
    agreementType: { type: String, trim: true, maxlength: 120, default: "" },
    status: { type: String, enum: E.AGREEMENT_STATUSES, default: "DRAFT" },
    // Owner side: the landlord in the Owner Database, plus other relevant contacts.
    landlordContactId: { type: mongoose.Schema.Types.ObjectId, ref: "CrmContact", default: null },
    otherContactIds: { type: [{ type: mongoose.Schema.Types.ObjectId, ref: "CrmContact" }], default: [] },
    // Tenant side.
    tenantId: { type: mongoose.Schema.Types.ObjectId, ref: "EnterpriseTenant", default: null },

    signingDate: { type: Date, default: null },
    possessionDate: { type: Date, default: null },
    commencementDate: { type: Date, default: null },
    rentCommencementDate: { type: Date, default: null },
    endDate: { type: Date, default: null },
    lockInMonths: { type: Number, min: 0, default: null },
    lockInEndDate: { type: Date, default: null },
    noticePeriodMonths: { type: Number, min: 0, default: null },

    baseRent: { type: Number, min: 0, default: 0 },
    // Day of the month rent falls due (1-28); blank = the first day of each period.
    rentDueDay: { type: Number, min: 1, max: 28, default: null },
    escalations: { type: [escalationSchema], default: [] },
    maintenance: {
      method: { type: String, enum: E.MAINTENANCE_METHODS, default: "INCLUDED" },
      amount: { type: Number, min: 0, default: null },
      note: { type: String, trim: true, maxlength: 300, default: "" },
      // Tenant side: may a landlord / building increase be passed on? Only if the agreement says so (2.7).
      passThroughAllowed: { type: Boolean, default: false },
    },
    otherCharges: { type: [chargeSchema], default: [] },
    // Tax settings are per agreement and blank by default: the company accountant
    // confirms them (2.6). GST is added on top; TDS is the expected withholding.
    gstPercent: { type: Number, min: 0, max: 100, default: null },
    tdsPercent: { type: Number, min: 0, max: 100, default: null },
    depositRequired: { type: Number, min: 0, default: null },
    depositExpectedSettlementDate: { type: Date, default: null },
    renewalTerms: { type: String, trim: true, maxlength: 3000, default: "" },
    terminationTerms: { type: String, trim: true, maxlength: 3000, default: "" },
    // Exit / handover (2.3).
    noticeReceivedDate: { type: Date, default: null },
    noticeExpiryDate: { type: Date, default: null },
    vacatingDate: { type: Date, default: null },
    closeOutNotes: { type: String, trim: true, maxlength: 3000, default: "" },
    notes: { type: String, trim: true, maxlength: 3000, default: "" },
    // Amendments: what changed, kept with the agreement.
    amendments: {
      type: [{ at: { type: Date, default: Date.now }, by: { type: mongoose.Schema.Types.ObjectId, ref: "User" }, byName: String, note: String, changes: [String], _id: false }],
      default: [],
    },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
  },
  { timestamps: true },
);
enterpriseAgreementSchema.index({ companyId: 1, agreementCode: 1 }, { unique: true });
enterpriseAgreementSchema.index({ companyId: 1, officeId: 1, side: 1 });

module.exports = mongoose.model("EnterpriseAgreement", enterpriseAgreementSchema);
