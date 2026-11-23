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

// What happens in customers' chats (for the lead history) and how the CRM's messages went.
router.post("/events", webhookLimiter, express.raw({ type: () => true, limit: "64kb" }), controller.receiveChatEvent);
router.post("/message-status", webhookLimiter, express.raw({ type: () => true, limit: "64kb" }), controller.receiveMessageStatus);

module.exports = router;
