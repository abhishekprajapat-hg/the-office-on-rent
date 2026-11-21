// Payroll runs (21 Nov 2026): a finalised month's sheet built from the Salary page's
// attendance figures, the Performance page's KPI score, the KPI incentive and what the
// admin set per person (salary, KPI score, incentive, optional PF / ESI / PT / TDS, other
// additions / deductions) - the figures BillStack is sent and checks.
const test = require("node:test");
const assert = require("node:assert/strict");
const calc = require("../src/services/payrollRun.calc");

const USER = "aaaaaaaaaaaaaaaaaaaaaaaa";

// The Salary page's calculation for one person (services/payroll.calc.js shape).
const salaryRow = (over = {}) => ({
  user: { _id: USER, name: "Asha", email: "asha@example.com", department: "Sales", role: "EXECUTIVE" },
  salary: {
    monthlySalary: 30000,
    perDayRate: 1000,
    workingDaysInMonth: 26,
    workedOnOffDays: ["2026-10-05"],
    lines: [
      { key: "absent", label: "Absent", count: 1, rule: "1 day", amount: 1000 },
      { key: "unapprovedLeave", label: "Unapproved leave", count: 0, amount: 0 },
      { key: "halfDay", label: "Half day", count: 1, amount: 500 },
      { key: "unpaidLeave", label: "Unpaid leave", count: 0, amount: 0 },
      { key: "paidLeave", label: "Paid leave", count: 1, amount: 0 },
      { key: "leaveBeyondEntitlement", label: "Leave beyond paid entitlement", count: 0, amount: 0 },
      { key: "late", label: "Late check-in", count: 4, chargeableCount: 4, amount: 500 },
      { key: "custom:1", label: "PF", custom: true, amount: 1800 },
      { key: "custom:2", label: "Advance recovery", custom: true, amount: 2000 },
    ],
    totalDeduction: 5800,
    netSalary: 24200,
    ...over,
  },
});

const performance = (overall, target) => ({
  score: overall,
  grade: { label: "Great" },
  parts: { target: target === null ? null : { score: target, metrics: { targets: [{ label: "Deals closed", goal: 4, achieved: 4, percent: 100 }] } } },
});

const ON = { enabled: true, scoreOn: "TARGET", unit: "PERCENT", bands: [{ minScore: 95, value: 10 }, { minScore: 90, value: 5 }] };

test("attendance, late marks and leave come off the salary; named deductions come off the gross", () => {
  const row = calc.buildRunRow({ salaryRow: salaryRow(), performance: performance(88, 92) });
  assert.equal(row.attendanceDeduction, 2000);
  assert.equal(row.earnedSalary, 28000);
  assert.deepEqual(row.attendanceLines.map((line) => line.key), ["absent", "halfDay", "paidLeave", "late"]);
  assert.deepEqual(row.attendance, { workingDays: 26, absent: 1, halfDay: 1, unapprovedLeave: 0, unpaidLeave: 0, paidLeave: 1, leaveBeyondEntitlement: 0, late: 4, lateCharged: 4, workedOnOffDays: 1 });
  assert.deepEqual(row.deductions.map((d) => [d.label, d.amount]), [["PF", 1800], ["Advance recovery", 2000]]);
  assert.equal(row.additions.length, 0, "no incentive while it is switched off");
  assert.equal(row.gross, 28000);
  assert.equal(row.net, 24200, "same as the Salary page when there is no incentive");
  assert.deepEqual([row.kpi.score, row.kpi.grade, row.kpi.targetScore], [88, "Great", 92]);
});

test("the KPI incentive follows the target score by band; no target means no incentive", () => {
  const row = calc.buildRunRow({ salaryRow: salaryRow(), performance: performance(80, 92), incentivePolicy: ON });
  assert.deepEqual(row.additions.map((a) => [a.label, a.amount]), [["KPI incentive (target score 92)", 1500]]);
  assert.equal(row.gross, 29500);
  assert.equal(row.net, 25700);
  assert.equal(calc.buildRunRow({ salaryRow: salaryRow(), performance: performance(99, 70), incentivePolicy: ON }).additions.length, 0);
  assert.equal(calc.kpiIncentiveFor({ policy: ON, monthlySalary: 30000, performance: performance(99, null) }).rule, "No target set this month");
  const overall = calc.kpiIncentiveFor({ policy: { ...ON, scoreOn: "OVERALL", unit: "AMOUNT", bands: [{ minScore: 95, value: 3000 }] }, monthlySalary: 30000, performance: performance(96, null) });
  assert.equal(overall.amount, 3000);
});

test("one-off additions and deductions; deductions never take the pay below zero", () => {
  const adjust = [{ kind: "ADDITION", label: "Diwali bonus", amount: 5000 }, { kind: "DEDUCTION", label: "Laptop damage", amount: 1000 }];
  const row = calc.buildRunRow({ salaryRow: salaryRow(), edit: { items: adjust } });
  assert.equal(row.gross, 33000);
  assert.equal(row.totalDeduction, 4800);
  assert.equal(row.net, 28200);

  const thin = calc.buildRunRow({ salaryRow: salaryRow({ monthlySalary: 3000, lines: [{ key: "absent", label: "Absent", count: 2, amount: 2000 }, { key: "custom:1", label: "Advance recovery", custom: true, amount: 5000 }] }) });
  assert.equal(thin.earnedSalary, 1000);
  assert.deepEqual(thin.deductions.map((d) => d.amount), [1000]);
  assert.equal(thin.net, 0);
  assert.match(thin.warnings[0], /only 1000 of 5000/);

  const heavy = calc.buildRunRow({ salaryRow: salaryRow({ monthlySalary: 1000, lines: [{ key: "absent", label: "Absent", count: 5, amount: 5000 }] }) });
  assert.deepEqual([heavy.attendanceDeduction, heavy.earnedSalary, heavy.net], [1000, 0, 0]);
});

test("the admin's KPI score, incentive and optional PF / ESI / PT / TDS", () => {
  // No PF / ESI / PT / TDS unless entered.
  const plain = calc.buildRunRow({ salaryRow: salaryRow({ lines: [] }), performance: performance(80, 92), incentivePolicy: ON });
  assert.deepEqual(plain.deductions, []);
  assert.equal(plain.kpi.edited, false);
  assert.deepEqual(plain.computed, { monthlySalary: 30000, kpiScore: 80, incentive: 1500 });

  // KPI score set by the admin drives the incentive band and the grade.
  const scored = calc.buildRunRow({ salaryRow: salaryRow({ lines: [] }), performance: performance(80, 92), incentivePolicy: ON, edit: { kpiScore: 96 } });
  assert.equal(scored.additions[0].amount, 3000);
  assert.match(scored.additions[0].label, /KPI score set by admin 96/);
  assert.deepEqual([scored.kpi.score, scored.kpi.computedScore, scored.kpi.grade, scored.kpi.edited], [96, 80, "Excellent", true]);

  // Incentive typed in replaces the rule's amount; 0 means none.
  const typed = calc.buildRunRow({ salaryRow: salaryRow({ lines: [] }), performance: performance(80, 92), incentivePolicy: ON, edit: { incentive: 2222 } });
  assert.deepEqual(typed.additions.map((a) => [a.key, a.amount]), [["incentive", 2222]]);
  assert.equal(typed.computed.incentive, 1500, "the rule's figure is kept to show beside it");
  assert.equal(calc.buildRunRow({ salaryRow: salaryRow({ lines: [] }), performance: performance(80, 92), incentivePolicy: ON, edit: { incentive: 0 } }).additions.length, 0);
  // Works with the KPI rule switched off too.
  assert.equal(calc.buildRunRow({ salaryRow: salaryRow({ lines: [] }), edit: { incentive: 500 } }).gross, 30500);

  // Statutory deductions come first, then named ones, then one-offs.
  const stat = calc.buildRunRow({ salaryRow: salaryRow(), edit: { pf: 1800, esi: 225, pt: 200, tds: 1000, items: [{ kind: "DEDUCTION", label: "Fine", amount: 50 }] } });
  assert.deepEqual(stat.deductions.map((d) => d.label), ["PF", "ESI", "Professional tax", "TDS on salary", "PF", "Advance recovery", "Fine"]);
  assert.equal(stat.totalDeduction, 1800 + 225 + 200 + 1000 + 1800 + 2000 + 50);
  assert.match(stat.warnings.join(" "), /PF is entered here and "PF" is also a named deduction/);
  assert.equal(stat.warnings.length, 1);
  assert.equal(calc.toBillstackPayload({ _id: "b", month: "2026-10", version: 1, rows: [stat] }).rows[0].edits, undefined, "the edits snapshot stays in the CRM");
});

test("the admin's changes are checked", () => {
  assert.match(calc.cleanEdits({ nope: {} }).error, /not on the sheet/);
  assert.match(calc.cleanEdits({ [USER]: { items: [{ kind: "ADDITION", label: "", amount: 5 }] } }).error, /name/);
  assert.match(calc.cleanEdits({ [USER]: { items: [{ kind: "ADDITION", label: "Bonus", amount: 0 }] } }).error, /above zero/);
  assert.deepEqual(calc.cleanEdits({ [USER]: { items: [{ kind: "deduction", label: " Fine ", amount: "250.456" }] } }).value, { [USER]: { items: [{ kind: "DEDUCTION", label: "Fine", amount: 250.46 }] } });
  assert.match(calc.cleanEdits({ [USER]: { kpiScore: 120 } }).error, /0 to 100/);
  assert.match(calc.cleanEdits({ [USER]: { pf: -5 } }).error, /PF/);
  assert.match(calc.cleanEdits({ [USER]: { monthlySalary: 0 } }).error, /Salary/);
  assert.match(calc.cleanEdits({ [USER]: { tds: "abc" } }).error, /TDS/);
  // Blank fields are not set; a person with nothing set drops out.
  assert.deepEqual(calc.cleanEdits({ [USER]: { monthlySalary: "", kpiScore: null, pf: " ", esi: undefined } }).value, {});
  assert.deepEqual(calc.cleanEdits({ [USER]: { monthlySalary: "32000", kpiScore: "88.5", incentive: "0", tds: 1200 } }).value, { [USER]: { monthlySalary: 32000, incentive: 0, tds: 1200, kpiScore: 88.5 } });
  assert.match(calc.validateKpiIncentive({ enabled: true, bands: [] }).error, /at least one band/);
  assert.match(calc.validateKpiIncentive({ unit: "PERCENT", bands: [{ minScore: 90, value: 150 }] }).error, /more than 100%/);
  assert.match(calc.validateKpiIncentive({ bands: [{ minScore: 90, value: 5 }, { minScore: 90, value: 6 }] }).error, /Two bands/);
  assert.deepEqual(calc.validateKpiIncentive({ enabled: true, bands: [{ minScore: 80, value: 2 }, { minScore: 95, value: 10 }] }).value.bands.map((b) => b.minScore), [95, 80]);
  assert.equal(calc.toKpiIncentiveView(null).enabled, false, "off until the company switches it on");
});

test("the BillStack payload adds up the way BillStack checks it", () => {
  const rows = [calc.buildRunRow({ salaryRow: salaryRow(), performance: performance(80, 92), incentivePolicy: ON, edit: { items: [{ kind: "DEDUCTION", label: "Fine", amount: 100 }] } })];
  const payload = calc.toBillstackPayload({ _id: "bbbbbbbbbbbbbbbbbbbbbbbb", month: "2026-10", version: 2, finalisedByName: "Admin", finalisedAt: new Date("2026-11-02T10:00:00Z"), rows });
  assert.equal(payload.runId, "bbbbbbbbbbbbbbbbbbbbbbbb");
  const [row] = payload.rows;
  assert.equal(row.warnings, undefined, "CRM-only notes stay in the CRM");
  const sum = (items) => Math.round(items.reduce((t, i) => t + i.amount, 0) * 100) / 100;
  assert.ok(row.attendanceDeduction <= sum(row.attendanceLines));
  assert.equal(row.earnedSalary, row.monthlySalary - row.attendanceDeduction);
  assert.equal(row.gross, row.earnedSalary + sum(row.additions));
  assert.equal(row.totalDeduction, sum(row.deductions));
  assert.equal(row.net, row.gross - row.totalDeduction);
  assert.deepEqual(calc.runTotals(rows), { employees: 1, monthlySalary: 30000, attendanceDeduction: 2000, additions: 1500, gross: 29500, deductions: 3900, net: 25600 });
});
