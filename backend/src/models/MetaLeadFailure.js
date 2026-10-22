const mongoose = require("mongoose");

/*
 * A Meta Ads lead the CRM could not create (requirements 16 Oct 2026,
 * section 08: failures must be visible for reconciliation). Meta retries the
 * webhook; a later success marks the row resolved.
 */
const metaLeadFailureSchema = new mongoose.Schema(
  {
    companyId: { type: mongoose.Schema.Types.ObjectId, ref: "Company", default: null, index: true },
    metaLeadId: { type: String, trim: true, default: "", index: true },
    pageId: { type: String, trim: true, default: "" },
    formId: { type: String, trim: true, default: "" },
    kind: { type: String, enum: ["FAILED", "INVALID", "PERMISSION_FALLBACK_FAILED"], default: "FAILED" },
    error: { type: String, trim: true, maxlength: 2000, default: "" },
    attempts: { type: Number, default: 1 },
    lastAttemptAt: { type: Date, default: Date.now },
    resolved: { type: Boolean, default: false, index: true },
    resolvedAt: { type: Date, default: null },
    resolvedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
    resolutionNote: { type: String, trim: true, maxlength: 500, default: "" },
  },
  { timestamps: true },
);
metaLeadFailureSchema.index({ companyId: 1, resolved: 1, lastAttemptAt: -1 });

module.exports = mongoose.model("MetaLeadFailure", metaLeadFailureSchema);
