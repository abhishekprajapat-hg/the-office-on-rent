/*
 * Coworking client and cabin documents (requirements 16 Oct 2026, sections 09
 * and 18.1): only an Admin (founder / main admin) or an account an Admin has
 * marked "may download client documents" can fetch these files. Everyone else
 * is refused at the file endpoint itself, so a copied URL or a direct request
 * gets nothing. No public links are minted for them.
 */
const User = require("../models/User");
const { writeAuditLog } = require("./auditLog.service");

const PROTECTED_PREFIXES = Object.freeze(["coworking-documents/", "coworking-clients/", "coworking-contracts/", "enterprise-documents/"]);

const isProtectedClientDocument = (relativePath) => {
  const clean = String(relativePath || "").replace(/^\/+/, "").toLowerCase();
  return PROTECTED_PREFIXES.some((prefix) => clean.startsWith(prefix));
};

/*
 * Broker / channel partner KYC (Aadhaar, PAN): only Admin and Manager, the
 * people who onboard a CP, can open these. Never a per-URL token.
 */
const isBrokerKycDocument = (relativePath) => String(relativePath || "").replace(/^\/+/, "").toLowerCase().startsWith("broker-kyc/");
const canOpenBrokerKyc = (user) => Boolean(user && user.isActive !== false && ["ADMIN", "MANAGER"].includes(user.role));

const canDownloadClientDocuments = (user) => Boolean(
  user && user.isActive !== false && (user.role === "ADMIN" || user.canDownloadClientDocuments === true),
);

const loadUserForFileAccess = async (userId) => {
  if (!userId) return null;
  return User.findById(userId).select("_id role companyId isActive canDownloadClientDocuments name").lean();
};

// The same file is often fetched twice in a row (preview, then save); one
// audit row per person per file per minute is enough.
const recent = new Map();
const logDownload = async ({ user, path, req }) => {
  const key = `${user._id}:${path}`;
  const now = Date.now();
  if (recent.has(key) && now - recent.get(key) < 60000) return;
  recent.set(key, now);
  if (recent.size > 5000) recent.clear();
  await writeAuditLog({
    companyId: user.companyId,
    actor: user,
    action: path.toLowerCase().startsWith("enterprise-documents/") ? "ENTERPRISE_DOCUMENT_DOWNLOADED" : "COWORKING_DOCUMENT_DOWNLOADED",
    entityType: path.toLowerCase().startsWith("enterprise-documents/") ? "EnterpriseDocument" : "CoworkingDocument",
    entityId: path,
    metadata: { path },
    req,
  });
};

module.exports = {
  PROTECTED_PREFIXES,
  isProtectedClientDocument,
  isBrokerKycDocument,
  canOpenBrokerKyc,
  canDownloadClientDocuments,
  loadUserForFileAccess,
  logDownload,
};
