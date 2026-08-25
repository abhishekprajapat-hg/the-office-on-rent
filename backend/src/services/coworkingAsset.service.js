const mongoose = require("mongoose");
const CoworkingAsset = require("../models/CoworkingAsset");
const { ASSET_CATEGORIES, ASSET_STATUSES } = require("../models/CoworkingAsset");
const CoworkingIdCounter = require("../models/CoworkingIdCounter");
const CoworkingProperty = require("../models/CoworkingProperty");
const { createHttpError } = require("../utils/httpError");
const { parsePagination, buildPaginationMeta } = require("../utils/queryOptions");
const { writeAuditLog } = require("./auditLog.service");

const isValidObjectId = (value) => mongoose.Types.ObjectId.isValid(value);

const generateAssetCode = async (companyId) => {
  const counter = await CoworkingIdCounter.findOneAndUpdate(
    { companyId, category: "ASSET" },
    { $inc: { seq: 1 } },
    { new: true, upsert: true },
  );
  return `AST-${String(counter.seq).padStart(4, "0")}`;
};

const assertProperty = async (companyId, propertyId) => {
  if (!isValidObjectId(propertyId)) throw createHttpError(400, "Invalid propertyId");
  const property = await CoworkingProperty.findOne({ _id: propertyId, companyId }).select("_id").lean();
  if (!property) throw createHttpError(400, "Property not found for this company");
};

const parseDateOrNull = (value, fieldName) => {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) throw createHttpError(400, `Invalid ${fieldName}`);
  return date;
};

const sanitizePayload = async (companyId, payload = {}, { partial = false } = {}) => {
  const safe = {};

  if (Object.prototype.hasOwnProperty.call(payload, "propertyId")) {
    const propertyId = String(payload.propertyId || "").trim();
    await assertProperty(companyId, propertyId);
    safe.propertyId = propertyId;
  }

  if (Object.prototype.hasOwnProperty.call(payload, "name")) {
    const name = String(payload.name || "").trim().slice(0, 160);
    if (!name && !partial) throw createHttpError(400, "name is required");
    safe.name = name;
  }

  if (Object.prototype.hasOwnProperty.call(payload, "category")) {
    const category = String(payload.category || "OTHER").trim().toUpperCase();
    if (!ASSET_CATEGORIES.includes(category)) throw createHttpError(400, "Invalid category");
    safe.category = category;
  }

  if (Object.prototype.hasOwnProperty.call(payload, "status")) {
    const status = String(payload.status || "ACTIVE").trim().toUpperCase();
    if (!ASSET_STATUSES.includes(status)) throw createHttpError(400, "Invalid status");
    safe.status = status;
  }

  if (Object.prototype.hasOwnProperty.call(payload, "quantity")) {
    const quantity = Number(payload.quantity);
    if (!Number.isInteger(quantity) || quantity < 1 || quantity > 100000) {
      throw createHttpError(400, "quantity must be a whole number between 1 and 100000");
    }
    safe.quantity = quantity;
  }

  if (Object.prototype.hasOwnProperty.call(payload, "locationLabel")) {
    safe.locationLabel = String(payload.locationLabel || "").trim().slice(0, 160);
  }

  if (Object.prototype.hasOwnProperty.call(payload, "assignedToName")) {
    safe.assignedToName = String(payload.assignedToName || "").trim().slice(0, 120);
  }

  if (Object.prototype.hasOwnProperty.call(payload, "vendor")) {
    safe.vendor = String(payload.vendor || "").trim().slice(0, 160);
  }

  if (Object.prototype.hasOwnProperty.call(payload, "purchaseDate")) {
    safe.purchaseDate = parseDateOrNull(payload.purchaseDate, "purchaseDate");
  }

  if (Object.prototype.hasOwnProperty.call(payload, "purchaseValue")) {
    const purchaseValue = Number(payload.purchaseValue);
    if (!Number.isFinite(purchaseValue) || purchaseValue < 0) {
      throw createHttpError(400, "purchaseValue must be a non-negative number");
    }
    safe.purchaseValue = purchaseValue;
  }

  if (Object.prototype.hasOwnProperty.call(payload, "warrantyExpiry")) {
    safe.warrantyExpiry = parseDateOrNull(payload.warrantyExpiry, "warrantyExpiry");
  }

  if (Object.prototype.hasOwnProperty.call(payload, "lastServiceDate")) {
    safe.lastServiceDate = parseDateOrNull(payload.lastServiceDate, "lastServiceDate");
  }

  if (Object.prototype.hasOwnProperty.call(payload, "nextServiceDate")) {
    safe.nextServiceDate = parseDateOrNull(payload.nextServiceDate, "nextServiceDate");
  }

  if (Object.prototype.hasOwnProperty.call(payload, "serialNumber")) {
    safe.serialNumber = String(payload.serialNumber || "").trim().slice(0, 120);
  }

  if (Object.prototype.hasOwnProperty.call(payload, "notes")) {
    safe.notes = String(payload.notes || "").trim().slice(0, 2000);
  }

  if (!partial) {
    if (!safe.propertyId) throw createHttpError(400, "propertyId is required");
    if (!safe.name) throw createHttpError(400, "name is required");
  }

  return safe;
};

const createAsset = async ({ companyId, actingUser, payload }) => {
  const safePayload = await sanitizePayload(companyId, payload);
  const assetCode = await generateAssetCode(companyId);
  const asset = await CoworkingAsset.create({
    ...safePayload,
    companyId,
    assetCode,
    createdBy: actingUser._id,
  });

  await writeAuditLog({
    companyId,
    actor: actingUser,
    action: "ASSET_CREATED",
    entityType: "CoworkingAsset",
    entityId: asset._id,
    metadata: { assetCode, category: asset.category, status: asset.status },
  });

  return asset;
};

const listAssets = async ({ companyId, query = {} }) => {
  const { page, limit, skip } = parsePagination(query, { defaultLimit: 25, maxLimit: 100 });
  const filter = { companyId };

  if (query.propertyId) {
    if (!isValidObjectId(query.propertyId)) throw createHttpError(400, "Invalid propertyId");
    filter.propertyId = query.propertyId;
  }
  if (query.status) {
    const status = String(query.status).trim().toUpperCase();
    if (!ASSET_STATUSES.includes(status)) throw createHttpError(400, "Invalid status filter");
    filter.status = status;
  }
  if (query.category) {
    const category = String(query.category).trim().toUpperCase();
    if (!ASSET_CATEGORIES.includes(category)) throw createHttpError(400, "Invalid category filter");
    filter.category = category;
  }
  if (query.search) {
    const search = String(query.search).trim();
    filter.$or = [
      { assetCode: { $regex: search, $options: "i" } },
      { name: { $regex: search, $options: "i" } },
      { serialNumber: { $regex: search, $options: "i" } },
      { vendor: { $regex: search, $options: "i" } },
      { locationLabel: { $regex: search, $options: "i" } },
    ];
  }

  const [rows, totalCount] = await Promise.all([
    CoworkingAsset.find(filter)
      .populate("propertyId", "name propertyCode")
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean(),
    CoworkingAsset.countDocuments(filter),
  ]);

  return { assets: rows, pagination: buildPaginationMeta({ page, limit, totalCount }) };
};

const getAssetDoc = async (companyId, assetId) => {
  if (!isValidObjectId(assetId)) throw createHttpError(400, "Invalid asset id");
  const asset = await CoworkingAsset.findOne({ _id: assetId, companyId });
  if (!asset) throw createHttpError(404, "Asset not found");
  return asset;
};

const updateAsset = async ({ companyId, assetId, actingUser, payload }) => {
  const asset = await getAssetDoc(companyId, assetId);
  const safePayload = await sanitizePayload(companyId, payload, { partial: true });
  if (Object.keys(safePayload).length === 0) throw createHttpError(400, "No valid fields to update");

  Object.assign(asset, safePayload, { updatedBy: actingUser._id });
  await asset.save();

  await writeAuditLog({
    companyId,
    actor: actingUser,
    action: "ASSET_UPDATED",
    entityType: "CoworkingAsset",
    entityId: asset._id,
    metadata: { changes: safePayload },
  });

  return asset;
};

const setAssetStatus = (status, action) => async ({ companyId, assetId, actingUser }) => {
  const asset = await getAssetDoc(companyId, assetId);
  asset.status = status;
  asset.updatedBy = actingUser._id;
  await asset.save();

  await writeAuditLog({
    companyId,
    actor: actingUser,
    action,
    entityType: "CoworkingAsset",
    entityId: asset._id,
    metadata: { assetCode: asset.assetCode, status },
  });

  return asset;
};

const deleteAsset = async ({ companyId, assetId, actingUser }) => {
  const asset = await getAssetDoc(companyId, assetId);
  await asset.deleteOne();

  await writeAuditLog({
    companyId,
    actor: actingUser,
    action: "ASSET_DELETED",
    entityType: "CoworkingAsset",
    entityId: assetId,
    metadata: { assetCode: asset.assetCode },
  });
};

module.exports = {
  createAsset,
  listAssets,
  updateAsset,
  markMaintenance: setAssetStatus("MAINTENANCE", "ASSET_MARKED_MAINTENANCE"),
  markActive: setAssetStatus("ACTIVE", "ASSET_MARKED_ACTIVE"),
  retireAsset: setAssetStatus("RETIRED", "ASSET_RETIRED"),
  markLost: setAssetStatus("LOST", "ASSET_MARKED_LOST"),
  deleteAsset,
};
