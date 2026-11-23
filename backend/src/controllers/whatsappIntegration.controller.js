const mongoose = require("mongoose");
const Lead = require("../models/Lead");
const User = require("../models/User");
const Company = require("../models/Company");
const LeadActivity = require("../models/leadActivity.model");
const { autoAssignLead } = require("../services/leadAssignment.service");
const { findBrokerByPhone, recordBlockedLead } = require("../services/crmContact.service");
const {
  dashboardSecret,
  verifySignature,
  toWaId,
  phoneVariants,
  storedPhone,
} = require("../services/whatsappDashboard.service");
const logger = require("../config/logger");

const INVENTORY_TYPES = ["COMMERCIAL", "RESIDENTIAL", "COWORKING"];
const text = (value, max) => String(value || "").trim().slice(0, max);

/**
 * The company this WhatsApp number belongs to: WHATSAPP_COMPANY_ID, or the only active company.
 * With several companies and no setting, nothing is guessed.
 */
const resolveCompanyId = async () => {
  const configured = String(process.env.WHATSAPP_COMPANY_ID || "").trim();
  if (configured) return mongoose.isValidObjectId(configured) ? configured : null;
  const companies = await Company.find({ status: "ACTIVE" }).select("_id").limit(2).lean();
  return companies.length === 1 ? String(companies[0]._id) : null;
};

const assigneeOf = async (lead) => {
  if (!lead?.assignedTo) return null;
  const user = await User.findOne({ _id: lead.assignedTo, isActive: true }).select("_id name email").lean();
  return user ? { id: String(user._id), name: user.name, email: user.email } : null;
};

/**
 * A lead from the WhatsApp dashboard. The dashboard has already found the customer's department
 * (from the ad, their words or the button they tapped) and sends it as COMMERCIAL / RESIDENTIAL; the
 * lead is then assigned by the CRM's usual rules: the least loaded Inside Executive / Executive of
 * that type (or BOTH), under the 120 open-leads cap.
 *
 * A number that is already a lead is not duplicated: the chat is linked to it, an empty type is
 * filled in, and it keeps its owner (an unassigned lead, or one whose owner has left, is assigned now).
 * Answers { leadId, created, assignee: { name, email } | null }; the dashboard gives the chat to the
 * user with the same e-mail.
 */
exports.upsertWhatsAppLead = async (req, res) => {
  const raw = Buffer.isBuffer(req.body) ? req.body.toString("utf8") : "";
  const secret = dashboardSecret();
  if (!secret) return res.status(503).json({ message: "WhatsApp integration is not set up (WHATSAPP_DASHBOARD_SECRET)" });
  if (!verifySignature(secret, req.get("x-oor-timestamp"), raw, req.get("x-oor-signature"))) {
    logger.warn({ ip: req.ip, message: "WhatsApp lead refused: bad signature" });
    return res.status(401).json({ message: "Bad signature" });
  }

  let body;
  try {
    body = JSON.parse(raw);
  } catch (_error) {
    return res.status(400).json({ message: "Body must be JSON" });
  }

  const waId = toWaId(body?.phone);
  if (!waId) return res.status(400).json({ message: "phone must be a WhatsApp number with country code" });
  const department = String(body?.department || "").trim().toUpperCase();
  const inventoryType = INVENTORY_TYPES.includes(department) ? department : "";
  const ad = body?.ad && typeof body.ad === "object" ? body.ad : null;
  const whatsapp = {
    chatId: text(body?.chatId, 40),
    linkedAt: new Date(),
    adId: text(ad?.id, 40),
    adHeadline: text(ad?.headline, 200),
    adUrl: text(ad?.url, 500),
    firstMessage: text(body?.firstMessage, 1000),
    websitePage: text(body?.website?.page, 200),
    websiteProperty: text(body?.website?.property, 160),
  };

  try {
    const companyId = await resolveCompanyId();
    if (!companyId) {
      return res.status(503).json({ message: "Set WHATSAPP_COMPANY_ID: the CRM has more than one company (or none active)" });
    }

    let lead = await Lead.findOne({ companyId, phone: { $in: phoneVariants(waId) } }).sort({ createdAt: -1 });
    let created = false;

    if (lead) {
      const changes = [];
      if (!lead.whatsapp?.linkedAt) changes.push("linked to WhatsApp chat");
      lead.whatsapp = { ...whatsapp, linkedAt: lead.whatsapp?.linkedAt || whatsapp.linkedAt };
      if (inventoryType && !lead.requirements?.inventoryType) {
        lead.set("requirements.inventoryType", inventoryType);
        changes.push(`type set to ${inventoryType}`);
      }
      if (whatsapp.websiteProperty && !lead.projectInterested) {
        lead.projectInterested = whatsapp.websiteProperty;
        changes.push(`property "${whatsapp.websiteProperty}" from the website`);
      }
      await lead.save();
      if (changes.length) {
        await LeadActivity.create({ lead: lead._id, action: `WhatsApp: ${changes.join(", ")}`, performedBy: null });
      }
    } else {
      // A number in the Broker Database is a broker, not an enquiry: refused as Meta-form and typed-in
      // leads are, and counted against the broker. The chat stays in the WhatsApp inbox.
      const broker = await findBrokerByPhone(companyId, waId);
      if (broker) {
        await recordBlockedLead(broker._id, { name: text(body?.name, 120), phone: storedPhone(waId), origin: "WHATSAPP" });
        logger.info({ companyId, brokerId: broker._id, brokerName: broker.name, message: "WhatsApp lead blocked: number belongs to a broker" });
        return res.status(200).json({ leadId: null, created: false, brokerBlocked: true, brokerName: broker.name, assignee: null });
      }
      lead = await Lead.create({
        name: text(body?.name, 120) || "WhatsApp lead",
        phone: storedPhone(waId),
        companyId,
        projectInterested: whatsapp.websiteProperty || whatsapp.adHeadline,
        requirements: { inventoryType },
        whatsapp,
        source: "WHATSAPP",
        status: "NEW",
        assignedTo: null,
        createdBy: null,
      });
      created = true;
      await LeadActivity.create({
        lead: lead._id,
        action: `Lead created from WhatsApp${body?.departmentName ? ` (${text(body.departmentName, 60)})` : ""}${whatsapp.adHeadline ? ` - ad "${whatsapp.adHeadline}"` : ""}${whatsapp.websitePage ? ` - the website's WhatsApp button on ${whatsapp.websitePage}${whatsapp.websiteProperty ? ` (${whatsapp.websiteProperty})` : ""}` : ""}`,
        performedBy: null,
      });
    }

    let assignee = await assigneeOf(lead);
    let assignment = null;
    if (!assignee) {
      assignment = await autoAssignLead({ lead, requester: { companyId } });
      if (assignment.assigned) {
        assignee = { id: String(assignment.executive._id), name: assignment.executive.name, email: "" };
        const user = await User.findById(assignment.executive._id).select("email").lean();
        assignee.email = user?.email || "";
      }
    }

    logger.info({
      companyId,
      leadId: String(lead._id),
      created,
      inventoryType: lead.requirements?.inventoryType || "",
      assigned: Boolean(assignee),
      mode: assignment?.mode || (assignee ? "EXISTING_OWNER" : null),
      reason: assignment && !assignment.assigned ? assignment.reason : null,
      message: "WhatsApp lead received",
    });

    return res.status(created ? 201 : 200).json({
      leadId: String(lead._id),
      created,
      assignee: assignee ? { name: assignee.name, email: assignee.email } : null,
      unassignedReason: assignee ? null : assignment?.reason || "NOT_ASSIGNED",
    });
  } catch (error) {
    logger.error({ error: error.message, message: "WhatsApp lead failed" });
    return res.status(500).json({ message: "Server error" });
  }
};

// ---- Events from the WhatsApp app ---------------------------------------------------------------

const leadTouch = require("../services/leadTouch.service");
const customerMessages = require("../services/customerMessages.service");

/** Checks the WhatsApp app's signature and reads the JSON body; answers the error itself when it fails. */
const readSigned = (req, res) => {
  const raw = Buffer.isBuffer(req.body) ? req.body.toString("utf8") : "";
  const secret = dashboardSecret();
  if (!secret) {
    res.status(503).json({ message: "WhatsApp integration is not set up (WHATSAPP_DASHBOARD_SECRET)" });
    return null;
  }
  if (!verifySignature(secret, req.get("x-oor-timestamp"), raw, req.get("x-oor-signature"))) {
    logger.warn({ ip: req.ip, path: req.path, message: "WhatsApp call refused: bad signature" });
    res.status(401).json({ message: "Bad signature" });
    return null;
  }
  try {
    const body = JSON.parse(raw);
    if (!body || typeof body !== "object") throw new Error("not an object");
    return body;
  } catch (_error) {
    res.status(400).json({ message: "Body must be JSON" });
    return null;
  }
};

const minutesText = (minutes) => {
  const value = Math.max(0, Math.round(Number(minutes) || 0));
  if (value < 60) return `${value} min`;
  const hours = Math.floor(value / 60);
  return value % 60 ? `${hours} h ${value % 60} min` : `${hours} h`;
};

/**
 * What happens in a customer's WhatsApp chat, for the lead's history:
 * - customer.message: the customer wrote after a quiet spell (6 hours), or for the first time;
 * - agent.reply: the first reply by a person after the customer's message. It is a verified WhatsApp
 *   touch for that person (matched by e-mail), so the lead's touch time counts it;
 * - chat.closed: someone closed the chat in the WhatsApp app.
 * A number that is no lead (a broker, or not sent to the CRM) is answered { ignored } with 200.
 */
exports.receiveChatEvent = async (req, res) => {
  const body = readSigned(req, res);
  if (!body) return undefined;
  const type = String(body.type || "");
  if (!["customer.message", "agent.reply", "chat.closed"].includes(type)) return res.status(400).json({ message: "Unknown event type" });
  const waId = toWaId(body.phone);
  if (!waId) return res.status(400).json({ message: "phone must be a WhatsApp number with country code" });
  const at = body.at && !Number.isNaN(new Date(body.at).getTime()) ? new Date(body.at) : new Date();

  try {
    const companyId = await resolveCompanyId();
    if (!companyId) return res.status(503).json({ message: "Set WHATSAPP_COMPANY_ID: the CRM has more than one company (or none active)" });
    const lead = await Lead.findOne({ companyId, phone: { $in: phoneVariants(waId) } }).sort({ createdAt: -1 });
    if (!lead) return res.status(200).json({ ignored: "no_lead" });

    const email = String(body.by?.email || "").trim().toLowerCase();
    const person = email ? await User.findOne({ companyId, email, isActive: true }).select("_id name email") : null;
    const byName = person?.name || text(body.by?.name, 80);
    const preview = text(body.preview, 160);

    if (type === "customer.message") {
      await LeadActivity.create({
        lead: lead._id,
        action: `WhatsApp: ${body.firstEver ? "the customer's first message" : "the customer wrote again"}${preview ? ` - "${preview}"` : ""}`,
        performedBy: null,
      });
      return res.status(200).json({ ok: true, leadId: String(lead._id) });
    }

    if (type === "chat.closed") {
      await LeadActivity.create({ lead: lead._id, action: `WhatsApp chat closed${byName ? ` by ${byName}` : ""}`, performedBy: person?._id || null });
      return res.status(200).json({ ok: true, leadId: String(lead._id) });
    }

    // agent.reply
    const after = Number.isFinite(Number(body.responseMinutes)) ? ` (${minutesText(body.responseMinutes)} after the customer wrote)` : "";
    if (person) {
      await leadTouch.recordTouch({ lead, user: person, channel: "WHATSAPP", source: "SYSTEM", at: at > new Date() ? new Date() : at, note: `replied on WhatsApp${after}` });
    } else {
      await LeadActivity.create({ lead: lead._id, action: `WhatsApp reply${byName ? ` by ${byName}` : ""}${after} (not a CRM user, so no touch recorded)`, performedBy: null });
    }
    return res.status(200).json({ ok: true, leadId: String(lead._id), touch: Boolean(person) });
  } catch (error) {
    if (error instanceof leadTouch.TouchError) return res.status(200).json({ ignored: error.message });
    logger.error({ error: error.message, type, message: "WhatsApp chat event failed" });
    return res.status(500).json({ message: "Server error" });
  }
};

/** The WhatsApp app reports how a message the CRM asked for went (sent, delivered, read, failed, skipped). */
exports.receiveMessageStatus = async (req, res) => {
  const body = readSigned(req, res);
  if (!body) return undefined;
  const key = text(body.key, 120);
  if (!key) return res.status(400).json({ message: "key is required" });
  try {
    const companyId = await resolveCompanyId();
    const result = await customerMessages.applyStatus({ companyId, key, status: String(body.status || ""), reason: text(body.reason, 300), at: body.at });
    return res.status(200).json({ ok: true, ...result });
  } catch (error) {
    logger.error({ error: error.message, key, message: "WhatsApp message status failed" });
    return res.status(500).json({ message: "Server error" });
  }
};
