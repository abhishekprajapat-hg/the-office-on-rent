const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const { createRequire } = require("node:module");

const companyId = "aaaaaaaaaaaaaaaaaaaaaaaa";
const otherCompanyId = "ffffffffffffffffffffffff";
const adminId = "bbbbbbbbbbbbbbbbbbbbbbbb";
const managerId = "cccccccccccccccccccccccc";
const roleTypeId = "dddddddddddddddddddddddd";
const roleId = "eeeeeeeeeeeeeeeeeeeeeeee";
const targetUserId = "111111111111111111111111";

// Same isolation approach as crm-requirements.test.cjs: run the real modules
// with stubbed repositories, never touching a database.
const query = (value) => ({
  select() { return this; },
  populate() { return this; },
  sort() { return this; },
  limit() { return this; },
  lean() { return Promise.resolve(value); },
  then(resolve, reject) { return Promise.resolve(value).then(resolve, reject); },
});

// assert/strict deepEqual compares prototypes, and anything a vm-loaded module
// returns belongs to that context's realm — so compare structure, not identity.
const sameShape = (actual, expected, message) =>
  assert.equal(JSON.stringify(actual), JSON.stringify(expected), message);

const load = (relative, stubs = {}, exposed = "") => {
  const filename = path.resolve(__dirname, "../src", relative);
  const localRequire = createRequire(filename);
  const module = { exports: {} };
  vm.runInNewContext(fs.readFileSync(filename, "utf8") + exposed, {
    module,
    exports: module.exports,
    require: (name) => (name in stubs ? stubs[name] : localRequire(name)),
    process,
    console,
    Date,
    setTimeout,
    clearTimeout,
  }, { filename });
  return module.exports;
};

const mongooseStub = { Types: { ObjectId: { isValid: (value) => Boolean(value) } } };
const auditStub = { writeAuditLog: async () => {}, listAuditLogs: async () => ({ logs: [], pagination: {} }) };

const adminUser = { _id: adminId, companyId, role: "ADMIN" };
const managerUser = { _id: managerId, companyId, role: "MANAGER" };

const loadAccessService = ({ role = null, rolePermission = null } = {}) =>
  load("services/access.service.js", {
    mongoose: mongooseStub,
    "../models/Role": { findOne: () => query(role) },
    "../models/RolePermission": { findOne: () => query(rolePermission) },
  });

/* ------------------------- page access catalogue ------------------------- */

test("page permissions imply view and always keep profile reachable", () => {
  const pages = require("../src/constants/page.constants");
  const granted = pages.toPagePermissions([{ pageKey: "leads", actions: ["edit"] }]);

  assert.ok(granted.includes("page.leads.view"), "editing a page implies viewing it");
  assert.ok(granted.includes("page.leads.edit"));
  assert.ok(granted.includes("page.profile.view"), "profile can never be revoked");
  assert.ok(!granted.includes("page.inventory.view"));

  // Unknown pages and unknown actions are dropped rather than trusted.
  sameShape(
    pages.toPagePermissions([{ pageKey: "not_a_page", actions: ["view"] }]).sort(),
    ["page.dashboard.view", "page.profile.view"],
  );
  assert.ok(!pages.toPagePermissions([{ pageKey: "leads", actions: ["approve"] }])
    .includes("page.leads.approve"));
});

test("role type management is not part of the Manager default grant", () => {
  const permissions = require("../src/constants/permission.constants");

  assert.ok(permissions.PERMISSIONS.includes("role_types.create"));
  assert.equal(
    permissions.MANAGER_DEFAULT_PERMISSIONS.some((value) => value.startsWith("role_types.")),
    false,
    "a Manager must not automatically receive Role Type management access",
  );
  assert.ok(permissions.isAdminProtectedPermission("role_types.delete"));
  assert.ok(!permissions.isAdminProtectedPermission("clients.view"));
});

/* --------------------------- effective access --------------------------- */

test("Admin bypasses role configuration entirely", async () => {
  const access = loadAccessService();
  const profile = await access.resolveAccessProfile(adminUser);

  assert.equal(profile.isAdmin, true);
  assert.equal(profile.enforcePageAccess, false);
  assert.ok(profile.permissions.includes("role_types.delete"));
  assert.ok(profile.permissions.includes("page.admin_role_types.view"));
});

test("an account with no dynamic role keeps its legacy access untouched", async () => {
  const access = loadAccessService();
  const profile = await access.resolveAccessProfile(managerUser);

  assert.equal(profile.hasDynamicRole, false);
  assert.equal(profile.enforcePageAccess, false, "the page guard must not apply");
  assert.ok(profile.permissions.includes("clients.view"));
  assert.ok(!profile.permissions.includes("role_types.create"));
  assert.ok(profile.permissions.includes("page.leads.view"));
});

test("a dynamic role adds its own permissions and turns page enforcement on", async () => {
  const access = loadAccessService({
    role: {
      _id: roleId,
      name: "Commercial Executive",
      baseRole: "EXECUTIVE",
      status: "ACTIVE",
      pages: [{ pageKey: "leads", actions: ["view", "create", "edit", "follow_up"] }, { pageKey: "inventory", actions: ["view"] }],
      permissions: ["reports.view"],
      dataScope: "ASSIGNED",
      enforcePageAccess: true,
    },
  });

  const profile = await access.resolveAccessProfile({
    _id: targetUserId,
    companyId,
    role: "EXECUTIVE",
    roleId,
  });

  assert.equal(profile.enforcePageAccess, true);
  assert.equal(profile.dataScope, "ASSIGNED");
  assert.ok(profile.permissions.includes("page.leads.follow_up"));
  assert.ok(profile.permissions.includes("page.inventory.view"));
  assert.ok(profile.permissions.includes("reports.view"));
  // The example from the spec: Leads + Inventory only, plus Profile.
  assert.ok(!profile.permissions.includes("page.finance.view"));
  assert.ok(!profile.permissions.includes("page.admin_team.view"));
  assert.ok(profile.permissions.includes("page.profile.view"));
});

test("an inactive role falls back to the base role instead of locking the account out", async () => {
  const access = loadAccessService({
    role: { _id: roleId, name: "Retired", baseRole: "EXECUTIVE", status: "INACTIVE", pages: [], permissions: [], enforcePageAccess: true },
  });

  const profile = await access.resolveAccessProfile({
    _id: targetUserId, companyId, role: "EXECUTIVE", roleId,
  });

  assert.equal(profile.hasDynamicRole, false);
  assert.equal(profile.enforcePageAccess, false);
  assert.ok(profile.permissions.includes("page.leads.view"));
});

test("an unauthorized Manager is denied role type permissions, an authorized one is not", async () => {
  const unauthorized = loadAccessService();
  assert.equal(await unauthorized.hasPermission(managerUser, "role_types.create"), false);
  assert.equal(await unauthorized.hasPermission(managerUser, "users.create"), true);

  // Admin grants the permission through the per-company RolePermission override.
  const authorized = loadAccessService({
    rolePermission: { permissions: ["users.create", "role_types.view", "role_types.create"] },
  });
  assert.equal(await authorized.hasPermission(managerUser, "role_types.create"), true);
  assert.equal(await authorized.hasPermission(adminUser, "role_types.delete"), true);
});

/* ----------------------- privilege escalation guards ---------------------- */

test("a Manager cannot grant protected permissions or anything beyond their own", async () => {
  const access = loadAccessService({
    rolePermission: { permissions: ["users.create", "role_types.view", "role_types.manage_roles"] },
  });

  await assert.rejects(
    () => access.assertGrantablePermissions({ actor: managerUser, permissions: ["roles.manage"] }),
    /Only an Admin can grant protected permissions/,
  );

  await assert.rejects(
    () => access.assertGrantablePermissions({ actor: managerUser, permissions: ["audit_logs.view"] }),
    /cannot grant permissions you do not hold/,
  );

  await assert.rejects(
    () => access.assertGrantablePages({
      actor: managerUser,
      pages: [{ pageKey: "admin_role_types", actions: ["edit"] }],
    }),
    /pages or actions you do not have yourself/,
  );

  // What the Manager does hold passes through.
  await access.assertGrantablePermissions({ actor: managerUser, permissions: ["role_types.view"] });
  // And an Admin is never restricted.
  await access.assertGrantablePermissions({ actor: adminUser, permissions: ["roles.manage"] });
});

/* ------------------------------ Role Types ------------------------------ */

const loadRoleTypeService = (overrides = {}) => {
  const created = [];
  const service = load("services/roleType.service.js", {
    mongoose: mongooseStub,
    "../models/RoleType": {
      findOne: (filter = {}) => query(
        filter.normalizedName !== undefined
          ? (overrides.nameClash ?? null)
          : (overrides.existingRoleType ?? null),
      ),
      find: () => query(overrides.roleTypes ?? []),
      create: async (doc) => { created.push(doc); return { ...doc, _id: roleTypeId, createdAt: new Date(), updatedAt: new Date() }; },
      deleteOne: async () => ({ deletedCount: 1 }),
    },
    "../models/Role": {
      countDocuments: async () => overrides.roleCount ?? 0,
      find: () => query([]),
      aggregate: async () => [],
    },
    "../models/User": {
      countDocuments: async () => overrides.userCount ?? 0,
      find: () => query([]),
      aggregate: async () => [],
    },
    "../models/AuditLog": { find: () => query([]) },
    "./auditLog.service": auditStub,
    "./access.service": {
      isAdminRole: (role) => role === "ADMIN",
      invalidateAccessCache: () => {},
    },
  });
  return { service, created };
};

test("creating a role type always uses the actor's own tenant", async () => {
  const { service, created } = loadRoleTypeService();

  const roleType = await service.createRoleType({
    companyId,
    // A Manager trying to plant the record in another tenant.
    payload: { name: "Coworking", description: "Coworking division", companyId: otherCompanyId, branch: "HQ" },
    actingUser: managerUser,
  });

  assert.equal(created.length, 1);
  assert.equal(String(created[0].companyId), companyId);
  assert.equal(created[0].isSystem, false, "a runtime-created type is never a protected system type");
  assert.equal(roleType.name, "Coworking");
  assert.equal(roleType.code, "COWORKING");
  assert.equal(roleType.status, "ACTIVE");
});

test("duplicate role type names are rejected inside one tenant", async () => {
  const { service } = loadRoleTypeService({
    nameClash: { _id: roleTypeId, name: "Coworking" },
  });

  await assert.rejects(
    () => service.createRoleType({ companyId, payload: { name: "  coworking " }, actingUser: adminUser }),
    /already exists/,
  );
});

test("a role type in use cannot be deleted until its dependencies move", async () => {
  const { service } = loadRoleTypeService({
    existingRoleType: { _id: roleTypeId, name: "Coworking", isSystem: false, status: "ACTIVE" },
    roleCount: 3,
    userCount: 5,
  });

  await assert.rejects(
    () => service.deleteRoleType({ companyId, roleTypeId, actingUser: adminUser }),
    (error) => {
      assert.equal(error.statusCode, 409);
      assert.match(error.message, /3 roles and 5 users/);
      sameShape(error.details, { roleCount: 3, userCount: 5 });
      return true;
    },
  );
});

test("protected system role types resist deletion and non-admin edits", async () => {
  const systemType = {
    _id: roleTypeId, name: "Commercial", normalizedName: "commercial", isSystem: true,
    status: "ACTIVE", legacyRoleType: "COMMERCIAL", save: async () => {},
  };
  const { service } = loadRoleTypeService({ existingRoleType: systemType });

  await assert.rejects(
    () => service.deleteRoleType({ companyId, roleTypeId, actingUser: adminUser }),
    /Protected system role types cannot be deleted/,
  );

  await assert.rejects(
    () => service.updateRoleType({ companyId, roleTypeId, payload: { name: "Renamed" }, actingUser: managerUser }),
    /Only an Admin can modify a protected system role type/,
  );
});

test("renaming a role type rewrites only that document", async () => {
  const systemType = {
    _id: roleTypeId, name: "Commercial", normalizedName: "commercial", code: "COMMERCIAL",
    status: "ACTIVE", isSystem: true, legacyRoleType: "COMMERCIAL", saved: false,
    async save() { this.saved = true; },
  };
  const { service } = loadRoleTypeService({ existingRoleType: systemType });

  const updated = await service.updateRoleType({
    companyId, roleTypeId, payload: { name: "Commercial Sales" }, actingUser: adminUser,
  });

  assert.equal(updated.name, "Commercial Sales");
  assert.equal(updated.code, "COMMERCIAL", "the stable code survives a rename");
  assert.equal(systemType.saved, true);
});

/* -------------------------------- Roles -------------------------------- */

const loadRoleService = (overrides = {}) => {
  const created = [];
  const service = load("services/role.service.js", {
    mongoose: mongooseStub,
    "../models/Role": {
      findOne: () => query(overrides.existingRole ?? null),
      find: () => query(overrides.roles ?? []),
      countDocuments: async () => overrides.dependentRoleCount ?? 0,
      create: async (doc) => { created.push(doc); return { ...doc, _id: roleId }; },
      deleteOne: async () => ({ deletedCount: 1 }),
    },
    "../models/RoleType": {
      findOne: () => query(overrides.roleType ?? null),
      find: () => query(overrides.roleTypes ?? []),
    },
    "../models/User": {
      countDocuments: async () => overrides.assignedUserCount ?? 0,
      find: () => query([]),
      aggregate: async () => [],
    },
    "./auditLog.service": auditStub,
    "./access.service": {
      isAdminRole: (role) => role === "ADMIN",
      invalidateAccessCache: () => {},
      normalizePageEntries: (pages) => pages.map((entry) => ({
        pageKey: entry.pageKey,
        actions: [...new Set(["view", ...(entry.actions || [])])],
      })),
      assertGrantablePermissions: async () => {},
      assertGrantablePages: async () => {},
    },
    "./roleType.service": { toCode: (value) => String(value).toUpperCase().replace(/[^A-Z0-9]+/g, "_") },
  });
  return { service, created };
};

test("a role must belong to at least one active role type in the same tenant", async () => {
  const { service } = loadRoleService({ roleTypes: [] });

  await assert.rejects(
    () => service.createRole({ companyId, payload: { name: "Front Desk", baseRole: "EXECUTIVE" }, actingUser: adminUser }),
    /must belong to at least one role type/,
  );

  await assert.rejects(
    () => service.createRole({
      companyId,
      // An id from another tenant simply is not found.
      payload: { name: "Front Desk", baseRole: "EXECUTIVE", roleTypeIds: [roleTypeId] },
      actingUser: adminUser,
    }),
    /unknown or inactive/,
  );
});

test("a role stores page access and the flattened page permissions together", async () => {
  const { service, created } = loadRoleService({
    roleTypes: [{ _id: roleTypeId, name: "Commercial", status: "ACTIVE" }],
  });

  const role = await service.createRole({
    companyId,
    payload: {
      name: "Field Desk Executive",
      baseRole: "EXECUTIVE",
      roleTypeIds: [roleTypeId],
      pages: [
        { pageKey: "leads", actions: ["view", "create", "edit", "follow_up"] },
        { pageKey: "inventory", actions: ["view"] },
      ],
      dataScope: "ASSIGNED",
    },
    actingUser: adminUser,
  });

  assert.equal(created.length, 1);
  assert.equal(created[0].enforcePageAccess, true, "roles built here are enforced from the start");
  assert.ok(created[0].permissions.includes("page.leads.follow_up"));
  assert.ok(created[0].permissions.includes("page.inventory.view"));
  assert.ok(!created[0].permissions.includes("page.finance.view"));
  assert.equal(role.dataScope, "ASSIGNED");
});

test("only an Admin can build Manager-level roles or edit system roles", async () => {
  const { service } = loadRoleService({
    roleTypes: [{ _id: roleTypeId, name: "Commercial", status: "ACTIVE" }],
  });

  await assert.rejects(
    () => service.createRole({
      companyId,
      payload: { name: "Shadow Manager", baseRole: "MANAGER", roleTypeIds: [roleTypeId] },
      actingUser: managerUser,
    }),
    /Only an Admin can create Manager-level roles/,
  );

  await assert.rejects(
    () => service.createRole({
      companyId,
      payload: { name: "Root", baseRole: "ADMIN", roleTypeIds: [roleTypeId] },
      actingUser: adminUser,
    }),
    /cannot be built on the ADMIN base role/,
  );
});

test("a Manager cannot edit the role assigned to their own account", async () => {
  const { service } = loadRoleService({
    existingRole: {
      _id: roleId, name: "Manager", normalizedName: "manager", baseRole: "MANAGER",
      roleTypeIds: [roleTypeId], pages: [], permissions: [], status: "ACTIVE", isSystem: false,
      save: async () => {},
    },
    roleTypes: [{ _id: roleTypeId, name: "Commercial", status: "ACTIVE" }],
  });

  await assert.rejects(
    () => service.updateRole({
      companyId,
      roleId,
      payload: { name: "Manager", baseRole: "MANAGER", roleTypeIds: [roleTypeId] },
      actingUser: { ...managerUser, roleId },
    }),
    /cannot edit the role assigned to your own account/,
  );
});

test("a role still assigned to users cannot be deleted", async () => {
  const { service } = loadRoleService({
    existingRole: { _id: roleId, name: "Executive", isSystem: false, roleTypeIds: [roleTypeId], pages: [], permissions: [] },
    assignedUserCount: 4,
  });

  await assert.rejects(
    () => service.deleteRole({ companyId, roleId, actingUser: adminUser }),
    (error) => {
      assert.equal(error.statusCode, 409);
      assert.match(error.message, /assigned to 4 users/);
      return true;
    },
  );
});

test("assignable roles are the active roles of one active role type", async () => {
  const { service } = loadRoleService({
    roleType: { _id: roleTypeId, status: "ACTIVE" },
    roles: [{ _id: roleId, name: "Executive", code: "EXECUTIVE", baseRole: "EXECUTIVE", dataScope: "ASSIGNED" }],
  });

  const roles = await service.listAssignableRoles({ companyId, roleTypeId });
  assert.equal(roles.length, 1);
  assert.equal(roles[0].baseRoleLabel, "Executive");

  const inactive = loadRoleService({ roleType: { _id: roleTypeId, status: "INACTIVE" }, roles: [] });
  sameShape(await inactive.service.listAssignableRoles({ companyId, roleTypeId }), []);
});

/* ------------------------- user role assignment ------------------------- */

const loadAssignmentService = (overrides = {}) =>
  load("services/userRoleAssignment.service.js", {
    mongoose: mongooseStub,
    "../models/Role": { findOne: () => query(overrides.role ?? null) },
    "../models/RoleType": { findOne: () => query(overrides.roleType ?? null) },
    "../models/UserRoleAssignment": { updateMany: async () => {}, create: async () => {} },
    "./auditLog.service": auditStub,
    "./access.service": {
      isAdminRole: (role) => role === "ADMIN",
      assertGrantablePermissions: overrides.assertGrantablePermissions || (async () => {}),
    },
    "./hierarchy.service": { getDescendantUsers: async () => overrides.descendants ?? [] },
  });

test("a payload without role type ids keeps the previous create-user behaviour", async () => {
  const service = loadAssignmentService();
  const resolved = await service.resolveRoleAssignment({
    companyId, fallbackRole: "EXECUTIVE", fallbackRoleType: "RESIDENTIAL", actingUser: adminUser,
  });

  sameShape(resolved, {
    role: "EXECUTIVE", roleType: "RESIDENTIAL", roleTypeId: null, roleId: null, roleDoc: null, roleTypeDoc: null,
  });
});

test("the chosen role must belong to the chosen role type and both must be active", async () => {
  const mismatched = loadAssignmentService({
    roleType: { _id: roleTypeId, name: "Coworking", status: "ACTIVE", legacyRoleType: "COMMERCIAL" },
    role: { _id: roleId, name: "Sales Executive", status: "ACTIVE", baseRole: "EXECUTIVE", roleTypeIds: ["999999999999999999999999"], permissions: [] },
  });
  await assert.rejects(
    () => mismatched.resolveRoleAssignment({ companyId, roleTypeId, roleId, actingUser: adminUser }),
    /does not belong to role type/,
  );

  const inactiveType = loadAssignmentService({
    roleType: { _id: roleTypeId, name: "Coworking", status: "INACTIVE" },
  });
  await assert.rejects(
    () => inactiveType.resolveRoleAssignment({ companyId, roleTypeId, roleId, actingUser: adminUser }),
    /is inactive/,
  );

  const foreign = loadAssignmentService({ roleType: null });
  await assert.rejects(
    () => foreign.resolveRoleAssignment({ companyId, roleTypeId, roleId, actingUser: managerUser }),
    /Role type not found for this organization/,
  );
});

test("a resolved assignment fills the legacy role and roleType fields from the ids", async () => {
  const service = loadAssignmentService({
    roleType: { _id: roleTypeId, name: "Coworking", status: "ACTIVE", legacyRoleType: "BOTH" },
    role: {
      _id: roleId, name: "Community Manager", status: "ACTIVE", baseRole: "COMMUNITY_MANAGER",
      roleTypeIds: [roleTypeId], permissions: ["page.tasks.view"],
    },
  });

  const resolved = await service.resolveRoleAssignment({ companyId, roleTypeId, roleId, actingUser: adminUser });

  assert.equal(resolved.role, "COMMUNITY_MANAGER", "User.role still holds a built-in role code");
  assert.equal(resolved.roleType, "BOTH", "User.roleType still holds a legacy vertical");
  assert.equal(String(resolved.roleId), roleId);
  assert.equal(String(resolved.roleTypeId), roleTypeId);
});

test("a Manager cannot assign a role carrying more than they hold", async () => {
  const service = loadAssignmentService({
    roleType: { _id: roleTypeId, name: "Commercial", status: "ACTIVE", legacyRoleType: "COMMERCIAL" },
    role: {
      _id: roleId, name: "Super Executive", status: "ACTIVE", baseRole: "EXECUTIVE",
      roleTypeIds: [roleTypeId], permissions: ["roles.manage"],
    },
    assertGrantablePermissions: async () => {
      const error = new Error("Only an Admin can grant protected permissions (roles.manage)");
      error.statusCode = 403;
      throw error;
    },
  });

  await assert.rejects(
    () => service.resolveRoleAssignment({ companyId, roleTypeId, roleId, actingUser: managerUser }),
    /Only an Admin can grant protected permissions/,
  );
});

test("a Manager may only report new users into their own team, and never re-role themselves", async () => {
  const outsider = loadAssignmentService({ descendants: [] });
  await assert.rejects(
    () => outsider.assertReportingTargetInActorScope({ actingUser: managerUser, parentId: adminId, companyId }),
    /only assign a reporting manager inside your own team/,
  );

  const insider = loadAssignmentService({ descendants: [{ _id: targetUserId }] });
  await insider.assertReportingTargetInActorScope({ actingUser: managerUser, parentId: targetUserId, companyId });
  await insider.assertReportingTargetInActorScope({ actingUser: managerUser, parentId: managerId, companyId });
  // An Admin is unrestricted.
  await outsider.assertReportingTargetInActorScope({ actingUser: adminUser, parentId: targetUserId, companyId });

  assert.throws(
    () => outsider.assertNotSelfPromotion({ actingUser: managerUser, targetUserId: managerId }),
    /cannot change your own role or role type/,
  );
  outsider.assertNotSelfPromotion({ actingUser: managerUser, targetUserId: targetUserId });
  outsider.assertNotSelfPromotion({ actingUser: adminUser, targetUserId: adminId });
});

/* ---------------------------- API page guard ---------------------------- */

const loadPageGuard = (profile) =>
  load("middleware/pageAccess.middleware.js", {
    "../services/access.service": {
      resolveAccessProfile: async () => profile,
      canAccessPage: (accessProfile, pageKey) =>
        accessProfile.isAdmin
        || !accessProfile.enforcePageAccess
        || accessProfile.permissions.includes(`page.${pageKey}.view`),
    },
  });

const runGuard = async (guard, user) => {
  let nextCalled = false;
  const res = {
    code: 200, body: null,
    status(code) { this.code = code; return this; },
    json(body) { this.body = body; return this; },
  };
  await guard({ user }, res, () => { nextCalled = true; });
  return { nextCalled, res };
};

test("the page guard lets unenforced roles through untouched", async () => {
  const guard = loadPageGuard({ isAdmin: false, enforcePageAccess: false, permissions: [] })
    .requirePageAccess("leads", "my_leads");

  const { nextCalled } = await runGuard(guard, { _id: targetUserId, role: "EXECUTIVE" });
  assert.equal(nextCalled, true, "migrated system roles must not lose API access");
});

test("the page guard blocks a restricted role at the API, not just in the UI", async () => {
  const profile = {
    isAdmin: false,
    enforcePageAccess: true,
    permissions: ["page.leads.view", "page.inventory.view", "page.profile.view"],
  };

  const allowed = await runGuard(
    loadPageGuard(profile).requirePageAccess("leads", "my_leads"),
    { _id: targetUserId, role: "EXECUTIVE" },
  );
  assert.equal(allowed.nextCalled, true);

  const denied = await runGuard(
    loadPageGuard(profile).requirePageAccess("chat"),
    { _id: targetUserId, role: "EXECUTIVE" },
  );
  assert.equal(denied.nextCalled, false);
  assert.equal(denied.res.code, 403);
  sameShape(denied.res.body.pages, ["chat"]);
});

/* ------------------------------- migration ------------------------------- */

test("migration seeds Commercial, Residential and Both without touching legacy fields", async () => {
  const createdRoleTypes = [];
  const createdRoles = [];
  const userUpdates = [];

  const catalog = load("services/roleCatalog.service.js", {
    "../models/RoleType": {
      find: () => query([]),
      findOne: () => query(null),
      create: async (doc) => { createdRoleTypes.push(doc); return { ...doc, _id: `rt-${doc.code}` }; },
    },
    "../models/Role": {
      find: () => query([]),
      findOne: () => query(null),
      create: async (doc) => { createdRoles.push(doc); return { ...doc, _id: `r-${doc.baseRole}` }; },
    },
    "../models/User": {
      find: () => query([
        { _id: targetUserId, role: "EXECUTIVE", roleType: "RESIDENTIAL" },
        { _id: adminId, role: "ADMIN", roleType: "BOTH" },
      ]),
      bulkWrite: async (operations) => { userUpdates.push(...operations); },
    },
    "../models/UserRoleAssignment": { insertMany: async () => {} },
  });

  const result = await catalog.ensureTenantRoleCatalog({ companyId, actingUserId: adminId });

  sameShape(result.createdRoleTypes, ["COMMERCIAL", "RESIDENTIAL", "BOTH"]);
  assert.ok(createdRoleTypes.every((doc) => doc.isSystem === true));
  sameShape(
    createdRoleTypes.map((doc) => doc.name),
    ["Commercial", "Residential", "Both"],
  );

  // One system role per built-in role code, minus ADMIN.
  assert.ok(!createdRoles.some((doc) => doc.baseRole === "ADMIN"));
  assert.ok(createdRoles.some((doc) => doc.baseRole === "COWORKING_ADMIN"));
  assert.ok(
    createdRoles.every((doc) => doc.roleTypeIds.length === 3),
    "every migrated role stays available under all three legacy role types",
  );
  assert.ok(
    createdRoles.every((doc) => doc.enforcePageAccess === false),
    "migrated roles must not change what existing accounts can reach",
  );

  // Users are pointed at ids; role and roleType are never rewritten.
  assert.equal(result.backfilledUsers, 2);
  const patches = userUpdates.map((operation) => operation.updateOne.update.$set);
  assert.ok(patches.every((patch) => !("role" in patch) && !("roleType" in patch)));
  assert.equal(String(patches[0].roleTypeId), "rt-RESIDENTIAL");
  assert.equal(String(patches[0].roleId), "r-EXECUTIVE");
  assert.equal(String(patches[1].roleTypeId), "rt-BOTH");
  assert.equal(patches[1].roleId, undefined, "ADMIN has no assignable role record");
});

test("migration is idempotent and adopts a tenant's existing records", async () => {
  const created = [];
  const catalog = load("services/roleCatalog.service.js", {
    "../models/RoleType": {
      find: () => query([
        { _id: "rt1", code: "COMMERCIAL" },
        { _id: "rt2", code: "RESIDENTIAL" },
        { _id: "rt3", code: "BOTH" },
      ]),
      findOne: () => query(null),
      create: async (doc) => { created.push(doc); return doc; },
    },
    "../models/Role": {
      find: () => query(
        Object.values(require("../src/constants/role.constants").USER_ROLES)
          .filter((role) => role !== "ADMIN")
          .map((role) => ({ _id: `r-${role}`, baseRole: role, isSystem: true })),
      ),
      findOne: () => query(null),
      create: async (doc) => { created.push(doc); return doc; },
    },
    "../models/User": { find: () => query([]), bulkWrite: async () => {} },
    "../models/UserRoleAssignment": { insertMany: async () => {} },
  });

  const result = await catalog.ensureTenantRoleCatalog({ companyId });

  sameShape(result.createdRoleTypes, []);
  sameShape(result.createdRoles, []);
  assert.equal(result.backfilledUsers, 0);
  assert.equal(created.length, 0, "a second run writes nothing");
});

/* --------------------- create user: dependent selection --------------------- */

const loadUserController = ({ assignment, created = [] }) =>
  load("controllers/user.controller.js", {
    mongoose: mongooseStub,
    "../models/User": {
      // The email-uniqueness check must miss; the reporting-parent lookup must hit.
      findOne: (filter = {}) => query(filter.email !== undefined
        ? null
        : { _id: managerId, role: "MANAGER" }),
      create: async (doc) => { created.push(doc); return { ...doc, _id: targetUserId }; },
    },
    "../models/Lead": {},
    "../models/Inventory": {},
    "../models/UserDeleteRequest": {},
    "../models/leadActivity.model": {},
    "../models/leadDiary.model": {},
    "../config/logger": { error: () => {}, warn: () => {}, info: () => {} },
    "../services/leadAssignment.service": { redistributePipelineLeads: async () => {} },
    "../services/hierarchy.service": {
      getDescendantUsers: async () => [],
      getDescendantExecutiveIds: async () => [],
      getDescendantByRoleCount: async () => 0,
      getFirstLevelChildrenByRole: async () => [],
    },
    "../services/userRoleAssignment.service": {
      resolveRoleAssignment: async () => assignment,
      assertReportingTargetInActorScope: async () => {},
      assertNotSelfPromotion: () => {},
      recordAssignment: async () => {},
      auditAssignmentChange: async () => {},
    },
  });

const response = () => ({
  code: 200, body: null,
  status(code) { this.code = code; return this; },
  json(body) { this.body = body; return this; },
});

test("create user stores the role type and role ids alongside the legacy fields", async () => {
  const created = [];
  const controller = loadUserController({
    created,
    assignment: {
      role: "COMMUNITY_MANAGER",
      roleType: "BOTH",
      roleTypeId,
      roleId,
      roleDoc: { name: "Community Manager" },
      roleTypeDoc: { name: "Coworking" },
    },
  });

  const res = response();
  await controller.createUserByRole({
    body: {
      name: "Riya",
      email: "riya@example.com",
      phone: "9000000000",
      password: "secret123",
      // The form posts ids only — no role or roleType string in sight.
      roleTypeId,
      roleId,
      reportingToId: managerId,
    },
    user: { _id: adminId, companyId, role: "ADMIN" },
  }, res);

  assert.equal(res.code, 201);
  assert.equal(created.length, 1);
  assert.equal(created[0].role, "COMMUNITY_MANAGER", "legacy role comes from the role's base role");
  assert.equal(created[0].roleType, "BOTH", "legacy vertical comes from the role type");
  assert.equal(String(created[0].roleTypeId), roleTypeId);
  assert.equal(String(created[0].roleId), roleId);
  assert.equal(String(created[0].companyId), companyId);
});

test("create user surfaces an assignment refusal as its own status code", async () => {
  const controller = load("controllers/user.controller.js", {
    mongoose: mongooseStub,
    "../models/User": { findOne: () => query(null), create: async () => ({}) },
    "../models/Lead": {},
    "../models/Inventory": {},
    "../models/UserDeleteRequest": {},
    "../models/leadActivity.model": {},
    "../models/leadDiary.model": {},
    "../config/logger": { error: () => {}, warn: () => {}, info: () => {} },
    "../services/leadAssignment.service": { redistributePipelineLeads: async () => {} },
    "../services/hierarchy.service": {
      getDescendantUsers: async () => [],
      getDescendantExecutiveIds: async () => [],
      getDescendantByRoleCount: async () => 0,
      getFirstLevelChildrenByRole: async () => [],
    },
    "../services/userRoleAssignment.service": {
      resolveRoleAssignment: async () => {
        const error = new Error("Role \"Super Executive\" does not belong to role type \"Commercial\"");
        error.statusCode = 400;
        throw error;
      },
      assertReportingTargetInActorScope: async () => {},
      assertNotSelfPromotion: () => {},
      recordAssignment: async () => {},
      auditAssignmentChange: async () => {},
    },
  });

  const res = response();
  await controller.createUserByRole({
    body: { name: "X", email: "x@example.com", password: "secret123", roleTypeId, roleId },
    user: { _id: managerId, companyId, role: "MANAGER" },
  }, res);

  assert.equal(res.code, 400, "a validation refusal must not surface as a 500");
  assert.match(res.body.message, /does not belong to role type/);
});

/* ------------------------- cache invalidation ------------------------- */

test("role and role type writes clear the cached access profiles", async () => {
  let cleared = 0;

  const roleTypeService = load("services/roleType.service.js", {
    mongoose: mongooseStub,
    "../models/RoleType": {
      findOne: (filter = {}) => query(filter.normalizedName !== undefined
        ? null
        : {
          _id: roleTypeId, name: "Coworking", normalizedName: "coworking", code: "COWORKING",
          status: "ACTIVE", isSystem: false, legacyRoleType: "COMMERCIAL", save: async () => {},
        }),
      find: () => query([]),
      create: async (doc) => ({ ...doc, _id: roleTypeId }),
      deleteOne: async () => ({ deletedCount: 1 }),
    },
    "../models/Role": { countDocuments: async () => 0, find: () => query([]), aggregate: async () => [] },
    "../models/User": { countDocuments: async () => 0, find: () => query([]), aggregate: async () => [] },
    "../models/AuditLog": { find: () => query([]) },
    "./auditLog.service": auditStub,
    "./access.service": {
      isAdminRole: (role) => role === "ADMIN",
      invalidateAccessCache: () => { cleared += 1; },
    },
  });

  await roleTypeService.setRoleTypeStatus({
    companyId, roleTypeId, status: "INACTIVE", actingUser: adminUser,
  });
  assert.equal(cleared, 1, "deactivating a role type must not serve stale permissions");

  await roleTypeService.updateRoleType({
    companyId, roleTypeId, payload: { name: "Coworking Ops" }, actingUser: adminUser,
  });
  assert.equal(cleared, 2);
});

/* ------------- page access widens as well as narrows ------------- */

const loadModuleGate = (profile) =>
  load("middleware/pageAccess.middleware.js", {
    "../services/access.service": {
      resolveAccessProfile: async () => profile,
      canAccessPage: (accessProfile, pageKey) =>
        accessProfile.isAdmin
        || !accessProfile.enforcePageAccess
        || accessProfile.permissions.includes(`page.${pageKey}.view`),
    },
  });

test("a configured role reaches a module its built-in role never had", async () => {
  // A Production Executive is not in the projects module's role list, but an
  // Admin has granted the role the Projects page.
  const guard = loadModuleGate({
    isAdmin: false,
    enforcePageAccess: true,
    permissions: ["page.projects.view", "page.tasks.view", "page.profile.view"],
  }).checkRoleOrPageAccess(["ADMIN", "MANAGER", "EXECUTIVE"], "projects");

  const granted = await runGuard(guard, { _id: targetUserId, role: "PRODUCTION_EXECUTIVE" });
  assert.equal(granted.nextCalled, true, "the grant has to reach the API, not just the sidebar");
});

test("an unconfigured role cannot widen into a module", async () => {
  // Same base role, but no explicit page configuration: the built-in role list
  // is still the only answer, so nothing changes for legacy accounts.
  const guard = loadModuleGate({
    isAdmin: false,
    enforcePageAccess: false,
    permissions: ["page.projects.view"],
  }).checkRoleOrPageAccess(["ADMIN", "MANAGER", "EXECUTIVE"], "projects");

  const denied = await runGuard(guard, { _id: targetUserId, role: "PRODUCTION_EXECUTIVE" });
  assert.equal(denied.nextCalled, false);
  assert.equal(denied.res.code, 403);
});

test("a configured role without the grant is still refused, and listed roles always pass", async () => {
  const withoutGrant = loadModuleGate({
    isAdmin: false,
    enforcePageAccess: true,
    permissions: ["page.tasks.view"],
  }).checkRoleOrPageAccess(["ADMIN", "MANAGER"], "projects");

  const denied = await runGuard(withoutGrant, { _id: targetUserId, role: "PRODUCTION_EXECUTIVE" });
  assert.equal(denied.res.code, 403);

  // A role on the built-in list is admitted without consulting the profile at
  // all, so this path cannot regress for existing accounts.
  const exploding = load("middleware/pageAccess.middleware.js", {
    "../services/access.service": {
      resolveAccessProfile: async () => { throw new Error("must not be consulted"); },
      canAccessPage: () => false,
    },
  }).checkRoleOrPageAccess(["ADMIN", "MANAGER"], "projects");

  const allowed = await runGuard(exploding, { _id: managerId, role: "MANAGER" });
  assert.equal(allowed.nextCalled, true);
});

/* ---------- granted pages also have to return data, not 403 ---------- */

const leadObjectId = "222222222222222222222222";

const loadLeadScope = (profile) =>
  load(
    "controllers/lead.controller.js",
    {
      "../models/Lead": {},
      "../models/User": {},
      "../models/Inventory": {},
      "../models/leadActivity.model": {},
      "../models/leadDiary.model": {},
      "../models/LeadStatusRequest": {},
      "../config/logger": { error: () => {}, warn: () => {}, info: () => {} },
      "../services/access.service": { resolveAccessProfile: async () => profile },
      "../services/leadAssignment.service": { autoAssignLead: async () => null },
      "../services/hierarchy.service": {
        getAncestorByRoles: async () => null,
        getDescendantExecutiveIds: async () => [],
      },
    },
    "\nmodule.exports.testLeadScope = buildLeadQueryForUser;",
  ).testLeadScope;

const productionUser = {
  _id: leadObjectId,
  companyId,
  role: "PRODUCTION_EXECUTIVE",
  roleType: "BOTH",
};

test("a role never granted the Leads page is still refused", async () => {
  const scope = await loadLeadScope({
    enforcePageAccess: false,
    permissions: ["page.leads.view"],
    dataScope: "ALL",
  })(productionUser);

  assert.equal(scope, null, "an unconfigured role must keep the behaviour it had");
});

test("a role granted the Leads page gets its own records instead of Access denied", async () => {
  const scope = await loadLeadScope({
    enforcePageAccess: true,
    permissions: ["page.leads.view", "page.profile.view"],
    dataScope: "ASSIGNED",
  })(productionUser);

  assert.notEqual(scope, null, "the grant has to produce a query, not a 403");
  assert.equal(String(scope.companyId), companyId);
  assert.equal(scope.$or.length, 2, "assigned to me, or created by me");
  assert.equal(String(scope.$or[0].assignedTo), String(productionUser._id));
  assert.equal(String(scope.$or[1].createdBy), String(productionUser._id));
});

test("an explicit ALL data scope widens the granted role to the whole tenant", async () => {
  const scope = await loadLeadScope({
    enforcePageAccess: true,
    permissions: ["page.my_leads.view"],
    dataScope: "ALL",
  })(productionUser);

  assert.equal(String(scope.companyId), companyId);
  assert.equal(scope.$or, undefined, "ALL is an instruction only an Admin can set");
});

test("built-in lead roles are unaffected by the grant path", async () => {
  // The profile says "no access"; an EXECUTIVE must still get its own scope
  // from the branch above, never from the new fallback.
  const scope = await loadLeadScope({
    enforcePageAccess: false,
    permissions: [],
    dataScope: "SELF",
  })({ _id: leadObjectId, companyId, role: "EXECUTIVE", roleType: "BOTH" });

  assert.equal(String(scope.assignedTo), String(leadObjectId));
});

const loadInventoryScope = (profile) =>
  load(
    "services/inventoryWorkflow.service.js",
    {
      "../models/User": { findOne: () => query(null) },
      "./access.service": { resolveAccessProfile: async () => profile },
    },
    "\nmodule.exports.testInventoryScope = getInventoryScopeQueryForUser;",
  ).testInventoryScope;

test("inventory refuses an ungranted role and scopes a granted one", async () => {
  const ungranted = loadInventoryScope({
    enforcePageAccess: false,
    permissions: ["page.inventory.view"],
  });
  await assert.rejects(() => ungranted(productionUser), /Access denied/);

  const granted = loadInventoryScope({
    enforcePageAccess: true,
    permissions: ["page.inventory.view"],
  });
  const scope = await granted({ ...productionUser, roleType: "COMMERCIAL" });

  assert.equal(String(scope.companyId), companyId);
  assert.equal(
    scope.inventoryType,
    "COMMERCIAL",
    "the account's vertical still narrows what it sees",
  );
});
