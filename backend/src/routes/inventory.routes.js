const express = require("express");
const router = express.Router();

const inventoryController = require("../controllers/inventory.controller");
const authMiddleware = require("../middleware/auth.middleware");
const companyMiddleware = require("../middleware/company.middleware");
const { writeLimiter } = require("../middleware/rateLimit.middleware");
const {
  requirePageAccess,
  requirePageActionForMethod,
  checkRoleOrPageAccess,
  checkRoleOrPageAction,
} = require("../middleware/pageAccess.middleware");
const Inventory = require("../models/Inventory");
const { requireAdminApprovalForDelete } = require("../services/deleteApproval.service");
const { requirePartnerInventoryAccess } = require("../middleware/partnerInventoryAccess.middleware");

router.use(authMiddleware.protect);
router.use(requirePartnerInventoryAccess);
router.use(
  checkRoleOrPageAccess(
    ["ADMIN", "MANAGER", "EXECUTIVE", "FIELD_EXECUTIVE", "CHANNEL_PARTNER"],
    "inventory",
  ),
);
router.use(companyMiddleware.requireCompanyContext);
router.use(requirePageAccess("inventory"));
router.use(requirePageActionForMethod("inventory"));

router.get("/", inventoryController.getInventory);
router.get(
  "/:id/activity",
  checkRoleOrPageAction(["ADMIN", "MANAGER"], "view", "inventory"),
  inventoryController.getInventoryActivity,
);
router.get("/:id", inventoryController.getInventoryById);

/*
 * Sources, owner link and "confirmed today" (requirements 16 Oct 2026, 6.3,
 * 7.1, 17.2). Internal relationships, so never a Channel Partner.
 */
const sourceController = require("../controllers/inventorySource.controller");
const SALES_SOURCE_ROLES = ["ADMIN", "MANAGER", "EXECUTIVE", "INSIDE_EXECUTIVE", "FIELD_EXECUTIVE"];
const noPartner = (req, res, next) => (req.user.role === "CHANNEL_PARTNER"
  ? res.status(403).json({ message: "Internal relationships only" }) : next());
router.post("/:id/sources", writeLimiter, noPartner, checkRoleOrPageAction(SALES_SOURCE_ROLES, "view", "inventory"), sourceController.addSourceLink);
router.patch("/:id/sources/:linkId", writeLimiter, noPartner, checkRoleOrPageAction(SALES_SOURCE_ROLES, "view", "inventory"), sourceController.updateSourceLink);
router.delete("/:id/sources/:linkId", writeLimiter, noPartner, checkRoleOrPageAction(["ADMIN", "MANAGER"], "edit", "inventory"), sourceController.removeSourceLink);
router.post("/:id/confirm", writeLimiter, noPartner, checkRoleOrPageAction(SALES_SOURCE_ROLES, "view", "inventory"), sourceController.confirmInventory);
router.put("/:id/owner", writeLimiter, noPartner, checkRoleOrPageAction(["ADMIN", "MANAGER"], "edit", "inventory"), sourceController.setOwner);

router.post(
  "/:id/share",
  writeLimiter,
  inventoryController.createShareLink,
);

router.post(
  "/",
  writeLimiter,
  checkRoleOrPageAction([
    "ADMIN",
    "MANAGER",
    "EXECUTIVE",
    "FIELD_EXECUTIVE",
    "CHANNEL_PARTNER",
  ], "create", "inventory"),
  inventoryController.createInventory,
);

router.post(
  "/bulk",
  writeLimiter,
  checkRoleOrPageAction(["ADMIN", "MANAGER"], "create", "inventory"),
  inventoryController.bulkUploadInventory,
);

router.patch(
  "/:id",
  writeLimiter,
  checkRoleOrPageAction(["ADMIN", "MANAGER"], "edit", "inventory"),
  inventoryController.updateInventory,
);

/*
 * Managers normally ask through POST /inventory-request/delete/:id. A Manager
 * whose page access explicitly grants inventory delete can reach this route
 * too, and then it becomes a request an Admin approves, never a direct delete.
 */
router.delete(
  "/:id",
  writeLimiter,
  checkRoleOrPageAction(["ADMIN"], "delete", "inventory"),
  requireAdminApprovalForDelete("inventory", {
    label: "Inventory unit",
    pageKey: "inventory",
    idParam: "id",
    handler: inventoryController.deleteInventory,
    describe: async ({ id, companyId }) => {
      const unit = await Inventory.findOne({ _id: id, companyId })
        .select("projectName towerName unitNumber")
        .lean();
      if (!unit) return null;
      return [unit.projectName, unit.towerName, unit.unitNumber].filter(Boolean).join(" / ");
    },
  }),
  inventoryController.deleteInventory,
);

module.exports = router;
