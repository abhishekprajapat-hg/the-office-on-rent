const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { transformSync } = require('esbuild');

// Same loader as attendance-status.test.cjs: the module imports nothing.
function load(relative) {
  const file = path.resolve(__dirname, '../src', relative);
  const source = transformSync(fs.readFileSync(file, 'utf8'), { loader: 'js', format: 'cjs' }).code;
  const module = { exports: {} };
  vm.runInNewContext(source, { module, exports: module.exports, require, Intl, Date }, { filename: file });
  return module.exports;
}

const {
  formatRupees,
  formatMonthLabel,
  describePerDay,
  describeCoverage,
  countLine,
  deductionUnit,
  toRulesForm,
  rulesFormToPayload,
  isRulesFormChanged,
  describeDeductionCost,
  describeDeductionSchedule,
  deductionStatus,
  customDeductionTotal,
  summarizeRules,
  describeLateRule,
} = load('modules/salary/salaryFormat.js');

test('rupees use Indian grouping and show paise only when there are some', () => {
  assert.equal(formatRupees(31000), '₹31,000');
  assert.equal(formatRupees(150000), '₹1,50,000');
  assert.equal(formatRupees(967.74), '₹967.74');
  assert.equal(formatRupees(undefined), '₹0');
  assert.equal(formatRupees('not a number'), '₹0');
});

test('a month key reads as a month', () => {
  assert.equal(formatMonthLabel('2026-10'), 'October 2026');
  assert.equal(formatMonthLabel(''), '');
});

test('the per-day figure explains itself', () => {
  assert.equal(describePerDay({ monthlySalary: 31000, divisor: 31, perDayBasis: 'CALENDAR_DAYS' }), '₹31,000 ÷ 31 days in the month');
  assert.equal(describePerDay({ monthlySalary: 31000, divisor: 27, perDayBasis: 'WORKING_DAYS' }), '₹31,000 ÷ 27 working days in the month');
  assert.equal(describePerDay({ monthlySalary: 30000, divisor: 30, perDayBasis: 'FIXED_DAYS' }), '₹30,000 ÷ a fixed 30 days');
});

test('coverage says how far into the month deductions reach', () => {
  assert.match(describeCoverage({ isFutureMonth: true }), /not started/);
  assert.equal(describeCoverage({ isMonthComplete: true }), 'Whole month');
  assert.equal(describeCoverage({ throughDate: '2026-10-08' }), 'Up to Thu, 8 Oct');
});

test('line counts are read by key, and missing lines count as none', () => {
  const salary = { lines: [{ key: 'absent', count: 2 }, { key: 'late', count: 4 }] };
  assert.equal(countLine(salary, 'absent'), 2);
  assert.equal(countLine(salary, 'halfDay'), 0);
  assert.equal(countLine(null, 'absent'), 0);
});

/* ------------------------------------------------------- deduction rules -- */

const savedRules = {
  perDayBasis: 'CALENDAR_DAYS',
  fixedDaysPerMonth: 30,
  lateGraceCount: 0,
  lateEveryCount: 3,
  absent: { unit: 'DAYS', value: 1 },
  unapprovedLeave: { unit: 'PERCENT', value: 5 },
  halfDay: { unit: 'AMOUNT', value: 500 },
  unpaidLeave: { unit: 'DAYS', value: 1 },
  paidLeave: { unit: 'DAYS', value: 0 },
  late: { unit: 'AMOUNT', value: 100 },
};

test('each unit has limits that match the API', () => {
  assert.equal(deductionUnit('DAYS').max, 5);
  assert.equal(deductionUnit('AMOUNT').max, 100000);
  assert.equal(deductionUnit('PERCENT').max, 100);
  assert.equal(deductionUnit('WEEKS').value, 'DAYS', 'an unknown unit reads as days');
});

test('saved rules round-trip through the form unchanged', () => {
  const form = toRulesForm(savedRules);
  assert.equal(form.halfDay.value, '500', 'numbers become strings so a field can be emptied');
  assert.equal(isRulesFormChanged(form, savedRules), false);
  const { payload, error } = rulesFormToPayload(form);
  assert.equal(error, undefined);
  assert.equal(JSON.stringify(payload), JSON.stringify(savedRules));
});

test('changing a unit or a value marks the form changed', () => {
  const form = toRulesForm(savedRules);
  assert.equal(isRulesFormChanged({ ...form, absent: { unit: 'PERCENT', value: '1' } }, savedRules), true);
  assert.equal(isRulesFormChanged({ ...form, late: { unit: 'AMOUNT', value: '150' } }, savedRules), true);
  assert.equal(isRulesFormChanged({ ...form, lateEveryCount: '2' }, savedRules), true);
  assert.equal(isRulesFormChanged({ ...form, halfDay: { unit: 'AMOUNT', value: '500.0' } }, savedRules), false, 'same number, different spelling');
});

test('a blank value cannot be saved', () => {
  const form = toRulesForm(savedRules);
  // What the unit picker leaves behind when the unit changes.
  const blank = { ...form, absent: { unit: 'AMOUNT', value: '' } };
  assert.equal(isRulesFormChanged(blank, savedRules), true);
  assert.match(rulesFormToPayload(blank).error, /Fill in every rule/);
  assert.match(rulesFormToPayload({ ...form, lateGraceCount: ' ' }).error, /Fill in every rule/);
});

/* ------------------------------------------------------ named deductions -- */

test('a named deduction reads as what it costs and when', () => {
  assert.equal(describeDeductionCost({ unit: 'AMOUNT', value: 2000 }), '₹2,000');
  assert.equal(describeDeductionCost({ unit: 'PERCENT', value: 12 }), '12% of salary');
  assert.equal(describeDeductionCost({ unit: 'DAYS', value: 0.5 }), "Half a day's pay");
  assert.equal(describeDeductionSchedule({ frequency: 'MONTHLY', fromMonth: '2026-10', toMonth: '' }), 'Every month from October 2026');
  assert.equal(describeDeductionSchedule({ frequency: 'MONTHLY', fromMonth: '2026-10', toMonth: '2027-03' }), 'Every month, October 2026 to March 2027');
  assert.equal(describeDeductionSchedule({ frequency: 'ONCE', fromMonth: '2026-10', toMonth: '2026-10' }), 'Only in October 2026');
});

test('a named deduction knows whether it has started or ended', () => {
  const pf = { frequency: 'MONTHLY', fromMonth: '2026-10', toMonth: '' };
  assert.equal(deductionStatus(pf, '2026-09'), 'upcoming');
  assert.equal(deductionStatus(pf, '2027-05'), 'active', 'no end month keeps it running');
  assert.equal(deductionStatus({ ...pf, toMonth: '2026-12' }, '2027-01'), 'ended');
  assert.equal(deductionStatus({ frequency: 'ONCE', fromMonth: '2026-10', toMonth: '2026-10' }, '2026-11'), 'ended');
});

test('the team list adds up only the named deductions', () => {
  const salary = { lines: [
    { key: 'absent', amount: 1000 },
    { key: 'custom:a', custom: true, amount: 3600 },
    { key: 'custom:b', custom: true, amount: 199.5 },
  ] };
  assert.equal(customDeductionTotal(salary), 3799.5);
  assert.equal(customDeductionTotal(null), 0);
});

test('a set of rules reads at a glance', () => {
  const rules = {
    absent: { unit: 'AMOUNT', value: 1000 },
    halfDay: { unit: 'AMOUNT', value: 500 },
    unapprovedLeave: { unit: 'PERCENT', value: 5 },
    unpaidLeave: { unit: 'DAYS', value: 1 },
    paidLeave: { unit: 'DAYS', value: 0 },
    late: { unit: 'AMOUNT', value: 200 },
    lateGraceCount: 2,
    lateEveryCount: 3,
  };
  const byKey = Object.fromEntries(summarizeRules(rules).map((row) => [row.key, row.text]));
  assert.equal(byKey.absent, '₹1,000 per day');
  assert.equal(byKey.halfDay, '₹500 per day');
  assert.equal(byKey.unapprovedLeave, '5% of salary per day');
  assert.equal(byKey.unpaidLeave, "1 day's pay");
  assert.equal(byKey.paidLeave, 'No deduction');
  assert.equal(byKey.late, '₹200 per 3 late check-ins, after 2 free');
  assert.equal(describeLateRule({ ...rules, lateEveryCount: 1, lateGraceCount: 0 }), '₹200 per late check-in');
});

/* ----------------------------------------------------------- the screen -- */

test('the salary page scrolls inside the workspace and names open profiles', () => {
  const source = fs.readFileSync(path.resolve(__dirname, '../src/modules/salary/SalaryHub.jsx'), 'utf8');
  // The workspace gives every page a fixed height; without ui-page-shell the
  // page cannot scroll at all and the bottom of the team list is unreachable.
  assert.match(source, /<div className="ui-page-shell[^"]*">/);
  assert.match(source, /navigate\(`\/admin\/users\/\$\{row\.user\._id\}`\)/, "a name opens that person's profile");
});
