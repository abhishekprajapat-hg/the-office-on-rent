const CoworkingSetting = require("../models/CoworkingSetting");
const { createHttpError } = require("../utils/httpError");
const { writeAuditLog } = require("./auditLog.service");

const DEFAULT_SETTINGS = Object.freeze({
  timezone: "Asia/Kolkata",
  currency: "INR",
  invoicePrefix: "INV",
  paymentPrefix: "PAY",
  billingDueDay: 5,
  taxPercent: 18,
  bookingApprovalRequired: false,
  visitorPassRequired: true,
  defaultMeetingRoomBufferMinutes: 15,
  contractRenewalReminderDays: 30,
  maintenanceReminderDays: 7,
  autoCloseResolvedTicketsDays: 3,
  supportEmail: "",
  termsText: "",
});

const numberField = (payload, fieldName, min, max) => {
  const value = Number(payload[fieldName]);
  if (!Number.isFinite(value) || value < min || value > max) {
    throw createHttpError(400, `${fieldName} must be between ${min} and ${max}`);
  }
  return value;
};

const sanitizePrefix = (value, fieldName) => {
  const prefix = String(value || "").trim().toUpperCase().replace(/[^A-Z0-9_-]/g, "").slice(0, 12);
  if (!prefix) throw createHttpError(400, `${fieldName} is required`);
  return prefix;
};

const sanitizePayload = (payload = {}) => {
  const safe = {};

  if (Object.prototype.hasOwnProperty.call(payload, "timezone")) {
    const timezone = String(payload.timezone || "").trim().slice(0, 80);
    if (!timezone) throw createHttpError(400, "timezone is required");
    safe.timezone = timezone;
  }

  if (Object.prototype.hasOwnProperty.call(payload, "currency")) {
    const currency = String(payload.currency || "").trim().toUpperCase().replace(/[^A-Z]/g, "").slice(0, 8);
    if (currency.length < 3) throw createHttpError(400, "currency must be a valid currency code");
    safe.currency = currency;
  }

  if (Object.prototype.hasOwnProperty.call(payload, "invoicePrefix")) {
    safe.invoicePrefix = sanitizePrefix(payload.invoicePrefix, "invoicePrefix");
  }

  if (Object.prototype.hasOwnProperty.call(payload, "paymentPrefix")) {
    safe.paymentPrefix = sanitizePrefix(payload.paymentPrefix, "paymentPrefix");
  }

  if (Object.prototype.hasOwnProperty.call(payload, "billingDueDay")) {
    safe.billingDueDay = numberField(payload, "billingDueDay", 1, 28);
  }

  if (Object.prototype.hasOwnProperty.call(payload, "taxPercent")) {
    safe.taxPercent = numberField(payload, "taxPercent", 0, 100);
  }

  if (Object.prototype.hasOwnProperty.call(payload, "defaultMeetingRoomBufferMinutes")) {
    safe.defaultMeetingRoomBufferMinutes = numberField(payload, "defaultMeetingRoomBufferMinutes", 0, 240);
  }

  if (Object.prototype.hasOwnProperty.call(payload, "contractRenewalReminderDays")) {
    safe.contractRenewalReminderDays = numberField(payload, "contractRenewalReminderDays", 0, 365);
  }

  if (Object.prototype.hasOwnProperty.call(payload, "maintenanceReminderDays")) {
    safe.maintenanceReminderDays = numberField(payload, "maintenanceReminderDays", 0, 365);
  }

  if (Object.prototype.hasOwnProperty.call(payload, "autoCloseResolvedTicketsDays")) {
    safe.autoCloseResolvedTicketsDays = numberField(payload, "autoCloseResolvedTicketsDays", 0, 90);
  }

  if (Object.prototype.hasOwnProperty.call(payload, "bookingApprovalRequired")) {
    safe.bookingApprovalRequired = Boolean(payload.bookingApprovalRequired);
  }

  if (Object.prototype.hasOwnProperty.call(payload, "visitorPassRequired")) {
    safe.visitorPassRequired = Boolean(payload.visitorPassRequired);
  }

  if (Object.prototype.hasOwnProperty.call(payload, "supportEmail")) {
    const supportEmail = String(payload.supportEmail || "").trim().toLowerCase().slice(0, 160);
    if (supportEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(supportEmail)) {
      throw createHttpError(400, "supportEmail must be a valid email");
    }
    safe.supportEmail = supportEmail;
  }

  if (Object.prototype.hasOwnProperty.call(payload, "termsText")) {
    safe.termsText = String(payload.termsText || "").trim().slice(0, 3000);
  }

  return safe;
};

const getSettings = async (companyId) => {
  const settings = await CoworkingSetting.findOneAndUpdate(
    { companyId },
    { $setOnInsert: { companyId, ...DEFAULT_SETTINGS } },
    { new: true, upsert: true },
  ).lean();

  return { ...DEFAULT_SETTINGS, ...settings };
};

const updateSettings = async ({ companyId, actingUser, payload }) => {
  const safePayload = sanitizePayload(payload);
  if (Object.keys(safePayload).length === 0) throw createHttpError(400, "No valid settings to update");

  const settings = await CoworkingSetting.findOneAndUpdate(
    { companyId },
    {
      $set: {
        ...safePayload,
        updatedBy: actingUser._id,
      },
      $setOnInsert: {
        companyId,
        ...DEFAULT_SETTINGS,
      },
    },
    { new: true, upsert: true },
  ).lean();

  await writeAuditLog({
    companyId,
    actor: actingUser,
    action: "COWORKING_SETTINGS_UPDATED",
    entityType: "CoworkingSetting",
    entityId: settings._id,
    metadata: { changes: safePayload },
  });

  return { ...DEFAULT_SETTINGS, ...settings };
};

module.exports = {
  DEFAULT_SETTINGS,
  getSettings,
  updateSettings,
};
