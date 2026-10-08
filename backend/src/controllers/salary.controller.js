const EmployeeSalary = require("../models/EmployeeSalary");
const PayrollPolicy = require("../models/PayrollPolicy");
const LeaveRequest = require("../models/LeaveRequest");
const User = require("../models/User");
const logger = require("../config/logger");
const { USER_ROLES, MANAGEMENT_ROLES } = require("../constants/role.constants");
const { writeAuditLog } = require("../services/auditLog.service");
const {
  loadAttendanceDaysForUsers,
  resolvePolicyForCompany,
  ensureUserInScope,
  getScopedUsersForAttendanceViewer,
} = require("./attendance.controller");
const {
  PER_DAY_BASIS,
  LATE_DEDUCTION_UNIT,
  MAX_MONTHLY_SALARY,
  MONTH_KEY_PATTERN,
  toPayrollPolicyView,
  resolveSalaryForMonth,
  calculateMonthlySalary,
  dateKeyInTimezone,
  dateKeysBetween,
  monthRange,
} = require("../services/payroll.calc");

/*
 * Salaries, and what attendance has taken off them this month.
 *
 * Who sees what:
 *   - everybody sees their own salary and its deductions;
 *   - an admin sees and sets everybody's (admins themselves have no salary -
 *     they do not keep attendance either);
 *   - a manager sees and sets their own team's, the same people whose
 *     attendance they manage - never their own, and never a peer's.
 * Admins and managers also set the company's deduction rules.
 */

const USER_FIELDS = "_id name email role profileImageUrl joiningDate createdAt department isActive";

const toTrimmedString = (value) => String(value ?? "").trim();

const canManagePayroll = (role) => role === USER_ROLES.ADMIN || MANAGEMENT_ROLES.includes(role);

const toUserView = (user) => ({
  _id: user._id,
  name: user.name || "",
  email: user.email || "",
  role: user.role || "",
  department: user.department || "",
  profileImageUrl: user.profileImageUrl || "",
});

// Who set a figure, and why, is for the people managing pay; the employee sees
// what they are paid and from when.
const toRevisionView = (revision, { withAuthor }) => ({
  monthlySalary: Number(revision.monthlySalary || 0),
  effectiveFrom: revision.effectiveFrom,
  setAt: revision.setAt || null,
  ...(withAuthor
    ? {
      note: revision.note || "",
      setByName: revision.setByName || "",
      setByRole: revision.setByRole || "",
    }
    : {}),
});

const sortRevisionsNewestFirst = (revisions = []) => [...revisions].sort((left, right) => {
  if (left.effectiveFrom !== right.effectiveFrom) return left.effectiveFrom < right.effectiveFrom ? 1 : -1;
  return new Date(right.setAt || 0).getTime() - new Date(left.setAt || 0).getTime();
});

const resolveMonthKey = (query, timezone) => {
  const requested = toTrimmedString(query?.month);
  if (!requested) return { monthKey: dateKeyInTimezone(new Date(), timezone).slice(0, 7) };
  if (!MONTH_KEY_PATTERN.test(requested)) return { error: "month must be in YYYY-MM format" };
  return { monthKey: requested };
};

const loadPayrollPolicy = async (companyId) => {
  const stored = await PayrollPolicy.findOne({ companyId }).lean();
  return {
    rules: toPayrollPolicyView(stored || {}),
    updatedAt: stored?.updatedAt || null,
    updatedByName: stored?.updatedByName || "",
    isDefault: !stored,
  };
};

/** date keys inside the range covered by a pending or rejected leave request, per user. */
const loadUnapprovedLeaveDates = async ({ companyId, userIds, range }) => {
  const rows = await LeaveRequest.find({
    companyId,
    userId: { $in: userIds },
    status: { $in: ["PENDING", "REJECTED"] },
    fromDate: { $lte: range.to },
    toDate: { $gte: range.from },
  })
    .select("userId fromDate toDate")
    .lean();

  const byUser = new Map();
  rows.forEach((row) => {
    const key = String(row.userId);
    if (!byUser.has(key)) byUser.set(key, new Set());
    const from = row.fromDate < range.from ? range.from : row.fromDate;
    const to = row.toDate > range.to ? range.to : row.toDate;
    dateKeysBetween(from, to).forEach((dateKey) => byUser.get(key).add(dateKey));
  });
  return byUser;
};

/*
 * The salary picture for a set of people for one month. Attendance is only
 * loaded for people who have a salary in force that month - nobody else has
 * anything to deduct from.
 */
const buildSalaryRows = async ({ companyId, users, monthKey, rules }) => {
  const range = monthRange(monthKey);
  const attendancePolicy = await resolvePolicyForCompany(companyId);
  const timezone = attendancePolicy.timezone;
  const todayKey = dateKeyInTimezone(new Date(), timezone);

  const salaryDocs = users.length
    ? await EmployeeSalary.find({ companyId, userId: { $in: users.map((user) => user._id) } }).lean()
    : [];
  const salaryByUser = new Map(salaryDocs.map((doc) => [String(doc.userId), doc]));

  const paidUsers = users.filter((user) =>
    resolveSalaryForMonth(salaryByUser.get(String(user._id))?.revisions, monthKey));

  const [daysByUser, unapprovedByUser] = paidUsers.length
    ? await Promise.all([
      loadAttendanceDaysForUsers({ companyId, users: paidUsers, range, policy: attendancePolicy }),
      loadUnapprovedLeaveDates({ companyId, userIds: paidUsers.map((user) => user._id), range }),
    ])
    : [new Map(), new Map()];

  const rows = users.map((user) => {
    const key = String(user._id);
    const doc = salaryByUser.get(key);
    const revisions = sortRevisionsNewestFirst(doc?.revisions || []);
    const inForce = resolveSalaryForMonth(revisions, monthKey);
    const calculation = inForce
      ? calculateMonthlySalary({
        monthKey,
        todayKey,
        monthlySalary: inForce.monthlySalary,
        policy: rules,
        weeklyOffDays: attendancePolicy.weeklyOffDays,
        days: daysByUser.get(key)?.attendance || [],
        unapprovedLeaveDates: unapprovedByUser.get(key) || [],
        joiningKey: user.joiningDate ? dateKeyInTimezone(user.joiningDate, timezone) : "",
      })
      : null;

    return {
      user: toUserView(user),
      salary: calculation,
      salaryEffectiveFrom: inForce?.effectiveFrom || null,
      latestMonthlySalary: revisions.length ? Number(revisions[0].monthlySalary) : null,
      revisions,
    };
  });

  return { rows, timezone, todayKey };
};

const handleError = (req, res, error, message) => {
  logger.error({ requestId: req.requestId || null, error: error.message, message });
  return res.status(500).json({ message: "Server error" });
};

exports.getMySalary = async (req, res) => {
  try {
    if (!req.user?.companyId) return res.status(403).json({ message: "Company context is required" });
    if (req.user.role === USER_ROLES.ADMIN) {
      return res.status(403).json({ message: "Admin accounts do not have a salary record" });
    }

    const attendancePolicy = await resolvePolicyForCompany(req.user.companyId);
    const { monthKey, error } = resolveMonthKey(req.query, attendancePolicy.timezone);
    if (error) return res.status(400).json({ message: error });

    const me = await User.findOne({ _id: req.user._id, companyId: req.user.companyId }).select(USER_FIELDS).lean();
    if (!me) return res.status(404).json({ message: "User not found" });

    const policy = await loadPayrollPolicy(req.user.companyId);
    const { rows, timezone } = await buildSalaryRows({
      companyId: req.user.companyId,
      users: [me],
      monthKey,
      rules: policy.rules,
    });
    const [row] = rows;

    return res.json({
      month: monthKey,
      timezone,
      policy: policy.rules,
      user: row.user,
      salary: row.salary,
      salaryEffectiveFrom: row.salaryEffectiveFrom,
      revisions: row.revisions.map((revision) => toRevisionView(revision, { withAuthor: false })),
    });
  } catch (error) {
    return handleError(req, res, error, "getMySalary failed");
  }
};

exports.getTeamSalaries = async (req, res) => {
  try {
    if (!req.user?.companyId) return res.status(403).json({ message: "Company context is required" });
    if (!canManagePayroll(req.user.role)) {
      return res.status(403).json({ message: "Only admins and managers can view team salaries" });
    }

    const attendancePolicy = await resolvePolicyForCompany(req.user.companyId);
    const { monthKey, error } = resolveMonthKey(req.query, attendancePolicy.timezone);
    if (error) return res.status(400).json({ message: error });

    // The attendance scope, minus the viewer: a manager's own pay is on their
    // own "My salary" view, not in the list of people they manage.
    const scoped = (await getScopedUsersForAttendanceViewer(req.user))
      .filter((user) => String(user._id) !== String(req.user._id));
    const users = scoped.length
      ? await User.find({
        _id: { $in: scoped.map((user) => user._id) },
        companyId: req.user.companyId,
        isActive: true,
        role: { $ne: USER_ROLES.ADMIN },
      })
        .select(USER_FIELDS)
        .sort({ name: 1 })
        .lean()
      : [];

    const policy = await loadPayrollPolicy(req.user.companyId);
    const { rows, timezone } = await buildSalaryRows({
      companyId: req.user.companyId,
      users,
      monthKey,
      rules: policy.rules,
    });

    const withSalary = rows.filter((row) => row.salary);
    const sum = (pick) => Math.round(withSalary.reduce((total, row) => total + pick(row.salary), 0) * 100) / 100;

    return res.json({
      month: monthKey,
      timezone,
      policy: policy.rules,
      totals: {
        employees: rows.length,
        withSalary: withSalary.length,
        monthlyPayroll: sum((salary) => salary.monthlySalary),
        totalDeduction: sum((salary) => salary.totalDeduction),
        netPayable: sum((salary) => salary.netSalary),
      },
      rows: rows.map((row) => ({
        user: row.user,
        salary: row.salary,
        salaryEffectiveFrom: row.salaryEffectiveFrom,
        latestMonthlySalary: row.latestMonthlySalary,
      })),
    });
  } catch (error) {
    return handleError(req, res, error, "getTeamSalaries failed");
  }
};

const loadManageableTarget = async (req, res, targetUserId, { forWrite }) => {
  if (!/^[a-f\d]{24}$/i.test(targetUserId)) {
    res.status(400).json({ message: "Valid user is required" });
    return null;
  }
  const isSelf = String(req.user._id) === String(targetUserId);
  if (forWrite && isSelf) {
    res.status(403).json({ message: "You cannot set your own salary" });
    return null;
  }
  if (!isSelf) {
    if (!canManagePayroll(req.user.role)) {
      res.status(403).json({ message: "Only admins and managers can view other people's salaries" });
      return null;
    }
    if (!await ensureUserInScope({ actor: req.user, targetUserId })) {
      res.status(403).json({ message: "This person is outside your team" });
      return null;
    }
  }

  const target = await User.findOne({ _id: targetUserId, companyId: req.user.companyId })
    .select(USER_FIELDS)
    .lean();
  if (!target) {
    res.status(404).json({ message: "User not found" });
    return null;
  }
  if (target.role === USER_ROLES.ADMIN) {
    res.status(400).json({ message: "Admin accounts do not have a salary record" });
    return null;
  }
  if (forWrite && !target.isActive) {
    res.status(400).json({ message: "This account is inactive" });
    return null;
  }
  return target;
};

exports.getUserSalary = async (req, res) => {
  try {
    if (!req.user?.companyId) return res.status(403).json({ message: "Company context is required" });

    const target = await loadManageableTarget(req, res, toTrimmedString(req.params?.userId), { forWrite: false });
    if (!target) return null;

    const attendancePolicy = await resolvePolicyForCompany(req.user.companyId);
    const { monthKey, error } = resolveMonthKey(req.query, attendancePolicy.timezone);
    if (error) return res.status(400).json({ message: error });

    const policy = await loadPayrollPolicy(req.user.companyId);
    const { rows, timezone } = await buildSalaryRows({
      companyId: req.user.companyId,
      users: [target],
      monthKey,
      rules: policy.rules,
    });
    const [row] = rows;
    const withAuthor = canManagePayroll(req.user.role) && String(req.user._id) !== String(target._id);

    return res.json({
      month: monthKey,
      timezone,
      policy: policy.rules,
      user: row.user,
      salary: row.salary,
      salaryEffectiveFrom: row.salaryEffectiveFrom,
      latestMonthlySalary: row.latestMonthlySalary,
      revisions: row.revisions.map((revision) => toRevisionView(revision, { withAuthor })),
    });
  } catch (error) {
    return handleError(req, res, error, "getUserSalary failed");
  }
};

exports.setUserSalary = async (req, res) => {
  try {
    if (!req.user?.companyId) return res.status(403).json({ message: "Company context is required" });
    if (!canManagePayroll(req.user.role)) {
      return res.status(403).json({ message: "Only admins and managers can set salaries" });
    }

    const target = await loadManageableTarget(req, res, toTrimmedString(req.params?.userId), { forWrite: true });
    if (!target) return null;

    const monthlySalary = Number(req.body?.monthlySalary);
    if (!Number.isFinite(monthlySalary) || monthlySalary < 0 || monthlySalary > MAX_MONTHLY_SALARY) {
      return res.status(400).json({ message: "Enter a monthly salary between 0 and 10,00,00,000" });
    }
    const attendancePolicy = await resolvePolicyForCompany(req.user.companyId);
    const effectiveFrom = toTrimmedString(req.body?.effectiveFrom)
      || dateKeyInTimezone(new Date(), attendancePolicy.timezone).slice(0, 7);
    if (!MONTH_KEY_PATTERN.test(effectiveFrom)) {
      return res.status(400).json({ message: "effectiveFrom must be in YYYY-MM format" });
    }
    const note = toTrimmedString(req.body?.note).slice(0, 240);
    const now = new Date();

    const revision = {
      monthlySalary: Math.round(monthlySalary * 100) / 100,
      effectiveFrom,
      note,
      setBy: req.user._id,
      setByName: req.user.name || "",
      setByRole: req.user.role,
      setAt: now,
    };

    await EmployeeSalary.updateOne(
      { companyId: req.user.companyId, userId: target._id },
      // The filter's companyId and userId are written on the insert.
      { $push: { revisions: revision } },
      { upsert: true, runValidators: true },
    );

    await writeAuditLog({
      companyId: req.user.companyId,
      actor: req.user,
      action: "SALARY_SET",
      entityType: "EmployeeSalary",
      entityId: target._id,
      metadata: { monthlySalary: revision.monthlySalary, effectiveFrom, note },
      req,
    });

    return res.json({
      message: `Salary for ${target.name || "employee"} saved`,
      revision: toRevisionView(revision, { withAuthor: true }),
    });
  } catch (error) {
    return handleError(req, res, error, "setUserSalary failed");
  }
};

exports.getPayrollPolicy = async (req, res) => {
  try {
    if (!req.user?.companyId) return res.status(403).json({ message: "Company context is required" });
    if (!canManagePayroll(req.user.role)) {
      return res.status(403).json({ message: "Only admins and managers can view the deduction rules" });
    }
    const policy = await loadPayrollPolicy(req.user.companyId);
    return res.json({ policy: policy.rules, updatedAt: policy.updatedAt, updatedByName: policy.updatedByName, isDefault: policy.isDefault });
  } catch (error) {
    return handleError(req, res, error, "getPayrollPolicy failed");
  }
};

const POLICY_NUMBER_FIELDS = {
  fixedDaysPerMonth: { min: 1, max: 31, integer: true, label: "Fixed days per month" },
  absentDays: { min: 0, max: 5, label: "Absent" },
  unapprovedLeaveDays: { min: 0, max: 5, label: "Unapproved leave" },
  halfDayDays: { min: 0, max: 5, label: "Half day" },
  unpaidLeaveDays: { min: 0, max: 5, label: "Unpaid leave" },
  paidLeaveDays: { min: 0, max: 5, label: "Paid leave" },
  lateGraceCount: { min: 0, max: 31, integer: true, label: "Free late check-ins" },
  lateEveryCount: { min: 1, max: 31, integer: true, label: "Late check-ins per deduction" },
};

/**
 * Checks a rules update field by field. A bad value is refused with a message
 * naming it rather than quietly clamped: whoever sets pay rules should know
 * exactly what was saved.
 */
const validatePolicyUpdate = (body = {}, current) => {
  const next = { ...current };

  if (body.perDayBasis !== undefined) {
    if (!Object.values(PER_DAY_BASIS).includes(body.perDayBasis)) return { error: "Choose how the per-day salary is worked out" };
    next.perDayBasis = body.perDayBasis;
  }
  if (body.lateDeductionUnit !== undefined) {
    if (!Object.values(LATE_DEDUCTION_UNIT).includes(body.lateDeductionUnit)) return { error: "Late deduction must be in days of pay or an amount" };
    next.lateDeductionUnit = body.lateDeductionUnit;
  }

  for (const [field, rule] of Object.entries(POLICY_NUMBER_FIELDS)) {
    if (body[field] === undefined) continue;
    const value = Number(body[field]);
    if (!Number.isFinite(value) || value < rule.min || value > rule.max || (rule.integer && !Number.isInteger(value))) {
      return { error: `${rule.label} must be ${rule.integer ? "a whole number " : ""}between ${rule.min} and ${rule.max}` };
    }
    next[field] = value;
  }

  if (body.lateDeductionValue !== undefined) {
    const value = Number(body.lateDeductionValue);
    const max = next.lateDeductionUnit === LATE_DEDUCTION_UNIT.AMOUNT ? 100000 : 5;
    if (!Number.isFinite(value) || value < 0 || value > max) {
      return { error: `Late deduction must be between 0 and ${max}${next.lateDeductionUnit === LATE_DEDUCTION_UNIT.AMOUNT ? "" : " days"}` };
    }
    next.lateDeductionValue = value;
  } else if (next.lateDeductionUnit === LATE_DEDUCTION_UNIT.DAYS && next.lateDeductionValue > 5) {
    return { error: "Late deduction must be between 0 and 5 days" };
  }

  return { policy: next };
};

exports.updatePayrollPolicy = async (req, res) => {
  try {
    if (!req.user?.companyId) return res.status(403).json({ message: "Company context is required" });
    if (!canManagePayroll(req.user.role)) {
      return res.status(403).json({ message: "Only admins and managers can change the deduction rules" });
    }

    const current = await loadPayrollPolicy(req.user.companyId);
    const { policy, error } = validatePolicyUpdate(req.body || {}, current.rules);
    if (error) return res.status(400).json({ message: error });

    const saved = await PayrollPolicy.findOneAndUpdate(
      { companyId: req.user.companyId },
      { $set: { ...policy, updatedBy: req.user._id, updatedByName: req.user.name || "" } },
      { upsert: true, returnDocument: "after", runValidators: true },
    ).lean();

    await writeAuditLog({
      companyId: req.user.companyId,
      actor: req.user,
      action: "PAYROLL_POLICY_UPDATED",
      entityType: "PayrollPolicy",
      entityId: saved?._id,
      metadata: { before: current.rules, after: policy },
      req,
    });

    return res.json({
      message: "Deduction rules saved",
      policy: toPayrollPolicyView(saved),
      updatedAt: saved?.updatedAt || null,
      updatedByName: saved?.updatedByName || "",
      isDefault: false,
    });
  } catch (error) {
    return handleError(req, res, error, "updatePayrollPolicy failed");
  }
};

module.exports.validatePolicyUpdate = validatePolicyUpdate;
