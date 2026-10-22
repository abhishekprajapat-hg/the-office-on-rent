const express = require("express");
const router = express.Router();

const projectController = require("../controllers/project.controller");
const authMiddleware = require("../middleware/auth.middleware");
const companyMiddleware = require("../middleware/company.middleware");
const { writeLimiter } = require("../middleware/rateLimit.middleware");
const {
  requirePageAccess,
  checkRoleOrPageAccess,
  requirePageActionForMethod,
  checkRoleOrPageAction,
} = require("../middleware/pageAccess.middleware");
const Project = require("../models/Project");
const { requireAdminApprovalForDelete, describeByModel } = require("../services/deleteApproval.service");

const PROJECT_VIEW_ROLES = [
  "ADMIN",
  "MANAGER",
  "EXECUTIVE",
  "FIELD_EXECUTIVE",
  "CHANNEL_PARTNER",
];
const PROJECT_MANAGE_ROLES = ["ADMIN", "MANAGER"];

router.use(authMiddleware.protect);
router.use(require("../middleware/partnerInventoryAccess.middleware").requirePartnerInventoryAccess);
router.use(checkRoleOrPageAccess(PROJECT_VIEW_ROLES, "projects"));
router.use(companyMiddleware.requireCompanyContext);
router.use(requirePageAccess("projects"));
router.use(requirePageActionForMethod("projects"));

router.get("/", projectController.getProjects);
// Project knowledge (requirements 16 Oct 2026, section 05).
router.get("/meta/details-catalogue", projectController.getDetailsCatalogue);
router.get("/:id/export", projectController.exportProject);
router.get("/:id/inventory", projectController.getProjectInventory);
router.patch("/:id/details", writeLimiter, checkRoleOrPageAction(PROJECT_MANAGE_ROLES, "edit", "projects"), projectController.updateProjectDetails);
router.post("/:id/link-inventory", writeLimiter, checkRoleOrPageAction(PROJECT_MANAGE_ROLES, "edit", "projects"), projectController.linkProjectInventory);
router.post("/:id/verify", writeLimiter, checkRoleOrPageAction(PROJECT_MANAGE_ROLES, "edit", "projects"), projectController.verifyProject);
router.get("/:id", projectController.getProject);

router.post(
  "/",
  writeLimiter,
  checkRoleOrPageAction(PROJECT_MANAGE_ROLES, "create", "projects"),
  projectController.createProject,
);

router.patch(
  "/:id",
  writeLimiter,
  checkRoleOrPageAction(PROJECT_MANAGE_ROLES, "edit", "projects"),
  projectController.updateProject,
);

// Managers may ask; the delete itself runs only when an Admin approves.
router.delete(
  "/:id",
  writeLimiter,
  checkRoleOrPageAction(PROJECT_MANAGE_ROLES, "delete", "projects"),
  requireAdminApprovalForDelete("project", {
    label: "Project",
    pageKey: "projects",
    idParam: "id",
    handler: projectController.deleteProject,
    describe: describeByModel(Project, ["projectName"], { deletedAt: null }),
  }),
  projectController.deleteProject,
);

module.exports = router;
