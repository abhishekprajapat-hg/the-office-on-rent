const express = require("express");
const router = express.Router();

const ticketController = require("../controllers/coworkingTicket.controller");
const { requirePermission } = require("../middleware/permission.middleware");
const { writeLimiter } = require("../middleware/rateLimit.middleware");

router.get("/", requirePermission("tickets.view"), ticketController.listTickets);
router.post("/", writeLimiter, requirePermission("tickets.create"), ticketController.createTicket);
router.patch("/:ticketId", writeLimiter, requirePermission("tickets.update"), ticketController.updateTicket);
router.post("/:ticketId/resolve", writeLimiter, requirePermission("tickets.resolve"), ticketController.resolveTicket);
router.post("/:ticketId/close", writeLimiter, requirePermission("tickets.close"), ticketController.closeTicket);
router.post("/:ticketId/reopen", writeLimiter, requirePermission("tickets.update"), ticketController.reopenTicket);
router.delete("/:ticketId", writeLimiter, requirePermission("tickets.delete"), ticketController.deleteTicket);

module.exports = router;
