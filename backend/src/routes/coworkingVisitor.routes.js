const express = require("express");
const router = express.Router();

const visitorController = require("../controllers/coworkingVisitor.controller");
const { requirePermission } = require("../middleware/permission.middleware");
const { writeLimiter } = require("../middleware/rateLimit.middleware");

router.get("/", requirePermission("visitors.view"), visitorController.listVisitors);
router.post("/", writeLimiter, requirePermission("visitors.create"), visitorController.createVisitor);
router.patch("/:visitorId", writeLimiter, requirePermission("visitors.update"), visitorController.updateVisitor);
router.post(
  "/:visitorId/checkout",
  writeLimiter,
  requirePermission("visitors.checkout"),
  visitorController.checkoutVisitor,
);
router.delete("/:visitorId", writeLimiter, requirePermission("visitors.delete"), visitorController.deleteVisitor);

module.exports = router;
