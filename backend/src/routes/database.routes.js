const express = require("express");
const authMiddleware = require("../middleware/auth.middleware");
const companyMiddleware = require("../middleware/company.middleware");
const { checkRoleOrPageAccess, requirePageAccess, requirePageActionForMethod } = require("../middleware/pageAccess.middleware");
const { writeLimiter } = require("../middleware/rateLimit.middleware");
const { writeAuditLog } = require("../services/auditLog.service");
const db = require("../services/database.service");
const { DATABASE_ROLES, DATABASE_MANAGE_ROLES } = require("../constants/database.constants");

/*
 * Database module (Developmental Updates Oct 2026 - Update 01): contacts of
 * every role, buildings, relationships, call / verification history and
 * duplicate checks. Internal only - channel partners are refused here, as on
 * the Owner and Broker Databases. Permissions are checked on the server.
 */
const router = express.Router();
router.use(authMiddleware.protect);
router.use(companyMiddleware.requireCompanyContext);
router.use(checkRoleOrPageAccess(DATABASE_ROLES, "database", "inventory"));
router.use(requirePageAccess("database", "inventory"));
router.use(requirePageActionForMethod("database"));
const manageOnly = authMiddleware.checkRole(DATABASE_MANAGE_ROLES);

const send = (fn, status = 200) => async (req, res) => {
  try {
    const out = await fn(req);
    return res.status(status).json(out);
  } catch (error) {
    if (error.statusCode) {
      return res.status(error.statusCode).json({ message: error.message, ...(error.duplicates ? { duplicates: error.duplicates } : {}), ...(error.needsConfirmation ? { needsConfirmation: true } : {}), ...(error.existingId ? { existingId: error.existingId } : {}), ...(error.kind ? { duplicateKind: error.kind } : {}) });
    }
    if (error.name === "ValidationError" || error.name === "CastError") return res.status(400).json({ message: error.message });
    req.log?.error?.(error);
    return res.status(500).json({ message: "Something went wrong in the Database module" });
  }
};
const audit = (req, action, entityType, entityId, metadata = {}) => writeAuditLog({ companyId: req.user.companyId, actor: req.user, action, entityType, entityId, metadata, req }).catch(() => {});

/* ---- options for the forms ---- */
router.get("/meta", (req, res) => {
  const D = require("../constants/database.constants");
  res.json({
    roles: D.CONTACT_ROLES, ownerTypes: D.OWNER_TYPES.filter(Boolean), buildingTypes: D.BUILDING_TYPES, scopes: D.RELATIONSHIP_SCOPES,
    relationshipStates: D.RELATIONSHIP_STATES, authority: D.AUTHORITY_LEVELS, verificationStates: D.VERIFICATION_STATES,
    occupancy: D.OCCUPANCY_STATES, callOutcomes: D.CALL_OUTCOMES, verificationDueDays: D.VERIFICATION_DUE_DAYS,
    ownerStatuses: require("../constants/relationship.constants").RELATIONSHIP_STATUSES.filter(Boolean),
  });
});

/* ---- contacts (every role) ---- */
router.get("/contacts", send((req) => db.listContacts({ user: req.user, query: req.query })));
router.post("/contacts", writeLimiter, send(async (req) => {
  const out = await db.createContact({ user: req.user, body: req.body || {} });
  await audit(req, "DATABASE_CONTACT_CREATED", "CrmContact", out.contact._id, { name: out.contact.name, kind: out.contact.kind, roles: out.contact.roles });
  return { contact: out.contact, relationships: out.relationships };
}, 201));
router.get("/contacts/:contactId/links", send((req) => db.contactPanel({ user: req.user, contactId: req.params.contactId })));

/* ---- duplicate checks before saving (1.7) ---- */
router.post("/duplicates", send(async (req) => {
  const body = req.body || {};
  const type = String(body.type || "").toLowerCase();
  if (type === "contact") return { duplicates: await db.findDuplicateContacts({ companyId: req.user.companyId, phone: body.phone, alternatePhone: body.alternatePhone, email: body.email, excludeId: body.excludeId || null }) };
  if (type === "building") return { duplicates: await db.findDuplicateBuildings({ companyId: req.user.companyId, name: body.name, aliases: body.aliases || [], address: body.address, city: body.city, excludeId: body.excludeId || null }) };
  if (type === "inventory") return { duplicates: await db.findDuplicateInventory({ user: req.user, body }) };
  throw new db.DatabaseError(400, "type must be contact, building or inventory");
}));

/* ---- buildings ---- */
router.get("/buildings", send((req) => db.listBuildings({ user: req.user, query: req.query })));
router.post("/buildings", writeLimiter, send(async (req) => {
  const building = await db.createBuilding({ user: req.user, body: req.body || {} });
  await audit(req, "DATABASE_BUILDING_CREATED", "Building", building._id, { name: building.name, buildingCode: building.buildingCode });
  return { building };
}, 201));
router.get("/buildings/:id", send((req) => db.buildingProfile({ user: req.user, id: req.params.id })));
router.patch("/buildings/:id", writeLimiter, send(async (req) => {
  const building = await db.updateBuilding({ user: req.user, id: req.params.id, body: req.body || {} });
  await audit(req, "DATABASE_BUILDING_UPDATED", "Building", building._id, { fields: Object.keys(req.body || {}) });
  return { building };
}));
router.post("/buildings/:id/merge", writeLimiter, manageOnly, send(async (req) => {
  const out = await db.mergeBuildings({ user: req.user, keepId: req.params.id, dropId: req.body?.duplicateId });
  await audit(req, "DATABASE_BUILDING_MERGED", "Building", out.building._id, { removed: out.removed, moved: out.moved });
  return out;
}));

/* ---- relationships ---- */
router.post("/relationships", writeLimiter, send(async (req) => {
  const rel = await db.createRelationship({ user: req.user, body: req.body || {} });
  await audit(req, "DATABASE_LINK_CREATED", "DbRelationship", rel._id, { role: rel.role, contactId: rel.contactId });
  return { relationship: rel };
}, 201));
router.patch("/relationships/:id", writeLimiter, send(async (req) => {
  const rel = await db.updateRelationship({ user: req.user, id: req.params.id, body: req.body || {} });
  await audit(req, "DATABASE_LINK_UPDATED", "DbRelationship", rel._id, { status: rel.status, authority: rel.authority });
  return { relationship: rel };
}));

/* ---- calls, notes, source reports, verifications ---- */
router.post("/interactions", writeLimiter, send(async (req) => ({ interaction: await db.logInteraction({ user: req.user, body: req.body || {} }) }), 201));

/* ---- a property's building, owners, contacts, verification ---- */
router.get("/inventory/:inventoryId", send((req) => db.inventoryPanel({ user: req.user, inventoryId: req.params.inventoryId })));
router.put("/inventory/:inventoryId/building", writeLimiter, send((req) => db.setInventoryBuilding({ user: req.user, inventoryId: req.params.inventoryId, buildingId: req.body?.buildingId || null })));
router.put("/inventory/:inventoryId/occupancy", writeLimiter, send((req) => db.setOccupancy({ user: req.user, inventoryId: req.params.inventoryId, body: req.body || {} })));
router.post("/inventory/:inventoryId/owners", writeLimiter, send(async (req) => {
  const body = req.body || {};
  // replace: true ends the current owners first (an ownership change); otherwise a joint owner is added.
  const out = body.replace
    ? await db.changeOwner({ user: req.user, inventoryId: req.params.inventoryId, newOwnerId: body.contactId, reason: body.reason, share: body.share })
    : { relationship: await db.createRelationship({ user: req.user, body: { contactId: body.contactId, inventoryId: req.params.inventoryId, role: "OWNER", share: body.share, authority: body.authority, source: body.reason } }) };
  await audit(req, body.replace ? "DATABASE_OWNER_CHANGED" : "DATABASE_OWNER_ADDED", "Inventory", req.params.inventoryId, { contactId: body.contactId });
  return out;
}, 201));

module.exports = router;
