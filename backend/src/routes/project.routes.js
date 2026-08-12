const express = require("express");
const router = express.Router();

const projectController = require("../controllers/project.controller");
const authMiddleware = require("../middleware/auth.middleware");
const companyMiddleware = require("../middleware/company.middleware");
const { writeLimiter } = require("../middleware/rateLimit.middleware");

const PROJECT_VIEW_ROLES = [
  "ADMIN",
  "MANAGER",
  "EXECUTIVE",
  "FIELD_EXECUTIVE",
  "CHANNEL_PARTNER",
];
const PROJECT_MANAGE_ROLES = ["ADMIN", "MANAGER"];

router.use(authMiddleware.protect);
router.use(authMiddleware.checkRole(PROJECT_VIEW_ROLES));
router.use(companyMiddleware.requireCompanyContext);

router.get("/", projectController.getProjects);
router.get("/:id", projectController.getProject);

router.post(
  "/",
  writeLimiter,
  authMiddleware.checkRole(PROJECT_MANAGE_ROLES),
  projectController.createProject,
);

router.patch(
  "/:id",
  writeLimiter,
  authMiddleware.checkRole(PROJECT_MANAGE_ROLES),
  projectController.updateProject,
);

router.delete(
  "/:id",
  writeLimiter,
  authMiddleware.checkRole(["ADMIN"]),
  projectController.deleteProject,
);

module.exports = router;
