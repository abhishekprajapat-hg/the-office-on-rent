const crypto = require("crypto");
const axios = require("axios");
const logger = require("../config/logger");

// The company's WhatsApp dashboard (a separate app on the company's own server). Both sides sign their
// requests the same way: HMAC-SHA256 of "<timestamp>.<raw body>" with the shared secret, in hex, sent
// as x-oor-timestamp / x-oor-signature. A request older than five minutes is refused (replays).
const MAX_SKEW_MS = 5 * 60 * 1000;
const NOTIFY_TIMEOUT_MS = 10_000;

const dashboardSecret = () => String(process.env.WHATSAPP_DASHBOARD_SECRET || "").trim();
const dashboardUrl = () => String(process.env.WHATSAPP_DASHBOARD_URL || "").trim().replace(/\/$/, "");

const signBody = (secret, timestamp, body) =>
  crypto.createHmac("sha256", secret).update(`${timestamp}.${body}`).digest("hex");

const verifySignature = (secret, timestamp, body, signature, now = Date.now()) => {
  if (!secret || !timestamp || !signature) return false;
  const at = Number(timestamp);
  if (!Number.isFinite(at) || Math.abs(now - at) > MAX_SKEW_MS) return false;
  const expected = Buffer.from(signBody(secret, String(timestamp), body), "hex");
  const given = Buffer.from(String(signature), "hex");
  return expected.length === given.length && crypto.timingSafeEqual(expected, given);
};

/** WhatsApp's id for a number: digits with country code; a 10-digit Indian mobile gets 91. */
const toWaId = (value) => {
  let digits = String(value || "").replace(/\D/g, "");
  if (digits.length === 11 && digits.startsWith("0")) digits = digits.slice(1);
  if (digits.length === 10 && /^[6-9]/.test(digits)) digits = `91${digits}`;
  return /^\d{11,15}$/.test(digits) ? digits : "";
};

/** The ways the same number may already be saved on a lead (typed by hand or from a Meta form). */
const phoneVariants = (waId) => {
  const variants = new Set([waId, `+${waId}`]);
  if (waId.startsWith("91") && waId.length === 12) {
    const local = waId.slice(2);
    variants.add(local);
    variants.add(`0${local}`);
    variants.add(`+91 ${local}`);
    variants.add(`91 ${local}`);
  }
  return [...variants];
};

/** How a new WhatsApp lead's phone is saved: the 10 digits for Indian numbers (as the team types them). */
const storedPhone = (waId) => (waId.startsWith("91") && waId.length === 12 ? waId.slice(2) : waId);

/**
 * Tells the WhatsApp dashboard that a lead it sent has a new owner, so the chat follows the lead.
 * Only for leads linked to a WhatsApp chat; never throws (a missed notice leaves the chat with its
 * previous person, and the dashboard's own "send to CRM" brings it back in line).
 */
const notifyLeadAssigned = async ({ lead, assignee }) => {
  const url = dashboardUrl();
  const secret = dashboardSecret();
  if (!url || !secret || !lead?.whatsapp?.linkedAt) return { sent: false, reason: "not_linked" };
  const phone = toWaId(lead.phone);
  if (!phone) return { sent: false, reason: "bad_phone" };

  const body = JSON.stringify({
    type: "lead.assigned",
    phone,
    leadId: String(lead._id),
    assignee: assignee ? { email: String(assignee.email || ""), name: String(assignee.name || "") } : null,
  });
  const timestamp = String(Date.now());
  try {
    await axios.post(`${url}/webhooks/crm`, body, {
      headers: {
        "content-type": "application/json",
        "x-oor-timestamp": timestamp,
        "x-oor-signature": signBody(secret, timestamp, body),
      },
      timeout: NOTIFY_TIMEOUT_MS,
    });
    return { sent: true };
  } catch (error) {
    logger.warn({
      leadId: String(lead._id),
      status: error?.response?.status || 0,
      error: error?.message,
      message: "WhatsApp dashboard was not told about a lead reassignment",
    });
    return { sent: false, reason: "failed" };
  }
};

module.exports = {
  MAX_SKEW_MS,
  dashboardSecret,
  signBody,
  verifySignature,
  toWaId,
  phoneVariants,
  storedPhone,
  notifyLeadAssigned,
};
