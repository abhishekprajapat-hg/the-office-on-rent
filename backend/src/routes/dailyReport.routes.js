const express = require("express");
const router = express.Router();

const controller = require("../controllers/dailyReport.controller");
const authMiddleware = require("../middleware/auth.middleware");
const companyMiddleware = require("../middleware/company.middleware");
const { writeLimiter } = require("../middleware/rateLimit.middleware");

/*
 * Daily reports (requirements 16 Oct 2026, sections 01-02).
 *
 * Open to every signed-in employee: everyone may file and read their own.
 * Whose reports someone else may read is decided per request in the
 * controller (Admin: company, Manager: own team, others: self), so calling an
 * endpoint directly never widens what a person can see.
 */
router.use(authMiddleware.protect);
router.use(companyMiddleware.requireCompanyContext);

router.get("/forms", controller.listForms);
router.get("/me/today", controller.getMyToday);
router.get("/summary", controller.getSummary);
router.get("/status", controller.getDayStatus);
router.get("/:reportId", controller.getReport);
router.post("/", writeLimiter, controller.submitReport);
router.patch("/:reportId", writeLimiter, controller.amendReport);

module.exports = router;
