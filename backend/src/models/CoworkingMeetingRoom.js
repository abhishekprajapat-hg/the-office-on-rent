const mongoose = require("mongoose");

const MEETING_ROOM_STATUSES = ["AVAILABLE", "BOOKED", "MAINTENANCE", "INACTIVE"];

const coworkingMeetingRoomSchema = new mongoose.Schema(
  {
    companyId: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
      ref: "Company",
      index: true,
    },
    propertyId: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
      ref: "CoworkingProperty",
      index: true,
    },
    floorId: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
      ref: "CoworkingFloor",
      index: true,
    },
    roomCode: {
      type: String,
      required: true,
      trim: true,
    },
    name: {
      type: String,
      required: true,
      trim: true,
      maxlength: 120,
    },
    capacity: {
      type: Number,
      required: true,
      min: 1,
      max: 500,
    },
    hourlyRate: {
      type: Number,
      default: 0,
      min: 0,
    },
    status: {
      type: String,
      enum: MEETING_ROOM_STATUSES,
      default: "AVAILABLE",
    },
    amenities: {
      type: [String],
      default: [],
    },
    description: {
      type: String,
      trim: true,
      default: "",
      maxlength: 2000,
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    updatedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
  },
  { timestamps: true },
);

coworkingMeetingRoomSchema.index({ companyId: 1, roomCode: 1 }, { unique: true });
coworkingMeetingRoomSchema.index({ companyId: 1, propertyId: 1, floorId: 1 });
coworkingMeetingRoomSchema.index({ companyId: 1, status: 1 });

module.exports = mongoose.model("CoworkingMeetingRoom", coworkingMeetingRoomSchema);
module.exports.MEETING_ROOM_STATUSES = MEETING_ROOM_STATUSES;
