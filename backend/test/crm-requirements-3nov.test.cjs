// Requirements 3 Nov 2026: size-wise availability (live vs manual), PLCs,
// charges, broker registration rules and the Field Executive broker-link fix.
const test = require("node:test");
const assert = require("node:assert/strict");
const S = require("../src/services/projectAvailability.service");
const rel = require("../src/services/relationship.service");

const plot = (status, length, width, extra = {}) => ({ status, residentialDetails: { subtypeData: { plotLength: length, plotWidth: width } }, ...extra });

test("live counts come from linked plots and react to status", () => {
  const inv = [plot("Available", 20, 40), plot("Sold", 40, 20), plot("Blocked", 20, 40), plot("Available", 30, 40)];
  const a = S.buildAvailability({}, inv);
  const row800 = a.rows.find((r) => r.areaSqft === 800);
  assert.equal(row800.total, 3);
  assert.equal(row800.available, 1);
  assert.equal(row800.onHold, 1);
  assert.equal(row800.sold, 1);
  assert.equal(row800.source, "LIVE");
  assert.equal(a.totals.available, 2);
  // Selling the last 800 sq ft plot marks the size as gone.
  inv[0].status = "Sold";
  const after = S.buildAvailability({}, inv).rows.find((r) => r.areaSqft === 800);
  assert.equal(after.available, 0);
  assert.equal(after.soldOut, true);
});

test("manual figures are used only for sizes with no linked plots, never added twice", () => {
  const project = { sizeInventory: [
    { dimension: "20x40", areaSqft: 800, total: 50, available: 30, sold: 20 },
    { dimension: "", areaSqft: 1140, total: 10, available: 4, sold: 6 },
  ] };
  const a = S.buildAvailability(project, [plot("Available", 40, 20), plot("Sold", 20, 40)]);
  const live = a.rows.find((r) => r.areaSqft === 800);
  assert.equal(live.source, "LIVE");
  assert.equal(live.total, 2);
  assert.deepEqual(live.manual, { total: 50, available: 30, sold: 20 });
  const manual = a.rows.find((r) => r.areaSqft === 1140);
  assert.equal(manual.source, "MANUAL");
  assert.equal(a.totals.total, 12);
  assert.equal(a.totals.available, 5);
  assert.equal(a.totals.liveAvailable, 1);
  assert.equal(a.totals.manualAvailable, 4);
  assert.equal(a.hasLive && a.hasManual, true);
});

test("plots matched by area when they have no dimensions", () => {
  const a = S.buildAvailability({ sizeInventory: [{ areaSqft: 1265, total: 5, available: 5, sold: 0 }] }, [{ status: "Available", totalArea: 1265 }]);
  assert.equal(a.rows.length, 1);
  assert.equal(a.rows[0].source, "LIVE");
});

test("size rows: area from the dimension, and counts must add up", () => {
  const [row] = S.sanitizeProjectExtras("sizeInventory", [{ dimension: "20 x 50", total: 10, available: 4, sold: 6 }]);
  assert.equal(row.areaSqft, 1000);
  assert.throws(() => S.sanitizeProjectExtras("sizeInventory", [{ dimension: "20x30", total: 5, available: 4, sold: 3 }]), /can't be more than the total/);
  assert.throws(() => S.sanitizeProjectExtras("sizeInventory", [{ total: 5 }]), /enter a size/);
});

test("PLCs: configurable, no duplicates, percent capped", () => {
  const plcs = S.sanitizeProjectExtras("plcOptions", [
    { name: "Garden", basis: "percent", value: 5 },
    { name: "Corner", basis: "PERCENT", value: 3 },
    { name: "Wide road 18 m", basis: "AMOUNT", value: 50000, condition: "18 m road" },
  ]);
  assert.equal(plcs[0].basis, "PERCENT");
  assert.throws(() => S.sanitizeProjectExtras("plcOptions", [{ name: "Garden" }, { name: "garden" }]), /listed twice/);
  assert.throws(() => S.sanitizeProjectExtras("plcOptions", [{ name: "X", basis: "PERCENT", value: 150 }]), /between 0 and 100/);
  const combo = S.combinePlcs(plcs, ["Garden", "corner", "Wide road 18 m", "Unknown"]);
  assert.equal(combo.items.length, 3);
  assert.deepEqual(combo.ifAdded, { percent: 8, amount: 50000, perSqft: 0 });
  assert.deepEqual(combo.unknown, ["unknown"]);
});

test("charges: Other needs a name; GST and stamp duty stay separate and configurable", () => {
  assert.throws(() => S.sanitizeProjectExtras("chargeItems", [{ key: "OTHER", value: 10 }]), /give the "Other" charge a name/);
  const rows = S.sanitizeProjectExtras("chargeItems", [{ key: "maintenance", value: 50000 }, { key: "OTHER", label: "Water connection", basis: "AMOUNT", value: 25000 }]);
  assert.equal(rows[0].label, "Maintenance");
  const b = S.chargeBreakdown({ currentRate: 2000, chargeItems: rows, gstPercent: 18, stampDutyPercent: 7 }, { areaSqft: 1000 });
  assert.equal(b.base, 2000000);
  assert.equal(b.gst, 360000);
  assert.equal(b.stampDuty, 140000);
  assert.equal(b.chargesTotal, 50000 + 25000 + 360000 + 140000);
  assert.throws(() => S.sanitizeProjectExtras("gstPercent", 120), /between 0 and 100/);
  assert.equal(S.sanitizeProjectExtras("stampDutyPercent", ""), null);
});

test("rate dates and market rates are checked", () => {
  assert.ok(S.sanitizeProjectExtras("currentRateDate", "2026-11-01") instanceof Date);
  assert.throws(() => S.sanitizeProjectExtras("startingRateDate", "not a date"), /not a valid date/);
  const [m] = S.sanitizeProjectExtras("marketRates", [{ place: "Silver Springs", rate: "3200", asOf: "2026-10-30", source: "Broker" }]);
  assert.equal(m.rate, 3200);
  assert.equal(m.unit, "per sq ft");
  assert.throws(() => S.sanitizeProjectExtras("marketRates", [{ rate: 1 }]), /needs a project or place name/);
});

test("project payload accepts the 3 Nov fields", () => {
  const C = require("../src/constants/project.constants");
  for (const f of S.EXTRA_FIELDS) assert.ok(C.PROJECT_ALLOWED_FIELDS.includes(f), f);
  assert.ok(C.PROJECT_STATUSES.includes("UPCOMING") && C.PROJECT_STATUSES.includes("LAUNCHED"));
  const D = require("../src/constants/projectDetails.constants");
  const legal = D.LEGAL_FIELDS.map((f) => f.key);
  for (const k of ["localAuthority", "buildingPermission", "ewsIncluded", "ligIncluded"]) assert.ok(legal.includes(k), k);
  assert.ok(D.PRICING_FIELDS.some((f) => f.key === "guidelineRate"));
  for (const r of ["OWNER", "OWNERS_MANAGER", "MARKETED_BY", "ASSOCIATE", "DIRECT_DEVELOPER", "BROKER"]) assert.ok(D.CONTACT_ROLES.includes(r), r);
});

test("broker registration: only a CP can be Preferred; demotion clears it", () => {
  const admin = { role: "ADMIN" };
  const exec = { role: "EXECUTIVE" };
  assert.throws(() => rel.sanitizeContactPatch({ preferredPartner: true }, exec), /Only Admin or Manager/);
  assert.equal(rel.sanitizeContactPatch({ registrationType: "channel_partner" }, exec).registrationType, "CHANNEL_PARTNER");
  assert.throws(() => rel.applyRegistrationRules({ registrationType: "REGULAR_BROKER" }, { preferredPartner: true }), /Only a broker registered as a Channel Partner/);
  const ok = rel.applyRegistrationRules({ registrationType: "CHANNEL_PARTNER" }, rel.sanitizeContactPatch({ preferredPartner: true }, admin));
  assert.equal(ok.preferredPartner, true);
  assert.equal(rel.applyRegistrationRules({ registrationType: "CHANNEL_PARTNER", preferredPartner: true }, { registrationType: "REGULAR_BROKER" }).preferredPartner, false);
  // Onboarding as a CP registers them as one.
  assert.equal(rel.applyRegistrationRules({}, { cpStatus: "ACTIVE" }).registrationType, "CHANNEL_PARTNER");
});

test("CP checklist asks for Aadhaar and a photograph", () => {
  const list = rel.cpDocumentChecklist({ cpDocuments: [{ type: "AADHAAR", url: "x" }] });
  assert.deepEqual(list, [{ type: "AADHAAR", present: true }, { type: "PHOTO", present: false }]);
});

test("daily report targets: checked against the form, segment overrides all, period = daily x days worked", () => {
  const D = require("../src/services/dailyReport.service");
  assert.throws(() => D.sanitizeTargets("COMMERCIAL_EXECUTIVE", "", { cabinsClosed: 2 }), /not on the/);
  assert.throws(() => D.sanitizeTargets("NOPE", "", {}), /Unknown report form/);
  const clean = D.sanitizeTargets("COMMERCIAL_EXECUTIVE", "commercial", { newLeadCalls: "5", followUpCalls: 5, dealsClosed: "" });
  assert.deepEqual(clean, { formKey: "COMMERCIAL_EXECUTIVE", segment: "COMMERCIAL", targets: { newLeadCalls: 5, followUpCalls: 5 } });
  const rows = [
    { formKey: "COMMERCIAL_EXECUTIVE", segment: "", targets: { newLeadCalls: 4, siteVisitsScheduled: 2 } },
    { formKey: "COMMERCIAL_EXECUTIVE", segment: "COMMERCIAL", targets: { newLeadCalls: 5 } },
  ];
  assert.deepEqual(D.resolveTargets(rows, "COMMERCIAL_EXECUTIVE", "COMMERCIAL"), { newLeadCalls: 5, siteVisitsScheduled: 2 });
  assert.deepEqual(D.resolveTargets(rows, "COMMERCIAL_EXECUTIVE", "BOTH"), { newLeadCalls: 4, siteVisitsScheduled: 2 });
  const row = D.withTargets({ daysSubmitted: 3, missingDates: ["2026-11-02"], totals: { newLeadCalls: 15 } }, { newLeadCalls: 5, siteVisitsScheduled: 2 });
  assert.equal(row.workedDays, 4);
  assert.deepEqual(row.periodTargets, { newLeadCalls: 20, siteVisitsScheduled: 8 });
  assert.deepEqual(row.achievement, { newLeadCalls: 75, siteVisitsScheduled: 0 });
});

test("PLC rule: not set charges nothing, add-all sums, highest-only takes the largest", () => {
  const plcOptions = [{ name: "Garden", basis: "PERCENT", value: 5 }, { name: "Corner", basis: "PERCENT", value: 3 }, { name: "Wide road", basis: "AMOUNT", value: 50000 }, { name: "Park", basis: "PER_SQFT", value: 100 }];
  const selected = ["Garden", "Corner", "Wide road", "Park"];
  const base = { plcOptions, selected, basePrice: 1600000, areaSqft: 800 };
  assert.equal(S.plcCharge({ ...base, rule: "NOT_SET" }).total, null);
  assert.equal(S.plcCharge({ ...base, rule: "ADD_ALL" }).total, 80000 + 48000 + 50000 + 80000);
  const top = S.plcCharge({ ...base, rule: "HIGHEST_ONLY" });
  assert.equal(top.total, 80000);
  assert.equal(top.applied.length, 1);
  // A % PLC with no price is left out and flagged, never guessed.
  const noPrice = S.plcCharge({ plcOptions, selected: ["Garden", "Wide road"], rule: "ADD_ALL", basePrice: null, areaSqft: null });
  assert.equal(noPrice.total, 50000);
  assert.equal(noPrice.incomplete, true);
  assert.equal(S.sanitizeProjectExtras("plcRule", "highest_only"), "HIGHEST_ONLY");
  assert.throws(() => S.sanitizeProjectExtras("plcRule", "MAX"), /PLC rule must be/);
});

test("old owner / broker manager fields become parties once; names compare without case or spaces", () => {
  const { syncManagerContacts, normalizeProjectName } = require("../src/services/project.service")._test;
  const project = { ownerManagerName: "Ramesh", ownerManagerMobile: "9811100001", brokerManagerName: "Suresh", brokerManagerMobile: "", projectContacts: [{ name: "Ramesh R", phone: "+91 98111 00001", role: "DEVELOPER" }] };
  assert.equal(syncManagerContacts(project), true);
  assert.equal(project.projectContacts.length, 2);
  assert.deepEqual(project.projectContacts.map((c) => c.role), ["DEVELOPER", "BROKER"]);
  assert.equal(syncManagerContacts(project), false, "running again adds nothing");
  assert.equal(normalizeProjectName("  Green   Valley Plots "), "Green Valley Plots");
});

test("Unavailable is a status and is counted on its own", () => {
  const { INVENTORY_STATUSES } = require("../src/constants/inventory.constants");
  assert.ok(INVENTORY_STATUSES.includes("Unavailable"));
  const a = S.buildAvailability({}, [plot("Unavailable", 20, 40), plot("Available", 20, 40)]);
  assert.equal(a.rows[0].unavailable, 1);
  assert.equal(a.rows[0].available, 1);
  assert.equal(a.totals.unavailable, 1);
});

test("registering as a CP starts Pending; back to regular broker ends it", () => {
  assert.equal(rel.applyRegistrationRules({ cpStatus: "NOT_ONBOARDED" }, { registrationType: "CHANNEL_PARTNER" }).cpStatus, "PENDING");
  assert.equal(rel.applyRegistrationRules({ cpStatus: "ACTIVE", registrationType: "CHANNEL_PARTNER" }, { registrationType: "CHANNEL_PARTNER" }).cpStatus, undefined, "an active CP stays active");
  assert.equal(rel.applyRegistrationRules({ cpStatus: "ACTIVE", registrationType: "CHANNEL_PARTNER" }, { registrationType: "REGULAR_BROKER" }).cpStatus, "NOT_ONBOARDED");
});
