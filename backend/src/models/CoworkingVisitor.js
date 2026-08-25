const mongoose = require("mongoose");

const VISITOR_STATUSES = ["CHECKED_IN", "CHECKED_OUT"];

const coworkingVisitorSchema = new mongoose.Schema(
  {
    companyId: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
      ref: "Company",
      index: true,
    },
    propertyId: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
      ref: "CoworkingProperty",
      index: true,
    },
    clientId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "CoworkingClient",
      default: null,
      index: true,
    },
    visitorCode: {
      type: String,
      required: true,
      trim: true,
    },
    visitorName: {
      type: String,
      required: true,
      trim: true,
      maxlength: 120,
    },
    phone: {
      type: String,
      trim: true,
      default: "",
      maxlength: 32,
    },
    email: {
      type: String,
      trim: true,
      lowercase: true,
      default: "",
      maxlength: 160,
    },
    hostName: {
      type: String,
      trim: true,
      default: "",
      maxlength: 120,
    },
    purpose: {
      type: String,
      trim: true,
      default: "",
      maxlength: 240,
    },
    idProofType: {
      type: String,
      trim: true,
      default: "",
      maxlength: 80,
    },
    idProofLast4: {
      type: String,
      trim: true,
      default: "",
      maxlength: 4,
    },
    status: {
      type: String,
      enum: VISITOR_STATUSES,
      default: "CHECKED_IN",
    },
    checkInAt: {
      type: Date,
      default: Date.now,
    },
    checkOutAt: {
      type: Date,
      default: null,
    },
    notes: {
      type: String,
      trim: true,
      default: "",
      maxlength: 1000,
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    updatedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
  },
  { timestamps: true },
);

coworkingVisitorSchema.index({ companyId: 1, visitorCode: 1 }, { unique: true });
coworkingVisitorSchema.index({ companyId: 1, status: 1, checkInAt: -1 });
coworkingVisitorSchema.index({ companyId: 1, propertyId: 1, checkInAt: -1 });

module.exports = mongoose.model("CoworkingVisitor", coworkingVisitorSchema);
module.exports.VISITOR_STATUSES = VISITOR_STATUSES;
