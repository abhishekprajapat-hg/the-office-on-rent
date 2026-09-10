const mongoose = require("mongoose");
const Role = require("../models/Role");
const RoleType = require("../models/RoleType");
const User = require("../models/User");
const { USER_ROLES, ROLE_LABELS } = require("../constants/role.constants");
const { CRM_PAGES, toPagePermissions } = require("../constants/page.constants");
const { PERMISSIONS, PERMISSION_GROUPS } = require("../constants/permission.constants");
const {
  getDefaultPageAccessForRole,
  getDefaultDataScopeForRole,
} = require("../constants/rolePageAccess.constants");
const { createHttpError } = require("../utils/httpError");
const { writeAuditLog } = require("./auditLog.service");
const {
  isAdminRole,
  normalizePageEntries,
  assertGrantablePermissions,
  assertGrantablePages,
  invalidateAccessCache,
} = require("./access.service");
const { toCode } = require("./roleType.service");

const isValidObjectId = (value) => mongoose.Types.ObjectId.isValid(value);
const DATA_SCOPES = new Set(["ALL", "BRANCH", "TEAM", "ASSIGNED", "SELF"]);
const MAX_CODE_ATTEMPTS = 50;

const trimmed = (value, maxLength) =>
  String(value === undefined || value === null ? "" : value)
    .trim()
    .slice(0, maxLength);

const escapeRegex = (value) => String(value || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const normalizeStatus = (value, fallback = "ACTIVE") => {
  const normalized = String(value || "").trim().toUpperCase();
  return ["ACTIVE", "INACTIVE"].includes(normalized) ? normalized : fallback;
};

const normalizeDataScope = (value, fallback = "ASSIGNED") => {
  const normalized = String(value || "").trim().toUpperCase();
  return DATA_SCOPES.has(normalized) ? normalized : fallback;
};

const assertNameAvailable = async ({ companyId, normalizedName, excludeId }) => {
  const filter = { companyId, normalizedName };
  if (excludeId) filter._id = { $ne: excludeId };

  const clash = await Role.findOne(filter).select("_id name").lean();
  if (clash) {
    throw createHttpError(409, `A role named "${clash.name}" already exists`);
  }
};

const resolveUniqueCode = async ({ companyId, desiredCode, excludeId }) => {
  const base = toCode(desiredCode) || "ROLE";

  for (let attempt = 0; attempt < MAX_CODE_ATTEMPTS; attempt += 1) {
    const candidate = attempt === 0 ? base : `${base}_${attempt + 1}`;
    const filter = { companyId, code: candidate };
    if (excludeId) filter._id = { $ne: excludeId };
    // eslint-disable-next-line no-await-in-loop
    const clash = await Role.findOne(filter).select("_id").lean();
    if (!clash) return candidate;
  }

  return `${base}_${Date.now()}`.slice(0, 60);
};

/**
 * Every role belongs to at least one Role Type, and those Role Types must live
 * in the acting user's own tenant. Resolving them here is also the tenant
 * boundary check: an id from another company simply will not be found.
 */
const resolveRoleTypeIds = async ({ companyId, roleTypeIds, requireActive = true }) => {
  const requested = (Array.isArray(roleTypeIds) ? roleTypeIds : [roleTypeIds])
    .map((value) => String(value || "").trim())
    .filter(Boolean);

  const uniqueRequested = [...new Set(requested)];
  if (!uniqueRequested.length) {
    throw createHttpError(400, "A role must belong to at least one role type");
  }
  if (uniqueRequested.some((value) => !isValidObjectId(value))) {
    throw createHttpError(400, "Invalid role type id");
  }

  const filter = { _id: { $in: uniqueRequested }, companyId };
  if (requireActive) filter.status = "ACTIVE";

  const found = await RoleType.find(filter).select("_id name status").lean();
  if (found.length !== uniqueRequested.length) {
    throw createHttpError(
      400,
      requireActive
        ? "One or more role types are unknown or inactive"
        : "One or more role types are unknown",
    );
  }

  return found.map((roleType) => roleType._id);
};

const assertValidBaseRole = (baseRole, actingUser) => {
  if (!Object.values(USER_ROLES).includes(baseRole)) {
    throw createHttpError(400, "Invalid base role");
  }
  if (baseRole === USER_ROLES.ADMIN) {
    throw createHttpError(403, "Roles cannot be built on the ADMIN base role");
  }
  if (!isAdminRole(actingUser?.role) && baseRole === USER_ROLES.MANAGER) {
    // A Manager creating another Manager-level role would be handing out its
    // own privileges wholesale; only an Admin may do that.
    throw createHttpError(403, "Only an Admin can create Manager-level roles");
  }
};

const resolveReportingRoleId = async ({ companyId, reportingRoleId, excludeId }) => {
  const candidate = String(reportingRoleId || "").trim();
  if (!candidate) return null;
  if (!isValidObjectId(candidate)) {
    throw createHttpError(400, "Invalid reporting role id");
  }
  if (excludeId && String(excludeId) === candidate) {
    throw createHttpError(400, "A role cannot report to itself");
  }

  const parent = await Role.findOne({ _id: candidate, companyId }).select("_id").lean();
  if (!parent) {
    throw createHttpError(400, "Reporting role not found");
  }
  return parent._id;
};

const toRoleView = (role, extras = {}) => ({
  _id: role._id,
  name: role.name,
  code: role.code,
  description: role.description || "",
  roleTypeIds: role.roleTypeIds || [],
  baseRole: role.baseRole,
  baseRoleLabel: ROLE_LABELS[role.baseRole] || role.baseRole,
  pages: role.pages || [],
  permissions: role.permissions || [],
  dataScope: role.dataScope,
  reportingRoleId: role.reportingRoleId || null,
  status: role.status,
  isSystem: Boolean(role.isSystem),
  enforcePageAccess: Boolean(role.enforcePageAccess),
  createdBy: role.createdBy || null,
  updatedBy: role.updatedBy || null,
  createdAt: role.createdAt,
  updatedAt: role.updatedAt,
  assignedUserCount: extras.assignedUserCount ?? 0,
});

const loadRole = async ({ companyId, roleId }) => {
  if (!isValidObjectId(roleId)) {
    throw createHttpError(400, "Invalid role id");
  }
  const role = await Role.findOne({ _id: roleId, companyId });
  if (!role) {
    throw createHttpError(404, "Role not found");
  }
  return role;
};

const listRoles = async ({ companyId, query = {} }) => {
  const filter = { companyId };

  const roleTypeId = String(query.roleTypeId || "").trim();
  if (roleTypeId) {
    if (!isValidObjectId(roleTypeId)) {
      throw createHttpError(400, "Invalid role type id");
    }
    filter.roleTypeIds = roleTypeId;
  }

  const status = String(query.status || "").trim().toUpperCase();
  if (["ACTIVE", "INACTIVE"].includes(status)) {
    filter.status = status;
  }

  const search = String(query.search || "").trim();
  if (search) {
    const pattern = new RegExp(escapeRegex(search), "i");
    filter.$or = [{ name: pattern }, { description: pattern }];
  }

  const roles = await Role.find(filter)
    .populate("createdBy", "name email")
    .populate("updatedBy", "name email")
    .populate("roleTypeIds", "name status")
    .populate("reportingRoleId", "name")
    .sort({ name: 1 })
    .lean();

  const userCounts = await User.aggregate([
    { $match: { companyId, roleId: { $in: roles.map((role) => role._id) } } },
    { $group: { _id: "$roleId", count: { $sum: 1 } } },
  ]);
  const userCountById = new Map(userCounts.map((row) => [String(row._id), row.count]));

  return roles.map((role) =>
    toRoleView(role, { assignedUserCount: userCountById.get(String(role._id)) || 0 }));
};

/**
 * Powers the Create User form's second dropdown: active roles belonging to one
 * active Role Type, and nothing else. Returning an empty array is a normal
 * outcome the UI renders as "No active roles are available for this Role Type."
 */
const listAssignableRoles = async ({ companyId, roleTypeId }) => {
  if (!isValidObjectId(roleTypeId)) {
    throw createHttpError(400, "Invalid role type id");
  }

  const roleType = await RoleType.findOne({ _id: roleTypeId, companyId })
    .select("_id status")
    .lean();
  if (!roleType) {
    throw createHttpError(404, "Role type not found");
  }
  if (roleType.status !== "ACTIVE") {
    return [];
  }

  const roles = await Role.find({
    companyId,
    roleTypeIds: roleType._id,
    status: "ACTIVE",
  })
    .select("_id name code baseRole description dataScope")
    .sort({ name: 1 })
    .lean();

  return roles.map((role) => ({
    _id: role._id,
    name: role.name,
    code: role.code,
    baseRole: role.baseRole,
    baseRoleLabel: ROLE_LABELS[role.baseRole] || role.baseRole,
    description: role.description || "",
    dataScope: role.dataScope,
  }));
};

const getRoleDetail = async ({ companyId, roleId }) => {
  const role = await loadRole({ companyId, roleId });

  const [assignedUsers, roleTypes, reportingRole] = await Promise.all([
    User.find({ companyId, roleId: role._id })
      .select("_id name email role isActive parentId")
      .populate("parentId", "name role")
      .sort({ name: 1 })
      .limit(200)
      .lean(),
    RoleType.find({ _id: { $in: role.roleTypeIds }, companyId })
      .select("_id name status")
      .lean(),
    role.reportingRoleId
      ? Role.findOne({ _id: role.reportingRoleId, companyId }).select("_id name").lean()
      : null,
  ]);

  return {
    role: toRoleView(role, { assignedUserCount: assignedUsers.length }),
    roleTypes,
    reportingRole,
    assignedUsers,
    availablePages: CRM_PAGES,
    availablePermissions: PERMISSIONS,
    permissionGroups: PERMISSION_GROUPS,
  };
};

const buildRolePayload = async ({ companyId, payload, existing, actingUser }) => {
  const name = trimmed(payload.name ?? existing?.name, 80);
  if (!name) {
    throw createHttpError(400, "Role name is required");
  }

  const baseRole = String(payload.baseRole ?? existing?.baseRole ?? "").trim().toUpperCase();
  assertValidBaseRole(baseRole, actingUser);

  if (existing?.isSystem && baseRole !== existing.baseRole) {
    throw createHttpError(403, "The base role of a system role cannot be changed");
  }

  const roleTypeIds = await resolveRoleTypeIds({
    companyId,
    roleTypeIds: payload.roleTypeIds ?? existing?.roleTypeIds,
    // An existing role keeps working if its type was later deactivated; only
    // new assignments have to point at an active Role Type.
    requireActive: !existing,
  });

  const pages = payload.pages
    ? normalizePageEntries(payload.pages)
    : normalizePageEntries(existing?.pages || getDefaultPageAccessForRole(baseRole));

  const explicitPermissions = Array.isArray(payload.permissions)
    ? payload.permissions.map((value) => String(value || "").trim()).filter(Boolean)
    : (existing?.permissions || []).filter((value) => !String(value).startsWith("page."));

  // Page grants are stored alongside the module permissions so a single
  // `permissions` array answers every access question at request time.
  const permissions = [...new Set([...explicitPermissions, ...toPagePermissions(pages)])];

  await assertGrantablePages({ actor: actingUser, pages });
  await assertGrantablePermissions({
    actor: actingUser,
    permissions: explicitPermissions,
  });

  return {
    name,
    normalizedName: name.toLowerCase(),
    description: trimmed(payload.description ?? existing?.description, 500),
    roleTypeIds,
    baseRole,
    pages,
    permissions,
    dataScope: normalizeDataScope(
      payload.dataScope ?? existing?.dataScope ?? getDefaultDataScopeForRole(baseRole),
    ),
    reportingRoleId: await resolveReportingRoleId({
      companyId,
      reportingRoleId:
        payload.reportingRoleId !== undefined
          ? payload.reportingRoleId
          : existing?.reportingRoleId,
      excludeId: existing?._id,
    }),
    status: normalizeStatus(payload.status ?? existing?.status),
  };
};

const createRole = async ({ companyId, payload, actingUser, req }) => {
  const values = await buildRolePayload({ companyId, payload, existing: null, actingUser });
  await assertNameAvailable({ companyId, normalizedName: values.normalizedName });

  const code = await resolveUniqueCode({
    companyId,
    desiredCode: payload.code || values.name,
  });

  const created = await Role.create({
    ...values,
    code,
    companyId,
    isSystem: false,
    // Roles authored through this API declare their page access explicitly, so
    // the API page guard applies to them from the start.
    enforcePageAccess: payload.enforcePageAccess === undefined
      ? true
      : Boolean(payload.enforcePageAccess),
    createdBy: actingUser._id,
    updatedBy: actingUser._id,
  });

  await writeAuditLog({
    companyId,
    actor: actingUser,
    action: "ROLE_CREATED",
    entityType: "Role",
    entityId: created._id,
    metadata: {
      roleId: String(created._id),
      roleTypeId: values.roleTypeIds.map((id) => String(id)),
      previousValue: null,
      newValue: toRoleView(created),
    },
    req,
  });

  return toRoleView(created);
};

const updateRole = async ({ companyId, roleId, payload, actingUser, req }) => {
  const role = await loadRole({ companyId, roleId });

  if (role.isSystem && !isAdminRole(actingUser?.role)) {
    throw createHttpError(403, "Only an Admin can edit a protected system role");
  }

  // Editing the role you hold yourself is the classic self-promotion path.
  if (
    !isAdminRole(actingUser?.role)
    && String(actingUser?.roleId || "") === String(role._id)
  ) {
    throw createHttpError(403, "You cannot edit the role assigned to your own account");
  }

  const previous = toRoleView(role);
  const values = await buildRolePayload({ companyId, payload, existing: role, actingUser });

  if (values.normalizedName !== role.normalizedName) {
    await assertNameAvailable({
      companyId,
      normalizedName: values.normalizedName,
      excludeId: role._id,
    });
  }

  const pagesChanged =
    JSON.stringify(previous.pages.map((entry) => [entry.pageKey, [...entry.actions].sort()]))
    !== JSON.stringify(values.pages.map((entry) => [entry.pageKey, [...entry.actions].sort()]));

  Object.assign(role, values);
  role.updatedBy = actingUser._id;

  if (payload.enforcePageAccess !== undefined) {
    role.enforcePageAccess = Boolean(payload.enforcePageAccess);
  } else if (pagesChanged) {
    // A migrated system role starts unenforced so nothing changes for existing
    // accounts; the moment somebody deliberately edits its page access, the
    // edit is meant to be honoured.
    role.enforcePageAccess = true;
  }

  await role.save();
  invalidateAccessCache();

  await writeAuditLog({
    companyId,
    actor: actingUser,
    action: "ROLE_PERMISSIONS_CHANGED",
    entityType: "Role",
    entityId: role._id,
    metadata: {
      roleId: String(role._id),
      roleTypeId: role.roleTypeIds.map((id) => String(id)),
      previousValue: previous,
      newValue: toRoleView(role),
    },
    req,
  });

  return toRoleView(role);
};

const setRoleStatus = async ({ companyId, roleId, status, actingUser, req }) => {
  const role = await loadRole({ companyId, roleId });

  if (role.isSystem && !isAdminRole(actingUser?.role)) {
    throw createHttpError(403, "Only an Admin can change a protected system role");
  }

  const nextStatus = normalizeStatus(status, null);
  if (!nextStatus) {
    throw createHttpError(400, "status must be ACTIVE or INACTIVE");
  }

  const previousStatus = role.status;
  role.status = nextStatus;
  role.updatedBy = actingUser._id;
  await role.save();
  invalidateAccessCache();

  await writeAuditLog({
    companyId,
    actor: actingUser,
    action: nextStatus === "ACTIVE" ? "ROLE_ACTIVATED" : "ROLE_DEACTIVATED",
    entityType: "Role",
    entityId: role._id,
    metadata: {
      roleId: String(role._id),
      roleTypeId: role.roleTypeIds.map((id) => String(id)),
      previousValue: { status: previousStatus },
      newValue: { status: nextStatus },
    },
    req,
  });

  return toRoleView(role);
};

const deleteRole = async ({ companyId, roleId, actingUser, req }) => {
  const role = await loadRole({ companyId, roleId });

  if (role.isSystem) {
    throw createHttpError(403, "Protected system roles cannot be deleted");
  }

  const assignedUserCount = await User.countDocuments({ companyId, roleId: role._id });
  if (assignedUserCount > 0) {
    const error = createHttpError(
      409,
      `This role is assigned to ${assignedUserCount} user${assignedUserCount === 1 ? "" : "s"}. Reassign them before deleting it.`,
    );
    error.details = { assignedUserCount };
    throw error;
  }

  const dependentRoleCount = await Role.countDocuments({
    companyId,
    reportingRoleId: role._id,
  });
  if (dependentRoleCount > 0) {
    const error = createHttpError(
      409,
      `${dependentRoleCount} role${dependentRoleCount === 1 ? "" : "s"} report to this role. Update their reporting role before deleting it.`,
    );
    error.details = { dependentRoleCount };
    throw error;
  }

  const snapshot = toRoleView(role);
  await Role.deleteOne({ _id: role._id, companyId });
  invalidateAccessCache();

  await writeAuditLog({
    companyId,
    actor: actingUser,
    action: "ROLE_DELETED",
    entityType: "Role",
    entityId: role._id,
    metadata: {
      roleId: String(role._id),
      roleTypeId: snapshot.roleTypeIds.map((id) => String(id)),
      previousValue: snapshot,
      newValue: null,
    },
    req,
  });

  return { _id: role._id, deleted: true };
};

module.exports = {
  toRoleView,
  loadRole,
  listRoles,
  listAssignableRoles,
  getRoleDetail,
  createRole,
  updateRole,
  setRoleStatus,
  deleteRole,
  resolveRoleTypeIds,
};
