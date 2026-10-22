/*
 * Brokers, channel partners, owners and where inventory comes from
 * (requirements 16 Oct 2026, sections 06, 07 and 17).
 *
 * The rules that matter:
 *   - one person, one record: duplicates are detected by phone (and RERA
 *     number) and merged, never copied;
 *   - one unit, one inventory record: several brokers offering it become
 *     several source links on it;
 *   - net rates, brokerage terms and internal remarks are visible to
 *     Admin/Manager only;
 *   - a broker tagged with segments is visible to people in those segments;
 *     management sees all.
 */
const mongoose = require("mongoose");
const Contact = require("../models/CrmContact");
const BrokerFirm = require("../models/BrokerFirm");
const Inventory = require("../models/Inventory");
const Lead = require("../models/Lead");
const { normalizePhone } = require("./crmContact.service");
const R = require("../constants/relationship.constants");

class RelationshipError extends Error {
  constructor(statusCode, message) {
    super(message);
    this.statusCode = statusCode;
  }
}

const canSeeRestricted = (user) => R.RESTRICTED_VIEW_ROLES.includes(String(user?.role || "").toUpperCase());
const isManagement = canSeeRestricted;

/* The user's segment(s), from User.roleType. BOTH = commercial + residential. */
const userSegments = (user) => {
  const t = String(user?.roleType || "").toUpperCase();
  if (t === "BOTH") return ["COMMERCIAL", "RESIDENTIAL"];
  return R.SEGMENTS.includes(t) ? [t] : [];
};

/* Mongo clause limiting brokers to the user's segments (untagged brokers stay visible). */
const segmentVisibilityClause = (user) => {
  if (isManagement(user)) return null;
  const segs = userSegments(user);
  if (!segs.length) return null;
  return { $or: [{ segments: { $size: 0 } }, { segments: { $exists: false } }, { segments: { $in: segs } }] };
};

const canSeeContact = (contact, user) => {
  if (!contact) return false;
  if (isManagement(user)) return true;
  const segs = userSegments(user);
  if (!segs.length || !contact.segments?.length) return true;
  return contact.segments.some((s) => segs.includes(s));
};

const stripRestrictedContact = (contact, user) => {
  if (!contact) return contact;
  const row = typeof contact.toObject === "function" ? contact.toObject() : { ...contact };
  if (!canSeeRestricted(user)) R.RESTRICTED_CONTACT_FIELDS.forEach((f) => { delete row[f]; });
  delete row.blockedLeads;
  return row;
};

const stripRestrictedInventory = (inventory, user) => {
  if (!inventory) return inventory;
  const row = typeof inventory.toObject === "function" ? inventory.toObject() : { ...inventory };
  if (!canSeeRestricted(user) && Array.isArray(row.sourceLinks)) {
    row.sourceLinks = row.sourceLinks.map(({ netRate, ...rest }) => rest);
  }
  return row;
};

const daysBetween = (a, b) => Math.floor((b.getTime() - a.getTime()) / 86400000);

/* True when the date is missing or older than the stale threshold. */
const isStale = (date, now = new Date(), days = R.STALE_AFTER_DAYS) => {
  if (!date) return true;
  const d = new Date(date);
  if (Number.isNaN(d.getTime())) return true;
  return daysBetween(d, now) > days;
};

const staleCutoff = (now = new Date(), days = R.STALE_AFTER_DAYS) => new Date(now.getTime() - days * 86400000);

/* --------------------------------------------------- input cleaning -- */

const cleanText = (v, max) => String(v ?? "").trim().slice(0, max);
const cleanList = (v, max = 50, itemMax = 160) => {
  const raw = Array.isArray(v) ? v : String(v ?? "").split(",");
  return [...new Set(raw.map((x) => String(x ?? "").trim().slice(0, itemMax)).filter(Boolean))].slice(0, max);
};
const cleanEnumList = (v, allowed, field) => {
  const list = cleanList(v).map((x) => x.toUpperCase().replace(/[\s-]+/g, "_"));
  const bad = list.find((x) => !allowed.includes(x));
  if (bad) throw new RelationshipError(400, `${field}: "${bad}" is not allowed`);
  return list;
};
const cleanEnum = (v, allowed, field) => {
  const x = String(v ?? "").trim().toUpperCase().replace(/[\s-]+/g, "_");
  if (!allowed.includes(x)) throw new RelationshipError(400, `${field} is invalid`);
  return x;
};
const cleanDate = (v, field) => {
  if (v === null || v === "") return null;
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) throw new RelationshipError(400, `${field} must be a date`);
  return d;
};
const cleanObjectId = (v, field) => {
  if (v === null || v === "" || v === undefined) return null;
  if (!mongoose.isValidObjectId(v)) throw new RelationshipError(400, `${field} is invalid`);
  return v;
};
const cleanMoney = (v, field) => {
  if (v === null || v === "" || v === undefined) return null;
  const n = Number(v);
  if (!Number.isFinite(n) || n < 0) throw new RelationshipError(400, `${field} must be 0 or more`);
  return n;
};

const TEXT_LIMITS = {
  name: 200, email: 200, notes: 3000, propertyDetails: 4000, company: 200, city: 120,
  designation: 120, marketNotes: 3000, relationshipNotes: 3000, reraNumber: 80,
  brokerageTerms: 2000, netRateNotes: 2000, internalRemarks: 3000,
};

/*
 * Turns a PATCH body into a safe update for a contact. Restricted fields and
 * channel-partner status changes need Admin/Manager.
 */
const sanitizeContactPatch = (body = {}, user) => {
  const patch = {};
  const has = (k) => Object.prototype.hasOwnProperty.call(body, k);
  for (const [k, max] of Object.entries(TEXT_LIMITS)) {
    if (!has(k)) continue;
    if (R.RESTRICTED_CONTACT_FIELDS.includes(k) && !canSeeRestricted(user)) {
      throw new RelationshipError(403, "Only Admin or Manager can edit brokerage terms, net rates or internal remarks");
    }
    patch[k] = cleanText(body[k], max);
  }
  if (has("name") && !patch.name) throw new RelationshipError(400, "Name is required");
  if (has("phone")) {
    const phone = normalizePhone(body.phone);
    if (!phone) throw new RelationshipError(400, "Enter a valid phone number");
    patch.phone = phone;
  }
  for (const k of ["alternatePhone", "whatsapp"]) {
    if (has(k)) patch[k] = body[k] ? normalizePhone(body[k]) || cleanText(body[k], 20) : "";
  }
  if (has("brokerType")) patch.brokerType = cleanEnum(body.brokerType || "", R.BROKER_TYPES, "brokerType");
  if (has("relationshipStatus")) patch.relationshipStatus = cleanEnum(body.relationshipStatus || "", R.RELATIONSHIP_STATUSES, "relationshipStatus");
  if (has("preferredContact")) patch.preferredContact = cleanEnum(body.preferredContact || "", R.CONTACT_METHODS, "preferredContact");
  if (has("segments")) patch.segments = cleanEnumList(body.segments, R.SEGMENTS, "segments");
  if (has("transactionTypes")) patch.transactionTypes = cleanEnumList(body.transactionTypes, R.TRANSACTION_TYPES, "transactionTypes");
  if (has("customerTypes")) patch.customerTypes = cleanEnumList(body.customerTypes, R.CUSTOMER_TYPES, "customerTypes");
  if (has("areas")) patch.areas = cleanList(body.areas, 50, 120);
  if (has("projects")) patch.projects = cleanList(body.projects, 50, 160);
  if (has("propertyTypes")) patch.propertyTypes = cleanList(body.propertyTypes, 30, 80);
  if (has("firmId")) patch.firmId = cleanObjectId(body.firmId, "firmId");
  if (has("relationshipOwnerId")) patch.relationshipOwnerId = cleanObjectId(body.relationshipOwnerId, "relationshipOwnerId");
  if (has("lastContactAt")) patch.lastContactAt = cleanDate(body.lastContactAt, "lastContactAt");
  if (has("nextFollowUpAt")) patch.nextFollowUpAt = cleanDate(body.nextFollowUpAt, "nextFollowUpAt");
  if (has("lastVerifiedAt")) patch.lastVerifiedAt = cleanDate(body.lastVerifiedAt, "lastVerifiedAt");
  if (has("verified")) {
    if (!canSeeRestricted(user)) throw new RelationshipError(403, "Only Admin or Manager can mark a contact verified");
    patch.verified = Boolean(body.verified);
  }
  if (has("cpStatus")) {
    if (!canSeeRestricted(user)) throw new RelationshipError(403, "Only Admin or Manager can change channel partner status");
    patch.cpStatus = cleanEnum(body.cpStatus, R.CP_STATUSES, "cpStatus");
  }
  if (has("cpDocuments")) {
    const docs = Array.isArray(body.cpDocuments) ? body.cpDocuments : [];
    patch.cpDocuments = docs.slice(0, 20).map((d) => ({
      name: cleanText(d?.name, 200), url: cleanText(d?.url, 1000), uploadedAt: d?.uploadedAt ? cleanDate(d.uploadedAt, "uploadedAt") : new Date(),
    })).filter((d) => d.url);
  }
  return patch;
};

/* Applies a CP status change: onboarding date and approver ride along. */
const applyCpStatus = (contact, nextStatus, user) => {
  const previous = contact.cpStatus || "NOT_ONBOARDED";
  if (!nextStatus || nextStatus === previous) return null;
  contact.cpStatus = nextStatus;
  if (nextStatus === "ACTIVE") {
    contact.cpOnboardedAt = contact.cpOnboardedAt || new Date();
    contact.cpApprovedBy = user._id;
  }
  return { previous, next: nextStatus };
};

/* -------------------------------------------------------- profile -- */

const toId = (v) => String(v?._id || v || "");

/*
 * A broker's or owner's profile: the contact, their firm, the inventory they
 * are linked to, the leads they referred and the deals those became.
 */
const buildContactProfile = async ({ contactId, user }) => {
  if (!mongoose.isValidObjectId(contactId)) throw new RelationshipError(400, "Invalid contact");
  const contact = await Contact.findOne({ _id: contactId, companyId: user.companyId })
    .populate("firmId", "name phone city reraNumber")
    .populate("relationshipOwnerId", "name email role")
    .populate("linkedContactId", "name phone kind")
    .lean();
  if (!contact || !canSeeContact(contact, user)) throw new RelationshipError(404, "Contact not found");

  const inventoryFilter = { companyId: user.companyId, $or: [{ _id: { $in: contact.inventoryIds || [] } }] };
  if (contact.kind === "BROKER") inventoryFilter.$or.push({ "sourceLinks.contactId": contact._id });
  if (contact.kind === "OWNER") inventoryFilter.$or.push({ ownerContactId: contact._id });
  const segs = userSegments(user);
  if (!isManagement(user) && segs.length === 1) inventoryFilter.inventoryType = segs[0];

  const [inventory, referredLeads] = await Promise.all([
    Inventory.find(inventoryFilter)
      .select("propertyId projectName towerName unitNumber buildingName location city area inventoryType type status price rent totalArea areaUnit sourceType sourceLinks lastConfirmedAt ownerContactId updatedAt")
      .sort({ updatedAt: -1 }).limit(200).lean(),
    contact.kind === "BROKER"
      ? Lead.find({ companyId: user.companyId, referredByBrokerId: contact._id })
        .select("name phone status inventoryType assignedTo createdAt brokerageReceived")
        .populate("assignedTo", "name")
        .sort({ createdAt: -1 }).limit(200).lean()
      : [],
  ]);

  const now = new Date();
  const inventoryRows = inventory.map((row) => {
    const link = (row.sourceLinks || []).find((l) => toId(l.contactId) === toId(contact._id));
    const confirmed = link?.confirmedAt || row.lastConfirmedAt;
    return {
      ...stripRestrictedInventory(row, user),
      relation: toId(row.ownerContactId) === toId(contact._id) ? "OWNER" : link ? "SOURCE_BROKER" : "LINKED",
      myLink: link ? stripRestrictedInventory({ sourceLinks: [link] }, user).sourceLinks[0] : null,
      stale: isStale(confirmed, now),
    };
  });

  const closed = referredLeads.filter((l) => l.status === "CLOSED");
  const pipeline = referredLeads.reduce((acc, l) => ({ ...acc, [l.status]: (acc[l.status] || 0) + 1 }), {});
  const leads = referredLeads.map((l) => {
    if (canSeeRestricted(user)) return l;
    const { brokerageReceived, ...rest } = l;
    return rest;
  });

  return {
    contact: stripRestrictedContact(contact, user),
    inventory: inventoryRows,
    referredLeads: leads,
    stats: {
      inventoryCount: inventoryRows.length,
      staleInventory: inventoryRows.filter((r) => r.stale).length,
      referredLeads: referredLeads.length,
      closedDeals: closed.length,
      pipeline,
      ...(canSeeRestricted(user) ? { brokerageReceived: closed.reduce((a, l) => a + (Number(l.brokerageReceived) || 0), 0) } : {}),
    },
    staleAfterDays: R.STALE_AFTER_DAYS,
  };
};

/* ---------------------------------------------------------- merge -- */

/*
 * Folds `dropId` into `keepId` (same kind). Every link moves across - leads,
 * inventory, owner and source links, referrals - and blank fields on the kept
 * record are filled from the duplicate. The duplicate is then removed.
 */
const mergeContacts = async ({ companyId, keepId, dropId }) => {
  if (!mongoose.isValidObjectId(keepId) || !mongoose.isValidObjectId(dropId)) throw new RelationshipError(400, "Invalid contact");
  if (String(keepId) === String(dropId)) throw new RelationshipError(400, "Choose two different records");
  const [keep, drop] = await Promise.all([
    Contact.findOne({ _id: keepId, companyId }),
    Contact.findOne({ _id: dropId, companyId }),
  ]);
  if (!keep || !drop) throw new RelationshipError(404, "Contact not found");
  if (keep.kind !== drop.kind) throw new RelationshipError(400, "Only records of the same kind (owner/broker) can be merged");

  const fillIfBlank = ["email", "company", "city", "designation", "whatsapp", "brokerType", "firmId", "reraNumber",
    "relationshipStatus", "relationshipOwnerId", "preferredContact", "lastContactAt", "nextFollowUpAt", "lastVerifiedAt"];
  fillIfBlank.forEach((f) => {
    const empty = keep[f] === null || keep[f] === undefined || keep[f] === "";
    if (empty && drop[f] !== null && drop[f] !== undefined && drop[f] !== "") keep[f] = drop[f];
  });
  if (!keep.alternatePhone && drop.phone !== keep.phone) keep.alternatePhone = drop.phone;
  ["notes", "propertyDetails", "marketNotes", "relationshipNotes", "internalRemarks", "brokerageTerms", "netRateNotes"].forEach((f) => {
    if (drop[f] && !String(keep[f] || "").includes(drop[f])) keep[f] = [keep[f], drop[f]].filter(Boolean).join("\n").slice(0, 3000);
  });
  ["segments", "areas", "projects", "propertyTypes", "transactionTypes", "customerTypes", "leadIds", "inventoryIds"].forEach((f) => {
    const merged = [...(keep[f] || []), ...(drop[f] || [])];
    keep[f] = [...new Map(merged.map((x) => [String(x), x])).values()];
  });
  keep.blockedLeadCount = (keep.blockedLeadCount || 0) + (drop.blockedLeadCount || 0);
  keep.blockedLeads = [...(keep.blockedLeads || []), ...(drop.blockedLeads || [])].slice(-50);
  if (keep.cpStatus === "NOT_ONBOARDED" && drop.cpStatus !== "NOT_ONBOARDED") keep.cpStatus = drop.cpStatus;
  keep.cpDocuments = [...(keep.cpDocuments || []), ...(drop.cpDocuments || [])];
  keep.verified = keep.verified || drop.verified;
  if (keep.importStatus === "IMPORTED") keep.importStatus = "MERGED";

  const [inv1, inv2, leads1, leads2] = await Promise.all([
    Inventory.updateMany({ companyId, ownerContactId: drop._id }, { $set: { ownerContactId: keep._id } }),
    Inventory.updateMany({ companyId, "sourceLinks.contactId": drop._id }, { $set: { "sourceLinks.$[l].contactId": keep._id } }, { arrayFilters: [{ "l.contactId": drop._id }] }),
    Lead.updateMany({ companyId, referredByBrokerId: drop._id }, { $set: { referredByBrokerId: keep._id } }),
    Lead.updateMany({ companyId, brokerContactId: drop._id }, { $set: { brokerContactId: keep._id } }),
  ]);
  await Contact.updateMany({ companyId, linkedContactId: drop._id }, { $set: { linkedContactId: keep._id } });
  await keep.save();
  await Contact.deleteOne({ _id: drop._id, companyId });
  return {
    contact: keep,
    moved: {
      ownedInventory: inv1.modifiedCount || 0,
      sourcedInventory: inv2.modifiedCount || 0,
      referredLeads: leads1.modifiedCount || 0,
      brokerLeads: leads2.modifiedCount || 0,
    },
    removed: { _id: drop._id, name: drop.name, phone: drop.phone },
  };
};

/* Other records with the same phone, alternate phone or RERA number. */
const findPossibleDuplicates = async ({ companyId, contact }) => {
  const phones = [contact.phone, contact.alternatePhone, contact.whatsapp].filter(Boolean);
  const or = [{ phone: { $in: phones } }, { alternatePhone: { $in: phones } }];
  if (contact.reraNumber) or.push({ reraNumber: contact.reraNumber });
  return Contact.find({ companyId, kind: contact.kind, _id: { $ne: contact._id }, $or: or })
    .select("_id name phone alternatePhone reraNumber company").limit(20).lean();
};

/* ----------------------------------------------------- RERA import -- */

const MAX_RERA_ROWS = 10000;
const pick = (row, keys) => {
  for (const k of Object.keys(row || {})) {
    const norm = k.toLowerCase().replace(/[^a-z]/g, "");
    if (keys.includes(norm)) return row[k];
  }
  return "";
};

/*
 * Imports a RERA broker list. Phone or registration number already present
 * means an existing record (filled in, not duplicated). Imported brokers are
 * not verified and not channel partners.
 */
const importReraBrokers = async ({ companyId, rows, actor }) => {
  const result = { created: 0, updated: 0, skipped: 0, errors: [] };
  const firmCache = new Map();
  const firmIdFor = async (name) => {
    const key = BrokerFirm.toNameKey(name);
    if (!key) return null;
    if (firmCache.has(key)) return firmCache.get(key);
    const firm = await BrokerFirm.findOneAndUpdate(
      { companyId, nameKey: key },
      { $setOnInsert: { companyId, nameKey: key, name: cleanText(name, 200), createdBy: actor } },
      { upsert: true, returnDocument: "after" },
    );
    firmCache.set(key, firm._id);
    return firm._id;
  };

  for (let i = 0; i < rows.length; i += 1) {
    const row = rows[i] || {};
    const name = cleanText(pick(row, ["name", "brokername", "agentname", "promotername"]), 200);
    const phone = normalizePhone(pick(row, ["phone", "mobile", "mobileno", "phonenumber", "contact", "contactno"]));
    const rera = cleanText(pick(row, ["rera", "reranumber", "reranumberregistration", "registrationnumber", "registrationno", "regno", "reraregistrationno"]), 80);
    const firm = cleanText(pick(row, ["firm", "firmname", "company", "companyname", "agency"]), 200);
    const email = cleanText(pick(row, ["email", "emailid"]), 200);
    const city = cleanText(pick(row, ["city", "district", "location"]), 120);
    if (!name || (!phone && !rera)) {
      result.skipped += 1;
      if (result.errors.length < 50) result.errors.push({ row: i + 2, message: "Needs a name and a phone or RERA number" });
      continue;
    }
    // eslint-disable-next-line no-await-in-loop
    const existing = await Contact.findOne({
      companyId, kind: "BROKER",
      $or: [...(phone ? [{ phone }, { alternatePhone: phone }] : []), ...(rera ? [{ reraNumber: rera }] : [])],
    });
    // eslint-disable-next-line no-await-in-loop
    const firmId = firm ? await firmIdFor(firm) : null;
    if (existing) {
      let changed = false;
      if (!existing.reraNumber && rera) { existing.reraNumber = rera; changed = true; }
      if (!existing.email && email) { existing.email = email; changed = true; }
      if (!existing.city && city) { existing.city = city; changed = true; }
      if (!existing.company && firm) { existing.company = firm; changed = true; }
      if (!existing.firmId && firmId) { existing.firmId = firmId; changed = true; }
      if (changed) {
        // eslint-disable-next-line no-await-in-loop
        await existing.save();
        result.updated += 1;
      } else result.skipped += 1;
      continue;
    }
    if (!phone) {
      result.skipped += 1;
      if (result.errors.length < 50) result.errors.push({ row: i + 2, message: "No phone number - can't add a new broker without one" });
      continue;
    }
    // eslint-disable-next-line no-await-in-loop
    await Contact.create({
      companyId, kind: "BROKER", name, phone, email, city, company: firm, firmId, reraNumber: rera,
      source: "RERA_IMPORT", importStatus: "IMPORTED", verified: false, cpStatus: "NOT_ONBOARDED", createdBy: actor,
    });
    result.created += 1;
  }
  return result;
};

/* -------------------------------------------------- source links -- */

const sanitizeSourceLink = (body = {}, user) => {
  const contactId = cleanObjectId(body.contactId, "contactId");
  const firmId = cleanObjectId(body.firmId, "firmId");
  if (!contactId && !firmId) throw new RelationshipError(400, "Choose a broker or a firm");
  const link = {
    contactId,
    firmId,
    askingPrice: cleanMoney(body.askingPrice, "Asking price"),
    askingRent: cleanMoney(body.askingRent, "Asking rent"),
    marketRateNote: cleanText(body.marketRateNote, 300),
    availability: body.availability ? cleanEnum(body.availability, R.SOURCE_AVAILABILITY, "availability") : "UNVERIFIED",
    confirmedAt: body.confirmedAt === undefined ? new Date() : cleanDate(body.confirmedAt, "confirmedAt"),
    notes: cleanText(body.notes, 1000),
  };
  if (Object.prototype.hasOwnProperty.call(body, "netRate")) {
    if (!canSeeRestricted(user) && body.netRate !== null && body.netRate !== "") {
      throw new RelationshipError(403, "Only Admin or Manager can record a net rate");
    }
    link.netRate = cleanMoney(body.netRate, "Net rate");
  }
  return link;
};

module.exports = {
  RelationshipError,
  canSeeRestricted,
  canSeeContact,
  userSegments,
  segmentVisibilityClause,
  stripRestrictedContact,
  stripRestrictedInventory,
  isStale,
  staleCutoff,
  sanitizeContactPatch,
  applyCpStatus,
  buildContactProfile,
  mergeContacts,
  findPossibleDuplicates,
  importReraBrokers,
  sanitizeSourceLink,
  MAX_RERA_ROWS,
  cleanText,
};
