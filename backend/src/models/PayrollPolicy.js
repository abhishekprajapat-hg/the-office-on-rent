const mongoose = require("mongoose");
const {
  PER_DAY_BASIS,
  DEDUCTION_UNIT,
  DEDUCTION_FREQUENCY,
  DEFAULT_PAYROLL_POLICY,
} = require("../services/payroll.calc");

/*
 * How a company turns attendance into salary deductions. One per company;
 * until one is saved the defaults in payroll.calc apply.
 *
 * Each kind of day has its own rule, and each rule picks its own unit: days of
 * pay (0.5 = half a day's pay), a fixed rupee amount, or a percentage of the
 * monthly salary. The salary controller checks the value against its unit
 * before saving; the schema only keeps it non-negative.
 */
const deductionRuleSchema = new mongoose.Schema(
  {
    unit: { type: String, enum: Object.values(DEDUCTION_UNIT), default: DEDUCTION_UNIT.DAYS },
    value: { type: Number, min: 0, max: 100000, default: 0 },
  },
  { _id: false },
);

/*
 * A deduction an admin or manager named themselves ("PF", "Advance recovery").
 * Used for the company's list here and for one person's list on
 * EmployeeSalary. A one-month deduction has toMonth equal to fromMonth; an
 * every-month one may leave toMonth empty to run until somebody ends it.
 */
const customDeductionSchema = new mongoose.Schema(
  {
    name: { type: String, trim: true, required: true, maxlength: 60 },
    unit: { type: String, enum: Object.values(DEDUCTION_UNIT), required: true },
    value: { type: Number, min: 0, max: 100000, required: true },
    frequency: { type: String, enum: Object.values(DEDUCTION_FREQUENCY), default: DEDUCTION_FREQUENCY.MONTHLY },
    fromMonth: { type: String, required: true, match: /^\d{4}-(0[1-9]|1[0-2])$/ },
    toMonth: { type: String, default: "", match: /^(\d{4}-(0[1-9]|1[0-2]))?$/ },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
    createdByName: { type: String, trim: true, default: "" },
    createdAt: { type: Date, default: null },
    updatedByName: { type: String, trim: true, default: "" },
    updatedAt: { type: Date, default: null },
  },
  { _id: true },
);

const ruleField = (key) => ({
  type: deductionRuleSchema,
  default: () => ({ ...DEFAULT_PAYROLL_POLICY[key] }),
});

const payrollPolicySchema = new mongoose.Schema(
  {
    companyId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Company",
      required: true,
      unique: true,
      index: true,
    },
    perDayBasis: {
      type: String,
      enum: Object.values(PER_DAY_BASIS),
      default: DEFAULT_PAYROLL_POLICY.perDayBasis,
    },
    fixedDaysPerMonth: { type: Number, min: 1, max: 31, default: DEFAULT_PAYROLL_POLICY.fixedDaysPerMonth },
    absent: ruleField("absent"),
    unapprovedLeave: ruleField("unapprovedLeave"),
    halfDay: ruleField("halfDay"),
    unpaidLeave: ruleField("unpaidLeave"),
    paidLeave: ruleField("paidLeave"),
    lateGraceCount: { type: Number, min: 0, max: 31, default: DEFAULT_PAYROLL_POLICY.lateGraceCount },
    lateEveryCount: { type: Number, min: 1, max: 31, default: DEFAULT_PAYROLL_POLICY.lateEveryCount },
    late: ruleField("late"),
    // Named deductions everybody with a salary pays.
    customDeductions: { type: [customDeductionSchema], default: [] },
    updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
    updatedByName: { type: String, trim: true, default: "" },
  },
  { timestamps: true },
);

module.exports = mongoose.model("PayrollPolicy", payrollPolicySchema);
module.exports.customDeductionSchema = customDeductionSchema;
module.exports.deductionRuleSchema = deductionRuleSchema;
