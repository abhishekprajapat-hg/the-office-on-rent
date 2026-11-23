const axios = require("axios");
const CustomerMessage = require("../models/CustomerMessage");
const Lead = require("../models/Lead");
const User = require("../models/User");
const LeadActivity = require("../models/leadActivity.model");
const logger = require("../config/logger");
const { dashboardSecret, signBody, toWaId } = require("./whatsappDashboard.service");

// WhatsApp messages to customers go out through the company's WhatsApp app (one number, and every
// message shows in the customer's chat there). The CRM writes each one here first; the worker hands
// it over and retries while that app is unreachable. See docs/INTEGRATION.md in the WhatsApp app.

const TIMEOUT_MS = 10_000;
const LEASE_MS = 60_000;
const MAX_ATTEMPTS = 12;
const SITE_VISIT = "SITE_VISIT_SCHEDULED";
const IST_OFFSET_MS = 330 * 60 * 1000;
const HOUR_MS = 60 * 60 * 1000;
// A reminder whose time is this close (or past) is not scheduled.
const MIN_LEAD_MS = 5 * 60 * 1000;

const PURPOSE_LABELS = {
  enquiry_received: "enquiry acknowledgement",
  visit_confirmed: "site visit confirmation",
  visit_reminder: "site visit reminder",
  follow_up: "follow-up",
};
const label = (purpose) => PURPOSE_LABELS[purpose] || purpose;
const STATUS_ORDER = ["pending", "scheduled", "queued", "sent", "delivered", "read"];

const dashboardUrl = () => String(process.env.WHATSAPP_DASHBOARD_URL || "").trim().replace(/\/$/, "");
const isConfigured = () => Boolean(dashboardUrl() && dashboardSecret());

class DeskError extends Error {
  constructor(message, { status = 0, retryable = true } = {}) {
    super(message);
    this.status = status;
    this.retryable = retryable;
  }
}

/** A signed call to the WhatsApp app's integration API, as the caller "crm". */
const deskPost = async (path, payload) => {
  if (!isConfigured()) throw new DeskError("The WhatsApp app is not linked (WHATSAPP_DASHBOARD_URL / WHATSAPP_DASHBOARD_SECRET)", { retryable: false });
  const body = JSON.stringify(payload);
  const timestamp = String(Date.now());
  try {
    const response = await axios.post(`${dashboardUrl()}/integrations/v1${path}`, body, {
      headers: {
        "content-type": "application/json",
        "x-oor-caller": "crm",
        "x-oor-timestamp": timestamp,
        "x-oor-signature": signBody(dashboardSecret(), timestamp, body),
      },
      timeout: TIMEOUT_MS,
    });
    return response.data;
  } catch (error) {
    const status = error?.response?.status || 0;
    const detail = error?.response?.data?.message || error?.response?.data?.error || error?.message || "no details";
    throw new DeskError(`WhatsApp app: ${status ? `HTTP ${status} ` : ""}${String(detail).slice(0, 200)}`, { status, retryable: !status || status >= 500 || status === 429 });
  }
};

const activity = (leadId, action, performedBy = null) => LeadActivity.create({ lead: leadId, action: String(action).slice(0, 500), performedBy }).catch(() => null);

/** Hands one message to the WhatsApp app (if it is due and nobody else holds it). */
const processOne = async (id) => {
  const now = new Date();
  const row = await CustomerMessage.findOneAndUpdate(
    { _id: id, handedOff: false, cancelPending: false, nextTryAt: { $lte: now } },
    { $set: { nextTryAt: new Date(now.getTime() + LEASE_MS) }, $inc: { attempts: 1 } },
    { returnDocument: "after" },
  );
  if (!row) return false;
  try {
    const answer = await deskPost("/messages", {
      key: row.key,
      to: row.phone,
      purpose: row.purpose,
      variables: row.variables || {},
      ...(row.sendAt ? { sendAt: row.sendAt.toISOString() } : {}),
      ...(row.consent?.given ? { consent: { given: true, at: (row.consent.at || row.createdAt).toISOString(), source: row.consent.source || "" } } : {}),
      ref: { type: "lead", id: String(row.lead) },
    });
    const data = answer?.data || {};
    const status = STATUS_ORDER.includes(data.status) || ["failed", "cancelled", "skipped"].includes(data.status) ? data.status : "queued";
    await CustomerMessage.updateOne({ _id: row._id }, { $set: { handedOff: true, lastError: "", status, reason: String(data.reason || ""), statusAt: new Date() } });
    if (status === "skipped") await activity(row.lead, `WhatsApp ${label(row.purpose)} not sent: ${data.reason || "skipped"}`);
    return true;
  } catch (error) {
    const final = !error.retryable || row.attempts >= MAX_ATTEMPTS;
    const set = { lastError: String(error.message).slice(0, 300) };
    if (final) Object.assign(set, { handedOff: true, status: "failed", reason: set.lastError, statusAt: new Date() });
    else set.nextTryAt = new Date(Date.now() + Math.min(HOUR_MS, 30_000 * 2 ** Math.min(row.attempts, 7)));
    await CustomerMessage.updateOne({ _id: row._id }, { $set: set });
    if (final) await activity(row.lead, `WhatsApp ${label(row.purpose)} not sent: ${set.lastError}`);
    else logger.warn({ key: row.key, error: set.lastError, message: "WhatsApp message will be retried" });
    return false;
  }
};

/** Tells the WhatsApp app about cancellations it has not heard yet. */
const processCancels = async () => {
  const rows = await CustomerMessage.find({ cancelPending: true }).limit(100).lean();
  if (!rows.length) return;
  try {
    await deskPost("/messages/cancel", { keys: rows.map((row) => row.key) });
    await CustomerMessage.updateMany({ _id: { $in: rows.map((row) => row._id) } }, { $set: { cancelPending: false } });
    await CustomerMessage.updateMany({ _id: { $in: rows.map((row) => row._id) }, status: { $in: ["pending", "scheduled"] } }, { $set: { status: "cancelled", reason: "Cancelled", statusAt: new Date() } });
  } catch (error) {
    logger.warn({ error: error.message, message: "WhatsApp cancellations will be retried" });
  }
};

const kick = (id) => {
  setImmediate(() => processOne(id).catch((error) => logger.warn({ error: error.message, message: "WhatsApp hand-off failed" })));
};

/**
 * Asks for a WhatsApp message to a lead's customer. The same key twice is one message. Answers the row.
 * `consent` is the customer's agreement as the CRM knows it; the WhatsApp app checks it again.
 */
const queueMessage = async ({ lead, purpose, key, variables = {}, sendAt = null, requestedBy = null, now = new Date(), waitForHandOff = false }) => {
  if (!isConfigured()) return null;
  const phone = toWaId(lead.phone);
  if (!phone) return null;
  const consent = lead.whatsappConsent?.given ? { given: true, at: lead.whatsappConsent.at || now, source: lead.whatsappConsent.source || "" } : { given: false };
  let row;
  try {
    row = await CustomerMessage.create({
      companyId: lead.companyId,
      lead: lead._id,
      key,
      purpose,
      phone,
      variables,
      sendAt,
      consent,
      requestedBy,
      nextTryAt: now,
    });
  } catch (error) {
    if (error?.code === 11000) return CustomerMessage.findOne({ companyId: lead.companyId, key });
    throw error;
  }
  if (!waitForHandOff) {
    kick(row._id);
    return row;
  }
  await processOne(row._id);
  return CustomerMessage.findById(row._id);
};

/** Stops messages that have not gone yet (keys starting with `keyPrefix`). Answers how many. */
const cancelMessages = async ({ companyId, keyPrefix }) => {
  const prefix = `^${String(keyPrefix).replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`;
  const rows = await CustomerMessage.find({ companyId, key: { $regex: prefix }, status: { $in: ["pending", "scheduled"] } }).lean();
  if (!rows.length) return 0;
  const notYetHanded = rows.filter((row) => !row.handedOff).map((row) => row._id);
  const handed = rows.filter((row) => row.handedOff).map((row) => row._id);
  if (notYetHanded.length) await CustomerMessage.updateMany({ _id: { $in: notYetHanded } }, { $set: { handedOff: true, status: "cancelled", reason: "Cancelled", statusAt: new Date() } });
  if (handed.length) {
    await CustomerMessage.updateMany({ _id: { $in: handed } }, { $set: { cancelPending: true } });
    setImmediate(() => processCancels().catch(() => null));
  }
  return rows.length;
};

/** The WhatsApp app reports a message's progress. Only moves forward (or to failed). */
const applyStatus = async ({ companyId, key, status, reason = "", at = null }) => {
  const row = await CustomerMessage.findOne({ ...(companyId ? { companyId } : {}), key });
  if (!row) return { found: false };
  const known = ["pending", "scheduled", "queued", "sent", "delivered", "read", "failed", "cancelled", "skipped"];
  if (!known.includes(status)) return { found: true, changed: false };
  if (["sent", "delivered", "read", "queued", "scheduled"].includes(status)) {
    if (STATUS_ORDER.indexOf(status) <= STATUS_ORDER.indexOf(row.status) && STATUS_ORDER.includes(row.status)) return { found: true, changed: false };
  } else if (row.status === status || row.status === "read") return { found: true, changed: false };
  const when = at && !Number.isNaN(new Date(at).getTime()) ? new Date(at) : new Date();
  await CustomerMessage.updateOne({ _id: row._id }, { $set: { status, reason: String(reason || "").slice(0, 300), statusAt: when, handedOff: true } });
  if (status === "sent") await activity(row.lead, `WhatsApp ${label(row.purpose)} sent`);
  if (status === "failed" || status === "skipped") await activity(row.lead, `WhatsApp ${label(row.purpose)} not sent: ${reason || status}`);
  return { found: true, changed: true };
};

// ---- Site visits -------------------------------------------------------------------------------

const istParts = (date) => {
  const shifted = new Date(date.getTime() + IST_OFFSET_MS);
  return { year: shifted.getUTCFullYear(), month: shifted.getUTCMonth(), day: shifted.getUTCDate() };
};
const visitDate = (date) => date.toLocaleDateString("en-IN", { timeZone: "Asia/Kolkata", weekday: "short", day: "numeric", month: "short" });
const visitTime = (date) => date.toLocaleTimeString("en-IN", { timeZone: "Asia/Kolkata", hour: "numeric", minute: "2-digit", hour12: true }).toUpperCase();
/** 18:00 IST on the day before the visit. */
const eveningBefore = (visitAt) => {
  const { year, month, day } = istParts(visitAt);
  return new Date(Date.UTC(year, month, day - 1, 18, 0) - IST_OFFSET_MS);
};

/** May the CRM ask for WhatsApp messages to this lead's customer at all? */
const mayMessage = (lead) => Boolean(lead.whatsappConsent?.given || lead.whatsapp?.linkedAt);

/**
 * A lead moved to (or within) "Site visit scheduled" with a visit time: confirm it on WhatsApp now,
 * remind the evening before (18:00 IST) and 2 hours before. A moved or cancelled visit (a new time,
 * another status, the date cleared) stops the reminders not sent yet. Never throws.
 */
const syncSiteVisitMessages = async ({ lead, previousStatus, previousVisitAt, user = null, now = new Date() }) => {
  try {
    if (!isConfigured() || !lead) return;
    const visitAt = lead.status === SITE_VISIT && lead.nextFollowUp ? new Date(lead.nextFollowUp) : null;
    const before = previousStatus === SITE_VISIT && previousVisitAt ? new Date(previousVisitAt) : null;
    if (visitAt && before && visitAt.getTime() === before.getTime()) return;
    if (before) {
      const stopped = await cancelMessages({ companyId: lead.companyId, keyPrefix: `visit:${lead._id}:` });
      if (stopped) await activity(lead._id, `WhatsApp visit reminders cancelled (${visitAt ? "visit moved" : "visit no longer scheduled"})`, user?._id || null);
    }
    if (!visitAt || visitAt.getTime() <= now.getTime()) return;
    if (!mayMessage(lead)) {
      await activity(lead._id, "WhatsApp visit confirmation not sent: the customer has not agreed to WhatsApp messages (tick it on the lead page if they have)", user?._id || null);
      return;
    }
    const executive = lead.assignedTo ? await User.findById(lead.assignedTo).select("name phone").lean() : null;
    const variables = {
      name: lead.name || "",
      property: lead.projectInterested || lead.website?.property || "",
      date: visitDate(visitAt),
      time: visitTime(visitAt),
      executive: executive?.name || "",
      executive_phone: executive?.phone || "",
    };
    const base = `visit:${lead._id}:${visitAt.getTime()}`;
    await queueMessage({ lead, purpose: "visit_confirmed", key: `${base}:confirm`, variables, requestedBy: user?._id || null, now });
    const evening = eveningBefore(visitAt);
    const twoHours = new Date(visitAt.getTime() - 2 * HOUR_MS);
    if (evening.getTime() - now.getTime() > MIN_LEAD_MS && evening < twoHours) {
      await queueMessage({ lead, purpose: "visit_reminder", key: `${base}:eve`, variables, sendAt: evening, requestedBy: user?._id || null, now });
    }
    if (twoHours.getTime() - now.getTime() > MIN_LEAD_MS) {
      await queueMessage({ lead, purpose: "visit_reminder", key: `${base}:2h`, variables, sendAt: twoHours, requestedBy: user?._id || null, now });
    }
  } catch (error) {
    logger.warn({ leadId: String(lead?._id || ""), error: error.message, message: "Site visit WhatsApp messages failed" });
  }
};

// ---- Worker ------------------------------------------------------------------------------------

let running = false;
const sweep = async () => {
  if (running || !isConfigured()) return;
  running = true;
  try {
    const due = await CustomerMessage.find({ handedOff: false, cancelPending: false, nextTryAt: { $lte: new Date() } }).sort({ nextTryAt: 1 }).limit(50).select("_id").lean();
    for (const row of due) await processOne(row._id);
    await processCancels();
  } finally {
    running = false;
  }
};

let timer = null;
const startWorker = () => {
  if (timer || !isConfigured()) return null;
  timer = setInterval(() => sweep().catch((error) => logger.warn({ error: error.message, message: "WhatsApp message worker will retry" })), 30_000);
  timer.unref();
  return timer;
};
const stopWorker = () => {
  clearInterval(timer);
  timer = null;
};

module.exports = {
  PURPOSE_LABELS,
  DeskError,
  isConfigured,
  dashboardUrl,
  deskPost,
  queueMessage,
  cancelMessages,
  applyStatus,
  processOne,
  processCancels,
  syncSiteVisitMessages,
  eveningBefore,
  mayMessage,
  sweep,
  startWorker,
  stopWorker,
};
