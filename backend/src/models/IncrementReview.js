const mongoose = require("mongoose");

/*
 * An increment review (requirements 16 Oct 2026, 3.4). The performance score
 * is an input, saved with the review as it stood; the decision is a person's.
 * Nothing here changes a salary: an approved increment is applied as a salary
 * revision by whoever manages pay. Admin and Manager only.
 */
const DECISIONS = Object.freeze(["PENDING", "APPROVED", "REJECTED", "DEFERRED"]);
const INCREMENT_TYPES = Object.freeze(["PERCENT", "AMOUNT", ""]);

const incrementReviewSchema = new mongoose.Schema(
  {
    companyId: { type: mongoose.Schema.Types.ObjectId, ref: "Company", required: true, index: true },
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
    periodFrom: { type: String, required: true, match: /^\d{4}-(0[1-9]|1[0-2])$/ },
    periodTo: { type: String, required: true, match: /^\d{4}-(0[1-9]|1[0-2])$/ },
    scoreSnapshot: {
      averageScore: { type: Number, default: null },
      months: { type: [{ month: String, score: Number, _id: false }], default: [] },
    },
    reviewerId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    decision: { type: String, enum: DECISIONS, default: "PENDING" },
    incrementType: { type: String, enum: INCREMENT_TYPES, default: "" },
    incrementValue: { type: Number, min: 0, default: null },
    effectiveDate: { type: String, default: "", match: /^(\d{4}-\d{2}-\d{2})?$/ },
    notes: { type: String, trim: true, maxlength: 2000, default: "" },
    history: {
      type: [{ at: Date, by: { type: mongoose.Schema.Types.ObjectId, ref: "User" }, byName: String, change: mongoose.Schema.Types.Mixed, _id: false }],
      default: [],
    },
  },
  { timestamps: true },
);

module.exports = mongoose.model("IncrementReview", incrementReviewSchema);
module.exports.DECISIONS = DECISIONS;
module.exports.INCREMENT_TYPES = INCREMENT_TYPES;
