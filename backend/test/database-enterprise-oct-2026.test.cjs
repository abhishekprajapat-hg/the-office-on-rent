/*
 * Developmental Updates Oct 2026: Database module (01) and Enterprise
 * Leasing (02). Pure rules only; the live API flows are checked separately.
 */
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const F = require("../src/services/enterpriseFinance.service");
const E = require("../src/constants/enterprise.constants");
const D = require("../src/constants/database.constants");
const src = (p) => fs.readFileSync(path.join(__dirname, "..", "src", p), "utf8");

const lease = (over = {}) => ({
  _id: "a1", side: "OWNER", status: "ACTIVE", commencementDate: new Date("2026-01-01"), rentCommencementDate: new Date("2026-02-01"),
  endDate: new Date("2026-12-31"), baseRent: 100000, rentDueDay: 5, gstPercent: 18, tdsPercent: 10,
  escalations: [{ effectiveDate: new Date("2026-07-01"), method: "PERCENT", value: 5 }],
  maintenance: { method: "FIXED", amount: 10000 }, otherCharges: [], ...over,
});

test("rent follows the agreement's own escalation schedule, compounding in date order", () => {
  const a = lease({ escalations: [{ effectiveDate: new Date("2027-07-01"), method: "PERCENT", value: 10 }, { effectiveDate: new Date("2026-07-01"), method: "PERCENT", value: 5 }] });
  assert.equal(F.rentOn(a, new Date("2026-06-30")), 100000);
  assert.equal(F.rentOn(a, new Date("2026-07-01")), 105000);
  assert.equal(F.rentOn(a, new Date("2027-08-01")), 115500);
  assert.equal(F.rentOn(lease({ escalations: [{ effectiveDate: new Date("2026-03-01"), method: "AMOUNT", value: 7000 }] }), new Date("2026-04-01")), 107000);
  assert.equal(F.rentOn(lease({ escalations: [{ effectiveDate: new Date("2026-03-01"), method: "NEW_RENT", value: 120000 }] }), new Date("2026-04-01")), 120000);
});

test("schedule: rent from rent commencement, maintenance from commencement, tax only as configured", () => {
  const rows = F.buildSchedule(lease());
  const rent = rows.filter((r) => r.chargeType === "RENT");
  const maint = rows.filter((r) => r.chargeType === "MAINTENANCE");
  assert.equal(rent.length, 11);
  assert.equal(maint.length, 12);
  assert.equal(rent[0].periodStart.toISOString().slice(0, 10), "2026-02-01");
  assert.equal(rent[0].dueDate.toISOString().slice(0, 10), "2026-02-05");
  assert.equal(rent[0].taxAmount, 18000);
  assert.equal(rent[0].tdsExpected, 10000);
  assert.equal(rent.find((r) => r.periodStart.toISOString().startsWith("2026-07")).gross, 105000);
  const noTax = F.buildSchedule(lease({ gstPercent: null, tdsPercent: null }));
  assert.ok(noTax.every((r) => r.taxAmount === 0 && r.tdsExpected === 0), "no fixed tax rate is assumed");
  assert.ok(F.buildSchedule(lease({ maintenance: { method: "INCLUDED" } })).every((r) => r.chargeType !== "MAINTENANCE"));
  assert.ok(F.buildSchedule(lease({ maintenance: { method: "ACTUAL" } })).every((r) => r.chargeType !== "MAINTENANCE"), "actual-cost maintenance is billed manually");
});

test("a part month at the end is pro-rated", () => {
  const rows = F.buildSchedule(lease({ escalations: [], endDate: new Date("2026-04-15"), maintenance: { method: "INCLUDED" }, gstPercent: null, tdsPercent: null }));
  const last = rows[rows.length - 1];
  assert.equal(last.periodEnd.toISOString().slice(0, 10), "2026-04-15");
  assert.equal(last.gross, 50000);
});

test("regeneration never rewrites a row that is paid, promised, disputed or already due", () => {
  const today = new Date("2026-05-10");
  const gen = F.buildSchedule(lease(), { today });
  const existing = gen.map((g, i) => ({ ...g, _id: `o${i}`, generated: true, settlements: [], adjustments: [], promises: [] }));
  const paidFuture = existing.find((o) => o.chargeType === "RENT" && o.periodStart.toISOString().startsWith("2026-09"));
  paidFuture.settlements = [{ cash: 1000, tds: 0 }];
  const amended = F.buildSchedule(lease({ baseRent: 200000 }), { today });
  const plan = F.planRegeneration(existing, amended, { today });
  assert.ok(plan.update.every((u) => new Date(u.dueDate) >= today), "only future rows change");
  assert.ok(!plan.update.some((u) => u._id === paidFuture._id), "a part-paid row stays as it was");
  assert.ok(plan.update.length > 0);
  assert.equal(plan.create.length, 0);
});

test("payment status: partial, promised, disputed, waived; a promise is not a payment", () => {
  const today = new Date("2026-06-01");
  const base = { direction: "RECEIVABLE", dueDate: new Date("2026-05-07"), gross: 150000, taxAmount: 27000, tdsExpected: 15000, settlements: [], adjustments: [], promises: [] };
  assert.equal(F.obligationView(base, today).status, "OVERDUE");
  assert.equal(F.obligationView(base, today).daysOverdue, 25);
  const promised = F.obligationView({ ...base, promises: [{ promisedDate: new Date("2026-06-10"), at: new Date() }] }, today);
  assert.equal(promised.status, "OVERDUE");
  assert.equal(promised.balance, 177000);
  assert.ok(promised.latestPromise);
  const partial = F.obligationView({ ...base, settlements: [{ cash: 100000, tds: 0 }] }, today);
  assert.equal(partial.status, "PARTIALLY_PAID");
  assert.equal(partial.balance, 77000);
  const paid = F.obligationView({ ...base, settlements: [{ cash: 164000, tds: 13000 }] }, today);
  assert.equal(paid.status, "PAID");
  assert.equal(paid.tdsDifference, 2000, "TDS short-withheld is shown, not hidden");
  assert.equal(F.obligationView({ ...base, disputed: true }, today).status, "DISPUTED");
  assert.equal(F.obligationView({ ...base, adjustments: [{ amount: 177000 }] }, today).status, "WAIVED_ADJUSTED");
  assert.equal(F.obligationView({ ...base, dueDate: new Date("2026-06-05") }, today).status, "DUE");
  assert.equal(F.obligationView({ ...base, dueDate: new Date("2026-08-05") }, today).status, "UPCOMING");
});

test("one transfer can settle several items; it can't over-pay, cross sides or cross offices", () => {
  const tx = { direction: "RECEIVABLE", officeId: "off1", amount: 300000, tdsAmount: 20000 };
  const ob = (id, over = {}) => ({ _id: id, direction: "RECEIVABLE", officeId: "off1", dueDate: new Date("2026-05-07"), gross: 150000, taxAmount: 0, settlements: [], adjustments: [], ...over });
  const out = F.validateAllocations({ transaction: tx, obligations: [ob("a"), ob("b")], allocations: [{ obligationId: "a", cash: 140000, tds: 10000 }, { obligationId: "b", cash: 140000, tds: 10000 }] });
  assert.equal(out.unallocatedCash, 20000);
  assert.throws(() => F.validateAllocations({ transaction: tx, obligations: [ob("a")], allocations: [{ obligationId: "a", cash: 160000 }] }), /outstanding/);
  assert.throws(() => F.validateAllocations({ transaction: tx, obligations: [ob("a", { direction: "PAYABLE" })], allocations: [{ obligationId: "a", cash: 1 }] }), /other side/);
  assert.throws(() => F.validateAllocations({ transaction: tx, obligations: [ob("a", { officeId: "off2" })], allocations: [{ obligationId: "a", cash: 1 }] }), /own office/);
  assert.throws(() => F.validateAllocations({ transaction: { ...tx, tdsAmount: 0 }, obligations: [ob("a")], allocations: [{ obligationId: "a", cash: 1, tds: 5 }] }), /TDS/);
  assert.throws(() => F.validateAllocations({ transaction: tx, obligations: [ob("a")], allocations: [{ obligationId: "a", cash: 1 }, { obligationId: "a", cash: 1 }] }), /twice/);
});

test("deposits: separate ledgers per side, partial refunds and deductions", () => {
  const entries = [
    { side: "OWNER", entryType: "PAID", amount: 400000, date: new Date("2026-01-01") },
    { side: "TENANT", entryType: "COLLECTED", amount: 900000, date: new Date("2026-02-01") },
    { side: "TENANT", entryType: "REFUND", amount: 300000, date: new Date("2026-10-01") },
    { side: "TENANT", entryType: "DEDUCTION", amount: 50000, date: new Date("2026-10-01"), reason: "Damage" },
  ];
  const owner = F.depositLedger(entries, "OWNER", 600000);
  const tenant = F.depositLedger(entries, "TENANT", 900000);
  assert.equal(owner.shortfall, 200000);
  assert.equal(owner.outstanding, 400000);
  assert.equal(tenant.outstanding, 550000);
  assert.equal(tenant.refunded, 300000);
  assert.equal(tenant.deducted, 50000);
});

test("fit-out budget vs actual, contribution and payback are estimates", () => {
  const fit = F.fitOutSummary({ fitOutBudget: 2000000 }, [{ kind: "EXPENSE", category: "CIVIL", amount: 1500000, amountPaid: 1500000 }, { kind: "EXPENSE", category: "ELECTRICAL", amount: 700000, amountPaid: 200000 }]);
  assert.equal(fit.overBudget, true);
  assert.equal(fit.variance, -200000);
  assert.equal(fit.vendorOutstanding, 500000);
  const m = F.officeMetrics({ ownerAgreement: lease({ escalations: [] }), tenantAgreement: lease({ side: "TENANT", baseRent: 150000, escalations: [] }), fitOut: fit, today: new Date("2026-05-01") });
  assert.equal(m.operatingContributionMonthly, 50000);
  assert.equal(m.paybackMonths, 44);
  assert.match(m.basis, /Estimate/);
});

test("alerts: vacant exposure, tenant expiry before the master lease, notice deadline", () => {
  const office = { _id: "o", name: "Office", operationalStatus: "READY_VACANT" };
  const owner = lease({ endDate: new Date("2029-12-31") });
  const vacant = F.officeAlerts({ office, ownerAgreement: owner, tenantAgreement: null, today: new Date("2026-05-01") });
  assert.ok(vacant.some((a) => a.type === "VACANT_EXPOSURE"));
  const tenant = lease({ side: "TENANT", endDate: new Date("2027-12-31"), noticePeriodMonths: 2 });
  const late = F.officeAlerts({ office: { ...office, operationalStatus: "OCCUPIED" }, ownerAgreement: owner, tenantAgreement: tenant, today: new Date("2027-10-20") });
  assert.ok(late.some((a) => a.type === "LEASE_EXPIRY" && /Tenant/.test(a.message)));
  assert.ok(late.some((a) => a.type === "NOTICE_DEADLINE" && /Tenant/.test(a.message)));
  assert.ok(!late.some((a) => a.type === "LEASE_EXPIRY" && /Owner/.test(a.message)));
  assert.ok(!late.some((a) => a.type === "VACANT_EXPOSURE"));
});

test("checklists come from the company handout; partnership is left for the Admin", () => {
  assert.ok(E.DEFAULT_CHECKLISTS.COMPANY.some((i) => i.scope === "SIGNATORY"));
  assert.ok(E.DEFAULT_CHECKLISTS.INDIVIDUAL.length > 0);
  assert.deepEqual(E.DEFAULT_CHECKLISTS.PARTNERSHIP, []);
  assert.ok(E.DOCUMENT_STATUSES.includes("NOT_APPLICABLE") && E.DOCUMENT_STATUSES.includes("UNDER_REVIEW"));
});

test("Database: roles, kinds and no name-only duplicate matching", () => {
  for (const r of ["SECURITY_GUARD", "MAINTENANCE_STAFF", "BUILDING_MANAGER", "PROPERTY_MANAGER", "PA", "ACCOUNTANT", "AUTHORIZED_REPRESENTATIVE", "OWNER", "BROKER"]) assert.ok(D.CONTACT_ROLES.includes(r), r);
  const db = src("services/database.service.js");
  const dup = db.slice(db.indexOf("const findDuplicateContacts"), db.indexOf("const createContact"));
  const query = dup.slice(0, dup.indexOf("Contact.find"));
  assert.ok(!/name/.test(query), "contact duplicate search never matches on name");
  assert.match(db, /never its availability/);
});

test("permissions and protected files are enforced on the server", () => {
  const ent = src("routes/enterprise.routes.js");
  assert.match(ent, /checkRoleOrPageAccess\(E\.ENTERPRISE_ROLES, "enterprise"\)/);
  assert.match(ent, /requirePageActionForMethod\("enterprise"\)/);
  const dbr = src("routes/database.routes.js");
  assert.match(dbr, /checkRoleOrPageAccess\(DATABASE_ROLES/);
  assert.match(dbr, /merge", writeLimiter, manageOnly/);
  const docs = require("../src/services/documentAccess.service");
  assert.ok(docs.isProtectedClientDocument("enterprise-documents/x.pdf"));
  assert.ok(!docs.canDownloadClientDocuments({ role: "MANAGER" }));
  assert.ok(docs.canDownloadClientDocuments({ role: "ADMIN" }));
  assert.ok(require("../src/config/uploadStorage").UPLOAD_CATEGORIES?.includes?.("enterprise-documents") ?? src("config/uploadStorage.js").includes("\"enterprise-documents\""));
  const pages = require("../src/constants/page.constants");
  const list = pages.PAGES || pages.PAGE_CATALOG || pages.PAGE_DEFINITIONS || Object.values(pages).find(Array.isArray);
  assert.ok(list.some((p) => p.key === "enterprise") && list.some((p) => p.key === "database"));
});

test("routes are mounted", () => {
  const app = src("app.js");
  assert.match(app, /"\/api\/database"/);
  assert.match(app, /"\/api\/enterprise"/);
});

test("second round: proof files, office documents, reminders", () => {
  assert.ok(E.DOCUMENT_CATEGORIES.includes("LEASE_DEED") && E.DOCUMENT_CATEGORIES.includes("BILL"));
  for (const t of ["LEASE_EXPIRY", "NOTICE_DEADLINE", "ESCALATION", "OVERDUE_COLLECTION", "OVERDUE_PAYABLE"]) assert.ok(E.REMINDER_TYPES.includes(t), t);
  for (const m of ["EnterpriseTransaction", "EnterpriseLedgerEntry"]) assert.ok(require(`../src/models/${m}`).schema.path("attachments"), `${m} keeps attachments`);
  const R = require("../src/models/EnterpriseReminder");
  assert.ok(R.schema.indexes().some(([keys, o]) => keys.key === 1 && o.unique), "one reminder per key");
  const svc = src("services/enterprise.service.js");
  assert.match(svc, /startsWith\(PROTECTED_DOC_PREFIX\)/);
  const routes = src("routes/enterprise.routes.js");
  assert.match(routes, /router\.post\("\/attachments"/);
  assert.match(routes, /router\.get\("\/reminders"/);
  assert.match(src("server.js"), /startEnterpriseReminderSweep\(\);/);
});
