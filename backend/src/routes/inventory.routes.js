const express = require("express");
const router = express.Router();

const inventoryController = require("../controllers/inventory.controller");
const authMiddleware = require("../middleware/auth.middleware");
const companyMiddleware = require("../middleware/company.middleware");
const { writeLimiter } = require("../middleware/rateLimit.middleware");
const {
  requirePageAccess,
  checkRoleOrPageAccess,
} = require("../middleware/pageAccess.middleware");

router.use(authMiddleware.protect);
router.use(
  checkRoleOrPageAccess(
    ["ADMIN", "MANAGER", "EXECUTIVE", "FIELD_EXECUTIVE", "CHANNEL_PARTNER"],
    "inventory",
  ),
);
router.use(companyMiddleware.requireCompanyContext);
router.use(requirePageAccess("inventory"));

router.get("/", inventoryController.getInventory);
router.get(
  "/:id/activity",
  authMiddleware.checkRole(["ADMIN", "MANAGER"]),
  inventoryController.getInventoryActivity,
);
router.get("/:id", inventoryController.getInventoryById);

router.post(
  "/:id/share",
  writeLimiter,
  inventoryController.createShareLink,
);

router.post(
  "/",
  writeLimiter,
  authMiddleware.checkRole([
    "ADMIN",
    "MANAGER",
    "EXECUTIVE",
    "FIELD_EXECUTIVE",
    "CHANNEL_PARTNER",
  ]),
  inventoryController.createInventory,
);

router.post(
  "/bulk",
  writeLimiter,
  authMiddleware.checkRole(["ADMIN", "MANAGER"]),
  inventoryController.bulkUploadInventory,
);

router.patch(
  "/:id",
  writeLimiter,
  authMiddleware.checkRole(["ADMIN", "MANAGER"]),
  inventoryController.updateInventory,
);

router.delete(
  "/:id",
  writeLimiter,
  authMiddleware.checkRole(["ADMIN"]),
  inventoryController.deleteInventory,
);

module.exports = router;
