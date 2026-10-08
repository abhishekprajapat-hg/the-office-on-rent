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
