/*
 * Enterprise leasing (Developmental Updates Oct 2026 - Update 02): offices,
 * the owner-side master lease and tenant-side agreements, tenants and their
 * contacts, expected payables / receivables, payments, deposits, fit-out,
 * documents, alerts and reports. The arithmetic lives in
 * enterpriseFinance.service.js; this file reads and writes records.
 */
const mongoose = require("mongoose");
const Office = require("../models/EnterpriseOffice");
const Agreement = require("../models/EnterpriseAgreement");
const Tenant = require("../models/EnterpriseTenant");
const Obligation = require("../models/EnterpriseObligation");
const Transaction = require("../models/EnterpriseTransaction");
const Ledger = require("../models/EnterpriseLedgerEntry");
const Doc = require("../models/EnterpriseDocument");
const Checklist = require("../models/EnterpriseChecklist");
const Reminder = require("../models/EnterpriseReminder");
const DbCounter = require("../models/DbCounter");
const Contact = require("../models/CrmContact");
const E = require("../constants/enterprise.constants");
const F = require("./enterpriseFinance.service");

class EnterpriseError extends Error {
  constructor(statusCode, message) { super(message); this.statusCode = statusCode; }
}

const text = (v, max = 300) => String(v ?? "").trim().slice(0, max);
const isId = (v) => mongoose.isValidObjectId(String(v || ""));
const has = (o, k) => Object.prototype.hasOwnProperty.call(o || {}, k);
const enumOf = (value, allowed, label, fallback) => {
  const v = String(value ?? "").trim().toUpperCase();
  if (!v && fallback !== undefined) return fallback;
  if (!allowed.includes(v)) throw new EnterpriseError(400, `${label} must be one of ${allowed.join(", ")}`);
  return v;
};
const money = (v, label, { allowNull = true, max = 1e12 } = {}) => {
  if (v === "" || v === null || v === undefined) {
    if (allowNull) return null;
    throw new EnterpriseError(400, `${label} is required`);
  }
  const n = Number(v);
  if (!Number.isFinite(n) || n < 0 || n > max) throw new EnterpriseError(400, `${label} must be 0 or more`);
  return F.round2(n);
};
const pct = (v, label) => {
  const n = money(v, label, { max: 100 });
  return n;
};
const dateOf = (v, label, { required = false } = {}) => {
  if (v === "" || v === null || v === undefined) {
    if (required) throw new EnterpriseError(400, `${label} is required`);
    return null;
  }
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) throw new EnterpriseError(400, `${label} is not a valid date`);
  return F.startOfDay(d);
};
const intOf = (v, label, max = 1200) => {
  if (v === "" || v === null || v === undefined) return null;
  const n = Number(v);
  if (!Number.isInteger(n) || n < 0 || n > max) throw new EnterpriseError(400, `${label} must be a whole number`);
  return n;
};
const by = (user) => ({ by: user?._id || null, byName: user?.name || "" });
const isManager = (user) => E.ENTERPRISE_ROLES.includes(String(user?.role || "").toUpperCase());

const loadOffice = async (companyId, id) => {
  if (!isId(id)) throw new EnterpriseError(400, "Invalid office");
  const office = await Office.findOne({ _id: id, companyId });
  if (!office) throw new EnterpriseError(404, "Enterprise office not found");
  return office;
};

/* ------------------------------------------------------------ offices -- */

const sanitizeOffice = (body = {}, { partial = false } = {}) => {
  const out = {};
  const take = (k) => !partial || has(body, k);
  if (take("name")) { out.name = text(body.name, 200); if (!out.name) throw new EnterpriseError(400, "Give the office a name"); }
  ["address", "floor", "unit", "areaBasis", "ownerConsentRef", "notes"].forEach((k) => { if (take(k)) out[k] = text(body[k], k === "notes" ? 3000 : k === "address" ? 500 : 300); });
  if (take("area")) out.area = money(body.area, "Area");
  if (take("fitOutBudget")) out.fitOutBudget = money(body.fitOutBudget, "Fit-out budget");
  if (take("fitOutStatus")) out.fitOutStatus = enumOf(body.fitOutStatus, E.FIT_OUT_STATUSES, "Fit-out status", E.FIT_OUT_STATUSES[0]);
  if (take("operationalStatus")) out.operationalStatus = enumOf(body.operationalStatus, E.OPERATIONAL_STATUSES, "Operational status", E.OPERATIONAL_STATUSES[0]);
  ["fitOutStartDate", "fitOutExpectedEndDate", "fitOutActualEndDate"].forEach((k) => { if (take(k)) out[k] = dateOf(body[k], k); });
  ["buildingId", "inventoryId", "assignedTo"].forEach((k) => {
    if (!take(k)) return;
    if (body[k] && !isId(body[k])) throw new EnterpriseError(400, `${k} is invalid`);
    out[k] = body[k] || null;
  });
  return out;
};

const checkOfficeLinks = async (companyId, clean, excludeId = null) => {
  if (clean.assignedTo && !(await require("../models/User").exists({ _id: clean.assignedTo, companyId }))) throw new EnterpriseError(400, "That employee isn't in this company");
  if (clean.buildingId && !(await require("../models/Building").exists({ _id: clean.buildingId, companyId }))) throw new EnterpriseError(400, "That building isn't in the Database");
  if (clean.inventoryId) {
    if (!(await require("../models/Inventory").exists({ _id: clean.inventoryId, companyId }))) throw new EnterpriseError(400, "That inventory unit doesn't exist");
    const taken = await Office.findOne({ companyId, inventoryId: clean.inventoryId, ...(excludeId ? { _id: { $ne: excludeId } } : {}) }).select("officeCode name").lean();
    if (taken) throw new EnterpriseError(409, `That unit is already Enterprise office ${taken.officeCode} (${taken.name})`);
  }
};

const createOffice = async ({ user, body }) => {
  const clean = sanitizeOffice(body);
  await checkOfficeLinks(user.companyId, clean);
  const office = new Office({ ...clean, companyId: user.companyId, createdBy: user._id, assignedTo: clean.assignedTo || user._id });
  office.officeCode = await DbCounter.nextCode(user.companyId, "ENT", 3);
  office.history.push({ ...by(user), change: "Office created" });
  await office.save();
  return office;
};

const updateOffice = async ({ user, id, body }) => {
  const office = await loadOffice(user.companyId, id);
  const clean = sanitizeOffice(body, { partial: true });
  await checkOfficeLinks(user.companyId, clean, office._id);
  const changes = Object.entries(clean).filter(([k, v]) => String(office[k] ?? "") !== String(v ?? "")).map(([k, v]) => `${k}: ${office[k] ?? "-"} -> ${v ?? "-"}`);
  Object.assign(office, clean);
  if (changes.length) office.history = [...(office.history || []), { ...by(user), change: changes.join("; ").slice(0, 500) }].slice(-200);
  await office.save();
  return office;
};

/* --------------------------------------------------------- agreements -- */

const sanitizeAgreement = (body = {}, { partial = false, side } = {}) => {
  const out = {};
  const take = (k) => !partial || has(body, k);
  if (take("agreementType")) out.agreementType = text(body.agreementType, 120);
  if (take("status")) out.status = enumOf(body.status, E.AGREEMENT_STATUSES, "Agreement status", "DRAFT");
  ["signingDate", "possessionDate", "commencementDate", "rentCommencementDate", "endDate", "lockInEndDate", "depositExpectedSettlementDate", "noticeReceivedDate", "noticeExpiryDate", "vacatingDate"]
    .forEach((k) => { if (take(k)) out[k] = dateOf(body[k], k.replace(/([A-Z])/g, " $1").toLowerCase()); });
  if (take("lockInMonths")) out.lockInMonths = intOf(body.lockInMonths, "Lock-in months");
  if (take("noticePeriodMonths")) out.noticePeriodMonths = intOf(body.noticePeriodMonths, "Notice period months");
  if (take("baseRent")) out.baseRent = money(body.baseRent, "Base rent", { allowNull: false });
  if (take("rentDueDay")) { const d = intOf(body.rentDueDay, "Rent due day", 28); if (d === 0) throw new EnterpriseError(400, "Rent due day is 1-28"); out.rentDueDay = d; }
  if (take("gstPercent")) out.gstPercent = pct(body.gstPercent, "GST %");
  if (take("tdsPercent")) out.tdsPercent = pct(body.tdsPercent, "TDS %");
  if (take("depositRequired")) out.depositRequired = money(body.depositRequired, "Deposit required");
  ["renewalTerms", "terminationTerms", "closeOutNotes", "notes"].forEach((k) => { if (take(k)) out[k] = text(body[k], 3000); });
  if (take("escalations")) {
    out.escalations = (Array.isArray(body.escalations) ? body.escalations : []).slice(0, 60).map((e, i) => ({
      effectiveDate: dateOf(e.effectiveDate, `Escalation ${i + 1} date`, { required: true }),
      method: enumOf(e.method, E.ESCALATION_METHODS, `Escalation ${i + 1} method`),
      value: money(e.value, `Escalation ${i + 1} value`, { allowNull: false }),
      note: text(e.note, 300),
    }));
  }
  if (take("maintenance")) {
    const m = body.maintenance || {};
    out.maintenance = {
      method: enumOf(m.method, E.MAINTENANCE_METHODS, "Maintenance method", "INCLUDED"),
      amount: money(m.amount, "Maintenance amount"),
      note: text(m.note, 300),
      passThroughAllowed: side === "TENANT" ? Boolean(m.passThroughAllowed) : false,
    };
    if (out.maintenance.method === "FIXED" && !out.maintenance.amount) throw new EnterpriseError(400, "A fixed maintenance charge needs an amount");
  }
  if (take("otherCharges")) {
    out.otherCharges = (Array.isArray(body.otherCharges) ? body.otherCharges : []).slice(0, 30).map((c, i) => {
      const label = text(c.label, 120);
      if (!label) throw new EnterpriseError(400, `Charge ${i + 1} needs a name`);
      return {
        chargeType: enumOf(c.chargeType, E.CHARGE_TYPES, "Charge type", "OTHER"),
        label,
        amount: money(c.amount, `${label} amount`, { allowNull: false }),
        frequency: enumOf(c.frequency, E.CHARGE_FREQUENCIES, "Frequency", "MONTHLY"),
        dueDate: dateOf(c.dueDate, `${label} due date`),
        note: text(c.note, 300),
      };
    });
  }
  if (take("landlordContactId")) out.landlordContactId = body.landlordContactId || null;
  if (take("otherContactIds")) out.otherContactIds = (Array.isArray(body.otherContactIds) ? body.otherContactIds : []).filter(isId).slice(0, 20);
  if (take("tenantId")) out.tenantId = body.tenantId || null;
  // Dates that only make sense in order.
  const order = [["signingDate", "endDate"], ["commencementDate", "endDate"], ["rentCommencementDate", "endDate"]];
  order.forEach(([a, b]) => { if (out[a] && out[b] && out[a] > out[b]) throw new EnterpriseError(400, `${a.replace(/([A-Z])/g, " $1").toLowerCase()} is after the end date`); });
  return out;
};

const checkAgreementParties = async (companyId, side, clean) => {
  if (side === "OWNER" && clean.landlordContactId) {
    if (!isId(clean.landlordContactId)) throw new EnterpriseError(400, "Landlord is invalid");
    const landlord = await Contact.findOne({ _id: clean.landlordContactId, companyId }).select("kind").lean();
    if (!landlord) throw new EnterpriseError(400, "Landlord not found");
    if (landlord.kind !== "OWNER") throw new EnterpriseError(400, "Pick the landlord from the Owner Database");
  }
  if (clean.otherContactIds?.length) {
    const found = await Contact.countDocuments({ _id: { $in: clean.otherContactIds }, companyId });
    if (found !== clean.otherContactIds.length) throw new EnterpriseError(400, "One of the other contacts wasn't found");
  }
  if (side === "TENANT" && clean.tenantId) {
    if (!isId(clean.tenantId) || !(await Tenant.exists({ _id: clean.tenantId, companyId }))) throw new EnterpriseError(400, "Tenant not found");
  }
};

const createAgreement = async ({ user, officeId, body }) => {
  const office = await loadOffice(user.companyId, officeId);
  const side = enumOf(body.side, E.AGREEMENT_SIDES, "Side");
  const clean = sanitizeAgreement(body, { side });
  await checkAgreementParties(user.companyId, side, clean);
  if (side === "TENANT" && !clean.tenantId) throw new EnterpriseError(400, "Choose or add the tenant first");
  const agreement = new Agreement({ ...clean, side, officeId: office._id, companyId: user.companyId, createdBy: user._id });
  agreement.agreementCode = await DbCounter.nextCode(user.companyId, side === "OWNER" ? "MLA" : "TAG", 4);
  await agreement.save();
  // The newest owner lease, and the newest tenant agreement, become the office's current ones.
  if (side === "OWNER") office.ownerAgreementId = agreement._id;
  else office.tenantAgreementId = agreement._id;
  office.history.push({ ...by(user), change: `${side === "OWNER" ? "Master lease" : "Tenant agreement"} ${agreement.agreementCode} added` });
  await office.save();
  const schedule = await regenerateSchedule({ user, agreement });
  return { agreement, schedule };
};

const updateAgreement = async ({ user, id, body }) => {
  if (!isId(id)) throw new EnterpriseError(400, "Invalid agreement");
  const agreement = await Agreement.findOne({ _id: id, companyId: user.companyId });
  if (!agreement) throw new EnterpriseError(404, "Agreement not found");
  const clean = sanitizeAgreement(body, { partial: true, side: agreement.side });
  await checkAgreementParties(user.companyId, agreement.side, clean);
  const changes = Object.entries(clean).filter(([k, v]) => JSON.stringify(agreement[k] ?? null) !== JSON.stringify(v ?? null)).map(([k]) => k);
  Object.assign(agreement, clean);
  if (changes.length) agreement.amendments.push({ ...by(user), note: text(body.amendmentNote, 500), changes });
  await agreement.save();
  const schedule = await regenerateSchedule({ user, agreement });
  return { agreement, schedule, changes };
};

/*
 * Rebuild one agreement's expected items from its current terms. Rows anything
 * has happened to, and rows already due, are left exactly as they were; only
 * untouched future rows follow an amendment (2.5).
 */
const regenerateSchedule = async ({ user, agreement }) => {
  const direction = agreement.side === "OWNER" ? "PAYABLE" : "RECEIVABLE";
  const existing = await Obligation.find({ companyId: user.companyId, agreementId: agreement._id }).lean();
  const generated = agreement.status === "DRAFT" ? [] : F.buildSchedule(agreement.toObject ? agreement.toObject() : agreement);
  const plan = F.planRegeneration(existing, generated);
  if (plan.create.length) {
    await Obligation.insertMany(plan.create.map((g) => ({ ...g, companyId: user.companyId, officeId: agreement.officeId, agreementId: agreement._id, direction, generated: true, createdBy: user._id })));
  }
  for (const u of plan.update) {
    // eslint-disable-next-line no-await-in-loop
    await Obligation.updateOne({ _id: u._id }, { $set: { gross: u.gross, taxAmount: u.taxAmount, tdsExpected: u.tdsExpected, dueDate: u.dueDate, periodStart: u.periodStart, periodEnd: u.periodEnd, label: u.label } });
  }
  if (plan.remove.length) await Obligation.deleteMany({ _id: { $in: plan.remove.map((o) => o._id) } });
  return { created: plan.create.length, updated: plan.update.length, removed: plan.remove.length, kept: plan.keep.length };
};

/* ------------------------------------------------------------ tenants -- */

const sanitizeTenant = (body = {}, { partial = false } = {}) => {
  const out = {};
  const take = (k) => !partial || has(body, k);
  if (take("legalName")) { out.legalName = text(body.legalName, 240); if (!out.legalName) throw new EnterpriseError(400, "Enter the tenant's legal name as on the agreement"); }
  if (take("entityType")) out.entityType = enumOf(body.entityType, E.ENTITY_TYPES, "Entity type");
  ["tradeName", "businessAddress", "registeredAddress", "notes"].forEach((k) => { if (take(k)) out[k] = text(body[k], k === "notes" ? 3000 : 500); });
  ["pan", "gstin", "cin", "llpin", "tan"].forEach((k) => { if (take(k)) out[k] = text(body[k], 30).toUpperCase(); });
  if (out.pan && !/^[A-Z]{5}[0-9]{4}[A-Z]$/.test(out.pan)) throw new EnterpriseError(400, "PAN should look like ABCDE1234F");
  if (out.gstin && !/^[0-9]{2}[A-Z0-9]{13}$/.test(out.gstin)) throw new EnterpriseError(400, "GSTIN should be 15 characters");
  if (take("contacts")) {
    out.contacts = (Array.isArray(body.contacts) ? body.contacts : []).slice(0, 40).map((c, i) => {
      const name = text(c.name, 160);
      if (!name) throw new EnterpriseError(400, `Contact ${i + 1} needs a name`);
      return {
        ...(isId(c._id) ? { _id: c._id } : {}),
        role: enumOf(c.role, E.TENANT_CONTACT_ROLES, `Contact ${i + 1} role`, "PRIMARY"),
        name, designation: text(c.designation, 120), phone: text(c.phone, 20), email: text(c.email, 200), notes: text(c.notes, 500), active: c.active !== false,
      };
    });
  }
  return out;
};

const createTenant = async ({ user, body }) => {
  const clean = sanitizeTenant(body);
  const same = await Tenant.findOne({ companyId: user.companyId, legalName: { $regex: `^${clean.legalName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`, $options: "i" } }).select("tenantCode").lean();
  if (same && body.confirmDuplicate !== true) throw new EnterpriseError(409, `A tenant with this legal name already exists (${same.tenantCode}). Use that record.`);
  const tenant = new Tenant({ ...clean, companyId: user.companyId, createdBy: user._id });
  tenant.tenantCode = await DbCounter.nextCode(user.companyId, "TEN", 4);
  await tenant.save();
  return tenant;
};

const updateTenant = async ({ user, id, body }) => {
  if (!isId(id)) throw new EnterpriseError(400, "Invalid tenant");
  const tenant = await Tenant.findOne({ _id: id, companyId: user.companyId });
  if (!tenant) throw new EnterpriseError(404, "Tenant not found");
  Object.assign(tenant, sanitizeTenant(body, { partial: true }));
  await tenant.save();
  return tenant;
};

/* ------------------------------------------------------ checklist / docs -- */

const checklistFor = async (companyId, entityType) => {
  const saved = await Checklist.findOne({ companyId, entityType }).lean();
  return { entityType, items: saved ? saved.items : (E.DEFAULT_CHECKLISTS[entityType] || []), custom: Boolean(saved), sourceNote: saved?.sourceNote || "Company documents handout (Sept 2026)", updatedByName: saved?.updatedByName || "", updatedAt: saved?.updatedAt || null };
};

const saveChecklist = async ({ user, entityType, body }) => {
  if (String(user.role).toUpperCase() !== "ADMIN") throw new EnterpriseError(403, "Only an Admin can change document checklists");
  const type = enumOf(entityType, E.ENTITY_TYPES, "Entity type");
  const keys = new Set();
  const items = (Array.isArray(body.items) ? body.items : []).slice(0, 60).map((it, i) => {
    const label = text(it.label, 200);
    if (!label) throw new EnterpriseError(400, `Item ${i + 1} needs a name`);
    const key = text(it.key, 60) || label.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "").slice(0, 60);
    const unique = `${key}:${it.scope}`;
    if (keys.has(unique)) throw new EnterpriseError(400, `"${label}" is listed twice`);
    keys.add(unique);
    return { key, label, scope: enumOf(it.scope, ["ENTITY", "SIGNATORY", "AGREEMENT"], "Scope"), required: it.required !== false, hint: text(it.hint, 200) };
  });
  return Checklist.findOneAndUpdate({ companyId: user.companyId, entityType: type }, { $set: { items, sourceNote: text(body.sourceNote, 300), updatedBy: user._id, updatedByName: user.name || "" } }, { upsert: true, returnDocument: "after" }).lean();
};

/*
 * A tenant's checklist as rows: entity items once, signatory items once per
 * signing authority (each filed against that person), agreement items against
 * the tenant agreement. Each row carries its document record, if any.
 */
const tenantChecklist = async ({ companyId, tenant, agreementId = null }) => {
  const { items } = await checklistFor(companyId, tenant.entityType);
  const docs = await Doc.find({ companyId, tenantId: tenant._id }).lean();
  const signatories = (tenant.contacts || []).filter((c) => c.role === "SIGNATORY" && c.active !== false);
  const rows = [];
  const find = (key, extra) => docs.find((d) => d.checklistKey === key && String(d.signatoryId || "") === String(extra.signatoryId || "") && (extra.scope !== "AGREEMENT" || String(d.agreementId || "") === String(extra.agreementId || "")));
  items.forEach((it) => {
    if (it.scope === "SIGNATORY") {
      (signatories.length ? signatories : [null]).forEach((s) => {
        const extra = { signatoryId: s?._id || null, scope: "SIGNATORY" };
        rows.push({ ...it, signatoryId: s?._id || null, signatoryName: s?.name || "Add a signing authority", needsSignatory: !s, document: s ? find(it.key, extra) || null : null });
      });
    } else {
      const extra = { scope: it.scope, agreementId: it.scope === "AGREEMENT" ? agreementId : null };
      rows.push({ ...it, signatoryId: null, agreementId: extra.agreementId, document: find(it.key, extra) || null });
    }
  });
  const status = (r) => r.document?.status || "PENDING";
  const required = rows.filter((r) => r.required);
  return {
    rows,
    required: required.length,
    verified: required.filter((r) => ["VERIFIED", "NOT_APPLICABLE"].includes(status(r))).length,
    missing: required.filter((r) => ["PENDING", "REJECTED"].includes(status(r))).length,
    extraDocuments: docs.filter((d) => !d.checklistKey),
  };
};

const PROTECTED_DOC_PREFIX = "/api/uploads/files/enterprise-documents/";

/* Receipts / bills / proof on a payment, deposit entry or fit-out expense (2.5, 2.8, 2.9). */
const sanitizeAttachments = (list, user) => (Array.isArray(list) ? list : []).slice(0, 10).map((a) => {
  const url = text(a?.url, 1000);
  if (!url.startsWith(PROTECTED_DOC_PREFIX)) throw new EnterpriseError(400, "Upload the file to the protected Enterprise documents folder");
  return { url, name: text(a.name, 200), uploadedAt: new Date(), uploadedByName: user?.name || "" };
});

const addAttachment = async ({ user, target, id, body }) => {
  if (!isId(id)) throw new EnterpriseError(400, "Invalid record");
  const Model = target === "transaction" ? Transaction : target === "ledger" ? Ledger : null;
  if (!Model) throw new EnterpriseError(400, "Attach to a payment or a deposit / fit-out entry");
  const row = await Model.findOne({ _id: id, companyId: user.companyId });
  if (!row) throw new EnterpriseError(404, "Record not found");
  const files = sanitizeAttachments([body], user);
  if ((row.attachments || []).length >= 20) throw new EnterpriseError(400, "This record already has 20 files");
  row.attachments.push(...files);
  await row.save();
  return row;
};

/* Add a file (a new version) to a checklist row or a free document. */
const uploadDocument = async ({ user, body }) => {
  const url = text(body.url, 1000);
  if (!url.startsWith(PROTECTED_DOC_PREFIX)) throw new EnterpriseError(400, "Upload the file to the protected Enterprise documents folder");
  const scope = enumOf(body.scope, E.DOCUMENT_SCOPES, "Scope");
  const query = { companyId: user.companyId, scope, checklistKey: text(body.checklistKey, 60) };
  ["officeId", "tenantId", "agreementId", "signatoryId"].forEach((k) => { query[k] = isId(body[k]) ? body[k] : null; });
  if (!query.officeId && !query.tenantId && !query.agreementId) throw new EnterpriseError(400, "Say which office, tenant or agreement this belongs to");
  if (scope === "SIGNATORY" && !query.signatoryId) throw new EnterpriseError(400, "A signatory's document must be filed against that person");
  if (query.tenantId) {
    const tenant = await Tenant.findOne({ _id: query.tenantId, companyId: user.companyId }).select("contacts").lean();
    if (!tenant) throw new EnterpriseError(404, "Tenant not found");
    if (query.signatoryId && !(tenant.contacts || []).some((c) => String(c._id) === String(query.signatoryId) && c.role === "SIGNATORY")) throw new EnterpriseError(400, "That person isn't a signing authority of this tenant");
  }
  if (query.officeId && !(await Office.exists({ _id: query.officeId, companyId: user.companyId }))) throw new EnterpriseError(404, "Office not found");
  if (query.agreementId && !(await Agreement.exists({ _id: query.agreementId, companyId: user.companyId }))) throw new EnterpriseError(404, "Agreement not found");
  let doc = null;
  if (isId(body.documentId)) {
    // A replacement for an office / agreement paper: a new version of the same record.
    doc = await Doc.findOne({ _id: body.documentId, companyId: user.companyId });
    if (!doc) throw new EnterpriseError(404, "Document not found");
  } else if (query.checklistKey) doc = await Doc.findOne(query);
  if (!doc) {
    const label = text(body.label, 200);
    if (!query.checklistKey && !label) throw new EnterpriseError(400, "Name the document (e.g. Lease deed, Electricity bill Oct)");
    doc = new Doc({ ...query, label: label || "Document", category: body.category ? enumOf(body.category, E.DOCUMENT_CATEGORIES, "Category") : "" });
  }
  doc.versions.push({ url, name: text(body.name, 200), uploadedBy: user._id, uploadedByName: user.name || "" });
  doc.status = "UPLOADED";
  doc.reviewedBy = null; doc.reviewedAt = null; doc.reviewedByName = "";
  doc.history.push({ byName: user.name || "", change: `Version ${doc.versions.length} uploaded` });
  await doc.save();
  return doc;
};

/* Review a document: Under review / Verified / Rejected, or mark a checklist item Not applicable. */
const reviewDocument = async ({ user, id, body, rowContext = null }) => {
  const status = enumOf(body.status, E.DOCUMENT_STATUSES, "Document status");
  if (["VERIFIED", "REJECTED", "NOT_APPLICABLE"].includes(status) && !isManager(user)) throw new EnterpriseError(403, "Only Admin or Manager can verify, reject or waive a document");
  let doc;
  if (id && isId(id)) doc = await Doc.findOne({ _id: id, companyId: user.companyId });
  else if (rowContext) {
    // Marking a checklist row Not applicable before any file exists.
    const query = { companyId: user.companyId, scope: enumOf(rowContext.scope, E.DOCUMENT_SCOPES, "Scope"), checklistKey: text(rowContext.checklistKey, 60) };
    ["officeId", "tenantId", "agreementId", "signatoryId"].forEach((k) => { query[k] = isId(rowContext[k]) ? rowContext[k] : null; });
    doc = await Doc.findOne(query) || new Doc({ ...query, label: text(rowContext.label, 200) || "Document" });
  }
  if (!doc) throw new EnterpriseError(404, "Document not found");
  if (status === "VERIFIED" && !doc.versions.length) throw new EnterpriseError(400, "Nothing to verify yet: no file has been uploaded");
  doc.status = status;
  doc.notes = has(body, "notes") ? text(body.notes, 1000) : doc.notes;
  if (["VERIFIED", "REJECTED", "NOT_APPLICABLE"].includes(status)) { doc.reviewedBy = user._id; doc.reviewedByName = user.name || ""; doc.reviewedAt = new Date(); }
  doc.history.push({ byName: user.name || "", change: `Status: ${status}${body.notes ? ` - ${text(body.notes, 200)}` : ""}` });
  await doc.save();
  return doc;
};

/* ------------------------------------------------------- obligations -- */

const createObligation = async ({ user, officeId, body }) => {
  const office = await loadOffice(user.companyId, officeId);
  const direction = enumOf(body.direction, ["PAYABLE", "RECEIVABLE"], "Direction");
  let agreementId = null;
  if (body.agreementId) {
    const a = await Agreement.findOne({ _id: body.agreementId, companyId: user.companyId, officeId: office._id }).select("_id side").lean();
    if (!a) throw new EnterpriseError(400, "Agreement not found on this office");
    if ((a.side === "OWNER") !== (direction === "PAYABLE")) throw new EnterpriseError(400, "That agreement is on the other side");
    agreementId = a._id;
  }
  const gross = money(body.gross, "Amount", { allowNull: false });
  const gstPercent = pct(body.gstPercent, "GST %");
  const ob = await Obligation.create({
    companyId: user.companyId, officeId: office._id, agreementId, direction,
    chargeType: enumOf(body.chargeType, E.CHARGE_TYPES, "Charge type", "OTHER"),
    label: text(body.label, 160) || "Charge",
    dueDate: dateOf(body.dueDate, "Due date", { required: true }),
    periodStart: dateOf(body.periodStart, "Period start"), periodEnd: dateOf(body.periodEnd, "Period end"),
    gross, taxAmount: gstPercent ? F.round2((gross * gstPercent) / 100) : money(body.taxAmount, "Tax") || 0,
    tdsExpected: money(body.tdsExpected, "Expected TDS") || 0,
    billReference: text(body.billReference, 200), notes: text(body.notes, 1000), generated: false, createdBy: user._id,
  });
  return ob;
};

/*
 * Recover a landlord's actual maintenance (or other) bill from the tenant -
 * only if the tenant agreement allows it: actual-cost recovery, or a fixed
 * charge with pass-through allowed (2.7). A landlord increase is never passed
 * on automatically.
 */
const recoverFromTenant = async ({ user, obligationId, body = {} }) => {
  if (!isId(obligationId)) throw new EnterpriseError(400, "Invalid item");
  const source = await Obligation.findOne({ _id: obligationId, companyId: user.companyId, direction: "PAYABLE" }).lean();
  if (!source) throw new EnterpriseError(404, "Landlord item not found");
  const office = await Office.findOne({ _id: source.officeId, companyId: user.companyId }).select("tenantAgreementId").lean();
  const ta = office?.tenantAgreementId ? await Agreement.findOne({ _id: office.tenantAgreementId, companyId: user.companyId }).lean() : null;
  if (!ta || !["ACTIVE", "NOTICE"].includes(ta.status)) throw new EnterpriseError(400, "There is no active tenant agreement to recover this from");
  const allowed = ta.maintenance?.method === "ACTUAL" || ta.maintenance?.passThroughAllowed === true;
  if (!allowed) throw new EnterpriseError(400, "The tenant agreement doesn't allow passing this cost on (its maintenance is not actual-cost and pass-through is not allowed)");
  const amount = has(body, "amount") ? money(body.amount, "Amount", { allowNull: false }) : source.gross;
  return createObligation({ user, officeId: source.officeId, body: {
    direction: "RECEIVABLE", agreementId: ta._id, chargeType: source.chargeType, label: `${source.label || source.chargeType} (recovered)`,
    dueDate: body.dueDate || source.dueDate, gross: amount, gstPercent: ta.gstPercent, billReference: source.billReference || String(source._id), notes: text(body.notes, 500),
  } });
};

const loadObligation = async (companyId, id) => {
  if (!isId(id)) throw new EnterpriseError(400, "Invalid item");
  const ob = await Obligation.findOne({ _id: id, companyId });
  if (!ob) throw new EnterpriseError(404, "Item not found");
  return ob;
};

/* A promise to pay is a follow-up, not a payment: the balance stays (2.5). */
const addPromise = async ({ user, id, body }) => {
  const ob = await loadObligation(user.companyId, id);
  ob.promises.push({ promisedDate: dateOf(body.promisedDate, "Promised date", { required: true }), amount: money(body.amount, "Promised amount"), note: text(body.note, 500), ...by(user) });
  await ob.save();
  return ob;
};
const addFollowUp = async ({ user, id, body }) => {
  const ob = await loadObligation(user.companyId, id);
  ob.followUps.push({ note: text(body.note, 1000), nextFollowUpAt: dateOf(body.nextFollowUpAt, "Next follow-up"), ...by(user) });
  await ob.save();
  return ob;
};
const setDispute = async ({ user, id, body }) => {
  const ob = await loadObligation(user.companyId, id);
  ob.disputed = Boolean(body.disputed);
  ob.disputeReason = ob.disputed ? text(body.reason, 500) : "";
  if (ob.disputed && !ob.disputeReason) throw new EnterpriseError(400, "Say what is disputed");
  ob.followUps.push({ note: ob.disputed ? `Disputed: ${ob.disputeReason}` : "Dispute closed", ...by(user) });
  await ob.save();
  return ob;
};
/* Waive or adjust part of an item: Admin / Manager, always with a reason (2.5). */
const addAdjustment = async ({ user, id, body }) => {
  if (!isManager(user)) throw new EnterpriseError(403, "Only Admin or Manager can waive or adjust an amount");
  const ob = await loadObligation(user.companyId, id);
  const amount = money(body.amount, "Adjustment", { allowNull: false });
  const reason = text(body.reason, 500);
  if (!reason) throw new EnterpriseError(400, "Give a reason for the adjustment");
  const view = F.obligationView(ob.toObject());
  if (amount > view.balance + 0.009) throw new EnterpriseError(400, `Only ${view.balance} is outstanding`);
  ob.adjustments.push({ amount, kind: body.kind === "WAIVER" ? "WAIVER" : "ADJUSTMENT", reason, ...by(user) });
  await ob.save();
  return ob;
};

/* ------------------------------------------------------- transactions -- */

const sanitizeAllocations = (list) => (Array.isArray(list) ? list : []).slice(0, 200).map((a) => {
  if (!isId(a.obligationId)) throw new EnterpriseError(400, "Invalid item in the allocation");
  return { obligationId: a.obligationId, cash: money(a.cash, "Allocated cash") || 0, tds: money(a.tds, "Allocated TDS") || 0 };
}).filter((a) => a.cash > 0 || a.tds > 0);

const applyAllocations = async ({ user, tx, allocations }) => {
  if (!allocations.length) return;
  const ids = allocations.map((a) => a.obligationId);
  const obligations = await Obligation.find({ _id: { $in: ids }, companyId: user.companyId });
  // Check against what's already allocated on this transaction too.
  const prior = { ...tx.toObject(), amount: F.round2(tx.amount - tx.allocations.reduce((s, x) => s + x.cash, 0)), tdsAmount: F.round2((tx.tdsAmount || 0) - tx.allocations.reduce((s, x) => s + x.tds, 0)) };
  F.validateAllocations({ transaction: prior, allocations, obligations: obligations.map((o) => o.toObject()) });
  for (const a of allocations) {
    const ob = obligations.find((o) => String(o._id) === String(a.obligationId));
    ob.settlements.push({ transactionId: tx._id, cash: a.cash, tds: a.tds, at: tx.date });
    // eslint-disable-next-line no-await-in-loop
    await ob.save();
    const existing = tx.allocations.find((x) => String(x.obligationId) === String(a.obligationId));
    if (existing) { existing.cash = F.round2(existing.cash + a.cash); existing.tds = F.round2(existing.tds + a.tds); } else tx.allocations.push(a);
  }
  await tx.save();
};

const recordTransaction = async ({ user, officeId, body }) => {
  const office = await loadOffice(user.companyId, officeId);
  const tx = new Transaction({
    companyId: user.companyId, officeId: office._id,
    direction: enumOf(body.direction, ["PAYABLE", "RECEIVABLE"], "Direction"),
    date: dateOf(body.date, "Payment date", { required: true }),
    amount: money(body.amount, "Amount", { allowNull: false }),
    tdsAmount: money(body.tdsAmount, "TDS") || 0,
    mode: enumOf(body.mode, E.PAYMENT_MODES, "Payment mode", "BANK_TRANSFER"),
    reference: text(body.reference, 200), bankReference: text(body.bankReference, 200), tdsCertificateRef: text(body.tdsCertificateRef, 200), notes: text(body.notes, 1000),
    attachments: sanitizeAttachments(body.attachments, user),
    enteredBy: user._id, enteredByName: user.name || "",
  });
  if (tx.amount + tx.tdsAmount <= 0) throw new EnterpriseError(400, "Enter the amount paid");
  const allocations = sanitizeAllocations(body.allocations);
  // Validate before saving anything, so a bad allocation leaves no half payment.
  if (allocations.length) {
    const obligations = await Obligation.find({ _id: { $in: allocations.map((a) => a.obligationId) }, companyId: user.companyId }).lean();
    F.validateAllocations({ transaction: tx.toObject(), allocations, obligations });
  }
  await tx.save();
  await applyAllocations({ user, tx, allocations });
  return F.transactionView(tx.toObject());
};

const allocateTransaction = async ({ user, id, body }) => {
  if (!isId(id)) throw new EnterpriseError(400, "Invalid payment");
  const tx = await Transaction.findOne({ _id: id, companyId: user.companyId });
  if (!tx) throw new EnterpriseError(404, "Payment not found");
  await applyAllocations({ user, tx, allocations: sanitizeAllocations(body.allocations) });
  return F.transactionView(tx.toObject());
};

/* -------------------------------------------------- deposits / fit-out -- */

const addLedgerEntry = async ({ user, officeId, body }) => {
  const office = await loadOffice(user.companyId, officeId);
  const kind = enumOf(body.kind, ["DEPOSIT", "EXPENSE"], "Entry kind");
  const base = {
    companyId: user.companyId, officeId: office._id, kind,
    date: dateOf(body.date, "Date", { required: true }),
    amount: money(body.amount, "Amount", { allowNull: false }),
    reference: text(body.reference, 200), proofUrl: text(body.proofUrl, 1000), notes: text(body.notes, 1000),
    attachments: sanitizeAttachments(body.attachments, user),
    enteredBy: user._id, enteredByName: user.name || "",
  };
  if (kind === "DEPOSIT") {
    const side = enumOf(body.side, E.AGREEMENT_SIDES, "Side");
    const entryType = enumOf(body.entryType, E.DEPOSIT_ENTRY_TYPES, "Entry type");
    if (side === "OWNER" && entryType === "COLLECTED") throw new EnterpriseError(400, "On the owner side the company pays the deposit (Paid), it doesn't collect it");
    if (side === "TENANT" && entryType === "PAID") throw new EnterpriseError(400, "On the tenant side the company collects the deposit (Collected)");
    const reason = text(body.reason, 500);
    if (["DEDUCTION", "ADJUSTMENT"].includes(entryType) && !reason) throw new EnterpriseError(400, "Give a reason for the deduction or adjustment");
    if (["REFUND", "DEDUCTION", "ADJUSTMENT"].includes(entryType)) {
      const entries = await Ledger.find({ companyId: user.companyId, officeId: office._id, kind: "DEPOSIT" }).lean();
      const ledger = F.depositLedger(entries, side);
      if (base.amount > ledger.outstanding + 0.009) throw new EnterpriseError(400, `Only ${ledger.outstanding} of this deposit is still held`);
    }
    return Ledger.create({ ...base, side, entryType, reason, agreementId: isId(body.agreementId) ? body.agreementId : null, expectedSettlementDate: dateOf(body.expectedSettlementDate, "Expected settlement date") });
  }
  const amountPaid = money(body.amountPaid, "Amount paid") || 0;
  if (amountPaid > base.amount) throw new EnterpriseError(400, "Paid can't be more than the bill");
  return Ledger.create({
    ...base,
    category: enumOf(body.category, E.EXPENSE_CATEGORIES, "Category", "OTHER"),
    vendor: text(body.vendor, 200), amountPaid,
    paymentStatus: amountPaid >= base.amount ? "PAID" : amountPaid > 0 ? "PARTIALLY_PAID" : "OUTSTANDING",
    warrantyUntil: dateOf(body.warrantyUntil, "Warranty until"),
  });
};

const updateExpense = async ({ user, id, body }) => {
  if (!isId(id)) throw new EnterpriseError(400, "Invalid entry");
  const row = await Ledger.findOne({ _id: id, companyId: user.companyId, kind: "EXPENSE" });
  if (!row) throw new EnterpriseError(404, "Expense not found");
  if (has(body, "amountPaid")) {
    const paid = money(body.amountPaid, "Amount paid") || 0;
    if (paid > row.amount) throw new EnterpriseError(400, "Paid can't be more than the bill");
    row.amountPaid = paid;
    row.paymentStatus = paid >= row.amount ? "PAID" : paid > 0 ? "PARTIALLY_PAID" : "OUTSTANDING";
  }
  ["vendor", "notes", "reference", "proofUrl"].forEach((k) => { if (has(body, k)) row[k] = text(body[k], k === "proofUrl" ? 1000 : 500); });
  await row.save();
  return row;
};

/* ------------------------------------------------------------- views -- */

const loadOfficeBundle = async (companyId, officeIds) => {
  const ids = officeIds.map((id) => new mongoose.Types.ObjectId(String(id)));
  const [agreements, obligations, ledger, tenants] = await Promise.all([
    Agreement.find({ companyId, officeId: { $in: ids } }).lean(),
    Obligation.find({ companyId, officeId: { $in: ids } }).sort({ dueDate: 1 }).lean(),
    Ledger.find({ companyId, officeId: { $in: ids } }).lean(),
    Tenant.find({ companyId }).select("_id legalName tradeName entityType contacts tenantCode").lean(),
  ]);
  return { agreements, obligations, ledger, tenants };
};

const summarizeOffice = async ({ companyId, office, bundle, today = new Date(), withChecklist = true }) => {
  const agreements = bundle.agreements.filter((a) => String(a.officeId) === String(office._id));
  const ownerAgreement = agreements.find((a) => String(a._id) === String(office.ownerAgreementId)) || null;
  const tenantAgreement = agreements.find((a) => String(a._id) === String(office.tenantAgreementId)) || null;
  const tenant = tenantAgreement ? bundle.tenants.find((t) => String(t._id) === String(tenantAgreement.tenantId)) || null : null;
  const obligations = bundle.obligations.filter((o) => String(o.officeId) === String(office._id)).map((o) => F.obligationView(o, today));
  const ledger = bundle.ledger.filter((l) => String(l.officeId) === String(office._id));
  const deposits = {
    OWNER: F.depositLedger(ledger.filter((l) => l.kind === "DEPOSIT"), "OWNER", ownerAgreement?.depositRequired ?? null),
    TENANT: F.depositLedger(ledger.filter((l) => l.kind === "DEPOSIT"), "TENANT", tenantAgreement?.depositRequired ?? null),
  };
  if (ownerAgreement?.depositExpectedSettlementDate && !deposits.OWNER.expectedSettlementDate) deposits.OWNER.expectedSettlementDate = ownerAgreement.depositExpectedSettlementDate;
  if (tenantAgreement?.depositExpectedSettlementDate && !deposits.TENANT.expectedSettlementDate) deposits.TENANT.expectedSettlementDate = tenantAgreement.depositExpectedSettlementDate;
  const fitOut = F.fitOutSummary(office, ledger.filter((l) => l.kind === "EXPENSE"));
  const checklist = withChecklist && tenant ? await tenantChecklist({ companyId, tenant, agreementId: tenantAgreement?._id || null }) : null;
  const month = (dir) => {
    const t = F.startOfDay(today);
    const start = new Date(Date.UTC(t.getUTCFullYear(), t.getUTCMonth(), 1));
    const end = new Date(Date.UTC(t.getUTCFullYear(), t.getUTCMonth() + 1, 0));
    return F.round2(obligations.filter((o) => o.direction === dir && new Date(o.dueDate) >= start && new Date(o.dueDate) <= end).reduce((a, o) => a + o.totalDue, 0));
  };
  const outstanding = (dir, overdueOnly) => F.round2(obligations.filter((o) => o.direction === dir && o.balance > 0 && (!overdueOnly || o.daysOverdue > 0)).reduce((a, o) => a + o.balance, 0));
  const alerts = F.officeAlerts({ office, ownerAgreement, tenantAgreement, obligations, deposits, missingDocuments: checklist?.missing || 0, today });
  return {
    office,
    ownerAgreement,
    tenantAgreement,
    tenant,
    obligations,
    deposits,
    fitOut,
    checklist,
    alerts,
    metrics: F.officeMetrics({ ownerAgreement, tenantAgreement, fitOut, today }),
    financial: {
      payableThisMonth: month("PAYABLE"),
      receivableThisMonth: month("RECEIVABLE"),
      payableOutstanding: outstanding("PAYABLE", false),
      receivableOutstanding: outstanding("RECEIVABLE", false),
      payableOverdue: outstanding("PAYABLE", true),
      receivableOverdue: outstanding("RECEIVABLE", true),
    },
  };
};

const listOffices = async ({ user, today = new Date() }) => {
  const offices = await Office.find({ companyId: user.companyId }).populate("assignedTo", "name").sort({ officeCode: 1 }).lean();
  if (!offices.length) return { offices: [] };
  const bundle = await loadOfficeBundle(user.companyId, offices.map((o) => o._id));
  const rows = [];
  for (const office of offices) {
    // eslint-disable-next-line no-await-in-loop
    const s = await summarizeOffice({ companyId: user.companyId, office, bundle, today });
    rows.push({ ...office, tenantName: s.tenant?.tradeName || s.tenant?.legalName || "", ownerAgreementStatus: s.ownerAgreement?.status || "", tenantAgreementStatus: s.tenantAgreement?.status || "", financial: s.financial, fitOut: s.fitOut, alertCount: s.alerts.length, highAlerts: s.alerts.filter((a) => a.severity === "high").length });
  }
  return { offices: rows };
};

const officeDetail = async ({ user, id, today = new Date() }) => {
  const office = (await loadOffice(user.companyId, id)).toObject();
  const bundle = await loadOfficeBundle(user.companyId, [office._id]);
  const s = await summarizeOffice({ companyId: user.companyId, office, bundle, today });
  const [transactions, documents, landlord, building, inventory, assignedUser, otherContacts] = await Promise.all([
    Transaction.find({ companyId: user.companyId, officeId: office._id }).sort({ date: -1 }).limit(500).lean(),
    Doc.find({ companyId: user.companyId, $or: [{ officeId: office._id }, ...(s.tenant ? [{ tenantId: s.tenant._id }] : [])] }).sort({ updatedAt: -1 }).lean(),
    s.ownerAgreement?.landlordContactId ? Contact.findOne({ _id: s.ownerAgreement.landlordContactId, companyId: user.companyId }).select("name phone contactCode company").lean() : null,
    office.buildingId ? require("../models/Building").findOne({ _id: office.buildingId, companyId: user.companyId }).select("name buildingCode address").lean() : null,
    office.inventoryId ? require("../models/Inventory").findOne({ _id: office.inventoryId, companyId: user.companyId }).select("propertyId projectName unitNumber").lean() : null,
    office.assignedTo ? require("../models/User").findOne({ _id: office.assignedTo, companyId: user.companyId }).select("name role").lean() : null,
    s.ownerAgreement?.otherContactIds?.length ? Contact.find({ _id: { $in: s.ownerAgreement.otherContactIds }, companyId: user.companyId }).select("name phone kind roles contactCode").lean() : [],
  ]);
  const agreements = bundle.agreements.filter((a) => String(a.officeId) === String(office._id)).sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  return {
    ...s,
    landlord,
    otherContacts,
    assignedUser,
    reminders: await Reminder.find({ companyId: user.companyId, officeId: office._id, status: "OPEN" }).sort({ dueDate: 1 }).lean(),
    building,
    inventory,
    agreements,
    tenantHistory: agreements.filter((a) => a.side === "TENANT").map((a) => ({ ...a, tenant: bundle.tenants.find((t) => String(t._id) === String(a.tenantId)) || null })),
    escalations: {
      OWNER: s.ownerAgreement ? F.escalationSchedule(s.ownerAgreement) : [],
      TENANT: s.tenantAgreement ? F.escalationSchedule(s.tenantAgreement) : [],
    },
    transactions: transactions.map(F.transactionView),
    documents,
    ledger: bundle.ledger.filter((l) => String(l.officeId) === String(office._id)).sort((a, b) => new Date(b.date) - new Date(a.date)),
  };
};

/* Portfolio dashboard (2.10). */
const dashboard = async ({ user, today = new Date() }) => {
  const offices = await Office.find({ companyId: user.companyId }).lean();
  const bundle = offices.length ? await loadOfficeBundle(user.companyId, offices.map((o) => o._id)) : null;
  const summaries = [];
  for (const office of offices) {
    // eslint-disable-next-line no-await-in-loop
    summaries.push(await summarizeOffice({ companyId: user.companyId, office, bundle, today }));
  }
  const sum = (fn) => F.round2(summaries.reduce((a, s) => a + (fn(s) || 0), 0));
  const t = F.startOfDay(today);
  const in30 = F.addDays(t, 30);
  const upcoming = summaries.flatMap((s) => s.obligations.filter((o) => o.balance > 0 && new Date(o.dueDate) >= t && new Date(o.dueDate) <= in30).map((o) => ({ ...o, officeName: s.office.name })));
  const collections = summaries.flatMap((s) => s.obligations.filter((o) => o.direction === "RECEIVABLE" && o.daysOverdue > 0).map((o) => ({
    _id: o._id, officeId: s.office._id, officeName: s.office.name, tenantName: s.tenant?.tradeName || s.tenant?.legalName || "", label: o.label, dueDate: o.dueDate, balance: o.balance, daysOverdue: o.daysOverdue, status: o.status,
    lastContact: o.lastFollowUp?.at || null, promisedDate: o.latestPromise?.promisedDate || null, nextFollowUpAt: o.nextFollowUpAt, assignedTo: s.office.assignedTo || null,
  }))).sort((a, b) => b.daysOverdue - a.daysOverdue);
  return {
    generatedAt: new Date(),
    portfolio: {
      offices: offices.length,
      occupied: offices.filter((o) => o.operationalStatus === "OCCUPIED").length,
      vacant: offices.filter((o) => E.VACANT_STATUSES.includes(o.operationalStatus)).length,
      occupancyPercent: offices.length ? Math.round((offices.filter((o) => o.operationalStatus === "OCCUPIED").length / offices.length) * 100) : 0,
    },
    thisMonth: { payable: sum((s) => s.financial.payableThisMonth), receivable: sum((s) => s.financial.receivableThisMonth) },
    overdue: { payable: sum((s) => s.financial.payableOverdue), receivable: sum((s) => s.financial.receivableOverdue) },
    upcoming30: { payable: F.round2(upcoming.filter((o) => o.direction === "PAYABLE").reduce((a, o) => a + o.balance, 0)), receivable: F.round2(upcoming.filter((o) => o.direction === "RECEIVABLE").reduce((a, o) => a + o.balance, 0)), items: upcoming.length },
    deposits: { heldByLandlords: sum((s) => s.deposits.OWNER.outstanding), owedToTenants: sum((s) => s.deposits.TENANT.outstanding) },
    fitOut: { budget: sum((s) => s.fitOut.budget), actual: sum((s) => s.fitOut.actual) },
    monthlyContribution: sum((s) => s.metrics.operatingContributionMonthly),
    collections,
    alerts: summaries.flatMap((s) => s.alerts).slice(0, 200),
    officesNeedingAction: summaries.filter((s) => s.alerts.some((a) => a.severity === "high")).map((s) => ({ _id: s.office._id, name: s.office.name, officeCode: s.office.officeCode, high: s.alerts.filter((a) => a.severity === "high").length })),
  };
};

/* Rows for the Excel report (2.10), filtered by office and date range. */
const report = async ({ user, query = {}, today = new Date() }) => {
  const from = query.from ? dateOf(query.from, "From") : null;
  const to = query.to ? dateOf(query.to, "To") : null;
  const filter = { companyId: user.companyId };
  if (isId(query.officeId)) filter._id = query.officeId;
  const offices = await Office.find(filter).lean();
  const bundle = offices.length ? await loadOfficeBundle(user.companyId, offices.map((o) => o._id)) : { agreements: [], obligations: [], ledger: [], tenants: [] };
  const inRange = (d) => (!from || new Date(d) >= from) && (!to || new Date(d) <= to);
  const officeName = new Map(offices.map((o) => [String(o._id), `${o.officeCode} ${o.name}`]));
  const summaries = [];
  for (const office of offices) {
    // eslint-disable-next-line no-await-in-loop
    summaries.push(await summarizeOffice({ companyId: user.companyId, office, bundle, today, withChecklist: false }));
  }
  const transactions = await Transaction.find({ companyId: user.companyId, officeId: { $in: offices.map((o) => o._id) } }).lean();
  return {
    from, to,
    offices: summaries.map((s) => ({ office: officeName.get(String(s.office._id)), status: s.office.operationalStatus, tenant: s.tenant?.legalName || "", ownerRent: s.metrics.ownerRentMonthly, tenantRent: s.metrics.tenantRentMonthly, contribution: s.metrics.operatingContributionMonthly, fitOutBudget: s.fitOut.budget, fitOutActual: s.fitOut.actual, paybackMonths: s.metrics.paybackMonths, payableOverdue: s.financial.payableOverdue, receivableOverdue: s.financial.receivableOverdue })),
    obligations: summaries.flatMap((s) => s.obligations.filter((o) => inRange(o.dueDate)).map((o) => ({ office: officeName.get(String(o.officeId)), side: o.direction, type: o.chargeType, label: o.label, dueDate: o.dueDate, gross: o.gross, tax: o.taxAmount, tdsExpected: o.tdsExpected, cashSettled: o.paidCash, tdsSettled: o.paidTds, adjusted: o.adjusted, balance: o.balance, status: o.status, daysOverdue: o.daysOverdue }))),
    transactions: transactions.filter((t) => inRange(t.date)).map((t) => ({ ...F.transactionView(t), office: officeName.get(String(t.officeId)) })),
    deposits: summaries.flatMap((s) => ["OWNER", "TENANT"].map((side) => ({ office: officeName.get(String(s.office._id)), side, ...s.deposits[side], entries: undefined }))),
    fitOut: bundle.ledger.filter((l) => l.kind === "EXPENSE" && inRange(l.date)).map((l) => ({ office: officeName.get(String(l.officeId)), date: l.date, category: l.category, vendor: l.vendor, amount: l.amount, paid: l.amountPaid, status: l.paymentStatus })),
    deadlines: summaries.flatMap((s) => s.alerts.filter((a) => ["LEASE_EXPIRY", "ESCALATION", "LOCK_IN_END", "NOTICE_DEADLINE", "NOTICE_RUNNING"].includes(a.type))),
    maintenance: summaries.map((s) => {
      const m = (dir) => s.obligations.filter((o) => o.direction === dir && o.chargeType === "MAINTENANCE" && inRange(o.dueDate));
      return { office: officeName.get(String(s.office._id)), ownerBilled: F.round2(m("PAYABLE").reduce((a, o) => a + o.totalDue, 0)), ownerPaid: F.round2(m("PAYABLE").reduce((a, o) => a + o.settled, 0)), tenantBilled: F.round2(m("RECEIVABLE").reduce((a, o) => a + o.totalDue, 0)), tenantCollected: F.round2(m("RECEIVABLE").reduce((a, o) => a + o.settled, 0)), variance: F.round2(m("RECEIVABLE").reduce((a, o) => a + o.totalDue, 0) - m("PAYABLE").reduce((a, o) => a + o.totalDue, 0)) };
    }),
  };
};

/* ---------------------------------------------------------- reminders -- */

const isoDay = (d) => (d ? F.startOfDay(d).toISOString().slice(0, 10) : "");
const weekOf = (d) => { const t = F.startOfDay(d); return isoDay(F.addDays(t, -((t.getUTCDay() + 6) % 7))); };

/*
 * The same alert gives the same key, so it is sent once. Overdue money is
 * reminded again each week, a vacant office each month, while it lasts.
 */
const reminderKey = (alert, office, today) => {
  const base = `${office._id}:${alert.type}`;
  if (["OVERDUE_COLLECTION", "OVERDUE_PAYABLE"].includes(alert.type)) return `${base}:week-${weekOf(today)}`;
  if (alert.type === "VACANT_EXPOSURE") return `${base}:month-${isoDay(today).slice(0, 7)}`;
  return `${base}:${alert.message}:${isoDay(alert.date)}`.slice(0, 300);
};

/*
 * Reminder sweep (2.10, "operational reminders"): works out every office's
 * alerts, files each new one as a reminder for the Admin, Managers and the
 * office's assigned employee, and sends it to their phones / browsers when
 * push is set up. Reminders whose alert has gone are cleared.
 */
const runReminders = async ({ companyId = null, today = new Date() } = {}) => {
  const push = require("./push.service");
  const User = require("../models/User");
  const companies = companyId ? [companyId] : await Office.distinct("companyId");
  let created = 0;
  let cleared = 0;
  for (const cid of companies) {
    // eslint-disable-next-line no-await-in-loop
    const offices = await Office.find({ companyId: cid }).lean();
    if (!offices.length) continue;
    // eslint-disable-next-line no-await-in-loop
    const [bundle, managers] = await Promise.all([
      loadOfficeBundle(cid, offices.map((o) => o._id)),
      User.find({ companyId: cid, role: { $in: E.ENTERPRISE_ROLES }, isActive: { $ne: false } }).select("_id").lean(),
    ]);
    const seen = [];
    for (const office of offices) {
      // eslint-disable-next-line no-await-in-loop
      const s = await summarizeOffice({ companyId: cid, office, bundle, today, withChecklist: false });
      for (const alert of s.alerts.filter((a) => E.REMINDER_TYPES.includes(a.type))) {
        const key = reminderKey(alert, office, today);
        seen.push(key);
        // eslint-disable-next-line no-await-in-loop
        const existing = await Reminder.findOne({ companyId: cid, key });
        if (existing) {
          if (existing.status !== "DONE") {
            Object.assign(existing, { status: "OPEN", lastSeenAt: new Date(), message: alert.message, amount: alert.amount ?? null, severity: alert.severity });
            // eslint-disable-next-line no-await-in-loop
            await existing.save();
          }
          continue;
        }
        const users = [...new Set([...managers.map((u) => String(u._id)), office.assignedTo ? String(office.assignedTo) : ""].filter(Boolean))];
        try {
          // eslint-disable-next-line no-await-in-loop
          await Reminder.create({
            companyId: cid, officeId: office._id, officeName: office.name, key, type: alert.type, severity: alert.severity, message: alert.message,
            dueDate: alert.date || null, amount: alert.amount ?? null, notifiedUserIds: users, notifiedAt: new Date(),
          });
        } catch (error) {
          if (error.code === 11000) continue;
          throw error;
        }
        created += 1;
        const when = alert.date ? ` · ${new Date(alert.date).toLocaleDateString("en-IN")}` : "";
        const amount = alert.amount ? ` · Rs ${Number(alert.amount).toLocaleString("en-IN")}` : "";
        push.sendToUsers(users, { title: `${office.name}: ${alert.message}`, body: `Enterprise Leasing${when}${amount}`, url: `/enterprise/offices/${office._id}`, tag: `enterprise-${office._id}-${alert.type}` }).catch(() => {});
      }
    }
    // eslint-disable-next-line no-await-in-loop
    const gone = await Reminder.updateMany({ companyId: cid, status: "OPEN", key: { $nin: seen } }, { $set: { status: "CLEARED" } });
    cleared += gone.modifiedCount || 0;
  }
  return { created, cleared };
};

const listReminders = async ({ user, query = {} }) => {
  const status = ["OPEN", "DONE", "CLEARED"].includes(String(query.status || "").toUpperCase()) ? String(query.status).toUpperCase() : "OPEN";
  const filter = { companyId: user.companyId, status };
  if (isId(query.officeId)) filter.officeId = query.officeId;
  const rows = await Reminder.find(filter).sort({ dueDate: 1, createdAt: -1 }).limit(300).lean();
  const order = { high: 0, medium: 1, low: 2 };
  return { reminders: rows.sort((a, b) => (order[a.severity] ?? 3) - (order[b.severity] ?? 3)) };
};

const markReminderDone = async ({ user, id, body = {} }) => {
  if (!isId(id)) throw new EnterpriseError(400, "Invalid reminder");
  const row = await Reminder.findOne({ _id: id, companyId: user.companyId });
  if (!row) throw new EnterpriseError(404, "Reminder not found");
  row.status = "DONE";
  row.doneBy = user._id; row.doneByName = user.name || ""; row.doneAt = new Date(); row.doneNote = text(body.note, 500);
  await row.save();
  return row;
};

module.exports = {
  addAttachment,
  runReminders,
  listReminders,
  markReminderDone,
  EnterpriseError,
  sanitizeOffice,
  createOffice,
  updateOffice,
  sanitizeAgreement,
  createAgreement,
  updateAgreement,
  regenerateSchedule,
  sanitizeTenant,
  createTenant,
  updateTenant,
  checklistFor,
  saveChecklist,
  tenantChecklist,
  uploadDocument,
  reviewDocument,
  createObligation,
  recoverFromTenant,
  addPromise,
  addFollowUp,
  setDispute,
  addAdjustment,
  recordTransaction,
  allocateTransaction,
  addLedgerEntry,
  updateExpense,
  listOffices,
  officeDetail,
  dashboard,
  report,
};
