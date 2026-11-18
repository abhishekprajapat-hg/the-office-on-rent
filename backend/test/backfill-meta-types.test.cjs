const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const { execFileSync } = require("node:child_process");
const mongoose = require("mongoose");

// The one-off script that types older Meta leads (src/scripts/backfillMetaLeadTypes.cjs), run as the
// owner would run it, against a throwaway database. Skipped without a reachable MongoDB.
const TEST_MONGO_URI = process.env.TEST_MONGO_URI_BACKFILL || "mongodb://127.0.0.1:27027/crm_backfill_test?replicaSet=rs0";
const SCRIPT = path.join(__dirname, "..", "src", "scripts", "backfillMetaLeadTypes.cjs");

const Lead = require("../src/models/Lead");
const User = require("../src/models/User");
const LeadActivity = require("../src/models/leadActivity.model");

let reachable = true;
const companyId = new mongoose.Types.ObjectId();
const ids = {};

const runScript = (...args) =>
  execFileSync(process.execPath, [SCRIPT, ...args], {
    env: { ...process.env, MONGO_URI: TEST_MONGO_URI, META_FORM_INVENTORY_TYPES: "777:RESIDENTIAL", META_DEFAULT_INVENTORY_TYPE: "" },
    encoding: "utf8",
  });

const makeUser = async (name, roleType) => {
  const _id = new mongoose.Types.ObjectId();
  await User.collection.insertOne({ _id, name, email: `${name.replace(/\s/g, "").toLowerCase()}@oor.test`, password: "x", phone: "", role: "INSIDE_EXECUTIVE", roleType, isActive: true, companyId, parentId: null, createdAt: new Date(), lastAssignedAt: null });
  return _id;
};

let counter = 0;
const makeLead = async ({ projectInterested, owner = null, status = "NEW", source = "META", metaFormId = "" }) => {
  counter += 1;
  const _id = new mongoose.Types.ObjectId();
  await Lead.collection.insertOne({ _id, name: `Lead ${counter}`, phone: `98100${String(counter).padStart(5, "0")}`, companyId, source, status, assignedTo: owner, projectInterested, metaFormId, requirements: { inventoryType: "" }, assignmentHistory: [], createdAt: new Date() });
  return _id;
};

const typeOf = async (id) => (await Lead.findById(id).lean()).requirements?.inventoryType || "";
const ownerOf = async (id) => String((await Lead.findById(id).lean()).assignedTo || "");

test.before(async () => {
  try {
    await mongoose.connect(TEST_MONGO_URI, { serverSelectionTimeoutMS: 2000 });
  } catch (_error) {
    reachable = false;
    return;
  }
  await mongoose.connection.db.dropDatabase();
  ids.c1 = await makeUser("Commercial One", "COMMERCIAL");
  ids.r1 = await makeUser("Residential One", "RESIDENTIAL");
  ids.flatUnassigned = await makeLead({ projectInterested: "2 BHK flat Vijay Nagar" });
  ids.officeWithC1 = await makeLead({ projectInterested: "Office space 20 seats", owner: ids.c1 });
  ids.villaWithC1 = await makeLead({ projectInterested: "Villas in Indore", owner: ids.c1 });
  ids.workedFlatWithC1 = await makeLead({ projectInterested: "3 BHK apartment", owner: ids.c1, status: "FOLLOW_UP_1" });
  ids.noWords = await makeLead({ projectInterested: "META_INTAKE" });
  ids.formSetting = await makeLead({ projectInterested: "Nov leads", metaFormId: "777" });
  ids.manual = await makeLead({ projectInterested: "2 BHK flat", source: "MANUAL" });
});

test.after(async () => {
  if (reachable) {
    await mongoose.connection.db.dropDatabase();
    await mongoose.disconnect();
  }
});

test("backfill: a dry run changes nothing; --apply types leads that fit their owner; --reassign moves untouched mismatched ones", async (t) => {
  if (!reachable) return t.skip("no test database");

  const dry = runScript();
  assert.match(dry, /DRY RUN/);
  assert.match(dry, /Untyped Meta leads: 6/);
  assert.match(dry, /owner does not handle the type: 2/);
  for (const id of Object.values(ids).filter((value) => value !== ids.c1 && value !== ids.r1)) assert.equal(await typeOf(id), "");

  const applied = runScript("--apply");
  assert.match(applied, /APPLIED/);
  assert.equal(await typeOf(ids.flatUnassigned), "RESIDENTIAL");
  assert.equal(await typeOf(ids.officeWithC1), "COMMERCIAL");
  assert.equal(await typeOf(ids.formSetting), "RESIDENTIAL", "the form setting wins");
  assert.equal(await typeOf(ids.noWords), "", "nothing says: left alone");
  assert.equal(await typeOf(ids.manual), "", "only Meta leads");
  // A residential lead with a commercial executive keeps its owner and stays untyped without --reassign.
  assert.equal(await typeOf(ids.villaWithC1), "");
  assert.equal(await ownerOf(ids.villaWithC1), String(ids.c1));
  assert.ok(await LeadActivity.exists({ lead: ids.flatUnassigned, action: /set for an older lead/ }));

  const moved = runScript("--apply", "--reassign");
  assert.match(moved, /moved: 1; kept, already being worked: 1; kept, nobody of that type free: 0/);
  assert.equal(await typeOf(ids.villaWithC1), "RESIDENTIAL");
  assert.equal(await ownerOf(ids.villaWithC1), String(ids.r1));
  assert.equal(await typeOf(ids.workedFlatWithC1), "", "a lead in follow-up stays with its owner");
  assert.equal(await ownerOf(ids.workedFlatWithC1), String(ids.c1));

  // Run again: nothing left that fits, so nothing changes.
  const again = runScript("--apply", "--reassign");
  assert.match(again, /Untyped Meta leads: 2/);
});
