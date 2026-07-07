const express = require("express");

const saasController = require("../controllers/saas.controller");
const authMiddleware = require("../middleware/auth.middleware");
const { USER_ROLES } = require("../constants/role.constants");
const { writeLimiter } = require("../middleware/rateLimit.middleware");

const router = express.Router();
const TENANT_ADMIN_ROLES = [USER_ROLES.ADMIN, USER_ROLES.MANAGER];

router.use(authMiddleware.protect);

// Single-client admin self-service settings.
router.get(
  "/tenant/settings",
  authMiddleware.checkRole(TENANT_ADMIN_ROLES),
  saasController.getMyTenantSettings,
);
router.patch(
  "/tenant/settings",
  writeLimiter,
  authMiddleware.checkRole(TENANT_ADMIN_ROLES),
  saasController.updateMyTenantSettings,
);
router.get(
  "/tenant/meta",
  authMiddleware.checkRole(TENANT_ADMIN_ROLES),
  saasController.getMyTenantMetaIntegration,
);
router.patch(
  "/tenant/meta",
  writeLimiter,
  authMiddleware.checkRole(TENANT_ADMIN_ROLES),
  saasController.updateMyTenantMetaIntegration,
);

module.exports = router;
