exports.resolveTenantContext = (req, _res, next) => {
  req.tenant = null;
  req.tenantHost = "";
  req.tenantSubdomain = "";
  req.tenantSource = "single-client";
  return next();
};
