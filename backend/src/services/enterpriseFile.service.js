const Upload = require("../models/EnterpriseUpload");
const PREFIX = "/api/uploads/files/enterprise-documents/";
const validUrl = (url) => typeof url === "string" && url.startsWith(PREFIX)
  && /^[a-zA-Z0-9_-][a-zA-Z0-9._-]{0,254}$/.test(url.slice(PREFIX.length))
  && !url.slice(PREFIX.length).includes("..");

const ownsFile = async (companyId, url) => {
  if (!companyId || !validUrl(url)) return false;
  const uploaded = await Upload.findOne({ url }).select("companyId").lean();
  if (uploaded) return String(uploaded.companyId) === String(companyId);
  // Existing protected files retain access through their original records.
  const [document, payment, ledger] = await Promise.all([
    require("../models/EnterpriseDocument").exists({ companyId, "versions.url": url }),
    require("../models/EnterpriseTransaction").exists({ companyId, "attachments.url": url }),
    require("../models/EnterpriseLedgerEntry").exists({ companyId, $or: [{ "attachments.url": url }, { proofUrl: url }] }),
  ]);
  return Boolean(document || payment || ledger);
};

const assertFiles = async (user, files) => {
  for (const file of files || []) {
    if (!(await ownsFile(user.companyId, file.url))) {
      throw Object.assign(new Error("Upload a protected Enterprise file belonging to this company"), { statusCode: 403 });
    }
  }
};

module.exports = { validUrl, ownsFile, assertFiles };
