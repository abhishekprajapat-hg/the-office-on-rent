const mongoose = require("mongoose");

const ATTENDANCE_DATE_PATTERN = /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/;

const REGULARIZATION_STATUS = Object.freeze([
  "PENDING",
  "APPROVED",
  "REJECTED",
  "CANCELLED",
]);

const attendanceRegularizationSchema = new mongoose.Schema(
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
    attendanceDate: {
      type: String,
      required: true,
      match: ATTENDANCE_DATE_PATTERN,
      index: true,
    },
    requestedCheckInAt: {
      type: Date,
      default: null,
    },
    requestedCheckOutAt: {
      type: Date,
      default: null,
    },
    requestedTotalBreakMinutes: {
      type: Number,
      min: 0,
      default: 0,
    },
    reason: {
      type: String,
      trim: true,
      maxlength: 500,
      required: true,
    },
    status: {
      type: String,
      enum: REGULARIZATION_STATUS,
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
    resolvedAttendanceId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Attendance",
      default: null,
    },
    cancelledAt: {
      type: Date,
      default: null,
    },
  },
  { timestamps: true },
);

attendanceRegularizationSchema.index(
  { companyId: 1, userId: 1, attendanceDate: 1, status: 1 },
  { name: "regularization_user_date_status_idx" },
);
attendanceRegularizationSchema.index({ companyId: 1, status: 1, createdAt: -1 });

module.exports = mongoose.model("AttendanceRegularization", attendanceRegularizationSchema);
module.exports.REGULARIZATION_STATUS = REGULARIZATION_STATUS;
