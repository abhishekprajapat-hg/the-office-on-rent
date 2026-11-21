/*
 * A month's finalised salary sheet (payroll run), built from what the Salary page already
 * works out - attendance, late marks, leave, named deductions - plus the KPI incentive
 * and any one-off additions / deductions entered when the month is finalised.
 *
 * Per person:
 *   earned salary = monthly salary - attendance deduction (absent, unapproved / unpaid
 *                   leave, half days, leave beyond the paid entitlement, late marks,
 *                   days before joining), never below zero
 *   gross         = earned salary + KPI incentive + additions (bonus, arrears ...)
 *   deductions    = PF / ESI / professional tax / TDS if the admin entered them (optional,
 *                   blank = none) + named deductions (advance recovery ...) + one-off
 *                   deductions; never more than the gross - what does not fit is left out
 *                   and flagged
 *   net           = gross - deductions
 *
 * The admin can set this month's salary, KPI score and incentive per person on the sheet
 * (see cleanEdits); blank keeps what the CRM worked out.
 *
 * Pure: no database, so the figures sent to BillStack can be tested on their own.
 */

const { gradeFor } = require("./performance.calc");

const roundMoney = (value) => Math.round((Number(value || 0) + Number.EPSILON) * 100) / 100;
const sumOf = (items) => roundMoney((items || []).reduce((total, item) => total + Number(item.amount || 0), 0));

const KPI_SCORE_ON = Object.freeze({ TARGET: "TARGET", OVERALL: "OVERALL" });
const KPI_UNIT = Object.freeze({ PERCENT: "PERCENT", AMOUNT: "AMOUNT" });

// Off until the company sets it. The bands are an example to edit, not a decision.
const DEFAULT_KPI_INCENTIVE = Object.freeze({
  enabled: false,
  scoreOn: KPI_SCORE_ON.TARGET,
  unit: KPI_UNIT.PERCENT,
  bands: [
    { minScore: 95, value: 10 },
    { minScore: 90, value: 7.5 },
    { minScore: 85, value: 5 },
    { minScore: 80, value: 2.5 },
  ],
});

const MAX_ADJUSTMENTS = 10;
const MAX_ADJUSTMENT_AMOUNT = 1000000;

const ATTENDANCE_KEYS = ["absent", "unapprovedLeave", "halfDay", "unpaidLeave", "paidLeave", "leaveBeyondEntitlement", "late", "beforeJoining"];

const toKpiIncentiveView = (stored) => {
  const source = stored && typeof stored === "object" ? stored : {};
  const bands = Array.isArray(source.bands) && source.bands.length ? source.bands : DEFAULT_KPI_INCENTIVE.bands;
  return {
    enabled: Boolean(source.enabled),
    scoreOn: Object.values(KPI_SCORE_ON).includes(source.scoreOn) ? source.scoreOn : DEFAULT_KPI_INCENTIVE.scoreOn,
    unit: Object.values(KPI_UNIT).includes(source.unit) ? source.unit : DEFAULT_KPI_INCENTIVE.unit,
    bands: bands
      .map((band) => ({ minScore: Number(band.minScore), value: Number(band.value) }))
      .filter((band) => Number.isFinite(band.minScore) && Number.isFinite(band.value))
      .sort((left, right) => right.minScore - left.minScore),
  };
};

// Returns { error } or { value } - the settings as they will be stored.
const validateKpiIncentive = (body = {}) => {
  const enabled = Boolean(body.enabled);
  const scoreOn = String(body.scoreOn || KPI_SCORE_ON.TARGET).toUpperCase();
  if (!Object.values(KPI_SCORE_ON).includes(scoreOn)) return { error: "Choose whether the incentive follows the target score or the overall score" };
  const unit = String(body.unit || KPI_UNIT.PERCENT).toUpperCase();
  if (!Object.values(KPI_UNIT).includes(unit)) return { error: "Choose a percentage of salary or a fixed amount" };
  if (!Array.isArray(body.bands) || body.bands.length > 10) return { error: "Give between 1 and 10 score bands" };
  const bands = [];
  for (const band of body.bands) {
    const minScore = Number(band?.minScore);
    const value = Number(band?.value);
    if (!Number.isFinite(minScore) || minScore < 0 || minScore > 100) return { error: "Each band starts at a score from 0 to 100" };
    if (!Number.isFinite(value) || value < 0) return { error: "Each band needs an incentive of 0 or more" };
    if (unit === KPI_UNIT.PERCENT && value > 100) return { error: "A percentage incentive cannot be more than 100%" };
    if (unit === KPI_UNIT.AMOUNT && value > MAX_ADJUSTMENT_AMOUNT) return { error: "That incentive amount is too large" };
    if (bands.some((existing) => existing.minScore === minScore)) return { error: `Two bands start at ${minScore}` };
    bands.push({ minScore: roundMoney(minScore), value: roundMoney(value) });
  }
  if (enabled && !bands.length) return { error: "Add at least one band before switching the incentive on" };
  bands.sort((left, right) => right.minScore - left.minScore);
  return { value: { enabled, scoreOn, unit, bands } };
};

// scoreOverride: the KPI score the admin set on the payroll sheet; it is used as it is,
// whichever score the rule normally follows.
const kpiIncentiveFor = ({ policy, monthlySalary, performance, scoreOverride }) => {
  const settings = toKpiIncentiveView(policy);
  if (!settings.enabled) return null;
  const overridden = scoreOverride !== undefined && scoreOverride !== null;
  const score = overridden ? scoreOverride : settings.scoreOn === KPI_SCORE_ON.TARGET ? performance?.parts?.target?.score : performance?.score;
  const basis = overridden ? "KPI score set by admin" : settings.scoreOn === KPI_SCORE_ON.TARGET ? "target score" : "KPI score";
  if (score === null || score === undefined || !Number.isFinite(Number(score))) {
    return { amount: 0, label: "KPI incentive", rule: settings.scoreOn === KPI_SCORE_ON.TARGET ? "No target set this month" : "No KPI score this month" };
  }
  const band = settings.bands.find((entry) => Number(score) >= entry.minScore);
  if (!band || !band.value) return { amount: 0, label: "KPI incentive", rule: `${basis} ${roundMoney(score)} is below every band` };
  const amount = settings.unit === KPI_UNIT.PERCENT ? roundMoney((Number(monthlySalary) * band.value) / 100) : roundMoney(band.value);
  return {
    amount,
    label: `KPI incentive (${basis} ${roundMoney(score)})`,
    rule: settings.unit === KPI_UNIT.PERCENT ? `${band.value}% of salary for ${band.minScore}+` : `Rs ${band.value} for ${band.minScore}+`,
  };
};

// Optional statutory deductions the admin may enter per person. Blank = none.
const STATUTORY = Object.freeze([
  { field: "pf", key: "stat:pf", label: "PF", match: /\b(e?pf|provident)\b/i },
  { field: "esi", key: "stat:esi", label: "ESI", match: /\besic?\b/i },
  { field: "pt", key: "stat:pt", label: "Professional tax", match: /\b(professional tax|pt)\b/i },
  { field: "tds", key: "stat:tds", label: "TDS on salary", match: /\b(tds|income tax)\b/i },
]);
const MAX_MONTHLY_SALARY = 10000000;

/*
 * What the admin set on the payroll sheet, per person (every field optional; blank = not set):
 *   { [userId]: { monthlySalary, kpiScore, incentive, pf, esi, pt, tds, items: [{ kind, label, amount }] } }
 *   monthlySalary - this month's salary (the attendance cuts are worked out on it)
 *   kpiScore      - the KPI score used for the incentive (0-100)
 *   incentive     - the incentive amount itself (replaces the KPI rule's amount; 0 = none)
 *   pf / esi / pt / tds - deductions, only if entered
 *   items         - other one-off additions / deductions (bonus, arrears, fine ...)
 */
const blank = (value) => value === undefined || value === null || String(value).trim() === "";
const cleanEdits = (input) => {
  const out = {};
  if (!input || typeof input !== "object") return { value: out };
  for (const [userId, raw] of Object.entries(input)) {
    if (!/^[a-f\d]{24}$/i.test(userId)) return { error: "A change names someone who is not on the sheet" };
    const source = raw && typeof raw === "object" ? raw : {};
    const edit = {};
    const amount = (field, label, max) => {
      if (blank(source[field])) return null;
      const value = roundMoney(source[field]);
      if (!Number.isFinite(value) || value < 0 || value > max) return `${label}: enter an amount from 0 to ${max}`;
      edit[field] = value;
      return null;
    };
    const problem = amount("monthlySalary", "Salary", MAX_MONTHLY_SALARY)
      || amount("incentive", "Incentive", MAX_ADJUSTMENT_AMOUNT)
      || STATUTORY.map((s) => amount(s.field, s.label, MAX_ADJUSTMENT_AMOUNT)).find(Boolean);
    if (problem) return { error: problem };
    if (edit.monthlySalary === 0) return { error: "Salary: leave it blank to use the salary set for the person, or enter an amount above zero" };
    if (!blank(source.kpiScore)) {
      const score = roundMoney(source.kpiScore);
      if (!Number.isFinite(score) || score < 0 || score > 100) return { error: "KPI score: enter a number from 0 to 100" };
      edit.kpiScore = score;
    }
    const items = Array.isArray(source.items) ? source.items : [];
    if (items.length > MAX_ADJUSTMENTS) return { error: `At most ${MAX_ADJUSTMENTS} other changes per person` };
    const rows = [];
    for (const item of items) {
      const kind = String(item?.kind || "").toUpperCase();
      if (!["ADDITION", "DEDUCTION"].includes(kind)) return { error: "A change is an addition or a deduction" };
      const label = String(item?.label || "").trim().slice(0, 60);
      if (!label) return { error: "Give every addition or deduction a name (bonus, arrears, fine ...)" };
      const value = roundMoney(item?.amount);
      if (!(value > 0) || value > MAX_ADJUSTMENT_AMOUNT) return { error: `"${label}": enter an amount above zero` };
      rows.push({ kind, label, amount: value });
    }
    if (rows.length) edit.items = rows;
    if (Object.keys(edit).length) out[userId] = edit;
  }
  return { value: out };
};

const lineCount = (lines, key) => Number(lines.find((line) => line.key === key)?.count || 0);

/*
 * salaryRow: a row from the Salary page (user + salary calculation);
 * performance: that person's month from the Performance page (or null).
 */
const buildRunRow = ({ salaryRow, performance = null, incentivePolicy = null, edit = {} }) => {
  const adjustments = edit.items || [];
  const salary = salaryRow.salary;
  const user = salaryRow.user || {};
  const monthlySalary = roundMoney(salary.monthlySalary);
  const lines = Array.isArray(salary.lines) ? salary.lines : [];
  const warnings = [];

  const attendanceLines = lines
    .filter((line) => !line.custom && ATTENDANCE_KEYS.includes(line.key) && (Number(line.amount) > 0 || Number(line.count) > 0))
    .map((line) => ({ key: line.key, label: line.label, count: line.count ?? null, rule: line.rule || "", amount: roundMoney(line.amount) }));
  const attendanceDeduction = roundMoney(Math.min(monthlySalary, sumOf(attendanceLines)));
  const earnedSalary = roundMoney(monthlySalary - attendanceDeduction);

  const additions = [];
  const ruleIncentive = kpiIncentiveFor({ policy: incentivePolicy, monthlySalary, performance, scoreOverride: edit.kpiScore });
  if (edit.incentive !== undefined) {
    if (edit.incentive > 0) additions.push({ key: "incentive", label: "Incentive", rule: "Set by admin on the payroll sheet", amount: edit.incentive });
  } else if (ruleIncentive?.amount > 0) {
    additions.push({ key: "kpi", label: ruleIncentive.label, rule: ruleIncentive.rule, amount: ruleIncentive.amount });
  }
  adjustments.filter((item) => item.kind === "ADDITION").forEach((item, index) => additions.push({ key: `adjust:add:${index}`, label: item.label, rule: "Entered when finalising", amount: item.amount }));
  const gross = roundMoney(earnedSalary + sumOf(additions));

  const wanted = [
    ...STATUTORY.filter((s) => edit[s.field] > 0).map((s) => ({ key: s.key, label: s.label, rule: "Entered by admin on the payroll sheet", amount: edit[s.field] })),
    ...lines.filter((line) => line.custom && Number(line.amount) > 0).map((line) => ({ key: line.key, label: line.label, rule: line.rule || "", amount: roundMoney(line.amount) })),
    ...adjustments.filter((item) => item.kind === "DEDUCTION").map((item, index) => ({ key: `adjust:less:${index}`, label: item.label, rule: "Entered when finalising", amount: item.amount })),
  ];
  // PF entered here and a named "PF" deduction on the Salary page would take it twice.
  STATUTORY.filter((stat) => edit[stat.field] > 0).forEach((stat) => {
    const twin = lines.find((line) => line.custom && Number(line.amount) > 0 && stat.match.test(String(line.label || "")));
    if (twin) warnings.push(`${stat.label} is entered here and "${twin.label}" is also a named deduction on the Salary page - both are taken; clear one`);
  });
  // Deductions never take the pay below zero: what does not fit is left out and flagged.
  let room = gross;
  const deductions = [];
  for (const item of wanted) {
    const amount = roundMoney(Math.min(item.amount, room));
    if (amount < item.amount) warnings.push(`${item.label}: only ${amount} of ${item.amount} could be taken - the pay ran out`);
    if (amount > 0) deductions.push({ ...item, amount });
    room = roundMoney(room - amount);
  }
  const totalDeduction = sumOf(deductions);
  const lateLine = lines.find((line) => line.key === "late");
  const kpiEdited = edit.kpiScore !== undefined;
  const kpiScore = kpiEdited ? edit.kpiScore : performance?.score ?? null;
  const targets = performance?.parts?.target?.metrics?.targets || [];

  return {
    userId: String(user._id),
    name: user.name || "",
    email: user.email || "",
    department: user.department || "",
    role: user.role || "",
    monthlySalary,
    perDayRate: roundMoney(salary.perDayRate),
    attendance: {
      workingDays: salary.workingDaysInMonth ?? null,
      absent: lineCount(lines, "absent"),
      halfDay: lineCount(lines, "halfDay"),
      unapprovedLeave: lineCount(lines, "unapprovedLeave"),
      unpaidLeave: lineCount(lines, "unpaidLeave"),
      paidLeave: lineCount(lines, "paidLeave"),
      leaveBeyondEntitlement: lineCount(lines, "leaveBeyondEntitlement"),
      late: Number(lateLine?.count || 0),
      lateCharged: Number(lateLine?.chargeableCount || 0),
      workedOnOffDays: Array.isArray(salary.workedOnOffDays) ? salary.workedOnOffDays.length : 0,
    },
    attendanceLines,
    attendanceDeduction,
    earnedSalary,
    additions,
    gross,
    deductions,
    totalDeduction,
    net: roundMoney(gross - totalDeduction),
    kpi: {
      score: kpiScore,
      grade: kpiEdited ? gradeFor(kpiScore)?.label || "" : performance?.grade?.label || "",
      computedScore: performance?.score ?? null,
      edited: kpiEdited,
      targetScore: performance?.parts?.target?.score ?? null,
      targets: targets.map((item) => ({ label: item.label, goal: item.goal, achieved: item.achieved, percent: item.percent })),
    },
    edits: edit,
    // The CRM's own figures, shown beside the admin's: salary on the Salary page, the
    // Performance page score, and what the KPI incentive rule gives (on the score in use).
    computed: {
      monthlySalary: salaryRow.regularMonthlySalary ?? (edit.monthlySalary === undefined ? monthlySalary : null),
      kpiScore: performance?.score ?? null,
      incentive: ruleIncentive ? ruleIncentive.amount : null,
    },
    warnings,
  };
};

const runTotals = (rows) => ({
  employees: rows.length,
  monthlySalary: roundMoney(rows.reduce((total, row) => total + row.monthlySalary, 0)),
  attendanceDeduction: roundMoney(rows.reduce((total, row) => total + row.attendanceDeduction, 0)),
  additions: roundMoney(rows.reduce((total, row) => total + sumOf(row.additions), 0)),
  gross: roundMoney(rows.reduce((total, row) => total + row.gross, 0)),
  deductions: roundMoney(rows.reduce((total, row) => total + row.totalDeduction, 0)),
  net: roundMoney(rows.reduce((total, row) => total + row.net, 0)),
});

// What BillStack is sent: the rows without the CRM-only warnings / edits / computed figures.
const toBillstackPayload = (run) => ({
  runId: String(run._id),
  month: run.month,
  version: run.version,
  finalisedBy: run.finalisedByName || "",
  finalisedAt: run.finalisedAt ? new Date(run.finalisedAt).toISOString() : null,
  rows: (run.rows || []).map(({ warnings, edits, computed, _id, ...row }) => row),
});

module.exports = {
  DEFAULT_KPI_INCENTIVE,
  KPI_SCORE_ON,
  KPI_UNIT,
  STATUTORY,
  buildRunRow,
  cleanEdits,
  kpiIncentiveFor,
  runTotals,
  toBillstackPayload,
  toKpiIncentiveView,
  validateKpiIncentive,
};
