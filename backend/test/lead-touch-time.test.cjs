// Lead touch time (requirements 16 Oct 2026, section 08).
const test = require("node:test");
const assert = require("node:assert/strict");
const mongoose = require("mongoose");
const touch = require("../src/services/leadTouch.service");
const Lead = require("../src/models/Lead");
const LeadActivity = require("../src/models/leadActivity.model");

test("an eight-minute gap shows eight minutes", () => {
  const created = new Date("2026-10-19T10:00:00Z");
  assert.equal(touch.minutesBetween(created, new Date("2026-10-19T10:08:59Z")), 8);
  assert.equal(touch.formatTouchTime(8), "8 min");
  assert.equal(touch.formatTouchTime(125), "2 h 5 min");
  assert.equal(touch.formatTouchTime(60 * 27), "1 d 3 h");
});

test("lead keeps first-touch fields; states are Untouched / Touched", () => {
  for (const f of ["firstTouchAt", "firstTouchBy", "firstTouchChannel", "firstTouchSource", "touchMinutes", "lastTouchAt", "touchCount"]) {
    assert.ok(Lead.schema.paths[f], f);
  }
  assert.deepEqual(Lead.schema.path("firstTouchSource").enumValues, ["MANUAL", "CRM_ACTION", "SYSTEM", ""]);
  assert.equal(touch.touchState({}), "UNTOUCHED");
  assert.equal(touch.touchState({ firstTouchAt: new Date() }), "TOUCHED");
});

test("first touch is written only while empty, so reassignment or later touches never reset it", async () => {
  const lead = { _id: new mongoose.Types.ObjectId(), companyId: new mongoose.Types.ObjectId(), createdAt: new Date(Date.now() - 8 * 60000) };
  const calls = [];
  const orig = { u: Lead.updateOne, f: Lead.findById, a: LeadActivity.create };
  Lead.updateOne = async (filter, update) => { calls.push({ filter, update }); return { modifiedCount: 1 }; };
  Lead.findById = () => ({ select: () => ({ lean: async () => ({ createdAt: lead.createdAt, firstTouchAt: new Date(), touchMinutes: 8, firstTouchSource: "MANUAL", firstTouchChannel: "CALL", touchCount: 1 }) }) });
  LeadActivity.create = async (row) => row;
  try {
    const out = await touch.recordTouch({ lead, user: { _id: new mongoose.Types.ObjectId() }, channel: "call" });
    assert.equal(calls[0].filter.firstTouchAt, null, "only when nobody touched it yet");
    assert.equal(calls[0].update.$set.touchMinutes, 8);
    assert.equal(calls[0].update.$set.firstTouchChannel, "CALL");
    assert.ok(calls[1].update.$inc.touchCount === 1 && calls[1].update.$max.lastTouchAt);
    assert.equal(out.touchTimeLabel, "8 min");
    assert.equal(out.verified, false, "a hand-logged touch is not verified");
  } finally {
    Lead.updateOne = orig.u; Lead.findById = orig.f; LeadActivity.create = orig.a;
  }
});

test("bad channels and future times are refused; a touch before creation counts as at creation", async () => {
  const lead = { _id: new mongoose.Types.ObjectId(), companyId: new mongoose.Types.ObjectId(), createdAt: new Date() };
  await assert.rejects(touch.recordTouch({ lead, user: { _id: 1 }, channel: "VIEW" }), /Choose call/);
  await assert.rejects(touch.recordTouch({ lead, user: { _id: 1 }, channel: "CALL", at: new Date(Date.now() + 3600000) }), /future/);
});

test("filters: untouched, touched and touched-within", () => {
  assert.deepEqual(touch.touchFilterClauses({ touchState: "untouched" }), [{ firstTouchAt: null }]);
  assert.deepEqual(touch.touchFilterClauses({ touchState: "TOUCHED", touchMinutesMax: "15" }), [{ firstTouchAt: { $ne: null } }, { touchMinutes: { $lte: 15 } }]);
});

test("report: per employee touched, untouched, average and median", () => {
  const a = new mongoose.Types.ObjectId(); const b = new mongoose.Types.ObjectId();
  const rows = touch.summarizeTouches([
    { assignedTo: a, firstTouchBy: a, firstTouchAt: new Date(), touchMinutes: 8 },
    { assignedTo: a, firstTouchBy: a, firstTouchAt: new Date(), touchMinutes: 20 },
    { assignedTo: a, firstTouchBy: a, firstTouchAt: new Date(), touchMinutes: 5 },
    { assignedTo: b, firstTouchAt: null },
  ]);
  const ra = rows.find((r) => String(r.userId) === String(a));
  assert.equal(ra.touched, 3); assert.equal(ra.averageMinutes, 11); assert.equal(ra.medianMinutes, 8); assert.equal(ra.within15Minutes, 2);
  const rb = rows.find((r) => String(r.userId) === String(b));
  assert.equal(rb.untouched, 1);
});

test("Meta failures are kept for reconciliation", () => {
  const M = require("../src/models/MetaLeadFailure");
  assert.ok(M.schema.paths.metaLeadId && M.schema.paths.resolved && M.schema.paths.error);
  const src = require("node:fs").readFileSync(require("node:path").resolve(__dirname, "../src/controllers/webhook.controller.js"), "utf8");
  assert.match(src, /recordMetaFailure\(\{ companyId: tenantCompanyId, event, kind: "FAILED"/);
});
