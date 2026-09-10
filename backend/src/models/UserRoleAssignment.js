const mongoose = require("mongoose");

// Append-only record of which Role / Role Type a user held, and when.
//
// User.roleId / User.roleTypeId remain the authoritative current assignment
// (one lookup on the hot auth path); this collection is the history behind it,
// so "who moved this user off the Commercial Executive role, and when" is
// answerable without replaying audit-log metadata.

const userRoleAssignmentSchema = new mongoose.Schema(
  {
    companyId: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
      index: true,
      ref: "Company",
    },
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
      index: true,
      ref: "User",
    },
    roleId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Role",
      default: null,
    },
    roleTypeId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "RoleType",
      default: null,
    },
    // Snapshot of the USER_ROLES code at assignment time, so history stays
    // readable even if the Role document is later renamed or retired.
    baseRole: {
      type: String,
      trim: true,
      default: "",
    },
    isPrimary: {
      type: Boolean,
      default: true,
    },
    assignedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
    assignedAt: {
      type: Date,
      default: Date.now,
    },
    revokedAt: {
      type: Date,
      default: null,
    },
    source: {
      type: String,
      trim: true,
      default: "",
      maxlength: 60,
    },
  },
  { timestamps: true },
);

userRoleAssignmentSchema.index({ companyId: 1, userId: 1, revokedAt: 1 });
userRoleAssignmentSchema.index({ companyId: 1, roleId: 1, revokedAt: 1 });
userRoleAssignmentSchema.index({ companyId: 1, roleTypeId: 1, revokedAt: 1 });

module.exports = mongoose.model("UserRoleAssignment", userRoleAssignmentSchema);
