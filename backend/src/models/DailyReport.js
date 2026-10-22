const mongoose = require("mongoose");
const { ISSUE_STATUSES, ISSUE_PRIORITIES, ISSUE_CATEGORIES } = require("../constants/dailyReport.constants");

/*
 * One employee's daily report for one working day (requirements 16 Oct 2026,
 * sections 01-02). Checkout waits until today's report exists.
 *
 * The role, segment and form are copied in when the report is submitted, so
 * a report keeps its original context if the person later changes role.
 *
 * A correction never overwrites silently: the values that were there before go
 * into `amendments` with who changed them, when and why.
 */

const issueSchema = new mongoose.Schema(
  {
    category: { type: String, enum: ISSUE_CATEGORIES.map((c) => c.key), required: true },
    description: { type: String, trim: true, maxlength: 1000, default: "" },
    location: { type: String, trim: true, maxlength: 200, default: "" },
    actionTaken: { type: String, trim: true, maxlength: 1000, default: "" },
    status: { type: String, enum: ISSUE_STATUSES, default: "PENDING" },
    priority: { type: String, enum: ISSUE_PRIORITIES, default: "MEDIUM" },
  },
  { _id: false },
);

const amendmentSchema = new mongoose.Schema(
  {
    at: { type: Date, default: Date.now },
    by: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    byName: { type: String, default: "" },
    reason: { type: String, trim: true, maxlength: 500, default: "" },
    previous: { type: mongoose.Schema.Types.Mixed, default: {} },
  },
  { _id: false },
);

const dailyReportSchema = new mongoose.Schema(
  {
    companyId: { type: mongoose.Schema.Types.ObjectId, ref: "Company", required: true, index: true },
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    /* The working day, YYYY-MM-DD in the company's attendance timezone. */
    reportDate: { type: String, required: true, match: /^\d{4}-\d{2}-\d{2}$/ },
    formKey: { type: String, required: true },
    role: { type: String, required: true },
    roleType: { type: String, default: "" },
    /* Numbers keyed by the form's count fields. */
    counts: { type: mongoose.Schema.Types.Mixed, default: {} },
    /* Short notes keyed by the form's text fields. */
    notes: { type: mongoose.Schema.Types.Mixed, default: {} },
    issues: { type: [issueSchema], default: [] },
    submittedAt: { type: Date, default: Date.now },
    amendments: { type: [amendmentSchema], default: [] },
  },
  { timestamps: true, minimize: false },
);

// One report per person per day.
dailyReportSchema.index({ companyId: 1, userId: 1, reportDate: 1 }, { unique: true });
dailyReportSchema.index({ companyId: 1, reportDate: -1 });

module.exports = mongoose.model("DailyReport", dailyReportSchema);
