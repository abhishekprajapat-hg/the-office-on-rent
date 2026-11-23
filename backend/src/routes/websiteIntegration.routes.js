const express = require("express");

const router = express.Router();
const controller = require("../controllers/websiteIntegration.controller");
const { webhookLimiter } = require("../middleware/rateLimit.middleware");

// Server-to-server from the company's website, signed with WEBSITE_LEADS_SECRET. The raw body is
// read here (the signature covers the exact bytes), so this router is mounted before express.json.
router.post(
  "/leads",
  webhookLimiter,
  express.raw({ type: () => true, limit: "64kb" }),
  controller.receiveWebsiteLead,
);

module.exports = router;
