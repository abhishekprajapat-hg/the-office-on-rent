const express = require("express");
const router = express.Router();

const settingController = require("../controllers/coworkingSetting.controller");
const { requirePermission } = require("../middleware/permission.middleware");
const { writeLimiter } = require("../middleware/rateLimit.middleware");

router.get("/", requirePermission("settings.view"), settingController.getSettings);
router.patch("/", writeLimiter, requirePermission("settings.update"), settingController.updateSettings);

module.exports = router;
