const Task = require("../models/Task");
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
const USER_FIELDS = "_id name email role profileImageUrl joiningDate createdAt department isActive";
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

    return {
      user: toUserView(user),
      performance: calculatePerformance({ attendance, tasks: taskScore, sales }),
    };
  });
};

const methodology = () => ({
  weights: PERFORMANCE_WEIGHTS,
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
        averageScore: scored.length ? Math.round(scored.reduce((sum, score) => sum + score, 0) / scored.length) : null,
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
