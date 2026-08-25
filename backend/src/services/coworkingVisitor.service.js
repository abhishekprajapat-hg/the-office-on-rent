const mongoose = require("mongoose");
const CoworkingClient = require("../models/CoworkingClient");
const CoworkingIdCounter = require("../models/CoworkingIdCounter");
const CoworkingProperty = require("../models/CoworkingProperty");
const CoworkingVisitor = require("../models/CoworkingVisitor");
const { VISITOR_STATUSES } = require("../models/CoworkingVisitor");
const { createHttpError } = require("../utils/httpError");
const { parsePagination, buildPaginationMeta } = require("../utils/queryOptions");
const { writeAuditLog } = require("./auditLog.service");

const isValidObjectId = (value) => mongoose.Types.ObjectId.isValid(value);

const generateVisitorCode = async (companyId) => {
  const counter = await CoworkingIdCounter.findOneAndUpdate(
    { companyId, category: "VISITOR" },
    { $inc: { seq: 1 } },
    { new: true, upsert: true },
  );
  return `VIS-${String(counter.seq).padStart(4, "0")}`;
};

const assertProperty = async (companyId, propertyId) => {
  if (!isValidObjectId(propertyId)) throw createHttpError(400, "Invalid propertyId");
  const property = await CoworkingProperty.findOne({ _id: propertyId, companyId }).select("_id").lean();
  if (!property) throw createHttpError(400, "Property not found for this company");
};

const assertClient = async (companyId, clientId) => {
  if (!clientId) return null;
  if (!isValidObjectId(clientId)) throw createHttpError(400, "Invalid clientId");
  const client = await CoworkingClient.findOne({ _id: clientId, companyId }).select("_id companyName").lean();
  if (!client) throw createHttpError(400, "Client not found for this company");
  return client._id;
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

  if (Object.prototype.hasOwnProperty.call(payload, "visitorName")) {
    const visitorName = String(payload.visitorName || "").trim().slice(0, 120);
    if (!visitorName && !partial) throw createHttpError(400, "visitorName is required");
    safe.visitorName = visitorName;
  }

  if (Object.prototype.hasOwnProperty.call(payload, "phone")) {
    safe.phone = String(payload.phone || "").trim().slice(0, 32);
  }

  if (Object.prototype.hasOwnProperty.call(payload, "email")) {
    safe.email = String(payload.email || "").trim().toLowerCase().slice(0, 160);
  }

  if (Object.prototype.hasOwnProperty.call(payload, "hostName")) {
    safe.hostName = String(payload.hostName || "").trim().slice(0, 120);
  }

  if (Object.prototype.hasOwnProperty.call(payload, "purpose")) {
    safe.purpose = String(payload.purpose || "").trim().slice(0, 240);
  }

  if (Object.prototype.hasOwnProperty.call(payload, "idProofType")) {
    safe.idProofType = String(payload.idProofType || "").trim().slice(0, 80);
  }

  if (Object.prototype.hasOwnProperty.call(payload, "idProofLast4")) {
    safe.idProofLast4 = String(payload.idProofLast4 || "").trim().replace(/\D/g, "").slice(-4);
  }

  if (Object.prototype.hasOwnProperty.call(payload, "status")) {
    const status = String(payload.status || "").trim().toUpperCase();
    if (!VISITOR_STATUSES.includes(status)) throw createHttpError(400, "Invalid status");
    safe.status = status;
    safe.checkOutAt = status === "CHECKED_OUT" ? new Date() : null;
  }

  if (Object.prototype.hasOwnProperty.call(payload, "notes")) {
    safe.notes = String(payload.notes || "").trim().slice(0, 1000);
  }

  if (!partial) {
    if (!safe.propertyId) throw createHttpError(400, "propertyId is required");
    if (!safe.visitorName) throw createHttpError(400, "visitorName is required");
  }

  return safe;
};

const createVisitor = async ({ companyId, actingUser, payload }) => {
  const safePayload = await sanitizePayload(companyId, payload);
  const visitorCode = await generateVisitorCode(companyId);

  const visitor = await CoworkingVisitor.create({
    ...safePayload,
    companyId,
    visitorCode,
    status: safePayload.status || "CHECKED_IN",
    checkInAt: new Date(),
    createdBy: actingUser._id,
  });

  await writeAuditLog({
    companyId,
    actor: actingUser,
    action: "VISITOR_CHECKED_IN",
    entityType: "CoworkingVisitor",
    entityId: visitor._id,
    metadata: { visitorCode, propertyId: safePayload.propertyId },
  });

  return visitor;
};

const listVisitors = async ({ companyId, query = {} }) => {
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
    if (!VISITOR_STATUSES.includes(status)) throw createHttpError(400, "Invalid status filter");
    filter.status = status;
  }

  if (query.search) {
    const search = String(query.search).trim();
    filter.$or = [
      { visitorCode: { $regex: search, $options: "i" } },
      { visitorName: { $regex: search, $options: "i" } },
      { phone: { $regex: search, $options: "i" } },
      { hostName: { $regex: search, $options: "i" } },
    ];
  }

  const [rows, totalCount] = await Promise.all([
    CoworkingVisitor.find(filter)
      .populate("propertyId", "name propertyCode")
      .populate("clientId", "companyName clientCode")
      .sort({ checkInAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean(),
    CoworkingVisitor.countDocuments(filter),
  ]);

  return { visitors: rows, pagination: buildPaginationMeta({ page, limit, totalCount }) };
};

const getVisitorDoc = async (companyId, visitorId) => {
  if (!isValidObjectId(visitorId)) throw createHttpError(400, "Invalid visitor id");
  const visitor = await CoworkingVisitor.findOne({ _id: visitorId, companyId });
  if (!visitor) throw createHttpError(404, "Visitor not found");
  return visitor;
};

const updateVisitor = async ({ companyId, visitorId, actingUser, payload }) => {
  const visitor = await getVisitorDoc(companyId, visitorId);
  const safePayload = await sanitizePayload(companyId, payload, { partial: true });
  if (Object.keys(safePayload).length === 0) throw createHttpError(400, "No valid fields to update");

  Object.assign(visitor, safePayload, { updatedBy: actingUser._id });
  await visitor.save();

  await writeAuditLog({
    companyId,
    actor: actingUser,
    action: "VISITOR_UPDATED",
    entityType: "CoworkingVisitor",
    entityId: visitor._id,
    metadata: { changes: safePayload },
  });

  return visitor;
};

const checkoutVisitor = async ({ companyId, visitorId, actingUser }) => {
  const visitor = await getVisitorDoc(companyId, visitorId);
  if (visitor.status === "CHECKED_OUT") throw createHttpError(409, "Visitor is already checked out");

  visitor.status = "CHECKED_OUT";
  visitor.checkOutAt = new Date();
  visitor.updatedBy = actingUser._id;
  await visitor.save();

  await writeAuditLog({
    companyId,
    actor: actingUser,
    action: "VISITOR_CHECKED_OUT",
    entityType: "CoworkingVisitor",
    entityId: visitor._id,
    metadata: { visitorCode: visitor.visitorCode },
  });

  return visitor;
};

const deleteVisitor = async ({ companyId, visitorId, actingUser }) => {
  const visitor = await getVisitorDoc(companyId, visitorId);
  await visitor.deleteOne();

  await writeAuditLog({
    companyId,
    actor: actingUser,
    action: "VISITOR_DELETED",
    entityType: "CoworkingVisitor",
    entityId: visitorId,
    metadata: { visitorCode: visitor.visitorCode },
  });
};

module.exports = {
  createVisitor,
  listVisitors,
  updateVisitor,
  checkoutVisitor,
  deleteVisitor,
};
