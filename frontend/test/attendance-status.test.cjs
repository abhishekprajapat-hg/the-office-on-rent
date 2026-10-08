const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { transformSync } = require('esbuild');

// Same loader as billstack.test.cjs, minus the stubs: this module imports
// nothing, which is rather the point of it being its own file.
function load(relative) {
  const file = path.resolve(__dirname, '../src', relative);
  const source = transformSync(fs.readFileSync(file, 'utf8'), { loader: 'js', format: 'cjs' }).code;
  const module = { exports: {} };
  vm.runInNewContext(source, { module, exports: module.exports, require }, { filename: file });
  return module.exports;
}

const {
  canSetAttendanceOnDate,
  manualStatusSelectValue,
  MANUAL_ATTENDANCE_STATUS_OPTIONS,
  statusClearsCheckIn,
  todayDateKey,
} = load('modules/attendance/attendanceStatus.js');

/*
 * Every row on the daily board gets the status dropdown. An absent row used to
 * get a one-click "Mark Present" instead, which left Half Day and Leave out of
 * reach on the rows that most often need them.
 */

test('a row with a check-in shows its status in the dropdown', () => {
  assert.equal(manualStatusSelectValue({ checkInAt: '2026-10-07T05:29:00.000Z', source: 'WEB', status: 'PRESENT' }), 'PRESENT');
  assert.equal(manualStatusSelectValue({ checkInAt: '2026-10-07T05:29:00.000Z', source: 'WEB', status: 'HALF_DAY' }), 'HALF_DAY');
});

test('a row an admin set shows what they set', () => {
  for (const status of ['PRESENT', 'HALF_DAY', 'ABSENT', 'LEAVE']) {
    assert.equal(manualStatusSelectValue({ checkInAt: null, source: 'MANUAL', status }), status);
  }
  assert.equal(manualStatusSelectValue({ source: 'manual', status: 'absent' }), 'ABSENT', 'case does not matter');
});

test('an untouched absent row shows the Set Status prompt, not "Absent"', () => {
  // The server reports a day nobody touched as ABSENT; nobody chose that, so it
  // must not read like a row an admin marked absent.
  assert.equal(manualStatusSelectValue({ _id: null, checkInAt: null, source: '', status: 'ABSENT' }), '');
  assert.equal(manualStatusSelectValue(null), '');
  assert.equal(manualStatusSelectValue(undefined), '');
  assert.equal(manualStatusSelectValue({}), '');
});

test('a live status the dropdown does not offer shows the prompt', () => {
  assert.equal(manualStatusSelectValue({ checkInAt: '2026-10-08T05:00:00.000Z', source: 'WEB', status: 'WORKING' }), '');
  assert.equal(manualStatusSelectValue({ checkInAt: '2026-10-08T05:00:00.000Z', source: 'WEB', status: 'PENDING' }), '');
});

test('every status the backend accepts is offered', () => {
  // attendance.controller rejects anything outside this set, and a status
  // missing from the list would be unreachable from the UI.
  // assert/strict compares prototypes, and anything the vm-loaded module
  // returns belongs to that context's realm - so compare structure, not identity.
  assert.equal(
    JSON.stringify(MANUAL_ATTENDANCE_STATUS_OPTIONS.map((option) => option.value).sort()),
    JSON.stringify(['ABSENT', 'HALF_DAY', 'LEAVE', 'PRESENT']),
  );
  MANUAL_ATTENDANCE_STATUS_OPTIONS.forEach((option) => {
    assert.ok(option.label, `${option.value} needs a label`);
  });
});

test('no row gets a direct Mark Present button', () => {
  const source = fs.readFileSync(
    path.resolve(__dirname, '../src/modules/attendance/AttendanceHub.jsx'),
    'utf8',
  );
  assert.doesNotMatch(source, /Mark Present/, 'absent rows must get the dropdown too');
  assert.doesNotMatch(source, /handleManualStatusChange\(row, "PRESENT"\)/);
  assert.match(source, /value=\{manualStatusSelectValue\(row\.attendance\)\}/);
});

/*
 * The attendance calendar on a team member's page: admins and managers can set
 * any day up to today, which is what makes a backdated correction possible.
 */

test('leave is offered alongside present, half day and absent', () => {
  const leave = MANUAL_ATTENDANCE_STATUS_OPTIONS.find((option) => option.value === 'LEAVE');
  assert.ok(leave, 'LEAVE must be selectable');
  assert.equal(leave.label, 'Leave');
});

test('absent and leave clear the check-in; present and half day keep it', () => {
  assert.equal(statusClearsCheckIn('ABSENT'), true);
  assert.equal(statusClearsCheckIn('LEAVE'), true);
  assert.equal(statusClearsCheckIn('leave'), true);
  assert.equal(statusClearsCheckIn('PRESENT'), false);
  assert.equal(statusClearsCheckIn('HALF_DAY'), false);
  assert.equal(statusClearsCheckIn(''), false);
  assert.equal(statusClearsCheckIn(undefined), false);
});

test('past days and today can be set; future days cannot', () => {
  const today = '2026-10-08';
  assert.equal(canSetAttendanceOnDate('2026-10-05', today), true, 'a backdated day');
  assert.equal(canSetAttendanceOnDate('2026-09-30', today), true, 'last month');
  assert.equal(canSetAttendanceOnDate('2026-10-08', today), true, 'today');
  assert.equal(canSetAttendanceOnDate('2026-10-09', today), false, 'tomorrow');
  assert.equal(canSetAttendanceOnDate('', today), false, 'a blank calendar cell');
  assert.equal(canSetAttendanceOnDate('2026-10-05', ''), false, 'no idea what today is');
});

test("today is the company's date, not the browser's", () => {
  // 20:00 UTC on the 7th is already 01:30 on the 8th in Kolkata.
  const instant = new Date('2026-10-07T20:00:00.000Z');
  assert.equal(todayDateKey('Asia/Kolkata', instant), '2026-10-08');
  assert.equal(todayDateKey('UTC', instant), '2026-10-07');
  assert.match(todayDateKey('Not/AZone', instant), /^\d{4}-\d{2}-\d{2}$/, 'a bad zone still gives a date');
});

test('the calendar only makes days clickable through the date helper', () => {
  const source = fs.readFileSync(
    path.resolve(__dirname, '../src/modules/admin/UserDetailsEditor.jsx'),
    'utf8',
  );
  assert.match(
    source,
    /canSetDayStatus && canSetAttendanceOnDate\(day\.dateKey, attendanceTodayKey\)/,
    'a future day must not open the status dialog',
  );
});
