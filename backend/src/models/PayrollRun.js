const mongoose = require("mongoose");

/*
 * A finalised month's salary sheet. Frozen when an admin finalises the month: later edits
 * to attendance, salaries or rules do not change it. A correction reopens it and finalises
 * a new version, which BillStack takes in place of the old one while nothing is paid there.
 */
const lineSchema = new mongoose.Schema(
  {
    key: { type: String, default: "" },
    label: { type: String, required: true },
    count: { type: Number, default: null },
    rule: { type: String, default: "" },
    amount: { type: Number, required: true, min: 0 },
  },
  { _id: false },
);

const rowSchema = new mongoose.Schema(
  {
    userId: { type: String, required: true },
    name: { type: String, default: "" },
    email: { type: String, default: "" },
    department: { type: String, default: "" },
    role: { type: String, default: "" },
    monthlySalary: { type: Number, required: true, min: 0 },
    perDayRate: { type: Number, default: 0 },
    attendance: {
      workingDays: { type: Number, default: null },
      absent: { type: Number, default: 0 },
      halfDay: { type: Number, default: 0 },
      unapprovedLeave: { type: Number, default: 0 },
      unpaidLeave: { type: Number, default: 0 },
      paidLeave: { type: Number, default: 0 },
      leaveBeyondEntitlement: { type: Number, default: 0 },
      late: { type: Number, default: 0 },
      lateCharged: { type: Number, default: 0 },
      workedOnOffDays: { type: Number, default: 0 },
    },
    attendanceLines: { type: [lineSchema], default: [] },
    attendanceDeduction: { type: Number, default: 0 },
    earnedSalary: { type: Number, required: true, min: 0 },
    additions: { type: [lineSchema], default: [] },
    gross: { type: Number, required: true, min: 0 },
    deductions: { type: [lineSchema], default: [] },
    totalDeduction: { type: Number, default: 0 },
    net: { type: Number, required: true, min: 0 },
    kpi: {
      score: { type: Number, default: null },
      grade: { type: String, default: "" },
      computedScore: { type: Number, default: null },
      edited: { type: Boolean, default: false },
      targetScore: { type: Number, default: null },
      targets: { type: [{ _id: false, label: String, goal: Number, achieved: Number, percent: Number }], default: [] },
    },
    // What the admin set on the payroll sheet (blank fields are absent) and what the CRM
    // itself worked out, kept so a reopened month starts from the same edits. CRM-only.
    edits: { type: mongoose.Schema.Types.Mixed, default: {} },
    computed: { type: mongoose.Schema.Types.Mixed, default: {} },
    warnings: { type: [String], default: [] },
  },
  { _id: false, minimize: false },
);

const payrollRunSchema = new mongoose.Schema(
  {
    companyId: { type: mongoose.Schema.Types.ObjectId, ref: "Company", required: true, index: true },
    month: { type: String, required: true, match: /^\d{4}-(0[1-9]|1[0-2])$/ },
    version: { type: Number, required: true, min: 1 },
    status: { type: String, enum: ["FINALISED", "REOPENED"], default: "FINALISED" },
    rows: { type: [rowSchema], default: [] },
    totals: {
      employees: { type: Number, default: 0 },
      monthlySalary: { type: Number, default: 0 },
      attendanceDeduction: { type: Number, default: 0 },
      additions: { type: Number, default: 0 },
      gross: { type: Number, default: 0 },
      deductions: { type: Number, default: 0 },
      net: { type: Number, default: 0 },
    },
    kpiIncentive: { type: mongoose.Schema.Types.Mixed, default: null },
    finalisedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
    finalisedByName: { type: String, default: "" },
    finalisedAt: { type: Date, default: null },
    reopenedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
    reopenedByName: { type: String, default: "" },
    reopenedAt: { type: Date, default: null },
    reopenReason: { type: String, default: "" },
    billstack: {
      status: { type: String, enum: ["NOT_SENT", "SENT", "FAILED", "OFF"], default: "NOT_SENT" },
      outcome: { type: String, default: "" },
      remoteRunId: { type: String, default: "" },
      remoteStatus: { type: String, default: "" },
      lastError: { type: String, default: "" },
      sentAt: { type: Date, default: null },
      attempts: { type: Number, default: 0 },
    },
  },
  { timestamps: true },
);

payrollRunSchema.index({ companyId: 1, month: 1, version: 1 }, { unique: true });
// one finalised sheet per month at a time
payrollRunSchema.index({ companyId: 1, month: 1 }, { unique: true, partialFilterExpression: { status: "FINALISED" } });

module.exports = mongoose.model("PayrollRun", payrollRunSchema);
