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
        projectInterested: whatsapp.adHeadline,
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
        action: `Lead created from WhatsApp${body?.departmentName ? ` (${text(body.departmentName, 60)})` : ""}${whatsapp.adHeadline ? ` - ad "${whatsapp.adHeadline}"` : ""}`,
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
