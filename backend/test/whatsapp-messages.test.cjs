const test = require("node:test");
const assert = require("node:assert/strict");
const http = require("node:http");
const mongoose = require("mongoose");
const jwt = require("jsonwebtoken");

// WhatsApp messages the CRM asks the company's WhatsApp app to send, and what that app tells the CRM
// back (chat events, message status), against a real MongoDB and a stand-in for the WhatsApp app.
// Set TEST_MONGO_URI_WHATSAPP to point elsewhere; without a reachable database these tests are skipped.
const TEST_MONGO_URI = process.env.TEST_MONGO_URI_WHATSAPP || "mongodb://127.0.0.1:27027/crm_whatsapp_messages_test?replicaSet=rs0";
const DESK_SECRET = "desk-test-secret-0123456789-abcdefgh";
const WEBSITE_SECRET = "website-test-secret-0123456789-abcdef";

process.env.JWT_SECRET = process.env.JWT_SECRET || "whatsapp-messages-test-secret";
process.env.WHATSAPP_DASHBOARD_SECRET = DESK_SECRET;
process.env.WEBSITE_LEADS_SECRET = WEBSITE_SECRET;

const app = require("../src/app");
const Lead = require("../src/models/Lead");
const LeadActivity = require("../src/models/leadActivity.model");
const User = require("../src/models/User");
const Company = require("../src/models/Company");
const CustomerMessage = require("../src/models/CustomerMessage");
const customerMessages = require("../src/services/customerMessages.service");
const { signBody, verifySignature } = require("../src/services/whatsappDashboard.service");

const HOUR = 60 * 60 * 1000;
let server;
let desk;
let baseUrl;
let reachable = true;
let companyId;
const users = {};
let counter = 0;
const enquiryId = () => `web_${Date.now()}_${(counter += 1)}abcdef`;
let phoneCounter = 0;
const nextPhone = () => `98${String(10000000 + (phoneCounter += 1)).slice(-8)}`;

const listen = (handler) =>
  new Promise((resolve) => {
    const created = http.createServer(handler);
    created.listen(0, "127.0.0.1", () => resolve(created));
  });

/** A stand-in for the WhatsApp app's integration API: checks the signature, records, answers. */
const startDesk = async () => {
  const requests = [];
  const queued = [];
  const created = await listen((req, res) => {
    let body = "";
    req.on("data", (chunk) => (body += chunk));
    req.on("end", () => {
      const payload = JSON.parse(body || "{}");
      const valid = req.headers["x-oor-caller"] === "crm" && verifySignature(DESK_SECRET, req.headers["x-oor-timestamp"], body, req.headers["x-oor-signature"]);
      const path = req.url.replace("/integrations/v1", "");
      requests.push({ path, valid, body: payload });
      res.setHeader("content-type", "application/json");
      const next = queued.shift();
      if (next) {
        res.statusCode = next.status;
        return res.end(JSON.stringify(next.body));
      }
      if (path === "/messages") {
        res.statusCode = 201;
        return res.end(JSON.stringify({ data: { key: payload.key, status: payload.sendAt ? "scheduled" : "queued", reason: "" } }));
      }
      if (path === "/messages/cancel") return res.end(JSON.stringify({ cancelled: (payload.keys || []).length }));
      if (path === "/purposes") {
        return res.end(JSON.stringify({ data: [{ purpose: "enquiry_received", label: "Website enquiry received", manual: false, ready: true, problem: "" }, { purpose: "follow_up", label: "Follow-up", manual: true, ready: true, problem: "" }] }));
      }
      if (path === "/conversation") {
        return res.end(JSON.stringify({ data: { found: true, waId: payload.phone, chatId: "chat-123", windowOpen: true, consent: { given: true }, messages: [{ direction: "in", text: "Is it free?", at: new Date().toISOString() }] } }));
      }
      res.statusCode = 404;
      return res.end("{}");
    });
  });
  return {
    server: created,
    url: `http://127.0.0.1:${created.address().port}`,
    requests,
    to: (path) => requests.filter((row) => row.path === path),
    respondNext: (status, body) => queued.push({ status, body }),
  };
};

const signed = async (path, payload, { secret = DESK_SECRET, timestamp = String(Date.now()) } = {}) => {
  const body = JSON.stringify(payload);
  const response = await fetch(`${baseUrl}${path}`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-oor-timestamp": timestamp, "x-oor-signature": signBody(secret, timestamp, body) },
    body,
  });
  return { status: response.status, data: await response.json().catch(() => null) };
};

const asUser = async (userId, method, path, body) => {
  const token = jwt.sign({ id: String(userId) }, process.env.JWT_SECRET, { expiresIn: "5m" });
  const response = await fetch(`${baseUrl}${path}`, {
    method,
    headers: { authorization: `Bearer ${token}`, ...(body ? { "content-type": "application/json" } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  return { status: response.status, data: await response.json().catch(() => null) };
};

const waitFor = async (check, what) => {
  for (let i = 0; i < 100; i += 1) {
    if (await check()) return;
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
  assert.fail(`timed out waiting for ${what}`);
};

const makeUser = async (fields) => {
  const _id = new mongoose.Types.ObjectId();
  await User.collection.insertOne({ _id, password: "x", phone: "", isActive: true, companyId, parentId: null, createdAt: new Date(), lastAssignedAt: null, ...fields });
  return _id;
};

const makeLead = async (fields = {}) =>
  Lead.create({ name: "Asha Verma", phone: nextPhone(), companyId, status: "NEW", source: "WEBSITE", assignedTo: users.commercial, createdBy: null, projectInterested: "Skyline Tower", ...fields });

const activities = async (leadId) => (await LeadActivity.find({ lead: leadId }).sort({ _id: 1 }).lean()).map((row) => row.action);

test.before(async () => {
  try {
    await mongoose.connect(TEST_MONGO_URI, { serverSelectionTimeoutMS: 2000 });
  } catch (_error) {
    reachable = false;
    return;
  }
  await mongoose.connection.db.dropDatabase();
  await CustomerMessage.createIndexes();
  companyId = new mongoose.Types.ObjectId();
  await Company.collection.insertOne({ _id: companyId, name: "The Office on Rent", subdomain: "oor", status: "ACTIVE", createdAt: new Date() });
  process.env.WEBSITE_COMPANY_ID = String(companyId);
  process.env.WHATSAPP_COMPANY_ID = String(companyId);

  users.admin = await makeUser({ name: "Admin Person", email: "admin@oor.test", role: "ADMIN", roleType: "BOTH" });
  users.manager = await makeUser({ name: "Manager", email: "manager@oor.test", role: "MANAGER", roleType: "BOTH" });
  users.commercial = await makeUser({ name: "Rahul Exec", email: "rahul@oor.test", phone: "9811111111", role: "INSIDE_EXECUTIVE", roleType: "COMMERCIAL", parentId: users.manager });

  desk = await startDesk();
  process.env.WHATSAPP_DASHBOARD_URL = desk.url;
  server = await listen(app);
  baseUrl = `http://127.0.0.1:${server.address().port}`;
});

test.beforeEach(() => {
  if (desk) desk.requests.length = 0;
});

test.after(async () => {
  server?.close();
  desk?.server.close();
  customerMessages.stopWorker();
  if (reachable) {
    await mongoose.connection.db.dropDatabase();
    await mongoose.disconnect();
  }
});

test("18:00 IST the evening before a visit", () => {
  assert.equal(customerMessages.eveningBefore(new Date("2026-11-25T11:30:00+05:30")).toISOString(), "2026-11-24T12:30:00.000Z");
  assert.equal(customerMessages.eveningBefore(new Date("2026-12-01T00:30:00+05:30")).toISOString(), "2026-11-30T12:30:00.000Z", "just after midnight IST, still the previous IST day");
});

test("a website enquiry with the WhatsApp tick: consent recorded and an acknowledgement naming the executive, once a day", async (t) => {
  if (!reachable) return t.skip("no test database");
  const phone = nextPhone();
  const first = await signed("/api/integrations/website/leads", { enquiryId: enquiryId(), name: "Neha Sharma", phone, department: "COMMERCIAL", property: "Skyline Tower", page: "/buildings/skyline-tower", whatsappConsent: true }, { secret: WEBSITE_SECRET });
  assert.equal(first.status, 201);
  assert.equal(first.data.whatsappAck, "queued");
  const lead = await Lead.findById(first.data.leadId).lean();
  assert.equal(lead.whatsappConsent.given, true);
  assert.match(lead.whatsappConsent.source, /website form/);

  await waitFor(() => desk.to("/messages").length === 1, "the hand-off");
  const [sent] = desk.to("/messages");
  assert.equal(sent.valid, true, "signed with the shared secret, as the caller crm");
  assert.equal(sent.body.purpose, "enquiry_received");
  assert.equal(sent.body.to, `91${phone}`);
  assert.equal(sent.body.variables.name, "Neha Sharma");
  assert.equal(sent.body.variables.property, "Skyline Tower");
  assert.equal(sent.body.variables.executive, first.data.assignee.name);
  assert.equal(sent.body.consent.given, true);
  assert.deepEqual(sent.body.ref, { type: "lead", id: first.data.leadId });
  await waitFor(async () => (await CustomerMessage.findOne({ lead: lead._id }))?.handedOff, "the row handed off");

  const again = await signed("/api/integrations/website/leads", { enquiryId: enquiryId(), name: "Neha Sharma", phone, whatsappConsent: true }, { secret: WEBSITE_SECRET });
  assert.equal(again.data.whatsappAck, "already_sent_today");

  const noTick = await signed("/api/integrations/website/leads", { enquiryId: enquiryId(), name: "Ravi", phone: nextPhone(), department: "COMMERCIAL" }, { secret: WEBSITE_SECRET });
  assert.equal(noTick.data.whatsappAck, "");
  assert.equal((await Lead.findById(noTick.data.leadId).lean()).whatsappConsent.given, false);
  await new Promise((resolve) => setTimeout(resolve, 100));
  assert.equal(desk.to("/messages").length, 1, "no message without the tick, nor a second one the same day");
});

test("the WhatsApp app down: the message waits and is retried; refused for good: failed, on the lead's history", async (t) => {
  if (!reachable) return t.skip("no test database");
  const lead = await makeLead({ whatsappConsent: { given: true, at: new Date(), source: "test" } });
  desk.respondNext(503, { error: "UNAVAILABLE" });
  const row = await customerMessages.queueMessage({ lead, purpose: "follow_up", key: `test:${lead._id}:retry`, variables: { name: "Asha" }, waitForHandOff: true });
  assert.equal(row.handedOff, false);
  assert.match(row.lastError, /HTTP 503/);
  assert.ok(row.nextTryAt > new Date(), "tried again later");

  await CustomerMessage.updateOne({ _id: row._id }, { $set: { nextTryAt: new Date() } });
  await customerMessages.sweep();
  const retried = await CustomerMessage.findById(row._id);
  assert.equal(retried.handedOff, true);
  assert.equal(retried.status, "queued");

  desk.respondNext(400, { error: "BAD_INPUT", message: "purpose: invalid" });
  const refused = await customerMessages.queueMessage({ lead, purpose: "follow_up", key: `test:${lead._id}:bad`, waitForHandOff: true });
  assert.equal(refused.status, "failed");
  assert.ok((await activities(lead._id)).some((line) => /follow-up not sent: WhatsApp app: HTTP 400/.test(line)));
});

test("message status from the WhatsApp app: signed, forward only, sent and failures on the lead's history", async (t) => {
  if (!reachable) return t.skip("no test database");
  const lead = await makeLead({ whatsappConsent: { given: true, at: new Date(), source: "test" } });
  const key = `test:${lead._id}:status`;
  await customerMessages.queueMessage({ lead, purpose: "visit_confirmed", key, waitForHandOff: true });

  assert.equal((await signed("/api/integrations/whatsapp/message-status", { key, status: "sent" }, { secret: "someone-else-0123456789" })).status, 401);
  assert.equal((await signed("/api/integrations/whatsapp/message-status", { key, status: "sent" })).status, 200);
  assert.equal((await signed("/api/integrations/whatsapp/message-status", { key, status: "read" })).status, 200);
  assert.equal((await signed("/api/integrations/whatsapp/message-status", { key, status: "delivered" })).status, 200);
  assert.equal((await CustomerMessage.findOne({ key })).status, "read", "never moves back");
  const unknown = await signed("/api/integrations/whatsapp/message-status", { key: "nobody:1234", status: "sent" });
  assert.equal(unknown.data.found, false);

  const skippedKey = `test:${lead._id}:skipped`;
  await customerMessages.queueMessage({ lead, purpose: "visit_reminder", key: skippedKey, waitForHandOff: true });
  await signed("/api/integrations/whatsapp/message-status", { key: skippedKey, status: "skipped", reason: "The template is not approved by Meta." });
  const history = await activities(lead._id);
  assert.ok(history.includes("WhatsApp site visit confirmation sent"));
  assert.ok(history.includes("WhatsApp site visit reminder not sent: The template is not approved by Meta."));
});

test("chat events: the customer writing, the first reply as a verified WhatsApp touch, the chat closed", async (t) => {
  if (!reachable) return t.skip("no test database");
  const lead = await makeLead({ createdAt: new Date(Date.now() - 20 * 60 * 1000) });
  const phone = `91${lead.phone}`;

  assert.equal((await signed("/api/integrations/whatsapp/events", { type: "customer.message", phone: "919999999999", preview: "hi" })).data.ignored, "no_lead");
  assert.equal((await signed("/api/integrations/whatsapp/events", { type: "something", phone })).status, 400);

  await signed("/api/integrations/whatsapp/events", { type: "customer.message", phone, firstEver: true, preview: "Is the 3rd floor free?", at: new Date().toISOString() });
  const reply = await signed("/api/integrations/whatsapp/events", { type: "agent.reply", phone, by: { name: "Rahul Exec", email: "RAHUL@oor.test" }, responseMinutes: 7, preview: "Yes", at: new Date().toISOString() });
  assert.equal(reply.data.touch, true);
  const touched = await Lead.findById(lead._id).lean();
  assert.equal(touched.firstTouchChannel, "WHATSAPP");
  assert.equal(touched.firstTouchSource, "SYSTEM", "verified: it came from the WhatsApp app");
  assert.equal(String(touched.firstTouchBy), String(users.commercial));
  assert.equal(touched.touchCount, 1);

  const stranger = await signed("/api/integrations/whatsapp/events", { type: "agent.reply", phone, by: { name: "Temp Staff", email: "temp@elsewhere.test" }, responseMinutes: 90 });
  assert.equal(stranger.data.touch, false);
  await signed("/api/integrations/whatsapp/events", { type: "chat.closed", phone, by: { name: "Rahul Exec", email: "rahul@oor.test" } });

  const history = await activities(lead._id);
  assert.ok(history.includes('WhatsApp: the customer\'s first message - "Is the 3rd floor free?"'));
  assert.ok(history.some((line) => /Touch logged: whatsapp \(verified\) - replied on WhatsApp \(7 min after the customer wrote\)/.test(line)));
  assert.ok(history.some((line) => /WhatsApp reply by Temp Staff \(1 h 30 min after the customer wrote\) \(not a CRM user/.test(line)));
  assert.ok(history.includes("WhatsApp chat closed by Rahul Exec"));
});

test("site visit scheduled: confirmation now, reminders the evening before and 2 hours before; moved or ended, reminders stop", async (t) => {
  if (!reachable) return t.skip("no test database");
  const lead = await makeLead({ whatsappConsent: { given: true, at: new Date(), source: "test" } });
  const day = (days) => {
    const date = new Date(Date.now() + days * 24 * HOUR);
    return date.toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });
  };
  const visit = `${day(2)}T11:30:00+05:30`;

  const scheduled = await asUser(users.admin, "PATCH", `/api/leads/${lead._id}/status`, { status: "SITE_VISIT_SCHEDULED", nextFollowUp: visit });
  assert.equal(scheduled.status, 200, JSON.stringify(scheduled.data));
  await waitFor(() => desk.to("/messages").length === 3, "three messages");
  const sent = desk.to("/messages");
  const visitMs = new Date(visit).getTime();
  const byKey = Object.fromEntries(sent.map((row) => [row.body.key.split(":").pop(), row.body]));
  assert.equal(byKey.confirm.purpose, "visit_confirmed");
  assert.equal(byKey.confirm.sendAt, undefined, "the confirmation goes now");
  assert.equal(byKey.eve.purpose, "visit_reminder");
  assert.equal(byKey.eve.sendAt, customerMessages.eveningBefore(new Date(visit)).toISOString());
  assert.equal(new Date(byKey["2h"].sendAt).getTime(), visitMs - 2 * HOUR);
  assert.equal(byKey.confirm.variables.time, "11:30 AM");
  assert.equal(byKey.confirm.variables.executive, "Rahul Exec");
  assert.equal(byKey.confirm.variables.executive_phone, "9811111111");
  assert.equal(byKey.confirm.variables.property, "Skyline Tower");
  assert.match(byKey.confirm.key, new RegExp(`^visit:${lead._id}:${visitMs}:confirm$`));

  // The same time saved again: nothing new.
  desk.requests.length = 0;
  await asUser(users.admin, "PATCH", `/api/leads/${lead._id}/status`, { status: "SITE_VISIT_SCHEDULED", nextFollowUp: visit });
  await new Promise((resolve) => setTimeout(resolve, 100));
  assert.equal(desk.to("/messages").length, 0);

  // Moved a day later: the two reminders not sent yet stop, three new messages.
  await waitFor(async () => (await CustomerMessage.countDocuments({ lead: lead._id, handedOff: true })) === 3, "hand-offs");
  const moved = `${day(3)}T16:00:00+05:30`;
  assert.equal((await asUser(users.admin, "PATCH", `/api/leads/${lead._id}/status`, { status: "SITE_VISIT_SCHEDULED", nextFollowUp: moved })).status, 200);
  await waitFor(() => desk.to("/messages/cancel").length === 1 && desk.to("/messages").length === 3, "cancel and new messages");
  assert.deepEqual(desk.to("/messages/cancel")[0].body.keys.sort(), [`visit:${lead._id}:${visitMs}:2h`, `visit:${lead._id}:${visitMs}:eve`]);
  assert.equal((await CustomerMessage.findOne({ key: `visit:${lead._id}:${visitMs}:eve` })).status, "cancelled");
  assert.equal((await CustomerMessage.findOne({ key: `visit:${lead._id}:${visitMs}:confirm` })).status, "queued", "the sent confirmation stays");

  // No longer a site visit: the new reminders stop too.
  desk.requests.length = 0;
  await waitFor(async () => (await CustomerMessage.countDocuments({ lead: lead._id, handedOff: true })) === 6, "hand-offs");
  assert.equal((await asUser(users.admin, "PATCH", `/api/leads/${lead._id}/status`, { status: "CONTACTED" })).status, 200);
  await waitFor(() => desk.to("/messages/cancel").length === 1, "cancel");
  assert.equal(desk.to("/messages/cancel")[0].body.keys.length, 2);
  assert.ok((await activities(lead._id)).includes("WhatsApp visit reminders cancelled (visit no longer scheduled)"));
});

test("site visit for a customer who has not agreed: nothing sent, and the lead's history says why", async (t) => {
  if (!reachable) return t.skip("no test database");
  const lead = await makeLead();
  const visit = new Date(Date.now() + 2 * 24 * HOUR).toISOString();
  assert.equal((await asUser(users.admin, "PATCH", `/api/leads/${lead._id}/status`, { status: "SITE_VISIT_SCHEDULED", nextFollowUp: visit })).status, 200);
  await new Promise((resolve) => setTimeout(resolve, 100));
  assert.equal(desk.to("/messages").length, 0);
  assert.ok((await activities(lead._id)).some((line) => /visit confirmation not sent: the customer has not agreed/.test(line)));
});

test("the lead page's WhatsApp panel: the chat, a follow-up sent by hand (a WhatsApp touch), the customer's agreement", async (t) => {
  if (!reachable) return t.skip("no test database");
  const lead = await makeLead();
  const panel = await asUser(users.admin, "GET", `/api/leads/${lead._id}/whatsapp`);
  assert.equal(panel.status, 200);
  assert.equal(panel.data.configured, true);
  assert.equal(panel.data.chat.chatId, "chat-123");
  assert.equal(panel.data.chatUrl, `${desk.url}/#inbox/chat-123`);
  assert.deepEqual(panel.data.purposes.map((row) => row.purpose), ["follow_up"], "only what a person may send by hand");
  assert.equal(panel.data.consent.given, false);

  assert.equal((await asUser(users.admin, "POST", `/api/leads/${lead._id}/whatsapp/send`, { purpose: "follow_up" })).status, 409, "not without the customer's agreement");
  assert.equal((await asUser(users.admin, "POST", `/api/leads/${lead._id}/whatsapp/send`, { purpose: "visit_confirmed" })).status, 400);
  assert.equal((await asUser(users.admin, "POST", `/api/leads/${lead._id}/whatsapp/consent`, { given: "yes" })).status, 400);
  const agreed = await asUser(users.admin, "POST", `/api/leads/${lead._id}/whatsapp/consent`, { given: true });
  assert.equal(agreed.data.consent.given, true);
  assert.equal(agreed.data.consent.source, "told Admin Person");

  const sent = await asUser(users.admin, "POST", `/api/leads/${lead._id}/whatsapp/send`, { purpose: "follow_up" });
  assert.equal(sent.status, 202, JSON.stringify(sent.data));
  const [request] = desk.to("/messages");
  assert.equal(request.body.purpose, "follow_up");
  assert.equal(request.body.variables.executive, "Admin Person");
  assert.equal(request.body.consent.given, true);
  const touched = await Lead.findById(lead._id).lean();
  assert.equal(touched.firstTouchSource, "CRM_ACTION");
  assert.equal(touched.firstTouchChannel, "WHATSAPP");

  const after = await asUser(users.admin, "GET", `/api/leads/${lead._id}/whatsapp`);
  assert.equal(after.data.requested.length, 1);
  assert.equal(after.data.requested[0].label, "follow-up");

  const other = await makeUser({ name: "Other Exec", email: "other@oor.test", role: "INSIDE_EXECUTIVE", roleType: "RESIDENTIAL", parentId: users.manager });
  assert.equal((await asUser(other, "GET", `/api/leads/${lead._id}/whatsapp`)).status, 404, "not someone else's lead");
});
