const express = require("express");
const router = express.Router();

const portalDataController = require("../controllers/clientPortalData.controller");
const { protectClientPortal } = require("../middleware/clientPortalAuth.middleware");
const { upload } = require("../config/uploadStorage");

router.use(protectClientPortal);

router.get("/me/client", portalDataController.getMyClientProfile);
router.get("/invoices", portalDataController.getMyInvoices);
router.get("/invoices/:invoiceId", portalDataController.getMyInvoiceById);
router.get("/bookings", portalDataController.getMyBookings);
router.get("/contracts", portalDataController.getMyContracts);
router.get("/contracts/:contractId", portalDataController.getMyContractById);
router.get("/documents", portalDataController.getMyDocuments);
router.post("/documents", (req, res, next) => {
  req.query.category = "coworking-clients";
  upload.single("file")(req, res, (error) => {
    if (error) {
      return res.status(400).json({ message: error.message || "File upload failed" });
    }
    return next();
  });
}, portalDataController.submitMyDocument);
router.get("/tickets/options", portalDataController.getMyTicketOptions);
router.get("/tickets", portalDataController.getMyTickets);
router.post("/tickets", portalDataController.createMyTicket);

module.exports = router;
