// Pending work from the requirements audit of 7 Oct 2026.
const test = require("node:test");
const assert = require("node:assert/strict");

test("lead transfer is open to every sales role, not only executives", () => {
  const { MANUAL_LEAD_TRANSFER_TARGET_ROLES, MANUAL_LEAD_TRANSFER_ACTOR_ROLES } = require("../src/constants/role.constants");
  for (const role of ["ADMIN", "MANAGER", "INSIDE_EXECUTIVE", "EXECUTIVE", "FIELD_EXECUTIVE"]) {
    assert.ok(MANUAL_LEAD_TRANSFER_TARGET_ROLES.includes(role), `${role} can receive a lead`);
    assert.ok(MANUAL_LEAD_TRANSFER_ACTOR_ROLES.includes(role), `${role} can transfer a lead`);
  }
  for (const role of ["PRODUCTION_EXECUTIVE", "COMMUNITY_MANAGER", "CHANNEL_PARTNER", "COWORKING_ADMIN"]) {
    assert.equal(MANUAL_LEAD_TRANSFER_TARGET_ROLES.includes(role), false, `${role} does not work leads`);
  }
});

test("auto-distribution still skips field executives", () => {
  const { LEAD_OWNER_ROLES } = require("../src/constants/role.constants");
  assert.deepEqual([...LEAD_OWNER_ROLES], ["INSIDE_EXECUTIVE", "EXECUTIVE"]);
});

test("new qualification statuses are valid lead and status-request values", () => {
  const Lead = require("../src/models/Lead");
  const LeadStatusRequest = require("../src/models/LeadStatusRequest");
  const leadStatuses = Lead.schema.path("status").enumValues;
  const requestStatuses = LeadStatusRequest.schema.path("proposedStatus").enumValues;
  for (const status of ["QUALIFIED_LEAD", "REQUIREMENT_AFTER_1_MONTH", "REQUIREMENT_AFTER_2_MONTHS", "FOLLOW_UP_1", "FOLLOW_UP_3"]) {
    assert.ok(leadStatuses.includes(status), `Lead accepts ${status}`);
    assert.ok(requestStatuses.includes(status), `Status request accepts ${status}`);
  }
});

test("Requirement After 1/2 Months schedules the callback that far out", () => {
  const { getRequirementLaterFollowUpDate } = require("../src/controllers/lead.controller");
  const from = new Date("2026-10-07T06:00:00.000Z");
  assert.equal(getRequirementLaterFollowUpDate("REQUIREMENT_AFTER_1_MONTH", from).toISOString(), "2026-11-07T06:00:00.000Z");
  assert.equal(getRequirementLaterFollowUpDate("REQUIREMENT_AFTER_2_MONTHS", from).toISOString(), "2026-12-07T06:00:00.000Z");
  assert.equal(getRequirementLaterFollowUpDate("INTERESTED", from), null);
});

test("attendance status follows the policy thresholds, defaulting to 4 h / 7 h 30 m", () => {
  const { resolveAttendanceStatus } = require("../src/controllers/attendance.controller");
  const checkInAt = new Date("2026-10-07T04:30:00Z");
  const at = (workedMinutes, policy) => resolveAttendanceStatus({ attendanceDate: "2026-10-07", checkInAt, workedMinutes, policy });
  assert.equal(at(1), "ABSENT");
  assert.equal(at(239), "ABSENT");
  assert.equal(at(240), "HALF_DAY");
  assert.equal(at(449), "HALF_DAY");
  assert.equal(at(450), "PRESENT");
  // A company that sets 5 h / 8 h gets those rules instead.
  const strict = { halfDayMinutes: 300, fullDayMinutes: 480 };
  assert.equal(at(299, strict), "ABSENT");
  assert.equal(at(300, strict), "HALF_DAY");
  assert.equal(at(479, strict), "HALF_DAY");
  assert.equal(at(480, strict), "PRESENT");
  assert.equal(resolveAttendanceStatus({ attendanceDate: "2026-10-07", checkInAt: null, workedMinutes: 600 }), "ABSENT");
});

test("shared inventory sends only an approximate (~1 km) location", () => {
  const { toClientSafeView } = require("../src/controllers/publicInventory.controller");
  const safe = toClientSafeView({ projectName: "Office", siteLocation: { lat: 22.7196123, lng: 75.8577258 } });
  assert.deepEqual(safe.siteLocation, { lat: 22.72, lng: 75.86, approximate: true });
  assert.equal(JSON.stringify(safe).includes("22.7196"), false);
  assert.equal("siteLocation" in toClientSafeView({ projectName: "Office", siteLocation: { lat: null, lng: null } }), false);
});

test("brokerage payload accepts source, agreed amount and payment date", () => {
  const { parseBrokeragePayload } = require("../src/controllers/lead.controller");
  const ok = parseBrokeragePayload({ brokerageReceived: 50000, brokerageSource: "tenant", brokerageAgreed: 75000, brokeragePaymentDate: "2026-10-05" });
  assert.equal(ok.error, undefined);
  assert.equal(ok.value.brokerageSource, "TENANT");
  assert.equal(ok.value.brokerageAgreed, 75000);
  assert.equal(ok.value.brokeragePaymentDate.toISOString().slice(0, 10), "2026-10-05");
  assert.match(parseBrokeragePayload({ brokerageSource: "BROKER" }).error, /TENANT, OWNER or BOTH/);
  assert.match(parseBrokeragePayload({ brokerageAgreed: -1 }).error, /negative/);
  // Extras alone must not reset what was already distributed.
  assert.equal(parseBrokeragePayload({ brokerageSource: "OWNER" }).value.hasDistributed, false);
});

test("inventory ownership and business model must agree", () => {
  const { sanitizeInventoryPayload } = require("../src/services/inventoryWorkflow.service");
  const enterprise = sanitizeInventoryPayload({
    payload: { ownershipType: "SELF", businessModel: "ENTERPRISE", enterpriseDetails: { leaseRent: "80000", clientRent: 120000, rentDueDay: 5, paymentStatus: "pending" } },
    mode: "update",
  });
  assert.equal(enterprise.ownershipType, "SELF");
  assert.equal(enterprise.businessModel, "ENTERPRISE");
  assert.equal(enterprise.enterpriseDetails.leaseRent, 80000);
  assert.equal(enterprise.enterpriseDetails.paymentStatus, "PENDING");
  assert.throws(() => sanitizeInventoryPayload({ payload: { ownershipType: "SELF", businessModel: "BUY_SELL" }, mode: "update" }), /self-owned/);
  assert.throws(() => sanitizeInventoryPayload({ payload: { ownershipType: "THIRD_PARTY", businessModel: "COWORKING" }, mode: "update" }), /third-party/);
  // A model on its own fills in the ownership it implies.
  assert.equal(sanitizeInventoryPayload({ payload: { businessModel: "RENTAL_BROKERAGE" }, mode: "update" }).ownershipType, "THIRD_PARTY");
  assert.throws(() => sanitizeInventoryPayload({ payload: { enterpriseDetails: { rentDueDay: 40 } }, mode: "update" }), /between 1 and 31/);
});

test("revenue report separates rental income from brokerage and nets out payouts", () => {
  const { buildRevenueReport } = require("../src/services/revenue.service");
  const report = buildRevenueReport({
    range: { from: "2026-10-01", to: "2026-10-31" },
    closedLeads: [
      // Brokerage doc scenario 3: 80k generated, 50k received, 30k to another broker.
      { _id: "aaaaaaaaaaaaaaaaaaaa0001", name: "Acme", brokerageReceived: 50000, brokerageDistributed: 30000,
        brokerageDistributionBreakdown: [{ recipientName: "Broker A", recipientType: "Broker", amount: 30000 }],
        requirements: { transactionType: "RENT" }, brokerageClosedAt: new Date("2026-10-04"), brokerageClosedBy: { name: "Divya" } },
      // Buy & Sell with 1 lakh agreed, 60k in so far.
      { _id: "aaaaaaaaaaaaaaaaaaaa0002", name: "Buyer", brokerageReceived: 60000, brokerageDistributed: 0, brokerageAgreed: 100000,
        brokerageSource: "BOTH", requirements: { transactionType: "SALE" }, brokerageClosedAt: new Date("2026-10-06") },
    ],
    enterpriseInventories: [{ _id: "e1", propertyId: "TOOR-C-1", projectName: "Tower", enterpriseDetails: { leaseRent: 80000, clientRent: 120000 } }],
    coworking: { invoiced: 200000, collected: 150000, outstanding: 50000 },
  });

  assert.equal(report.brokerage.grossBrokerage, 140000);
  assert.equal(report.brokerage.brokerageReceived, 110000);
  assert.equal(report.brokerage.brokerageDistributed, 30000);
  assert.equal(report.brokerage.netBrokerage, 110000);
  assert.equal(report.brokerage.pendingBrokerage, 40000);
  assert.equal(report.brokerage.rentalBrokerage.count, 1);
  assert.equal(report.brokerage.buySell.netBrokerage, 60000);
  assert.equal(report.rental.enterprise.monthlyProfit, 40000);
  assert.equal(report.rental.total, 270000);
  assert.equal(report.summary.totalRevenue, 380000);
  assert.equal(report.summary.netRevenue, 300000);
  assert.equal(report.payouts.length, 1);
  assert.equal(report.payouts[0].recipientName, "Broker A");
  const buyer = report.deals.find((d) => d.client === "Buyer");
  assert.equal(buyer.model, "BUY_SELL");
  assert.equal(buyer.brokeragePaymentStatus, "PARTIAL");
  assert.equal(report.deals.find((d) => d.client === "Acme").closingExecutive, "Divya");
});

test("revenue range defaults to this month and multiplies Enterprise rent by months", () => {
  const { resolveRange, monthsInRange } = require("../src/services/revenue.service");
  const range = resolveRange({}, new Date("2026-10-07T10:00:00Z"));
  assert.equal(range.from, "2026-10-01");
  assert.equal(range.to, "2026-10-07");
  assert.equal(range.start.toISOString(), "2026-09-30T18:30:00.000Z");
  assert.equal(monthsInRange("2026-04-01", "2026-10-07"), 7);
  assert.throws(() => resolveRange({ from: "2026-10-09", to: "2026-10-01" }), /on or before/);
});

test("task attachments only accept files uploaded to the CRM", () => {
  const { toTaskFiles } = require("../src/controllers/task.controller");
  const user = { _id: "507f1f77bcf86cd799439011" };
  assert.equal(toTaskFiles([{ url: "/api/uploads/files/task-attachments/1699-a.pdf", name: "Brief.pdf", size: 1200 }], user, 5).value[0].name, "Brief.pdf");
  assert.match(toTaskFiles([{ url: "https://example.com/x.pdf" }], user, 5).error, /uploaded to the CRM/);
  assert.match(toTaskFiles([{ url: "/api/uploads/files/../../etc/passwd" }], user, 5).error, /uploaded to the CRM/);
  assert.match(toTaskFiles(new Array(6).fill({ url: "/api/uploads/files/chat/a.png" }), user, 5).error, /At most 5/);
  const Task = require("../src/models/Task");
  for (const path of ["comments", "attachments", "activity"]) assert.ok(Task.schema.path(path), `Task has ${path}`);
  const { UPLOAD_CATEGORIES } = require("../src/config/uploadStorage");
  if (UPLOAD_CATEGORIES) assert.ok(UPLOAD_CATEGORIES.includes("task-attachments"));
});
