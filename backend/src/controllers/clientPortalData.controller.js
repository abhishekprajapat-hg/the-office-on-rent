const portalDataService = require("../services/clientPortalData.service");
const logger = require("../config/logger");
const { handleControllerError: handleError } = require("../utils/httpError");

const handleControllerError = (res, error, message) => handleError(res, error, logger, message);
const ctx = (req) => ({ companyId: req.companyId, clientId: req.clientId });

exports.getMyClientProfile = async (req, res) => {
  try {
    const client = await portalDataService.getMyClientProfile(ctx(req));
    return res.json({ client });
  } catch (error) {
    return handleControllerError(res, error, "getMyClientProfile failed");
  }
};

exports.getMyInvoices = async (req, res) => {
  try {
    const { invoices, pagination } = await portalDataService.getMyInvoices({ ...ctx(req), query: req.query });
    return res.json({ invoices, pagination });
  } catch (error) {
    return handleControllerError(res, error, "getMyInvoices failed");
  }
};

exports.getMyInvoiceById = async (req, res) => {
  try {
    const invoice = await portalDataService.getMyInvoiceById({ ...ctx(req), invoiceId: req.params.invoiceId });
    return res.json({ invoice });
  } catch (error) {
    return handleControllerError(res, error, "getMyInvoiceById failed");
  }
};

exports.getMyBookings = async (req, res) => {
  try {
    const { bookings, pagination } = await portalDataService.getMyBookings({ ...ctx(req), query: req.query });
    return res.json({ bookings, pagination });
  } catch (error) {
    return handleControllerError(res, error, "getMyBookings failed");
  }
};

exports.getMyContracts = async (req, res) => {
  try {
    const { contracts, pagination } = await portalDataService.getMyContracts({ ...ctx(req), query: req.query });
    return res.json({ contracts, pagination });
  } catch (error) {
    return handleControllerError(res, error, "getMyContracts failed");
  }
};

exports.getMyContractById = async (req, res) => {
  try {
    const contract = await portalDataService.getMyContractById({ ...ctx(req), contractId: req.params.contractId });
    return res.json({ contract });
  } catch (error) {
    return handleControllerError(res, error, "getMyContractById failed");
  }
};

exports.getMyDocuments = async (req, res) => {
  try {
    const documents = await portalDataService.getMyDocuments(ctx(req));
    return res.json({ documents });
  } catch (error) {
    return handleControllerError(res, error, "getMyDocuments failed");
  }
};

exports.submitMyDocument = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ message: "No file uploaded" });
    }

    const category = String(req.body?.category || "OTHER").trim().toUpperCase();
    const publicUrl = `${req.protocol}://${req.get("host")}/api/uploads/files/${req.uploadCategory}/${req.file.filename}`;
    const client = await portalDataService.submitMyDocument({
      ...ctx(req),
      portalUser: req.portalUser,
      payload: {
        name: req.body?.name || req.file.originalname,
        category,
        fileUrl: publicUrl,
        fileType: req.file.mimetype,
      },
    });

    return res.status(201).json({ client });
  } catch (error) {
    return handleControllerError(res, error, "submitMyDocument failed");
  }
};

exports.getMyTicketOptions = async (req, res) => {
  try {
    const properties = await portalDataService.getClientPropertyOptions(ctx(req));
    return res.json({ properties });
  } catch (error) {
    return handleControllerError(res, error, "getMyTicketOptions failed");
  }
};

exports.getMyTickets = async (req, res) => {
  try {
    const { tickets, pagination } = await portalDataService.getMyTickets({ ...ctx(req), query: req.query });
    return res.json({ tickets, pagination });
  } catch (error) {
    return handleControllerError(res, error, "getMyTickets failed");
  }
};

exports.createMyTicket = async (req, res) => {
  try {
    const ticket = await portalDataService.createMyTicket({
      ...ctx(req),
      portalUser: req.portalUser,
      payload: req.body,
    });
    return res.status(201).json({ ticket });
  } catch (error) {
    return handleControllerError(res, error, "createMyTicket failed");
  }
};
