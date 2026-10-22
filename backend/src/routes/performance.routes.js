const express = require("express");

const performanceController = require("../controllers/performance.controller");
const { protect } = require("../middleware/auth.middleware");
const { requirePageAccess } = require("../middleware/pageAccess.middleware");

const router = express.Router();

// Read-only, and open to every account: everybody may see their own score.
// Whose else they may see is decided per request in the controller.
router.use(protect);
router.use(requirePageAccess("performance"));

router.get("/me", performanceController.getMyPerformance);
router.get("/team", performanceController.getTeamPerformance);
router.get("/users/:userId", performanceController.getUserPerformance);
router.get("/users/:userId/history", performanceController.getUserPerformanceHistory);
// Increment reviews (requirements 16 Oct 2026, 3.4): Admin and Manager only.
const { writeLimiter } = require("../middleware/rateLimit.middleware");
router.get("/increment-reviews", performanceController.listIncrementReviews);
router.post("/increment-reviews", writeLimiter, performanceController.createIncrementReview);
router.patch("/increment-reviews/:reviewId", writeLimiter, performanceController.updateIncrementReview);

module.exports = router;
