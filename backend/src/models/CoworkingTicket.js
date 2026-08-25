const mongoose = require("mongoose");

const TICKET_STATUSES = ["OPEN", "IN_PROGRESS", "RESOLVED", "CLOSED"];
const TICKET_PRIORITIES = ["LOW", "MEDIUM", "HIGH", "URGENT"];
const TICKET_CATEGORIES = ["MAINTENANCE", "HOUSEKEEPING", "IT", "BILLING", "ACCESS", "OTHER"];

const coworkingTicketSchema = new mongoose.Schema(
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
    clientId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "CoworkingClient",
      default: null,
      index: true,
    },
    ticketCode: {
      type: String,
      required: true,
      trim: true,
    },
    title: {
      type: String,
      required: true,
      trim: true,
      maxlength: 160,
    },
    description: {
      type: String,
      trim: true,
      default: "",
      maxlength: 4000,
    },
    category: {
      type: String,
      enum: TICKET_CATEGORIES,
      default: "OTHER",
    },
    priority: {
      type: String,
      enum: TICKET_PRIORITIES,
      default: "MEDIUM",
      index: true,
    },
    status: {
      type: String,
      enum: TICKET_STATUSES,
      default: "OPEN",
      index: true,
    },
    reportedByName: {
      type: String,
      trim: true,
      default: "",
      maxlength: 120,
    },
    assignedToName: {
      type: String,
      trim: true,
      default: "",
      maxlength: 120,
    },
    dueDate: {
      type: Date,
      default: null,
    },
    resolvedAt: {
      type: Date,
      default: null,
    },
    closedAt: {
      type: Date,
      default: null,
    },
    resolutionNotes: {
      type: String,
      trim: true,
      default: "",
      maxlength: 2000,
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
    createdByPortalUser: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "ClientPortalUser",
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

coworkingTicketSchema.index({ companyId: 1, ticketCode: 1 }, { unique: true });
coworkingTicketSchema.index({ companyId: 1, status: 1, priority: 1, createdAt: -1 });
coworkingTicketSchema.index({ companyId: 1, propertyId: 1, createdAt: -1 });

module.exports = mongoose.model("CoworkingTicket", coworkingTicketSchema);
module.exports.TICKET_STATUSES = TICKET_STATUSES;
module.exports.TICKET_PRIORITIES = TICKET_PRIORITIES;
module.exports.TICKET_CATEGORIES = TICKET_CATEGORIES;
