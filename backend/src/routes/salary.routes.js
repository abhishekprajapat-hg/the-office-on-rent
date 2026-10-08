const express = require("express");

const salaryController = require("../controllers/salary.controller");
const { protect } = require("../middleware/auth.middleware");
const { writeLimiter } = require("../middleware/rateLimit.middleware");
const { requirePageAccess } = require("../middleware/pageAccess.middleware");

const router = express.Router();

/*
 * The salary page is open to every account - everybody may see their own pay -
 * so there is no page-action gate here. Who may see or set someone else's is
 * decided per request in the controller (admin, or the person's manager).
 */
router.use(protect);
router.use(requirePageAccess("salary"));

router.get("/me", salaryController.getMySalary);
router.get("/team", salaryController.getTeamSalaries);
router.get("/policy", salaryController.getPayrollPolicy);
router.patch("/policy", writeLimiter, salaryController.updatePayrollPolicy);
router.get("/users/:userId", salaryController.getUserSalary);
router.put("/users/:userId", writeLimiter, salaryController.setUserSalary);

module.exports = router;
