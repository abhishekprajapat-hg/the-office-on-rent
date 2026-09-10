const mongoose = require("mongoose");
const { USER_ROLES } = require("../constants/role.constants");
const { isValidPermission } = require("../constants/permission.constants");
const { isValidPageKey, isValidPageAction } = require("../constants/page.constants");

// A Role is a tenant-owned configuration layered on top of one of the fixed
// USER_ROLES codes (`baseRole`).
//
// baseRole is what keeps this backward compatible: User.role still holds a
// USER_ROLES value and still drives the reporting hierarchy, lead assignment,
// route gates and checkRole middleware exactly as before. The Role document
// adds page access, granular permissions, data scope and role-level reporting
// on top — it never replaces the base role.

const ROLE_STATUSES = Object.freeze(["ACTIVE", "INACTIVE"]);

// How much data an assigned user may see. Surfaced to the UI and stored with
// the role; the existing per-module scoping continues to apply on top.
const DATA_SCOPES = Object.freeze(["ALL", "BRANCH", "TEAM", "ASSIGNED", "SELF"]);

const rolePageSchema = new mongoose.Schema(
  {
    pageKey: {
      type: String,
      required: true,
      trim: true,
      validate: {
        validator: (value) => isValidPageKey(value),
        message: "Unknown CRM page",
      },
    },
    actions: {
      type: [String],
      default: [],
    },
  },
  { _id: false },
);

rolePageSchema.path("actions").validate(function validateActions(values) {
  return (values || []).every((action) => isValidPageAction(this.pageKey, action));
}, "One or more page actions are not valid for this page");

const roleSchema = new mongoose.Schema(
  {
    companyId: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
      index: true,
      ref: "Company",
    },
    name: {
      type: String,
      required: true,
      trim: true,
      maxlength: 80,
    },
    normalizedName: {
      type: String,
      required: true,
      trim: true,
      lowercase: true,
      maxlength: 80,
    },
    code: {
      type: String,
      required: true,
      trim: true,
      uppercase: true,
      maxlength: 60,
    },
    description: {
      type: String,
      trim: true,
      default: "",
      maxlength: 500,
    },
    // A Role belongs to at least one Role Type. The array supports the
    // "one role across multiple Role Types" case; single-entry arrays preserve
    // the existing one-role-type relationship.
    roleTypeIds: {
      type: [{ type: mongoose.Schema.Types.ObjectId, ref: "RoleType" }],
      default: [],
      validate: {
        validator: (values) => Array.isArray(values) && values.length > 0,
        message: "A role must belong to at least one role type",
      },
    },
    baseRole: {
      type: String,
      enum: Object.values(USER_ROLES),
      required: true,
      index: true,
    },
    pages: {
      type: [rolePageSchema],
      default: [],
    },
    permissions: {
      type: [String],
      default: [],
      validate: {
        validator: (values) => values.every((value) => isValidPermission(value)),
        message: "One or more permissions are not recognized",
      },
    },
    dataScope: {
      type: String,
      enum: DATA_SCOPES,
      default: "ASSIGNED",
    },
    reportingRoleId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Role",
      default: null,
    },
    status: {
      type: String,
      enum: ROLE_STATUSES,
      default: "ACTIVE",
      index: true,
    },
    // Seeded from the fixed USER_ROLES catalogue. System roles cannot be
    // deleted and cannot have their baseRole changed.
    isSystem: {
      type: Boolean,
      default: false,
    },
    // When false the API page guard skips this role entirely. The migration
    // seeds system roles with `false` so existing accounts keep exactly the API
    // access they have today; it flips to true the moment an Admin edits the
    // role's page access, and roles created through the API start with it on.
    enforcePageAccess: {
      type: Boolean,
      default: true,
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
    updatedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
  },
  { timestamps: true },
);

roleSchema.index({ companyId: 1, normalizedName: 1 }, { unique: true });
roleSchema.index({ companyId: 1, code: 1 }, { unique: true });
roleSchema.index({ companyId: 1, roleTypeIds: 1, status: 1, name: 1 });

const Role = mongoose.model("Role", roleSchema);

Role.ROLE_STATUSES = ROLE_STATUSES;
Role.DATA_SCOPES = DATA_SCOPES;

module.exports = Role;
