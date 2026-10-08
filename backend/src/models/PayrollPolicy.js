const mongoose = require("mongoose");
const {
  PER_DAY_BASIS,
  LATE_DEDUCTION_UNIT,
  DEFAULT_PAYROLL_POLICY,
} = require("../services/payroll.calc");

/*
 * How a company turns attendance into salary deductions. One per company;
 * until one is saved the defaults in payroll.calc apply.
 *
 * Every deduction for a kind of day is in days of pay (0.5 = half a day's
 * pay), so the rules read the same whatever anybody earns. Late check-ins are
 * the exception that can also be a flat amount.
 */
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
    absentDays: { type: Number, min: 0, max: 5, default: DEFAULT_PAYROLL_POLICY.absentDays },
    unapprovedLeaveDays: { type: Number, min: 0, max: 5, default: DEFAULT_PAYROLL_POLICY.unapprovedLeaveDays },
    halfDayDays: { type: Number, min: 0, max: 5, default: DEFAULT_PAYROLL_POLICY.halfDayDays },
    unpaidLeaveDays: { type: Number, min: 0, max: 5, default: DEFAULT_PAYROLL_POLICY.unpaidLeaveDays },
    paidLeaveDays: { type: Number, min: 0, max: 5, default: DEFAULT_PAYROLL_POLICY.paidLeaveDays },
    lateGraceCount: { type: Number, min: 0, max: 31, default: DEFAULT_PAYROLL_POLICY.lateGraceCount },
    lateEveryCount: { type: Number, min: 1, max: 31, default: DEFAULT_PAYROLL_POLICY.lateEveryCount },
    lateDeductionUnit: {
      type: String,
      enum: Object.values(LATE_DEDUCTION_UNIT),
      default: DEFAULT_PAYROLL_POLICY.lateDeductionUnit,
    },
    lateDeductionValue: { type: Number, min: 0, max: 100000, default: DEFAULT_PAYROLL_POLICY.lateDeductionValue },
    updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
    updatedByName: { type: String, trim: true, default: "" },
  },
  { timestamps: true },
);

module.exports = mongoose.model("PayrollPolicy", payrollPolicySchema);
