const express = require("express");

const attendanceController = require("../controllers/attendance.controller");
const { protect } = require("../middleware/auth.middleware");
const { writeLimiter } = require("../middleware/rateLimit.middleware");
const { requirePageAccess, requirePageActionForMethod } = require("../middleware/pageAccess.middleware");

const router = express.Router();

router.use(protect);
router.use(requirePageAccess("attendance"));

/*
 * Marking your own attendance - check in, check out, your own breaks, asking
 * for leave - is self-service. Every non-ADMIN role does it for itself, which
 * is what the controller's ensurePersonalAttendanceRole enforces.
 *
 * This router used to put requirePageActionForMethod("attendance") in front of
 * all of it, so a personal POST needed the attendance "edit" page action. Any
 * role holding the page view-only could open Attendance and then got
 * "Your account does not have permission to perform this action on the page"
 * on Check in - the Coworking Admin among them. Edit on this page means
 * "may change an attendance record", not "may check myself in".
 *
 * So the action gate now sits only on the routes that touch somebody else's
 * attendance, the policy or the offices. Those keep their management-role
 * check in the controller as well.
 */
const requireAttendanceAction = requirePageActionForMethod("attendance");

router.get("/violations", attendanceController.getViolations);
router.patch("/violations/:violationId", writeLimiter, requireAttendanceAction, attendanceController.reviewViolation);
router.get("/me", attendanceController.getMyAttendance);
router.post("/check-in", writeLimiter, attendanceController.checkIn);
router.post("/break/start", writeLimiter, attendanceController.startBreak);
router.post("/break/end", writeLimiter, attendanceController.endBreak);
router.post("/users/:userId/break", writeLimiter, requireAttendanceAction, attendanceController.manageUserBreak);
router.patch("/users/:userId/:date/breaks", writeLimiter, requireAttendanceAction, attendanceController.correctUserBreak);
router.post("/check-out", writeLimiter, attendanceController.checkOut);
router.patch(
  "/users/:userId/:date/status",
  writeLimiter,
  requireAttendanceAction,
  attendanceController.updateUserAttendanceStatus,
);
router.get("/users/:userId", attendanceController.getUserAttendanceForAdmin);
router.get("/daily", attendanceController.getDailyAttendanceForAdmin);
router.get("/policy", attendanceController.getAttendancePolicy);
router.patch("/policy", writeLimiter, requireAttendanceAction, attendanceController.upsertAttendancePolicy);
router.get("/offices", attendanceController.getAttendanceOffices);
router.put("/offices", writeLimiter, requireAttendanceAction, attendanceController.updateAttendanceOffices);

router.get("/leave-balance/my", attendanceController.getMyLeaveBalance);
router.get("/leave-balance/:userId", attendanceController.getLeaveBalanceForAdmin);
router.post("/leave-requests", writeLimiter, attendanceController.createLeaveRequest);
router.get("/leave-requests/my", attendanceController.getMyLeaveRequests);
router.get("/leave-requests/admin", attendanceController.getAdminLeaveRequests);
router.patch(
  "/leave-requests/:requestId/review",
  writeLimiter,
  requireAttendanceAction,
  attendanceController.reviewLeaveRequest,
);

module.exports = router;
