const mongoose = require("mongoose");

const ATTENDANCE_DATE_PATTERN = /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/;

const LEAVE_TYPES = Object.freeze([
  "CASUAL",
  "SICK",
  "EMERGENCY",
  "UNPAID",
  "OTHER",
]);

const LEAVE_STATUS = Object.freeze([
  "PENDING",
  "APPROVED",
  "REJECTED",
  "CANCELLED",
]);

const leaveRequestSchema = new mongoose.Schema(
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
      index: true,
    },
    fromDate: {
      type: String,
      required: true,
      match: ATTENDANCE_DATE_PATTERN,
      index: true,
    },
    toDate: {
      type: String,
      required: true,
      match: ATTENDANCE_DATE_PATTERN,
      index: true,
    },
    totalDays: {
      type: Number,
      min: 1,
      default: 1,
    },
    leaveType: {
      type: String,
      enum: LEAVE_TYPES,
      default: "CASUAL",
      index: true,
    },
    reason: {
      type: String,
      trim: true,
      maxlength: 500,
      required: true,
    },
    status: {
      type: String,
      enum: LEAVE_STATUS,
      default: "PENDING",
      index: true,
    },
    reviewedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
    reviewedAt: {
      type: Date,
      default: null,
    },
    reviewNote: {
      type: String,
      trim: true,
      maxlength: 500,
      default: "",
    },
    cancelledAt: {
      type: Date,
      default: null,
    },
  },
  { timestamps: true },
);

leaveRequestSchema.index({ companyId: 1, userId: 1, fromDate: 1, toDate: 1 });
leaveRequestSchema.index({ companyId: 1, status: 1, createdAt: -1 });
leaveRequestSchema.index({ companyId: 1, fromDate: 1, toDate: 1, status: 1 });

module.exports = mongoose.model("LeaveRequest", leaveRequestSchema);
module.exports.LEAVE_TYPES = LEAVE_TYPES;
module.exports.LEAVE_STATUS = LEAVE_STATUS;
