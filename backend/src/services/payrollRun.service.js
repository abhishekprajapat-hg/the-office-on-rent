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
 * Admins, and the people an admin names (client answers D24: Aashi ma'am finalises by the 5th).
 * Each person's pay goes to TOOR's or Goldhawk's books (D25), each with that company's key.
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
  }).select(`${USER_FIELDS} updatedAt roleType`).sort({ name: 1 }).lean();
};

const loadPayingCompanies = async (companyId) => {
  const stored = await PayrollPolicy.findOne({ companyId }).select("payingCompanies").lean();
  return stored?.payingCompanies && typeof stored.payingCompanies === "object" ? stored.payingCompanies : {};
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
  const payingCompanies = await loadPayingCompanies(companyId);
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
  const userById = new Map(users.map((user) => [String(user._id), user]));
  const rows = withSalary.map((salaryRow) => {
    const id = String(salaryRow.user._id);
    const row = calc.buildRunRow({ salaryRow, performance: performanceByUser.get(id) || null, incentivePolicy, edit: edits[id] || {} });
    if (inactive.has(id)) row.warnings.push("Switched off in the CRM - check their final settlement");
    Object.assign(row, calc.payingCompanyFor(userById.get(id) || salaryRow.user, payingCompanies[id]));
    return row;
  });
  return {
    month: monthKey,
    monthLabel: monthLabel(monthKey),
    monthComplete,
    rows,
    totals: calc.runTotals(rows),
    byCompany: calc.totalsByCompany(rows),
    withoutSalary: salaryRows.filter((row) => !row.salary).map((row) => ({ userId: String(row.user._id), name: row.user.name })),
    kpiIncentive: incentivePolicy,
  };
};

const runView = (run) => ({ ...run, monthLabel: monthLabel(run.month), byCompany: calc.totalsByCompany(run.rows || []) });

const listRuns = async ({ companyId }) => {
  // only who and how much per company is read from the rows here
  const runs = await PayrollRun.find({ companyId }).select("-rows.attendanceLines -rows.additions -rows.deductions -rows.kpi -rows.edits -rows.computed -rows.attendance -rows.warnings").sort({ month: -1, version: -1 }).limit(48).lean();
  return {
    billstackEnabled: isBillstackEnabled(companyId),
    runs: runs.map((run) => {
      const view = runView(run);
      delete view.rows;
      return view;
    }),
  };
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

// Each company's part goes with its own key (D25). A part already in BillStack is not sent
// again; a failed part is kept with BillStack's reason and can be sent again.
const send = async (run) => {
  if (!isBillstackEnabled(run.companyId)) {
    await PayrollRun.updateOne({ _id: run._id }, { $set: { "billstack.status": "OFF", "billstack.lastError": "" } });
    return PayrollRun.findById(run._id).lean();
  }
  const earlier = await PayrollRun.find({ companyId: run.companyId, month: run.month, version: { $lt: run.version } }).select("billstack billstackParts").lean();
  const previous = new Map((run.billstackParts || []).map((part) => [part.company, part]));
  const parts = [];
  for (const job of calc.billstackJobs(run, earlier)) {
    const before = previous.get(job.company);
    if (before?.status === "SENT" && before.withdraw === job.withdraw) {
      parts.push(before);
      continue;
    }
    const part = {
      company: job.company, withdraw: job.withdraw, runId: job.runId, employees: job.employees, net: job.net,
      status: "NOT_SENT", outcome: "", remoteRunId: "", remoteStatus: "", lastError: "", sentAt: null, attempts: (before?.attempts || 0) + 1,
    };
    try {
      // eslint-disable-next-line no-await-in-loop
      const result = await remote.sendPayrollRun(run.companyId, job.payload, { payrollCompany: job.company });
      Object.assign(part, { status: "SENT", outcome: result.outcome, remoteRunId: result.remoteRunId, remoteStatus: result.remoteStatus, sentAt: new Date() });
    } catch (error) {
      Object.assign(part, { status: "FAILED", lastError: error.statusCode ? String(error.message).slice(0, 300) : "Could not reach BillStack; send again shortly" });
    }
    parts.push(part);
  }
  const summary = calc.summariseParts(parts);
  const toor = parts.find((part) => part.company === "TOOR" && !part.withdraw);
  await PayrollRun.updateOne({ _id: run._id }, {
    $set: {
      billstackParts: parts,
      "billstack.status": summary.status,
      "billstack.lastError": summary.lastError,
      "billstack.outcome": toor?.outcome || "",
      "billstack.remoteRunId": toor?.remoteRunId || "",
      "billstack.remoteStatus": toor?.remoteStatus || "",
      ...(summary.status === "SENT" ? { "billstack.sentAt": new Date() } : {}),
    },
    $inc: { "billstack.attempts": 1 },
  });
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
  if (isBillstackEnabled(companyId)) {
    // every company's part that is in the books (runs from before the split: TOOR's)
    const inBooks = (run.billstackParts || []).length
      ? run.billstackParts.filter((part) => part.status === "SENT" && !part.withdraw)
      : run.billstack?.status === "SENT" ? [{ company: "TOOR", runId: String(run._id) }] : [];
    for (const part of inBooks) {
      const company = calc.COMPANY_LABEL[part.company] || part.company;
      let state;
      try {
        // eslint-disable-next-line no-await-in-loop
        state = await remote.getPayrollRunStatus(companyId, part.runId || calc.partRunId(run, part.company), { payrollCompany: part.company });
      } catch (error) {
        if (!/not received/i.test(error.message)) throw httpError(502, `Could not check ${company}'s BillStack; try again shortly`);
      }
      if (state?.locked) throw httpError(409, `BillStack has already paid salaries or dues for ${monthLabel(run.month)} v${run.version} (${company}). Put the correction in next month's sheet.`);
    }
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

// ------------------------------------------------------------------ who, whose books, when

const isAdmin = (user) => user?.role === USER_ROLES.ADMIN;
const OBJECT_ID = /^[a-f\d]{24}$/i;
const istDateKey = (now) => new Date(now.getTime() + 330 * 60000).toISOString().slice(0, 10);

// D24: an admin, or an active person the admin named.
const canFinalise = async ({ companyId, user }) => {
  if (isAdmin(user)) return true;
  if (!user?._id || user.isActive === false) return false;
  return Boolean(await PayrollPolicy.exists({ companyId, payrollFinaliserIds: user._id }));
};

// Last month: when it is due and whether it is finalised.
const dueOf = async ({ companyId, policy, now = new Date() }) => {
  const schedule = calc.scheduleOf(policy || {});
  const todayKey = istDateKey(now);
  const month = calc.previousMonthKey(todayKey);
  const finalised = await PayrollRun.exists({ companyId, month, status: "FINALISED" });
  const thisMonth = new Date(`${todayKey.slice(0, 7)}-01T00:00:00Z`).toLocaleString("en-IN", { month: "long", timeZone: "UTC" });
  return { month, monthLabel: monthLabel(month), dueOn: `${schedule.dueDay} ${thisMonth}`, finalised: Boolean(finalised), late: !finalised && Number(todayKey.slice(8, 10)) > schedule.dueDay, ...schedule };
};

const getAccess = async ({ companyId, user }) => {
  const policy = await PayrollPolicy.findOne({ companyId }).select("payrollFinaliserIds payrollReminderDay payrollDueDay").lean();
  const allowed = await canFinalise({ companyId, user });
  const out = { canFinalise: allowed, isAdmin: isAdmin(user), due: allowed ? await dueOf({ companyId, policy }) : null };
  if (!isAdmin(user)) return out;
  const people = await User.find({ companyId, role: { $ne: USER_ROLES.ADMIN }, isActive: true }).select("_id name role department").sort({ name: 1 }).lean();
  return {
    ...out,
    finaliserIds: (policy?.payrollFinaliserIds || []).map(String),
    people: people.map((p) => ({ id: String(p._id), name: p.name, role: p.role, department: p.department || "" })),
  };
};

const setAccess = async ({ companyId, actor, body = {} }) => {
  if (!isAdmin(actor)) throw httpError(403, "Only an admin can choose who finalises payroll");
  const ids = Array.isArray(body.finaliserIds) ? [...new Set(body.finaliserIds.map(String))] : [];
  if (ids.length > 20 || ids.some((id) => !OBJECT_ID.test(id))) throw httpError(400, "Pick people from the list");
  const found = await User.countDocuments({ _id: { $in: ids }, companyId, role: { $ne: USER_ROLES.ADMIN }, isActive: true });
  if (found !== ids.length) throw httpError(400, "Someone picked is not an active member of this company");
  const day = (value, label) => {
    const n = Number(value);
    if (!Number.isInteger(n) || n < 1 || n > 28) throw httpError(400, `${label} must be a day from 1 to 28`);
    return n;
  };
  const dueDay = day(body.dueDay ?? calc.DEFAULT_PAYROLL_SCHEDULE.dueDay, "Due day");
  const reminderDay = day(body.reminderDay ?? calc.DEFAULT_PAYROLL_SCHEDULE.reminderDay, "Reminder day");
  if (reminderDay > dueDay) throw httpError(400, "The reminder must come on or before the due day");
  await PayrollPolicy.updateOne(
    { companyId },
    { $set: { payrollFinaliserIds: ids, payrollDueDay: dueDay, payrollReminderDay: reminderDay, updatedBy: actor._id, updatedByName: actor.name || "" } },
    { upsert: true },
  );
  return getAccess({ companyId, user: actor });
};

// D25: whose books a person's pay goes to; "" goes back to the team default.
const setPayingCompany = async ({ companyId, userId, company }) => {
  if (!OBJECT_ID.test(String(userId || ""))) throw httpError(400, "Pick a person");
  const value = String(company || "").toUpperCase();
  if (value && !calc.PAYING_COMPANIES.includes(value)) throw httpError(400, "Paid by must be The Office on Rent or Goldhawk");
  const user = await User.findOne({ _id: userId, companyId }).select("_id name roleType").lean();
  if (!user) throw httpError(404, "Person not found");
  const path = `payingCompanies.${String(user._id)}`;
  await PayrollPolicy.updateOne({ companyId }, value ? { $set: { [path]: value } } : { $unset: { [path]: "" } }, { upsert: true });
  return { userId: String(user._id), name: user.name, ...calc.payingCompanyFor(user, value) };
};

/*
 * D24 reminder: on the reminder day (3rd), the due day (5th) and the day after, while last
 * month is not finalised, admins and the named finalisers get a push. Each is sent once.
 */
const runPayrollReminders = async ({ now = new Date(), sendPush = null } = {}) => {
  const push = sendPush || require("./push.service").sendToUsers;
  const todayKey = istDateKey(now);
  const month = calc.previousMonthKey(todayKey);
  const companies = await User.distinct("companyId", { role: USER_ROLES.ADMIN, isActive: { $ne: false } });
  const sent = [];
  for (const companyId of companies) {
    if (!companyId) continue;
    // eslint-disable-next-line no-await-in-loop
    const policy = await PayrollPolicy.findOne({ companyId }).select("payrollFinaliserIds payrollReminderDay payrollDueDay payrollReminders").lean();
    // a company that has never set up payroll is not reminded
    // eslint-disable-next-line no-await-in-loop
    if (!policy && !(await PayrollRun.exists({ companyId }))) continue;
    // eslint-disable-next-line no-await-in-loop
    const finalised = await PayrollRun.exists({ companyId, month, status: "FINALISED" });
    const reminder = calc.payrollReminderFor({ todayKey, schedule: calc.scheduleOf(policy || {}), finalised: Boolean(finalised) });
    if (!reminder || (policy?.payrollReminders || []).includes(reminder.key)) continue;
    // claimed first, so two servers never both send it
    let claimed;
    try {
      // eslint-disable-next-line no-await-in-loop
      claimed = await PayrollPolicy.updateOne(
        { companyId, payrollReminders: { $ne: reminder.key } },
        { $push: { payrollReminders: { $each: [reminder.key], $slice: -24 } } },
        { upsert: true },
      );
    } catch (error) {
      if (error?.code === 11000) continue; // sent already (the policy holds the key)
      throw error;
    }
    if (!claimed.modifiedCount && !claimed.upsertedCount) continue;
    // eslint-disable-next-line no-await-in-loop
    const people = await User.find({
      companyId, isActive: { $ne: false },
      $or: [{ role: USER_ROLES.ADMIN }, { _id: { $in: policy?.payrollFinaliserIds || [] } }],
    }).select("_id").lean();
    const to = people.map((u) => String(u._id));
    Promise.resolve(push(to, { title: reminder.title, body: reminder.body, url: "/salary?tab=payroll", tag: `payroll-${reminder.key}` })).catch(() => {});
    sent.push({ companyId: String(companyId), key: reminder.key, to });
  }
  return { sent };
};

module.exports = {
  canFinalise, finalise, getAccess, getKpiIncentive, getRun, listRuns, preview, reopen, resend,
  runPayrollReminders, setAccess, setKpiIncentive, setPayingCompany,
};
