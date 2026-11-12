const mongoose = require("mongoose");

/*
 * Expected daily activity per report form and segment (requirements 3 Nov
 * 2026, 7.1). Targets are set by Admin / Manager and are separate from the
 * report itself: the examples spoken in the meeting are not fixed targets.
 * segment "" applies to everyone on the form unless a segment-specific row
 * exists.
 */
const dailyReportTargetSchema = new mongoose.Schema(
  {
    companyId: { type: mongoose.Schema.Types.ObjectId, ref: "Company", required: true, index: true },
    formKey: { type: String, required: true, trim: true, maxlength: 60 },
    segment: { type: String, trim: true, uppercase: true, default: "" },
    targets: { type: Map, of: Number, default: {} },
    updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
    updatedByName: { type: String, default: "" },
  },
  { timestamps: true },
);

dailyReportTargetSchema.index({ companyId: 1, formKey: 1, segment: 1 }, { unique: true });

module.exports = mongoose.model("DailyReportTarget", dailyReportTargetSchema);
