const mongoose = require("mongoose");
const { customDeductionSchema, deductionRuleSchema } = require("./PayrollPolicy");

const MONTH_KEY_PATTERN = /^\d{4}-(0[1-9]|1[0-2])$/;

/*
 * One person's salary, kept as a list of revisions rather than a single number.
 *
 * Each revision says what the monthly salary is from a given month on. A raise
 * in November is a new revision effective 2026-11; October's figures keep
 * using the old one, so looking back at a past month shows what was actually
 * owed then. Nothing is overwritten - who set each figure, and why, stays.
 *
 * Deliberately not a field on User: the user endpoints hand profiles out to
 * colleagues in many places, and a salary must never ride along with them.
 */
const salaryRevisionSchema = new mongoose.Schema(
  {
    monthlySalary: { type: Number, min: 0, max: 100000000, required: true },
    effectiveFrom: { type: String, required: true, match: MONTH_KEY_PATTERN },
    note: { type: String, trim: true, maxlength: 240, default: "" },
    setBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    setByName: { type: String, trim: true, default: "" },
    setByRole: { type: String, trim: true, default: "" },
    setAt: { type: Date, required: true },
  },
  { _id: false },
);

/*
 * This person's own attendance deductions - "₹1,000 for each absent day, ₹500
 * for a half day" - in place of the company's rules. Null means the company's
 * rules apply. Kept whole rather than field by field, so what a manager saw
 * and saved is exactly what is used.
 */
const employeeRulesSchema = new mongoose.Schema(
  {
    absent: { type: deductionRuleSchema, required: true },
    unapprovedLeave: { type: deductionRuleSchema, required: true },
    halfDay: { type: deductionRuleSchema, required: true },
    unpaidLeave: { type: deductionRuleSchema, required: true },
    paidLeave: { type: deductionRuleSchema, required: true },
    lateGraceCount: { type: Number, min: 0, max: 31, required: true },
    lateEveryCount: { type: Number, min: 1, max: 31, required: true },
    late: { type: deductionRuleSchema, required: true },
    updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
    updatedByName: { type: String, trim: true, default: "" },
    updatedAt: { type: Date, default: null },
  },
  { _id: false },
);

const employeeSalarySchema = new mongoose.Schema(
  {
    companyId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Company",
      required: true,
      index: true,
    },
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    revisions: {
      type: [salaryRevisionSchema],
      default: [],
    },
    deductionRules: {
      type: employeeRulesSchema,
      default: null,
    },
    // Named deductions for this person only, e.g. an advance being recovered.
    deductions: {
      type: [customDeductionSchema],
      default: [],
    },
  },
  { timestamps: true },
);

employeeSalarySchema.index({ companyId: 1, userId: 1 }, { unique: true });

module.exports = mongoose.model("EmployeeSalary", employeeSalarySchema);
