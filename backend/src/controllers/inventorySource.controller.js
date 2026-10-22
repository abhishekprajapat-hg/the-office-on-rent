/*
 * Who offers a unit and when it was last checked (requirements 16 Oct 2026,
 * 6.3, 7.1, 7.2 and 17.2).
 *
 * One unit stays one inventory record. Each broker or firm offering it is a
 * source link on that record with their own asking price, availability and
 * confirmation date; the owner is a separate link.
 */
const mongoose = require("mongoose");
const Inventory = require("../models/Inventory");
const Contact = require("../models/CrmContact");
const BrokerFirm = require("../models/BrokerFirm");
const { writeAuditLog } = require("../services/auditLog.service");
const { getInventoryScopeQueryForUser } = require("../services/inventoryWorkflow.service");
const { sanitizeSourceLink, RelationshipError, canSeeRestricted } = require("../services/relationship.service");
const { SOURCE_AVAILABILITY } = require("../constants/relationship.constants");

const sendError = (req, res, error, fallback) => {
  if (error instanceof RelationshipError || error?.statusCode) {
    return res.status(error.statusCode).json({ message: error.message });
  }
  req.log?.error?.({ error: error.message, message: fallback });
  return res.status(500).json({ message: fallback });
};

const loadScopedInventory = async (req) => {
  if (!mongoose.isValidObjectId(req.params.id)) throw new RelationshipError(400, "Invalid inventory id");
  const scope = await getInventoryScopeQueryForUser(req.user);
  const inventory = await Inventory.findOne({ ...scope, _id: req.params.id });
  if (!inventory) throw new RelationshipError(404, "Inventory not found");
  return inventory;
};

const linkView = (link, user) => {
  const row = typeof link.toObject === "function" ? link.toObject() : { ...link };
  if (!canSeeRestricted(user)) delete row.netRate;
  return row;
};

const verifyRefs = async (companyId, { contactId, firmId }) => {
  if (contactId) {
    const contact = await Contact.findOne({ _id: contactId, companyId }).select("_id kind name firmId").lean();
    if (!contact) throw new RelationshipError(400, "Broker not found");
    if (contact.kind !== "BROKER") throw new RelationshipError(400, "Source links are for brokers. Link an owner with 'Set owner' instead.");
    return contact;
  }
  if (firmId && !(await BrokerFirm.exists({ _id: firmId, companyId }))) throw new RelationshipError(400, "Firm not found");
  return null;
};

/* POST /inventory/:id/sources - add a broker/firm (or refresh their existing link). */
exports.addSourceLink = async (req, res) => {
  try {
    const inventory = await loadScopedInventory(req);
    const link = sanitizeSourceLink(req.body || {}, req.user);
    const contact = await verifyRefs(req.user.companyId, link);
    if (contact && !link.firmId && contact.firmId) link.firmId = contact.firmId;

    const existing = inventory.sourceLinks.find((l) => (link.contactId
      ? String(l.contactId) === String(link.contactId)
      : !l.contactId && String(l.firmId) === String(link.firmId)));
    let saved;
    if (existing) {
      Object.entries(link).forEach(([k, v]) => {
        if (k === "netRate" || v !== null) existing[k] = v;
      });
      saved = existing;
    } else {
      inventory.sourceLinks.push({ ...link, addedBy: req.user._id, addedAt: new Date() });
      saved = inventory.sourceLinks[inventory.sourceLinks.length - 1];
    }
    if (!inventory.sourceType) inventory.sourceType = "BROKER";
    await inventory.save();
    if (link.contactId) {
      await Contact.updateOne({ _id: link.contactId, companyId: req.user.companyId }, { $addToSet: { inventoryIds: inventory._id } });
    }
    await writeAuditLog({
      companyId: req.user.companyId, actor: req.user,
      action: existing ? "INVENTORY_SOURCE_UPDATED" : "INVENTORY_SOURCE_LINKED",
      entityType: "Inventory", entityId: inventory._id,
      metadata: { propertyId: inventory.propertyId, contactId: link.contactId, firmId: link.firmId, availability: link.availability },
      req,
    });
    return res.status(existing ? 200 : 201).json({
      message: existing ? "Source updated (this broker was already linked)" : "Source linked",
      link: linkView(saved, req.user),
      inventoryId: inventory._id,
    });
  } catch (error) {
    return sendError(req, res, error, "Failed to link source");
  }
};

/* PATCH /inventory/:id/sources/:linkId - update a quote or its availability. */
exports.updateSourceLink = async (req, res) => {
  try {
    const inventory = await loadScopedInventory(req);
    const link = inventory.sourceLinks.id(req.params.linkId);
    if (!link) return res.status(404).json({ message: "Source not found" });
    const body = { contactId: link.contactId, firmId: link.firmId, confirmedAt: link.confirmedAt, ...req.body };
    const clean = sanitizeSourceLink(body, req.user);
    const previous = { availability: link.availability, askingPrice: link.askingPrice, askingRent: link.askingRent };
    ["askingPrice", "askingRent", "marketRateNote", "availability", "confirmedAt", "notes"].forEach((k) => {
      if (Object.prototype.hasOwnProperty.call(req.body || {}, k)) link[k] = clean[k];
    });
    if (Object.prototype.hasOwnProperty.call(clean, "netRate")) link.netRate = clean.netRate;
    await inventory.save();
    await writeAuditLog({
      companyId: req.user.companyId, actor: req.user, action: "INVENTORY_SOURCE_UPDATED",
      entityType: "Inventory", entityId: inventory._id,
      metadata: { propertyId: inventory.propertyId, linkId: String(link._id), previous, next: { availability: link.availability, askingPrice: link.askingPrice, askingRent: link.askingRent } },
      req,
    });
    return res.json({ message: "Source updated", link: linkView(link, req.user) });
  } catch (error) {
    return sendError(req, res, error, "Failed to update source");
  }
};

/* DELETE /inventory/:id/sources/:linkId - Admin/Manager remove a source link. */
exports.removeSourceLink = async (req, res) => {
  try {
    const inventory = await loadScopedInventory(req);
    const link = inventory.sourceLinks.id(req.params.linkId);
    if (!link) return res.status(404).json({ message: "Source not found" });
    const { contactId } = link;
    link.deleteOne();
    await inventory.save();
    if (contactId) {
      await Contact.updateOne({ _id: contactId, companyId: req.user.companyId }, { $pull: { inventoryIds: inventory._id } });
    }
    await writeAuditLog({
      companyId: req.user.companyId, actor: req.user, action: "INVENTORY_SOURCE_REMOVED",
      entityType: "Inventory", entityId: inventory._id, metadata: { propertyId: inventory.propertyId, contactId }, req,
    });
    return res.json({ message: "Source removed" });
  } catch (error) {
    return sendError(req, res, error, "Failed to remove source");
  }
};

/*
 * POST /inventory/:id/confirm - "I checked this today". Optionally confirms
 * one source link and its availability at the same time.
 */
exports.confirmInventory = async (req, res) => {
  try {
    const inventory = await loadScopedInventory(req);
    const now = new Date();
    inventory.lastConfirmedAt = now;
    const linkId = req.body?.linkId;
    if (linkId) {
      const link = inventory.sourceLinks.id(linkId);
      if (!link) return res.status(404).json({ message: "Source not found" });
      link.confirmedAt = now;
      if (req.body?.availability) {
        const a = String(req.body.availability).toUpperCase();
        if (!SOURCE_AVAILABILITY.includes(a)) return res.status(400).json({ message: "availability is invalid" });
        link.availability = a;
      }
    }
    await inventory.save();
    await writeAuditLog({
      companyId: req.user.companyId, actor: req.user, action: "INVENTORY_CONFIRMED",
      entityType: "Inventory", entityId: inventory._id, metadata: { propertyId: inventory.propertyId, linkId: linkId || null }, req,
    });
    return res.json({ message: "Marked as confirmed today", lastConfirmedAt: now });
  } catch (error) {
    return sendError(req, res, error, "Failed to confirm");
  }
};

/*
 * PUT /inventory/:id/owner - link the unit to an owner in the Owner Database
 * (17.2). The owner's name and number are copied onto the unit so existing
 * screens keep showing them.
 */
exports.setOwner = async (req, res) => {
  try {
    const inventory = await loadScopedInventory(req);
    const { contactId } = req.body || {};
    if (contactId === null || contactId === "") {
      inventory.ownerContactId = null;
      await inventory.save();
      return res.json({ message: "Owner unlinked" });
    }
    if (!mongoose.isValidObjectId(contactId)) return res.status(400).json({ message: "Invalid owner" });
    const owner = await Contact.findOne({ _id: contactId, companyId: req.user.companyId, kind: "OWNER" });
    if (!owner) return res.status(404).json({ message: "Owner not found" });
    inventory.ownerName = owner.name;
    inventory.ownerNumber = owner.phone;
    inventory.ownerContactId = owner._id;
    if (!inventory.sourceType) inventory.sourceType = "OWNER";
    await inventory.save();
    await Contact.updateOne({ _id: owner._id }, { $addToSet: { inventoryIds: inventory._id } });
    await writeAuditLog({
      companyId: req.user.companyId, actor: req.user, action: "INVENTORY_OWNER_LINKED",
      entityType: "Inventory", entityId: inventory._id, metadata: { propertyId: inventory.propertyId, ownerId: String(owner._id) }, req,
    });
    return res.json({ message: "Owner linked", owner: { _id: owner._id, name: owner.name, phone: owner.phone } });
  } catch (error) {
    return sendError(req, res, error, "Failed to link owner");
  }
};
