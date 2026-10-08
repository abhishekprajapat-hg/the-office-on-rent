const mongoose = require("mongoose");

/*
 * A further office people may check in from, with its own geofence. The main
 * office above stays open to everyone; one of these only to the employees an
 * admin or manager has listed against it - the few who work from that branch.
 */
const extraOfficeSchema = new mongoose.Schema({
  name: { type: String, trim: true, required: true, maxlength: 80 },
  latitude: { type: Number, min: -90, max: 90, required: true },
  longitude: { type: Number, min: -180, max: 180, required: true },
  radiusMeters: { type: Number, min: 10, max: 5000, default: 200 },
  userIds: [{ type: mongoose.Schema.Types.ObjectId, ref: "User" }],
});

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
      default: 60,
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
      default: 450,
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
    geofenceEnabled: {
      type: Boolean,
      default: false,
    },
    officeLatitude: {
      type: Number,
      min: -90,
      max: 90,
      default: null,
    },
    officeLongitude: {
      type: Number,
      min: -180,
      max: 180,
      default: null,
    },
    officeRadiusMeters: {
      type: Number,
      min: 10,
      max: 5000,
      default: 200,
    },
    offices: {
      type: [extraOfficeSchema],
      default: [],
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
