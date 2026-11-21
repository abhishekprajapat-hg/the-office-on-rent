/*
 * Finalising a month's salaries (payroll run) and sending the sheet to BillStack.
 *
 *   preview   - the month as it would be finalised now, from the Salary page's figures
 *               (attendance, late marks, leave, named deductions) and the Performance
 *               page's KPI score, plus the KPI incentive, and whatever the admin set per
 *               person on the sheet (salary, KPI score, incentive, PF / ESI / PT / TDS,
 *               other additions / deductions)
 *   finalise  - freeze it as version N and send it to BillStack (a failed send is kept
 *               and can be sent again; finalising never fails because BillStack is down)
 *   reopen    - only while BillStack has paid nothing of it; the next finalise is N+1
 *
 * Admins only: this is the company's payroll, not a team view.
 */
const PayrollRun = require("../models/PayrollRun");
const PayrollPolicy = require("../models/PayrollPolicy");
const User = require("../models/User");
const { USER_ROLES } = require("../constants/role.constants");
const { isBillstackEnabled } = require("../config/billstack");
const remote = require("./billstack.service");
const { resolvePolicyForCompany } = require("../controllers/attendance.controller");
const { buildSalaryRows, loadPayrollPolicy, USER_FIELDS } = require("../controllers/salary.controller");
const { buildPerformanceRows } = require("../controllers/performance.controller");
const { dateKeyInTimezone, monthRange, MONTH_KEY_PATTERN } = require("./payroll.calc");
const calc = require("./payrollRun.calc");

const httpError = (statusCode, message) => Object.assign(new Error(message), { statusCode });

const monthLabel = (monthKey) => new Date(`${monthKey}-01T00:00:00Z`).toLocaleString("en-IN", { month: "long", year: "numeric", timeZone: "UTC" });

// Everyone who could be owed pay for the month: active staff, and anyone switched off
// after the month began (they may have worked part of it - final settlement).
const usersForMonth = async (companyId, monthKey) => {
  const from = new Date(`${monthKey}-01T00:00:00+05:30`);
  return User.find({
    companyId,
    role: { $ne: USER_ROLES.ADMIN },
    $or: [{ isActive: true }, { isActive: false, updatedAt: { $gte: from } }],
  }).select(`${USER_FIELDS} updatedAt`).sort({ name: 1 }).lean();
};

const loadIncentivePolicy = async (companyId) => {
  const stored = await PayrollPolicy.findOne({ companyId }).select("kpiIncentive").lean();
  return calc.toKpiIncentiveView(stored?.kpiIncentive);
};

const buildSheet = async ({ companyId, monthKey, edits = {} }) => {
  if (!MONTH_KEY_PATTERN.test(String(monthKey || ""))) throw httpError(400, "month must be in YYYY-MM format");
  const attendancePolicy = await resolvePolicyForCompany(companyId);
  const todayKey = dateKeyInTimezone(new Date(), attendancePolicy.timezone);
  const monthComplete = monthRange(monthKey).to < todayKey;
  const users = await usersForMonth(companyId, monthKey);
  const policy = await loadPayrollPolicy(companyId);
  const incentivePolicy = await loadIncentivePolicy(companyId);
  const userIds = new Set(users.map((user) => String(user._id)));
  const unknown = Object.keys(edits).find((id) => !userIds.has(id));
  if (unknown) throw httpError(400, "A change names someone who is not on this month's sheet; refresh");
  const salaryOverrides = new Map(Object.entries(edits).filter(([, edit]) => edit.monthlySalary !== undefined).map(([id, edit]) => [id, edit.monthlySalary]));
  const { rows: salaryRows } = await buildSalaryRows({ companyId, users, monthKey, rules: policy.rules, companyDeductions: policy.customDeductions, salaryOverrides });
  const withSalary = salaryRows.filter((row) => row.salary);
  const performanceByUser = new Map();
  if (withSalary.length) {
    const paidUsers = users.filter((user) => withSalary.some((row) => String(row.user._id) === String(user._id)));
    (await buildPerformanceRows({ companyId, users: paidUsers, monthKey })).forEach((row) => performanceByUser.set(String(row.user._id), row.performance));
  }
  const inactive = new Set(users.filter((user) => !user.isActive).map((user) => String(user._id)));
  const rows = withSalary.map((salaryRow) => {
    const id = String(salaryRow.user._id);
    const row = calc.buildRunRow({ salaryRow, performance: performanceByUser.get(id) || null, incentivePolicy, edit: edits[id] || {} });
    if (inactive.has(id)) row.warnings.push("Switched off in the CRM - check their final settlement");
    return row;
  });
  return {
    month: monthKey,
    monthLabel: monthLabel(monthKey),
    monthComplete,
    rows,
    totals: calc.runTotals(rows),
    withoutSalary: salaryRows.filter((row) => !row.salary).map((row) => ({ userId: String(row.user._id), name: row.user.name })),
    kpiIncentive: incentivePolicy,
  };
};

const runView = (run) => ({ ...run, monthLabel: monthLabel(run.month) });

const listRuns = async ({ companyId }) => {
  const runs = await PayrollRun.find({ companyId }).select("-rows").sort({ month: -1, version: -1 }).limit(48).lean();
  return { billstackEnabled: isBillstackEnabled(companyId), runs: runs.map(runView) };
};

const getRun = async ({ companyId, runId }) => {
  const run = await PayrollRun.findOne({ _id: runId, companyId }).lean();
  if (!run) throw httpError(404, "Payroll run not found");
  return runView(run);
};

const preview = async ({ companyId, monthKey, edits }) => {
  const cleaned = calc.cleanEdits(edits);
  if (cleaned.error) throw httpError(400, cleaned.error);
  const sheet = await buildSheet({ companyId, monthKey, edits: cleaned.value });
  const current = await PayrollRun.findOne({ companyId, month: monthKey, status: "FINALISED" }).select("version finalisedAt finalisedByName billstack").lean();
  // A reopened month starts from what the admin set on the last version.
  const last = await PayrollRun.findOne({ companyId, month: monthKey }).sort({ version: -1 }).select("version rows.userId rows.edits").lean();
  const lastEdits = {};
  (last?.rows || []).forEach((row) => { if (row.edits && Object.keys(row.edits).length) lastEdits[row.userId] = row.edits; });
  return { ...sheet, finalised: current || null, lastVersion: last?.version || null, lastEdits, billstackEnabled: isBillstackEnabled(companyId) };
};

const send = async (run) => {
  if (!isBillstackEnabled(run.companyId)) {
    await PayrollRun.updateOne({ _id: run._id }, { $set: { "billstack.status": "OFF", "billstack.lastError": "" } });
    return PayrollRun.findById(run._id).lean();
  }
  try {
    const result = await remote.sendPayrollRun(run.companyId, calc.toBillstackPayload(run));
    await PayrollRun.updateOne({ _id: run._id }, {
      $set: { "billstack.status": "SENT", "billstack.outcome": result.outcome, "billstack.remoteRunId": result.remoteRunId, "billstack.remoteStatus": result.remoteStatus, "billstack.lastError": "", "billstack.sentAt": new Date() },
      $inc: { "billstack.attempts": 1 },
    });
  } catch (error) {
    const message = error.statusCode ? String(error.message).slice(0, 300) : "Could not reach BillStack; send again shortly";
    await PayrollRun.updateOne({ _id: run._id }, { $set: { "billstack.status": "FAILED", "billstack.lastError": message }, $inc: { "billstack.attempts": 1 } });
  }
  return PayrollRun.findById(run._id).lean();
};

const finalise = async ({ companyId, monthKey, edits, actor }) => {
  const cleaned = calc.cleanEdits(edits);
  if (cleaned.error) throw httpError(400, cleaned.error);
  const sheet = await buildSheet({ companyId, monthKey, edits: cleaned.value });
  if (!sheet.monthComplete) throw httpError(409, `${sheet.monthLabel} is not over yet; finalise it after the last day`);
  if (!sheet.rows.length) throw httpError(409, `Nobody has a salary set for ${sheet.monthLabel}`);
  if (await PayrollRun.exists({ companyId, month: monthKey, status: "FINALISED" })) {
    throw httpError(409, `${sheet.monthLabel} is already finalised; reopen it to make a correction`);
  }
  const last = await PayrollRun.findOne({ companyId, month: monthKey }).sort({ version: -1 }).select("version").lean();
  let run;
  try {
    run = await PayrollRun.create({
      companyId, month: monthKey, version: (last?.version || 0) + 1, status: "FINALISED",
      rows: sheet.rows, totals: sheet.totals, kpiIncentive: sheet.kpiIncentive,
      finalisedBy: actor._id, finalisedByName: actor.name || "", finalisedAt: new Date(),
    });
  } catch (error) {
    if (error?.code === 11000) throw httpError(409, `${sheet.monthLabel} was finalised a moment ago; refresh`);
    throw error;
  }
  return runView(await send(run.toObject()));
};

const resend = async ({ companyId, runId }) => {
  const run = await PayrollRun.findOne({ _id: runId, companyId }).lean();
  if (!run) throw httpError(404, "Payroll run not found");
  if (run.status !== "FINALISED") throw httpError(409, "This version was reopened; finalise the month again");
  return runView(await send(run));
};

const reopen = async ({ companyId, runId, actor, reason }) => {
  const run = await PayrollRun.findOne({ _id: runId, companyId }).lean();
  if (!run) throw httpError(404, "Payroll run not found");
  if (run.status !== "FINALISED") throw httpError(409, "This version is already reopened");
  const why = String(reason || "").trim().slice(0, 300);
  if (!why) throw httpError(400, "Say what needs correcting");
  // Once BillStack has paid any of it, the correction goes into next month's sheet.
  if (run.billstack?.status === "SENT" && isBillstackEnabled(companyId)) {
    let state;
    try {
      state = await remote.getPayrollRunStatus(companyId, String(run._id));
    } catch (error) {
      if (!/not received/i.test(error.message)) throw httpError(502, "Could not check BillStack; try again shortly");
    }
    if (state?.locked) throw httpError(409, `BillStack has already paid salaries or dues for ${monthLabel(run.month)} v${run.version}. Put the correction in next month's sheet.`);
  }
  await PayrollRun.updateOne({ _id: run._id, status: "FINALISED" }, {
    $set: { status: "REOPENED", reopenedBy: actor._id, reopenedByName: actor.name || "", reopenedAt: new Date(), reopenReason: why },
  });
  return runView(await PayrollRun.findById(run._id).lean());
};

const getKpiIncentive = async ({ companyId }) => loadIncentivePolicy(companyId);

const setKpiIncentive = async ({ companyId, body, actor }) => {
  const checked = calc.validateKpiIncentive(body);
  if (checked.error) throw httpError(400, checked.error);
  await PayrollPolicy.updateOne({ companyId }, { $set: { kpiIncentive: checked.value, updatedBy: actor._id, updatedByName: actor.name || "" } }, { upsert: true });
  return loadIncentivePolicy(companyId);
};

module.exports = { finalise, getKpiIncentive, getRun, listRuns, preview, reopen, resend, setKpiIncentive };
