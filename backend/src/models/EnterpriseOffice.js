const mongoose = require("mongoose");
const E = require("../constants/enterprise.constants");

/*
 * An office the company leases long term, fits out and lets onward
 * (Enterprise leasing, 2.1). Linked to the existing Building / Inventory
 * records rather than copying them, and to its owner-side and current
 * tenant-side agreements. Financial summaries are calculated, not stored.
 */
const enterpriseOfficeSchema = new mongoose.Schema(
  {
    companyId: { type: mongoose.Schema.Types.ObjectId, ref: "Company", required: true, index: true },
    officeCode: { type: String, required: true, trim: true, maxlength: 20 },
    name: { type: String, required: true, trim: true, maxlength: 200 },
    buildingId: { type: mongoose.Schema.Types.ObjectId, ref: "Building", default: null },
    inventoryId: { type: mongoose.Schema.Types.ObjectId, ref: "Inventory", default: null },
    address: { type: String, trim: true, maxlength: 500, default: "" },
    floor: { type: String, trim: true, maxlength: 40, default: "" },
    unit: { type: String, trim: true, maxlength: 60, default: "" },
    area: { type: Number, min: 0, default: null },
    areaBasis: { type: String, trim: true, maxlength: 40, default: "" },
    fitOutStatus: { type: String, enum: E.FIT_OUT_STATUSES, default: E.FIT_OUT_STATUSES[0] },
    operationalStatus: { type: String, enum: E.OPERATIONAL_STATUSES, default: E.OPERATIONAL_STATUSES[0] },
    ownerAgreementId: { type: mongoose.Schema.Types.ObjectId, ref: "EnterpriseAgreement", default: null },
    tenantAgreementId: { type: mongoose.Schema.Types.ObjectId, ref: "EnterpriseAgreement", default: null },
    // Fit-out (2.9)
    fitOutBudget: { type: Number, min: 0, default: null },
    fitOutStartDate: { type: Date, default: null },
    fitOutExpectedEndDate: { type: Date, default: null },
    fitOutActualEndDate: { type: Date, default: null },
    ownerConsentRef: { type: String, trim: true, maxlength: 300, default: "" },
    assignedTo: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
    notes: { type: String, trim: true, maxlength: 3000, default: "" },
    history: {
      type: [{ at: { type: Date, default: Date.now }, by: { type: mongoose.Schema.Types.ObjectId, ref: "User" }, byName: String, change: String, _id: false }],
      default: [],
    },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
  },
  { timestamps: true },
);
enterpriseOfficeSchema.index({ companyId: 1, officeCode: 1 }, { unique: true });
// One Enterprise Office per inventory unit, so offices are never duplicated.
enterpriseOfficeSchema.index({ companyId: 1, inventoryId: 1 }, { unique: true, partialFilterExpression: { inventoryId: { $type: "objectId" } } });

module.exports = mongoose.model("EnterpriseOffice", enterpriseOfficeSchema);
