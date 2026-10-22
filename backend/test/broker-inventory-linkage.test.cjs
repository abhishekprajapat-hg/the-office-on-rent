// Broker / channel partner / owner database and inventory source linkage
// (requirements 16 Oct 2026, sections 06, 07, 17).
const test = require("node:test");
const assert = require("node:assert/strict");
const mongoose = require("mongoose");

const rel = require("../src/services/relationship.service");
const Contact = require("../src/models/CrmContact");
const BrokerFirm = require("../src/models/BrokerFirm");
const Inventory = require("../src/models/Inventory");
const Lead = require("../src/models/Lead");

const admin = { _id: new mongoose.Types.ObjectId(), role: "ADMIN", companyId: new mongoose.Types.ObjectId() };
const exec = (roleType = "COMMERCIAL") => ({ _id: new mongoose.Types.ObjectId(), role: "EXECUTIVE", roleType, companyId: admin.companyId });

test("broker profile fields exist on the contact model", () => {
  const paths = Contact.schema.paths;
  for (const f of ["alternatePhone", "whatsapp", "designation", "brokerType", "firmId", "segments", "areas", "projects", "propertyTypes",
    "transactionTypes", "customerTypes", "relationshipStatus", "relationshipOwnerId", "lastContactAt", "nextFollowUpAt", "preferredContact",
    "cpStatus", "cpOnboardedAt", "brokerageTerms", "netRateNotes", "internalRemarks", "reraNumber", "source", "importStatus", "verified", "lastVerifiedAt"]) {
    assert.ok(paths[f], `CrmContact has ${f}`);
  }
  assert.deepEqual(paths.cpStatus.enumValues, ["NOT_ONBOARDED", "PENDING", "ACTIVE", "INACTIVE"]);
});

test("inventory keeps source type, several broker sources, owner and last-confirmed date", () => {
  const paths = Inventory.schema.paths;
  assert.ok(paths.sourceType && paths.sourceLinks && paths.lastConfirmedAt && paths.ownerContactId && paths.projectId);
  assert.deepEqual(paths.sourceType.enumValues, ["COMPANY", "OWNER", "BROKER", "PARTNER", "OTHER", ""]);
  const link = Inventory.schema.path("sourceLinks").schema.paths;
  assert.deepEqual(link.availability.enumValues, ["UNVERIFIED", "AVAILABLE", "ON_HOLD", "BOOKED", "SOLD", "WITHDRAWN"]);
  assert.ok(link.netRate && link.confirmedAt && link.contactId && link.firmId);
  assert.ok(Lead.schema.paths.referredByBrokerId, "lead links its referring broker");
  assert.ok(Lead.schema.path("sourceChannel").enumValues.includes("OTHER"));
});

test("net rates, brokerage terms and remarks: Admin/Manager only", () => {
  const contact = { name: "Ravi", brokerageTerms: "2%", netRateNotes: "4500/sqft", internalRemarks: "slow payer", blockedLeads: [{}] };
  const forExec = rel.stripRestrictedContact(contact, exec());
  assert.equal(forExec.brokerageTerms, undefined);
  assert.equal(forExec.netRateNotes, undefined);
  assert.equal(forExec.internalRemarks, undefined);
  assert.equal(forExec.blockedLeads, undefined);
  const forAdmin = rel.stripRestrictedContact(contact, admin);
  assert.equal(forAdmin.brokerageTerms, "2%");
  assert.throws(() => rel.sanitizeContactPatch({ netRateNotes: "x" }, exec()), /Only Admin or Manager/);
  assert.throws(() => rel.sanitizeContactPatch({ cpStatus: "ACTIVE" }, exec()), /channel partner status/);
  assert.equal(rel.sanitizeContactPatch({ cpStatus: "active" }, { role: "MANAGER" }).cpStatus, "ACTIVE");
});

test("profile patch cleans lists, enums, phone and dates", () => {
  const patch = rel.sanitizeContactPatch({
    segments: ["commercial", "Residential", "commercial"],
    areas: "Vijay Nagar, AB Road ,",
    transactionTypes: ["rent", "lease"],
    phone: "+91 98765 43210",
    nextFollowUpAt: "2026-10-25",
    brokerType: "independent",
  }, exec());
  assert.deepEqual(patch.segments, ["COMMERCIAL", "RESIDENTIAL"]);
  assert.deepEqual(patch.areas, ["Vijay Nagar", "AB Road"]);
  assert.deepEqual(patch.transactionTypes, ["RENT", "LEASE"]);
  assert.equal(patch.phone, "9876543210");
  assert.ok(patch.nextFollowUpAt instanceof Date);
  assert.equal(patch.brokerType, "INDEPENDENT");
  assert.throws(() => rel.sanitizeContactPatch({ segments: ["MARS"] }, exec()), /not allowed/);
  assert.throws(() => rel.sanitizeContactPatch({ phone: "12" }, exec()), /valid phone/);
});

test("CP activation records the date and approver; same status is no change", () => {
  const c = { cpStatus: "PENDING", cpOnboardedAt: null };
  const change = rel.applyCpStatus(c, "ACTIVE", admin);
  assert.deepEqual(change, { previous: "PENDING", next: "ACTIVE" });
  assert.ok(c.cpOnboardedAt instanceof Date);
  assert.equal(c.cpApprovedBy, admin._id);
  assert.equal(rel.applyCpStatus(c, "ACTIVE", admin), null);
});

test("segment visibility: brokers tagged to other segments are hidden from executives, never from management", () => {
  const resi = { segments: ["RESIDENTIAL"] };
  assert.equal(rel.canSeeContact(resi, exec("COMMERCIAL")), false);
  assert.equal(rel.canSeeContact(resi, exec("RESIDENTIAL")), true);
  assert.equal(rel.canSeeContact(resi, exec("BOTH")), true);
  assert.equal(rel.canSeeContact({ segments: [] }, exec("COWORKING")), true, "untagged brokers stay visible");
  assert.equal(rel.canSeeContact(resi, admin), true);
  assert.equal(rel.segmentVisibilityClause(admin), null);
  assert.ok(rel.segmentVisibilityClause(exec("COMMERCIAL")).$or);
});

test("stale = never confirmed or older than the threshold", () => {
  const now = new Date("2026-10-19T00:00:00Z");
  assert.equal(rel.isStale(null, now), true);
  assert.equal(rel.isStale(new Date("2026-10-10T00:00:00Z"), now, 30), false);
  assert.equal(rel.isStale(new Date("2026-09-01T00:00:00Z"), now, 30), true);
});

test("source link: broker or firm required; only management records a net rate", () => {
  const id = String(new mongoose.Types.ObjectId());
  assert.throws(() => rel.sanitizeSourceLink({}, admin), /broker or a firm/);
  const link = rel.sanitizeSourceLink({ contactId: id, askingPrice: "5000000", availability: "on hold" }, exec());
  assert.equal(link.askingPrice, 5000000);
  assert.equal(link.availability, "ON_HOLD");
  assert.ok(link.confirmedAt instanceof Date, "adding a quote confirms it today");
  assert.throws(() => rel.sanitizeSourceLink({ contactId: id, netRate: 4000 }, exec()), /net rate/);
  assert.equal(rel.sanitizeSourceLink({ contactId: id, netRate: 4000 }, admin).netRate, 4000);
  assert.throws(() => rel.sanitizeSourceLink({ contactId: id, askingPrice: -1 }, admin), /0 or more/);
});

test("inventory API views: net rate hidden from executives, sources hidden from channel partners", () => {
  const { toSourceLinksView, toRoleBasedInventory, toLegacyAsset } = require("../src/controllers/inventory.controller")._test;
  const links = [{ _id: "l1", contactId: { _id: "c1", name: "Ravi", phone: "98", kind: "BROKER" }, askingPrice: 10, netRate: 8, confirmedAt: new Date() }];
  assert.equal(toSourceLinksView(links, "ADMIN")[0].netRate, 8);
  assert.equal(toSourceLinksView(links, "EXECUTIVE")[0].netRate, undefined);
  assert.equal(toSourceLinksView(links, "EXECUTIVE")[0].contact.name, "Ravi");
  assert.deepEqual(toSourceLinksView(links, "CHANNEL_PARTNER"), []);
  const raw = { _id: "i1", projectName: "Omex City", sourceLinks: links, sourceType: "BROKER" };
  assert.equal(toRoleBasedInventory(raw, "EXECUTIVE").sourceLinks[0].netRate, undefined);
  assert.equal(toRoleBasedInventory(raw, "MANAGER").sourceLinks[0].netRate, 8);
  assert.equal(toRoleBasedInventory(raw, "CHANNEL_PARTNER").sourceLinks, undefined);
  const asset = toLegacyAsset(raw, "EXECUTIVE");
  assert.equal(asset.sourceType, "BROKER");
  assert.equal(asset.stale, false);
  assert.equal(toLegacyAsset({ ...raw, sourceLinks: [] }, "EXECUTIVE").stale, true, "never confirmed is stale");
});

test("RERA import: dedupes by phone/RERA no., links firms, never marks verified or CP", async () => {
  const companyId = admin.companyId;
  const store = [{ _id: "existing", phone: "9876500001", reraNumber: "", email: "", city: "", company: "", firmId: null, save: async function save() { this.saved = true; } }];
  const created = [];
  const origFind = Contact.findOne; const origCreate = Contact.create; const origFirm = BrokerFirm.findOneAndUpdate;
  Contact.findOne = async (q) => store.find((c) => q.$or.some((o) => (o.phone && o.phone === c.phone) || (o.reraNumber && o.reraNumber === c.reraNumber))) || null;
  Contact.create = async (doc) => { created.push(doc); store.push({ ...doc }); return doc; };
  BrokerFirm.findOneAndUpdate = async (q) => ({ _id: `firm-${q.nameKey}` });
  try {
    const result = await rel.importReraBrokers({
      companyId,
      actor: admin._id,
      rows: [
        { Name: "Existing Broker", Mobile: "+91 98765 00001", "RERA Registration No": "P-123", Firm: "Sky Realty" },
        { Name: "New Broker", Mobile: "9876500002", "RERA No": "P-456", Firm: "Sky Realty" },
        { Name: "Same RERA", Mobile: "", "RERA No": "P-456" },
        { Name: "", Mobile: "9876500003" },
      ],
    });
    assert.equal(result.created, 1);
    assert.equal(result.updated, 1, "existing broker gets the RERA number filled in");
    assert.equal(result.skipped, 2);
    assert.equal(store[0].reraNumber, "P-123");
    assert.equal(created[0].verified, false);
    assert.equal(created[0].cpStatus, "NOT_ONBOARDED");
    assert.equal(created[0].source, "RERA_IMPORT");
    assert.equal(created[0].firmId, "firm-sky realty");
  } finally {
    Contact.findOne = origFind; Contact.create = origCreate; BrokerFirm.findOneAndUpdate = origFirm;
  }
});

test("merge refuses mixing owners with brokers or merging a record into itself", async () => {
  const id = String(new mongoose.Types.ObjectId());
  await assert.rejects(rel.mergeContacts({ companyId: admin.companyId, keepId: id, dropId: id }), /two different/);
  const origFind = Contact.findOne;
  Contact.findOne = async ({ _id }) => ({ _id, kind: String(_id).endsWith("1") ? "OWNER" : "BROKER" });
  try {
    await assert.rejects(rel.mergeContacts({ companyId: admin.companyId, keepId: "a".repeat(23) + "1", dropId: "a".repeat(23) + "2" }), /same kind/);
  } finally {
    Contact.findOne = origFind;
  }
});

test("new inventory fields pass the payload sanitiser", () => {
  const { sanitizeInventoryPayload } = require("../src/services/inventoryWorkflow.service");
  const projectId = String(new mongoose.Types.ObjectId());
  const out = sanitizeInventoryPayload({ payload: { projectName: "Omex City", towerName: "A", location: "Indore", sourceType: "broker", lastConfirmedAt: "2026-10-18", projectId }, mode: "update" });
  assert.equal(out.sourceType, "BROKER");
  assert.ok(out.lastConfirmedAt instanceof Date);
  assert.equal(out.projectId, projectId);
  assert.throws(() => sanitizeInventoryPayload({ payload: { sourceType: "ALIEN" }, mode: "update" }), /sourceType/);
});
