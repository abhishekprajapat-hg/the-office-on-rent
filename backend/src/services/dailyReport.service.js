/*
 * Daily reports: checking a submission against its form, working out whose
 * reports a viewer may see, and adding up a period (requirements 16 Oct 2026,
 * sections 01-02).
 *
 * Totals are plain sums. A missing report is never read as zero: averages
 * divide by the days that have a report, and the days someone worked without
 * reporting are listed on their own.
 */
const User = require("../models/User");
const { USER_ROLES, MANAGEMENT_ROLES } = require("../constants/role.constants");
const { getDescendantUsers } = require("./hierarchy.service");
const {
  DAILY_REPORT_FORMS,
  ISSUE_CATEGORIES,
  ISSUE_STATUSES,
  ISSUE_PRIORITIES,
  MAX_COUNT,
  MAX_TEXT,
  MAX_ISSUES,
  resolveDailyReportFormKey,
  getDailyReportForm,
} = require("../constants/dailyReport.constants");

const DATE_KEY = /^\d{4}-\d{2}-\d{2}$/;

class DailyReportValidationError extends Error {
  constructor(message, field = "") {
    super(message);
    this.name = "DailyReportValidationError";
    this.statusCode = 400;
    this.field = field;
  }
}

const trimText = (value, max = MAX_TEXT) => String(value ?? "").trim().slice(0, max);

/*
 * Turns a submitted body into { counts, notes, issues } for the given form.
 * Every count field must be present (0 is fine); text fields are optional.
 */
const normalizeSubmission = (formKey, body = {}) => {
  const form = getDailyReportForm(formKey);
  if (!form) throw new DailyReportValidationError("No daily report form applies to this role");

  const rawCounts = body.counts && typeof body.counts === "object" ? body.counts : {};
  const rawNotes = body.notes && typeof body.notes === "object" ? body.notes : {};
  const counts = {};
  const notes = {};

  for (const field of form.fields) {
    if (field.kind === "count") {
      const raw = rawCounts[field.key];
      if (raw === undefined || raw === null || String(raw).trim() === "") {
        throw new DailyReportValidationError(`${field.label} is required (enter 0 if none)`, field.key);
      }
      const value = Number(raw);
      if (!Number.isInteger(value) || value < 0) {
        throw new DailyReportValidationError(`${field.label} must be a whole number, 0 or more`, field.key);
      }
      const max = field.max ?? MAX_COUNT;
      if (value > max) {
        throw new DailyReportValidationError(`${field.label} must be between 0 and ${max}`, field.key);
      }
      counts[field.key] = value;
    } else {
      notes[field.key] = trimText(rawNotes[field.key]);
    }
  }

  // A part can't be bigger than the whole it belongs to.
  for (const field of form.fields) {
    if (field.partOf && counts[field.partOf] !== undefined) {
      const parts = form.fields.filter((f) => f.partOf === field.partOf);
      const sum = parts.reduce((acc, f) => acc + (counts[f.key] || 0), 0);
      if (sum > counts[field.partOf]) {
        const parent = form.fields.find((f) => f.key === field.partOf);
        throw new DailyReportValidationError(
          `${parts.map((f) => f.label).join(" + ")} can't be more than ${parent.label}`,
          field.partOf,
        );
      }
    }
  }

  let issues = [];
  if (form.hasIssues) {
    const rawIssues = Array.isArray(body.issues) ? body.issues : [];
    if (rawIssues.length > MAX_ISSUES) {
      throw new DailyReportValidationError(`At most ${MAX_ISSUES} issues per report`, "issues");
    }
    const categories = ISSUE_CATEGORIES.map((c) => c.key);
    issues = rawIssues
      .map((issue, index) => {
        const category = String(issue?.category || "").toUpperCase();
        const description = trimText(issue?.description);
        if (!category && !description) return null; // an empty row left in the form
        if (!categories.includes(category)) {
          throw new DailyReportValidationError(`Issue ${index + 1}: choose a category`, "issues");
        }
        if (!description) {
          throw new DailyReportValidationError(`Issue ${index + 1}: add a short description`, "issues");
        }
        const status = String(issue?.status || "PENDING").toUpperCase();
        const priority = String(issue?.priority || "MEDIUM").toUpperCase();
        if (!ISSUE_STATUSES.includes(status)) throw new DailyReportValidationError(`Issue ${index + 1}: invalid status`, "issues");
        if (!ISSUE_PRIORITIES.includes(priority)) throw new DailyReportValidationError(`Issue ${index + 1}: invalid priority`, "issues");
        return {
          category,
          description,
          location: trimText(issue?.location, 200),
          actionTaken: trimText(issue?.actionTaken),
          status,
          priority,
        };
      })
      .filter(Boolean);
  }

  return { counts, notes, issues };
};

const USER_SELECT = "_id name email role roleType parentId isActive profileImageUrl";

/*
 * The people whose reports `viewer` may see: everyone for an Admin, their
 * team plus themselves for a Manager, only themselves for anyone else.
 */
const getScopedUsers = async (viewer, { includeInactive = false } = {}) => {
  if (!viewer?.companyId) return [];
  const activeFilter = includeInactive ? {} : { isActive: true };
  if (viewer.role === USER_ROLES.ADMIN) {
    return User.find({ companyId: viewer.companyId, ...activeFilter }).select(USER_SELECT).sort({ name: 1 }).lean();
  }
  if (MANAGEMENT_ROLES.includes(viewer.role)) {
    const team = await getDescendantUsers({
      rootUserId: viewer._id,
      companyId: viewer.companyId,
      includeInactive,
      select: USER_SELECT,
    });
    const me = await User.findOne({ _id: viewer._id, companyId: viewer.companyId }).select(USER_SELECT).lean();
    return [me, ...team].filter(Boolean).sort((a, b) => String(a.name).localeCompare(String(b.name)));
  }
  const me = await User.findOne({ _id: viewer._id, companyId: viewer.companyId }).select(USER_SELECT).lean();
  return me ? [me] : [];
};

const isManagerOrAdmin = (user) => user?.role === USER_ROLES.ADMIN || MANAGEMENT_ROLES.includes(user?.role);

const parseDateRange = (query = {}, todayKey) => {
  let from = String(query.from || query.date || "").trim();
  let to = String(query.to || query.date || "").trim();
  if (!from && !to) {
    from = todayKey;
    to = todayKey;
  }
  if (!from) from = to;
  if (!to) to = from;
  if (!DATE_KEY.test(from) || !DATE_KEY.test(to)) {
    throw new DailyReportValidationError("Dates must be YYYY-MM-DD", "from");
  }
  if (from > to) throw new DailyReportValidationError("Start date is after end date", "from");
  // Keep a single request sensible: a little over a year.
  const days = (Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86400000;
  if (days > 400) throw new DailyReportValidationError("Choose a range of 400 days or less", "to");
  return { from, to };
};

/*
 * Adds up one person's reports for a period.
 *   reports     - that person's DailyReport rows in the period
 *   workedDates - dates they checked in (and the day is over)
 * Returns totals per count field, averages over days with a report, and the
 * worked days with no report.
 */
const summarizeEmployee = ({ user, reports = [], workedDates = [] }) => {
  const sorted = [...reports].sort((a, b) => String(a.reportDate).localeCompare(String(b.reportDate)));
  const formKeys = [...new Set(sorted.map((r) => r.formKey))];
  const formKey = formKeys[formKeys.length - 1] || resolveDailyReportFormKey(user);
  const countKeys = new Set();
  sorted.forEach((r) => Object.keys(r.counts || {}).forEach((k) => countKeys.add(k)));

  const totals = {};
  countKeys.forEach((key) => {
    totals[key] = sorted.reduce((acc, r) => acc + (Number(r.counts?.[key]) || 0), 0);
  });
  const daysSubmitted = sorted.length;
  const averages = {};
  countKeys.forEach((key) => {
    averages[key] = daysSubmitted ? Math.round((totals[key] / daysSubmitted) * 100) / 100 : null;
  });
  const issueCounts = {};
  sorted.forEach((r) => (r.issues || []).forEach((i) => {
    issueCounts[i.category] = (issueCounts[i.category] || 0) + 1;
  }));

  const reported = new Set(sorted.map((r) => r.reportDate));
  const missingDates = [...new Set(workedDates)].filter((d) => !reported.has(d)).sort();

  return {
    user: user ? {
      _id: user._id, name: user.name || "", email: user.email || "", role: user.role || "", roleType: user.roleType || "",
    } : null,
    formKey,
    formKeys,
    daysSubmitted,
    averageDenominator: "days with a submitted report",
    totals,
    averages,
    issueCounts,
    missingDates,
    days: sorted.map((r) => ({
      _id: r._id,
      reportDate: r.reportDate,
      formKey: r.formKey,
      counts: r.counts || {},
      notes: r.notes || {},
      issues: r.issues || [],
      submittedAt: r.submittedAt,
      amended: (r.amendments || []).length > 0,
      amendmentCount: (r.amendments || []).length,
    })),
  };
};

const publicForm = (form) => form && ({
  key: form.key,
  label: form.label,
  hasIssues: Boolean(form.hasIssues),
  fields: form.fields.map((f) => ({ ...f })),
});

module.exports = {
  DailyReportValidationError,
  normalizeSubmission,
  getScopedUsers,
  isManagerOrAdmin,
  parseDateRange,
  summarizeEmployee,
  publicForm,
  DAILY_REPORT_FORMS,
  ISSUE_CATEGORIES,
  ISSUE_STATUSES,
  ISSUE_PRIORITIES,
};
