const express = require("express");

const router = express.Router();
const controller = require("../controllers/whatsappIntegration.controller");
const { webhookLimiter } = require("../middleware/rateLimit.middleware");

// Server-to-server from the company's WhatsApp dashboard, signed with the shared secret. The raw body
// is read here (the signature covers the exact bytes), so this router is mounted before express.json.
router.post(
  "/leads",
  webhookLimiter,
  express.raw({ type: () => true, limit: "64kb" }),
  controller.upsertWhatsAppLead,
);

module.exports = router;
