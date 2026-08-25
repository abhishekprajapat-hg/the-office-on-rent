const ticketService = require("../services/coworkingTicket.service");
const logger = require("../config/logger");
const { handleControllerError: handleError } = require("../utils/httpError");

const handleControllerError = (res, error, message) => handleError(res, error, logger, message);

exports.listTickets = async (req, res) => {
  try {
    const { tickets, pagination } = await ticketService.listTickets({
      companyId: req.user.companyId,
      query: req.query,
    });
    return res.json({ tickets, pagination });
  } catch (error) {
    return handleControllerError(res, error, "listTickets failed");
  }
};

exports.createTicket = async (req, res) => {
  try {
    const ticket = await ticketService.createTicket({
      companyId: req.user.companyId,
      actingUser: req.user,
      payload: req.body,
    });
    return res.status(201).json({ ticket });
  } catch (error) {
    return handleControllerError(res, error, "createTicket failed");
  }
};

exports.updateTicket = async (req, res) => {
  try {
    const ticket = await ticketService.updateTicket({
      companyId: req.user.companyId,
      ticketId: req.params.ticketId,
      actingUser: req.user,
      payload: req.body,
    });
    return res.json({ ticket });
  } catch (error) {
    return handleControllerError(res, error, "updateTicket failed");
  }
};

const statusHandler = (serviceFn, actionName) => async (req, res) => {
  try {
    const ticket = await serviceFn({
      companyId: req.user.companyId,
      ticketId: req.params.ticketId,
      actingUser: req.user,
      resolutionNotes: req.body?.resolutionNotes,
    });
    return res.json({ ticket });
  } catch (error) {
    return handleControllerError(res, error, `${actionName} failed`);
  }
};

exports.resolveTicket = statusHandler(ticketService.resolveTicket, "resolveTicket");
exports.closeTicket = statusHandler(ticketService.closeTicket, "closeTicket");
exports.reopenTicket = statusHandler(ticketService.reopenTicket, "reopenTicket");

exports.deleteTicket = async (req, res) => {
  try {
    await ticketService.deleteTicket({
      companyId: req.user.companyId,
      ticketId: req.params.ticketId,
      actingUser: req.user,
    });
    return res.json({ message: "Ticket deleted" });
  } catch (error) {
    return handleControllerError(res, error, "deleteTicket failed");
  }
};
