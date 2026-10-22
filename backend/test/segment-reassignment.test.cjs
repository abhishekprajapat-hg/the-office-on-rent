// Role / segment reassignment and handover (requirements 16 Oct 2026, section 10).
const test = require("node:test");
const assert = require("node:assert/strict");
const mongoose = require("mongoose");
const handover = require("../src/services/handover.service");
const User = require("../src/models/User");
const Lead = require("../src/models/Lead");
const Task = require("../src/models/Task");
const Contact = require("../src/models/CrmContact");
const Inventory = require("../src/models/Inventory");

const id = () => new mongoose.Types.ObjectId();

test("users keep an effective-dated role history", () => {
  const h = User.schema.path("roleHistory");
  assert.ok(h);
  const paths = h.schema.paths;
  for (const f of ["role", "roleType", "previousRole", "previousRoleType", "effectiveFrom", "changedBy", "note"]) assert.ok(paths[f], f);
});

test("handover refuses self, nobody, inactive or channel-partner recipients", async () => {
  const companyId = id(); const a = id();
  await assert.rejects(handover.transferRecords({ companyId, fromId: a, toId: a, actor: { _id: id() } }), /someone else/);
  await assert.rejects(handover.transferRecords({ companyId, fromId: a, toId: id(), include: [], actor: { _id: id() } }), /Choose what/);
  const orig = User.findOne;
  User.findOne = (q) => ({ select: () => ({ lean: async () => (String(q._id) === String(a) ? { _id: a, name: "A", role: "EXECUTIVE" } : { _id: q._id, name: "CP", role: "CHANNEL_PARTNER" }) }) });
  try {
    await assert.rejects(handover.transferRecords({ companyId, fromId: a, toId: id(), actor: { _id: id() } }), /Channel Partner/);
  } finally { User.findOne = orig; }
});

test("handover moves open leads (with history), tasks, broker owners and inventory to the named person", async () => {
  const companyId = id(); const from = id(); const to = id(); const actor = { _id: id() };
  const calls = { leadUpdates: [], task: null, contact: null, inv: null };
  const orig = { uf: User.findOne, lf: Lead.find, lu: Lead.updateOne, tu: Task.updateMany, cu: Contact.updateMany, iu: Inventory.updateMany };
  User.findOne = (q) => ({ select: () => ({ lean: async () => (String(q._id) === String(from) ? { _id: from, name: "Divya", role: "EXECUTIVE" } : { _id: to, name: "Priya", role: "FIELD_EXECUTIVE" }) }) });
  Lead.find = (q) => {
    assert.deepEqual(q.status.$nin, handover.CLOSED_LEAD_STATUSES, "closed leads stay where they are");
    return { select: () => ({ lean: async () => [{ _id: id(), status: "FOLLOW_UP_1" }, { _id: id(), status: "NEW" }] }) };
  };
  Lead.updateOne = async (q, u) => { calls.leadUpdates.push(u); return { modifiedCount: 1 }; };
  Task.updateMany = async (q, u) => { calls.task = { q, u }; return { modifiedCount: 3 }; };
  Contact.updateMany = async (q, u) => { calls.contact = { q, u }; return { modifiedCount: 1 }; };
  Inventory.updateMany = async (q, u) => { calls.inv = { q, u }; return { modifiedCount: 4 }; };
  try {
    const out = await handover.transferRecords({ companyId, fromId: from, toId: to, note: "Moved to Residential", actor });
    assert.deepEqual(out.moved, { leads: 2, tasks: 3, brokers: 1, inventory: 4 });
    const first = calls.leadUpdates[0];
    assert.equal(String(first.$set.assignedTo), String(to));
    assert.equal(String(first.$set.assignedFieldExecutive), String(to), "lead lands in the field-executive slot");
    assert.equal(first.$push.assignmentHistory.action, "HANDOVER");
    assert.equal(first.$push.assignmentHistory.reason, "Moved to Residential");
    assert.equal(String(first.$push.assignmentHistory.fromUser), String(from));
    assert.equal(calls.task.q.status.$ne, "COMPLETED");
    assert.equal(calls.task.u.$push.activity.action, "REASSIGNED");
    assert.equal(String(calls.contact.u.$set.relationshipOwnerId), String(to));
    assert.equal(String(calls.inv.u.$set.teamId), String(to));
  } finally {
    User.findOne = orig.uf; Lead.find = orig.lf; Lead.updateOne = orig.lu; Task.updateMany = orig.tu; Contact.updateMany = orig.cu; Inventory.updateMany = orig.iu;
  }
});

test("only what was ticked is moved", async () => {
  const companyId = id(); const from = id(); const to = id();
  const orig = { uf: User.findOne, tu: Task.updateMany, lf: Lead.find };
  let leadTouched = false;
  User.findOne = (q) => ({ select: () => ({ lean: async () => ({ _id: q._id, name: "X", role: "EXECUTIVE" }) }) });
  Lead.find = () => { leadTouched = true; return { select: () => ({ lean: async () => [] }) }; };
  Task.updateMany = async () => ({ modifiedCount: 1 });
  try {
    const out = await handover.transferRecords({ companyId, fromId: from, toId: to, include: ["tasks"], actor: { _id: id() } });
    assert.equal(out.moved.tasks, 1);
    assert.equal(leadTouched, false);
  } finally { User.findOne = orig.uf; Task.updateMany = orig.tu; Lead.find = orig.lf; }
});
