const logger = require("../config/logger");
const { handleControllerError: handleError } = require("../utils/httpError");
const { CRM_PAGES } = require("../constants/page.constants");
const { USER_ROLES, ROLE_LABELS } = require("../constants/role.constants");
const {
  PERMISSIONS,
  PERMISSION_GROUPS,
  ADMIN_PROTECTED_PERMISSIONS,
} = require("../constants/permission.constants");
const RoleModel = require("../models/Role");
const roleTypeService = require("../services/roleType.service");
const roleService = require("../services/role.service");
const { ensureTenantRoleCatalog } = require("../services/roleCatalog.service");
const { resolveAccessProfile } = require("../services/access.service");
const { listAuditLogs } = require("../services/auditLog.service");

const handleControllerError = (res, error, message) => {
  if (error?.details) {
    logger?.error({ error: error.message, message });
    return res.status(error.statusCode || 409).json({
      message: error.message,
      details: error.details,
    });
  }
  return handleError(res, error, logger, message);
};

const companyOf = (req) => req.user.companyId;

/* -------------------------------------------------------------- *
 * Access profile — what the signed-in account may see and do.
 * Available to every authenticated user, unlike the coworking-only
 * /api/coworking/permissions/me it complements.
 * -------------------------------------------------------------- */
exports.getMyAccessProfile = async (req, res) => {
  try {
    const profile = await resolveAccessProfile(req.user);
    return res.json({ access: profile });
  } catch (error) {
    return handleControllerError(res, error, "getMyAccessProfile failed");
  }
};

/* ----------------------------- Role Types ----------------------------- */

exports.listRoleTypes = async (req, res) => {
  try {
    const companyId = companyOf(req);
    // Idempotent: seeds Commercial / Residential / Both and the system roles
    // for a tenant that has not run the migration script yet.
    await ensureTenantRoleCatalog({ companyId, actingUserId: req.user._id });

    const roleTypes = await roleTypeService.listRoleTypes({ companyId, query: req.query });
    return res.json({ roleTypes });
  } catch (error) {
    return handleControllerError(res, error, "listRoleTypes failed");
  }
};

exports.getRoleTypeDetail = async (req, res) => {
  try {
    const detail = await roleTypeService.getRoleTypeDetail({
      companyId: companyOf(req),
      roleTypeId: req.params.roleTypeId,
    });
    return res.json(detail);
  } catch (error) {
    return handleControllerError(res, error, "getRoleTypeDetail failed");
  }
};

exports.createRoleType = async (req, res) => {
  try {
    const roleType = await roleTypeService.createRoleType({
      companyId: companyOf(req),
      payload: req.body || {},
      actingUser: req.user,
      req,
    });
    return res.status(201).json({ roleType });
  } catch (error) {
    return handleControllerError(res, error, "createRoleType failed");
  }
};

exports.updateRoleType = async (req, res) => {
  try {
    const roleType = await roleTypeService.updateRoleType({
      companyId: companyOf(req),
      roleTypeId: req.params.roleTypeId,
      payload: req.body || {},
      actingUser: req.user,
      req,
    });
    return res.json({ roleType });
  } catch (error) {
    return handleControllerError(res, error, "updateRoleType failed");
  }
};

exports.setRoleTypeStatus = async (req, res) => {
  try {
    const roleType = await roleTypeService.setRoleTypeStatus({
      companyId: companyOf(req),
      roleTypeId: req.params.roleTypeId,
      status: req.body?.status,
      actingUser: req.user,
      req,
    });
    return res.json({ roleType });
  } catch (error) {
    return handleControllerError(res, error, "setRoleTypeStatus failed");
  }
};

exports.duplicateRoleType = async (req, res) => {
  try {
    const roleType = await roleTypeService.duplicateRoleType({
      companyId: companyOf(req),
      roleTypeId: req.params.roleTypeId,
      payload: req.body || {},
      actingUser: req.user,
      req,
    });
    return res.status(201).json({ roleType });
  } catch (error) {
    return handleControllerError(res, error, "duplicateRoleType failed");
  }
};

exports.deleteRoleType = async (req, res) => {
  try {
    const result = await roleTypeService.deleteRoleType({
      companyId: companyOf(req),
      roleTypeId: req.params.roleTypeId,
      actingUser: req.user,
      req,
    });
    return res.json(result);
  } catch (error) {
    return handleControllerError(res, error, "deleteRoleType failed");
  }
};

/* -------------------------------- Roles -------------------------------- */

exports.listRoles = async (req, res) => {
  try {
    const roles = await roleService.listRoles({
      companyId: companyOf(req),
      query: req.query,
    });
    return res.json({ roles });
  } catch (error) {
    return handleControllerError(res, error, "listRoles failed");
  }
};

exports.getRoleDetail = async (req, res) => {
  try {
    const detail = await roleService.getRoleDetail({
      companyId: companyOf(req),
      roleId: req.params.roleId,
    });
    return res.json(detail);
  } catch (error) {
    return handleControllerError(res, error, "getRoleDetail failed");
  }
};

exports.createRole = async (req, res) => {
  try {
    const role = await roleService.createRole({
      companyId: companyOf(req),
      payload: req.body || {},
      actingUser: req.user,
      req,
    });
    return res.status(201).json({ role });
  } catch (error) {
    return handleControllerError(res, error, "createRole failed");
  }
};

exports.updateRole = async (req, res) => {
  try {
    const role = await roleService.updateRole({
      companyId: companyOf(req),
      roleId: req.params.roleId,
      payload: req.body || {},
      actingUser: req.user,
      req,
    });
    return res.json({ role });
  } catch (error) {
    return handleControllerError(res, error, "updateRole failed");
  }
};

exports.setRoleStatus = async (req, res) => {
  try {
    const role = await roleService.setRoleStatus({
      companyId: companyOf(req),
      roleId: req.params.roleId,
      status: req.body?.status,
      actingUser: req.user,
      req,
    });
    return res.json({ role });
  } catch (error) {
    return handleControllerError(res, error, "setRoleStatus failed");
  }
};

exports.deleteRole = async (req, res) => {
  try {
    const result = await roleService.deleteRole({
      companyId: companyOf(req),
      roleId: req.params.roleId,
      actingUser: req.user,
      req,
    });
    return res.json(result);
  } catch (error) {
    return handleControllerError(res, error, "deleteRole failed");
  }
};

/* ------------------- Create User form support endpoints ------------------- */

// Active role types only. Every authenticated user who may create users can
// call this; it exposes names, not permissions.
exports.listAssignableRoleTypes = async (req, res) => {
  try {
    const companyId = companyOf(req);
    await ensureTenantRoleCatalog({ companyId, actingUserId: req.user._id });

    const roleTypes = await roleTypeService.listAssignableRoleTypes({ companyId });
    return res.json({ roleTypes });
  } catch (error) {
    return handleControllerError(res, error, "listAssignableRoleTypes failed");
  }
};

exports.listAssignableRoles = async (req, res) => {
  try {
    const roles = await roleService.listAssignableRoles({
      companyId: companyOf(req),
      roleTypeId: req.params.roleTypeId,
    });
    return res.json({ roles });
  } catch (error) {
    return handleControllerError(res, error, "listAssignableRoles failed");
  }
};

/* ----------------------------- Reference data ----------------------------- */

exports.getAccessCatalog = async (req, res) => {
  try {
    const baseRoles = Object.values(USER_ROLES)
      .filter((role) => role !== USER_ROLES.ADMIN)
      .map((role) => ({ value: role, label: ROLE_LABELS[role] || role }));

    return res.json({
      pages: CRM_PAGES,
      permissions: PERMISSIONS,
      permissionGroups: PERMISSION_GROUPS,
      protectedPermissions: ADMIN_PROTECTED_PERMISSIONS,
      baseRoles,
      dataScopes: RoleModel.DATA_SCOPES,
    });
  } catch (error) {
    return handleControllerError(res, error, "getAccessCatalog failed");
  }
};

exports.listRoleAuditLogs = async (req, res) => {
  try {
    const { logs, pagination } = await listAuditLogs({
      companyId: companyOf(req),
      query: {
        ...req.query,
        entityType: req.query.entityType || undefined,
      },
    });
    return res.json({ logs, pagination });
  } catch (error) {
    return handleControllerError(res, error, "listRoleAuditLogs failed");
  }
};
