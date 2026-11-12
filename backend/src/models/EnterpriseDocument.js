const mongoose = require("mongoose");
const E = require("../constants/enterprise.constants");

/*
 * One checklist item (or other document) for an Enterprise tenant, signatory,
 * agreement or office (2.4). Status is explicit - an upload is not proof that a
 * document is genuine. Replacing a file adds a version; earlier ones are kept.
 * Files live under uploads/enterprise-documents, which only the Admin or an
 * authorised user can open, and every download is logged.
 */
const enterpriseDocumentSchema = new mongoose.Schema(
  {
    companyId: { type: mongoose.Schema.Types.ObjectId, ref: "Company", required: true, index: true },
    officeId: { type: mongoose.Schema.Types.ObjectId, ref: "EnterpriseOffice", default: null },
    tenantId: { type: mongoose.Schema.Types.ObjectId, ref: "EnterpriseTenant", default: null },
    // A signatory is a tenant contact; their identity papers are filed against them.
    signatoryId: { type: mongoose.Schema.Types.ObjectId, default: null },
    agreementId: { type: mongoose.Schema.Types.ObjectId, ref: "EnterpriseAgreement", default: null },
    scope: { type: String, enum: E.DOCUMENT_SCOPES, required: true },
    checklistKey: { type: String, trim: true, maxlength: 60, default: "" },
    label: { type: String, required: true, trim: true, maxlength: 200 },
    // Office / agreement papers: lease deed, bill, receipt, approval... (2.2 "Documents and audit").
    category: { type: String, trim: true, maxlength: 40, default: "" },
    status: { type: String, enum: E.DOCUMENT_STATUSES, default: "PENDING" },
    versions: {
      type: [{ url: { type: String, required: true, maxlength: 1000 }, name: String, uploadedAt: { type: Date, default: Date.now }, uploadedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" }, uploadedByName: String }],
      default: [],
    },
    reviewedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
    reviewedByName: { type: String, default: "" },
    reviewedAt: { type: Date, default: null },
    notes: { type: String, trim: true, maxlength: 1000, default: "" },
    history: {
      type: [{ at: { type: Date, default: Date.now }, byName: String, change: String, _id: false }],
      default: [],
    },
  },
  { timestamps: true },
);
enterpriseDocumentSchema.index({ companyId: 1, tenantId: 1, checklistKey: 1, signatoryId: 1 });
enterpriseDocumentSchema.index({ companyId: 1, officeId: 1 });

module.exports = mongoose.model("EnterpriseDocument", enterpriseDocumentSchema);
