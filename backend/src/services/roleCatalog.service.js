const RoleType = require("../models/RoleType");
const Role = require("../models/Role");
const User = require("../models/User");
const UserRoleAssignment = require("../models/UserRoleAssignment");
const { USER_ROLES, ROLE_LABELS } = require("../constants/role.constants");
const {
  getDefaultPermissionsForRole,
  PERMISSIONS,
} = require("../constants/permission.constants");
const { toPagePermissions } = require("../constants/page.constants");
const {
  getDefaultPageAccessForRole,
  getDefaultDataScopeForRole,
} = require("../constants/rolePageAccess.constants");

// Provisioning and migration for one tenant's role catalogue.
//
// Everything here is idempotent and additive: it creates what is missing and
// backfills null references, and it never rewrites a Role Type or Role that
// already exists, never clears User.role / User.roleType, and never deletes
// anything. Running it twice is a no-op; running it on a tenant that has
// already customised its catalogue leaves those customisations alone.

// The three Role Types the system has always had, now as real records.
const SYSTEM_ROLE_TYPES = Object.freeze([
  {
    code: "COMMERCIAL",
    name: "Commercial",
    description: "Commercial property division — the default vertical for existing accounts.",
    legacyRoleType: "COMMERCIAL",
    division: "Commercial",
  },
  {
    code: "RESIDENTIAL",
    name: "Residential",
    description: "Residential property division.",
    legacyRoleType: "RESIDENTIAL",
    division: "Residential",
  },
  {
    code: "BOTH",
    name: "Both",
    description: "Works across the commercial and residential divisions.",
    legacyRoleType: "BOTH",
    division: "Commercial & Residential",
  },
]);

const SYSTEM_ROLE_TYPE_CODES = SYSTEM_ROLE_TYPES.map((roleType) => roleType.code);

// Base roles that get a seeded system Role record. ADMIN is deliberately absent:
// it bypasses permission checks entirely and is never an assignable role.
const SEEDED_BASE_ROLES = Object.values(USER_ROLES).filter(
  (role) => role !== USER_ROLES.ADMIN,
);

const buildSystemRolePermissions = (baseRole) => {
  const pages = getDefaultPageAccessForRole(baseRole);
  return [
    ...new Set([...getDefaultPermissionsForRole(baseRole), ...toPagePermissions(pages)]),
  ];
};

const ensureSystemRoleTypes = async ({ companyId, actingUserId = null }) => {
  const existing = await RoleType.find({ companyId, code: { $in: SYSTEM_ROLE_TYPE_CODES } })
    .select("_id code")
    .lean();
  const byCode = new Map(existing.map((row) => [row.code, row]));

  const created = [];

  for (const definition of SYSTEM_ROLE_TYPES) {
    if (byCode.has(definition.code)) continue;

    // A tenant may already have a *custom* type named "Commercial"; adopt it
    // rather than colliding with the unique index.
    // eslint-disable-next-line no-await-in-loop
    const sameName = await RoleType.findOne({
      companyId,
      normalizedName: definition.name.toLowerCase(),
    });

    if (sameName) {
      sameName.isSystem = true;
      sameName.status = "ACTIVE";
      // eslint-disable-next-line no-await-in-loop
      await sameName.save();
      byCode.set(definition.code, sameName);
      continue;
    }

    // eslint-disable-next-line no-await-in-loop
    const roleType = await RoleType.create({
      companyId,
      code: definition.code,
      name: definition.name,
      normalizedName: definition.name.toLowerCase(),
      description: definition.description,
      status: "ACTIVE",
      division: definition.division,
      legacyRoleType: definition.legacyRoleType,
      isSystem: true,
      createdBy: actingUserId,
      updatedBy: actingUserId,
    });

    byCode.set(definition.code, roleType);
    created.push(roleType.code);
  }

  return { roleTypesByCode: byCode, created };
};

const ensureSystemRoles = async ({ companyId, roleTypesByCode, actingUserId = null }) => {
  // Every seeded role is offered under all three legacy Role Types, because any
  // (role, roleType) pair was already reachable before this change.
  const allSystemRoleTypeIds = SYSTEM_ROLE_TYPE_CODES.map(
    (code) => roleTypesByCode.get(code)?._id,
  ).filter(Boolean);

  const existing = await Role.find({ companyId, baseRole: { $in: SEEDED_BASE_ROLES } })
    .select("_id code baseRole isSystem")
    .lean();
  const systemRoleByBaseRole = new Map(
    existing.filter((row) => row.isSystem).map((row) => [row.baseRole, row]),
  );

  const created = [];

  for (const baseRole of SEEDED_BASE_ROLES) {
    if (systemRoleByBaseRole.has(baseRole)) continue;

    const name = ROLE_LABELS[baseRole] || baseRole;

    // eslint-disable-next-line no-await-in-loop
    const sameName = await Role.findOne({
      companyId,
      normalizedName: name.toLowerCase(),
    });
    if (sameName) {
      systemRoleByBaseRole.set(baseRole, sameName);
      continue;
    }

    // eslint-disable-next-line no-await-in-loop
    const role = await Role.create({
      companyId,
      name,
      normalizedName: name.toLowerCase(),
      code: baseRole,
      description: `System role migrated from the built-in ${name} role.`,
      roleTypeIds: allSystemRoleTypeIds,
      baseRole,
      pages: getDefaultPageAccessForRole(baseRole),
      permissions: buildSystemRolePermissions(baseRole),
      dataScope: getDefaultDataScopeForRole(baseRole),
      status: "ACTIVE",
      isSystem: true,
      // Seeded roles describe the access these accounts already have. Leaving
      // the API page guard off for them means the migration cannot change what
      // any existing account can reach; an Admin editing the role's pages turns
      // it on (see role.service.updateRole).
      enforcePageAccess: false,
      createdBy: actingUserId,
      updatedBy: actingUserId,
    });

    systemRoleByBaseRole.set(baseRole, role);
    created.push(baseRole);
  }

  return { rolesByBaseRole: systemRoleByBaseRole, created };
};

/**
 * Points existing accounts at the seeded records. Only fills in nulls — a user
 * who already has roleTypeId / roleId is left untouched — and never modifies
 * User.role or User.roleType.
 */
const backfillUserAssignments = async ({
  companyId,
  roleTypesByCode,
  rolesByBaseRole,
  actingUserId = null,
}) => {
  // ADMIN never gets a Role record, so "roleId is null" would match every admin
  // on every run. Scope the roleId half of the check to the roles that do get
  // one, and this settles to matching nothing once the migration has run.
  const users = await User.find({
    companyId,
    $or: [
      { roleTypeId: null },
      { roleTypeId: { $exists: false } },
      { roleId: null, role: { $in: SEEDED_BASE_ROLES } },
      { roleId: { $exists: false }, role: { $in: SEEDED_BASE_ROLES } },
    ],
  })
    .select("_id role roleType roleTypeId roleId")
    .lean();

  let updatedCount = 0;
  const assignmentDocs = [];
  const operations = [];

  for (const user of users) {
    const legacyCode = ["COMMERCIAL", "RESIDENTIAL", "BOTH"].includes(
      String(user.roleType || "").toUpperCase(),
    )
      ? String(user.roleType).toUpperCase()
      : "COMMERCIAL";

    const roleType = roleTypesByCode.get(legacyCode);
    const role = rolesByBaseRole.get(user.role);

    const update = {};
    if (!user.roleTypeId && roleType) update.roleTypeId = roleType._id;
    // ADMIN has no assignable Role record by design.
    if (!user.roleId && role) update.roleId = role._id;

    if (!Object.keys(update).length) continue;

    operations.push({
      updateOne: { filter: { _id: user._id, companyId }, update: { $set: update } },
    });

    assignmentDocs.push({
      companyId,
      userId: user._id,
      roleId: update.roleId || user.roleId || null,
      roleTypeId: update.roleTypeId || user.roleTypeId || null,
      baseRole: user.role,
      isPrimary: true,
      assignedBy: actingUserId,
      source: "migration",
    });

    updatedCount += 1;
  }

  if (operations.length) {
    await User.bulkWrite(operations, { ordered: false });
  }
  if (assignmentDocs.length) {
    await UserRoleAssignment.insertMany(assignmentDocs, { ordered: false });
  }

  return { updatedCount };
};

/**
 * Idempotent entry point. Safe to call on every request that needs the
 * catalogue, and safe to run repeatedly from the migration script.
 */
const ensureTenantRoleCatalog = async ({ companyId, actingUserId = null }) => {
  const { roleTypesByCode, created: createdRoleTypes } = await ensureSystemRoleTypes({
    companyId,
    actingUserId,
  });

  const { rolesByBaseRole, created: createdRoles } = await ensureSystemRoles({
    companyId,
    roleTypesByCode,
    actingUserId,
  });

  const { updatedCount } = await backfillUserAssignments({
    companyId,
    roleTypesByCode,
    rolesByBaseRole,
    actingUserId,
  });

  return {
    createdRoleTypes,
    createdRoles,
    backfilledUsers: updatedCount,
  };
};

module.exports = {
  SYSTEM_ROLE_TYPES,
  SYSTEM_ROLE_TYPE_CODES,
  SEEDED_BASE_ROLES,
  ALL_PERMISSIONS: PERMISSIONS,
  buildSystemRolePermissions,
  ensureSystemRoleTypes,
  ensureSystemRoles,
  backfillUserAssignments,
  ensureTenantRoleCatalog,
};
