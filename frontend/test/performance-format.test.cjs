const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { transformSync } = require('esbuild');

function load(relative) {
  const file = path.resolve(__dirname, '../src', relative);
  const source = transformSync(fs.readFileSync(file, 'utf8'), { loader: 'js', format: 'cjs' }).code;
  const module = { exports: {} };
  vm.runInNewContext(source, { module, exports: module.exports, require, Intl }, { filename: file });
  return module.exports;
}

const { describePart, gradeStyle } = load('modules/performance/performanceFormat.js');
const rows = (key, metrics) => Object.fromEntries(describePart(key, { metrics }));

test('attendance figures read plainly', () => {
  const lines = rows('attendance', { attendancePercent: 90, workingDays: 20, punctualityPercent: null, presentDays: 18, halfDays: 0, absentDays: 2, lateDays: 0, leaveDays: 1, weekOffDays: 1, workedHours: 140 });
  assert.equal(lines.Attendance, '90% of 20 working days');
  assert.equal(lines.Punctuality, 'No check-ins');
});

test('sales shows target progress, or that none was set', () => {
  const withTarget = rows('sales', { leads: 20, closed: 2, conversionPercent: 10, siteVisits: 4, targetPercent: 75, target: { leads: { goal: 40, achieved: 20 }, revenue: { goal: 200000, achieved: 100000 } }, openLeads: 10, followUpPercent: 80 });
  assert.equal(withTarget.Target, '75% · 20 / 40 leads, ₹1,00,000 / ₹2,00,000 revenue');
  assert.equal(withTarget.Closed, '2 (10%)');
  assert.equal(withTarget['Follow-ups up to date'], '80% of 10 open leads');
  assert.equal(rows('sales', { leads: 3, closed: 0, conversionPercent: 0, siteVisits: 0, target: null, openLeads: 0 }).Target, 'None set this month');
});

test('a person with no score is drawn neutrally', () => {
  assert.match(gradeStyle(null).chip, /slate/);
  assert.match(gradeStyle({ key: 'EXCELLENT' }).chip, /emerald/);
});
