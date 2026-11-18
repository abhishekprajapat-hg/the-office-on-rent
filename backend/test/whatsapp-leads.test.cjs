const test = require("node:test");
const assert = require("node:assert/strict");
const http = require("node:http");
const mongoose = require("mongoose");

// The WhatsApp dashboard's lead endpoint against a real MongoDB (a throwaway database). Set
// TEST_MONGO_URI to point elsewhere; without a reachable database these tests are skipped.
const TEST_MONGO_URI = process.env.TEST_MONGO_URI || "mongodb://127.0.0.1:27027/crm_whatsapp_test?replicaSet=rs0";
const SECRET = "test-shared-secret-0123456789-abcdef";

process.env.JWT_SECRET = process.env.JWT_SECRET || "whatsapp-leads-test-secret";
process.env.WHATSAPP_DASHBOARD_SECRET = SECRET;

const app = require("../src/app");
const Lead = require("../src/models/Lead");
const User = require("../src/models/User");
const Company = require("../src/models/Company");
const CrmContact = require("../src/models/CrmContact");
const { signBody, verifySignature, notifyLeadAssigned, toWaId } = require("../src/services/whatsappDashboard.service");

let server;
let baseUrl;
let reachable = true;
let companyId;
const users = {};

const listen = (handler) =>
  new Promise((resolve) => {
    const created = http.createServer(handler);
    created.listen(0, "127.0.0.1", () => resolve(created));
  });

const postLead = async (payload, { secret = SECRET, timestamp = String(Date.now()) } = {}) => {
  const body = JSON.stringify(payload);
  const response = await fetch(`${baseUrl}/api/integrations/whatsapp/leads`, {
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
  process.env.WHATSAPP_COMPANY_ID = String(companyId);

  users.manager = await makeUser({ name: "Manager", email: "manager@oor.test", role: "MANAGER", roleType: "BOTH" });
  users.commercialBusy = await makeUser({ name: "Commercial Busy", email: "busy@oor.test", role: "INSIDE_EXECUTIVE", roleType: "COMMERCIAL", parentId: users.manager });
  users.commercialFree = await makeUser({ name: "Commercial Free", email: "free@oor.test", role: "INSIDE_EXECUTIVE", roleType: "COMMERCIAL", parentId: users.manager });
  users.residential = await makeUser({ name: "Residential Exec", email: "resi@oor.test", role: "INSIDE_EXECUTIVE", roleType: "RESIDENTIAL", parentId: users.manager });
  // The busy one already has three open commercial leads.
  for (let index = 0; index < 3; index += 1) {
    await Lead.collection.insertOne({ name: `Old ${index}`, phone: `90000000${index}0`, companyId, source: "MANUAL", status: "CONTACTED", assignedTo: users.commercialBusy, requirements: { inventoryType: "COMMERCIAL" }, createdAt: new Date(Date.now() - 86_400_000) });
  }

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

test("signature: only the shared secret over the exact body, within five minutes", () => {
  const timestamp = String(Date.now());
  const signature = signBody(SECRET, timestamp, '{"a":1}');
  assert.equal(verifySignature(SECRET, timestamp, '{"a":1}', signature), true);
  assert.equal(verifySignature(SECRET, timestamp, '{"a":2}', signature), false);
  assert.equal(verifySignature("another-secret", timestamp, '{"a":1}', signature), false);
  const old = String(Date.now() - 6 * 60 * 1000);
  assert.equal(verifySignature(SECRET, old, '{"a":1}', signBody(SECRET, old, '{"a":1}')), false);
  assert.equal(toWaId("98765 43210"), "919876543210");
  assert.equal(toWaId("META-ABC"), "");
});

test("a request not signed with the shared secret is refused and nothing is saved", async (t) => {
  if (!reachable) return t.skip("no test database");
  const refused = await postLead({ phone: "919800000009", department: "COMMERCIAL" }, { secret: "someone-else" });
  assert.equal(refused.status, 401);
  assert.equal(await Lead.countDocuments({ source: "WHATSAPP" }), 0);
});

test("a residential WhatsApp lead goes to a residential executive; a commercial one to the least loaded commercial executive", async (t) => {
  if (!reachable) return t.skip("no test database");
  const residential = await postLead({ phone: "919800000001", name: "Asha", department: "RESIDENTIAL", departmentName: "Residential", source: "WHATSAPP", ad: { id: "120200", headline: "2BHK in Vijay Nagar", url: "https://fb.me/x" }, firstMessage: "Is the 2BHK available?", chatId: "65f000000000000000000001" });
  assert.equal(residential.status, 201);
  assert.equal(residential.data.created, true);
  assert.deepEqual(residential.data.assignee, { name: "Residential Exec", email: "resi@oor.test" });
  const saved = await Lead.findById(residential.data.leadId);
  assert.equal(saved.source, "WHATSAPP");
  assert.equal(saved.phone, "9800000001", "Indian numbers are saved as the 10 digits the team types");
  assert.equal(saved.requirements.inventoryType, "RESIDENTIAL");
  assert.equal(saved.whatsapp.adHeadline, "2BHK in Vijay Nagar");
  assert.equal(String(saved.assignedManager), String(users.manager));

  const commercial = await postLead({ phone: "919800000002", name: "Ravi", department: "COMMERCIAL" });
  assert.equal(commercial.status, 201);
  assert.equal(commercial.data.assignee.email, "free@oor.test", "the executive with fewer open leads gets it");
});

test("a number in the Broker Database is not made a lead; the attempt is counted on the broker", async (t) => {
  if (!reachable) return t.skip("no test database");
  const brokerId = new mongoose.Types.ObjectId();
  await CrmContact.collection.insertOne({ _id: brokerId, companyId, kind: "BROKER", name: "Mehta Properties", phone: "9811122233", createdAt: new Date() });
  const before = await Lead.countDocuments();
  const response = await postLead({ phone: "919811122233", name: "Mehta", department: "COMMERCIAL", firstMessage: "I have clients" });
  assert.equal(response.status, 200);
  assert.equal(response.data.brokerBlocked, true);
  assert.equal(response.data.brokerName, "Mehta Properties");
  assert.equal(response.data.leadId, null);
  assert.equal(await Lead.countDocuments(), before, "no lead created");
  const broker = await CrmContact.findById(brokerId).lean();
  assert.equal(broker.blockedLeadCount, 1);
  assert.equal(broker.blockedLeads[0].origin, "WHATSAPP");
});

test("a number that is already a lead is linked, not duplicated, and keeps its owner", async (t) => {
  if (!reachable) return t.skip("no test database");
  const existingId = new mongoose.Types.ObjectId();
  await Lead.collection.insertOne({ _id: existingId, name: "Typed by hand", phone: "9800000003", companyId, source: "MANUAL", status: "CONTACTED", assignedTo: users.commercialBusy, requirements: { inventoryType: "" }, createdAt: new Date() });

  const first = await postLead({ phone: "919800000003", department: "COMMERCIAL" });
  assert.equal(first.status, 200);
  assert.equal(first.data.created, false);
  assert.equal(first.data.leadId, String(existingId));
  assert.equal(first.data.assignee.email, "busy@oor.test", "the person already handling the lead keeps it");
  const linked = await Lead.findById(existingId);
  assert.ok(linked.whatsapp.linkedAt);
  assert.equal(linked.requirements.inventoryType, "COMMERCIAL", "an empty type is filled in");
  assert.equal(await Lead.countDocuments({ phone: { $in: ["9800000003", "919800000003"] } }), 1);

  const again = await postLead({ phone: "919800000001", department: "RESIDENTIAL" });
  assert.equal(again.data.created, false);
  assert.equal(await Lead.countDocuments({ source: "WHATSAPP", phone: "9800000001" }), 1);
});

test("a lead whose owner has left is assigned again", async (t) => {
  if (!reachable) return t.skip("no test database");
  const leaver = await makeUser({ name: "Leaver", email: "left@oor.test", role: "INSIDE_EXECUTIVE", roleType: "RESIDENTIAL", isActive: false });
  await Lead.collection.insertOne({ name: "Orphan", phone: "9800000004", companyId, source: "MANUAL", status: "NEW", assignedTo: leaver, requirements: { inventoryType: "RESIDENTIAL" }, createdAt: new Date() });
  const result = await postLead({ phone: "919800000004", department: "RESIDENTIAL" });
  assert.equal(result.data.assignee.email, "resi@oor.test");
});

test("a reassigned WhatsApp lead is sent to the dashboard, signed; other leads are not", async (t) => {
  if (!reachable) return t.skip("no test database");
  const received = [];
  const dashboard = await listen((req, res) => {
    let body = "";
    req.on("data", (chunk) => (body += chunk));
    req.on("end", () => {
      received.push({ path: req.url, body, valid: verifySignature(SECRET, req.headers["x-oor-timestamp"], body, req.headers["x-oor-signature"]) });
      res.writeHead(200, { "content-type": "application/json" });
      res.end('{"ok":true}');
    });
  });
  process.env.WHATSAPP_DASHBOARD_URL = `http://127.0.0.1:${dashboard.address().port}`;
  try {
    const linked = await Lead.findOne({ source: "WHATSAPP", phone: "9800000001" });
    const sent = await notifyLeadAssigned({ lead: linked, assignee: { name: "Commercial Free", email: "free@oor.test" } });
    assert.equal(sent.sent, true);
    assert.equal(received.length, 1);
    assert.equal(received[0].path, "/webhooks/crm");
    assert.equal(received[0].valid, true);
    assert.deepEqual(JSON.parse(received[0].body), { type: "lead.assigned", phone: "919800000001", leadId: String(linked._id), assignee: { email: "free@oor.test", name: "Commercial Free" } });

    const manual = await Lead.findOne({ name: "Old 0" });
    assert.equal((await notifyLeadAssigned({ lead: manual, assignee: null })).sent, false, "leads without a WhatsApp chat are not sent");
    assert.equal(received.length, 1);
  } finally {
    delete process.env.WHATSAPP_DASHBOARD_URL;
    dashboard.close();
  }
});

test("a chat from a department whose CRM value is COWORKING goes to a coworking executive", async (t) => {
  if (!reachable) return t.skip("no test database");
  await makeUser({ name: "Coworking Exec", email: "cowork@oor.test", role: "INSIDE_EXECUTIVE", roleType: "COWORKING", parentId: users.manager });
  const response = await postLead({ phone: "919800000077", name: "Neel", department: "COWORKING", departmentName: "Coworking" });
  assert.equal(response.status, 201);
  assert.equal(response.data.assignee.email, "cowork@oor.test");
  assert.equal((await Lead.findById(response.data.leadId)).requirements.inventoryType, "COWORKING");
});
