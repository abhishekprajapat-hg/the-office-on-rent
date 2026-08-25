const express = require("express");
const router = express.Router();

const reportController = require("../controllers/coworkingReport.controller");
const { requirePermission } = require("../middleware/permission.middleware");

router.get("/summary", requirePermission("reports.view"), reportController.getSummary);

module.exports = router;
