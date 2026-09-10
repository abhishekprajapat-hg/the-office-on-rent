const mongoose = require("mongoose");
const RoleType = require("../models/RoleType");
const Role = require("../models/Role");
const User = require("../models/User");
const AuditLog = require("../models/AuditLog");
const { USER_ROLES, ROLE_LABELS } = require("../constants/role.constants");
const { CRM_PAGES } = require("../constants/page.constants");
const { createHttpError } = require("../utils/httpError");
const { writeAuditLog } = require("./auditLog.service");
const { isAdminRole, invalidateAccessCache } = require("./access.service");

const isValidObjectId = (value) => mongoose.Types.ObjectId.isValid(value);
const LEGACY_ROLE_TYPES = new Set(["COMMERCIAL", "RESIDENTIAL", "BOTH"]);
const MAX_DUPLICATE_ATTEMPTS = 50;

const trimmed = (value, maxLength) =>
  String(value === undefined || value === null ? "" : value)
    .trim()
    .slice(0, maxLength);

const toCode = (value) =>
  String(value || "")
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, "_")
    .replace(/_{2,}/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 60);

const normalizeStatus = (value, fallback = "ACTIVE") => {
  const normalized = String(value || "").trim().toUpperCase();
  return ["ACTIVE", "INACTIVE"].includes(normalized) ? normalized : fallback;
};

const normalizeLegacyRoleType = (value, fallback = "COMMERCIAL") => {
  const normalized = String(value || "").trim().toUpperCase();
  return LEGACY_ROLE_TYPES.has(normalized) ? normalized : fallback;
};

const escapeRegex = (value) => String(value || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/**
 * A tenant cannot hold two Role Types with the same name, case-insensitively.
 * The unique index on { companyId, normalizedName } is the real guarantee; this
 * pre-check exists to return a readable 409 instead of a driver error.
 */
const assertNameAvailable = async ({ companyId, normalizedName, excludeId }) => {
  const filter = { companyId, normalizedName };
  if (excludeId) filter._id = { $ne: excludeId };

  const clash = await RoleType.findOne(filter).select("_id name").lean();
  if (clash) {
    throw createHttpError(409, `A role type named "${clash.name}" already exists`);
  }
};

const assertCodeAvailable = async ({ companyId, code, excludeId }) => {
  const filter = { companyId, code };
  if (excludeId) filter._id = { $ne: excludeId };

  const clash = await RoleType.findOne(filter).select("_id").lean();
  return !clash;
};

const resolveUniqueCode = async ({ companyId, desiredCode, excludeId }) => {
  const base = toCode(desiredCode) || "ROLE_TYPE";

  for (let attempt = 0; attempt < MAX_DUPLICATE_ATTEMPTS; attempt += 1) {
    const candidate = attempt === 0 ? base : `${base}_${attempt + 1}`;
    // eslint-disable-next-line no-await-in-loop
    if (await assertCodeAvailable({ companyId, code: candidate, excludeId })) {
      return candidate;
    }
  }

  return `${base}_${Date.now()}`.slice(0, 60);
};

const loadRoleType = async ({ companyId, roleTypeId }) => {
  if (!isValidObjectId(roleTypeId)) {
    throw createHttpError(400, "Invalid role type id");
  }

  const roleType = await RoleType.findOne({ _id: roleTypeId, companyId });
  if (!roleType) {
    throw createHttpError(404, "Role type not found");
  }
  return roleType;
};

/**
 * Commercial / Residential / Both are seeded system records. Only an ADMIN may
 * change them; a Manager with role-type permissions can still create and manage
 * their own types.
 */
const assertCanMutateSystemRoleType = (roleType, actingUser) => {
  if (!roleType.isSystem) return;
  if (isAdminRole(actingUser?.role)) return;
  throw createHttpError(403, "Only an Admin can modify a protected system role type");
};

const countDependencies = async ({ companyId, roleTypeId }) => {
  const [roleCount, userCount] = await Promise.all([
    Role.countDocuments({ companyId, roleTypeIds: roleTypeId }),
    User.countDocuments({ companyId, roleTypeId }),
  ]);
  return { roleCount, userCount };
};

const toRoleTypeView = (roleType, counts = {}) => ({
  _id: roleType._id,
  name: roleType.name,
  code: roleType.code,
  description: roleType.description || "",
  status: roleType.status,
  branch: roleType.branch || "",
  department: roleType.department || "",
  division: roleType.division || "",
  legacyRoleType: roleType.legacyRoleType || "COMMERCIAL",
  isSystem: Boolean(roleType.isSystem),
  roleCount: counts.roleCount ?? 0,
  userCount: counts.userCount ?? 0,
  createdBy: roleType.createdBy || null,
  updatedBy: roleType.updatedBy || null,
  createdAt: roleType.createdAt,
  updatedAt: roleType.updatedAt,
});

const listRoleTypes = async ({ companyId, query = {} }) => {
  const filter = { companyId };

  const status = String(query.status || "").trim().toUpperCase();
  if (["ACTIVE", "INACTIVE"].includes(status)) {
    filter.status = status;
  }

  const search = String(query.search || "").trim();
  if (search) {
    const pattern = new RegExp(escapeRegex(search), "i");
    filter.$or = [
      { name: pattern },
      { description: pattern },
      { branch: pattern },
      { department: pattern },
      { division: pattern },
    ];
  }

  const roleTypes = await RoleType.find(filter)
    .populate("createdBy", "name email")
    .populate("updatedBy", "name email")
    .sort({ isSystem: -1, name: 1 })
    .lean();

  const roleTypeIds = roleTypes.map((roleType) => roleType._id);

  // Two grouped counts instead of 2N per-row queries.
  const [roleCounts, userCounts] = await Promise.all([
    Role.aggregate([
      { $match: { companyId, roleTypeIds: { $in: roleTypeIds } } },
      { $unwind: "$roleTypeIds" },
      { $match: { roleTypeIds: { $in: roleTypeIds } } },
      { $group: { _id: "$roleTypeIds", count: { $sum: 1 } } },
    ]),
    User.aggregate([
      { $match: { companyId, roleTypeId: { $in: roleTypeIds } } },
      { $group: { _id: "$roleTypeId", count: { $sum: 1 } } },
    ]),
  ]);

  const roleCountById = new Map(roleCounts.map((row) => [String(row._id), row.count]));
  const userCountById = new Map(userCounts.map((row) => [String(row._id), row.count]));

  return roleTypes.map((roleType) =>
    toRoleTypeView(roleType, {
      roleCount: roleCountById.get(String(roleType._id)) || 0,
      userCount: userCountById.get(String(roleType._id)) || 0,
    }));
};

/** Active Role Types only — what the Create User form's first dropdown loads. */
const listAssignableRoleTypes = async ({ companyId }) => {
  const roleTypes = await RoleType.find({ companyId, status: "ACTIVE" })
    .select("_id name code description branch department division legacyRoleType")
    .sort({ isSystem: -1, name: 1 })
    .lean();

  return roleTypes.map((roleType) => ({
    _id: roleType._id,
    name: roleType.name,
    code: roleType.code,
    description: roleType.description || "",
    branch: roleType.branch || "",
    department: roleType.department || "",
    division: roleType.division || "",
    legacyRoleType: roleType.legacyRoleType || "COMMERCIAL",
  }));
};

const getRoleTypeDetail = async ({ companyId, roleTypeId }) => {
  const roleType = await loadRoleType({ companyId, roleTypeId });

  const [roles, assignedUsers, counts, auditHistory] = await Promise.all([
    Role.find({ companyId, roleTypeIds: roleType._id })
      .select("_id name code baseRole description status dataScope pages reportingRoleId isSystem updatedAt")
      .populate("reportingRoleId", "name")
      .sort({ name: 1 })
      .lean(),
    User.find({ companyId, roleTypeId: roleType._id })
      .select("_id name email role roleId isActive parentId createdAt")
      .populate("parentId", "name role")
      .populate("roleId", "name")
      .sort({ name: 1 })
      .limit(200)
      .lean(),
    countDependencies({ companyId, roleTypeId: roleType._id }),
    AuditLog.find({
      companyId,
      entityType: { $in: ["RoleType", "Role"] },
      $or: [
        { entityId: String(roleType._id) },
        { "metadata.roleTypeId": String(roleType._id) },
      ],
    })
      .populate("actorId", "name email role")
      .sort({ createdAt: -1 })
      .limit(50)
      .lean(),
  ]);

  const userCountByRoleId = new Map();
  assignedUsers.forEach((user) => {
    const roleId = String(user.roleId?._id || user.roleId || "");
    if (!roleId) return;
    userCountByRoleId.set(roleId, (userCountByRoleId.get(roleId) || 0) + 1);
  });

  return {
    roleType: toRoleTypeView(roleType, counts),
    roles: roles.map((role) => ({
      ...role,
      baseRoleLabel: ROLE_LABELS[role.baseRole] || role.baseRole,
      assignedUserCount: userCountByRoleId.get(String(role._id)) || 0,
    })),
    assignedUsers,
    availablePages: CRM_PAGES,
    reportingHierarchy: roles.map((role) => ({
      roleId: role._id,
      roleName: role.name,
      reportsTo: role.reportingRoleId?.name || ROLE_LABELS[role.baseRole] || "",
    })),
    auditHistory,
  };
};

const buildRoleTypePayload = (payload = {}, existing = null) => {
  const name = trimmed(payload.name ?? existing?.name, 80);
  if (!name) {
    throw createHttpError(400, "Role type name is required");
  }

  return {
    name,
    normalizedName: name.toLowerCase(),
    description: trimmed(payload.description ?? existing?.description, 500),
    status: normalizeStatus(payload.status ?? existing?.status),
    branch: trimmed(payload.branch ?? existing?.branch, 80),
    department: trimmed(payload.department ?? existing?.department, 80),
    division: trimmed(payload.division ?? existing?.division, 80),
    legacyRoleType: normalizeLegacyRoleType(
      payload.legacyRoleType ?? existing?.legacyRoleType,
    ),
  };
};

const createRoleType = async ({ companyId, payload, actingUser, req }) => {
  const values = buildRoleTypePayload(payload);
  await assertNameAvailable({ companyId, normalizedName: values.normalizedName });

  const code = await resolveUniqueCode({
    companyId,
    desiredCode: payload.code || values.name,
  });

  const created = await RoleType.create({
    ...values,
    code,
    // companyId always comes from the authenticated actor: a Manager cannot
    // create a Role Type in another tenant by putting a companyId in the body.
    companyId,
    isSystem: false,
    createdBy: actingUser._id,
    updatedBy: actingUser._id,
  });

  await writeAuditLog({
    companyId,
    actor: actingUser,
    action: "ROLE_TYPE_CREATED",
    entityType: "RoleType",
    entityId: created._id,
    metadata: {
      roleTypeId: String(created._id),
      previousValue: null,
      newValue: toRoleTypeView(created),
    },
    req,
  });

  return toRoleTypeView(created, { roleCount: 0, userCount: 0 });
};

const updateRoleType = async ({ companyId, roleTypeId, payload, actingUser, req }) => {
  const roleType = await loadRoleType({ companyId, roleTypeId });
  assertCanMutateSystemRoleType(roleType, actingUser);

  const previous = toRoleTypeView(roleType);
  const values = buildRoleTypePayload(payload, roleType);

  if (values.normalizedName !== roleType.normalizedName) {
    await assertNameAvailable({
      companyId,
      normalizedName: values.normalizedName,
      excludeId: roleType._id,
    });
  }

  Object.assign(roleType, values);
  roleType.updatedBy = actingUser._id;
  await roleType.save();
  invalidateAccessCache();

  // Renaming touches this document only. Roles and users reference the _id, so
  // nothing downstream needs rewriting and nothing can be orphaned.
  await writeAuditLog({
    companyId,
    actor: actingUser,
    action: "ROLE_TYPE_UPDATED",
    entityType: "RoleType",
    entityId: roleType._id,
    metadata: {
      roleTypeId: String(roleType._id),
      previousValue: previous,
      newValue: toRoleTypeView(roleType),
    },
    req,
  });

  const counts = await countDependencies({ companyId, roleTypeId: roleType._id });
  return toRoleTypeView(roleType, counts);
};

const setRoleTypeStatus = async ({ companyId, roleTypeId, status, actingUser, req }) => {
  const roleType = await loadRoleType({ companyId, roleTypeId });
  assertCanMutateSystemRoleType(roleType, actingUser);

  const nextStatus = normalizeStatus(status, null);
  if (!nextStatus) {
    throw createHttpError(400, "status must be ACTIVE or INACTIVE");
  }

  const previousStatus = roleType.status;
  roleType.status = nextStatus;
  roleType.updatedBy = actingUser._id;
  await roleType.save();
  invalidateAccessCache();

  await writeAuditLog({
    companyId,
    actor: actingUser,
    action: nextStatus === "ACTIVE" ? "ROLE_TYPE_ACTIVATED" : "ROLE_TYPE_DEACTIVATED",
    entityType: "RoleType",
    entityId: roleType._id,
    metadata: {
      roleTypeId: String(roleType._id),
      previousValue: { status: previousStatus },
      newValue: { status: nextStatus },
    },
    req,
  });

  const counts = await countDependencies({ companyId, roleTypeId: roleType._id });
  return toRoleTypeView(roleType, counts);
};

const duplicateRoleType = async ({ companyId, roleTypeId, payload = {}, actingUser, req }) => {
  const source = await loadRoleType({ companyId, roleTypeId });

  let name = trimmed(payload.name, 80);
  if (!name) {
    for (let attempt = 1; attempt <= MAX_DUPLICATE_ATTEMPTS; attempt += 1) {
      const candidate = attempt === 1
        ? `${source.name} copy`
        : `${source.name} copy ${attempt}`;
      // eslint-disable-next-line no-await-in-loop
      const clash = await RoleType.findOne({
        companyId,
        normalizedName: candidate.toLowerCase(),
      })
        .select("_id")
        .lean();
      if (!clash) {
        name = candidate.slice(0, 80);
        break;
      }
    }
  }

  if (!name) {
    throw createHttpError(409, "Could not derive an unused name for the duplicate");
  }

  const created = await createRoleType({
    companyId,
    payload: {
      name,
      description: payload.description ?? source.description,
      status: payload.status ?? source.status,
      branch: payload.branch ?? source.branch,
      department: payload.department ?? source.department,
      division: payload.division ?? source.division,
      legacyRoleType: payload.legacyRoleType ?? source.legacyRoleType,
    },
    actingUser,
    req,
  });

  await writeAuditLog({
    companyId,
    actor: actingUser,
    action: "ROLE_TYPE_DUPLICATED",
    entityType: "RoleType",
    entityId: created._id,
    metadata: {
      roleTypeId: String(created._id),
      previousValue: { sourceRoleTypeId: String(source._id), sourceName: source.name },
      newValue: { name: created.name },
    },
    req,
  });

  return created;
};

/**
 * Deletion is refused while anything still points at the Role Type. The caller
 * has to reassign or remove those roles and users first — the counts come back
 * in the error payload so the UI can say exactly what is blocking.
 */
const deleteRoleType = async ({ companyId, roleTypeId, actingUser, req }) => {
  const roleType = await loadRoleType({ companyId, roleTypeId });

  if (roleType.isSystem) {
    throw createHttpError(403, "Protected system role types cannot be deleted");
  }

  const { roleCount, userCount } = await countDependencies({
    companyId,
    roleTypeId: roleType._id,
  });

  if (roleCount > 0 || userCount > 0) {
    const blockers = [
      roleCount > 0 ? `${roleCount} role${roleCount === 1 ? "" : "s"}` : "",
      userCount > 0 ? `${userCount} user${userCount === 1 ? "" : "s"}` : "",
    ]
      .filter(Boolean)
      .join(" and ");

    const error = createHttpError(
      409,
      `This role type still has ${blockers}. Reassign or remove them before deleting it.`,
    );
    error.details = { roleCount, userCount };
    throw error;
  }

  const snapshot = toRoleTypeView(roleType);
  await RoleType.deleteOne({ _id: roleType._id, companyId });
  invalidateAccessCache();

  await writeAuditLog({
    companyId,
    actor: actingUser,
    action: "ROLE_TYPE_DELETED",
    entityType: "RoleType",
    entityId: roleType._id,
    metadata: {
      roleTypeId: String(roleType._id),
      previousValue: snapshot,
      newValue: null,
    },
    req,
  });

  return { _id: roleType._id, deleted: true };
};

module.exports = {
  USER_ROLES,
  toCode,
  toRoleTypeView,
  loadRoleType,
  countDependencies,
  listRoleTypes,
  listAssignableRoleTypes,
  getRoleTypeDetail,
  createRoleType,
  updateRoleType,
  setRoleTypeStatus,
  duplicateRoleType,
  deleteRoleType,
};
