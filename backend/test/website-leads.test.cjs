const test = require("node:test");
const assert = require("node:assert/strict");
const http = require("node:http");
const mongoose = require("mongoose");

// The website's enquiry endpoint against a real MongoDB (a throwaway database). Set
// TEST_MONGO_URI_WEBSITE to point elsewhere; without a reachable database these tests are skipped.
const TEST_MONGO_URI = process.env.TEST_MONGO_URI_WEBSITE || "mongodb://127.0.0.1:27027/crm_website_test?replicaSet=rs0";
const SECRET = "website-test-secret-0123456789-abcdef";

process.env.JWT_SECRET = process.env.JWT_SECRET || "website-leads-test-secret";
process.env.WEBSITE_LEADS_SECRET = SECRET;

const app = require("../src/app");
const Lead = require("../src/models/Lead");
const LeadActivity = require("../src/models/leadActivity.model");
const User = require("../src/models/User");
const Company = require("../src/models/Company");
const CrmContact = require("../src/models/CrmContact");
const { signBody } = require("../src/services/whatsappDashboard.service");

let server;
let baseUrl;
let reachable = true;
let companyId;
const users = {};
let counter = 0;
const enquiryId = () => `web_${Date.now()}_${(counter += 1)}abcdef`;

const listen = (handler) =>
  new Promise((resolve) => {
    const created = http.createServer(handler);
    created.listen(0, "127.0.0.1", () => resolve(created));
  });

const postLead = async (payload, { secret = SECRET, timestamp = String(Date.now()) } = {}) => {
  const body = JSON.stringify(payload);
  const response = await fetch(`${baseUrl}/api/integrations/website/leads`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-oor-timestamp": timestamp, "x-oor-signature": signBody(secret, timestamp, body) },
    body,
  });
  return { status: response.status, data: await response.json().catch(() => null) };
};

const makeUser = async (fields) => {
  const _id = new mongoose.Types.ObjectId();
  await User.collection.insertOne({
    _id,
    password: "x",
    phone: "",
    isActive: true,
    companyId,
    parentId: null,
    createdAt: new Date(),
    lastAssignedAt: null,
    ...fields,
  });
  return _id;
};

test.before(async () => {
  try {
    await mongoose.connect(TEST_MONGO_URI, { serverSelectionTimeoutMS: 2000 });
  } catch (_error) {
    reachable = false;
    return;
  }
  await mongoose.connection.db.dropDatabase();
  companyId = new mongoose.Types.ObjectId();
  await Company.collection.insertOne({ _id: companyId, name: "The Office on Rent", subdomain: "oor", status: "ACTIVE", createdAt: new Date() });
  process.env.WEBSITE_COMPANY_ID = String(companyId);

  users.manager = await makeUser({ name: "Manager", email: "manager@oor.test", role: "MANAGER", roleType: "BOTH" });
  users.commercial = await makeUser({ name: "Commercial Exec", email: "comm@oor.test", role: "INSIDE_EXECUTIVE", roleType: "COMMERCIAL", parentId: users.manager });
  users.residential = await makeUser({ name: "Residential Exec", email: "resi@oor.test", role: "INSIDE_EXECUTIVE", roleType: "RESIDENTIAL", parentId: users.manager });

  server = await listen(app);
  baseUrl = `http://127.0.0.1:${server.address().port}`;
});

test.after(async () => {
  server?.close();
  if (reachable) {
    await mongoose.connection.db.dropDatabase();
    await mongoose.disconnect();
  }
});

test("an enquiry not signed with the website secret is refused and nothing is saved", async (t) => {
  if (!reachable) return t.skip("no test database");
  const refused = await postLead({ enquiryId: enquiryId(), phone: "9800000009", name: "X" }, { secret: "someone-else" });
  assert.equal(refused.status, 401);
  const stale = String(Date.now() - 6 * 60 * 1000);
  const old = await postLead({ enquiryId: enquiryId(), phone: "9800000009", name: "X" }, { timestamp: stale });
  assert.equal(old.status, 401, "a replay older than five minutes is refused");
  assert.equal(await Lead.countDocuments({ source: "WEBSITE" }), 0);
});

test("bad input is refused: no enquiry id, or a phone that is not a mobile number", async (t) => {
  if (!reachable) return t.skip("no test database");
  assert.equal((await postLead({ phone: "9800000009" })).status, 400);
  assert.equal((await postLead({ enquiryId: enquiryId(), phone: "12345" })).status, 400);
});

test("a website enquiry becomes a WEBSITE lead with its details, assigned by the usual rules", async (t) => {
  if (!reachable) return t.skip("no test database");
  const response = await postLead({
    enquiryId: enquiryId(),
    name: "Neha Sharma",
    phone: "+91 98000 00001",
    email: "Neha@Example.com",
    workspaceType: "Ready to Move Offices",
    department: "COMMERCIAL",
    teamSize: "5-10",
    timeline: "This Month",
    message: "Near Vijay Nagar, budget 60k",
    page: "/ready-to-move/apollo-premier",
    property: "Apollo Premier",
  });
  assert.equal(response.status, 201);
  assert.equal(response.data.created, true);
  assert.deepEqual(response.data.assignee, { name: "Commercial Exec" });

  const saved = await Lead.findById(response.data.leadId).lean();
  assert.equal(saved.source, "WEBSITE");
  assert.equal(saved.sourceChannel, "WEBSITE");
  assert.equal(saved.phone, "9800000001");
  assert.equal(saved.email, "neha@example.com");
  assert.equal(saved.projectInterested, "Apollo Premier");
  assert.equal(saved.requirements.inventoryType, "COMMERCIAL");
  assert.equal(saved.website.teamSize, "5-10");
  assert.equal(saved.website.enquiries, 1);
  const activity = await LeadActivity.findOne({ lead: saved._id }).lean();
  assert.match(activity.action, /Lead created from the website \(\/ready-to-move\/apollo-premier\)/);
  assert.match(activity.action, /Team size: 5-10/);
  assert.match(activity.action, /Message: Near Vijay Nagar/);
});

test("a coworking or hostel pick with no department stays untyped and is still assigned", async (t) => {
  if (!reachable) return t.skip("no test database");
  const response = await postLead({ enquiryId: enquiryId(), name: "Arjun", phone: "9800000002", workspaceType: "Private Cabin", department: "" });
  assert.equal(response.status, 201);
  assert.ok(response.data.assignee, "an untyped lead is assigned like a commercial one");
  const saved = await Lead.findById(response.data.leadId).lean();
  assert.equal(saved.requirements.inventoryType, "");
  assert.equal(saved.projectInterested, "Private Cabin");
});

test("the same enquiry sent twice (a retry) is answered once, nothing doubled", async (t) => {
  if (!reachable) return t.skip("no test database");
  const id = enquiryId();
  const first = await postLead({ enquiryId: id, name: "Retry", phone: "9800000003" });
  const second = await postLead({ enquiryId: id, name: "Retry", phone: "9800000003" });
  assert.equal(first.status, 201);
  assert.equal(second.status, 200);
  assert.equal(second.data.duplicate, true);
  assert.equal(second.data.leadId, first.data.leadId);
  assert.equal(await Lead.countDocuments({ phone: "9800000003" }), 1);
  assert.equal(await LeadActivity.countDocuments({ lead: first.data.leadId, action: /website/ }), 1);
});

test("a number that is already a lead gets the new enquiry on that lead and keeps its owner", async (t) => {
  if (!reachable) return t.skip("no test database");
  const existing = await Lead.create({
    name: "Old Lead", phone: "9800000004", companyId, source: "MANUAL", status: "CONTACTED",
    assignedTo: users.residential, requirements: { inventoryType: "RESIDENTIAL" },
  });
  const response = await postLead({ enquiryId: enquiryId(), name: "Old Lead", phone: "919800000004", email: "old@lead.in", workspaceType: "Hostels", message: "Again" });
  assert.equal(response.status, 200);
  assert.equal(response.data.created, false);
  assert.equal(response.data.leadId, String(existing._id));
  assert.deepEqual(response.data.assignee, { name: "Residential Exec" });
  const saved = await Lead.findById(existing._id).lean();
  assert.equal(saved.source, "MANUAL", "how it first came in is kept");
  assert.equal(saved.status, "CONTACTED");
  assert.equal(saved.email, "old@lead.in", "an empty email is filled in");
  assert.equal(saved.website.enquiries, 1);
  const activity = await LeadActivity.findOne({ lead: existing._id }).lean();
  assert.match(activity.action, /Enquired again on the website/);
  assert.equal(await Lead.countDocuments({ phone: { $in: ["9800000004", "919800000004"] } }), 1);
});

test("a number in the Broker Database is not made a lead; the attempt is counted on the broker", async (t) => {
  if (!reachable) return t.skip("no test database");
  const brokerId = new mongoose.Types.ObjectId();
  await CrmContact.collection.insertOne({ _id: brokerId, companyId, kind: "BROKER", name: "Mehta Properties", phone: "9811122233", createdAt: new Date() });
  const before = await Lead.countDocuments();
  const response = await postLead({ enquiryId: enquiryId(), phone: "9811122233", name: "Mehta" });
  assert.equal(response.status, 200);
  assert.equal(response.data.brokerBlocked, true);
  assert.equal(await Lead.countDocuments(), before);
  const broker = await CrmContact.findById(brokerId).lean();
  assert.equal(broker.blockedLeads.at(-1).origin, "WEBSITE");
});

test("the leads list filters by the WEBSITE source", () => {
  const { applyLeadAdvancedFilters } = require("../src/utils/leadAdvancedFilters");
  assert.doesNotThrow(() => applyLeadAdvancedFilters({}, { source: "WEBSITE" }));
  assert.throws(() => applyLeadAdvancedFilters({}, { source: "FAX" }));
});
