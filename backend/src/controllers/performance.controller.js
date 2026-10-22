const mongoose = require("mongoose");
const Task = require("../models/Task");
const DailyReport = require("../models/DailyReport");
const Lead = require("../models/Lead");
const TargetAssignment = require("../models/TargetAssignment");
const User = require("../models/User");
const logger = require("../config/logger");
const { USER_ROLES, MANAGEMENT_ROLES } = require("../constants/role.constants");
const {
  loadAttendanceDaysForUsers,
  resolvePolicyForCompany,
  ensureUserInScope,
  getScopedUsersForAttendanceViewer,
} = require("./attendance.controller");
const { dateKeyInTimezone, monthRange, MONTH_KEY_PATTERN } = require("../services/payroll.calc");
const {
  PERFORMANCE_WEIGHTS,
  CONVERSION_BENCHMARK_PERCENT,
  scoreAttendance,
  scoreTasks,
  scoreSales,
  scorePunctuality,
  scoreTarget,
  TARGET_CAP_PERCENT,
  calculatePerformance,
} = require("../services/performance.calc");

/*
 * Performance: a score out of 100 per person per month, from attendance,
 * tasks and sales (see services/performance.calc.js for how).
 *
 * Who sees what is the same as attendance and salary: everybody sees their
 * own; an admin sees everybody's; a manager sees their own team's.
 */

// What a closed deal counts as against a revenue target - the same figure the
// Targets page uses (target.controller), so the two never disagree.
const REVENUE_PER_CLOSED = Number.parseInt(process.env.TARGET_REVENUE_PER_CLOSED, 10) || 50000;
const USER_FIELDS = "_id name email role profileImageUrl joiningDate createdAt department isActive weeklyOffSchedule";
const CLOSED_STATUSES = ["CLOSED", "LOST"];

const canManage = (role) => role === USER_ROLES.ADMIN || MANAGEMENT_ROLES.includes(role);

const toUserView = (user) => ({
  _id: user._id,
  name: user.name || "",
  email: user.email || "",
  role: user.role || "",
  department: user.department || "",
  profileImageUrl: user.profileImageUrl || "",
});

const resolveMonthKey = (query, timezone) => {
  const requested = String(query?.month || "").trim();
  if (!requested) return { monthKey: dateKeyInTimezone(new Date(), timezone).slice(0, 7) };
  if (!MONTH_KEY_PATTERN.test(requested)) return { error: "month must be in YYYY-MM format" };
  return { monthKey: requested };
};

// A window wide enough to hold the month in any timezone; rows are then kept
// or dropped by their date in the company's own zone.
const widenedWindow = (range) => ({
  start: new Date(Date.parse(`${range.from}T00:00:00.000Z`) - 15 * 60 * 60 * 1000),
  end: new Date(Date.parse(`${range.to}T23:59:59.999Z`) + 15 * 60 * 60 * 1000),
});

/*
 * When a task was finished: the last status change that ended in Completed
 * (task.controller writes "<from> → Completed"), or its last update when the
 * history does not say.
 */
const completedAtOf = (task) => {
  const change = [...(task.activity || [])]
    .reverse()
    .find((entry) => entry.action === "STATUS_CHANGED" && /→\s*Completed$/i.test(String(entry.detail || "")));
  return change?.at || task.updatedAt || null;
};

/**
 * Performance for a set of people for one month - each part's records
 * gathered for all of them at once, not a query per person.
 */
const buildPerformanceRows = async ({ companyId, users, monthKey }) => {
  const range = monthRange(monthKey);
  const attendancePolicy = await resolvePolicyForCompany(companyId);
  const timezone = attendancePolicy.timezone;
  const todayKey = dateKeyInTimezone(new Date(), timezone);
  const keyOf = (value) => (value ? dateKeyInTimezone(value, timezone) : "");
  const inMonth = (value) => {
    const key = keyOf(value);
    return Boolean(key) && key >= range.from && key <= range.to;
  };
  const ids = users.map((user) => user._id);
  const { start, end } = widenedWindow(range);
  const partnerIds = new Set(users.filter((user) => user.role === USER_ROLES.CHANNEL_PARTNER).map((user) => String(user._id)));

  const [daysByUser, tasks, monthLeads, openLeads, targets] = await Promise.all([
    loadAttendanceDaysForUsers({ companyId, users, range, policy: attendancePolicy }),
    Task.find({
      companyId,
      assignedTo: { $in: ids },
      $or: [{ dueDate: { $gte: start, $lte: end } }, { status: "COMPLETED", updatedAt: { $gte: start } }],
    }).select("assignedTo status dueDate updatedAt activity").lean(),
    // A channel partner's leads are the ones they brought in; everybody
    // else's are the ones assigned to them - the same split Targets uses.
    Lead.find({
      companyId,
      createdAt: { $gte: start, $lte: end },
      $or: [{ assignedTo: { $in: ids } }, { createdBy: { $in: [...partnerIds] } }],
    }).select("assignedTo createdBy status createdAt").lean(),
    Lead.find({
      companyId,
      status: { $nin: CLOSED_STATUSES },
      $or: [{ assignedTo: { $in: ids } }, { createdBy: { $in: [...partnerIds] } }],
    }).select("assignedTo createdBy nextFollowUp").lean(),
    TargetAssignment.find({ companyId, assignedTo: { $in: ids }, month: monthKey }).lean(),
  ]);
  // Production output = posts published in their daily reports this month (3.1).
  const productionRows = await DailyReport.aggregate([
    { $match: { companyId: new mongoose.Types.ObjectId(String(companyId)), userId: { $in: ids.map((id) => new mongoose.Types.ObjectId(String(id))) }, reportDate: { $gte: range.from, $lte: range.to } } },
    { $group: { _id: "$userId", posts: { $sum: { $ifNull: ["$counts.postsPublished", 0] } } } },
  ]);
  const productionByUser = new Map(productionRows.map((row) => [String(row._id), row.posts]));

  const ownerOf = (lead) => {
    const creator = String(lead.createdBy || "");
    return partnerIds.has(creator) ? creator : String(lead.assignedTo || "");
  };
  const group = (rows, keyFn) => rows.reduce((map, row) => {
    const key = keyFn(row);
    if (!map.has(key)) map.set(key, []);
    map.get(key).push(row);
    return map;
  }, new Map());

  const tasksByUser = group(tasks, (task) => String(task.assignedTo));
  const monthLeadsByUser = group(monthLeads.filter((lead) => inMonth(lead.createdAt)), ownerOf);
  const openLeadsByUser = group(openLeads, ownerOf);
  const targetByUser = new Map(targets.map((row) => [String(row.assignedTo), row]));

  return users.map((user) => {
    const key = String(user._id);
    const attendance = scoreAttendance(daysByUser.get(key)?.summary);

    const taskScore = scoreTasks({
      from: range.from,
      to: range.to,
      todayKey,
      tasks: (tasksByUser.get(key) || []).map((task) => ({
        dueKey: keyOf(task.dueDate),
        completed: task.status === "COMPLETED",
        completedKey: task.status === "COMPLETED" ? keyOf(completedAtOf(task)) : "",
      })),
    });

    const leads = monthLeadsByUser.get(key) || [];
    const open = openLeadsByUser.get(key) || [];
    const sales = scoreSales({
      leads: {
        total: leads.length,
        closed: leads.filter((lead) => lead.status === "CLOSED").length,
        siteVisits: leads.filter((lead) => lead.status === "SITE_VISIT").length,
      },
      target: targetByUser.get(key) || null,
      openLeads: {
        total: open.length,
        // Overdue = a follow-up date already passed. A lead with none is not overdue.
        overdueFollowUps: open.filter((lead) => lead.nextFollowUp && keyOf(lead.nextFollowUp) < todayKey).length,
      },
      revenuePerClosed: REVENUE_PER_CLOSED,
    });

    const closedCount = leads.filter((lead) => lead.status === "CLOSED").length;
    const target = scoreTarget({
      target: targetByUser.get(key) || null,
      actuals: {
        leads: leads.length,
        siteVisits: leads.filter((lead) => lead.status === "SITE_VISIT").length,
        revenue: closedCount * REVENUE_PER_CLOSED,
        deals: closedCount,
        production: productionByUser.get(key) || 0,
      },
    });
    const punctuality = scorePunctuality(daysByUser.get(key)?.summary);

    return {
      user: toUserView(user),
      performance: calculatePerformance({ target, tasks: taskScore, attendance, punctuality, sales }),
    };
  });
};

const methodology = () => ({
  weights: PERFORMANCE_WEIGHTS,
  targetCapPercent: TARGET_CAP_PERCENT,
  conversionBenchmarkPercent: CONVERSION_BENCHMARK_PERCENT,
  revenuePerClosed: REVENUE_PER_CLOSED,
});

const handleError = (req, res, error, message) => {
  logger.error({ requestId: req.requestId || null, error: error.message, message });
  return res.status(500).json({ message: "Server error" });
};

const respondFor = async (req, res, users) => {
  const attendancePolicy = await resolvePolicyForCompany(req.user.companyId);
  const { monthKey, error } = resolveMonthKey(req.query, attendancePolicy.timezone);
  if (error) return res.status(400).json({ message: error });
  const rows = users.length ? await buildPerformanceRows({ companyId: req.user.companyId, users, monthKey }) : [];
  return { monthKey, rows, timezone: attendancePolicy.timezone };
};

exports.getMyPerformance = async (req, res) => {
  try {
    if (!req.user?.companyId) return res.status(403).json({ message: "Company context is required" });
    if (req.user.role === USER_ROLES.ADMIN) {
      return res.status(403).json({ message: "Admin accounts are not scored - they keep no attendance or targets" });
    }
    const me = await User.findOne({ _id: req.user._id, companyId: req.user.companyId }).select(USER_FIELDS).lean();
    if (!me) return res.status(404).json({ message: "User not found" });
    const result = await respondFor(req, res, [me]);
    if (!result?.rows) return null;
    return res.json({ month: result.monthKey, timezone: result.timezone, methodology: methodology(), ...result.rows[0] });
  } catch (error) {
    return handleError(req, res, error, "getMyPerformance failed");
  }
};

exports.getTeamPerformance = async (req, res) => {
  try {
    if (!req.user?.companyId) return res.status(403).json({ message: "Company context is required" });
    if (!canManage(req.user.role)) {
      return res.status(403).json({ message: "Only admins and managers can view the team's performance" });
    }
    // The attendance scope, minus the viewer: a manager's own score is on
    // their own tab, not in the list of the people they manage.
    const scoped = (await getScopedUsersForAttendanceViewer(req.user))
      .filter((user) => String(user._id) !== String(req.user._id));
    const users = scoped.length
      ? await User.find({
        _id: { $in: scoped.map((user) => user._id) },
        companyId: req.user.companyId,
        isActive: true,
        role: { $ne: USER_ROLES.ADMIN },
      }).select(USER_FIELDS).sort({ name: 1 }).lean()
      : [];

    const result = await respondFor(req, res, users);
    if (!result?.rows) return null;
    const scored = result.rows.map((row) => row.performance.score).filter((score) => score !== null);
    return res.json({
      month: result.monthKey,
      timezone: result.timezone,
      methodology: methodology(),
      totals: {
        people: result.rows.length,
        scored: scored.length,
        averageScore: scored.length ? Math.round((scored.reduce((sum, score) => sum + score, 0) / scored.length) * 100) / 100 : null,
        excellent: result.rows.filter((row) => row.performance.grade?.key === "EXCELLENT").length,
        needsImprovement: result.rows.filter((row) => row.performance.grade?.key === "NEEDS_IMPROVEMENT").length,
      },
      rows: result.rows,
    });
  } catch (error) {
    return handleError(req, res, error, "getTeamPerformance failed");
  }
};

exports.getUserPerformance = async (req, res) => {
  try {
    if (!req.user?.companyId) return res.status(403).json({ message: "Company context is required" });
    const targetUserId = String(req.params?.userId || "").trim();
    if (!/^[a-f\d]{24}$/i.test(targetUserId)) return res.status(400).json({ message: "Valid user is required" });

    const isSelf = String(req.user._id) === targetUserId;
    if (!isSelf) {
      if (!canManage(req.user.role)) {
        return res.status(403).json({ message: "Only admins and managers can view other people's performance" });
      }
      if (!await ensureUserInScope({ actor: req.user, targetUserId })) {
        return res.status(403).json({ message: "This person is outside your team" });
      }
    }
    const target = await User.findOne({ _id: targetUserId, companyId: req.user.companyId }).select(USER_FIELDS).lean();
    if (!target) return res.status(404).json({ message: "User not found" });
    if (target.role === USER_ROLES.ADMIN) {
      return res.status(400).json({ message: "Admin accounts are not scored" });
    }

    const result = await respondFor(req, res, [target]);
    if (!result?.rows) return null;
    return res.json({ month: result.monthKey, timezone: result.timezone, methodology: methodology(), ...result.rows[0] });
  } catch (error) {
    return handleError(req, res, error, "getUserPerformance failed");
  }
};

/* ------------------------------------------------- history & increments -- */

const IncrementReview = require("../models/IncrementReview");
const { writeAuditLog } = require("../services/auditLog.service");

const monthsBack = (monthKey, count) => {
  const [y, m] = monthKey.split("-").map(Number);
  return Array.from({ length: count }, (_, i) => {
    const d = new Date(Date.UTC(y, m - 1 - i, 1));
    return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
  }).reverse();
};

/*
 * GET /performance/users/:userId/history?months=6 - the score month by month
 * (3.4). Same access as one person's score.
 */
exports.getUserPerformanceHistory = async (req, res) => {
  try {
    const targetUserId = String(req.params?.userId || "").trim();
    if (!/^[a-f\d]{24}$/i.test(targetUserId)) return res.status(400).json({ message: "Valid user is required" });
    const isSelf = String(req.user._id) === targetUserId;
    if (!isSelf && (!canManage(req.user.role) || !await ensureUserInScope({ actor: req.user, targetUserId }))) {
      return res.status(403).json({ message: "You can't see this person's performance" });
    }
    const target = await User.findOne({ _id: targetUserId, companyId: req.user.companyId }).select(USER_FIELDS).lean();
    if (!target || target.role === USER_ROLES.ADMIN) return res.status(404).json({ message: "User not found" });
    const policy = await resolvePolicyForCompany(req.user.companyId);
    const current = dateKeyInTimezone(new Date(), policy.timezone).slice(0, 7);
    const count = Math.min(12, Math.max(1, Number.parseInt(req.query.months, 10) || 6));
    const months = monthsBack(MONTH_KEY_PATTERN.test(String(req.query.to || "")) ? req.query.to : current, count);
    const history = [];
    // eslint-disable-next-line no-restricted-syntax
    for (const monthKey of months) {
      // eslint-disable-next-line no-await-in-loop
      const [row] = await buildPerformanceRows({ companyId: req.user.companyId, users: [target], monthKey });
      history.push({ month: monthKey, score: row.performance.score, grade: row.performance.grade, parts: Object.fromEntries(Object.entries(row.performance.parts).map(([k, p]) => [k, p ? p.score : null])) });
    }
    return res.json({ user: toUserView(target), history, methodology: methodology() });
  } catch (error) {
    return handleError(req, res, error, "getUserPerformanceHistory failed");
  }
};

const cleanReview = (body = {}) => {
  const out = {};
  const month = /^\d{4}-(0[1-9]|1[0-2])$/;
  if (body.periodFrom !== undefined) { if (!month.test(body.periodFrom)) throw Object.assign(new Error("Choose the review period"), { statusCode: 400 }); out.periodFrom = body.periodFrom; }
  if (body.periodTo !== undefined) { if (!month.test(body.periodTo)) throw Object.assign(new Error("Choose the review period"), { statusCode: 400 }); out.periodTo = body.periodTo; }
  if (body.decision !== undefined) { if (!IncrementReview.DECISIONS.includes(body.decision)) throw Object.assign(new Error("Invalid decision"), { statusCode: 400 }); out.decision = body.decision; }
  if (body.incrementType !== undefined) { if (!IncrementReview.INCREMENT_TYPES.includes(body.incrementType)) throw Object.assign(new Error("Invalid increment type"), { statusCode: 400 }); out.incrementType = body.incrementType; }
  if (body.incrementValue !== undefined) {
    const v = body.incrementValue === null || body.incrementValue === "" ? null : Number(body.incrementValue);
    if (v !== null && (!Number.isFinite(v) || v < 0)) throw Object.assign(new Error("Increment must be 0 or more"), { statusCode: 400 });
    if (v !== null && out.incrementType === "PERCENT" && v > 100) throw Object.assign(new Error("A percentage increment can't be over 100"), { statusCode: 400 });
    out.incrementValue = v;
  }
  if (body.effectiveDate !== undefined) { if (body.effectiveDate && !/^\d{4}-\d{2}-\d{2}$/.test(body.effectiveDate)) throw Object.assign(new Error("Effective date must be a date"), { statusCode: 400 }); out.effectiveDate = body.effectiveDate || ""; }
  if (body.notes !== undefined) out.notes = String(body.notes || "").trim().slice(0, 2000);
  if (out.periodFrom && out.periodTo && out.periodFrom > out.periodTo) throw Object.assign(new Error("Period starts after it ends"), { statusCode: 400 });
  if (out.decision === "APPROVED" && (out.incrementValue === null || out.incrementValue === undefined || !out.incrementType)) {
    throw Object.assign(new Error("An approved review needs the increment and its type"), { statusCode: 400 });
  }
  return out;
};

const reviewView = (r) => ({ ...r, reviewer: r.reviewerId && r.reviewerId.name ? { _id: r.reviewerId._id, name: r.reviewerId.name } : null });

/* GET /performance/increment-reviews?userId= - Admin/Manager (own team). */
exports.listIncrementReviews = async (req, res) => {
  try {
    if (!canManage(req.user.role)) return res.status(403).json({ message: "Only admins and managers can see increment reviews" });
    const filter = { companyId: req.user.companyId };
    if (req.query.userId) {
      if (!/^[a-f\d]{24}$/i.test(req.query.userId)) return res.status(400).json({ message: "Invalid user" });
      if (!await ensureUserInScope({ actor: req.user, targetUserId: req.query.userId })) return res.status(403).json({ message: "This person is outside your team" });
      filter.userId = req.query.userId;
    } else if (req.user.role !== USER_ROLES.ADMIN) {
      const scoped = await getScopedUsersForAttendanceViewer(req.user);
      filter.userId = { $in: scoped.map((u) => u._id) };
    }
    const rows = await IncrementReview.find(filter).populate("reviewerId", "name").populate("userId", "name role").sort({ createdAt: -1 }).limit(200).lean();
    return res.json({ reviews: rows.map(reviewView) });
  } catch (error) {
    return handleError(req, res, error, "listIncrementReviews failed");
  }
};

/* POST /performance/increment-reviews - start a review; the score is snapshotted. */
exports.createIncrementReview = async (req, res) => {
  try {
    if (!canManage(req.user.role)) return res.status(403).json({ message: "Only admins and managers can review increments" });
    const userId = String(req.body?.userId || "");
    if (!/^[a-f\d]{24}$/i.test(userId)) return res.status(400).json({ message: "Choose an employee" });
    if (!await ensureUserInScope({ actor: req.user, targetUserId: userId })) return res.status(403).json({ message: "This person is outside your team" });
    const data = cleanReview(req.body);
    if (!data.periodFrom || !data.periodTo) return res.status(400).json({ message: "Choose the review period" });
    const target = await User.findOne({ _id: userId, companyId: req.user.companyId }).select(USER_FIELDS).lean();
    if (!target || target.role === USER_ROLES.ADMIN) return res.status(404).json({ message: "Employee not found" });
    const months = [];
    for (let m = data.periodFrom; m <= data.periodTo && months.length < 12;) {
      months.push(m);
      const [y, mo] = m.split("-").map(Number);
      const d = new Date(Date.UTC(y, mo, 1));
      m = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
    }
    const snapshot = [];
    // eslint-disable-next-line no-restricted-syntax
    for (const monthKey of months) {
      // eslint-disable-next-line no-await-in-loop
      const [row] = await buildPerformanceRows({ companyId: req.user.companyId, users: [target], monthKey });
      snapshot.push({ month: monthKey, score: row.performance.score });
    }
    const scored = snapshot.filter((x) => x.score !== null);
    const review = await IncrementReview.create({
      companyId: req.user.companyId, userId, reviewerId: req.user._id, ...data,
      scoreSnapshot: { months: snapshot, averageScore: scored.length ? Math.round((scored.reduce((a, x) => a + x.score, 0) / scored.length) * 100) / 100 : null },
      history: [{ at: new Date(), by: req.user._id, byName: req.user.name || "", change: { created: data } }],
    });
    await writeAuditLog({ companyId: req.user.companyId, actor: req.user, action: "INCREMENT_REVIEW_CREATED", entityType: "IncrementReview", entityId: review._id, metadata: { userId, ...data }, req });
    return res.status(201).json({ review });
  } catch (error) {
    if (error.statusCode) return res.status(error.statusCode).json({ message: error.message });
    return handleError(req, res, error, "createIncrementReview failed");
  }
};

/* PATCH /performance/increment-reviews/:id - record the decision. */
exports.updateIncrementReview = async (req, res) => {
  try {
    if (!canManage(req.user.role)) return res.status(403).json({ message: "Only admins and managers can review increments" });
    if (!/^[a-f\d]{24}$/i.test(req.params.reviewId)) return res.status(400).json({ message: "Invalid review" });
    const review = await IncrementReview.findOne({ _id: req.params.reviewId, companyId: req.user.companyId });
    if (!review) return res.status(404).json({ message: "Review not found" });
    if (!await ensureUserInScope({ actor: req.user, targetUserId: String(review.userId) })) return res.status(403).json({ message: "This person is outside your team" });
    const merged = { incrementType: review.incrementType, incrementValue: review.incrementValue, ...req.body };
    const data = cleanReview(merged);
    const before = { decision: review.decision, incrementType: review.incrementType, incrementValue: review.incrementValue, effectiveDate: review.effectiveDate };
    Object.assign(review, data);
    review.reviewerId = req.user._id;
    review.history.push({ at: new Date(), by: req.user._id, byName: req.user.name || "", change: { before, after: data } });
    await review.save();
    await writeAuditLog({ companyId: req.user.companyId, actor: req.user, action: "INCREMENT_REVIEW_UPDATED", entityType: "IncrementReview", entityId: review._id, metadata: { before, after: data }, req });
    return res.json({ review });
  } catch (error) {
    if (error.statusCode) return res.status(error.statusCode).json({ message: error.message });
    return handleError(req, res, error, "updateIncrementReview failed");
  }
};
