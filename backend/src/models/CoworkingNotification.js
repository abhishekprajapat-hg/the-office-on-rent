const mongoose = require("mongoose");

const NOTIFICATION_TYPES = ["BOOKING", "INVOICE", "CONTRACT", "PAYMENT", "TICKET", "VISITOR", "ASSET", "SYSTEM", "OTHER"];
const NOTIFICATION_PRIORITIES = ["LOW", "NORMAL", "HIGH", "URGENT"];
const NOTIFICATION_STATUSES = ["UNREAD", "READ", "ARCHIVED"];

const coworkingNotificationSchema = new mongoose.Schema(
  {
    companyId: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
      ref: "Company",
      index: true,
    },
    notificationCode: {
      type: String,
      required: true,
      trim: true,
    },
    type: {
      type: String,
      enum: NOTIFICATION_TYPES,
      default: "SYSTEM",
      index: true,
    },
    priority: {
      type: String,
      enum: NOTIFICATION_PRIORITIES,
      default: "NORMAL",
      index: true,
    },
    status: {
      type: String,
      enum: NOTIFICATION_STATUSES,
      default: "UNREAD",
      index: true,
    },
    title: {
      type: String,
      required: true,
      trim: true,
      maxlength: 160,
    },
    message: {
      type: String,
      trim: true,
      default: "",
      maxlength: 2000,
    },
    entityType: {
      type: String,
      trim: true,
      default: "",
      maxlength: 80,
    },
    entityId: {
      type: mongoose.Schema.Types.ObjectId,
      default: null,
    },
    actionUrl: {
      type: String,
      trim: true,
      default: "",
      maxlength: 300,
    },
    dueAt: {
      type: Date,
      default: null,
    },
    readAt: {
      type: Date,
      default: null,
    },
    archivedAt: {
      type: Date,
      default: null,
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
    updatedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
  },
  { timestamps: true },
);

coworkingNotificationSchema.index({ companyId: 1, notificationCode: 1 }, { unique: true });
coworkingNotificationSchema.index({ companyId: 1, status: 1, createdAt: -1 });
coworkingNotificationSchema.index({ companyId: 1, type: 1, createdAt: -1 });
coworkingNotificationSchema.index({ companyId: 1, priority: 1, status: 1 });

module.exports = mongoose.model("CoworkingNotification", coworkingNotificationSchema);
module.exports.NOTIFICATION_TYPES = NOTIFICATION_TYPES;
module.exports.NOTIFICATION_PRIORITIES = NOTIFICATION_PRIORITIES;
module.exports.NOTIFICATION_STATUSES = NOTIFICATION_STATUSES;
