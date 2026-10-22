// Coworking client document downloads (requirements 16 Oct 2026, section 09).
const test = require("node:test");
const assert = require("node:assert/strict");
process.env.JWT_SECRET = process.env.JWT_SECRET || "doc-access-test";
const jwt = require("jsonwebtoken");
const docs = require("../src/services/documentAccess.service");
const User = require("../src/models/User");
const { requireFileAccess } = require("../src/middleware/fileAccess.middleware");
const { signFileUrlToken } = require("../src/utils/fileAccessToken");

const run = async (req) => {
  let status = 200; let body = null; let nexted = false;
  const res = { status(c) { status = c; return this; }, json(b) { body = b; return this; } };
  await requireFileAccess({ headers: {}, query: {}, ...req }, res, () => { nexted = true; });
  return { status, body, nexted };
};
const bearer = (id) => ({ authorization: `Bearer ${jwt.sign({ id }, process.env.JWT_SECRET)}` });

test("only Admin or a flagged account may download client documents", () => {
  assert.equal(docs.canDownloadClientDocuments({ role: "ADMIN" }), true);
  assert.equal(docs.canDownloadClientDocuments({ role: "MANAGER" }), false);
  assert.equal(docs.canDownloadClientDocuments({ role: "MANAGER", canDownloadClientDocuments: true }), true);
  assert.equal(docs.canDownloadClientDocuments({ role: "COWORKING_ADMIN" }), false);
  assert.equal(docs.canDownloadClientDocuments({ role: "MANAGER", canDownloadClientDocuments: true, isActive: false }), false);
  assert.ok(docs.isProtectedClientDocument("coworking-documents/a.pdf"));
  assert.ok(!docs.isProtectedClientDocument("inventory-images/a.png"));
  assert.ok(User.schema.paths.canDownloadClientDocuments);
});

test("file endpoint refuses others, even with a valid staff token, a copied URL token or no credential", async () => {
  const orig = User.findById; const AuditLog = require("../src/models/AuditLog"); const origCreate = AuditLog.create;
  const people = {
    a1: { _id: "a1", role: "ADMIN", companyId: "c" },
    m1: { _id: "m1", role: "MANAGER", companyId: "c" },
    m2: { _id: "m2", role: "MANAGER", companyId: "c", canDownloadClientDocuments: true },
    e1: { _id: "e1", role: "COWORKING_ADMIN", companyId: "c" },
  };
  const logged = [];
  User.findById = (id) => ({ select: () => ({ lean: async () => people[id] || null }) });
  AuditLog.create = async (row) => { logged.push(row); return row; };
  try {
    const path = "/coworking-documents/kyc-1.pdf";
    assert.equal((await run({ path, headers: bearer("a1") })).nexted, true, "Admin downloads");
    assert.equal((await run({ path, headers: bearer("m2") })).nexted, true, "authorised manager downloads");
    const m1 = await run({ path, headers: bearer("m1") });
    assert.equal(m1.status, 403); assert.equal(m1.nexted, false);
    assert.equal((await run({ path, headers: bearer("e1") })).status, 403);
    assert.equal((await run({ path })).status, 401, "no credential");
    const copied = await run({ path, query: { t: signFileUrlToken("coworking-documents/kyc-1.pdf") } });
    assert.equal(copied.status, 401, "a public per-URL token never opens a client document");
    assert.ok(logged.some((r) => r.action === "COWORKING_DOCUMENT_DOWNLOADED" && String(r.actorId) === "a1"), "download logged");
    // Other uploads behave as before.
    assert.equal((await run({ path: "/inventory-images/x.png", headers: bearer("e1") })).nexted, true);
  } finally {
    User.findById = orig; AuditLog.create = origCreate;
  }
});
