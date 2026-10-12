const test = require("node:test");
const assert = require("node:assert/strict");
const { parseZonedDateInput } = require("../src/utils/zonedDateInput");

/*
 * The bug: a follow-up set for 12:00 came back as 5:30 PM on production. The
 * browser sent "...T12:00" with no zone, and the VPS runs in UTC, so it was
 * stored as 12:00 UTC. These assertions are written as UTC instants, so they
 * hold whatever timezone the test process itself runs in - run them with
 * TZ=UTC to see them under the production server's conditions.
 */

test("a datetime-local value is read as India time, not server time", () => {
  // 12:00 IST is 06:30 UTC.
  assert.equal(parseZonedDateInput("2026-10-12T12:00").toISOString(), "2026-10-12T06:30:00.000Z");
});

test("the exact case that was reported: 12:00 must not become 17:30", () => {
  const stored = parseZonedDateInput("2026-10-12T12:00");
  const shownInIndia = new Intl.DateTimeFormat("en-IN", {
    timeZone: "Asia/Kolkata", hour: "2-digit", minute: "2-digit", hourCycle: "h23",
  }).format(stored);
  assert.equal(shownInIndia, "12:00");
});

test("seconds, milliseconds and a space separator are understood", () => {
  assert.equal(parseZonedDateInput("2026-10-12T12:00:30").toISOString(), "2026-10-12T06:30:30.000Z");
  assert.equal(parseZonedDateInput("2026-10-12T12:00:30.250").toISOString(), "2026-10-12T06:30:30.250Z");
  assert.equal(parseZonedDateInput("2026-10-12 12:00").toISOString(), "2026-10-12T06:30:00.000Z");
});

test("a value that already carries a zone is taken as it is", () => {
  // The mobile app and some web paths already send ISO strings - they must not
  // be shifted a second time.
  assert.equal(parseZonedDateInput("2026-10-12T06:30:00.000Z").toISOString(), "2026-10-12T06:30:00.000Z");
  assert.equal(parseZonedDateInput("2026-10-12T12:00:00+05:30").toISOString(), "2026-10-12T06:30:00.000Z");
});

test("Dates and timestamps pass straight through", () => {
  const instant = new Date("2026-10-12T06:30:00.000Z");
  assert.equal(parseZonedDateInput(instant), instant);
  assert.equal(parseZonedDateInput(instant.getTime()).toISOString(), instant.toISOString());
});

test("midnight crossing: an early-morning time lands on the previous UTC day", () => {
  // 02:00 IST on the 12th is 20:30 UTC on the 11th.
  assert.equal(parseZonedDateInput("2026-10-12T02:00").toISOString(), "2026-10-11T20:30:00.000Z");
});

test("empty input is null and garbage is an Invalid Date", () => {
  assert.equal(parseZonedDateInput(""), null);
  assert.equal(parseZonedDateInput(null), null);
  assert.equal(parseZonedDateInput(undefined), null);
  // Callers keep their own "must be a valid date" 400s.
  assert.ok(Number.isNaN(parseZonedDateInput("not a date").getTime()));
});

test("another zone can be asked for, and a bogus one falls back to the default", () => {
  assert.equal(parseZonedDateInput("2026-10-12T12:00", "UTC").toISOString(), "2026-10-12T12:00:00.000Z");
  assert.equal(parseZonedDateInput("2026-10-12T12:00", "Not/AZone").toISOString(), "2026-10-12T06:30:00.000Z");
});

test("the lead model reads a raw datetime-local string in India time too", () => {
  // Mongoose would otherwise cast the string in the server's zone.
  const Lead = require("../src/models/Lead");
  const lead = new Lead({ nextFollowUp: "2026-10-12T12:00" });
  assert.equal(lead.nextFollowUp.toISOString(), "2026-10-12T06:30:00.000Z");
  const cleared = new Lead({ nextFollowUp: null });
  assert.equal(cleared.nextFollowUp, null);
});
