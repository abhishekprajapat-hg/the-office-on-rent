const mongoose = require("mongoose");

const coworkingSettingSchema = new mongoose.Schema(
  {
    companyId: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
      ref: "Company",
      unique: true,
      index: true,
    },
    timezone: {
      type: String,
      trim: true,
      default: "Asia/Kolkata",
      maxlength: 80,
    },
    currency: {
      type: String,
      trim: true,
      uppercase: true,
      default: "INR",
      maxlength: 8,
    },
    invoicePrefix: {
      type: String,
      trim: true,
      uppercase: true,
      default: "INV",
      maxlength: 12,
    },
    paymentPrefix: {
      type: String,
      trim: true,
      uppercase: true,
      default: "PAY",
      maxlength: 12,
    },
    billingDueDay: {
      type: Number,
      default: 5,
      min: 1,
      max: 28,
    },
    taxPercent: {
      type: Number,
      default: 18,
      min: 0,
      max: 100,
    },
    bookingApprovalRequired: {
      type: Boolean,
      default: false,
    },
    visitorPassRequired: {
      type: Boolean,
      default: true,
    },
    defaultMeetingRoomBufferMinutes: {
      type: Number,
      default: 15,
      min: 0,
      max: 240,
    },
    contractRenewalReminderDays: {
      type: Number,
      default: 30,
      min: 0,
      max: 365,
    },
    maintenanceReminderDays: {
      type: Number,
      default: 7,
      min: 0,
      max: 365,
    },
    autoCloseResolvedTicketsDays: {
      type: Number,
      default: 3,
      min: 0,
      max: 90,
    },
    supportEmail: {
      type: String,
      trim: true,
      lowercase: true,
      default: "",
      maxlength: 160,
    },
    termsText: {
      type: String,
      trim: true,
      default: "",
      maxlength: 3000,
    },
    updatedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
  },
  { timestamps: true },
);

module.exports = mongoose.model("CoworkingSetting", coworkingSettingSchema);
