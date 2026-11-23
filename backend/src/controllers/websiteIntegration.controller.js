const mongoose = require("mongoose");
const Lead = require("../models/Lead");
const User = require("../models/User");
const Company = require("../models/Company");
const LeadActivity = require("../models/leadActivity.model");
const { autoAssignLead } = require("../services/leadAssignment.service");
const { findBrokerByPhone, recordBlockedLead } = require("../services/crmContact.service");
const { verifySignature, toWaId, phoneVariants, storedPhone } = require("../services/whatsappDashboard.service");
const logger = require("../config/logger");

// The company's website (its own app on the company's server) sends every enquiry form here,
// signed like the WhatsApp dashboard: HMAC-SHA256 of "<timestamp>.<raw body>" with
// WEBSITE_LEADS_SECRET, as x-oor-timestamp / x-oor-signature.
const INVENTORY_TYPES = ["COMMERCIAL", "RESIDENTIAL", "COWORKING"];
const KEEP_ENQUIRY_IDS = 25;
const text = (value, max) => String(value || "").trim().slice(0, max);
const websiteSecret = () => String(process.env.WEBSITE_LEADS_SECRET || "").trim();

/** WEBSITE_COMPANY_ID, else WHATSAPP_COMPANY_ID, else the only active company. Nothing is guessed. */
const resolveCompanyId = async () => {
  const configured = String(process.env.WEBSITE_COMPANY_ID || process.env.WHATSAPP_COMPANY_ID || "").trim();
  if (configured) return mongoose.isValidObjectId(configured) ? configured : null;
  const companies = await Company.find({ status: "ACTIVE" }).select("_id").limit(2).lean();
  return companies.length === 1 ? String(companies[0]._id) : null;
};

const cleanEmail = (value) => {
  const email = text(value, 160).toLowerCase();
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? email : "";
};

/** The enquiry as one line for the lead's activity, so the team reads it without opening anything. */
const describe = (enquiry) =>
  [
    enquiry.property && `Property: ${enquiry.property}`,
    enquiry.workspaceType && `Looking for: ${enquiry.workspaceType}`,
    enquiry.teamSize && `Team size: ${enquiry.teamSize}`,
    enquiry.timeline && `Move-in: ${enquiry.timeline}`,
    enquiry.email && `Email: ${enquiry.email}`,
    enquiry.message && `Message: ${enquiry.message}`,
  ]
    .filter(Boolean)
    .join(" | ");

/**
 * An enquiry from the website form. A number that is already a lead is not duplicated: the enquiry
 * is added to that lead's activity and it keeps its owner (an unassigned lead, or one whose owner
 * has left, is assigned now). A number in the Broker Database is refused, as on every other intake.
 * The website retries until it gets an answer, so the same enquiryId twice is answered without
 * doing anything again.
 *
 * Answers { leadId, created, duplicate, brokerBlocked, assignee: { name } | null }.
 */
exports.receiveWebsiteLead = async (req, res) => {
  const raw = Buffer.isBuffer(req.body) ? req.body.toString("utf8") : "";
  const secret = websiteSecret();
  if (!secret) return res.status(503).json({ message: "Website leads are not set up (WEBSITE_LEADS_SECRET)" });
  if (!verifySignature(secret, req.get("x-oor-timestamp"), raw, req.get("x-oor-signature"))) {
    logger.warn({ ip: req.ip, message: "Website lead refused: bad signature" });
    return res.status(401).json({ message: "Bad signature" });
  }

  let body;
  try {
    body = JSON.parse(raw);
  } catch (_error) {
    return res.status(400).json({ message: "Body must be JSON" });
  }

  const enquiryId = text(body?.enquiryId, 64);
  if (!/^[A-Za-z0-9_-]{8,64}$/.test(enquiryId)) return res.status(400).json({ message: "enquiryId is required" });
  const waId = toWaId(body?.phone);
  if (!waId) return res.status(400).json({ message: "phone must be a mobile number (10 digits, or with country code)" });

  const department = String(body?.department || "").trim().toUpperCase();
  const inventoryType = INVENTORY_TYPES.includes(department) ? department : "";
  const enquiry = {
    name: text(body?.name, 120),
    email: cleanEmail(body?.email),
    workspaceType: text(body?.workspaceType, 80),
    teamSize: text(body?.teamSize, 40),
    timeline: text(body?.timeline, 40),
    message: text(body?.message, 1000),
    page: text(body?.page, 200),
    property: text(body?.property, 160),
  };

  try {
    const companyId = await resolveCompanyId();
    if (!companyId) {
      return res.status(503).json({ message: "Set WEBSITE_COMPANY_ID: the CRM has more than one company (or none active)" });
    }

    let lead = await Lead.findOne({ companyId, phone: { $in: phoneVariants(waId) } }).sort({ createdAt: -1 });
    let created = false;

    if (lead && (lead.website?.enquiryIds || []).includes(enquiryId)) {
      return res.status(200).json({ leadId: String(lead._id), created: false, duplicate: true, assignee: null });
    }

    if (lead) {
      const ids = [...(lead.website?.enquiryIds || []), enquiryId].slice(-KEEP_ENQUIRY_IDS);
      lead.set("website", {
        ...enquiry,
        enquiryIds: ids,
        enquiries: Number(lead.website?.enquiries || 0) + 1,
        firstEnquiryAt: lead.website?.firstEnquiryAt || new Date(),
        lastEnquiryAt: new Date(),
      });
      if (!lead.email && enquiry.email) lead.email = enquiry.email;
      if (inventoryType && !lead.requirements?.inventoryType) lead.set("requirements.inventoryType", inventoryType);
      await lead.save();
      await LeadActivity.create({
        lead: lead._id,
        action: `Enquired again on the website${enquiry.page ? ` (${enquiry.page})` : ""}: ${describe(enquiry) || "no details"}`,
        performedBy: null,
      });
    } else {
      const broker = await findBrokerByPhone(companyId, waId);
      if (broker) {
        await recordBlockedLead(broker._id, { name: enquiry.name, phone: storedPhone(waId), origin: "WEBSITE" });
        logger.info({ companyId, brokerId: broker._id, message: "Website lead blocked: number belongs to a broker" });
        return res.status(200).json({ leadId: null, created: false, brokerBlocked: true, brokerName: broker.name, assignee: null });
      }
      lead = await Lead.create({
        name: enquiry.name || "Website enquiry",
        phone: storedPhone(waId),
        email: enquiry.email || undefined,
        companyId,
        projectInterested: enquiry.property || enquiry.workspaceType,
        requirements: { inventoryType },
        website: { ...enquiry, enquiryIds: [enquiryId], enquiries: 1, firstEnquiryAt: new Date(), lastEnquiryAt: new Date() },
        source: "WEBSITE",
        sourceChannel: "WEBSITE",
        status: "NEW",
        assignedTo: null,
        createdBy: null,
      });
      created = true;
      await LeadActivity.create({
        lead: lead._id,
        action: `Lead created from the website${enquiry.page ? ` (${enquiry.page})` : ""}: ${describe(enquiry) || "no details"}`,
        performedBy: null,
      });
    }

    let assignee = null;
    if (lead.assignedTo) {
      const owner = await User.findOne({ _id: lead.assignedTo, isActive: true }).select("name").lean();
      if (owner) assignee = { name: owner.name };
    }
    let assignment = null;
    if (!assignee) {
      assignment = await autoAssignLead({ lead, requester: { companyId } });
      if (assignment.assigned) assignee = { name: assignment.executive.name };
    }

    logger.info({
      companyId,
      leadId: String(lead._id),
      created,
      inventoryType: lead.requirements?.inventoryType || "",
      assigned: Boolean(assignee),
      reason: assignment && !assignment.assigned ? assignment.reason : null,
      message: "Website lead received",
    });

    return res.status(created ? 201 : 200).json({
      leadId: String(lead._id),
      created,
      duplicate: false,
      assignee,
      unassignedReason: assignee ? null : assignment?.reason || "NOT_ASSIGNED",
    });
  } catch (error) {
    logger.error({ error: error.message, message: "Website lead failed" });
    return res.status(500).json({ message: "Server error" });
  }
};
