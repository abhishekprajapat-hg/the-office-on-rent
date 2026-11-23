const logger = require("../config/logger");
const { USER_ROLES } = require("../constants/role.constants");
const { writeAuditLog } = require("../services/auditLog.service");
const service = require("../services/payrollRun.service");

/*
 * Finalising the company's payroll goes into the company's books: an admin's job, or that of
 * someone an admin named for it (client answers D24: Aashi ma'am). Some settings stay with
 * the admin (adminOnly).
 */
const guard = async (req, res, { adminOnly = false } = {}) => {
  if (!req.user?.companyId) { res.status(403).json({ message: "Company context is required" }); return false; }
  if (req.user.role === USER_ROLES.ADMIN) return true;
  if (adminOnly) { res.status(403).json({ message: "Only an admin can change this" }); return false; }
  if (await service.canFinalise({ companyId: req.user.companyId, user: req.user })) return true;
  res.status(403).json({ message: "Only an admin, or someone an admin named, can finalise payroll" });
  return false;
};
const isObjectId = (value) => /^[a-f\d]{24}$/i.test(String(value || ""));

const handle = (name, fn, options = {}) => async (req, res) => {
  if (!options.open && !(await guard(req, res, options))) return null;
  if (options.open && !req.user?.companyId) return res.status(403).json({ message: "Company context is required" });
  if (req.params.runId !== undefined && !isObjectId(req.params.runId)) return res.status(404).json({ message: "Payroll run not found" });
  try {
    return await fn(req, res);
  } catch (error) {
    if (error.statusCode) return res.status(error.statusCode).json({ message: error.message });
    logger.error({ requestId: req.requestId || null, error: error.message, message: `${name} failed` });
    return res.status(500).json({ message: "Server error" });
  }
};

const audit = (req, action, run, metadata = {}) => writeAuditLog({
  companyId: req.user.companyId, actor: req.user, action, entityType: "PayrollRun", entityId: run._id,
  metadata: { month: run.month, version: run.version, ...metadata }, req,
});

exports.listRuns = handle("listPayrollRuns", async (req, res) => res.json(await service.listRuns({ companyId: req.user.companyId })));

exports.getRun = handle("getPayrollRun", async (req, res) => res.json({ run: await service.getRun({ companyId: req.user.companyId, runId: req.params.runId }) }));

exports.preview = handle("previewPayrollRun", async (req, res) => res.json(await service.preview({
  companyId: req.user.companyId, monthKey: String(req.body?.month || ""), edits: req.body?.edits,
})));

exports.finalise = handle("finalisePayrollRun", async (req, res) => {
  const run = await service.finalise({ companyId: req.user.companyId, monthKey: String(req.body?.month || ""), edits: req.body?.edits, actor: req.user });
  await audit(req, "PAYROLL_FINALISED", run, { employees: run.totals.employees, net: run.totals.net, billstack: run.billstack?.status });
  return res.status(201).json({ run });
});

exports.resend = handle("resendPayrollRun", async (req, res) => {
  const run = await service.resend({ companyId: req.user.companyId, runId: req.params.runId });
  await audit(req, "PAYROLL_SENT_TO_BILLSTACK", run, { billstack: run.billstack?.status });
  return res.json({ run });
});

exports.reopen = handle("reopenPayrollRun", async (req, res) => {
  const run = await service.reopen({ companyId: req.user.companyId, runId: req.params.runId, actor: req.user, reason: req.body?.reason });
  await audit(req, "PAYROLL_REOPENED", run, { reason: run.reopenReason });
  return res.json({ run });
});

exports.getKpiIncentive = handle("getKpiIncentive", async (req, res) => res.json({ kpiIncentive: await service.getKpiIncentive({ companyId: req.user.companyId }) }));

exports.setKpiIncentive = handle("setKpiIncentive", async (req, res) => {
  const kpiIncentive = await service.setKpiIncentive({ companyId: req.user.companyId, body: req.body || {}, actor: req.user });
  await writeAuditLog({ companyId: req.user.companyId, actor: req.user, action: "KPI_INCENTIVE_UPDATED", entityType: "PayrollPolicy", entityId: null, metadata: kpiIncentive, req });
  return res.json({ kpiIncentive });
}, { adminOnly: true });

// Anyone may ask whether they can finalise payroll (the Salary page shows the tab if so).
exports.getAccess = handle("getPayrollAccess", async (req, res) => res.json(await service.getAccess({ companyId: req.user.companyId, user: req.user })), { open: true });

exports.setAccess = handle("setPayrollAccess", async (req, res) => {
  const access = await service.setAccess({ companyId: req.user.companyId, actor: req.user, body: req.body || {} });
  await writeAuditLog({
    companyId: req.user.companyId, actor: req.user, action: "PAYROLL_ACCESS_UPDATED", entityType: "PayrollPolicy", entityId: null,
    metadata: { finaliserIds: access.finaliserIds, dueDay: access.due?.dueDay, reminderDay: access.due?.reminderDay }, req,
  });
  return res.json(access);
}, { adminOnly: true });

exports.setPayingCompany = handle("setPayingCompany", async (req, res) => {
  const result = await service.setPayingCompany({ companyId: req.user.companyId, userId: req.body?.userId, company: req.body?.company });
  await writeAuditLog({ companyId: req.user.companyId, actor: req.user, action: "PAYROLL_PAID_BY_UPDATED", entityType: "User", entityId: result.userId, metadata: { company: result.company, source: result.companySource }, req });
  return res.json(result);
});
