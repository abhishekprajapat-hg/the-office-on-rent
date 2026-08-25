const mongoose = require("mongoose");
const CoworkingClient = require("../models/CoworkingClient");
const CoworkingIdCounter = require("../models/CoworkingIdCounter");
const CoworkingProperty = require("../models/CoworkingProperty");
const CoworkingTicket = require("../models/CoworkingTicket");
const {
  TICKET_CATEGORIES,
  TICKET_PRIORITIES,
  TICKET_STATUSES,
} = require("../models/CoworkingTicket");
const { createHttpError } = require("../utils/httpError");
const { parsePagination, buildPaginationMeta } = require("../utils/queryOptions");
const { writeAuditLog } = require("./auditLog.service");

const isValidObjectId = (value) => mongoose.Types.ObjectId.isValid(value);

const generateTicketCode = async (companyId) => {
  const counter = await CoworkingIdCounter.findOneAndUpdate(
    { companyId, category: "TICKET" },
    { $inc: { seq: 1 } },
    { new: true, upsert: true },
  );
  return `TKT-${String(counter.seq).padStart(4, "0")}`;
};

const assertProperty = async (companyId, propertyId) => {
  if (!isValidObjectId(propertyId)) throw createHttpError(400, "Invalid propertyId");
  const property = await CoworkingProperty.findOne({ _id: propertyId, companyId }).select("_id").lean();
  if (!property) throw createHttpError(400, "Property not found for this company");
};

const assertClient = async (companyId, clientId) => {
  if (!clientId) return null;
  if (!isValidObjectId(clientId)) throw createHttpError(400, "Invalid clientId");
  const client = await CoworkingClient.findOne({ _id: clientId, companyId }).select("_id").lean();
  if (!client) throw createHttpError(400, "Client not found for this company");
  return client._id;
};

const parseDateOrNull = (value) => {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) throw createHttpError(400, "Invalid dueDate");
  return date;
};

const sanitizePayload = async (companyId, payload = {}, { partial = false } = {}) => {
  const safe = {};

  if (Object.prototype.hasOwnProperty.call(payload, "propertyId")) {
    const propertyId = String(payload.propertyId || "").trim();
    await assertProperty(companyId, propertyId);
    safe.propertyId = propertyId;
  }

  if (Object.prototype.hasOwnProperty.call(payload, "clientId")) {
    const clientId = String(payload.clientId || "").trim();
    safe.clientId = clientId ? await assertClient(companyId, clientId) : null;
  }

  if (Object.prototype.hasOwnProperty.call(payload, "title")) {
    const title = String(payload.title || "").trim().slice(0, 160);
    if (!title && !partial) throw createHttpError(400, "title is required");
    safe.title = title;
  }

  if (Object.prototype.hasOwnProperty.call(payload, "description")) {
    safe.description = String(payload.description || "").trim().slice(0, 4000);
  }

  if (Object.prototype.hasOwnProperty.call(payload, "category")) {
    const category = String(payload.category || "OTHER").trim().toUpperCase();
    if (!TICKET_CATEGORIES.includes(category)) throw createHttpError(400, "Invalid category");
    safe.category = category;
  }

  if (Object.prototype.hasOwnProperty.call(payload, "priority")) {
    const priority = String(payload.priority || "MEDIUM").trim().toUpperCase();
    if (!TICKET_PRIORITIES.includes(priority)) throw createHttpError(400, "Invalid priority");
    safe.priority = priority;
  }

  if (Object.prototype.hasOwnProperty.call(payload, "status")) {
    const status = String(payload.status || "OPEN").trim().toUpperCase();
    if (!TICKET_STATUSES.includes(status)) throw createHttpError(400, "Invalid status");
    safe.status = status;
    if (status === "RESOLVED" && !payload.currentResolvedAt) safe.resolvedAt = new Date();
    if (status === "CLOSED" && !payload.currentClosedAt) safe.closedAt = new Date();
    if (["OPEN", "IN_PROGRESS"].includes(status)) {
      safe.resolvedAt = null;
      safe.closedAt = null;
    }
  }

  if (Object.prototype.hasOwnProperty.call(payload, "reportedByName")) {
    safe.reportedByName = String(payload.reportedByName || "").trim().slice(0, 120);
  }

  if (Object.prototype.hasOwnProperty.call(payload, "assignedToName")) {
    safe.assignedToName = String(payload.assignedToName || "").trim().slice(0, 120);
  }

  if (Object.prototype.hasOwnProperty.call(payload, "dueDate")) {
    safe.dueDate = parseDateOrNull(payload.dueDate);
  }

  if (Object.prototype.hasOwnProperty.call(payload, "resolutionNotes")) {
    safe.resolutionNotes = String(payload.resolutionNotes || "").trim().slice(0, 2000);
  }

  if (!partial) {
    if (!safe.propertyId) throw createHttpError(400, "propertyId is required");
    if (!safe.title) throw createHttpError(400, "title is required");
  }

  return safe;
};

const createTicket = async ({ companyId, actingUser, portalUser, payload }) => {
  const safePayload = await sanitizePayload(companyId, payload);
  const ticketCode = await generateTicketCode(companyId);
  const ticket = await CoworkingTicket.create({
    ...safePayload,
    companyId,
    ticketCode,
    createdBy: actingUser?._id || null,
    createdByPortalUser: portalUser?._id || null,
  });

  if (actingUser?._id) {
    await writeAuditLog({
      companyId,
      actor: actingUser,
      action: "TICKET_CREATED",
      entityType: "CoworkingTicket",
      entityId: ticket._id,
      metadata: { ticketCode, priority: ticket.priority, status: ticket.status },
    });
  }

  return ticket;
};

const listTickets = async ({ companyId, query = {} }) => {
  const { page, limit, skip } = parsePagination(query, { defaultLimit: 25, maxLimit: 100 });
  const filter = { companyId };

  if (query.propertyId) {
    if (!isValidObjectId(query.propertyId)) throw createHttpError(400, "Invalid propertyId");
    filter.propertyId = query.propertyId;
  }
  if (query.clientId) {
    if (!isValidObjectId(query.clientId)) throw createHttpError(400, "Invalid clientId");
    filter.clientId = query.clientId;
  }
  if (query.status) {
    const status = String(query.status).trim().toUpperCase();
    if (!TICKET_STATUSES.includes(status)) throw createHttpError(400, "Invalid status filter");
    filter.status = status;
  }
  if (query.priority) {
    const priority = String(query.priority).trim().toUpperCase();
    if (!TICKET_PRIORITIES.includes(priority)) throw createHttpError(400, "Invalid priority filter");
    filter.priority = priority;
  }
  if (query.search) {
    const search = String(query.search).trim();
    filter.$or = [
      { ticketCode: { $regex: search, $options: "i" } },
      { title: { $regex: search, $options: "i" } },
      { reportedByName: { $regex: search, $options: "i" } },
      { assignedToName: { $regex: search, $options: "i" } },
    ];
  }

  const [rows, totalCount] = await Promise.all([
    CoworkingTicket.find(filter)
      .populate("propertyId", "name propertyCode")
      .populate("clientId", "companyName clientCode")
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean(),
    CoworkingTicket.countDocuments(filter),
  ]);

  return { tickets: rows, pagination: buildPaginationMeta({ page, limit, totalCount }) };
};

const getTicketDoc = async (companyId, ticketId) => {
  if (!isValidObjectId(ticketId)) throw createHttpError(400, "Invalid ticket id");
  const ticket = await CoworkingTicket.findOne({ _id: ticketId, companyId });
  if (!ticket) throw createHttpError(404, "Ticket not found");
  return ticket;
};

const updateTicket = async ({ companyId, ticketId, actingUser, payload }) => {
  const ticket = await getTicketDoc(companyId, ticketId);
  const safePayload = await sanitizePayload(
    companyId,
    { ...payload, currentResolvedAt: ticket.resolvedAt, currentClosedAt: ticket.closedAt },
    { partial: true },
  );
  if (Object.keys(safePayload).length === 0) throw createHttpError(400, "No valid fields to update");

  Object.assign(ticket, safePayload, { updatedBy: actingUser._id });
  await ticket.save();

  await writeAuditLog({
    companyId,
    actor: actingUser,
    action: "TICKET_UPDATED",
    entityType: "CoworkingTicket",
    entityId: ticket._id,
    metadata: { changes: safePayload },
  });

  return ticket;
};

const setTicketStatus = (status, auditAction) => async ({ companyId, ticketId, actingUser, resolutionNotes }) => {
  const ticket = await getTicketDoc(companyId, ticketId);
  ticket.status = status;
  ticket.updatedBy = actingUser._id;

  if (status === "RESOLVED") {
    ticket.resolvedAt = new Date();
    if (resolutionNotes !== undefined) {
      ticket.resolutionNotes = String(resolutionNotes || "").trim().slice(0, 2000);
    }
  }
  if (status === "CLOSED") {
    ticket.closedAt = new Date();
    if (!ticket.resolvedAt) ticket.resolvedAt = new Date();
  }
  if (status === "OPEN") {
    ticket.resolvedAt = null;
    ticket.closedAt = null;
  }

  await ticket.save();

  await writeAuditLog({
    companyId,
    actor: actingUser,
    action: auditAction,
    entityType: "CoworkingTicket",
    entityId: ticket._id,
    metadata: { ticketCode: ticket.ticketCode, status },
  });

  return ticket;
};

const deleteTicket = async ({ companyId, ticketId, actingUser }) => {
  const ticket = await getTicketDoc(companyId, ticketId);
  await ticket.deleteOne();

  await writeAuditLog({
    companyId,
    actor: actingUser,
    action: "TICKET_DELETED",
    entityType: "CoworkingTicket",
    entityId: ticketId,
    metadata: { ticketCode: ticket.ticketCode },
  });
};

module.exports = {
  createTicket,
  listTickets,
  updateTicket,
  resolveTicket: setTicketStatus("RESOLVED", "TICKET_RESOLVED"),
  closeTicket: setTicketStatus("CLOSED", "TICKET_CLOSED"),
  reopenTicket: setTicketStatus("OPEN", "TICKET_REOPENED"),
  deleteTicket,
};
