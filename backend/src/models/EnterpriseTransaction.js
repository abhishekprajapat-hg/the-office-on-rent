const mongoose = require("mongoose");
const E = require("../constants/enterprise.constants");

/*
 * Money that actually moved (2.5): a payment to the landlord (PAYABLE side) or
 * a receipt from the tenant (RECEIVABLE side). One transfer can settle several
 * items: each allocation names the item and how much cash and TDS it covers.
 * Whatever is not allocated stays visible as unallocated.
 */
const enterpriseTransactionSchema = new mongoose.Schema(
  {
    companyId: { type: mongoose.Schema.Types.ObjectId, ref: "Company", required: true, index: true },
    officeId: { type: mongoose.Schema.Types.ObjectId, ref: "EnterpriseOffice", required: true },
    direction: { type: String, enum: ["PAYABLE", "RECEIVABLE"], required: true },
    date: { type: Date, required: true },
    // Cash that moved, and the tax withheld alongside it (TDS) for the same items.
    amount: { type: Number, required: true, min: 0 },
    tdsAmount: { type: Number, min: 0, default: 0 },
    mode: { type: String, enum: E.PAYMENT_MODES, default: "BANK_TRANSFER" },
    reference: { type: String, trim: true, maxlength: 200, default: "" },
    bankReference: { type: String, trim: true, maxlength: 200, default: "" },
    tdsCertificateRef: { type: String, trim: true, maxlength: 200, default: "" },
    notes: { type: String, trim: true, maxlength: 1000, default: "" },
    allocations: {
      type: [{ obligationId: { type: mongoose.Schema.Types.ObjectId, ref: "EnterpriseObligation", required: true }, cash: { type: Number, min: 0, default: 0 }, tds: { type: Number, min: 0, default: 0 }, _id: false }],
      default: [],
    },
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
enterpriseTransactionSchema.index({ companyId: 1, officeId: 1, direction: 1, date: -1 });

module.exports = mongoose.model("EnterpriseTransaction", enterpriseTransactionSchema);
