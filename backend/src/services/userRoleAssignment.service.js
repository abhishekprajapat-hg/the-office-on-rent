const mongoose = require("mongoose");
const Role = require("../models/Role");
const RoleType = require("../models/RoleType");
const UserRoleAssignment = require("../models/UserRoleAssignment");
const { USER_ROLES } = require("../constants/role.constants");
const { createHttpError } = require("../utils/httpError");
const { writeAuditLog } = require("./auditLog.service");
const { isAdminRole, assertGrantablePermissions } = require("./access.service");
const { getDescendantUsers } = require("./hierarchy.service");

const isValidObjectId = (value) => mongoose.Types.ObjectId.isValid(value);
const LEGACY_ROLE_TYPES = new Set(["COMMERCIAL", "RESIDENTIAL", "BOTH"]);

const toId = (value) => {
  if (!value) return "";
  if (typeof value === "string") return value;
  return String(value._id || value);
};

/**
 * Resolves the Role Type / Role pair chosen on the Create User (or edit user)
 * form into the fields a User document actually stores.
 *
 * Returns both the new id references AND the legacy `role` / `roleType` values,
 * because everything downstream — reporting hierarchy, lead assignment, route
 * gates — still reads those. The dynamic Role's `baseRole` is what fills
 * `role`, which is why a custom role can never grant an account a capability
 * the fixed role catalogue does not already understand.
 */
const resolveRoleAssignment = async ({
  companyId,
  roleTypeId,
  roleId,
  fallbackRole,
  fallbackRoleType,
  actingUser,
}) => {
  const requestedRoleTypeId = String(roleTypeId || "").trim();
  const requestedRoleId = String(roleId || "").trim();

  // Nothing dynamic was chosen — the legacy payload shape. Keep the old
  // behaviour verbatim so existing API clients and seeders keep working.
  if (!requestedRoleTypeId && !requestedRoleId) {
    return {
      role: fallbackRole,
      roleType: LEGACY_ROLE_TYPES.has(String(fallbackRoleType || "").toUpperCase())
        ? String(fallbackRoleType).toUpperCase()
        : "COMMERCIAL",
      roleTypeId: null,
      roleId: null,
      roleDoc: null,
      roleTypeDoc: null,
    };
  }

  if (!requestedRoleTypeId || !isValidObjectId(requestedRoleTypeId)) {
    throw createHttpError(400, "A valid role type is required");
  }

  const roleTypeDoc = await RoleType.findOne({ _id: requestedRoleTypeId, companyId })
    .select("_id name status legacyRoleType")
    .lean();
  if (!roleTypeDoc) {
    throw createHttpError(400, "Role type not found for this organization");
  }
  if (roleTypeDoc.status !== "ACTIVE") {
    throw createHttpError(400, `Role type "${roleTypeDoc.name}" is inactive`);
  }

  if (!requestedRoleId || !isValidObjectId(requestedRoleId)) {
    throw createHttpError(400, "A valid role is required");
  }

  const roleDoc = await Role.findOne({ _id: requestedRoleId, companyId })
    .select("_id name status baseRole roleTypeIds permissions")
    .lean();
  if (!roleDoc) {
    throw createHttpError(400, "Role not found for this organization");
  }
  if (roleDoc.status !== "ACTIVE") {
    throw createHttpError(400, `Role "${roleDoc.name}" is inactive`);
  }

  const belongsToRoleType = (roleDoc.roleTypeIds || []).some(
    (id) => String(id) === String(roleTypeDoc._id),
  );
  if (!belongsToRoleType) {
    throw createHttpError(
      400,
      `Role "${roleDoc.name}" does not belong to role type "${roleTypeDoc.name}"`,
    );
  }

  if (roleDoc.baseRole === USER_ROLES.ADMIN) {
    throw createHttpError(403, "Admin accounts cannot be created from this endpoint");
  }

  // A Manager may not assign a role that carries more than they hold.
  await assertGrantablePermissions({
    actor: actingUser,
    permissions: roleDoc.permissions || [],
  });

  return {
    role: roleDoc.baseRole,
    roleType: LEGACY_ROLE_TYPES.has(String(roleTypeDoc.legacyRoleType || "").toUpperCase())
      ? String(roleTypeDoc.legacyRoleType).toUpperCase()
      : "COMMERCIAL",
    roleTypeId: roleTypeDoc._id,
    roleId: roleDoc._id,
    roleDoc,
    roleTypeDoc,
  };
};

/**
 * A Manager manages their own branch of the tree, not the whole tenant. When
 * they name a reporting manager explicitly it has to be themselves or someone
 * beneath them; auto-assignment (the existing least-loaded lookup) is left
 * alone so current create-user flows keep working unchanged.
 */
const assertReportingTargetInActorScope = async ({ actingUser, parentId, companyId }) => {
  if (isAdminRole(actingUser?.role)) return;
  if (!parentId) return;

  if (String(parentId) === String(actingUser._id)) return;

  const descendants = await getDescendantUsers({
    rootUserId: actingUser._id,
    companyId,
    includeInactive: true,
    select: "_id",
  });

  const inScope = descendants.some((row) => String(row._id) === String(parentId));
  if (!inScope) {
    throw createHttpError(
      403,
      "You can only assign a reporting manager inside your own team",
    );
  }
};

/** Blocks the self-promotion path: nobody but an Admin re-roles their own account. */
const assertNotSelfPromotion = ({ actingUser, targetUserId }) => {
  if (isAdminRole(actingUser?.role)) return;
  if (String(actingUser?._id) !== String(targetUserId)) return;
  throw createHttpError(403, "You cannot change your own role or role type");
};

const recordAssignment = async ({
  companyId,
  userId,
  roleId,
  roleTypeId,
  baseRole,
  actingUser,
  source = "user-form",
}) => {
  try {
    await UserRoleAssignment.updateMany(
      { companyId, userId, revokedAt: null },
      { $set: { revokedAt: new Date(), isPrimary: false } },
    );

    await UserRoleAssignment.create({
      companyId,
      userId,
      roleId: roleId || null,
      roleTypeId: roleTypeId || null,
      baseRole: baseRole || "",
      isPrimary: true,
      assignedBy: actingUser?._id || null,
      source,
    });
  } catch {
    // Assignment history is a record of the change, never a gate on it.
  }
};

const auditAssignmentChange = async ({
  companyId,
  actingUser,
  targetUser,
  previous,
  next,
  req,
  action = "USER_ROLE_ASSIGNMENT_CHANGED",
}) => {
  await writeAuditLog({
    companyId,
    actor: actingUser,
    action,
    entityType: "User",
    entityId: targetUser?._id,
    metadata: {
      userId: toId(targetUser?._id),
      roleTypeId: toId(next?.roleTypeId),
      roleId: toId(next?.roleId),
      previousValue: previous || null,
      newValue: next || null,
    },
    req,
  });
};

module.exports = {
  resolveRoleAssignment,
  assertReportingTargetInActorScope,
  assertNotSelfPromotion,
  recordAssignment,
  auditAssignmentChange,
};
