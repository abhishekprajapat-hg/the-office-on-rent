const mongoose = require("mongoose");
const { USER_ROLES } = require("../constants/role.constants");

const MONTH_KEY_PATTERN = /^\d{4}-(0[1-9]|1[0-2])$/;

const targetAssignmentSchema = new mongoose.Schema(
  {
    companyId: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
      ref: "Company",
      index: true,
    },
    assignedBy: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
      ref: "User",
      index: true,
    },
    assignedByRole: {
      type: String,
      enum: Object.values(USER_ROLES),
      required: true,
    },
    assignedTo: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
      ref: "User",
      index: true,
    },
    assignedToRole: {
      type: String,
      enum: Object.values(USER_ROLES),
      required: true,
    },
    month: {
      type: String,
      required: true,
      match: MONTH_KEY_PATTERN,
      index: true,
    },
    leadsTarget: {
      type: Number,
      min: 0,
      default: 0,
    },
    revenueTarget: {
      type: Number,
      min: 0,
      default: 0,
    },
    siteVisitTarget: {
      type: Number,
      min: 0,
      default: 0,
    },
    // Requirements 16 Oct 2026, 3.1: role-specific targets - deals closed for
    // sales, published posts for production (from their daily reports).
    dealsTarget: { type: Number, min: 0, default: 0 },
    productionTarget: { type: Number, min: 0, default: 0 },
    notes: {
      type: String,
      trim: true,
      maxlength: 500,
      default: "",
    },
    // Who changed the target, when, and what it was before (3.1).
    history: {
      type: [{
        at: { type: Date, default: Date.now },
        by: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
        byName: { type: String, default: "" },
        previous: { type: mongoose.Schema.Types.Mixed, default: null },
        next: { type: mongoose.Schema.Types.Mixed, default: null },
        _id: false,
      }],
      default: [],
    },
  },
  { timestamps: true },
);

targetAssignmentSchema.index(
  { companyId: 1, assignedTo: 1, month: 1 },
  { unique: true },
);
targetAssignmentSchema.index({ companyId: 1, assignedBy: 1, month: 1 });
targetAssignmentSchema.index({ companyId: 1, month: 1, assignedToRole: 1 });

module.exports = mongoose.model("TargetAssignment", targetAssignmentSchema);
