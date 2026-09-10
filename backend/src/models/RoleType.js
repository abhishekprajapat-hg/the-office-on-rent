const mongoose = require("mongoose");

// A Role Type is a tenant-owned business division that Roles hang off:
// Commercial, Residential and Both are seeded by the migration; Coworking,
// Finance, HR, Operations and anything else are created by an authorized
// Admin or Manager at runtime.
//
// Users and Roles reference a Role Type by _id, never by name, so renaming a
// Role Type is a pure label change — see roleTypeMigration.service.js.

const ROLE_TYPE_STATUSES = Object.freeze(["ACTIVE", "INACTIVE"]);

// Mirror of the legacy User.roleType enum. Every Role Type carries one so that
// lead routing and inventory ownership (which have always keyed off
// COMMERCIAL / RESIDENTIAL / BOTH) keep working for users on a custom type.
const LEGACY_ROLE_TYPES = Object.freeze(["COMMERCIAL", "RESIDENTIAL", "BOTH"]);

const roleTypeSchema = new mongoose.Schema(
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
    // Lowercased name, maintained by the service layer purely to back the
    // per-tenant uniqueness index (Mongo has no case-insensitive unique index
    // without a collation this schema would otherwise not need).
    normalizedName: {
      type: String,
      required: true,
      trim: true,
      lowercase: true,
      maxlength: 80,
    },
    // Stable machine code. Kept for readable audit metadata and for the seeded
    // system types (COMMERCIAL / RESIDENTIAL / BOTH); never used as a foreign
    // key — that is always _id.
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
    status: {
      type: String,
      enum: ROLE_TYPE_STATUSES,
      default: "ACTIVE",
      index: true,
    },
    branch: {
      type: String,
      trim: true,
      default: "",
      maxlength: 80,
    },
    department: {
      type: String,
      trim: true,
      default: "",
      maxlength: 80,
    },
    division: {
      type: String,
      trim: true,
      default: "",
      maxlength: 80,
    },
    legacyRoleType: {
      type: String,
      enum: LEGACY_ROLE_TYPES,
      default: "COMMERCIAL",
    },
    // Commercial / Residential / Both. Protected from deletion, and editable
    // only by an ADMIN.
    isSystem: {
      type: Boolean,
      default: false,
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

roleTypeSchema.index({ companyId: 1, normalizedName: 1 }, { unique: true });
roleTypeSchema.index({ companyId: 1, code: 1 }, { unique: true });
roleTypeSchema.index({ companyId: 1, status: 1, name: 1 });

const RoleType = mongoose.model("RoleType", roleTypeSchema);

RoleType.ROLE_TYPE_STATUSES = ROLE_TYPE_STATUSES;
RoleType.LEGACY_ROLE_TYPES = LEGACY_ROLE_TYPES;

module.exports = RoleType;
