const express = require("express");
const router = express.Router();

const userController = require("../controllers/user.controller");
const authMiddleware = require("../middleware/auth.middleware");
const { requirePageAction } = require("../middleware/pageAccess.middleware");
const { writeLimiter } = require("../middleware/rateLimit.middleware");

router.get(
  "/",
  authMiddleware.protect,
  userController.getUsers
);

router.get(
  "/leaderboard",
  authMiddleware.protect,
  userController.getRoleLeaderboard
);

router.post(
  "/create",
  writeLimiter,
  authMiddleware.protect,
  userController.createUserByRole
);

router.get(
  "/my-team",
  authMiddleware.protect,
  userController.getMyTeam
);

router.get(
  "/profile",
  authMiddleware.protect,
  userController.getMyProfile
);

router.get(
  "/:userId/profile",
  authMiddleware.protect,
  userController.getUserProfileForAdmin
);

router.patch(
  "/:userId/designation",
  writeLimiter,
  authMiddleware.protect,
  userController.updateUserDesignation
);

router.patch(
  "/:userId/channel-partner/inventory-access",
  writeLimiter,
  authMiddleware.protect,
  userController.updateChannelPartnerInventoryAccess
);

router.patch(
  "/profile",
  writeLimiter,
  authMiddleware.protect,
  requirePageAction("edit", "profile"),
  userController.updateMyProfile
);

router.get(
  "/delete-requests/admin",
  authMiddleware.protect,
  userController.getAdminUserDeleteRequests
);

router.patch(
  "/delete-requests/:requestId/review",
  writeLimiter,
  authMiddleware.protect,
  userController.reviewUserDeleteRequest
);

router.patch(
  "/location",
  authMiddleware.protect,
  userController.updateMyLocation
);

router.patch(
  "/admin/:userId",
  writeLimiter,
  authMiddleware.protect,
  userController.updateUserByAdmin
);

router.post(
  "/:userId/delete-request",
  writeLimiter,
  authMiddleware.protect,
  userController.createUserDeleteRequest
);

router.patch(
  "/:userId",
  writeLimiter,
  authMiddleware.protect,
  userController.updateUserByRole
);

router.get(
  "/field-locations",
  authMiddleware.protect,
  userController.getFieldExecutiveLocations
);

router.post(
  "/rebalance-executives",
  writeLimiter,
  authMiddleware.protect,
  userController.rebalanceExecutives
);

/*
 * Section 10 handover: what someone still has open, and moving it to a named
 * colleague when they change segment or role. Admin and Manager only;
 * every move is audited.
 */
const handover = require("../services/handover.service");
const checkRole = require("../middleware/role.middleware");
const { writeAuditLog } = require("../services/auditLog.service");
router.get("/:userId/open-records", authMiddleware.protect, checkRole(["ADMIN", "MANAGER"]), async (req, res) => {
  try {
    if (!/^[a-f0-9]{24}$/i.test(req.params.userId)) return res.status(400).json({ message: "Invalid user" });
    return res.json(await handover.getOpenRecords({ companyId: req.user.companyId, userId: req.params.userId }));
  } catch (error) {
    req.log?.error?.({ error: error.message }, "open-records failed");
    return res.status(500).json({ message: "Couldn't load open work" });
  }
});
router.post("/:userId/handover", writeLimiter, authMiddleware.protect, checkRole(["ADMIN", "MANAGER"]), async (req, res) => {
  try {
    const result = await handover.transferRecords({
      companyId: req.user.companyId,
      fromId: req.params.userId,
      toId: req.body?.toUserId,
      include: req.body?.include,
      note: req.body?.note,
      actor: req.user,
    });
    await writeAuditLog({
      companyId: req.user.companyId, actor: req.user, action: "OPEN_WORK_HANDED_OVER",
      entityType: "User", entityId: req.params.userId, metadata: result, req,
    });
    return res.json({ message: "Handed over", ...result });
  } catch (error) {
    if (error instanceof handover.HandoverError) return res.status(error.statusCode).json({ message: error.message });
    req.log?.error?.({ error: error.message }, "handover failed");
    return res.status(500).json({ message: "Handover failed" });
  }
});

/*
 * Own weekly offs (requirements 16 Oct 2026, 4.3). An entry applies from its
 * date onward; earlier months keep the old schedule. Empty days = back to the
 * company's weekly off. Admin and Manager; audited.
 */
const { normalizeDays } = require("../services/workCalendar");
const User = require("../models/User");
const setWeeklyOff = async ({ req, userIds }) => {
  const days = normalizeDays(req.body?.days);
  const effectiveFrom = String(req.body?.effectiveFrom || "").trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(effectiveFrom)) {
    const error = new Error("Choose the date the new weekly off starts"); error.statusCode = 400; throw error;
  }
  if (days.length > 3) { const error = new Error("At most 3 weekly off days"); error.statusCode = 400; throw error; }
  const ids = userIds.filter((x) => /^[a-f0-9]{24}$/i.test(String(x)));
  if (!ids.length) { const error = new Error("Choose at least one person"); error.statusCode = 400; throw error; }
  const users = await User.find({ _id: { $in: ids }, companyId: req.user.companyId }).select("_id name weeklyOffSchedule");
  for (const user of users) {
    const kept = (user.weeklyOffSchedule || []).filter((e) => e.effectiveFrom !== effectiveFrom);
    user.weeklyOffSchedule = [...kept, { days, effectiveFrom, setBy: req.user._id }]
      .sort((a, b) => String(a.effectiveFrom).localeCompare(String(b.effectiveFrom))).slice(-50);
    // eslint-disable-next-line no-await-in-loop
    await user.save();
  }
  await writeAuditLog({
    companyId: req.user.companyId, actor: req.user, action: "WEEKLY_OFF_CHANGED", entityType: "User",
    entityId: ids.length === 1 ? ids[0] : "", metadata: { userIds: users.map((u) => String(u._id)), days, effectiveFrom }, req,
  });
  return users.map((u) => ({ _id: u._id, name: u.name, weeklyOffSchedule: u.weeklyOffSchedule }));
};
router.put("/:userId/weekly-off", writeLimiter, authMiddleware.protect, checkRole(["ADMIN", "MANAGER"]), async (req, res) => {
  try {
    const [user] = await setWeeklyOff({ req, userIds: [req.params.userId] });
    if (!user) return res.status(404).json({ message: "User not found" });
    return res.json({ message: "Weekly off saved", user });
  } catch (error) {
    return res.status(error.statusCode || 500).json({ message: error.statusCode ? error.message : "Couldn't save weekly off" });
  }
});
router.post("/weekly-off/bulk", writeLimiter, authMiddleware.protect, checkRole(["ADMIN", "MANAGER"]), async (req, res) => {
  try {
    const users = await setWeeklyOff({ req, userIds: Array.isArray(req.body?.userIds) ? req.body.userIds : [] });
    return res.json({ message: `Weekly off saved for ${users.length} people`, users });
  } catch (error) {
    return res.status(error.statusCode || 500).json({ message: error.statusCode ? error.message : "Couldn't save weekly off" });
  }
});

router.delete(
  "/:userId",
  writeLimiter,
  authMiddleware.protect,
  userController.deleteUser
);

module.exports = router;
