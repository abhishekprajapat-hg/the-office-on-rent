const express = require("express");

const attendanceController = require("../controllers/attendance.controller");
const { protect } = require("../middleware/auth.middleware");
const { writeLimiter } = require("../middleware/rateLimit.middleware");

const router = express.Router();

router.use(protect);

router.get("/me", attendanceController.getMyAttendance);
router.post("/check-in", writeLimiter, attendanceController.checkIn);
router.post("/break/start", writeLimiter, attendanceController.startBreak);
router.post("/break/end", writeLimiter, attendanceController.endBreak);
router.post("/check-out", writeLimiter, attendanceController.checkOut);
router.get("/daily", attendanceController.getDailyAttendanceForAdmin);
router.get("/policy", attendanceController.getAttendancePolicy);
router.patch("/policy", writeLimiter, attendanceController.upsertAttendancePolicy);

router.post("/leave-requests", writeLimiter, attendanceController.createLeaveRequest);
router.get("/leave-requests/my", attendanceController.getMyLeaveRequests);
router.get("/leave-requests/admin", attendanceController.getAdminLeaveRequests);
router.patch(
  "/leave-requests/:requestId/review",
  writeLimiter,
  attendanceController.reviewLeaveRequest,
);

module.exports = router;
