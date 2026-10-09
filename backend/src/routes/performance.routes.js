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

module.exports = router;
