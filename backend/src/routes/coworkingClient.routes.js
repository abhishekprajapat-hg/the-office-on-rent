const express = require("express");
const router = express.Router();

const clientController = require("../controllers/coworkingClient.controller");
const { requirePermission } = require("../middleware/permission.middleware");
const { writeLimiter } = require("../middleware/rateLimit.middleware");

router.get("/", requirePermission("clients.view"), clientController.listClients);
router.get("/:clientId", requirePermission("clients.view"), clientController.getClient);
router.get("/:clientId/assignments", requirePermission("clients.view"), clientController.getAssignments);
router.get("/:clientId/activity", requirePermission("clients.view"), clientController.getActivity);

router.post("/", writeLimiter, requirePermission("clients.create"), clientController.createClient);
router.patch("/:clientId", writeLimiter, requirePermission("clients.update"), clientController.updateClient);
router.delete("/:clientId", writeLimiter, requirePermission("clients.delete"), clientController.deleteClient);

router.post(
  "/:clientId/contacts",
  writeLimiter,
  requirePermission("clients.update"),
  clientController.addContact,
);
router.delete(
  "/:clientId/contacts/:contactId",
  writeLimiter,
  requirePermission("clients.update"),
  clientController.removeContact,
);

router.post(
  "/:clientId/documents",
  writeLimiter,
  requirePermission("clients.update"),
  clientController.addDocument,
);
router.delete(
  "/:clientId/documents/:documentId",
  writeLimiter,
  requirePermission("clients.update"),
  clientController.removeDocument,
);

// Client portal login management — separate credential system, see
// clientPortalAuth.service.js.
router.get(
  "/:clientId/portal-users",
  requirePermission("clients.update"),
  clientController.listPortalUsers,
);
router.post(
  "/:clientId/portal-users",
  writeLimiter,
  requirePermission("clients.update"),
  clientController.createPortalUser,
);
router.patch(
  "/:clientId/portal-users/:portalUserId/active",
  writeLimiter,
  requirePermission("clients.update"),
  clientController.setPortalUserActive,
);
router.post(
  "/:clientId/portal-users/:portalUserId/reset-password",
  writeLimiter,
  requirePermission("clients.update"),
  clientController.resetPortalUserPassword,
);

module.exports = router;
