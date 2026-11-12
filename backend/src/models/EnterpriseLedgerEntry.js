const mongoose = require("mongoose");
const E = require("../constants/enterprise.constants");

/*
 * Two small ledgers of an Enterprise Office, each entry kept for audit:
 *   kind DEPOSIT  (2.8): owner-side and tenant-side security deposits, kept
 *                  apart from rent and from each other. Partial refunds,
 *                  deductions and adjustments are separate entries.
 *   kind EXPENSE  (2.9): fit-out line items rolled up against the budget.
 */
const enterpriseLedgerEntrySchema = new mongoose.Schema(
  {
    companyId: { type: mongoose.Schema.Types.ObjectId, ref: "Company", required: true, index: true },
    officeId: { type: mongoose.Schema.Types.ObjectId, ref: "EnterpriseOffice", required: true },
    kind: { type: String, enum: ["DEPOSIT", "EXPENSE"], required: true },
    date: { type: Date, required: true },
    amount: { type: Number, required: true, min: 0 },
    // Deposits
    side: { type: String, enum: [...E.AGREEMENT_SIDES, ""], default: "" },
    agreementId: { type: mongoose.Schema.Types.ObjectId, ref: "EnterpriseAgreement", default: null },
    entryType: { type: String, enum: [...E.DEPOSIT_ENTRY_TYPES, ""], default: "" },
    expectedSettlementDate: { type: Date, default: null },
    // Fit-out expenses
    category: { type: String, trim: true, maxlength: 40, default: "" },
    vendor: { type: String, trim: true, maxlength: 200, default: "" },
    amountPaid: { type: Number, min: 0, default: 0 },
    paymentStatus: { type: String, enum: [...E.EXPENSE_PAYMENT_STATUSES, ""], default: "" },
    warrantyUntil: { type: Date, default: null },
    // Both
    reference: { type: String, trim: true, maxlength: 200, default: "" },
    proofUrl: { type: String, trim: true, maxlength: 1000, default: "" },
    reason: { type: String, trim: true, maxlength: 500, default: "" },
    notes: { type: String, trim: true, maxlength: 1000, default: "" },
    // Receipts, bills, proof of payment (protected enterprise-documents folder).
    attachments: {
      type: [{ url: { type: String, required: true, maxlength: 1000 }, name: { type: String, default: "" }, uploadedAt: { type: Date, default: Date.now }, uploadedByName: { type: String, default: "" } }],
      default: [],
    },
    enteredBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
    enteredByName: { type: String, default: "" },
  },
  { timestamps: true },
);
enterpriseLedgerEntrySchema.index({ companyId: 1, officeId: 1, kind: 1, date: -1 });

module.exports = mongoose.model("EnterpriseLedgerEntry", enterpriseLedgerEntrySchema);
