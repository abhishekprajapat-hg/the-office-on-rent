const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const { createRequire } = require("node:module");

/*
 * Bulk upload assignment (13 Nov 2026), for every uploader role and every
 * lead category:
 *   - Executives (and anyone else who is not Admin / Manager): every new lead
 *     is assigned to the uploader; an assignment choice in the request is ignored.
 *   - Admin / Manager: AUTO (balanced auto assignment, run inside the request
 *     with the uploader's full record) or USER (one person, who must be active,
 *     in the company, a lead-working role and work the lead's category).
 *   - Rows that update an existing lead never change its owner.
 */

const companyId = "aaaaaaaaaaaaaaaaaaaaaaaa";
const CATEGORIES = ["COMMERCIAL", "RESIDENTIAL", "COWORKING"];
let idCounter = 0;
const newId = () => (++idCounter).toString(16).padStart(24, "0");

// Values built inside the controller's sandbox have their own Array/Object
// prototypes, so deepEqual compares plain JSON copies.
const plain = (value) => JSON.parse(JSON.stringify(value));

const makeUser = (role, roleType, extra = {}) => ({
  _id: newId(), name: `${role} ${roleType}`, role, roleType, companyId, isActive: true, parentId: null, ...extra,
});

const response = () => ({
  code: 200,
  body: null,
  status(code) { this.code = code; return this; },
  json(body) { this.body = body; return this; },
});

const query = (value = null) => ({
  select() { return this; }, populate() { return this; }, sort() { return this; },
  lean() { return Promise.resolve(value); },
  then(resolve, reject) { return Promise.resolve(value).then(resolve, reject); },
});

const load = (stubs) => {
  const filename = path.resolve(__dirname, "../src/controllers/lead.controller.js");
  const localRequire = createRequire(filename);
  const module = { exports: {} };
  vm.runInNewContext(fs.readFileSync(filename, "utf8"), {
    module, exports: module.exports,
    require: (name) => stubs[name] || localRequire(name),
    process, console, Date, setTimeout, clearTimeout, setImmediate,
  }, { filename });
  return module.exports;
};

let phoneCounter = 0;
const rowsOf = (category, count = 3) => Array.from({ length: count }, (_, index) => ({
  name: `${category} lead ${index + 1}`,
  phone: `98${String(10000000 + (++phoneCounter)).slice(-8)}`,
  city: "Sector 62, Noida",
  requirements: { inventoryType: category, budgetMin: 50000, budgetMax: 60000 },
  status: "NEW",
}));

/*
 * A fake database: records inserted leads, activities, auto assignment calls
 * and the users the controller looks up.
 */
const harness = ({ users = [], existingPhones = [], autoAssign, failInsertAt = null } = {}) => {
  const state = { inserted: [], updates: [], activities: [], autoCalls: [], userUpdates: [] };
  const usersById = new Map(users.map((user) => [String(user._id), user]));
  const manager = makeUser("MANAGER", "BOTH", { name: "Top Manager" });

  const stubs = {
    "../services/access.service": {
      resolveAccessProfile: async () => ({ enforcePageAccess: false, permissions: [], dataScope: "OWN" }),
    },
    "../models/Lead": {
      find: () => query(existingPhones.map((phone) => ({
        _id: newId(), phone, status: "INTERESTED", assignedTo: { _id: newId(), name: "Current Owner" },
      }))),
      insertMany: async (payloads) => {
        const docs = payloads.map((payload) => ({ ...payload, _id: newId(), save: async () => {} }));
        if (failInsertAt !== null) {
          const insertedDocs = docs.filter((_, index) => index !== failInsertAt);
          state.inserted.push(...insertedDocs);
          const error = new Error("E11000 duplicate key error");
          error.insertedDocs = insertedDocs;
          error.writeErrors = [{ index: failInsertAt, errmsg: "E11000 duplicate key error collection: leads index: companyId_1_phone_1" }];
          throw error;
        }
        state.inserted.push(...docs);
        return docs;
      },
      bulkWrite: async (ops) => {
        state.updates.push(...ops);
        return { matchedCount: ops.length };
      },
    },
    "../models/Inventory": { find: () => query([]) },
    "../models/CrmContact": { find: () => query([]) },
    "../models/User": {
      findOne: (filter) => {
        const user = usersById.get(String(filter._id));
        const ok = user
          && String(user.companyId) === String(filter.companyId)
          && (filter.isActive === undefined || user.isActive === filter.isActive);
        return query(ok ? user : null);
      },
      updateOne: async (filter, update) => { state.userUpdates.push([String(filter._id), update]); },
    },
    "../models/leadActivity.model": {
      insertMany: async (docs) => { state.activities.push(...docs); return docs; },
      create: async () => ({}),
    },
    "../services/leadAssignment.service": {
      autoAssignLead: async ({ lead, requester }) => {
        state.autoCalls.push({ leadCategory: lead.requirements?.inventoryType, requester });
        return autoAssign ? autoAssign(lead, requester) : { assigned: false, reason: "NO_ACTIVE_EXECUTIVE" };
      },
    },
    "../services/hierarchy.service": {
      getAncestorByRoles: async () => manager,
      getDescendantExecutiveIds: async () => [],
      getDescendantUsers: async () => [],
    },
    "../services/crmContact.service": {
      findBrokerByPhone: async () => null,
      recordBlockedLead: async () => null,
      normalizePhone: require("../src/services/crmContact.service").normalizePhone,
      syncContactsForLeads: async () => null,
    },
  };
  return { state, controller: load(stubs), manager };
};

const upload = async (controller, user, rows, assignment) => {
  const res = response();
  await controller.bulkUploadLeads({ user, body: { rows, ...(assignment !== undefined ? { assignment } : {}) } }, res);
  return res;
};

/* ---------------------------------------------------- executives: self -- */

for (const role of ["EXECUTIVE", "INSIDE_EXECUTIVE", "FIELD_EXECUTIVE"]) {
  for (const category of CATEGORIES) {
    test(`${role} (${category}) uploading ${category} leads: all assigned to the uploader`, async () => {
      const uploader = makeUser(role, category);
      const other = makeUser("EXECUTIVE", category);
      const { state, controller, manager } = harness({ users: [uploader, other] });
      // A choice sent by an executive is ignored.
      const res = await upload(controller, uploader, rowsOf(category), { mode: "USER", userId: other._id });

      assert.equal(res.code, 201, JSON.stringify(res.body));
      assert.equal(res.body.createdCount, 3);
      assert.equal(res.body.failedCount, 0);
      assert.equal(state.autoCalls.length, 0, "no auto assignment for an executive's own upload");
      for (const lead of state.inserted) {
        assert.equal(String(lead.assignedTo), String(uploader._id));
        assert.equal(lead.requirements.inventoryType, category);
        assert.equal(String(lead.assignedManager), String(manager._id));
        if (role === "FIELD_EXECUTIVE") assert.equal(String(lead.assignedFieldExecutive), String(uploader._id));
        else assert.equal(String(lead.assignedExecutive), String(uploader._id));
        assert.equal(lead.assignmentHistory[0].action, "INITIAL_ASSIGNMENT");
      }
      assert.equal(res.body.assignment.mode, "SELF");
      assert.deepEqual(plain(res.body.assignment.byUser).map((row) => [row.userId, row.count]), [[String(uploader._id), 3]]);
      assert.equal(state.activities.length, 3);
    });
  }
}

for (const category of CATEGORIES) {
  for (const otherCategory of CATEGORIES.filter((value) => value !== category)) {
    test(`a ${category} executive cannot upload ${otherCategory} leads`, async () => {
      const uploader = makeUser("EXECUTIVE", category);
      const { state, controller } = harness({ users: [uploader] });
      const res = await upload(controller, uploader, rowsOf(otherCategory, 2));
      assert.equal(res.code, 201);
      assert.equal(res.body.createdCount, 0);
      assert.equal(res.body.failedCount, 2);
      assert.match(res.body.failures[0].message, new RegExp(otherCategory.toLowerCase()));
      assert.equal(state.inserted.length, 0);
    });
  }
}

test("an all-categories executive uploads every category, all assigned to them", async () => {
  const uploader = makeUser("EXECUTIVE", "BOTH");
  const { state, controller } = harness({ users: [uploader] });
  const res = await upload(controller, uploader, [...rowsOf("COMMERCIAL", 1), ...rowsOf("RESIDENTIAL", 1), ...rowsOf("COWORKING", 1)]);
  assert.equal(res.body.createdCount, 3);
  assert.ok(state.inserted.every((lead) => String(lead.assignedTo) === String(uploader._id)));
});

test("re-uploading an existing phone updates the lead but never changes its owner", async () => {
  const uploader = makeUser("EXECUTIVE", "COMMERCIAL");
  const rows = rowsOf("COMMERCIAL", 1);
  const { state, controller } = harness({ users: [uploader], existingPhones: [rows[0].phone] });
  const res = await upload(controller, uploader, rows);
  assert.equal(res.body.createdCount, 0);
  assert.equal(res.body.updatedCount, 1);
  const set = state.updates[0].updateOne.update.$set;
  for (const field of ["assignedTo", "assignedExecutive", "assignedManager", "assignmentHistory"]) {
    assert.equal(set[field], undefined, `${field} must not be written on update`);
  }
});

/* ------------------------------------------ admin / manager: auto mode -- */

for (const role of ["ADMIN", "MANAGER"]) {
  for (const category of CATEGORIES) {
    test(`${role} uploading ${category} leads with auto-assign`, async () => {
      const uploader = makeUser(role, role === "ADMIN" ? "COMMERCIAL" : category);
      const exec1 = makeUser("EXECUTIVE", category, { name: "Exec One" });
      const exec2 = makeUser("EXECUTIVE", category, { name: "Exec Two" });
      let turn = 0;
      const { state, controller } = harness({
        users: [uploader, exec1, exec2],
        autoAssign: () => ({ assigned: true, executive: (turn++ % 2 ? exec2 : exec1) }),
      });
      const res = await upload(controller, uploader, rowsOf(category, 4), { mode: "AUTO" });

      assert.equal(res.code, 201, JSON.stringify(res.body));
      assert.equal(res.body.createdCount, 4);
      // Saved unassigned, then auto assigned inside the request.
      assert.ok(state.inserted.every((lead) => lead.assignedTo === undefined));
      assert.equal(state.autoCalls.length, 4);
      for (const call of state.autoCalls) {
        assert.equal(call.leadCategory, category);
        assert.equal(call.requester.isActive, true, "full requester so a manager's own team is preferred");
        assert.equal(call.requester.role, role);
        assert.equal(call.requester.roleType, uploader.roleType);
      }
      assert.equal(res.body.assignment.mode, "AUTO");
      assert.equal(res.body.assignment.assignedCount, 4);
      assert.deepEqual(plain(res.body.assignment.byUser).map((row) => [row.name, row.count]), [["Exec One", 2], ["Exec Two", 2]]);
      assert.equal(res.body.assignment.unassignedCount, 0);
    });
  }
}

test("auto-assign is the default when an Admin sends no choice", async () => {
  const admin = makeUser("ADMIN", "COMMERCIAL");
  const { state, controller } = harness({ users: [admin] });
  const res = await upload(controller, admin, rowsOf("COWORKING", 2));
  assert.equal(res.body.assignment.mode, "AUTO");
  assert.equal(state.autoCalls.length, 2);
});

test("auto-assign reports leads it could not place, with the reason", async () => {
  const admin = makeUser("ADMIN", "COMMERCIAL");
  const exec = makeUser("EXECUTIVE", "COWORKING", { name: "Karan" });
  let calls = 0;
  const { controller } = harness({
    users: [admin, exec],
    autoAssign: () => (++calls <= 2
      ? { assigned: true, executive: exec }
      : { assigned: false, reason: "EXECUTIVE_CAPACITY_REACHED" }),
  });
  const res = await upload(controller, admin, rowsOf("COWORKING", 5), { mode: "AUTO" });
  assert.equal(res.body.assignment.assignedCount, 2);
  assert.equal(res.body.assignment.unassignedCount, 3);
  assert.deepEqual(plain(res.body.assignment.unassigned), [{
    reason: "EXECUTIVE_CAPACITY_REACHED", message: "every eligible executive is at their lead limit", count: 3,
  }]);
});

test("a Manager cannot upload leads outside their category, whatever the assignment choice", async () => {
  const managerUser = makeUser("MANAGER", "COMMERCIAL");
  const { state, controller } = harness({ users: [managerUser] });
  const res = await upload(controller, managerUser, rowsOf("RESIDENTIAL", 2), { mode: "AUTO" });
  assert.equal(res.body.createdCount, 0);
  assert.equal(res.body.failedCount, 2);
  assert.equal(state.autoCalls.length, 0);
});

/* ------------------------------------ admin / manager: one person mode -- */

const targetRoles = [
  ["EXECUTIVE", (lead, target) => assert.equal(String(lead.assignedExecutive), String(target._id))],
  ["INSIDE_EXECUTIVE", (lead, target) => assert.equal(String(lead.assignedExecutive), String(target._id))],
  ["FIELD_EXECUTIVE", (lead, target) => assert.equal(String(lead.assignedFieldExecutive), String(target._id))],
  ["MANAGER", (lead, target) => assert.equal(String(lead.assignedManager), String(target._id))],
];

for (const uploaderRole of ["ADMIN", "MANAGER"]) {
  for (const category of CATEGORIES) {
    for (const [targetRole, checkRole] of targetRoles) {
      test(`${uploaderRole} assigns ${category} leads to one ${targetRole} of that category`, async () => {
        const uploader = makeUser(uploaderRole, uploaderRole === "ADMIN" ? "COMMERCIAL" : category);
        const target = makeUser(targetRole, category, { name: "Chosen Person" });
        const { state, controller } = harness({ users: [uploader, target] });
        const res = await upload(controller, uploader, rowsOf(category, 3), { mode: "USER", userId: target._id });

        assert.equal(res.code, 201, JSON.stringify(res.body));
        assert.equal(res.body.createdCount, 3);
        assert.equal(state.autoCalls.length, 0);
        for (const lead of state.inserted) {
          assert.equal(String(lead.assignedTo), String(target._id));
          assert.equal(lead.assignmentHistory[0].action, "BULK_ASSIGNED");
          checkRole(lead, target);
        }
        assert.notStrictEqual(state.inserted[0].assignmentHistory, state.inserted[1].assignmentHistory, "each lead has its own history array");
        assert.deepEqual(plain(res.body.assignment.byUser).map((row) => [row.name, row.count]), [["Chosen Person", 3]]);
        assert.equal(state.activities.length, 3);
        assert.match(state.activities[0].action, /Chosen Person/);
        assert.ok(state.userUpdates.some(([id]) => id === String(target._id)), "target's lastAssignedAt is updated");
      });
    }
  }
}

for (const category of CATEGORIES) {
  for (const otherCategory of CATEGORIES.filter((value) => value !== category)) {
    test(`a ${category} person is refused ${otherCategory} leads in one-person mode`, async () => {
      const admin = makeUser("ADMIN", "COMMERCIAL");
      const target = makeUser("EXECUTIVE", category, { name: "Wrong Category" });
      const { state, controller } = harness({ users: [admin, target] });
      const res = await upload(controller, admin, rowsOf(otherCategory, 2), { mode: "USER", userId: target._id });
      assert.equal(res.body.createdCount, 0);
      assert.equal(res.body.failedCount, 2);
      assert.match(res.body.failures[0].message, new RegExp(`works ${category.toLowerCase()} leads`));
      assert.equal(state.inserted.length, 0);
    });
  }
}

test("an all-categories person and an Admin can be given any category", async () => {
  const admin = makeUser("ADMIN", "COMMERCIAL");
  for (const target of [makeUser("EXECUTIVE", "BOTH"), makeUser("ADMIN", "COMMERCIAL", { name: "Other Admin" })]) {
    const { state, controller } = harness({ users: [admin, target] });
    const rows = [...rowsOf("COMMERCIAL", 1), ...rowsOf("RESIDENTIAL", 1), ...rowsOf("COWORKING", 1)];
    const res = await upload(controller, admin, rows, { mode: "USER", userId: target._id });
    assert.equal(res.body.createdCount, 3, JSON.stringify(res.body.failures));
    assert.ok(state.inserted.every((lead) => String(lead.assignedTo) === String(target._id)));
  }
});

test("one-person mode refuses a bad choice before touching any row", async () => {
  const admin = makeUser("ADMIN", "COMMERCIAL");
  const inactive = makeUser("EXECUTIVE", "COMMERCIAL", { isActive: false });
  const otherCompany = makeUser("EXECUTIVE", "COMMERCIAL", { companyId: "dddddddddddddddddddddddd" });
  const communityManager = makeUser("COMMUNITY_MANAGER", "COWORKING", { name: "Anita" });
  const cases = [
    [{ mode: "USER" }, /Choose the person/],
    [{ mode: "USER", userId: "not-an-id" }, /Choose the person/],
    [{ mode: "USER", userId: inactive._id }, /active and in your company/],
    [{ mode: "USER", userId: otherCompany._id }, /active and in your company/],
    [{ mode: "USER", userId: communityManager._id }, /does not work sales leads/],
    [{ mode: "EVERYONE" }, /AUTO or USER/],
  ];
  for (const [assignment, pattern] of cases) {
    const { state, controller } = harness({ users: [admin, inactive, otherCompany, communityManager] });
    const res = await upload(controller, admin, rowsOf("COMMERCIAL", 1), assignment);
    assert.equal(res.code, 400, `${JSON.stringify(assignment)} -> ${JSON.stringify(res.body)}`);
    assert.match(res.body.message, pattern);
    assert.equal(state.inserted.length, 0);
  }
});

test("updated rows keep their owner in one-person mode too", async () => {
  const admin = makeUser("ADMIN", "COMMERCIAL");
  const target = makeUser("EXECUTIVE", "COMMERCIAL");
  const rows = rowsOf("COMMERCIAL", 2);
  const { state, controller } = harness({ users: [admin, target], existingPhones: [rows[0].phone] });
  const res = await upload(controller, admin, rows, { mode: "USER", userId: target._id });
  assert.equal(res.body.createdCount, 1);
  assert.equal(res.body.updatedCount, 1);
  assert.equal(state.updates[0].updateOne.update.$set.assignedTo, undefined);
  assert.equal(String(state.inserted[0].assignedTo), String(target._id));
});

/* ------------------------------------------------ per-row upload report -- */

test("the response reports every row: created, updated, failed - with sheet row, owner and reason", async () => {
  const admin = makeUser("ADMIN", "COMMERCIAL");
  const target = makeUser("EXECUTIVE", "COMMERCIAL", { name: "Chosen Person" });
  const rows = rowsOf("COMMERCIAL", 3).map((row, index) => ({ ...row, sourceRow: index + 3, sheetName: "Leads" }));
  rows[1].phone = "12345";                       // invalid phone
  rows.push({ ...rows[0], name: "Same number", sourceRow: 9 }); // duplicate of row 3
  const existing = rowsOf("COMMERCIAL", 1).map((row) => ({ ...row, sourceRow: 10, sheetName: "Leads", status: "LOST" }));
  const { controller } = harness({ users: [admin, target], existingPhones: [existing[0].phone] });
  const res = await upload(controller, admin, [...rows, ...existing], { mode: "USER", userId: target._id });

  const results = plain(res.body.results);
  assert.equal(res.body.totalRows, 5);
  assert.equal(results.length, 5);
  assert.deepEqual(results.map((row) => [row.sourceRow, row.status]), [[3, "CREATED"], [4, "FAILED"], [5, "CREATED"], [9, "FAILED"], [10, "UPDATED"]]);

  const [created, invalid, , duplicate, updated] = results;
  assert.equal(created.sheetName, "Leads");
  assert.equal(created.assignedTo, "Chosen Person");
  assert.match(created.message, /assigned to Chosen Person/);
  assert.ok(created.leadId, "created rows carry the new lead id");
  assert.equal(created.leadStatus, "NEW");
  assert.match(invalid.message, /valid phone/i);
  assert.match(duplicate.message, /Duplicate: same phone number as row 3 of "Leads" in this file/);
  assert.equal(updated.assignedTo, "Current Owner", "an updated lead shows its unchanged owner");
  assert.match(updated.message, /already existed.*status to lost.*Owner unchanged/);

  // failures carry the same detail, and the counts agree with the rows
  assert.equal(res.body.failedCount, 2);
  assert.deepEqual(plain(res.body.failures).map((row) => [row.sourceRow, row.sheetName]), [[4, "Leads"], [9, "Leads"]]);
  assert.equal(res.body.createdCount, 2);
  assert.equal(res.body.updatedCount, 1);
});

test("auto mode reports who each new lead went to, and why a lead was left unassigned", async () => {
  const admin = makeUser("ADMIN", "COMMERCIAL");
  const exec = makeUser("EXECUTIVE", "COWORKING", { name: "Karan" });
  let calls = 0;
  const { controller } = harness({
    users: [admin, exec],
    autoAssign: () => (++calls === 1 ? { assigned: true, executive: exec } : { assigned: false, reason: "NO_ACTIVE_EXECUTIVE" }),
  });
  const res = await upload(controller, admin, rowsOf("COWORKING", 2), { mode: "AUTO" });
  const results = plain(res.body.results);
  assert.equal(results[0].assignedTo, "Karan");
  assert.match(results[0].message, /auto-assigned to Karan/);
  assert.equal(results[1].assignedTo, "");
  assert.match(results[1].message, /left unassigned: no active executive works this category/);
});

test("a database duplicate-key error is reported in plain words on its row", async () => {
  const exec = makeUser("EXECUTIVE", "COMMERCIAL", { name: "Exec" });
  const { controller } = harness({ users: [exec], failInsertAt: 1 });
  const rows = rowsOf("COMMERCIAL", 3).map((row, index) => ({ ...row, sourceRow: index + 2 }));
  const res = await upload(controller, exec, rows);
  const results = plain(res.body.results);
  assert.deepEqual(results.map((row) => row.status), ["CREATED", "FAILED", "CREATED"]);
  assert.equal(results[1].message, "A lead with this phone number already exists");
  assert.equal(results[1].sourceRow, 3);
  assert.equal(res.body.createdCount, 2);
  assert.equal(res.body.failedCount, 1);
  assert.ok(results[0].leadId && results[2].leadId);
  assert.equal(results[0].assignedTo, "Exec");
});
