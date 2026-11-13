/*
 * 13 Nov 2026: a Coworking executive (Karan Malhotra in the demo data) had
 * commercial leads assigned to him but saw an empty pipeline, because his
 * own-lead scope was also filtered by his role type. Executives now see every
 * lead assigned to them; the role-type filter still bounds wider scopes.
 */
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const { createRequire } = require("node:module");
const mongoose = require("mongoose");

const load = (relative, stubs, exposed = "") => {
  const filename = path.resolve(__dirname, "../src", relative);
  const localRequire = createRequire(filename);
  const module = { exports: {} };
  vm.runInNewContext(fs.readFileSync(filename, "utf8") + exposed, {
    module, exports: module.exports,
    require: (name) => stubs[name] || localRequire(name),
    process, console, Date, setTimeout, clearTimeout,
  }, { filename });
  return module.exports;
};

const companyId = new mongoose.Types.ObjectId();
const userId = new mongoose.Types.ObjectId();
const controller = load("controllers/lead.controller.js", {}, "\nmodule.exports.testQuery = buildLeadQueryForUser;");
const hasTypeClause = (query) => JSON.stringify(query).includes("requirements.inventoryType");

for (const roleType of ["COWORKING", "COMMERCIAL", "RESIDENTIAL"]) {
  test(`a ${roleType.toLowerCase()} executive sees every lead assigned to them`, async () => {
    const query = await controller.testQuery({ _id: userId, companyId, role: "EXECUTIVE", roleType });
    assert.equal(String(query.assignedTo), String(userId));
    assert.equal(hasTypeClause(query), false, "own leads must not be filtered by category");
  });
}

test("a field executive sees leads assigned or field-assigned to them, any category", async () => {
  const query = await controller.testQuery({ _id: userId, companyId, role: "FIELD_EXECUTIVE", roleType: "COWORKING" });
  assert.ok(Array.isArray(query.$or));
  assert.equal(hasTypeClause(query), false);
});

test("a manager is still limited to their category", async () => {
  const query = await controller.testQuery({ _id: userId, companyId, role: "MANAGER", roleType: "COWORKING" });
  assert.equal(hasTypeClause(query), true);
});
