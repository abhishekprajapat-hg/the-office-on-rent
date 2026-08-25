const mongoose = require("mongoose");
const CoworkingNotification = require("../models/CoworkingNotification");
const {
  NOTIFICATION_PRIORITIES,
  NOTIFICATION_STATUSES,
  NOTIFICATION_TYPES,
} = require("../models/CoworkingNotification");
const CoworkingIdCounter = require("../models/CoworkingIdCounter");
const { createHttpError } = require("../utils/httpError");
const { parsePagination, buildPaginationMeta } = require("../utils/queryOptions");
const { writeAuditLog } = require("./auditLog.service");

const isValidObjectId = (value) => mongoose.Types.ObjectId.isValid(value);

const generateNotificationCode = async (companyId) => {
  const counter = await CoworkingIdCounter.findOneAndUpdate(
    { companyId, category: "NOTIFICATION" },
    { $inc: { seq: 1 } },
    { new: true, upsert: true },
  );
  return `NOT-${String(counter.seq).padStart(4, "0")}`;
};

const parseDateOrNull = (value, fieldName) => {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) throw createHttpError(400, `Invalid ${fieldName}`);
  return date;
};

const normalizeEnum = (value, fallback, allowed, fieldName) => {
  const normalized = String(value || fallback).trim().toUpperCase();
  if (!allowed.includes(normalized)) throw createHttpError(400, `Invalid ${fieldName}`);
  return normalized;
};

const sanitizePayload = (payload = {}, { partial = false } = {}) => {
  const safe = {};

  if (Object.prototype.hasOwnProperty.call(payload, "type")) {
    safe.type = normalizeEnum(payload.type, "SYSTEM", NOTIFICATION_TYPES, "type");
  }

  if (Object.prototype.hasOwnProperty.call(payload, "priority")) {
    safe.priority = normalizeEnum(payload.priority, "NORMAL", NOTIFICATION_PRIORITIES, "priority");
  }

  if (Object.prototype.hasOwnProperty.call(payload, "status")) {
    const status = normalizeEnum(payload.status, "UNREAD", NOTIFICATION_STATUSES, "status");
    safe.status = status;
    if (status === "READ") safe.readAt = new Date();
    if (status === "ARCHIVED") safe.archivedAt = new Date();
  }

  if (Object.prototype.hasOwnProperty.call(payload, "title")) {
    const title = String(payload.title || "").trim().slice(0, 160);
    if (!title && !partial) throw createHttpError(400, "title is required");
    safe.title = title;
  }

  if (Object.prototype.hasOwnProperty.call(payload, "message")) {
    safe.message = String(payload.message || "").trim().slice(0, 2000);
  }

  if (Object.prototype.hasOwnProperty.call(payload, "entityType")) {
    safe.entityType = String(payload.entityType || "").trim().slice(0, 80);
  }

  if (Object.prototype.hasOwnProperty.call(payload, "entityId")) {
    const entityId = String(payload.entityId || "").trim();
    if (entityId && !isValidObjectId(entityId)) throw createHttpError(400, "Invalid entityId");
    safe.entityId = entityId || null;
  }

  if (Object.prototype.hasOwnProperty.call(payload, "actionUrl")) {
    safe.actionUrl = String(payload.actionUrl || "").trim().slice(0, 300);
  }

  if (Object.prototype.hasOwnProperty.call(payload, "dueAt")) {
    safe.dueAt = parseDateOrNull(payload.dueAt, "dueAt");
  }

  if (!partial && !safe.title) throw createHttpError(400, "title is required");

  return safe;
};

const createNotification = async ({ companyId, actingUser, payload }) => {
  const safePayload = sanitizePayload(payload);
  const notificationCode = await generateNotificationCode(companyId);
  const notification = await CoworkingNotification.create({
    ...safePayload,
    companyId,
    notificationCode,
    createdBy: actingUser?._id || null,
  });

  if (actingUser?._id) {
    await writeAuditLog({
      companyId,
      actor: actingUser,
      action: "NOTIFICATION_CREATED",
      entityType: "CoworkingNotification",
      entityId: notification._id,
      metadata: { notificationCode, type: notification.type, priority: notification.priority },
    });
  }

  return notification;
};

const createSystemNotification = async ({ companyId, payload }) =>
  createNotification({ companyId, actingUser: null, payload });

const listNotifications = async ({ companyId, query = {} }) => {
  const { page, limit, skip } = parsePagination(query, { defaultLimit: 25, maxLimit: 100 });
  const filter = { companyId };

  if (query.status) {
    const status = String(query.status).trim().toUpperCase();
    if (!NOTIFICATION_STATUSES.includes(status)) throw createHttpError(400, "Invalid status filter");
    filter.status = status;
  }

  if (query.type) {
    const type = String(query.type).trim().toUpperCase();
    if (!NOTIFICATION_TYPES.includes(type)) throw createHttpError(400, "Invalid type filter");
    filter.type = type;
  }

  if (query.priority) {
    const priority = String(query.priority).trim().toUpperCase();
    if (!NOTIFICATION_PRIORITIES.includes(priority)) throw createHttpError(400, "Invalid priority filter");
    filter.priority = priority;
  }

  if (query.search) {
    const search = String(query.search).trim();
    filter.$or = [
      { notificationCode: { $regex: search, $options: "i" } },
      { title: { $regex: search, $options: "i" } },
      { message: { $regex: search, $options: "i" } },
      { entityType: { $regex: search, $options: "i" } },
    ];
  }

  const [rows, totalCount] = await Promise.all([
    CoworkingNotification.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit).lean(),
    CoworkingNotification.countDocuments(filter),
  ]);

  return { notifications: rows, pagination: buildPaginationMeta({ page, limit, totalCount }) };
};

const getNotificationDoc = async (companyId, notificationId) => {
  if (!isValidObjectId(notificationId)) throw createHttpError(400, "Invalid notification id");
  const notification = await CoworkingNotification.findOne({ _id: notificationId, companyId });
  if (!notification) throw createHttpError(404, "Notification not found");
  return notification;
};

const updateNotification = async ({ companyId, notificationId, actingUser, payload }) => {
  const notification = await getNotificationDoc(companyId, notificationId);
  const safePayload = sanitizePayload(payload, { partial: true });
  if (Object.keys(safePayload).length === 0) throw createHttpError(400, "No valid fields to update");

  Object.assign(notification, safePayload, { updatedBy: actingUser._id });
  await notification.save();

  await writeAuditLog({
    companyId,
    actor: actingUser,
    action: "NOTIFICATION_UPDATED",
    entityType: "CoworkingNotification",
    entityId: notification._id,
    metadata: { changes: safePayload },
  });

  return notification;
};

const setNotificationStatus = (status, action) => async ({ companyId, notificationId, actingUser }) => {
  const notification = await getNotificationDoc(companyId, notificationId);
  notification.status = status;
  notification.updatedBy = actingUser._id;
  if (status === "READ") notification.readAt = new Date();
  if (status === "UNREAD") {
    notification.readAt = null;
    notification.archivedAt = null;
  }
  if (status === "ARCHIVED") notification.archivedAt = new Date();
  await notification.save();

  await writeAuditLog({
    companyId,
    actor: actingUser,
    action,
    entityType: "CoworkingNotification",
    entityId: notification._id,
    metadata: { notificationCode: notification.notificationCode, status },
  });

  return notification;
};

const deleteNotification = async ({ companyId, notificationId, actingUser }) => {
  const notification = await getNotificationDoc(companyId, notificationId);
  await notification.deleteOne();

  await writeAuditLog({
    companyId,
    actor: actingUser,
    action: "NOTIFICATION_DELETED",
    entityType: "CoworkingNotification",
    entityId: notificationId,
    metadata: { notificationCode: notification.notificationCode },
  });
};

module.exports = {
  createNotification,
  createSystemNotification,
  listNotifications,
  updateNotification,
  markRead: setNotificationStatus("READ", "NOTIFICATION_MARKED_READ"),
  markUnread: setNotificationStatus("UNREAD", "NOTIFICATION_MARKED_UNREAD"),
  archiveNotification: setNotificationStatus("ARCHIVED", "NOTIFICATION_ARCHIVED"),
  deleteNotification,
};
