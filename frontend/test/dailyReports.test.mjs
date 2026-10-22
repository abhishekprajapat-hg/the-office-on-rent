// Daily report form helpers and export columns (requirements 16 Oct 2026).
import test from "node:test";
import assert from "node:assert/strict";
import { emptyFormValue, findFormProblem, toPayload, valueFromReport } from "../src/modules/dailyReports/dailyReportFormValue.js";
import { columnsFor, periodLabel, formatDateKey } from "../src/modules/dailyReports/dailyReportExport.js";

const fieldForm = {
  key: "COMMERCIAL_FIELD_EXECUTIVE",
  fields: [
    { key: "totalCalls", label: "Total calls", kind: "count" },
    { key: "newLeadCalls", label: "New lead calls", kind: "count", partOf: "totalCalls" },
    { key: "followUpCalls", label: "Follow-up calls", kind: "count", partOf: "totalCalls" },
    { key: "otherWork", label: "Other work", kind: "text" },
  ],
};

test("an empty form asks for every count; zero passes", () => {
  const value = emptyFormValue(fieldForm);
  assert.equal(findFormProblem(fieldForm, value).field, "totalCalls");
  value.counts = { totalCalls: "0", newLeadCalls: "0", followUpCalls: "0" };
  assert.equal(findFormProblem(fieldForm, value), null);
  assert.deepEqual(toPayload(value).counts, { totalCalls: 0, newLeadCalls: 0, followUpCalls: 0 });
});

test("parts can't exceed the total", () => {
  const value = emptyFormValue(fieldForm);
  value.counts = { totalCalls: "5", newLeadCalls: "4", followUpCalls: "3" };
  assert.match(findFormProblem(fieldForm, value).message, /can't be more than Total calls/);
});

test("max is checked (cabins 0-65)", () => {
  const form = { fields: [{ key: "cabinsCleaned", label: "Cabins cleaned", kind: "count", max: 65 }] };
  assert.match(findFormProblem(form, { counts: { cabinsCleaned: "70" }, notes: {}, issues: [] }).message, /0 and 65/);
});

test("editing loads the saved report back into the form", () => {
  const v = valueFromReport(fieldForm, { counts: { totalCalls: 9, newLeadCalls: 0, followUpCalls: 3 }, notes: { otherWork: "x" } });
  assert.equal(v.counts.newLeadCalls, "0");
  assert.equal(v.notes.otherWork, "x");
});

test("export columns keep each person's own form", () => {
  const cols = columnsFor({ formKey: "COMMERCIAL_FIELD_EXECUTIVE", formKeys: [] }, [fieldForm]);
  assert.deepEqual(cols.counts.map((f) => f.key), ["totalCalls", "newLeadCalls", "followUpCalls"]);
  assert.deepEqual(cols.texts.map((f) => f.key), ["otherWork"]);
  assert.equal(periodLabel("2026-10-01", "2026-10-31"), "01/10/2026 to 31/10/2026");
  assert.equal(formatDateKey("2026-10-05"), "05/10/2026");
});

// Relationship labels used by the broker / inventory screens.
import { labelOf, toneOf, daysAgo, AVAILABILITY_OPTIONS, CP_STATUS_OPTIONS } from "../src/modules/inventory/relationshipOptions.js";
test("relationship labels and ages", () => {
  assert.equal(labelOf(AVAILABILITY_OPTIONS, "ON_HOLD"), "On hold");
  assert.equal(labelOf(CP_STATUS_OPTIONS, "ACTIVE"), "Active CP");
  assert.match(toneOf(CP_STATUS_OPTIONS, "ACTIVE"), /emerald/);
  assert.equal(daysAgo(null), null);
  assert.equal(daysAgo(new Date(Date.now() - 3 * 86400000).toISOString()), 3);
});
