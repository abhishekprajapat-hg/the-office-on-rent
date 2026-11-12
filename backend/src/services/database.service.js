/*
 * Database module (Developmental Updates Oct 2026 - Update 01).
 *
 * People (CrmContact - owners, brokers and every other contact), buildings,
 * the existing Inventory records, and the relationships between them. Any
 * record can be the starting point and links are added as facts become known:
 * a property can be saved with no owner, a guard can be saved with no number.
 *
 * Nothing here deletes history. Ending a relationship marks it FORMER; an
 * ownership change ends the old owner row and adds a new one; calls and
 * verifications are added as new interaction rows.
 */
const mongoose = require("mongoose");
const Contact = require("../models/CrmContact");
const Building = require("../models/Building");
const Rel = require("../models/DbRelationship");
const Interaction = require("../models/DbInteraction");
const Inventory = require("../models/Inventory");
const DbCounter = require("../models/DbCounter");
const D = require("../constants/database.constants");
const R = require("../constants/relationship.constants");
const { normalizePhone } = require("./crmContact.service");

class DatabaseError extends Error {
  constructor(statusCode, message, extra = {}) {
    super(message);
    this.statusCode = statusCode;
    Object.assign(this, extra);
  }
}

const text = (v, max = 300) => String(v ?? "").trim().slice(0, max);
const toId = (v) => String(v?._id || v || "");
const isId = (v) => mongoose.isValidObjectId(String(v || ""));
const isManager = (user) => D.DATABASE_MANAGE_ROLES.includes(String(user?.role || "").toUpperCase());
const enumOf = (value, allowed, label, fallback) => {
  const v = String(value ?? "").trim().toUpperCase();
  if (!v && fallback !== undefined) return fallback;
  if (!allowed.includes(v)) throw new DatabaseError(400, `${label} must be one of ${allowed.filter(Boolean).join(", ")}`);
  return v;
};
const enumList = (value, allowed, label) => {
  const list = Array.isArray(value) ? value : String(value || "").split(",");
  const out = [...new Set(list.map((x) => String(x || "").trim().toUpperCase()).filter(Boolean))];
  const bad = out.find((x) => !allowed.includes(x));
  if (bad) throw new DatabaseError(400, `${label}: ${bad} is not allowed`);
  return out;
};
const dateOrNull = (value, label) => {
  if (value === undefined || value === null || value === "") return null;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) throw new DatabaseError(400, `${label} is not a valid date`);
  return d;
};
const addDays = (date, days) => new Date(new Date(date).getTime() + days * 86400000);
const byLine = (user) => ({ byUserId: user?._id || null, byName: user?.name || "" });

/* ------------------------------------------------------------ startup -- */

/*
 * The first version of CrmContact had a unique (company, kind, phone) index
 * that also covered empty phones, which would stop a second number-less
 * contact being saved. Replace it once with the version that only covers rows
 * that have a number. Safe to run on every start.
 */
const ensureContactIndexes = async () => {
  const collection = Contact.collection;
  let indexes = [];
  try { indexes = await collection.indexes(); } catch { return { dropped: false }; }
  const legacy = indexes.find((ix) => ix.unique && !ix.partialFilterExpression
    && JSON.stringify(ix.key) === JSON.stringify({ companyId: 1, kind: 1, phone: 1 }));
  let dropped = false;
  if (legacy) {
    await collection.dropIndex(legacy.name);
    dropped = true;
  }
  await Contact.createIndexes();
  return { dropped };
};

/* -------------------------------------------------------------- codes -- */

const CODE_PREFIX = { OWNER: "OWN", BROKER: "BRK", CONTACT: "CON" };
const ensureContactCode = async (contact) => {
  if (contact.contactCode) return contact.contactCode;
  contact.contactCode = await DbCounter.nextCode(contact.companyId, CODE_PREFIX[contact.kind] || "CON");
  return contact.contactCode;
};

/* -------------------------------------------------------- verification -- */

/*
 * A property's availability verification as shown on screen. OVERDUE is
 * worked out here and never written back: stale data is flagged for a
 * re-check, it is not marked unavailable (1.6).
 */
const verificationView = (inventory = {}, now = new Date()) => {
  const v = inventory.availabilityVerification || {};
  const state = v.state || "NEVER";
  const confirmedAt = v.confirmedAt || null;
  const nextDueAt = v.nextDueAt || (confirmedAt ? addDays(confirmedAt, D.VERIFICATION_DUE_DAYS) : null);
  const overdue = state !== "NEVER" && Boolean(nextDueAt) && new Date(nextDueAt) < now;
  return { state, confirmedAt, confirmedByContactId: v.confirmedByContactId || null, nextDueAt, overdue, display: overdue ? "OVERDUE" : state };
};

/* ------------------------------------------------------------ contacts -- */

/*
 * Kind follows the roles unless given: anyone holding OWNER goes in the Owner
 * Database, BROKER in the Broker Database, everyone else is a CONTACT.
 */
const kindForRoles = (roles = [], explicit = "") => {
  const k = String(explicit || "").toUpperCase();
  if (D.CONTACT_KINDS.includes(k)) return k;
  if (roles.includes("OWNER")) return "OWNER";
  if (roles.includes("BROKER")) return "BROKER";
  return "CONTACT";
};

const sanitizeNewContact = (body = {}) => {
  const roles = enumList(body.roles, D.CONTACT_ROLES, "Role");
  const kind = kindForRoles(roles, body.kind);
  if (kind === "OWNER" && !roles.includes("OWNER")) roles.unshift("OWNER");
  if (kind === "BROKER" && !roles.includes("BROKER")) roles.unshift("BROKER");
  const name = text(body.name, 200);
  if (!name) throw new DatabaseError(400, "Enter a name, or a label such as \"Aditya Gateway security desk\"");
  const rawPhone = text(body.phone, 30);
  const phone = rawPhone ? normalizePhone(rawPhone) : "";
  if (rawPhone && !phone) throw new DatabaseError(400, "Enter a valid phone number, or leave it blank");
  if (!phone && kind !== "CONTACT") throw new DatabaseError(400, `A phone number is needed to save ${kind === "OWNER" ? "an owner" : "a broker"}`);
  const alt = text(body.alternatePhone, 30);
  return {
    kind,
    roles,
    name,
    phone,
    alternatePhone: alt ? normalizePhone(alt) || alt : "",
    whatsapp: text(body.whatsapp, 20),
    email: text(body.email, 200),
    company: text(body.company, 200),
    city: text(body.city, 120),
    designation: text(body.designation, 120),
    isContactPoint: body.isContactPoint === true || body.isContactPoint === "true",
    ownerType: kind === "OWNER" ? enumOf(body.ownerType, D.OWNER_TYPES, "Owner type", "") : "",
    relationshipStatus: body.relationshipStatus ? enumOf(body.relationshipStatus, R.RELATIONSHIP_STATUSES, "Relationship status") : (kind === "OWNER" ? "NEW" : ""),
    sourceNote: text(body.sourceNote, 1000),
    notes: text(body.notes, 3000),
  };
};

/*
 * Possible duplicates of a person: the same number (main, alternate or
 * WhatsApp) or the same email, in any database. Never by name alone (1.7).
 */
const findDuplicateContacts = async ({ companyId, phone, alternatePhone, email, excludeId = null }) => {
  const phones = [phone, alternatePhone].map((p) => normalizePhone(p)).filter(Boolean);
  const or = [];
  phones.forEach((p) => or.push({ phone: p }, { alternatePhone: p }, { whatsapp: { $regex: `${p}$` } }));
  if (text(email)) or.push({ email: { $regex: `^${text(email).replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`, $options: "i" } });
  if (!or.length) return [];
  const filter = { companyId, $or: or };
  if (excludeId) filter._id = { $ne: excludeId };
  const rows = await Contact.find(filter).select("_id name phone kind roles contactCode email").limit(10).lean();
  return rows.map((r) => ({ _id: r._id, name: r.name, phone: r.phone, kind: r.kind, roles: r.roles || [], contactCode: r.contactCode || "", reason: phones.includes(r.phone) ? "Same phone number" : "Same phone or email" }));
};

/* links: [{ buildingId | inventoryId | ownerId, role, scope, scopeNote, status, authority }] */
const createContact = async ({ user, body = {} }) => {
  const companyId = user.companyId;
  const clean = sanitizeNewContact(body);
  const duplicates = await findDuplicateContacts({ companyId, phone: clean.phone, alternatePhone: clean.alternatePhone, email: clean.email });
  const sameKind = duplicates.find((d) => d.kind === clean.kind && d.phone && d.phone === clean.phone);
  if (sameKind) throw new DatabaseError(409, `${sameKind.name} already has this number in the ${sameKind.kind.toLowerCase()} records. Open that record instead.`, { duplicates, existingId: sameKind._id });
  if (duplicates.length && body.confirmDuplicate !== true) {
    throw new DatabaseError(409, "This may be someone already on file. Check the matches, then save anyway if it is a different person.", { duplicates, needsConfirmation: true });
  }
  // Check a building typed in on the form before saving anything, so a
  // possible duplicate building never leaves a half-saved contact behind.
  if (body.newBuilding && text(body.newBuilding.name) && body.newBuilding.confirmDuplicate !== true) {
    const nb = sanitizeBuilding(body.newBuilding);
    const buildingDuplicates = await findDuplicateBuildings({ companyId, ...nb });
    if (buildingDuplicates.length) throw new DatabaseError(409, "A building with this name or address may already be on file. Pick it, or save the new one anyway.", { duplicates: buildingDuplicates, needsConfirmation: true, kind: "building" });
  }
  const contact = new Contact({ ...clean, companyId, source: "MANUAL", createdBy: user._id, relationshipOwnerId: body.assignToMe === false ? null : user._id });
  await ensureContactCode(contact);
  await contact.save();

  // A building typed in on the form is created here and linked.
  const links = Array.isArray(body.links) ? body.links.slice(0, 20) : [];
  if (body.newBuilding && text(body.newBuilding.name)) {
    // The building has its own duplicate check and its own "save anyway".
    const building = await createBuilding({ user, body: { ...body.newBuilding, confirmDuplicate: body.newBuilding.confirmDuplicate === true } });
    links.push({ buildingId: building._id, role: body.newBuilding.role, scope: body.newBuilding.scope || "WHOLE_BUILDING", status: body.newBuilding.status, authority: body.newBuilding.authority });
  }
  const created = [];
  for (const link of links) {
    // eslint-disable-next-line no-await-in-loop
    created.push(await createRelationship({ user, body: { ...link, contactId: contact._id, role: link.role || clean.roles.find((r) => r !== "OWNER" && r !== "BROKER") || clean.roles[0] || "OTHER" } }));
  }
  return { contact, relationships: created, duplicates };
};

const listContacts = async ({ user, query = {} }) => {
  const and = [{ companyId: user.companyId }];
  if (query.kind) and.push({ kind: { $in: enumList(query.kind, D.CONTACT_KINDS, "Kind") } });
  if (query.role) and.push({ roles: { $in: enumList(query.role, D.CONTACT_ROLES, "Role") } });
  if (query.archived !== "true") and.push({ archived: { $ne: true } });
  const search = text(query.search, 80);
  if (search) {
    const value = search.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const digits = search.replace(/\D/g, "");
    and.push({ $or: [
      { name: { $regex: value, $options: "i" } }, { company: { $regex: value, $options: "i" } }, { contactCode: { $regex: value, $options: "i" } },
      ...(digits.length >= 4 ? [{ phone: { $regex: digits } }, { alternatePhone: { $regex: digits } }] : []),
    ] });
  }
  if (isId(query.buildingId)) {
    const ids = await Rel.distinct("contactId", { companyId: user.companyId, buildingId: query.buildingId });
    and.push({ _id: { $in: ids } });
  }
  const visibility = require("./relationship.service").segmentVisibilityClause(user);
  if (visibility) and.push({ $or: [{ kind: { $ne: "BROKER" } }, visibility] });
  const page = Math.max(1, Number.parseInt(query.page, 10) || 1);
  const filter = { $and: and };
  const [rows, total] = await Promise.all([
    Contact.find(filter).select("_id name phone kind roles contactCode company city ownerType relationshipStatus verified isContactPoint lastContactAt nextFollowUpAt archived updatedAt")
      .sort({ updatedAt: -1 }).skip((page - 1) * 50).limit(50).lean(),
    Contact.countDocuments(filter),
  ]);
  const ids = rows.map((r) => r._id);
  const counts = ids.length ? await Rel.aggregate([
    { $match: { companyId: new mongoose.Types.ObjectId(String(user.companyId)), contactId: { $in: ids }, status: { $ne: "FORMER" } } },
    { $group: { _id: "$contactId", buildings: { $addToSet: "$buildingId" }, properties: { $addToSet: "$inventoryId" } } },
  ]) : [];
  const byId = new Map(counts.map((c) => [String(c._id), c]));
  return {
    total,
    page,
    contacts: rows.map((r) => {
      const c = byId.get(String(r._id));
      return { ...r, linkedBuildings: (c?.buildings || []).filter(Boolean).length, linkedProperties: (c?.properties || []).filter(Boolean).length };
    }),
  };
};

/* ----------------------------------------------------------- buildings -- */

const normalizeKey = (v) => String(v || "").toLowerCase().replace(/[^a-z0-9 ]+/g, " ").replace(/\s+/g, " ").trim();

const sanitizeBuilding = (body = {}, { partial = false } = {}) => {
  const out = {};
  const has = (k) => Object.prototype.hasOwnProperty.call(body, k);
  if (!partial || has("name")) {
    out.name = text(body.name, 200);
    if (!out.name) throw new DatabaseError(400, "Enter the building name");
  }
  if (!partial || has("aliases")) out.aliases = (Array.isArray(body.aliases) ? body.aliases : String(body.aliases || "").split(",")).map((a) => text(a, 200)).filter(Boolean).slice(0, 20);
  ["address", "locality", "city", "pincode", "landmark"].forEach((k) => { if (!partial || has(k)) out[k] = text(body[k], k === "address" ? 500 : 160); });
  if (!partial || has("notes")) out.notes = text(body.notes, 3000);
  if (!partial || has("buildingType")) out.buildingType = body.buildingType ? enumOf(body.buildingType, D.BUILDING_TYPES, "Building type") : "";
  if (!partial || has("totalFloors")) {
    if (body.totalFloors === "" || body.totalFloors === null || body.totalFloors === undefined) out.totalFloors = null;
    else {
      const n = Number(body.totalFloors);
      if (!Number.isInteger(n) || n < 0 || n > 300) throw new DatabaseError(400, "Total floors must be a whole number");
      out.totalFloors = n;
    }
  }
  if (has("assignedTo")) out.assignedTo = isId(body.assignedTo) ? body.assignedTo : null;
  return out;
};

/* Possible duplicate buildings: same name or alias, or the same address. */
const findDuplicateBuildings = async ({ companyId, name, aliases = [], address = "", city = "", excludeId = null }) => {
  const names = [name, ...(aliases || [])].map(normalizeKey).filter((n) => n.length >= 3);
  const addr = normalizeKey(address);
  if (!names.length && addr.length < 8) return [];
  const rows = await Building.find({ companyId, archived: { $ne: true }, ...(excludeId ? { _id: { $ne: excludeId } } : {}) })
    .select("_id buildingCode name aliases address locality city +searchKey").limit(2000).lean();
  return rows.filter((b) => {
    const theirNames = [b.name, ...(b.aliases || [])].map(normalizeKey);
    const nameHit = names.some((n) => theirNames.includes(n) || (n.length >= 6 && theirNames.some((t) => t.includes(n) || n.includes(t))));
    const addrHit = addr.length >= 8 && normalizeKey(b.address) === addr;
    const cityOk = !city || !b.city || normalizeKey(b.city) === normalizeKey(city);
    return (nameHit && cityOk) || addrHit;
  }).slice(0, 10).map((b) => ({ _id: b._id, buildingCode: b.buildingCode, name: b.name, address: b.address, locality: b.locality, city: b.city }));
};

const createBuilding = async ({ user, body = {} }) => {
  const clean = sanitizeBuilding(body);
  const duplicates = await findDuplicateBuildings({ companyId: user.companyId, ...clean });
  if (duplicates.length && body.confirmDuplicate !== true) {
    throw new DatabaseError(409, "A building with this name or address may already be on file.", { duplicates, needsConfirmation: true });
  }
  const building = new Building({ ...clean, companyId: user.companyId, createdBy: user._id, updatedBy: user._id, assignedTo: clean.assignedTo || user._id });
  building.buildingCode = await DbCounter.nextCode(user.companyId, "BLD");
  await building.save();
  return building;
};

const updateBuilding = async ({ user, id, body = {} }) => {
  const building = await Building.findOne({ _id: id, companyId: user.companyId });
  if (!building) throw new DatabaseError(404, "Building not found");
  const clean = sanitizeBuilding(body, { partial: true });
  if (Object.prototype.hasOwnProperty.call(body, "archived")) {
    if (!isManager(user)) throw new DatabaseError(403, "Only Admin or Manager can archive a building");
    clean.archived = Boolean(body.archived);
  }
  Object.assign(building, clean, { updatedBy: user._id });
  await building.save();
  return building;
};

/* Calculated, never stored: properties, available, owners, contacts, brokers (1.4). */
const buildingCounts = async (companyId, buildingIds) => {
  const ids = buildingIds.map((id) => new mongoose.Types.ObjectId(String(id)));
  const cid = new mongoose.Types.ObjectId(String(companyId));
  const [inv, rels] = await Promise.all([
    Inventory.aggregate([
      { $match: { companyId: cid, buildingId: { $in: ids } } },
      { $group: { _id: "$buildingId", properties: { $sum: 1 }, available: { $sum: { $cond: [{ $eq: ["$status", "Available"] }, 1, 0] } }, owners: { $addToSet: "$ownerContactId" }, brokers: { $push: "$sourceLinks.contactId" }, invIds: { $push: "$_id" } } },
    ]),
    Rel.aggregate([
      { $match: { companyId: cid, buildingId: { $in: ids }, status: { $ne: "FORMER" } } },
      { $group: { _id: "$buildingId", contacts: { $addToSet: "$contactId" }, brokerRels: { $addToSet: { $cond: [{ $eq: ["$role", "BROKER"] }, "$contactId", null] } } } },
    ]),
  ]);
  // Owners recorded as relationships on the building's units count too.
  const invByBuilding = new Map(inv.map((r) => [String(r._id), r]));
  const allInv = inv.flatMap((r) => r.invIds);
  const ownerRels = allInv.length ? await Rel.find({ companyId: cid, inventoryId: { $in: allInv }, role: "OWNER", status: { $ne: "FORMER" } }).select("inventoryId contactId").lean() : [];
  const invToBuilding = new Map(inv.flatMap((r) => r.invIds.map((i) => [String(i), String(r._id)])));
  const relByBuilding = new Map(rels.map((r) => [String(r._id), r]));
  const out = {};
  buildingIds.forEach((id) => {
    const key = String(id);
    const i = invByBuilding.get(key);
    const r = relByBuilding.get(key);
    const owners = new Set((i?.owners || []).filter(Boolean).map(String));
    ownerRels.filter((o) => invToBuilding.get(String(o.inventoryId)) === key).forEach((o) => owners.add(String(o.contactId)));
    const brokers = new Set([...(i?.brokers || []).flat().filter(Boolean).map(String), ...(r?.brokerRels || []).filter(Boolean).map(String)]);
    out[key] = { properties: i?.properties || 0, available: i?.available || 0, owners: owners.size, contacts: (r?.contacts || []).length, brokers: brokers.size };
  });
  return out;
};

const listBuildings = async ({ user, query = {} }) => {
  const filter = { companyId: user.companyId };
  if (query.archived !== "true") filter.archived = { $ne: true };
  const search = text(query.search, 80);
  if (search) {
    const value = search.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    filter.$or = [{ name: { $regex: value, $options: "i" } }, { aliases: { $regex: value, $options: "i" } }, { address: { $regex: value, $options: "i" } }, { locality: { $regex: value, $options: "i" } }, { city: { $regex: value, $options: "i" } }, { buildingCode: { $regex: value, $options: "i" } }];
  }
  if (query.city) filter.city = { $regex: `^${text(query.city, 80).replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`, $options: "i" };
  const page = Math.max(1, Number.parseInt(query.page, 10) || 1);
  const [rows, total] = await Promise.all([
    Building.find(filter).sort({ updatedAt: -1 }).skip((page - 1) * 50).limit(50).lean(),
    Building.countDocuments(filter),
  ]);
  const counts = rows.length ? await buildingCounts(user.companyId, rows.map((r) => r._id)) : {};
  return { total, page, buildings: rows.map((b) => ({ ...b, counts: counts[String(b._id)] })) };
};

const contactBrief = "name phone kind roles contactCode company isContactPoint relationshipStatus verified";

const buildingProfile = async ({ user, id }) => {
  if (!isId(id)) throw new DatabaseError(400, "Invalid building");
  const building = await Building.findOne({ _id: id, companyId: user.companyId }).populate("assignedTo", "name").lean();
  if (!building) throw new DatabaseError(404, "Building not found");
  const [inventory, relationships, interactions] = await Promise.all([
    Inventory.find({ companyId: user.companyId, buildingId: id })
      .select("propertyId projectName towerName unitNumber floorNumber status type price rent totalArea carpetArea ownerContactId ownerName sourceLinks occupancy availabilityVerification lastConfirmedAt inventoryType")
      .populate("sourceLinks.contactId", "name phone").populate("ownerContactId", "name phone").sort({ floorNumber: 1, unitNumber: 1 }).limit(500).lean(),
    Rel.find({ companyId: user.companyId, buildingId: id }).populate("contactId", contactBrief).sort({ status: 1, updatedAt: -1 }).lean(),
    Interaction.find({ companyId: user.companyId, buildingId: id }).populate("contactId", "name phone").sort({ at: -1 }).limit(100).lean(),
  ]);
  const invIds = inventory.map((i) => i._id);
  const ownerRels = invIds.length ? await Rel.find({ companyId: user.companyId, inventoryId: { $in: invIds }, role: "OWNER" }).populate("contactId", contactBrief).lean() : [];
  const owners = new Map();
  inventory.forEach((i) => { if (i.ownerContactId?._id) owners.set(String(i.ownerContactId._id), { contact: i.ownerContactId, properties: new Set([String(i._id)]), current: true }); });
  ownerRels.forEach((r) => {
    if (!r.contactId) return;
    const key = String(r.contactId._id);
    const row = owners.get(key) || { contact: r.contactId, properties: new Set(), current: false };
    row.properties.add(String(r.inventoryId));
    if (r.status !== "FORMER") row.current = true;
    owners.set(key, row);
  });
  const brokers = new Map();
  inventory.forEach((i) => (i.sourceLinks || []).forEach((l) => { if (l.contactId?._id) brokers.set(String(l.contactId._id), l.contactId); }));
  relationships.filter((r) => r.role === "BROKER" && r.contactId).forEach((r) => brokers.set(String(r.contactId._id), r.contactId));
  const counts = (await buildingCounts(user.companyId, [id]))[String(id)];
  return {
    building,
    counts,
    inventory: inventory.map((i) => ({ ...i, verification: verificationView(i) })),
    contacts: relationships.filter((r) => r.contactId),
    owners: [...owners.values()].map((o) => ({ ...o.contact, propertyCount: o.properties.size, current: o.current })),
    brokers: [...brokers.values()],
    interactions,
  };
};

/* Merge a duplicate building into this one; every link moves, nothing is lost (1.7). */
const mergeBuildings = async ({ user, keepId, dropId }) => {
  if (!isManager(user)) throw new DatabaseError(403, "Only Admin or Manager can merge buildings");
  if (!isId(keepId) || !isId(dropId) || String(keepId) === String(dropId)) throw new DatabaseError(400, "Choose two different buildings");
  const [keep, drop] = await Promise.all([Building.findOne({ _id: keepId, companyId: user.companyId }), Building.findOne({ _id: dropId, companyId: user.companyId })]);
  if (!keep || !drop) throw new DatabaseError(404, "Building not found");
  keep.aliases = [...new Set([...(keep.aliases || []), drop.name, ...(drop.aliases || [])].filter((a) => a && a !== keep.name))].slice(0, 20);
  ["address", "locality", "city", "pincode", "landmark", "buildingType"].forEach((f) => { if (!keep[f] && drop[f]) keep[f] = drop[f]; });
  if ((keep.totalFloors === null || keep.totalFloors === undefined) && drop.totalFloors !== null) keep.totalFloors = drop.totalFloors;
  if (drop.notes && !String(keep.notes || "").includes(drop.notes)) keep.notes = [keep.notes, drop.notes].filter(Boolean).join("\n").slice(0, 3000);
  const [inv, rels, acts] = await Promise.all([
    Inventory.updateMany({ companyId: user.companyId, buildingId: drop._id }, { $set: { buildingId: keep._id } }),
    Rel.updateMany({ companyId: user.companyId, buildingId: drop._id }, { $set: { buildingId: keep._id } }),
    Interaction.updateMany({ companyId: user.companyId, buildingId: drop._id }, { $set: { buildingId: keep._id } }),
  ]);
  keep.updatedBy = user._id;
  await keep.save();
  await Building.deleteOne({ _id: drop._id, companyId: user.companyId });
  return { building: keep, moved: { inventory: inv.modifiedCount || 0, relationships: rels.modifiedCount || 0, interactions: acts.modifiedCount || 0 }, removed: { _id: drop._id, name: drop.name, buildingCode: drop.buildingCode } };
};

/* -------------------------------------------------------- relationships -- */

const loadTarget = async (companyId, body) => {
  const targets = ["buildingId", "inventoryId", "ownerId"].filter((k) => body[k]);
  if (targets.length !== 1) throw new DatabaseError(400, "Link to exactly one building, property or owner");
  const key = targets[0];
  if (!isId(body[key])) throw new DatabaseError(400, "Invalid link target");
  const Model = key === "buildingId" ? Building : key === "inventoryId" ? Inventory : Contact;
  const doc = await Model.findOne({ _id: body[key], companyId }).select(key === "ownerId" ? "kind name" : "_id ownerContactId").lean();
  if (!doc) throw new DatabaseError(404, "The building, property or owner wasn't found");
  if (key === "ownerId" && doc.kind !== "OWNER") throw new DatabaseError(400, "Link representatives to a record in the Owner Database");
  return { key, doc };
};

const createRelationship = async ({ user, body = {} }) => {
  if (!isId(body.contactId)) throw new DatabaseError(400, "Choose a contact");
  const contact = await Contact.findOne({ _id: body.contactId, companyId: user.companyId });
  if (!contact) throw new DatabaseError(404, "Contact not found");
  const { key, doc } = await loadTarget(user.companyId, body);
  const role = enumOf(body.role || (contact.roles || [])[0] || "OTHER", D.CONTACT_ROLES, "Role");
  // Being a source never makes someone the owner: ownership needs an Owner Database record.
  if (role === "OWNER" && contact.kind !== "OWNER") throw new DatabaseError(400, "Only a record in the Owner Database can be linked as an owner. Add them as an owner first.");
  if (role === "OWNER" && key !== "inventoryId") throw new DatabaseError(400, "Ownership is recorded against a property");
  const existing = await Rel.findOne({ companyId: user.companyId, contactId: contact._id, [key]: body[key], role, status: { $ne: "FORMER" } });
  if (existing) return existing;
  const rel = await Rel.create({
    companyId: user.companyId,
    contactId: contact._id,
    [key]: body[key],
    role,
    scope: enumOf(body.scope, D.RELATIONSHIP_SCOPES, "Scope", key === "buildingId" ? "WHOLE_BUILDING" : key === "inventoryId" ? "PROPERTIES" : "OWNER_WIDE"),
    scopeNote: text(body.scopeNote, 300),
    status: enumOf(body.status, D.RELATIONSHIP_STATES, "Status", "CURRENT"),
    authority: enumOf(body.authority, D.AUTHORITY_LEVELS, "Authority", role === "OWNER" ? "REPORTED" : "UNCONFIRMED"),
    share: text(body.share, 40),
    source: text(body.source, 300),
    notes: text(body.notes, 2000),
    startedAt: dateOrNull(body.startedAt, "Start date") || new Date(),
    createdBy: user._id,
    updatedBy: user._id,
  });
  if (!(contact.roles || []).includes(role)) {
    contact.roles = [...(contact.roles || []), role];
    await contact.save();
  }
  // The first owner of a unit is also its main owner (ownerContactId), which the rest of the CRM reads.
  if (role === "OWNER" && key === "inventoryId" && !doc.ownerContactId) {
    await Inventory.updateOne({ _id: doc._id, companyId: user.companyId }, { $set: { ownerContactId: contact._id, ownerName: contact.name, ownerNumber: contact.phone } });
  }
  if (key === "inventoryId") await Contact.updateOne({ _id: contact._id }, { $addToSet: { inventoryIds: doc._id } });
  return rel;
};

const updateRelationship = async ({ user, id, body = {} }) => {
  const rel = await Rel.findOne({ _id: id, companyId: user.companyId });
  if (!rel) throw new DatabaseError(404, "Link not found");
  const has = (k) => Object.prototype.hasOwnProperty.call(body, k);
  const before = { status: rel.status, authority: rel.authority, scope: rel.scope };
  if (has("scope")) rel.scope = enumOf(body.scope, D.RELATIONSHIP_SCOPES, "Scope");
  if (has("scopeNote")) rel.scopeNote = text(body.scopeNote, 300);
  if (has("authority")) rel.authority = enumOf(body.authority, D.AUTHORITY_LEVELS, "Authority");
  if (has("share")) rel.share = text(body.share, 40);
  if (has("notes")) rel.notes = text(body.notes, 2000);
  if (has("status")) {
    rel.status = enumOf(body.status, D.RELATIONSHIP_STATES, "Status");
    if (rel.status === "FORMER" && !rel.endedAt) {
      rel.endedAt = dateOrNull(body.endedAt, "End date") || new Date();
      rel.endedReason = text(body.endedReason, 300);
    }
    if (rel.status !== "FORMER") { rel.endedAt = null; rel.endedReason = ""; }
  }
  rel.updatedBy = user._id;
  await rel.save();
  if (before.status !== rel.status || before.authority !== rel.authority) {
    await Interaction.create({
      companyId: user.companyId, type: "RELATIONSHIP_CHANGE", contactId: rel.contactId, buildingId: rel.buildingId, inventoryId: rel.inventoryId,
      notes: `${rel.role.replace(/_/g, " ").toLowerCase()}: ${before.status} -> ${rel.status}${before.authority !== rel.authority ? `, authority ${before.authority} -> ${rel.authority}` : ""}${rel.endedReason ? ` (${rel.endedReason})` : ""}`,
      ...byLine(user),
    });
  }
  // An ended owner is no longer the unit's main owner; another current owner takes over.
  if (rel.role === "OWNER" && rel.inventoryId && rel.status === "FORMER") await resyncMainOwner(user.companyId, rel.inventoryId);
  return rel;
};

const resyncMainOwner = async (companyId, inventoryId) => {
  const current = await Rel.findOne({ companyId, inventoryId, role: "OWNER", status: { $ne: "FORMER" } }).sort({ startedAt: 1 }).populate("contactId", "name phone").lean();
  const set = current?.contactId
    ? { ownerContactId: current.contactId._id, ownerName: current.contactId.name, ownerNumber: current.contactId.phone }
    : { ownerContactId: null };
  await Inventory.updateOne({ _id: inventoryId, companyId }, { $set: set });
};

/* Units linked to an owner before the Database module get an owner row, so their history starts somewhere. */
const ensureLegacyOwnerRelationship = async (companyId, inventory) => {
  if (!inventory?.ownerContactId) return;
  const ownerId = inventory.ownerContactId._id || inventory.ownerContactId;
  const exists = await Rel.exists({ companyId, inventoryId: inventory._id, contactId: ownerId, role: "OWNER" });
  if (exists) return;
  await Rel.create({ companyId, contactId: ownerId, inventoryId: inventory._id, role: "OWNER", scope: "PROPERTIES", status: "CURRENT", authority: "REPORTED", source: "Owner already linked to the unit", startedAt: inventory.createdAt || new Date() });
};

/*
 * Ownership change (1.7): every current owner row on the unit ends (FORMER,
 * with the date), the new owner is added, and the unit's main owner follows.
 * Nothing is deleted.
 */
const changeOwner = async ({ user, inventoryId, newOwnerId, reason = "", share = "" }) => {
  if (!isId(inventoryId) || !isId(newOwnerId)) throw new DatabaseError(400, "Choose the unit and the new owner");
  const inventory = await Inventory.findOne({ _id: inventoryId, companyId: user.companyId }).select("_id ownerContactId createdAt").lean();
  if (!inventory) throw new DatabaseError(404, "Property not found");
  await ensureLegacyOwnerRelationship(user.companyId, inventory);
  const now = new Date();
  const ended = await Rel.updateMany(
    { companyId: user.companyId, inventoryId, role: "OWNER", status: { $ne: "FORMER" }, contactId: { $ne: newOwnerId } },
    { $set: { status: "FORMER", endedAt: now, endedReason: text(reason, 300) || "Ownership changed", updatedBy: user._id } },
  );
  const rel = await createRelationship({ user, body: { contactId: newOwnerId, inventoryId, role: "OWNER", authority: "REPORTED", share, source: text(reason, 300) } });
  await resyncMainOwner(user.companyId, inventoryId);
  await Interaction.create({ companyId: user.companyId, type: "OWNERSHIP_CHANGE", inventoryId, contactId: newOwnerId, notes: `Ownership changed${reason ? `: ${text(reason, 300)}` : ""}. Previous owner rows ended: ${ended.modifiedCount || 0}.`, ...byLine(user) });
  return { relationship: rel, endedPrevious: ended.modifiedCount || 0 };
};

/* --------------------------------------------------------- interactions -- */

const logInteraction = async ({ user, body = {} }) => {
  const type = enumOf(body.type || "CALL", ["CALL", "NOTE", "SOURCE_REPORT", "VERIFICATION"], "Type");
  const at = dateOrNull(body.at, "Date") || new Date();
  const refs = {};
  for (const [key, Model] of [["contactId", Contact], ["buildingId", Building], ["inventoryId", Inventory]]) {
    if (!body[key]) continue;
    if (!isId(body[key])) throw new DatabaseError(400, `Invalid ${key}`);
    // eslint-disable-next-line no-await-in-loop
    const exists = await Model.exists({ _id: body[key], companyId: user.companyId });
    if (!exists) throw new DatabaseError(404, `${key.replace("Id", "")} not found`);
    refs[key] = body[key];
  }
  if (!refs.contactId && !refs.buildingId && !refs.inventoryId) throw new DatabaseError(400, "Say who or what this is about");
  if (type === "CALL" && !refs.contactId) throw new DatabaseError(400, "Choose the contact who was called");
  const outcome = type === "CALL" ? enumOf(body.outcome, D.CALL_OUTCOMES, "Call outcome") : "";
  let nextFollowUpAt = dateOrNull(body.nextFollowUpAt, "Follow-up date");
  if (!nextFollowUpAt && D.OUTCOME_FOLLOW_UP_DAYS[outcome]) nextFollowUpAt = addDays(at, D.OUTCOME_FOLLOW_UP_DAYS[outcome]);
  if (["DO_NOT_CONTACT", "WRONG_NUMBER", "NOT_INTERESTED"].includes(outcome)) nextFollowUpAt = null;
  const row = {
    companyId: user.companyId, type, at, ...refs, outcome,
    sourceRole: body.sourceRole ? enumOf(body.sourceRole, D.CONTACT_ROLES, "Source role") : "",
    reportedFacts: text(body.reportedFacts, 2000),
    verificationState: type === "VERIFICATION" ? enumOf(body.verificationState, D.VERIFICATION_STATES.filter((s) => s !== "NEVER"), "Verification") : "",
    availabilityChange: text(body.availabilityChange, 300),
    notes: text(body.notes, 3000),
    nextStep: text(body.nextStep, 300),
    nextFollowUpAt,
    ...byLine(user),
  };
  if (type === "VERIFICATION" && !refs.inventoryId) throw new DatabaseError(400, "A verification is about a property");
  const interaction = await Interaction.create(row);

  if (refs.contactId) {
    const set = { lastContactAt: at };
    if (type === "CALL") set.nextFollowUpAt = nextFollowUpAt;
    if (outcome === "DO_NOT_CONTACT") set.relationshipStatus = "DO_NOT_CONTACT";
    await Contact.updateOne({ _id: refs.contactId, companyId: user.companyId }, { $set: set });
  }
  // Verification updates the unit's verification only - never its availability (1.6).
  if (type === "VERIFICATION") {
    const confirmed = ["CONFIRMED_OWNER", "CONFIRMED_REPRESENTATIVE"].includes(row.verificationState);
    const set = {
      "availabilityVerification.state": row.verificationState,
      "availabilityVerification.confirmedByContactId": refs.contactId || null,
    };
    if (confirmed) {
      set["availabilityVerification.confirmedAt"] = at;
      set["availabilityVerification.nextDueAt"] = dateOrNull(body.nextDueAt, "Next check") || addDays(at, D.VERIFICATION_DUE_DAYS);
      set.lastConfirmedAt = at;
    }
    await Inventory.updateOne({ _id: refs.inventoryId, companyId: user.companyId }, { $set: set });
  }
  return interaction;
};

const setOccupancy = async ({ user, inventoryId, body = {} }) => {
  if (!isId(inventoryId)) throw new DatabaseError(400, "Invalid property");
  const status = enumOf(body.status, D.OCCUPANCY_STATES, "Occupancy");
  const availableFrom = dateOrNull(body.availableFrom, "Available from");
  const result = await Inventory.updateOne({ _id: inventoryId, companyId: user.companyId }, { $set: { "occupancy.status": status, "occupancy.availableFrom": availableFrom } });
  if (!result.matchedCount) throw new DatabaseError(404, "Property not found");
  await Interaction.create({ companyId: user.companyId, type: "NOTE", inventoryId, notes: `Occupancy: ${status.toLowerCase()}${availableFrom ? `, available from ${availableFrom.toISOString().slice(0, 10)}` : ""}`, ...byLine(user) });
  return { status, availableFrom };
};

const setInventoryBuilding = async ({ user, inventoryId, buildingId }) => {
  if (!isId(inventoryId)) throw new DatabaseError(400, "Invalid property");
  if (buildingId && !(await Building.exists({ _id: buildingId, companyId: user.companyId }))) throw new DatabaseError(404, "Building not found");
  const result = await Inventory.updateOne({ _id: inventoryId, companyId: user.companyId }, { $set: { buildingId: buildingId || null } });
  if (!result.matchedCount) throw new DatabaseError(404, "Property not found");
  return { buildingId: buildingId || null };
};

/* ----------------------------------------------------------- panels -- */

const inventoryPanel = async ({ user, inventoryId }) => {
  if (!isId(inventoryId)) throw new DatabaseError(400, "Invalid property");
  const inventory = await Inventory.findOne({ _id: inventoryId, companyId: user.companyId })
    .select("_id propertyId buildingId ownerContactId occupancy availabilityVerification lastConfirmedAt sourceLinks createdAt")
    .populate("buildingId", "name buildingCode address locality city")
    .populate("availabilityVerification.confirmedByContactId", "name phone")
    .populate("sourceLinks.contactId", "name phone kind").lean();
  if (!inventory) throw new DatabaseError(404, "Property not found");
  await ensureLegacyOwnerRelationship(user.companyId, inventory);
  const buildingId = inventory.buildingId?._id || null;
  const [rels, buildingRels, interactions] = await Promise.all([
    Rel.find({ companyId: user.companyId, inventoryId }).populate("contactId", contactBrief).sort({ status: 1, startedAt: -1 }).lean(),
    buildingId ? Rel.find({ companyId: user.companyId, buildingId, status: { $ne: "FORMER" } }).populate("contactId", contactBrief).lean() : [],
    Interaction.find({ companyId: user.companyId, inventoryId }).populate("contactId", "name phone").sort({ at: -1 }).limit(100).lean(),
  ]);
  return {
    inventoryId,
    building: inventory.buildingId || null,
    owners: rels.filter((r) => r.role === "OWNER" && r.contactId),
    contacts: rels.filter((r) => r.role !== "OWNER" && r.contactId),
    buildingContacts: buildingRels.filter((r) => r.contactId),
    brokers: (inventory.sourceLinks || []).filter((l) => l.contactId).map((l) => ({ contact: l.contactId, availability: l.availability, confirmedAt: l.confirmedAt })),
    sources: interactions.filter((i) => i.type === "SOURCE_REPORT"),
    verification: { ...verificationView(inventory), confirmedBy: inventory.availabilityVerification?.confirmedByContactId || null },
    occupancy: inventory.occupancy || { status: "UNKNOWN", availableFrom: null },
    interactions,
  };
};

const contactPanel = async ({ user, contactId }) => {
  if (!isId(contactId)) throw new DatabaseError(400, "Invalid contact");
  const contact = await Contact.findOne({ _id: contactId, companyId: user.companyId }).select("_id kind name phone email company designation roles contactCode ownerType isContactPoint sourceNote archived relationshipStatus").lean();
  if (!contact) throw new DatabaseError(404, "Contact not found");
  const [rels, representatives, interactions] = await Promise.all([
    Rel.find({ companyId: user.companyId, contactId })
      .populate("buildingId", "name buildingCode locality city")
      .populate("inventoryId", "propertyId projectName towerName unitNumber status")
      .populate("ownerId", "name phone contactCode")
      .sort({ status: 1, updatedAt: -1 }).lean(),
    // For an owner: the people linked as their representatives (PA, manager...).
    contact.kind === "OWNER" ? Rel.find({ companyId: user.companyId, ownerId: contactId }).populate("contactId", contactBrief).lean() : [],
    Interaction.find({ companyId: user.companyId, contactId }).populate("inventoryId", "propertyId").populate("buildingId", "name").sort({ at: -1 }).limit(100).lean(),
  ]);
  return { contact, relationships: rels, representatives: representatives.filter((r) => r.contactId), interactions };
};

/* --------------------------------------------------------- duplicates -- */

/* Possible duplicate units: same building + floor + unit, same address + unit, or same building + floor + area. */
const findDuplicateInventory = async ({ user, body = {} }) => {
  const or = [];
  const unit = text(body.unitNumber, 60);
  const floor = body.floorNumber === "" || body.floorNumber === undefined || body.floorNumber === null ? null : Number(body.floorNumber);
  const area = Number(body.area || body.totalArea || body.carpetArea) || null;
  if (isId(body.buildingId)) {
    if (unit) or.push({ buildingId: body.buildingId, unitNumber: { $regex: `^${unit.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`, $options: "i" } });
    if (floor !== null && area) or.push({ buildingId: body.buildingId, floorNumber: floor, $or: [{ totalArea: area }, { carpetArea: area }] });
  }
  const location = text(body.location, 300);
  if (location.length >= 6 && unit) or.push({ location: { $regex: `^${location.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`, $options: "i" }, unitNumber: { $regex: `^${unit.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`, $options: "i" } });
  if (!or.length) return [];
  const filter = { companyId: user.companyId, $or: or };
  if (isId(body.excludeId)) filter._id = { $ne: body.excludeId };
  const rows = await Inventory.find(filter).select("_id propertyId projectName towerName unitNumber floorNumber totalArea status location").limit(10).lean();
  return rows;
};

/* ------------------------------------------------------ inventory hook -- */

/* A unit created from a contact's profile: record that contact as its source (1.5 / 1.6). */
const recordSourceForNewInventory = async (doc) => {
  const contact = await Contact.findOne({ _id: doc.initialSourceContactId, companyId: doc.companyId });
  await Inventory.updateOne({ _id: doc._id }, { $set: { initialSourceContactId: null } });
  if (!contact) return;
  const actor = { _id: doc.createdBy || null, companyId: doc.companyId, name: "" };
  const role = contact.kind === "OWNER" ? "OWNER" : contact.kind === "BROKER" ? "BROKER" : ((contact.roles || []).find((r) => !["OWNER", "BROKER"].includes(r)) || "OTHER");
  if (contact.kind === "BROKER") {
    // Brokers keep using the existing source-link workflow on the unit.
    await Inventory.updateOne({ _id: doc._id, "sourceLinks.contactId": { $ne: contact._id } }, { $push: { sourceLinks: { contactId: contact._id, availability: "AVAILABLE", addedBy: doc.createdBy || null, addedAt: new Date() } } });
    await Contact.updateOne({ _id: contact._id }, { $addToSet: { inventoryIds: doc._id } });
  } else {
    await createRelationship({ user: actor, body: { contactId: contact._id, inventoryId: doc._id, role, scope: "PROPERTIES", authority: role === "OWNER" ? "REPORTED" : "UNCONFIRMED", source: "Reported when the unit was added" } });
  }
  await Interaction.create({ companyId: doc.companyId, type: "SOURCE_REPORT", contactId: contact._id, inventoryId: doc._id, buildingId: doc.buildingId || null, sourceRole: role, reportedFacts: "Unit added from this contact's information", byUserId: doc.createdBy || null });
};

/* Contact merge: the dropped record's links and history move to the kept one. */
const moveDatabaseLinks = async ({ companyId, keepId, dropId }) => {
  const [a, b, c] = await Promise.all([
    Rel.updateMany({ companyId, contactId: dropId }, { $set: { contactId: keepId } }),
    Rel.updateMany({ companyId, ownerId: dropId }, { $set: { ownerId: keepId } }),
    Interaction.updateMany({ companyId, contactId: dropId }, { $set: { contactId: keepId } }),
  ]);
  return { relationships: (a.modifiedCount || 0) + (b.modifiedCount || 0), interactions: c.modifiedCount || 0 };
};

module.exports = {
  DatabaseError,
  ensureContactIndexes,
  ensureContactCode,
  verificationView,
  kindForRoles,
  sanitizeNewContact,
  findDuplicateContacts,
  createContact,
  listContacts,
  sanitizeBuilding,
  findDuplicateBuildings,
  createBuilding,
  updateBuilding,
  listBuildings,
  buildingProfile,
  buildingCounts,
  mergeBuildings,
  createRelationship,
  updateRelationship,
  changeOwner,
  ensureLegacyOwnerRelationship,
  logInteraction,
  setOccupancy,
  setInventoryBuilding,
  inventoryPanel,
  contactPanel,
  findDuplicateInventory,
  recordSourceForNewInventory,
  moveDatabaseLinks,
};
