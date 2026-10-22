const express = require("express");
const router = express.Router();
const authMiddleware = require("../middleware/auth.middleware");
const companyMiddleware = require("../middleware/company.middleware");
const checkRole = require("../middleware/role.middleware");
const { writeLimiter } = require("../middleware/rateLimit.middleware");
const userPageAccess = require("../controllers/userPageAccess.controller");
const rolePermission = require("../controllers/rolePermission.controller");
const { resolveAccessProfile } = require("../services/access.service");

router.use(authMiddleware.protect);
router.use(companyMiddleware.requireCompanyContext);
router.use(companyMiddleware.enforceBodyCompanyMatch());

router.get("/me", async (req, res) => {
  try {
    const docs = require("../services/documentAccess.service");
    return res.json({
      access: await resolveAccessProfile(req.user),
      // Requirements 16 Oct 2026, section 09.
      canDownloadClientDocuments: docs.canDownloadClientDocuments(req.user),
    });
  } catch (error) {
    req.log?.error({ error: error.message }, "Access profile failed");
    return res.status(500).json({ message: "Unable to load page access" });
  }
});
/*
 * Roles and per-person page access, company-wide.
 *
 * A Manager can do everything an Admin can except delete (business rule,
 * 29 Sep 2026), so both screens are open to Managers too. What a Manager may
 * change is narrower, and enforced where the change is made:
 *   - never an Admin, never a Manager (themselves included), never the
 *     Manager role - only an Admin sets what Managers reach;
 *   - never a grant they do not hold themselves, an admin-protected
 *     permission, or a delete (see assertGrantablePermissions).
 */
const ACCESS_EDITOR_ROLES = ["ADMIN", "MANAGER"];
router.get("/roles", checkRole(ACCESS_EDITOR_ROLES), rolePermission.listRoles);
router.patch("/roles/:role", writeLimiter, checkRole(ACCESS_EDITOR_ROLES), rolePermission.updateRole);
router.get("/users/:userId/pages", checkRole(ACCESS_EDITOR_ROLES), userPageAccess.handle());
router.patch("/users/:userId/pages", writeLimiter, checkRole(ACCESS_EDITOR_ROLES), userPageAccess.handle(true));

/*
 * Who may download coworking client documents (section 09). Admin only: a
 * Manager cannot grant this, not even to themselves. Audited.
 */
router.get("/document-downloaders", checkRole(["ADMIN"]), async (req, res) => {
  try {
    const User = require("../models/User");
    const users = await User.find({ companyId: req.user.companyId, isActive: true, role: { $ne: "ADMIN" } })
      .select("_id name email role canDownloadClientDocuments").sort({ name: 1 }).lean();
    return res.json({ users: users.map((u) => ({ ...u, canDownloadClientDocuments: Boolean(u.canDownloadClientDocuments) })) });
  } catch (error) {
    req.log?.error({ error: error.message }, "document-downloaders failed");
    return res.status(500).json({ message: "Unable to load" });
  }
});
router.patch("/users/:userId/document-download", writeLimiter, checkRole(["ADMIN"]), async (req, res) => {
  try {
    const User = require("../models/User");
    const { writeAuditLog } = require("../services/auditLog.service");
    if (!/^[a-f0-9]{24}$/i.test(req.params.userId)) return res.status(400).json({ message: "Invalid user" });
    if (typeof req.body?.allowed !== "boolean") return res.status(400).json({ message: "allowed must be true or false" });
    const user = await User.findOneAndUpdate(
      { _id: req.params.userId, companyId: req.user.companyId, role: { $ne: "ADMIN" } },
      { $set: { canDownloadClientDocuments: req.body.allowed } },
      { returnDocument: "after" },
    ).select("_id name role canDownloadClientDocuments");
    if (!user) return res.status(404).json({ message: "User not found" });
    await writeAuditLog({
      companyId: req.user.companyId, actor: req.user, action: "CLIENT_DOCUMENT_DOWNLOAD_ACCESS_CHANGED",
      entityType: "User", entityId: user._id, metadata: { name: user.name, allowed: req.body.allowed }, req,
    });
    return res.json({ user });
  } catch (error) {
    req.log?.error({ error: error.message }, "document-download toggle failed");
    return res.status(500).json({ message: "Unable to save" });
  }
});

module.exports = router;
