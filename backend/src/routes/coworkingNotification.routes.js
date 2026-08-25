const express = require("express");
const router = express.Router();

const notificationController = require("../controllers/coworkingNotification.controller");
const { requirePermission } = require("../middleware/permission.middleware");
const { writeLimiter } = require("../middleware/rateLimit.middleware");

router.get("/", requirePermission("notifications.view"), notificationController.listNotifications);
router.post("/", writeLimiter, requirePermission("notifications.create"), notificationController.createNotification);
router.patch("/:notificationId", writeLimiter, requirePermission("notifications.update"), notificationController.updateNotification);
router.post("/:notificationId/read", writeLimiter, requirePermission("notifications.update"), notificationController.markRead);
router.post("/:notificationId/unread", writeLimiter, requirePermission("notifications.update"), notificationController.markUnread);
router.post("/:notificationId/archive", writeLimiter, requirePermission("notifications.archive"), notificationController.archiveNotification);
router.delete("/:notificationId", writeLimiter, requirePermission("notifications.delete"), notificationController.deleteNotification);

module.exports = router;
