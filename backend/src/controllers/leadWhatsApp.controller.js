const mongoose = require("mongoose");
const Lead = require("../models/Lead");
const LeadActivity = require("../models/leadActivity.model");
const CustomerMessage = require("../models/CustomerMessage");
const customerMessages = require("../services/customerMessages.service");
const leadTouch = require("../services/leadTouch.service");
const { toWaId } = require("../services/whatsappDashboard.service");
const { findAccessibleLeadById } = require("./lead.controller");
const logger = require("../config/logger");

// The WhatsApp panel on a lead's page: the customer's chat in the company's WhatsApp app (last
// messages, who has it, whether the 24-hour window is open), the messages the CRM asked for, the
// customer's agreement, and the follow-up an executive may send from here.

// Purposes an executive may send by hand from the CRM (the WhatsApp app lists which are ready).
const MANUAL_PURPOSES = ["follow_up"];

/** Where people open the chat: WHATSAPP_DASHBOARD_WEB_URL (the address in a browser), else the API's. */
const chatLink = (chatId) => {
  const base = String(process.env.WHATSAPP_DASHBOARD_WEB_URL || process.env.WHATSAPP_DASHBOARD_URL || "").trim().replace(/\/$/, "");
  return base && chatId ? `${base}/#inbox/${chatId}` : "";
};

const loadLead = async (req, res) => {
  const { leadId } = req.params;
  if (!mongoose.isValidObjectId(leadId)) {
    res.status(400).json({ message: "Invalid lead id" });
    return null;
  }
  const accessible = await findAccessibleLeadById({ leadId, user: req.user });
  if (!accessible) {
    res.status(404).json({ message: "Lead not found" });
    return null;
  }
  return Lead.findOne({ _id: leadId, companyId: req.user.companyId });
};

const consentOut = (lead) => ({
  given: Boolean(lead.whatsappConsent?.given),
  at: lead.whatsappConsent?.at || null,
  source: lead.whatsappConsent?.source || "",
});

const messageOut = (row) => ({
  key: row.key,
  purpose: row.purpose,
  label: customerMessages.PURPOSE_LABELS[row.purpose] || row.purpose,
  status: row.status,
  reason: row.reason || row.lastError || "",
  sendAt: row.sendAt,
  createdAt: row.createdAt,
});

exports.getLeadWhatsApp = async (req, res) => {
  try {
    const lead = await loadLead(req, res);
    if (!lead) return undefined;
    const rows = await CustomerMessage.find({ lead: lead._id }).sort({ createdAt: -1 }).limit(20).lean();
    const base = { configured: customerMessages.isConfigured(), consent: consentOut(lead), linked: Boolean(lead.whatsapp?.linkedAt), requested: rows.map(messageOut) };
    if (!base.configured) return res.json({ ...base, chat: null, purposes: [], chatUrl: "", problem: "" });
    const phone = toWaId(lead.phone);
    if (!phone) return res.json({ ...base, chat: null, purposes: [], chatUrl: "", problem: "The lead's phone is not a WhatsApp number." });

    const [chat, purposes] = await Promise.allSettled([
      customerMessages.deskPost("/conversation", { phone }),
      customerMessages.deskPost("/purposes", {}),
    ]);
    const chatData = chat.status === "fulfilled" ? chat.value?.data || null : null;
    return res.json({
      ...base,
      chat: chatData,
      chatUrl: chatLink(chatData?.chatId),
      purposes: purposes.status === "fulfilled" ? (purposes.value?.data || []).filter((row) => MANUAL_PURPOSES.includes(row.purpose)) : [],
      problem: chat.status === "rejected" ? "The WhatsApp app did not answer; try again in a minute." : "",
    });
  } catch (error) {
    logger.error({ requestId: req.requestId || null, error: error.message, message: "getLeadWhatsApp failed" });
    return res.status(500).json({ message: "Server error" });
  }
};

/** An executive sends a follow-up template from the lead page. It counts as their WhatsApp touch. */
exports.sendLeadWhatsApp = async (req, res) => {
  try {
    const lead = await loadLead(req, res);
    if (!lead) return undefined;
    const purpose = String(req.body?.purpose || "");
    if (!MANUAL_PURPOSES.includes(purpose)) return res.status(400).json({ message: "This message cannot be sent by hand" });
    if (!customerMessages.isConfigured()) return res.status(503).json({ message: "The WhatsApp app is not linked to the CRM" });
    if (!customerMessages.mayMessage(lead)) return res.status(409).json({ message: "The customer has not agreed to WhatsApp messages. Record their agreement first." });
    const minute = Math.floor(Date.now() / 60000);
    const row = await customerMessages.queueMessage({
      lead,
      purpose,
      // A double click within the same minute is the same message.
      key: `manual:${lead._id}:${purpose}:${minute}`,
      variables: { name: lead.name || "", executive: req.user.name || "", property: lead.projectInterested || lead.website?.property || "" },
      requestedBy: req.user._id,
      waitForHandOff: true,
    });
    if (!row) return res.status(400).json({ message: "The lead's phone is not a WhatsApp number" });
    const sent = !["failed", "skipped", "cancelled"].includes(row.status);
    if (sent) {
      await leadTouch
        .recordTouch({ lead, user: req.user, channel: "WHATSAPP", source: "CRM_ACTION", note: `WhatsApp ${customerMessages.PURPOSE_LABELS[purpose] || purpose} sent` })
        .catch(() => null);
    }
    return res.status(sent ? 202 : 409).json({ message: sent ? "Sent to the WhatsApp app" : row.reason || row.lastError || "Not sent", data: messageOut(row) });
  } catch (error) {
    logger.error({ requestId: req.requestId || null, error: error.message, message: "sendLeadWhatsApp failed" });
    return res.status(500).json({ message: "Server error" });
  }
};

/** The customer told the executive they agree (or no longer agree) to WhatsApp messages. */
exports.setLeadWhatsAppConsent = async (req, res) => {
  try {
    const lead = await loadLead(req, res);
    if (!lead) return undefined;
    if (typeof req.body?.given !== "boolean") return res.status(400).json({ message: "given must be true or false" });
    const { given } = req.body;
    if (Boolean(lead.whatsappConsent?.given) === given) return res.json({ consent: consentOut(lead) });
    const who = req.user.name || "an executive";
    const whatsappConsent = { given, at: new Date(), source: given ? `told ${who}` : `withdrawn (recorded by ${who})`, by: req.user._id };
    await Lead.updateOne({ _id: lead._id }, { $set: { whatsappConsent } });
    await LeadActivity.create({ lead: lead._id, action: given ? "Agreed to WhatsApp messages (recorded by hand)" : "No longer agrees to WhatsApp messages", performedBy: req.user._id });
    // Withdrawn: reminders not sent yet are stopped.
    if (!given) await customerMessages.cancelMessages({ companyId: lead.companyId, keyPrefix: `visit:${lead._id}:` });
    return res.json({ consent: consentOut({ whatsappConsent }) });
  } catch (error) {
    logger.error({ requestId: req.requestId || null, error: error.message, message: "setLeadWhatsAppConsent failed" });
    return res.status(500).json({ message: "Server error" });
  }
};
