const express = require("express");
const router = express.Router();

const assetController = require("../controllers/coworkingAsset.controller");
const { requirePermission } = require("../middleware/permission.middleware");
const { writeLimiter } = require("../middleware/rateLimit.middleware");

router.get("/", requirePermission("assets.view"), assetController.listAssets);
router.post("/", writeLimiter, requirePermission("assets.create"), assetController.createAsset);
router.patch("/:assetId", writeLimiter, requirePermission("assets.update"), assetController.updateAsset);
router.post("/:assetId/maintenance", writeLimiter, requirePermission("assets.update"), assetController.markMaintenance);
router.post("/:assetId/active", writeLimiter, requirePermission("assets.update"), assetController.markActive);
router.post("/:assetId/retire", writeLimiter, requirePermission("assets.retire"), assetController.retireAsset);
router.post("/:assetId/lost", writeLimiter, requirePermission("assets.retire"), assetController.markLost);
router.delete("/:assetId", writeLimiter, requirePermission("assets.delete"), assetController.deleteAsset);

module.exports = router;
