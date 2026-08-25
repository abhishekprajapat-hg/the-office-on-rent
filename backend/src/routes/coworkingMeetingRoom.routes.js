const express = require("express");
const router = express.Router();

const meetingRoomController = require("../controllers/coworkingMeetingRoom.controller");
const { requirePermission } = require("../middleware/permission.middleware");
const { writeLimiter } = require("../middleware/rateLimit.middleware");

router.get("/", requirePermission("meeting_rooms.view"), meetingRoomController.listMeetingRooms);
router.post("/", writeLimiter, requirePermission("meeting_rooms.create"), meetingRoomController.createMeetingRoom);
router.patch(
  "/:meetingRoomId",
  writeLimiter,
  requirePermission("meeting_rooms.update"),
  meetingRoomController.updateMeetingRoom,
);
router.delete(
  "/:meetingRoomId",
  writeLimiter,
  requirePermission("meeting_rooms.delete"),
  meetingRoomController.deleteMeetingRoom,
);

module.exports = router;
