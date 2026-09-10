const { resolveAccessProfile, canAccessPage } = require("../services/access.service");

const normalizeRole = (value) => String(value || "").trim().toUpperCase();

// Server-side enforcement of a Role's page access, so hiding a nav item in the
// frontend is never the only thing standing between an account and an API.
//
// Deliberately opt-in per role: `enforcePageAccess` is false on the system roles
// the migration seeds, so accounts that predate the Role Type work keep exactly
// the API surface they already had. It turns on for roles created through the
// Role Types UI and for system roles whose page access an Admin has edited.
//
// Mounted with the page keys that satisfy a route group; access to any one of
// them is enough (e.g. /api/leads serves both the "leads" and "my_leads" pages).
exports.requirePageAccess = (...pageKeys) => async (req, res, next) => {
  try {
    if (!req.user) return next();

    const profile = await resolveAccessProfile(req.user);
    if (!profile.enforcePageAccess) return next();

    const allowed = pageKeys.some((pageKey) => canAccessPage(profile, pageKey));
    if (allowed) return next();

    return res.status(403).json({
      message: "Your role does not have access to this page",
      pages: pageKeys,
    });
  } catch (error) {
    return res.status(error.statusCode || 500).json({
      message: error.statusCode ? error.message : "Server error",
    });
  }
};

/**
 * Router-level module gate that a configured role can satisfy on its own.
 *
 * The built-in `roles` list is still the answer for every account whose role
 * carries no explicit page configuration. But once an Admin has granted a role
 * a page, that grant is the authority: a Production Executive given Projects
 * has to be able to call /api/projects, or the grant is decorative.
 *
 * This replaces `checkRole(...)` only where it guards "may you enter this
 * module at all". Per-route checkRole calls protecting privileged actions
 * inside a module (approvals, admin-only writes) are deliberately untouched.
 */
exports.checkRoleOrPageAccess = (roles, ...pageKeys) => async (req, res, next) => {
  const userRole = normalizeRole(req.user?.role);
  const allowedRoles = roles.map(normalizeRole);

  if (allowedRoles.includes(userRole)) return next();

  try {
    const profile = await resolveAccessProfile(req.user);
    // Only a role that actually declares page access can widen this way;
    // otherwise an unconfigured role would inherit its base role's defaults
    // and quietly gain modules it never had.
    if (profile.enforcePageAccess
      && pageKeys.some((pageKey) => canAccessPage(profile, pageKey))) {
      return next();
    }
  } catch {
    // Fall through to the same denial the role check would have produced.
  }

  return res.status(403).json({ message: "Access denied" });
};
