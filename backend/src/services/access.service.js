const mongoose = require("mongoose");
const Role = require("../models/Role");
const RolePermission = require("../models/RolePermission");
const { USER_ROLES } = require("../constants/role.constants");
const {
  PERMISSIONS,
  getDefaultPermissionsForRole,
  isValidPermission,
  isAdminProtectedPermission,
} = require("../constants/permission.constants");
const {
  CRM_PAGES,
  ALWAYS_ACCESSIBLE_PAGE_KEYS,
  isValidPageKey,
  isValidPageAction,
  toPagePermission,
  toPagePermissions,
  buildFullPageAccess,
} = require("../constants/page.constants");
const {
  getDefaultPageAccessForRole,
  getDefaultDataScopeForRole,
} = require("../constants/rolePageAccess.constants");
const { createHttpError } = require("../utils/httpError");
const { createTtlCache } = require("../utils/ttlCache");

// The API page guard resolves a profile on every guarded request, so without a
// cache this would add two reads (RolePermission + Role) to every leads, task
// and inventory call. Same short-TTL treatment the company status check in
// auth.middleware already uses; role and permission writes clear it outright.
const accessProfileCache = createTtlCache({
  ttlMs: process.env.ACCESS_PROFILE_CACHE_TTL_MS || 30000,
  maxEntries: process.env.ACCESS_PROFILE_CACHE_MAX_ENTRIES || 2000,
});

const invalidateAccessCache = () => accessProfileCache.clear();

// Single resolution point for "what may this account actually do".
//
// Effective permissions are the union of three layers, in this order:
//   1. the legacy per-USER_ROLES default (permission.constants)
//   2. the per-company RolePermission override, when one exists
//   3. the dynamic Role document the user is assigned to, when one exists
//
// The union only ever adds, so an account that predates the Role Type work
// keeps exactly the access it had. ADMIN bypasses all of it, matching the
// existing ADMIN-is-tenant-root convention used across the codebase.

const isAdminRole = (role) => role === USER_ROLES.ADMIN;
const isValidObjectId = (value) => mongoose.Types.ObjectId.isValid(value);

const toId = (value) => {
  if (!value) return "";
  if (typeof value === "string") return value;
  return String(value._id || value);
};

const resolveLegacyPermissions = async ({ companyId, role }) => {
  if (isAdminRole(role)) return [...PERMISSIONS];

  const override = await RolePermission.findOne({ companyId, role })
    .select("permissions")
    .lean();
  if (override) return override.permissions || [];

  return getDefaultPermissionsForRole(role);
};

const normalizePageEntries = (pages = []) =>
  pages
    .map((entry) => ({
      pageKey: String(entry?.pageKey || "").trim(),
      actions: Array.isArray(entry?.actions) ? entry.actions : [],
    }))
    .filter((entry) => isValidPageKey(entry.pageKey))
    .map((entry) => ({
      pageKey: entry.pageKey,
      actions: [
        ...new Set(
          ["view", ...entry.actions].filter((action) =>
            isValidPageAction(entry.pageKey, action)),
        ),
      ],
    }));

// Pages every signed-in account keeps no matter what a role says — the spec's
// "Profile and Logout stay reachable" rule.
const withAlwaysAccessiblePages = (pages) => {
  const byKey = new Map(pages.map((entry) => [entry.pageKey, entry]));

  ALWAYS_ACCESSIBLE_PAGE_KEYS.forEach((pageKey) => {
    if (byKey.has(pageKey)) return;
    byKey.set(pageKey, { pageKey, actions: ["view"] });
  });

  return [...byKey.values()];
};

const loadAssignedRole = async (user) => {
  const roleId = toId(user?.roleId);
  if (!roleId || !isValidObjectId(roleId)) return null;

  return Role.findOne({ _id: roleId, companyId: user.companyId })
    .select(
      "_id name code baseRole roleTypeIds pages permissions dataScope status enforcePageAccess reportingRoleId",
    )
    .lean();
};

const buildAccessProfile = async (user) => {
  const baseRole = user?.role || "";
  const companyId = user?.companyId || null;

  if (isAdminRole(baseRole)) {
    const pages = buildFullPageAccess();
    return {
      role: baseRole,
      baseRole,
      isAdmin: true,
      roleId: null,
      roleTypeId: toId(user?.roleTypeId) || null,
      roleName: "Admin",
      permissions: [...PERMISSIONS, ...toPagePermissions(pages)],
      pages,
      dataScope: "ALL",
      // Nothing to enforce: an ADMIN reaches every page by definition.
      enforcePageAccess: false,
      hasDynamicRole: false,
    };
  }

  const [legacyPermissions, assignedRole] = await Promise.all([
    companyId ? resolveLegacyPermissions({ companyId, role: baseRole }) : [],
    loadAssignedRole(user),
  ]);

  // An inactive role must not silently strip access mid-session; it stops the
  // role being *assigned* (see role.service) rather than locking out accounts
  // that already hold it, so fall back to the legacy defaults for its base role.
  const roleIsUsable = assignedRole && assignedRole.status === "ACTIVE";

  const pages = withAlwaysAccessiblePages(
    normalizePageEntries(
      roleIsUsable && assignedRole.pages?.length
        ? assignedRole.pages
        : getDefaultPageAccessForRole(baseRole),
    ),
  );

  const permissions = [
    ...new Set([
      ...legacyPermissions,
      ...(roleIsUsable ? assignedRole.permissions || [] : []),
      ...toPagePermissions(pages),
    ]),
  ];

  return {
    role: baseRole,
    baseRole,
    isAdmin: false,
    roleId: roleIsUsable ? String(assignedRole._id) : null,
    roleTypeId: toId(user?.roleTypeId) || null,
    roleName: roleIsUsable ? assignedRole.name : "",
    permissions,
    pages,
    dataScope: roleIsUsable
      ? assignedRole.dataScope
      : getDefaultDataScopeForRole(baseRole),
    enforcePageAccess: Boolean(roleIsUsable && assignedRole.enforcePageAccess),
    hasDynamicRole: Boolean(roleIsUsable),
  };
};

/**
 * Full access profile for one account: permissions, page access, data scope and
 * whether the API page guard applies. Used by GET /api/access/me, by the page
 * guard middleware and by the escalation checks in the role services.
 *
 * Cached per (company, base role, assigned role) — the three inputs the answer
 * actually depends on — rather than per user.
 */
const resolveAccessProfile = async (user) => {
  const cacheKey = [
    String(user?.companyId || ""),
    String(user?.role || ""),
    String(user?.roleId?._id || user?.roleId || ""),
    String(user?.roleTypeId?._id || user?.roleTypeId || ""),
  ].join("|");

  const cached = accessProfileCache.get(cacheKey);
  if (cached) return cached;

  const profile = await buildAccessProfile(user);
  accessProfileCache.set(cacheKey, profile);
  return profile;
};

const resolveEffectivePermissions = async ({ companyId, role, user }) => {
  if (user) {
    const profile = await resolveAccessProfile(user);
    return profile.permissions;
  }
  return resolveLegacyPermissions({ companyId, role });
};

const hasPermission = async (user, permission) => {
  if (isAdminRole(user?.role)) return true;
  if (!user?.companyId) {
    throw createHttpError(403, "Company context is required");
  }
  const profile = await resolveAccessProfile(user);
  return profile.permissions.includes(permission);
};

const canAccessPage = (profile, pageKey) =>
  profile.isAdmin
  || !profile.enforcePageAccess
  || profile.permissions.includes(toPagePermission(pageKey, "view"));

/* ------------------------------------------------------------------ *
 * Privilege-escalation guards
 *
 * Everything below answers one question: may THIS actor hand out THAT
 * capability? An ADMIN always may. Anyone else may only grant what they
 * already hold, and may never grant an admin-protected permission — which is
 * what stops an authorized Manager from minting an admin-equivalent role or
 * promoting themselves.
 * ------------------------------------------------------------------ */

const getActorPermissionSet = async (actor) => {
  const profile = await resolveAccessProfile(actor);
  return { profile, permissionSet: new Set(profile.permissions) };
};

const assertGrantablePermissions = async ({ actor, permissions = [] }) => {
  const unknown = permissions.filter((permission) => !isValidPermission(permission));
  if (unknown.length) {
    throw createHttpError(400, `Unknown permission: ${unknown[0]}`);
  }

  if (isAdminRole(actor?.role)) return;

  const protectedGrants = permissions.filter((permission) =>
    isAdminProtectedPermission(permission));
  if (protectedGrants.length) {
    throw createHttpError(
      403,
      `Only an Admin can grant protected permissions (${protectedGrants.join(", ")})`,
    );
  }

  const { permissionSet } = await getActorPermissionSet(actor);
  const beyondActor = permissions.filter((permission) => !permissionSet.has(permission));
  if (beyondActor.length) {
    throw createHttpError(
      403,
      `You cannot grant permissions you do not hold yourself (${beyondActor.join(", ")})`,
    );
  }
};

const assertGrantablePages = async ({ actor, pages = [] }) => {
  if (isAdminRole(actor?.role)) return;

  const { permissionSet } = await getActorPermissionSet(actor);
  const beyondActor = [];

  normalizePageEntries(pages).forEach((entry) => {
    entry.actions.forEach((action) => {
      const permission = toPagePermission(entry.pageKey, action);
      if (!permissionSet.has(permission)) beyondActor.push(permission);
    });
  });

  if (beyondActor.length) {
    throw createHttpError(
      403,
      `You cannot grant access to pages or actions you do not have yourself (${beyondActor
        .slice(0, 3)
        .join(", ")})`,
    );
  }
};

module.exports = {
  CRM_PAGES,
  invalidateAccessCache,
  isAdminRole,
  normalizePageEntries,
  withAlwaysAccessiblePages,
  resolveLegacyPermissions,
  resolveAccessProfile,
  resolveEffectivePermissions,
  hasPermission,
  canAccessPage,
  getActorPermissionSet,
  assertGrantablePermissions,
  assertGrantablePages,
};
