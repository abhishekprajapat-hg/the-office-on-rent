const mongoose = require("mongoose");

const attendancePolicySchema = new mongoose.Schema(
  {
    companyId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Company",
      required: true,
      unique: true,
      index: true,
    },
    timezone: {
      type: String,
      trim: true,
      default: "Asia/Kolkata",
    },
    shiftStartMinutes: {
      type: Number,
      min: 0,
      max: 1439,
      default: 10 * 60,
    },
    shiftEndMinutes: {
      type: Number,
      min: 0,
      max: 1439,
      default: 19 * 60,
    },
    graceMinutes: {
      type: Number,
      min: 0,
      max: 180,
      default: 15,
    },
    halfDayMinutes: {
      type: Number,
      min: 0,
      max: 1000,
      default: 240,
    },
    fullDayMinutes: {
      type: Number,
      min: 0,
      max: 1000,
      default: 480,
    },
    weeklyOffDays: {
      type: [Number],
      default: [0],
      validate: {
        validator(value) {
          return Array.isArray(value)
            && value.every((day) => Number.isInteger(day) && day >= 0 && day <= 6);
        },
        message: "weeklyOffDays must contain weekday numbers between 0 and 6",
      },
    },
    allowCheckoutDuringBreak: {
      type: Boolean,
      default: true,
    },
    notes: {
      type: String,
      trim: true,
      maxlength: 500,
      default: "",
    },
  },
  { timestamps: true },
);

module.exports = mongoose.model("AttendancePolicy", attendancePolicySchema);
