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

const { canEditAttendanceStatus, MANUAL_ATTENDANCE_STATUS_OPTIONS } = load('modules/attendance/attendanceStatus.js');

/*
 * The bug this guards: the status control was shown only when the row had a
 * checkInAt. Somebody marked present by an admin has no check-in, so their row
 * kept offering "Mark Present" and the status could never be changed again -
 * a mis-click was permanent for that day.
 */

test('a row with a check-in can have its status changed', () => {
  assert.equal(canEditAttendanceStatus({ checkInAt: '2026-10-07T05:29:00.000Z', source: 'WEB' }), true);
});

test('a row an admin marked, with no check-in, can still be changed', () => {
  assert.equal(
    canEditAttendanceStatus({ checkInAt: null, source: 'MANUAL', status: 'PRESENT' }),
    true,
    'marking somebody present must not strand the row with no way back',
  );
  assert.equal(canEditAttendanceStatus({ checkInAt: null, source: 'MANUAL', status: 'HALF_DAY' }), true);
  assert.equal(canEditAttendanceStatus({ checkInAt: null, source: 'MANUAL', status: 'ABSENT' }), true);
});

test('source is matched regardless of case', () => {
  assert.equal(canEditAttendanceStatus({ source: 'manual' }), true);
});

test('an untouched row keeps the one-click Mark Present shortcut', () => {
  // Nobody has checked in and no admin has set anything: the quick action is
  // the right control here, not a dropdown.
  assert.equal(canEditAttendanceStatus({ checkInAt: null, source: 'WEB', status: 'ABSENT' }), false);
  assert.equal(canEditAttendanceStatus(null), false);
  assert.equal(canEditAttendanceStatus(undefined), false);
  assert.equal(canEditAttendanceStatus({}), false);
});

test('every status the backend accepts is offered', () => {
  // attendance.controller rejects anything outside this set, and a status
  // missing from the list would be unreachable from the UI.
  // assert/strict compares prototypes, and anything the vm-loaded module
  // returns belongs to that context's realm - so compare structure, not identity.
  assert.equal(
    JSON.stringify(MANUAL_ATTENDANCE_STATUS_OPTIONS.map((option) => option.value).sort()),
    JSON.stringify(['ABSENT', 'HALF_DAY', 'PRESENT']),
  );
  MANUAL_ATTENDANCE_STATUS_OPTIONS.forEach((option) => {
    assert.ok(option.label, `${option.value} needs a label`);
  });
});

test('the row actions are gated on the helper, not on checkInAt alone', () => {
  const source = fs.readFileSync(
    path.resolve(__dirname, '../src/modules/attendance/AttendanceHub.jsx'),
    'utf8',
  );
  assert.match(
    source,
    /\{canEditAttendanceStatus\(row\.attendance\) \? \(/,
    'the Set Status / Mark Present branch must ask the helper',
  );
});
