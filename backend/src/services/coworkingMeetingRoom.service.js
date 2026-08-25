const mongoose = require("mongoose");
const CoworkingFloor = require("../models/CoworkingFloor");
const CoworkingIdCounter = require("../models/CoworkingIdCounter");
const CoworkingMeetingRoom = require("../models/CoworkingMeetingRoom");
const { MEETING_ROOM_STATUSES } = require("../models/CoworkingMeetingRoom");
const { createHttpError } = require("../utils/httpError");
const { parsePagination, buildPaginationMeta } = require("../utils/queryOptions");
const { writeAuditLog } = require("./auditLog.service");

const isValidObjectId = (value) => mongoose.Types.ObjectId.isValid(value);

const generateMeetingRoomCode = async (companyId) => {
  const counter = await CoworkingIdCounter.findOneAndUpdate(
    { companyId, category: "MEETING_ROOM" },
    { $inc: { seq: 1 } },
    { new: true, upsert: true },
  );
  return `MR-${String(counter.seq).padStart(3, "0")}`;
};

const sanitizeAmenities = (amenities) => {
  if (!Array.isArray(amenities)) return [];
  return [...new Set(amenities.map((item) => String(item || "").trim()).filter(Boolean))].slice(0, 20);
};

const sanitizePayload = async (companyId, payload = {}, { partial = false } = {}) => {
  const safe = {};

  if (Object.prototype.hasOwnProperty.call(payload, "propertyId")) {
    const propertyId = String(payload.propertyId || "").trim();
    if (!isValidObjectId(propertyId)) throw createHttpError(400, "Invalid propertyId");
    safe.propertyId = propertyId;
  }

  if (Object.prototype.hasOwnProperty.call(payload, "floorId")) {
    const floorId = String(payload.floorId || "").trim();
    if (!isValidObjectId(floorId)) throw createHttpError(400, "Invalid floorId");
    safe.floorId = floorId;
  }

  if (Object.prototype.hasOwnProperty.call(payload, "name")) {
    const name = String(payload.name || "").trim().slice(0, 120);
    if (!name && !partial) throw createHttpError(400, "name is required");
    safe.name = name;
  }

  if (Object.prototype.hasOwnProperty.call(payload, "capacity")) {
    const capacity = Number(payload.capacity);
    if (!Number.isInteger(capacity) || capacity < 1 || capacity > 500) {
      throw createHttpError(400, "capacity must be a whole number between 1 and 500");
    }
    safe.capacity = capacity;
  }

  if (Object.prototype.hasOwnProperty.call(payload, "hourlyRate")) {
    const hourlyRate = Number(payload.hourlyRate);
    if (!Number.isFinite(hourlyRate) || hourlyRate < 0) {
      throw createHttpError(400, "hourlyRate must be a non-negative number");
    }
    safe.hourlyRate = hourlyRate;
  }

  if (Object.prototype.hasOwnProperty.call(payload, "status")) {
    const status = String(payload.status || "").trim().toUpperCase();
    if (!MEETING_ROOM_STATUSES.includes(status)) throw createHttpError(400, "Invalid status");
    safe.status = status;
  }

  if (Object.prototype.hasOwnProperty.call(payload, "amenities")) {
    safe.amenities = sanitizeAmenities(payload.amenities);
  }

  if (Object.prototype.hasOwnProperty.call(payload, "description")) {
    safe.description = String(payload.description || "").trim().slice(0, 2000);
  }

  if (!partial) {
    if (!safe.propertyId) throw createHttpError(400, "propertyId is required");
    if (!safe.floorId) throw createHttpError(400, "floorId is required");
    if (!safe.name) throw createHttpError(400, "name is required");
    if (!safe.capacity) throw createHttpError(400, "capacity is required");
  }

  if (safe.floorId || safe.propertyId) {
    const floorId = safe.floorId || payload.currentFloorId;
    const propertyId = safe.propertyId || payload.currentPropertyId;
    const floor = await CoworkingFloor.findOne({ _id: floorId, companyId }).select("propertyId").lean();
    if (!floor) throw createHttpError(400, "Floor not found for this company");
    if (String(floor.propertyId) !== String(propertyId)) {
      throw createHttpError(400, "floorId does not belong to the given propertyId");
    }
  }

  return safe;
};

const createMeetingRoom = async ({ companyId, actingUser, payload }) => {
  const safePayload = await sanitizePayload(companyId, payload);
  const roomCode = await generateMeetingRoomCode(companyId);

  const meetingRoom = await CoworkingMeetingRoom.create({
    ...safePayload,
    companyId,
    roomCode,
    createdBy: actingUser._id,
  });

  await writeAuditLog({
    companyId,
    actor: actingUser,
    action: "MEETING_ROOM_CREATED",
    entityType: "CoworkingMeetingRoom",
    entityId: meetingRoom._id,
    metadata: { roomCode, propertyId: safePayload.propertyId, floorId: safePayload.floorId },
  });

  return meetingRoom;
};

const listMeetingRooms = async ({ companyId, query = {} }) => {
  const { page, limit, skip } = parsePagination(query, { defaultLimit: 25, maxLimit: 100 });
  const filter = { companyId };

  if (query.propertyId) {
    if (!isValidObjectId(query.propertyId)) throw createHttpError(400, "Invalid propertyId");
    filter.propertyId = query.propertyId;
  }
  if (query.floorId) {
    if (!isValidObjectId(query.floorId)) throw createHttpError(400, "Invalid floorId");
    filter.floorId = query.floorId;
  }
  if (query.status) {
    const status = String(query.status).trim().toUpperCase();
    if (!MEETING_ROOM_STATUSES.includes(status)) throw createHttpError(400, "Invalid status filter");
    filter.status = status;
  }
  if (query.search) {
    const search = String(query.search).trim();
    filter.$or = [
      { roomCode: { $regex: search, $options: "i" } },
      { name: { $regex: search, $options: "i" } },
    ];
  }

  const [rows, totalCount] = await Promise.all([
    CoworkingMeetingRoom.find(filter)
      .populate("propertyId", "name propertyCode")
      .populate("floorId", "floorNumber name")
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean(),
    CoworkingMeetingRoom.countDocuments(filter),
  ]);

  return { meetingRooms: rows, pagination: buildPaginationMeta({ page, limit, totalCount }) };
};

const getMeetingRoomDoc = async (companyId, meetingRoomId) => {
  if (!isValidObjectId(meetingRoomId)) throw createHttpError(400, "Invalid meeting room id");
  const meetingRoom = await CoworkingMeetingRoom.findOne({ _id: meetingRoomId, companyId });
  if (!meetingRoom) throw createHttpError(404, "Meeting room not found");
  return meetingRoom;
};

const updateMeetingRoom = async ({ companyId, meetingRoomId, actingUser, payload }) => {
  const meetingRoom = await getMeetingRoomDoc(companyId, meetingRoomId);
  const safePayload = await sanitizePayload(
    companyId,
    {
      ...payload,
      currentPropertyId: meetingRoom.propertyId,
      currentFloorId: meetingRoom.floorId,
    },
    { partial: true },
  );

  if (Object.keys(safePayload).length === 0) {
    throw createHttpError(400, "No valid fields to update");
  }

  Object.assign(meetingRoom, safePayload, { updatedBy: actingUser._id });
  await meetingRoom.save();

  await writeAuditLog({
    companyId,
    actor: actingUser,
    action: "MEETING_ROOM_UPDATED",
    entityType: "CoworkingMeetingRoom",
    entityId: meetingRoom._id,
    metadata: { changes: safePayload },
  });

  return meetingRoom;
};

const deleteMeetingRoom = async ({ companyId, meetingRoomId, actingUser }) => {
  const meetingRoom = await getMeetingRoomDoc(companyId, meetingRoomId);
  await meetingRoom.deleteOne();

  await writeAuditLog({
    companyId,
    actor: actingUser,
    action: "MEETING_ROOM_DELETED",
    entityType: "CoworkingMeetingRoom",
    entityId: meetingRoomId,
    metadata: { roomCode: meetingRoom.roomCode },
  });
};

module.exports = {
  createMeetingRoom,
  listMeetingRooms,
  updateMeetingRoom,
  deleteMeetingRoom,
};
