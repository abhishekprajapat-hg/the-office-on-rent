const mongoose = require("mongoose");
const E = require("../constants/enterprise.constants");

/*
 * A company's own document checklist for one tenant entity type (2.4), edited
 * by an Admin without a code change. When none is saved, the defaults in
 * enterprise.constants (from the company's documents handout) apply.
 */
const enterpriseChecklistSchema = new mongoose.Schema(
  {
    companyId: { type: mongoose.Schema.Types.ObjectId, ref: "Company", required: true },
    entityType: { type: String, enum: E.ENTITY_TYPES, required: true },
    items: {
      type: [{
        key: { type: String, required: true, trim: true, maxlength: 60 },
        label: { type: String, required: true, trim: true, maxlength: 200 },
        scope: { type: String, enum: ["ENTITY", "SIGNATORY", "AGREEMENT"], required: true },
        required: { type: Boolean, default: true },
        hint: { type: String, trim: true, maxlength: 200, default: "" },
        _id: false,
      }],
      default: [],
    },
    sourceNote: { type: String, trim: true, maxlength: 300, default: "" },
    updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
    updatedByName: { type: String, default: "" },
  },
  { timestamps: true },
);
enterpriseChecklistSchema.index({ companyId: 1, entityType: 1 }, { unique: true });

module.exports = mongoose.model("EnterpriseChecklist", enterpriseChecklistSchema);
