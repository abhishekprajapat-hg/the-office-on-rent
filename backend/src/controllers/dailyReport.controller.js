const mongoose = require("mongoose");
const DailyReport = require("../models/DailyReport");
const Attendance = require("../models/Attendance");
const { writeAuditLog } = require("../services/auditLog.service");
const {
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
} = require("../services/dailyReport.service");
const { resolveDailyReportFormKey, getDailyReportForm } = require("../constants/dailyReport.constants");

const attendance = () => require("./attendance.controller");

const todayKeyFor = async (companyId) => {
  const { resolvePolicyForCompany, toDateKeyInTimezone } = attendance();
  const policy = await resolvePolicyForCompany(companyId);
  return toDateKeyInTimezone(new Date(), policy.timezone);
};

const handleError = (req, res, error, label) => {
  if (error instanceof DailyReportValidationError) {
    return res.status(400).json({ message: error.message, field: error.field });
  }
  if (error?.code === 11000) {
    return res.status(409).json({ message: "Today's report has already been submitted. Use Edit to correct it." });
  }
  req.log?.error?.({ error: error.message, message: label });
  return res.status(500).json({ message: "Something went wrong with daily reports" });
};

const reportView = (report) => report && ({
  _id: report._id,
  userId: report.userId,
  reportDate: report.reportDate,
  formKey: report.formKey,
  role: report.role,
  roleType: report.roleType,
  counts: report.counts || {},
  notes: report.notes || {},
  issues: report.issues || [],
  submittedAt: report.submittedAt,
  updatedAt: report.updatedAt,
  amendments: (report.amendments || []).map((a) => ({
    at: a.at, by: a.by, byName: a.byName, reason: a.reason, previous: a.previous,
  })),
});

/* GET /forms - every form definition, for the manager screens and exports. */
exports.listForms = async (req, res) => res.json({
  forms: Object.values(DAILY_REPORT_FORMS).map(publicForm),
  issueCategories: ISSUE_CATEGORIES,
  issueStatuses: ISSUE_STATUSES,
  issuePriorities: ISSUE_PRIORITIES,
});

/* GET /me/today - my form, today's date and today's report if I sent it. */
exports.getMyToday = async (req, res) => {
  try {
    const reportDate = await todayKeyFor(req.user.companyId);
    const formKey = resolveDailyReportFormKey(req.user);
    const report = formKey
      ? await DailyReport.findOne({ companyId: req.user.companyId, userId: req.user._id, reportDate }).lean()
      : null;
    return res.json({
      reportDate,
      required: Boolean(formKey),
      form: publicForm(getDailyReportForm(formKey)),
      report: reportView(report),
      submitted: Boolean(report),
    });
  } catch (error) {
    return handleError(req, res, error, "getMyToday failed");
  }
};

/* POST / - submit today's report. */
exports.submitReport = async (req, res) => {
  try {
    const formKey = resolveDailyReportFormKey(req.user);
    if (!formKey) return res.status(400).json({ message: "Your role does not have a daily report" });
    const reportDate = await todayKeyFor(req.user.companyId);
    const payload = normalizeSubmission(formKey, req.body || {});
    const report = await DailyReport.create({
      companyId: req.user.companyId,
      userId: req.user._id,
      reportDate,
      formKey,
      role: req.user.role,
      roleType: req.user.roleType || "",
      ...payload,
      submittedAt: new Date(),
    });
    return res.status(201).json({ message: "Daily report submitted", report: reportView(report.toObject()) });
  } catch (error) {
    return handleError(req, res, error, "submitReport failed");
  }
};

/*
 * PATCH /:reportId - correct a report. The owner may fix their own report on
 * the same day; a Manager (own team) or Admin may correct any report with a
 * reason. The old values are kept in the report's history and the audit log.
 */
exports.amendReport = async (req, res) => {
  try {
    const { reportId } = req.params;
    if (!mongoose.isValidObjectId(reportId)) return res.status(400).json({ message: "Invalid report id" });
    const report = await DailyReport.findOne({ _id: reportId, companyId: req.user.companyId });
    if (!report) return res.status(404).json({ message: "Report not found" });

    const isOwner = String(report.userId) === String(req.user._id);
    const today = await todayKeyFor(req.user.companyId);
    const reason = String(req.body?.reason || "").trim().slice(0, 500);

    let allowed = false;
    if (isOwner && report.reportDate === today) allowed = true;
    if (!allowed && isManagerOrAdmin(req.user)) {
      const scoped = await getScopedUsers(req.user, { includeInactive: true });
      allowed = scoped.some((u) => String(u._id) === String(report.userId));
      if (allowed && !reason) {
        return res.status(400).json({ message: "Add a reason for the correction", field: "reason" });
      }
    }
    if (!allowed) {
      return res.status(403).json({
        message: isOwner
          ? "You can only edit today's report. Ask your manager to correct an earlier one."
          : "You can't edit this report",
      });
    }

    const payload = normalizeSubmission(report.formKey, req.body || {});
    const previous = { counts: report.counts, notes: report.notes, issues: report.issues };
    report.amendments.push({ by: req.user._id, byName: req.user.name || "", reason, previous, at: new Date() });
    report.counts = payload.counts;
    report.notes = payload.notes;
    report.issues = payload.issues;
    report.markModified("counts");
    report.markModified("notes");
    await report.save();

    await writeAuditLog({
      companyId: req.user.companyId,
      actor: req.user,
      action: "DAILY_REPORT_AMENDED",
      entityType: "DailyReport",
      entityId: report._id,
      metadata: { reportDate: report.reportDate, userId: String(report.userId), reason, previous, next: payload },
      req,
    });
    return res.json({ message: "Report updated", report: reportView(report.toObject()) });
  } catch (error) {
    return handleError(req, res, error, "amendReport failed");
  }
};

/* Who in scope the query narrows to (userId / role / roleType). */
const filterScopedUsers = (users, query = {}) => {
  const userIds = String(query.userId || "").split(",").map((s) => s.trim()).filter(Boolean);
  const role = String(query.role || "").trim().toUpperCase();
  const roleType = String(query.roleType || "").trim().toUpperCase();
  return users.filter((u) => {
    if (userIds.length && !userIds.includes(String(u._id))) return false;
    if (role && String(u.role).toUpperCase() !== role) return false;
    if (roleType && String(u.roleType || "").toUpperCase() !== roleType) return false;
    return true;
  });
};

/* Dates each user checked in and whose working day is over. */
const loadWorkedDates = async ({ companyId, userIds, from, to, today }) => {
  const rows = await Attendance.find({
    companyId,
    userId: { $in: userIds },
    attendanceDate: { $gte: from, $lte: to },
    checkInAt: { $ne: null },
  }).select("userId attendanceDate checkOutAt").lean();
  const map = new Map();
  rows.forEach((row) => {
    // Today only counts once they have checked out (or been auto checked out).
    if (row.attendanceDate === today && !row.checkOutAt) return;
    const key = String(row.userId);
    if (!map.has(key)) map.set(key, []);
    map.get(key).push(row.attendanceDate);
  });
  return map;
};

/*
 * GET /summary?from&to&userId&role&roleType
 * Reports grouped by employee with totals, averages and missing days. Used
 * by the history screen and both downloads, so the numbers always agree.
 */
exports.getSummary = async (req, res) => {
  try {
    const today = await todayKeyFor(req.user.companyId);
    const { from, to } = parseDateRange(req.query, today);
    const scoped = filterScopedUsers(await getScopedUsers(req.user, { includeInactive: true }), req.query)
      .filter((u) => resolveDailyReportFormKey(u) || String(u._id) === String(req.user._id));
    const userIds = scoped.map((u) => u._id);
    const [reports, worked] = await Promise.all([
      DailyReport.find({ companyId: req.user.companyId, userId: { $in: userIds }, reportDate: { $gte: from, $lte: to } }).lean(),
      loadWorkedDates({ companyId: req.user.companyId, userIds, from, to, today }),
    ]);
    const byUser = new Map();
    reports.forEach((r) => {
      const key = String(r.userId);
      if (!byUser.has(key)) byUser.set(key, []);
      byUser.get(key).push(r);
    });
    const employees = scoped
      .map((user) => summarizeEmployee({
        user,
        reports: byUser.get(String(user._id)) || [],
        workedDates: resolveDailyReportFormKey(user) ? worked.get(String(user._id)) || [] : [],
      }))
      // Inactive people only appear if they have something in the period.
      .filter((row, i) => scoped[i].isActive !== false || row.daysSubmitted || row.missingDates.length);

    return res.json({
      from,
      to,
      generatedAt: new Date(),
      scope: req.user.role === "ADMIN" ? "company" : isManagerOrAdmin(req.user) ? "team" : "self",
      forms: Object.values(DAILY_REPORT_FORMS).map(publicForm),
      employees,
    });
  } catch (error) {
    return handleError(req, res, error, "getSummary failed");
  }
};

/*
 * GET /status?date= - for Managers and Admins: who has submitted, who worked
 * without submitting, and who hasn't checked in, for one day.
 */
exports.getDayStatus = async (req, res) => {
  try {
    if (!isManagerOrAdmin(req.user)) return res.status(403).json({ message: "Only managers can see the team's reports" });
    const today = await todayKeyFor(req.user.companyId);
    const date = String(req.query.date || today).trim();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return res.status(400).json({ message: "date must be YYYY-MM-DD" });
    const scoped = filterScopedUsers(await getScopedUsers(req.user), req.query)
      .filter((u) => resolveDailyReportFormKey(u));
    const userIds = scoped.map((u) => u._id);
    const [reports, attendanceRows] = await Promise.all([
      DailyReport.find({ companyId: req.user.companyId, userId: { $in: userIds }, reportDate: date }).lean(),
      Attendance.find({ companyId: req.user.companyId, userId: { $in: userIds }, attendanceDate: date })
        .select("userId checkInAt checkOutAt status").lean(),
    ]);
    const reportBy = new Map(reports.map((r) => [String(r.userId), r]));
    const attBy = new Map(attendanceRows.map((a) => [String(a.userId), a]));
    const rows = scoped.map((u) => {
      const report = reportBy.get(String(u._id));
      const att = attBy.get(String(u._id));
      let state = "NOT_CHECKED_IN";
      if (report) state = "SUBMITTED";
      else if (att?.checkInAt && (att.checkOutAt || date < today)) state = "MISSING";
      else if (att?.checkInAt) state = "PENDING";
      return {
        user: { _id: u._id, name: u.name, email: u.email, role: u.role, roleType: u.roleType || "" },
        formKey: resolveDailyReportFormKey(u),
        state,
        checkInAt: att?.checkInAt || null,
        checkOutAt: att?.checkOutAt || null,
        report: reportView(report),
      };
    });
    const counts = rows.reduce((acc, r) => ({ ...acc, [r.state]: (acc[r.state] || 0) + 1 }), {});
    return res.json({ date, today, counts, rows });
  } catch (error) {
    return handleError(req, res, error, "getDayStatus failed");
  }
};

/* GET /:reportId - one report with its correction history. */
exports.getReport = async (req, res) => {
  try {
    const { reportId } = req.params;
    if (!mongoose.isValidObjectId(reportId)) return res.status(400).json({ message: "Invalid report id" });
    const report = await DailyReport.findOne({ _id: reportId, companyId: req.user.companyId }).lean();
    if (!report) return res.status(404).json({ message: "Report not found" });
    const scoped = await getScopedUsers(req.user, { includeInactive: true });
    if (!scoped.some((u) => String(u._id) === String(report.userId))) {
      return res.status(404).json({ message: "Report not found" });
    }
    return res.json({ report: reportView(report) });
  } catch (error) {
    return handleError(req, res, error, "getReport failed");
  }
};

module.exports._test = { filterScopedUsers };
