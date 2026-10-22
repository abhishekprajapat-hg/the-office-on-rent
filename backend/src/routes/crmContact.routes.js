const router = require("express").Router();
const Contact = require("../models/CrmContact");
const { normalizePhone, upsertContact, bulkUpsertContacts, MAX_BULK_CONTACT_ROWS } = require("../services/crmContact.service");
const { requirePageAccess, requirePageActionForMethod, checkRoleOrPageAccess } = require("../middleware/pageAccess.middleware");
const { writeAuditLog } = require("../services/auditLog.service");
const { requireAdminApprovalForDelete } = require("../services/deleteApproval.service");
const BrokerFirm = require("../models/BrokerFirm");
const rel = require("../services/relationship.service");
const R = require("../constants/relationship.constants");

// The owner/broker directory is the most sensitive list in the CRM. Roles
// outside sales reach it only on an explicit Inventory page grant.
const CONTACT_ROLES = ["ADMIN", "MANAGER", "EXECUTIVE", "INSIDE_EXECUTIVE", "FIELD_EXECUTIVE"];
const LEAD_IDENTIFY_ROLES = [...CONTACT_ROLES, "CHANNEL_PARTNER"];
router.use(require("../middleware/auth.middleware").protect);
router.use(require("../middleware/company.middleware").requireCompanyContext);
router.get("/identify", checkRoleOrPageAccess(LEAD_IDENTIFY_ROLES, "leads"), requirePageAccess("leads"), async (req, res) => {
 try { const phone = normalizePhone(req.query.phone); const contact = phone ? await Contact.findOne({ companyId: req.user.companyId, kind: "BROKER", phone }).select("_id name").lean() : null; res.json({ isBroker: Boolean(contact), contactId: contact?._id || null, name: contact?.name || "" }); }
 catch (error) { req.log?.error(error); res.status(500).json({ message: "Could not identify contact" }); }
});
router.use(checkRoleOrPageAccess(CONTACT_ROLES, "inventory"));
router.use(requirePageAccess("inventory"), requirePageActionForMethod("inventory"));
// The master contact directory is internal; shared inventory access does not expose it.
router.use((req, res, next) => req.user.role === "CHANNEL_PARTNER" ? res.status(403).json({ message: "Internal contacts only" }) : next());

const parseKind = (value) => (String(value || "").toUpperCase() === "BROKER" ? "BROKER" : "OWNER");

const escapeRegex = (v) => String(v || "").slice(0, 100).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const sendRelError = (req, res, error, fallback) => {
 if (error instanceof rel.RelationshipError) return res.status(error.statusCode).json({ message: error.message });
 if (error?.code === 11000) return res.status(409).json({ message: "Another record already uses this phone number" });
 req.log?.error(error);
 return res.status(500).json({ message: fallback });
};

/*
 * The directory. Search covers name, phone, firm, RERA number, areas and
 * projects; filters follow section 6.5. Brokers tagged with segments are only
 * listed to people in those segments (management sees all), and restricted
 * commercial fields are stripped for everyone else.
 */
router.get("/", async (req, res) => {
 try {
  const kind = parseKind(req.query.kind);
  const and = [{ companyId: req.user.companyId, kind }];
  if (req.query.phone) and.push({ phone: normalizePhone(req.query.phone) });
  if (req.query.search) {
   const value = escapeRegex(req.query.search);
   const digits = String(req.query.search).replace(/\D/g, "");
   and.push({ $or: [
    { name: { $regex: value, $options: "i" } }, { phone: { $regex: digits || value } }, { alternatePhone: { $regex: digits || value } },
    { company: { $regex: value, $options: "i" } }, { reraNumber: { $regex: value, $options: "i" } },
    { areas: { $regex: value, $options: "i" } }, { projects: { $regex: value, $options: "i" } }, { city: { $regex: value, $options: "i" } },
   ] });
  }
  const upperList = (v) => String(v || "").split(",").map((x) => x.trim().toUpperCase()).filter(Boolean);
  if (req.query.segment) and.push({ segments: { $in: upperList(req.query.segment) } });
  if (req.query.transactionType) and.push({ transactionTypes: { $in: upperList(req.query.transactionType) } });
  if (req.query.cpStatus) and.push({ cpStatus: { $in: upperList(req.query.cpStatus) } });
  if (req.query.relationshipStatus) and.push({ relationshipStatus: { $in: upperList(req.query.relationshipStatus) } });
  if (req.query.area) and.push({ areas: { $regex: escapeRegex(req.query.area), $options: "i" } });
  if (req.query.project) and.push({ projects: { $regex: escapeRegex(req.query.project), $options: "i" } });
  if (req.query.propertyType) and.push({ propertyTypes: { $regex: escapeRegex(req.query.propertyType), $options: "i" } });
  if (req.query.firmId && /^[a-f0-9]{24}$/i.test(req.query.firmId)) and.push({ firmId: req.query.firmId });
  if (req.query.source) and.push({ source: { $in: upperList(req.query.source) } });
  if (req.query.verified === "true" || req.query.verified === "false") and.push({ verified: req.query.verified === "true" });
  if (req.query.lastContactBefore) { const d = new Date(req.query.lastContactBefore); if (!Number.isNaN(d.getTime())) and.push({ $or: [{ lastContactAt: null }, { lastContactAt: { $lt: d } }] }); }
  if (req.query.stale === "true" && kind === "OWNER") and.push({ $or: [{ lastVerifiedAt: null }, { lastVerifiedAt: { $lt: rel.staleCutoff() } }] });
  const visibility = kind === "BROKER" ? rel.segmentVisibilityClause(req.user) : null;
  if (visibility) and.push(visibility);
  const filter = { $and: and };
  const page = Math.max(1, Number.parseInt(req.query.page, 10) || 1);
  const [contacts, total] = await Promise.all([
   Contact.find(filter).select("-blockedLeads").populate("firmId", "name").sort({ name: 1 }).skip((page - 1) * 50).limit(50).lean(),
   Contact.countDocuments(filter),
  ]);
  res.json({ contacts: contacts.map((c) => rel.stripRestrictedContact(c, req.user)), total, page, canSeeRestricted: rel.canSeeRestricted(req.user) });
 } catch (error) { req.log?.error(error); res.status(500).json({ message: "Failed to load contacts" }); }
});

/*
 * Broker / owner follow-ups for the calendar (requirements 16 Oct 2026,
 * section 11). Management sees everyone's; others the ones they own.
 */
router.get("/follow-ups", async (req, res) => {
 try {
  const from = new Date(String(req.query.from || "")); const to = new Date(String(req.query.to || ""));
  if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime())) return res.status(400).json({ message: "from and to are required dates" });
  const filter = { companyId: req.user.companyId, nextFollowUpAt: { $gte: from, $lte: to } };
  if (!rel.canSeeRestricted(req.user)) filter.relationshipOwnerId = req.user._id;
  const rows = await Contact.find(filter).select("_id kind name phone company nextFollowUpAt relationshipStatus").sort({ nextFollowUpAt: 1 }).limit(300).lean();
  res.json({ followUps: rows });
 } catch (error) { sendRelError(req, res, error, "Failed to load follow-ups"); }
});

/*
 * Backup / export of the owner or broker directory (requirements 16 Oct 2026,
 * section 12) so the relationships never depend on one employee. Admin and
 * Manager only; audited.
 */
router.get("/export", require("../middleware/auth.middleware").checkRole(["ADMIN", "MANAGER"]), async (req, res) => {
 try {
  const kind = parseKind(req.query.kind);
  const rows = await Contact.find({ companyId: req.user.companyId, kind }).select("-blockedLeads -leadIds -inventoryIds").populate("firmId", "name").populate("relationshipOwnerId", "name").sort({ name: 1 }).limit(20000).lean();
  await writeAuditLog({ companyId: req.user.companyId, actor: req.user, action: "CRM_CONTACTS_EXPORTED", entityType: "CrmContact", metadata: { kind, count: rows.length }, req });
  res.json({ kind, count: rows.length, contacts: rows.map((r) => rel.stripRestrictedContact(r, req.user)) });
 } catch (error) { sendRelError(req, res, error, "Export failed"); }
});

/* ---------------------------------------------- brokerage firms (6.2) -- */
router.get("/firms", async (req, res) => {
 try {
  const filter = { companyId: req.user.companyId };
  if (req.query.search) filter.name = { $regex: escapeRegex(req.query.search), $options: "i" };
  const firms = await BrokerFirm.find(filter).sort({ name: 1 }).limit(200).lean();
  const counts = await Contact.aggregate([
   { $match: { companyId: req.user.companyId, firmId: { $in: firms.map((f) => f._id) } } },
   { $group: { _id: "$firmId", count: { $sum: 1 } } },
  ]);
  const byId = new Map(counts.map((c) => [String(c._id), c.count]));
  res.json({ firms: firms.map((f) => ({ ...f, brokerCount: byId.get(String(f._id)) || 0 })) });
 } catch (error) { sendRelError(req, res, error, "Failed to load firms"); }
});

const FIRM_FIELDS = { name: 200, phone: 20, email: 200, address: 500, city: 120, reraNumber: 80, notes: 3000 };
const cleanFirm = (body = {}) => {
 const out = {};
 for (const [k, max] of Object.entries(FIRM_FIELDS)) if (body[k] !== undefined) out[k] = rel.cleanText(body[k], max);
 if (body.segments !== undefined) out.segments = (Array.isArray(body.segments) ? body.segments : []).map((s) => String(s).toUpperCase()).filter((s) => R.SEGMENTS.includes(s));
 if (body.isBrokerageFirm !== undefined) out.isBrokerageFirm = Boolean(body.isBrokerageFirm);
 if (out.name !== undefined) { if (!out.name) throw new rel.RelationshipError(400, "Firm name is required"); out.nameKey = BrokerFirm.toNameKey(out.name); }
 return out;
};
router.post("/firms", require("../middleware/rateLimit.middleware").writeLimiter, async (req, res) => {
 try {
  const data = cleanFirm(req.body);
  if (!data.name) return res.status(400).json({ message: "Firm name is required" });
  const existing = await BrokerFirm.findOne({ companyId: req.user.companyId, nameKey: data.nameKey }).lean();
  if (existing) return res.status(409).json({ message: "A firm with this name already exists", firm: existing });
  const firm = await BrokerFirm.create({ ...data, companyId: req.user.companyId, createdBy: req.user._id });
  res.status(201).json({ firm });
 } catch (error) { sendRelError(req, res, error, "Failed to save firm"); }
});
router.patch("/firms/:firmId", require("../middleware/rateLimit.middleware").writeLimiter, async (req, res) => {
 try {
  if (!/^[a-f0-9]{24}$/i.test(req.params.firmId)) return res.status(400).json({ message: "Invalid firm" });
  const firm = await BrokerFirm.findOneAndUpdate({ _id: req.params.firmId, companyId: req.user.companyId }, { $set: cleanFirm(req.body) }, { returnDocument: "after", runValidators: true });
  if (!firm) return res.status(404).json({ message: "Firm not found" });
  res.json({ firm });
 } catch (error) { sendRelError(req, res, error, "Failed to save firm"); }
});

/* --------------------------------------------- RERA list import (6.5) -- */
router.post("/import-rera", require("../middleware/rateLimit.middleware").writeLimiter, require("../middleware/auth.middleware").checkRole(["ADMIN", "MANAGER"]), async (req, res) => {
 try {
  const rows = Array.isArray(req.body?.rows) ? req.body.rows : [];
  if (!rows.length) return res.status(400).json({ message: "No rows found in the uploaded file" });
  if (rows.length > rel.MAX_RERA_ROWS) return res.status(400).json({ message: `Import limit is ${rel.MAX_RERA_ROWS} rows` });
  const result = await rel.importReraBrokers({ companyId: req.user.companyId, rows, actor: req.user._id });
  await writeAuditLog({ companyId: req.user.companyId, actor: req.user, action: "RERA_BROKERS_IMPORTED", entityType: "CrmContact", metadata: { rows: rows.length, created: result.created, updated: result.updated, skipped: result.skipped }, req });
  res.json(result);
 } catch (error) { sendRelError(req, res, error, "RERA import failed"); }
});

/* --------------------------------------------------- profile (6.4/17) -- */
router.get("/:contactId", async (req, res) => {
 try {
  const profile = await rel.buildContactProfile({ contactId: req.params.contactId, user: req.user });
  profile.possibleDuplicates = await rel.findPossibleDuplicates({ companyId: req.user.companyId, contact: profile.contact });
  profile.canSeeRestricted = rel.canSeeRestricted(req.user);
  res.json(profile);
 } catch (error) { sendRelError(req, res, error, "Failed to load contact"); }
});

router.patch("/:contactId", require("../middleware/rateLimit.middleware").writeLimiter, async (req, res) => {
 try {
  if (!/^[a-f0-9]{24}$/i.test(req.params.contactId)) return res.status(400).json({ message: "Invalid contact" });
  const contact = await Contact.findOne({ _id: req.params.contactId, companyId: req.user.companyId });
  if (!contact || !rel.canSeeContact(contact, req.user)) return res.status(404).json({ message: "Contact not found" });
  const patch = rel.sanitizeContactPatch(req.body || {}, req.user);
  if (patch.phone && patch.phone !== contact.phone) {
   const clash = await Contact.findOne({ companyId: req.user.companyId, kind: contact.kind, phone: patch.phone, _id: { $ne: contact._id } }).select("_id name").lean();
   if (clash) return res.status(409).json({ message: `${clash.name} already has this number. Merge the two records instead.`, duplicateId: clash._id });
  }
  if (patch.firmId) {
   const firm = await BrokerFirm.exists({ _id: patch.firmId, companyId: req.user.companyId });
   if (!firm) return res.status(400).json({ message: "Firm not found" });
  }
  const cpChange = rel.applyCpStatus(contact, patch.cpStatus, req.user);
  delete patch.cpStatus;
  Object.assign(contact, patch);
  await contact.save();
  if (cpChange) {
   await writeAuditLog({ companyId: req.user.companyId, actor: req.user, action: "BROKER_CP_STATUS_CHANGED", entityType: "CrmContact", entityId: contact._id, metadata: { name: contact.name, ...cpChange }, req });
  }
  res.json({ contact: rel.stripRestrictedContact(contact, req.user) });
 } catch (error) { sendRelError(req, res, error, "Failed to save contact"); }
});

/* Merge a duplicate into this record (17.1). Management only; audited. */
router.post("/:contactId/merge", require("../middleware/rateLimit.middleware").writeLimiter, require("../middleware/auth.middleware").checkRole(["ADMIN", "MANAGER"]), async (req, res) => {
 try {
  const result = await rel.mergeContacts({ companyId: req.user.companyId, keepId: req.params.contactId, dropId: req.body?.duplicateId });
  await writeAuditLog({ companyId: req.user.companyId, actor: req.user, action: "CRM_CONTACT_MERGED", entityType: "CrmContact", entityId: result.contact._id, metadata: { kept: { name: result.contact.name, phone: result.contact.phone }, removed: result.removed, moved: result.moved }, req });
  res.json({ contact: rel.stripRestrictedContact(result.contact, req.user), moved: result.moved, removed: result.removed });
 } catch (error) { sendRelError(req, res, error, "Merge failed"); }
});

// The leads this broker's number was refused on, newest first.
router.get("/:contactId/blocked-leads", async (req, res) => {
 try {
  if (!/^[a-f0-9]{24}$/i.test(req.params.contactId)) return res.status(400).json({ message: "Invalid contact" });
  const contact = await Contact.findOne({ _id: req.params.contactId, companyId: req.user.companyId }).select("name phone blockedLeads blockedLeadCount").lean();
  if (!contact) return res.status(404).json({ message: "Contact not found" });
  res.json({ ...contact, blockedLeads: [...(contact.blockedLeads || [])].reverse() });
 } catch (error) { req.log?.error(error); res.status(500).json({ message: "Failed to load blocked leads" }); }
});

router.post("/", require("../middleware/rateLimit.middleware").writeLimiter, async (req, res) => {
 try {
  const { kind, name, phone, email, notes, propertyDetails, company, city } = req.body;
  if (!["OWNER", "BROKER"].includes(kind) || !String(name || "").trim() || !normalizePhone(phone)) return res.status(400).json({ message: "Name, valid phone and contact type are required" });
  // Profile fields beyond the basics are checked first, so a bad value saves nothing.
  const { kind: _k, name: _n, phone: _p, email: _e, notes: _no, propertyDetails: _pd, company: _c, city: _ci, ...extra } = req.body || {};
  const patch = rel.sanitizeContactPatch(extra, req.user);
  const existed = await Contact.exists({ companyId: req.user.companyId, kind, phone: normalizePhone(phone) });
  const contact = await upsertContact({ companyId: req.user.companyId, kind, name, phone, email, notes, propertyDetails, company, city, actor: req.user._id });
  if (contact && Object.keys(patch).length) {
   const cpChange = rel.applyCpStatus(contact, patch.cpStatus, req.user);
   delete patch.cpStatus;
   Object.assign(contact, patch);
   if (!existed && !contact.source) contact.source = "MANUAL";
   await contact.save();
   if (cpChange) await writeAuditLog({ companyId: req.user.companyId, actor: req.user, action: "BROKER_CP_STATUS_CHANGED", entityType: "CrmContact", entityId: contact._id, metadata: { name: contact.name, ...cpChange }, req });
  }
  res.json({ ...rel.stripRestrictedContact(contact, req.user), alreadyExisted: Boolean(existed) });
 } catch (error) { sendRelError(req, res, error, "Failed to save contact"); }
});

router.post("/bulk", require("../middleware/rateLimit.middleware").writeLimiter, async (req, res) => {
 try {
  const kind = parseKind(req.body?.kind);
  if (!["OWNER", "BROKER"].includes(String(req.body?.kind || "").toUpperCase())) return res.status(400).json({ message: "Contact type must be OWNER or BROKER" });
  const rows = Array.isArray(req.body?.rows) ? req.body.rows : [];
  if (!rows.length) return res.status(400).json({ message: "No rows found in the uploaded file" });
  if (rows.length > MAX_BULK_CONTACT_ROWS) return res.status(400).json({ message: `Bulk upload limit exceeded (max ${MAX_BULK_CONTACT_ROWS} rows)` });
  res.json(await bulkUpsertContacts({ companyId: req.user.companyId, kind, rows, actor: req.user._id }));
 } catch (error) { req.log?.error(error); res.status(500).json({ message: "Bulk upload failed" }); }
});

/*
 * Deleting an owner or broker is irreversible and leaves no copy behind, so it
 * needs a stronger gate than the rest of the directory: management only, plus
 * an audit entry naming who removed which record. A Manager's delete becomes a
 * request that an Admin approves (BUG-34).
 */
const deleteContact = async (req, res) => {
 try {
  if (!/^[a-f0-9]{24}$/i.test(req.params.contactId)) return res.status(400).json({ message: "Invalid contact" });
  const deleted = await Contact.findOneAndDelete({ _id: req.params.contactId, companyId: req.user.companyId });
  if (!deleted) return res.status(404).json({ message: "Contact not found" });
  await writeAuditLog({
   companyId: req.user.companyId,
   actor: req.user,
   action: "CRM_CONTACT_DELETED",
   entityType: "CrmContact",
   entityId: deleted._id,
   metadata: { kind: deleted.kind, name: deleted.name, phone: deleted.phone },
   req,
  });
  res.json({ message: "Contact removed", contactId: deleted._id });
 } catch (error) { req.log?.error(error); res.status(500).json({ message: "Failed to remove contact" }); }
};

router.delete("/:contactId",
 require("../middleware/rateLimit.middleware").writeLimiter,
 require("../middleware/auth.middleware").checkRole(["ADMIN", "MANAGER"]),
 requireAdminApprovalForDelete("crm_contact", {
  label: "Owner / broker contact",
  pageKey: "inventory",
  idParam: "contactId",
  handler: deleteContact,
  describe: async ({ id, companyId }) => {
   const contact = await Contact.findOne({ _id: id, companyId }).select("name phone kind").lean();
   if (!contact) return null;
   const kind = contact.kind === "BROKER" ? "Broker" : "Owner";
   return [`${kind}: ${contact.name || ""}`.trim(), contact.phone].filter(Boolean).join(" · ");
  },
 }),
 deleteContact);

module.exports = router;
