const express = require("express");

const router = express.Router();
const officeAssistantController = require("../controllers/officeAssistant.controller");
const authMiddleware = require("../middleware/auth.middleware");
const { chatMessageLimiter } = require("../middleware/rateLimit.middleware");

router.use(authMiddleware.protect);

router.post("/ask", chatMessageLimiter, officeAssistantController.askOfficeAssistant);

module.exports = router;
