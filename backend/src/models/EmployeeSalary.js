const mongoose = require("mongoose");

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
  },
  { timestamps: true },
);

employeeSalarySchema.index({ companyId: 1, userId: 1 }, { unique: true });

module.exports = mongoose.model("EmployeeSalary", employeeSalarySchema);
