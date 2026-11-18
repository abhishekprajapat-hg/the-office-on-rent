const test = require("node:test");
const assert = require("node:assert/strict");
const http = require("node:http");
const mongoose = require("mongoose");

// Lead types for Meta form leads, and the team rebalance, against a real MongoDB (a throwaway
// database). Set TEST_MONGO_URI to point elsewhere; without a reachable database those tests are skipped.
const TEST_MONGO_URI = process.env.TEST_MONGO_URI || "mongodb://127.0.0.1:27027/crm_distribution_test?replicaSet=rs0";
const SECRET = "test-shared-secret-0123456789-abcdef";
process.env.WHATSAPP_DASHBOARD_SECRET = SECRET;

const Lead = require("../src/models/Lead");
const User = require("../src/models/User");
const LeadActivity = require("../src/models/leadActivity.model");
const { typeFromText, parseFormTypes, detectMetaLeadType } = require("../src/services/leadType.service");
const { redistributePipelineLeads } = require("../src/services/leadAssignment.service");
const { verifySignature } = require("../src/services/whatsappDashboard.service");

test("lead type from words: one way only, and the company's own name does not count", () => {
  assert.equal(typeFromText("2 BHK flat in Vijay Nagar"), "RESIDENTIAL");
  assert.equal(typeFromText("Office space for 20 seats"), "COMMERCIAL");
  assert.equal(typeFromText("The Office on Rent - Villas Nov"), "RESIDENTIAL", "'Office on Rent' is the brand, not a signal");
  assert.equal(typeFromText("theofficeonrent_leads_form"), "");
  assert.equal(typeFromText("shop or flat, anything"), "", "mixed words decide nothing");
  assert.equal(typeFromText(""), "");
});

test("Meta lead type: form setting, then the type question, then all answers, then ad names, then the default", () => {
  const formTypes = parseFormTypes("111:RESIDENTIAL, 222:commercial ; bad:XYZ", { 333: "RESIDENTIAL" });
  assert.equal(formTypes.get("222"), "COMMERCIAL");
  assert.equal(formTypes.get("333"), "RESIDENTIAL");
  assert.equal(formTypes.has("bad"), false);

  assert.deepEqual(detectMetaLeadType({ formId: "111", fieldRows: [{ name: "requirement", values: ["office"] }], formTypes, defaultType: "" }), { type: "RESIDENTIAL", from: "form setting" });
  assert.equal(detectMetaLeadType({ formId: "9", fieldRows: [{ name: "what_are_you_looking_for?", values: ["Commercial space"] }], defaultType: "" }).type, "COMMERCIAL");
  assert.equal(detectMetaLeadType({ formId: "9", fieldRows: [{ name: "full_name", values: ["Asha"] }, { name: "budget", values: ["3 BHK under 80L"] }], defaultType: "" }).type, "RESIDENTIAL");
  const fromAd = detectMetaLeadType({ formId: "9", fieldRows: [{ name: "full_name", values: ["Asha"] }], names: { ad: "Nov creative 2", adset: "Indore 25-45", campaign: "Coworking seats - Indore" }, defaultType: "" });
  assert.equal(fromAd.type, "COMMERCIAL");
  assert.match(fromAd.from, /campaign name/);
  assert.deepEqual(detectMetaLeadType({ formId: "9", fieldRows: [], defaultType: "" }), { type: "", from: "" });
  assert.equal(detectMetaLeadType({ formId: "9", fieldRows: [], defaultType: "residential" }).type, "RESIDENTIAL");
});

// ---------------------------------------------------------------------------------------------
let reachable = true;
let companyId;
const people = {};

const makeUser = async (fields) => {
  const _id = new mongoose.Types.ObjectId();
  await User.collection.insertOne({ _id, password: "x", phone: "", isActive: true, companyId, parentId: people.manager || null, createdAt: new Date(), lastAssignedAt: null, ...fields });
  return _id;
};

let phoneCounter = 0;
const makeLead = async ({ owner = null, status = "NEW", type = "COMMERCIAL", minutesAgo = 0, whatsapp = null, name = "" }) => {
  phoneCounter += 1;
  const _id = new mongoose.Types.ObjectId();
  await Lead.collection.insertOne({
    _id,
    name: name || `Lead ${phoneCounter}`,
    phone: `98000${String(phoneCounter).padStart(5, "0")}`,
    companyId,
    source: whatsapp ? "WHATSAPP" : "META",
    status,
    assignedTo: owner,
    requirements: { inventoryType: type },
    ...(whatsapp ? { whatsapp } : {}),
    assignmentHistory: [],
    createdAt: new Date(Date.now() - minutesAgo * 60_000),
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
  people.manager = await makeUser({ name: "Manager", email: "manager@oor.test", role: "MANAGER", roleType: "BOTH", parentId: null });
  people.c1 = await makeUser({ name: "Commercial One", email: "c1@oor.test", role: "INSIDE_EXECUTIVE", roleType: "COMMERCIAL" });
  people.c2 = await makeUser({ name: "Commercial Two", email: "c2@oor.test", role: "INSIDE_EXECUTIVE", roleType: "COMMERCIAL" });
  people.r1 = await makeUser({ name: "Residential One", email: "r1@oor.test", role: "INSIDE_EXECUTIVE", roleType: "RESIDENTIAL" });
  people.leaver = await makeUser({ name: "Leaver", email: "left@oor.test", role: "INSIDE_EXECUTIVE", roleType: "COMMERCIAL", isActive: false });
});

test.after(async () => {
  if (reachable) {
    await mongoose.connection.db.dropDatabase();
    await mongoose.disconnect();
  }
});

test("rebalance: keeps worked leads, hands out leads of leavers and unassigned ones by type, evens out untouched leads", async (t) => {
  if (!reachable) return t.skip("no test database");
  const received = [];
  const dashboard = await new Promise((resolve) => {
    const created = http.createServer((req, res) => {
      let body = "";
      req.on("data", (chunk) => (body += chunk));
      req.on("end", () => {
        received.push({ body: JSON.parse(body), valid: verifySignature(SECRET, req.headers["x-oor-timestamp"], body, req.headers["x-oor-signature"]) });
        res.writeHead(200, { "content-type": "application/json" });
        res.end("{}");
      });
    });
    created.listen(0, "127.0.0.1", () => resolve(created));
  });
  process.env.WHATSAPP_DASHBOARD_URL = `http://127.0.0.1:${dashboard.address().port}`;

  try {
    // Commercial One: 3 untouched (oldest to newest), 2 in conversation, 1 visit booked, and a
    // residential lead that is not theirs to handle.
    const c1New = [];
    for (const minutesAgo of [300, 200, 100]) c1New.push(await makeLead({ owner: people.c1, minutesAgo }));
    const c1Worked = [
      await makeLead({ owner: people.c1, status: "CONTACTED" }),
      await makeLead({ owner: people.c1, status: "CONTACTED" }),
      await makeLead({ owner: people.c1, status: "SITE_VISIT_SCHEDULED" }),
    ];
    const wrongType = await makeLead({ owner: people.c1, type: "RESIDENTIAL" });
    await makeLead({ owner: people.r1, type: "RESIDENTIAL" });
    // The leaver's two, one of them a WhatsApp chat.
    const leaverChat = await makeLead({ owner: people.leaver, status: "CONTACTED", whatsapp: { chatId: "c1", linkedAt: new Date() } });
    await makeLead({ owner: people.leaver, status: "CONTACTED" });
    // Nobody's: a residential one, and one with no type (treated as commercial).
    const orphanResidential = await makeLead({ type: "RESIDENTIAL" });
    const untyped = await makeLead({ type: "" });
    // Closed leads never move.
    const closed = await makeLead({ owner: people.leaver, status: "CLOSED" });

    const result = await redistributePipelineLeads({ companyId, includeUnassigned: true, performedBy: people.manager });

    const ownerOf = async (id) => String((await Lead.findById(id)).assignedTo);
    for (const id of c1Worked) assert.equal(await ownerOf(id), String(people.c1), "leads being worked stay");
    assert.equal(await ownerOf(wrongType), String(people.r1), "a residential lead goes to the residential executive");
    assert.equal(await ownerOf(orphanResidential), String(people.r1));
    assert.equal(await ownerOf(untyped), String(people.c2));
    assert.equal(await ownerOf(leaverChat), String(people.c2), "the leaver's leads go to the least loaded commercial executive");
    assert.equal(await ownerOf(closed), String(people.leaver), "closed leads are history and stay");

    // Commercial One kept 5 (6 own commercial - the newest untouched one), Commercial Two 4.
    assert.equal(await ownerOf(c1New[2]), String(people.c2), "the newest untouched lead moved across");
    assert.equal(await ownerOf(c1New[0]), String(people.c1));
    const open = { status: { $nin: ["CLOSED", "LOST"] } };
    assert.equal(await Lead.countDocuments({ ...open, assignedTo: people.c1 }), 5);
    assert.equal(await Lead.countDocuments({ ...open, assignedTo: people.c2 }), 4);
    assert.equal(await Lead.countDocuments({ ...open, assignedTo: people.r1 }), 3);
    assert.equal(await Lead.countDocuments({ assignedTo: { $in: [people.c1, people.c2] }, "requirements.inventoryType": "RESIDENTIAL" }), 0);
    assert.equal(result.moved, 6);
    assert.equal(result.unassignable, 0);

    const moved = await Lead.findById(c1New[2]);
    assert.equal(moved.assignmentHistory.at(-1).action, "REBALANCED");
    assert.equal(String(moved.assignmentHistory.at(-1).fromUser), String(people.c1));
    assert.equal(String(moved.assignmentHistory.at(-1).createdBy), String(people.manager));
    assert.equal(String(moved.assignedManager), String(people.manager));
    assert.equal((await Lead.findById(untyped)).assignmentHistory.at(-1).action, "AUTO_ASSIGNED");
    assert.equal(await LeadActivity.countDocuments({ action: /team rebalance/ }), 6);

    // The WhatsApp chat follows its lead (sent in the background).
    for (let wait = 0; wait < 40 && !received.length; wait += 1) await new Promise((resolve) => setTimeout(resolve, 50));
    assert.equal(received.length, 1);
    assert.equal(received[0].valid, true);
    assert.equal(received[0].body.leadId, String(leaverChat));
    assert.deepEqual(received[0].body.assignee, { email: "c2@oor.test", name: "Commercial Two" });

    // Pressing it again changes nothing.
    const again = await redistributePipelineLeads({ companyId, includeUnassigned: true, performedBy: people.manager });
    assert.equal(again.moved, 0);
  } finally {
    delete process.env.WHATSAPP_DASHBOARD_URL;
    dashboard.close();
  }
});

test("a Meta form lead gets its type on arrival and goes to an executive of that type", async (t) => {
  if (!reachable) return t.skip("no test database");
  const axios = require("axios");
  const Company = require("../src/models/Company");
  const webhook = require("../src/controllers/webhook.controller");
  await Company.collection.insertOne({ _id: companyId, name: "The Office on Rent", subdomain: "oor", status: "ACTIVE", metadata: { metaPageIds: ["page-1"], metaAccessToken: "token", metaFormInventoryTypes: { "form-resi": "RESIDENTIAL" } }, createdAt: new Date() });

  const replies = {
    "lead-a": { id: "lead-a", form_id: "form-x", ad_name: "Creative 3", adset_name: "Indore", campaign_name: "The Office on Rent | 2BHK flats Nov", field_data: [{ name: "full_name", values: ["Asha"] }, { name: "phone_number", values: ["+919811111111"] }] },
    "lead-b": { id: "lead-b", form_id: "form-x", campaign_name: "Leads Nov", field_data: [{ name: "full_name", values: ["Ravi"] }, { name: "phone_number", values: ["+919822222222"] }, { name: "what_type_of_property_are_you_looking_for?", values: ["Office / coworking"] }] },
    "lead-c": { id: "lead-c", form_id: "form-resi", campaign_name: "Office space Nov", field_data: [{ name: "full_name", values: ["Meena"] }, { name: "phone_number", values: ["+919833333333"] }] },
  };
  const originalGet = axios.get;
  axios.get = async (url) => {
    const id = url.split("/").pop();
    if (!replies[id]) throw Object.assign(new Error("not found"), { response: { status: 400, data: { error: { code: 100 } } } });
    return { data: replies[id] };
  };
  try {
    const body = { object: "page", entry: [{ id: "page-1", changes: ["lead-a", "lead-b", "lead-c"].map((leadgen_id) => ({ field: "leadgen", value: { leadgen_id, form_id: replies[leadgen_id].form_id } })) }] };
    const res = { statusCode: 0, payload: null, status(code) { this.statusCode = code; return this; }, json(payload) { this.payload = payload; return this; }, sendStatus(code) { this.statusCode = code; return this; } };
    await webhook.handleWebhook({ body, tenant: null }, res);
    assert.equal(res.statusCode, 200, JSON.stringify(res.payload));
    assert.equal(res.payload.created, 3);

    const leadA = await Lead.findOne({ metaLeadId: "lead-a" });
    assert.equal(leadA.requirements.inventoryType, "RESIDENTIAL", "from the campaign name, ignoring the brand's 'Office'");
    assert.equal(String(leadA.assignedTo), String(people.r1));
    const leadB = await Lead.findOne({ metaLeadId: "lead-b" });
    assert.equal(leadB.requirements.inventoryType, "COMMERCIAL", "from the form's own question");
    assert.ok([String(people.c1), String(people.c2)].includes(String(leadB.assignedTo)));
    const leadC = await Lead.findOne({ metaLeadId: "lead-c" });
    assert.equal(leadC.requirements.inventoryType, "RESIDENTIAL", "the owner's form setting wins over the campaign name");
    assert.equal(String(leadC.assignedTo), String(people.r1));
    assert.ok(await LeadActivity.exists({ lead: leadA._id, action: /Lead type residential \(from campaign name/ }));
  } finally {
    axios.get = originalGet;
  }
});

test("coworking: a form set to COWORKING is typed so (never guessed from words); a rebalance moves NPC leads, not follow-ups", async (t) => {
  assert.equal(detectMetaLeadType({ formId: "444", fieldRows: [], formTypes: parseFormTypes("444:COWORKING"), defaultType: "" }).type, "COWORKING");
  assert.equal(typeFromText("coworking seats"), "COMMERCIAL", "words alone never say coworking");
  if (!reachable) return t.skip("no test database");
  people.cw1 = await makeUser({ name: "Coworking One", email: "cw1@oor.test", role: "INSIDE_EXECUTIVE", roleType: "COWORKING" });
  people.cw2 = await makeUser({ name: "Coworking Two", email: "cw2@oor.test", role: "INSIDE_EXECUTIVE", roleType: "COWORKING" });
  const notAnswering = [await makeLead({ owner: people.cw1, type: "COWORKING", status: "NPC_2", minutesAgo: 50 }), await makeLead({ owner: people.cw1, type: "COWORKING", status: "NPC_1", minutesAgo: 40 })];
  const followUps = [await makeLead({ owner: people.cw1, type: "COWORKING", status: "FOLLOW_UP_1" }), await makeLead({ owner: people.cw1, type: "COWORKING", status: "FOLLOW_UP_2" })];
  await redistributePipelineLeads({ companyId, includeUnassigned: true, performedBy: people.manager });
  const ownerOf = async (id) => String((await Lead.findById(id)).assignedTo);
  for (const id of notAnswering) assert.equal(await ownerOf(id), String(people.cw2), "leads not answering move to even out");
  for (const id of followUps) assert.equal(await ownerOf(id), String(people.cw1), "follow-ups stay with whoever is following up");
  assert.equal(await Lead.countDocuments({ assignedTo: { $in: [people.c1, people.c2, people.r1] }, "requirements.inventoryType": "COWORKING" }), 0, "coworking leads stay with the coworking team");
});
