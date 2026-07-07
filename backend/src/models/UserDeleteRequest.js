const mongoose = require("mongoose");

const userDeleteRequestSchema = new mongoose.Schema(
  {
    companyId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Company",
      required: true,
      index: true,
    },
    requestedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    targetUser: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    reason: {
      type: String,
      default: "",
      maxlength: 500,
    },
    snapshot: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },
    status: {
      type: String,
      enum: ["PENDING", "APPROVED", "REJECTED"],
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
      default: "",
      maxlength: 500,
    },
  },
  { timestamps: true },
);

userDeleteRequestSchema.index(
  { companyId: 1, targetUser: 1, status: 1 },
  {
    unique: true,
    partialFilterExpression: { status: "PENDING" },
  },
);

module.exports = mongoose.model("UserDeleteRequest", userDeleteRequestSchema);
