const mongoose = require("mongoose");
const E = require("../constants/enterprise.constants");

/*
 * One expected amount on one side (2.5): rent, maintenance or another charge
 * for one period, payable to the landlord (PAYABLE) or receivable from the
 * tenant (RECEIVABLE). Expected amounts are kept apart from money actually
 * paid: settlements come from recorded transactions, adjustments are their own
 * entries with a reason, and a promise to pay is only a follow-up.
 *
 * Status (upcoming / due / partially paid / paid / overdue / disputed /
 * waived-adjusted) is worked out from these, never typed in.
 */
const enterpriseObligationSchema = new mongoose.Schema(
  {
    companyId: { type: mongoose.Schema.Types.ObjectId, ref: "Company", required: true, index: true },
    officeId: { type: mongoose.Schema.Types.ObjectId, ref: "EnterpriseOffice", required: true },
    agreementId: { type: mongoose.Schema.Types.ObjectId, ref: "EnterpriseAgreement", default: null },
    direction: { type: String, enum: ["PAYABLE", "RECEIVABLE"], required: true },
    chargeType: { type: String, enum: E.CHARGE_TYPES, default: "RENT" },
    label: { type: String, trim: true, maxlength: 160, default: "" },
    // Stable key for schedule rows (type:label:period), so regenerating never duplicates.
    scheduleKey: { type: String, trim: true, maxlength: 200, default: "" },
    generated: { type: Boolean, default: false },
    periodStart: { type: Date, default: null },
    periodEnd: { type: Date, default: null },
    dueDate: { type: Date, required: true },
    gross: { type: Number, required: true, min: 0 },
    taxAmount: { type: Number, min: 0, default: 0 },
    // Expected TDS / withholding on this item, from the agreement's setting. The
    // actual amount withheld comes from the settlement entries.
    tdsExpected: { type: Number, min: 0, default: 0 },
    settlements: {
      type: [{
        transactionId: { type: mongoose.Schema.Types.ObjectId, ref: "EnterpriseTransaction" },
        cash: { type: Number, min: 0, default: 0 },
        tds: { type: Number, min: 0, default: 0 },
        at: { type: Date, default: Date.now },
      }],
      default: [],
    },
    adjustments: {
      type: [{ amount: { type: Number, required: true }, kind: { type: String, enum: ["WAIVER", "ADJUSTMENT"], default: "ADJUSTMENT" }, reason: { type: String, required: true, maxlength: 500 }, by: { type: mongoose.Schema.Types.ObjectId, ref: "User" }, byName: String, at: { type: Date, default: Date.now } }],
      default: [],
    },
    disputed: { type: Boolean, default: false },
    disputeReason: { type: String, trim: true, maxlength: 500, default: "" },
    promises: {
      type: [{ promisedDate: Date, amount: Number, note: String, by: { type: mongoose.Schema.Types.ObjectId, ref: "User" }, byName: String, at: { type: Date, default: Date.now }, _id: false }],
      default: [],
    },
    followUps: {
      type: [{ note: String, nextFollowUpAt: Date, by: { type: mongoose.Schema.Types.ObjectId, ref: "User" }, byName: String, at: { type: Date, default: Date.now }, _id: false }],
      default: [],
    },
    // Actual-cost maintenance: the landlord bill this recovery relates to.
    billReference: { type: String, trim: true, maxlength: 200, default: "" },
    notes: { type: String, trim: true, maxlength: 1000, default: "" },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
  },
  { timestamps: true },
);
enterpriseObligationSchema.index({ companyId: 1, officeId: 1, direction: 1, dueDate: 1 });
enterpriseObligationSchema.index({ companyId: 1, agreementId: 1, scheduleKey: 1 });

module.exports = mongoose.model("EnterpriseObligation", enterpriseObligationSchema);
