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
  DEDUCTION_UNIT,
  DEDUCTION_UNIT_LIMITS,
  DEDUCTION_RULE_KEYS,
  DEDUCTION_FREQUENCY,
  CUSTOM_DEDUCTION_SCOPE,
  EMPLOYEE_RULE_FIELDS,
  mergeEmployeeRules,
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
    customDeductions: stored?.customDeductions || [],
    updatedAt: stored?.updatedAt || null,
    updatedByName: stored?.updatedByName || "",
    isDefault: !stored,
  };
};

const toCustomDeductionView = (item, scope) => ({
  _id: item._id,
  name: item.name || "",
  unit: item.unit,
  value: Number(item.value || 0),
  frequency: item.frequency || DEDUCTION_FREQUENCY.MONTHLY,
  fromMonth: item.fromMonth,
  toMonth: item.toMonth || "",
  scope,
  createdByName: item.createdByName || "",
  createdAt: item.createdAt || null,
  updatedByName: item.updatedByName || "",
  updatedAt: item.updatedAt || null,
});

// Newest schedule first, so what applies now sits at the top.
const toCustomDeductionViews = (items = [], scope) => [...items]
  .sort((left, right) => String(right.fromMonth).localeCompare(String(left.fromMonth))
    || String(left.name).localeCompare(String(right.name)))
  .map((item) => toCustomDeductionView(item, scope));

const toCalcDeduction = (item, scope) => ({ ...toCustomDeductionView(item, scope), id: String(item._id) });

const pickRuleFields = (source = {}) => Object.fromEntries(
  EMPLOYEE_RULE_FIELDS.filter((field) => source[field] !== undefined).map((field) => [field, source[field]]),
);

// One person's own deduction amounts as the screens read them, or null.
const toEmployeeRulesView = (stored, companyRules) => {
  if (!stored) return null;
  return {
    ...pickRuleFields(mergeEmployeeRules(companyRules, stored)),
    updatedByName: stored.updatedByName || "",
    updatedAt: stored.updatedAt || null,
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
const buildSalaryRows = async ({ companyId, users, monthKey, rules, companyDeductions = [] }) => {
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
    // A manager may have set this person's own amounts ("₹1,000 per absent day").
    const effectiveRules = mergeEmployeeRules(rules, doc?.deductionRules);
    const calculation = inForce
      ? calculateMonthlySalary({
        monthKey,
        todayKey,
        monthlySalary: inForce.monthlySalary,
        policy: effectiveRules,
        weeklyOffDays: attendancePolicy.weeklyOffDays,
        days: daysByUser.get(key)?.attendance || [],
        unapprovedLeaveDates: unapprovedByUser.get(key) || [],
        joiningKey: user.joiningDate ? dateKeyInTimezone(user.joiningDate, timezone) : "",
        customDeductions: [
          ...companyDeductions.map((item) => toCalcDeduction(item, CUSTOM_DEDUCTION_SCOPE.COMPANY)),
          ...(doc?.deductions || []).map((item) => toCalcDeduction(item, CUSTOM_DEDUCTION_SCOPE.EMPLOYEE)),
        ],
      })
      : null;

    return {
      user: toUserView(user),
      salary: calculation,
      salaryEffectiveFrom: inForce?.effectiveFrom || null,
      latestMonthlySalary: revisions.length ? Number(revisions[0].monthlySalary) : null,
      revisions,
      deductions: doc?.deductions || [],
      deductionRules: doc?.deductionRules || null,
      ownRules: Boolean(doc?.deductionRules),
      effectiveRules,
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
      companyDeductions: policy.customDeductions,
    });
    const [row] = rows;

    return res.json({
      month: monthKey,
      timezone,
      policy: row.effectiveRules,
      ownRules: row.ownRules,
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
      companyDeductions: policy.customDeductions,
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
        ownRules: row.ownRules,
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
      companyDeductions: policy.customDeductions,
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
      // This person's own named deductions, for the people who manage them.
      deductions: withAuthor ? toCustomDeductionViews(row.deductions, CUSTOM_DEDUCTION_SCOPE.EMPLOYEE) : [],
      // Their own attendance amounts (null: the company's apply), and the
      // company's, which a form starts from when none are set yet.
      ownRules: row.ownRules,
      deductionRules: withAuthor ? toEmployeeRulesView(row.deductionRules, policy.rules) : null,
      companyRules: policy.rules,
      effectiveRules: row.effectiveRules,
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
    return res.json({
      policy: policy.rules,
      customDeductions: toCustomDeductionViews(policy.customDeductions, CUSTOM_DEDUCTION_SCOPE.COMPANY),
      updatedAt: policy.updatedAt,
      updatedByName: policy.updatedByName,
      isDefault: policy.isDefault,
    });
  } catch (error) {
    return handleError(req, res, error, "getPayrollPolicy failed");
  }
};

const POLICY_NUMBER_FIELDS = {
  fixedDaysPerMonth: { min: 1, max: 31, label: "Fixed days per month" },
  lateGraceCount: { min: 0, max: 31, label: "Free late check-ins" },
  lateEveryCount: { min: 1, max: 31, label: "Late check-ins per deduction" },
};

const DEDUCTION_RULE_LABELS = {
  absent: "Absent",
  unapprovedLeave: "Unapproved leave",
  halfDay: "Half day",
  unpaidLeave: "Unpaid leave",
  paidLeave: "Paid leave",
  late: "Late check-in deduction",
};

const UNIT_RANGE_TEXT = {
  [DEDUCTION_UNIT.DAYS]: "between 0 and 5 days of pay",
  [DEDUCTION_UNIT.AMOUNT]: "between ₹0 and ₹1,00,000",
  [DEDUCTION_UNIT.PERCENT]: "between 0% and 100% of salary",
};

/**
 * Checks a rules update field by field. A bad value is refused with a message
 * naming it rather than quietly clamped: whoever sets pay rules should know
 * exactly what was saved.
 *
 * A deduction rule is { unit, value }, and its value is checked against its
 * own unit - 2 is fine as days of pay, and as a percentage, but 2,00,000 is
 * only ever too much.
 */
const validatePolicyUpdate = (body = {}, current) => {
  const next = { ...current };

  if (body.perDayBasis !== undefined) {
    if (!Object.values(PER_DAY_BASIS).includes(body.perDayBasis)) return { error: "Choose how the per-day salary is worked out" };
    next.perDayBasis = body.perDayBasis;
  }

  for (const [field, rule] of Object.entries(POLICY_NUMBER_FIELDS)) {
    if (body[field] === undefined) continue;
    const value = Number(body[field]);
    if (!Number.isInteger(value) || value < rule.min || value > rule.max) {
      return { error: `${rule.label} must be a whole number between ${rule.min} and ${rule.max}` };
    }
    next[field] = value;
  }

  for (const key of DEDUCTION_RULE_KEYS) {
    if (body[key] === undefined) continue;
    const label = DEDUCTION_RULE_LABELS[key];
    const sent = body[key];
    if (!sent || typeof sent !== "object") return { error: `${label} needs a unit and a value` };
    const unit = sent.unit === undefined ? current[key].unit : sent.unit;
    if (!Object.values(DEDUCTION_UNIT).includes(unit)) {
      return { error: `${label} must be in days of pay, rupees or a percentage of salary` };
    }
    const value = Number(sent.value === undefined ? current[key].value : sent.value);
    if (!Number.isFinite(value) || value < 0 || value > DEDUCTION_UNIT_LIMITS[unit]) {
      return { error: `${label} must be ${UNIT_RANGE_TEXT[unit]}` };
    }
    next[key] = { unit, value };
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
      customDeductions: toCustomDeductionViews(saved?.customDeductions || [], CUSTOM_DEDUCTION_SCOPE.COMPANY),
      updatedAt: saved?.updatedAt || null,
      updatedByName: saved?.updatedByName || "",
      isDefault: false,
    });
  } catch (error) {
    return handleError(req, res, error, "updatePayrollPolicy failed");
  }
};

/* ------------------------------------------------------ named deductions -- */

const MAX_CUSTOM_DEDUCTIONS = 50;

const CUSTOM_LIMIT_TEXT = {
  [DEDUCTION_UNIT.DAYS]: "5 days of pay",
  [DEDUCTION_UNIT.AMOUNT]: "₹1,00,000",
  [DEDUCTION_UNIT.PERCENT]: "100% of salary",
};

/**
 * A named deduction from a request body, merged over the one being edited.
 * Returns { deduction } or { error } - never a half-checked value.
 */
const validateCustomDeduction = (body = {}, existing = null) => {
  const pick = (field) => (body[field] === undefined ? existing?.[field] : body[field]);

  const name = String(pick("name") ?? "").trim();
  if (!name || name.length > 60) return { error: "Give the deduction a name of up to 60 characters" };

  const unit = pick("unit");
  if (!Object.values(DEDUCTION_UNIT).includes(unit)) {
    return { error: "Choose days of pay, rupees or a percentage of salary" };
  }
  const value = Number(pick("value"));
  if (!Number.isFinite(value) || value <= 0 || value > DEDUCTION_UNIT_LIMITS[unit]) {
    return { error: `${name} must be more than 0 and at most ${CUSTOM_LIMIT_TEXT[unit]}` };
  }

  const frequency = pick("frequency") || DEDUCTION_FREQUENCY.MONTHLY;
  if (!Object.values(DEDUCTION_FREQUENCY).includes(frequency)) {
    return { error: "Choose every month or one month only" };
  }
  const fromMonth = String(pick("fromMonth") || "").trim();
  if (!MONTH_KEY_PATTERN.test(fromMonth)) {
    return { error: frequency === DEDUCTION_FREQUENCY.ONCE ? "Choose the month" : "Choose the month it starts from" };
  }
  let toMonth = "";
  if (frequency === DEDUCTION_FREQUENCY.ONCE) {
    toMonth = fromMonth;
  } else {
    toMonth = String(pick("toMonth") || "").trim();
    if (toMonth && !MONTH_KEY_PATTERN.test(toMonth)) return { error: "The end month must be a month" };
    if (toMonth && toMonth < fromMonth) return { error: "The end month cannot be before the start month" };
  }

  return { deduction: { name, unit, value, frequency, fromMonth, toMonth } };
};

const isObjectId = (value) => /^[a-f\d]{24}$/i.test(String(value || ""));

const requirePayrollManager = (req, res) => {
  if (!req.user?.companyId) {
    res.status(403).json({ message: "Company context is required" });
    return false;
  }
  if (!canManagePayroll(req.user.role)) {
    res.status(403).json({ message: "Only admins and managers can manage salary deductions" });
    return false;
  }
  return true;
};

const stamp = (req, now) => ({ updatedByName: req.user.name || "", updatedAt: now });

/* Company-wide: everybody with a salary pays these. */

exports.addCompanyDeduction = async (req, res) => {
  try {
    if (!requirePayrollManager(req, res)) return null;
    const { deduction, error } = validateCustomDeduction(req.body);
    if (error) return res.status(400).json({ message: error });

    const current = await PayrollPolicy.findOne({ companyId: req.user.companyId }).select("customDeductions").lean();
    if ((current?.customDeductions || []).length >= MAX_CUSTOM_DEDUCTIONS) {
      return res.status(400).json({ message: `A company can have up to ${MAX_CUSTOM_DEDUCTIONS} named deductions` });
    }

    const now = new Date();
    const saved = await PayrollPolicy.findOneAndUpdate(
      { companyId: req.user.companyId },
      {
        $push: {
          customDeductions: {
            ...deduction,
            createdBy: req.user._id,
            createdByName: req.user.name || "",
            createdAt: now,
            ...stamp(req, now),
          },
        },
      },
      { upsert: true, returnDocument: "after", runValidators: true },
    ).lean();

    await writeAuditLog({
      companyId: req.user.companyId, actor: req.user, action: "SALARY_DEDUCTION_ADDED",
      entityType: "PayrollPolicy", entityId: saved?._id, metadata: { scope: "COMPANY", ...deduction }, req,
    });

    return res.status(201).json({
      message: `${deduction.name} added for everybody`,
      customDeductions: toCustomDeductionViews(saved?.customDeductions || [], CUSTOM_DEDUCTION_SCOPE.COMPANY),
    });
  } catch (error) {
    return handleError(req, res, error, "addCompanyDeduction failed");
  }
};

const findCompanyDeduction = async (companyId, deductionId) => {
  const doc = await PayrollPolicy.findOne(
    { companyId, "customDeductions._id": deductionId },
    { "customDeductions.$": 1 },
  ).lean();
  return doc?.customDeductions?.[0] || null;
};

exports.updateCompanyDeduction = async (req, res) => {
  try {
    if (!requirePayrollManager(req, res)) return null;
    const deductionId = String(req.params?.deductionId || "");
    if (!isObjectId(deductionId)) return res.status(400).json({ message: "Valid deduction is required" });

    const existing = await findCompanyDeduction(req.user.companyId, deductionId);
    if (!existing) return res.status(404).json({ message: "Deduction not found" });
    const { deduction, error } = validateCustomDeduction(req.body, existing);
    if (error) return res.status(400).json({ message: error });

    const now = new Date();
    const set = Object.fromEntries(
      Object.entries({ ...deduction, ...stamp(req, now) }).map(([field, value]) => [`customDeductions.$.${field}`, value]),
    );
    const saved = await PayrollPolicy.findOneAndUpdate(
      { companyId: req.user.companyId, "customDeductions._id": deductionId },
      { $set: set },
      { returnDocument: "after", runValidators: true },
    ).lean();
    if (!saved) return res.status(404).json({ message: "Deduction not found" });

    await writeAuditLog({
      companyId: req.user.companyId, actor: req.user, action: "SALARY_DEDUCTION_UPDATED",
      entityType: "PayrollPolicy", entityId: saved._id,
      metadata: { scope: "COMPANY", deductionId, before: toCustomDeductionView(existing, "COMPANY"), after: deduction }, req,
    });

    return res.json({
      message: `${deduction.name} updated`,
      customDeductions: toCustomDeductionViews(saved.customDeductions || [], CUSTOM_DEDUCTION_SCOPE.COMPANY),
    });
  } catch (error) {
    return handleError(req, res, error, "updateCompanyDeduction failed");
  }
};

exports.removeCompanyDeduction = async (req, res) => {
  try {
    if (!requirePayrollManager(req, res)) return null;
    const deductionId = String(req.params?.deductionId || "");
    if (!isObjectId(deductionId)) return res.status(400).json({ message: "Valid deduction is required" });

    const existing = await findCompanyDeduction(req.user.companyId, deductionId);
    if (!existing) return res.status(404).json({ message: "Deduction not found" });

    const saved = await PayrollPolicy.findOneAndUpdate(
      { companyId: req.user.companyId },
      { $pull: { customDeductions: { _id: deductionId } } },
      { returnDocument: "after" },
    ).lean();

    await writeAuditLog({
      companyId: req.user.companyId, actor: req.user, action: "SALARY_DEDUCTION_REMOVED",
      entityType: "PayrollPolicy", entityId: saved?._id,
      metadata: { scope: "COMPANY", deductionId, removed: toCustomDeductionView(existing, "COMPANY") }, req,
    });

    return res.json({
      message: `${existing.name} removed`,
      customDeductions: toCustomDeductionViews(saved?.customDeductions || [], CUSTOM_DEDUCTION_SCOPE.COMPANY),
    });
  } catch (error) {
    return handleError(req, res, error, "removeCompanyDeduction failed");
  }
};

// For the delete-approval request a manager's removal turns into.
exports.describeCompanyDeduction = async ({ id, companyId }) => {
  const item = isObjectId(id) ? await findCompanyDeduction(companyId, id) : null;
  return item ? `${item.name} (everybody)` : null;
};

/* One person: kept on their salary record. */

/*
 * Who may change one person's deductions: the same people who may set their
 * salary - an admin, or their manager - and never the person themselves.
 * Runs as route middleware too, so a manager's removal is checked before it
 * becomes a request for an admin to approve.
 */
exports.ensureEmployeeDeductionAccess = async (req, res, next) => {
  try {
    if (!requirePayrollManager(req, res)) return null;
    const target = await loadManageableTarget(req, res, String(req.params?.userId || ""), { forWrite: true });
    if (!target) return null;
    req.salaryTarget = target;
    return next();
  } catch (error) {
    return handleError(req, res, error, "ensureEmployeeDeductionAccess failed");
  }
};

const findEmployeeDeduction = async (companyId, userId, deductionId) => {
  const doc = await EmployeeSalary.findOne(
    { companyId, userId, "deductions._id": deductionId },
    { "deductions.$": 1 },
  ).lean();
  return doc?.deductions?.[0] || null;
};

const resolveTarget = async (req, res) => {
  if (req.salaryTarget) return req.salaryTarget;
  // Reached without the route middleware - an approved delete request, run
  // for the approving admin - so check again here.
  let target = null;
  await exports.ensureEmployeeDeductionAccess(req, res, () => { target = req.salaryTarget; });
  return target;
};

exports.addEmployeeDeduction = async (req, res) => {
  try {
    const target = await resolveTarget(req, res);
    if (!target) return null;
    const { deduction, error } = validateCustomDeduction(req.body);
    if (error) return res.status(400).json({ message: error });

    const current = await EmployeeSalary.findOne({ companyId: req.user.companyId, userId: target._id }).select("deductions").lean();
    if ((current?.deductions || []).length >= MAX_CUSTOM_DEDUCTIONS) {
      return res.status(400).json({ message: `A person can have up to ${MAX_CUSTOM_DEDUCTIONS} named deductions` });
    }

    const now = new Date();
    const saved = await EmployeeSalary.findOneAndUpdate(
      { companyId: req.user.companyId, userId: target._id },
      {
        $push: {
          deductions: {
            ...deduction,
            createdBy: req.user._id,
            createdByName: req.user.name || "",
            createdAt: now,
            ...stamp(req, now),
          },
        },
      },
      { upsert: true, returnDocument: "after", runValidators: true },
    ).lean();

    await writeAuditLog({
      companyId: req.user.companyId, actor: req.user, action: "SALARY_DEDUCTION_ADDED",
      entityType: "EmployeeSalary", entityId: target._id, metadata: { scope: "EMPLOYEE", ...deduction }, req,
    });

    return res.status(201).json({
      message: `${deduction.name} added for ${target.name || "this person"}`,
      deductions: toCustomDeductionViews(saved?.deductions || [], CUSTOM_DEDUCTION_SCOPE.EMPLOYEE),
    });
  } catch (error) {
    return handleError(req, res, error, "addEmployeeDeduction failed");
  }
};

exports.updateEmployeeDeduction = async (req, res) => {
  try {
    const target = await resolveTarget(req, res);
    if (!target) return null;
    const deductionId = String(req.params?.deductionId || "");
    if (!isObjectId(deductionId)) return res.status(400).json({ message: "Valid deduction is required" });

    const existing = await findEmployeeDeduction(req.user.companyId, target._id, deductionId);
    if (!existing) return res.status(404).json({ message: "Deduction not found" });
    const { deduction, error } = validateCustomDeduction(req.body, existing);
    if (error) return res.status(400).json({ message: error });

    const now = new Date();
    const set = Object.fromEntries(
      Object.entries({ ...deduction, ...stamp(req, now) }).map(([field, value]) => [`deductions.$.${field}`, value]),
    );
    const saved = await EmployeeSalary.findOneAndUpdate(
      { companyId: req.user.companyId, userId: target._id, "deductions._id": deductionId },
      { $set: set },
      { returnDocument: "after", runValidators: true },
    ).lean();
    if (!saved) return res.status(404).json({ message: "Deduction not found" });

    await writeAuditLog({
      companyId: req.user.companyId, actor: req.user, action: "SALARY_DEDUCTION_UPDATED",
      entityType: "EmployeeSalary", entityId: target._id,
      metadata: { scope: "EMPLOYEE", deductionId, before: toCustomDeductionView(existing, "EMPLOYEE"), after: deduction }, req,
    });

    return res.json({
      message: `${deduction.name} updated`,
      deductions: toCustomDeductionViews(saved.deductions || [], CUSTOM_DEDUCTION_SCOPE.EMPLOYEE),
    });
  } catch (error) {
    return handleError(req, res, error, "updateEmployeeDeduction failed");
  }
};

exports.removeEmployeeDeduction = async (req, res) => {
  try {
    const target = await resolveTarget(req, res);
    if (!target) return null;
    const deductionId = String(req.params?.deductionId || "");
    if (!isObjectId(deductionId)) return res.status(400).json({ message: "Valid deduction is required" });

    const existing = await findEmployeeDeduction(req.user.companyId, target._id, deductionId);
    if (!existing) return res.status(404).json({ message: "Deduction not found" });

    const saved = await EmployeeSalary.findOneAndUpdate(
      { companyId: req.user.companyId, userId: target._id },
      { $pull: { deductions: { _id: deductionId } } },
      { returnDocument: "after" },
    ).lean();

    await writeAuditLog({
      companyId: req.user.companyId, actor: req.user, action: "SALARY_DEDUCTION_REMOVED",
      entityType: "EmployeeSalary", entityId: target._id,
      metadata: { scope: "EMPLOYEE", deductionId, removed: toCustomDeductionView(existing, "EMPLOYEE") }, req,
    });

    return res.json({
      message: `${existing.name} removed`,
      deductions: toCustomDeductionViews(saved?.deductions || [], CUSTOM_DEDUCTION_SCOPE.EMPLOYEE),
    });
  } catch (error) {
    return handleError(req, res, error, "removeEmployeeDeduction failed");
  }
};

/*
 * One person's own attendance deductions: "₹1,000 for each absent day, ₹500 for
 * a half day" in place of the company's rules - a fixed amount means something
 * different on ₹30,000 than on ₹90,000. { useCompanyRules: true } goes back to
 * the company's rules. Same people as everything else on a person's pay: an
 * admin, or their manager, never themselves.
 */
exports.setEmployeeRules = async (req, res) => {
  try {
    const target = await resolveTarget(req, res);
    if (!target) return null;
    const company = await loadPayrollPolicy(req.user.companyId);
    const filter = { companyId: req.user.companyId, userId: target._id };
    const now = new Date();

    if (req.body?.useCompanyRules === true) {
      await EmployeeSalary.updateOne(filter, { $set: { deductionRules: null } }, { upsert: true });
      await writeAuditLog({
        companyId: req.user.companyId, actor: req.user, action: "SALARY_RULES_RESET",
        entityType: "EmployeeSalary", entityId: target._id, metadata: {}, req,
      });
      return res.json({
        message: `${target.name || "This person"} now follows the company's deduction rules`,
        deductionRules: null,
        effectiveRules: company.rules,
      });
    }

    const existing = await EmployeeSalary.findOne(filter).select("deductionRules").lean();
    const current = mergeEmployeeRules(company.rules, existing?.deductionRules);
    const { policy, error } = validatePolicyUpdate(pickRuleFields(req.body || {}), current);
    if (error) return res.status(400).json({ message: error });

    const own = pickRuleFields(policy);
    const stored = { ...own, updatedBy: req.user._id, updatedByName: req.user.name || "", updatedAt: now };
    await EmployeeSalary.updateOne(filter, { $set: { deductionRules: stored } }, { upsert: true, runValidators: true });

    await writeAuditLog({
      companyId: req.user.companyId, actor: req.user, action: "SALARY_RULES_SET",
      entityType: "EmployeeSalary", entityId: target._id,
      metadata: { before: existing?.deductionRules ? pickRuleFields(existing.deductionRules) : null, after: own }, req,
    });

    return res.json({
      message: `Deductions for ${target.name || "this person"} saved`,
      deductionRules: toEmployeeRulesView(stored, company.rules),
      effectiveRules: mergeEmployeeRules(company.rules, own),
    });
  } catch (error) {
    return handleError(req, res, error, "setEmployeeRules failed");
  }
};

exports.describeEmployeeDeduction = async ({ id, companyId }) => {
  if (!isObjectId(id)) return null;
  const doc = await EmployeeSalary.findOne(
    { companyId, "deductions._id": id },
    { "deductions.$": 1, userId: 1 },
  ).lean();
  const item = doc?.deductions?.[0];
  if (!item) return null;
  const person = await User.findOne({ _id: doc.userId, companyId }).select("name").lean();
  return `${item.name}${person?.name ? ` (${person.name})` : ""}`;
};

module.exports.validatePolicyUpdate = validatePolicyUpdate;
module.exports.validateCustomDeduction = validateCustomDeduction;
