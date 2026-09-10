const { resolveAccessProfile, canAccessPage } = require("../services/access.service");

const normalizeRole = (value) => String(value || "").trim().toUpperCase();

// Enforce employee page selections on API route groups. Accounts using
// defaults keep the existing role gates. Any listed page satisfies a group.
exports.requirePageAccess = (...pageKeys) => async (req, res, next) => {
  try {
    if (!req.user) return next();

    const profile = await resolveAccessProfile(req.user);
    if (!profile.enforcePageAccess) return next();

    const allowed = pageKeys.some((pageKey) => canAccessPage(profile, pageKey));
    if (allowed) return next();

    return res.status(403).json({
      message: "Your account does not have access to this page",
      pages: pageKeys,
    });
  } catch (error) {
    return res.status(error.statusCode || 500).json({
      message: error.statusCode ? error.message : "Server error",
    });
  }
};

// An explicit employee page grant can open a module outside their built-in
// role. Per-action permissions and data scope remain independently enforced.
exports.checkRoleOrPageAccess = (roles, ...pageKeys) => async (req, res, next) => {
  const userRole = normalizeRole(req.user?.role);
  const allowedRoles = roles.map(normalizeRole);

  if (allowedRoles.includes(userRole)) return next();

  try {
    const profile = await resolveAccessProfile(req.user);
    // Only an account that explicitly declares page access can widen this way;
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
