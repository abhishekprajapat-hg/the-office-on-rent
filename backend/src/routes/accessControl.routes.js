const express = require("express");

const router = express.Router();

const controller = require("../controllers/accessControl.controller");
const authMiddleware = require("../middleware/auth.middleware");
const companyMiddleware = require("../middleware/company.middleware");
const { requirePermission } = require("../middleware/permission.middleware");
const { writeLimiter } = require("../middleware/rateLimit.middleware");

// Role Type and Role administration.
//
// Every mutating route is permission-gated on the backend, not merely hidden in
// the UI, and the role_types.* family is excluded from the Manager default
// grant — a Manager reaches these routes only once an Admin has assigned the
// specific permission (see permission.constants.js).

router.use(authMiddleware.protect);
router.use(companyMiddleware.requireCompanyContext);
router.use(companyMiddleware.enforceBodyCompanyMatch());

// The signed-in account's own effective access. No permission required: it
// describes the caller and nothing else.
router.get("/me", controller.getMyAccessProfile);

router.get("/catalog", requirePermission("role_types.view"), controller.getAccessCatalog);

/* --------------------------- Create User support --------------------------- */
// Dependent dropdowns. Gated on users.create so the form can populate without
// handing out Role Type administration.
router.get(
  "/assignable/role-types",
  requirePermission("users.create"),
  controller.listAssignableRoleTypes,
);

router.get(
  "/assignable/role-types/:roleTypeId/roles",
  requirePermission("users.create"),
  controller.listAssignableRoles,
);

/* -------------------------------- Role Types -------------------------------- */

router.get("/role-types", requirePermission("role_types.view"), controller.listRoleTypes);

router.get(
  "/role-types/:roleTypeId",
  requirePermission("role_types.view"),
  controller.getRoleTypeDetail,
);

router.post(
  "/role-types",
  writeLimiter,
  requirePermission("role_types.create"),
  controller.createRoleType,
);

router.patch(
  "/role-types/:roleTypeId",
  writeLimiter,
  requirePermission("role_types.update"),
  controller.updateRoleType,
);

router.patch(
  "/role-types/:roleTypeId/status",
  writeLimiter,
  requirePermission("role_types.status"),
  controller.setRoleTypeStatus,
);

router.post(
  "/role-types/:roleTypeId/duplicate",
  writeLimiter,
  requirePermission("role_types.create"),
  controller.duplicateRoleType,
);

router.delete(
  "/role-types/:roleTypeId",
  writeLimiter,
  requirePermission("role_types.delete"),
  controller.deleteRoleType,
);

/* ---------------------------------- Roles ---------------------------------- */

router.get("/roles", requirePermission("role_types.view"), controller.listRoles);

router.get(
  "/roles/:roleId",
  requirePermission("role_types.view"),
  controller.getRoleDetail,
);

router.post(
  "/roles",
  writeLimiter,
  requirePermission("role_types.manage_roles"),
  controller.createRole,
);

router.patch(
  "/roles/:roleId",
  writeLimiter,
  requirePermission("role_types.manage_roles"),
  controller.updateRole,
);

router.patch(
  "/roles/:roleId/status",
  writeLimiter,
  requirePermission("role_types.manage_roles"),
  controller.setRoleStatus,
);

router.delete(
  "/roles/:roleId",
  writeLimiter,
  requirePermission("role_types.manage_roles"),
  controller.deleteRole,
);

/* -------------------------------- Audit trail -------------------------------- */

router.get(
  "/audit-logs",
  requirePermission("audit_logs.view"),
  controller.listRoleAuditLogs,
);

module.exports = router;
