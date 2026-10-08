const express = require("express");

const salaryController = require("../controllers/salary.controller");
const { protect } = require("../middleware/auth.middleware");
const { writeLimiter } = require("../middleware/rateLimit.middleware");
const { requirePageAccess } = require("../middleware/pageAccess.middleware");
const { requireAdminApprovalForDelete } = require("../services/deleteApproval.service");

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

/*
 * Named deductions. Removing one follows the company rule for every delete: an
 * admin's happens at once, a manager's becomes a request an admin approves.
 */
router.post("/policy/deductions", writeLimiter, salaryController.addCompanyDeduction);
router.patch("/policy/deductions/:deductionId", writeLimiter, salaryController.updateCompanyDeduction);
router.delete(
  "/policy/deductions/:deductionId",
  writeLimiter,
  requireAdminApprovalForDelete("salary_company_deduction", {
    label: "Salary deduction",
    pageKey: "salary",
    idParam: "deductionId",
    handler: salaryController.removeCompanyDeduction,
    describe: salaryController.describeCompanyDeduction,
  }),
  salaryController.removeCompanyDeduction,
);

// One person's own attendance deduction amounts, in place of the company's.
router.put(
  "/users/:userId/rules",
  writeLimiter,
  salaryController.ensureEmployeeDeductionAccess,
  salaryController.setEmployeeRules,
);

router.post(
  "/users/:userId/deductions",
  writeLimiter,
  salaryController.ensureEmployeeDeductionAccess,
  salaryController.addEmployeeDeduction,
);
router.patch(
  "/users/:userId/deductions/:deductionId",
  writeLimiter,
  salaryController.ensureEmployeeDeductionAccess,
  salaryController.updateEmployeeDeduction,
);
router.delete(
  "/users/:userId/deductions/:deductionId",
  writeLimiter,
  // Checked first, so a manager cannot raise a request about someone outside
  // their team, or about themselves.
  salaryController.ensureEmployeeDeductionAccess,
  requireAdminApprovalForDelete("salary_employee_deduction", {
    label: "Salary deduction",
    pageKey: "salary",
    idParam: "deductionId",
    handler: salaryController.removeEmployeeDeduction,
    describe: salaryController.describeEmployeeDeduction,
  }),
  salaryController.removeEmployeeDeduction,
);

module.exports = router;
