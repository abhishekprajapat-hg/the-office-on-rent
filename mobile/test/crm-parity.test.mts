import { test } from "node:test";
import assert from "node:assert/strict";
import { buildPalette as build, isAccentId, type AccentId } from "../src/theme/accents.ts";
import { dark, light } from "../src/theme/tokens.ts";
import { navTarget, trimHistory } from "../src/lib/assistant.ts";
import { matchesQuery, withinWindow } from "../src/lib/inboxFilters.ts";
import { amountText, clientLabel, proposalFileName, proposalHtml, proposalMailUrl, proposalSubject, proposalText, validityOf } from "../src/lib/proposal.ts";
import { datedFileName, toCsv } from "../src/lib/csv.ts";
import { contactRowsFromMatrix } from "../src/lib/contactImport.ts";
import { logModeOf, matchesTimeline, withLogMode } from "../src/lib/leadLog.ts";
import { canScheduleFollowUp, defaultFollowUpOn, isUnpaidCollection, phoneSearch } from "../src/lib/followUp.ts";
import { buildFieldDashboard, directionsUrl, fieldExecutiveOf, validPoint } from "../src/lib/fieldOps.ts";
import { newUnit, unitDraftFrom, unitError, unitPayload, unitsError, unitSummary, withDimension } from "../src/lib/projectUnits.ts";
import { buildReport, rangeBounds, rangeDateOf, reportCsvRows } from "../src/lib/reports.ts";
import { brokerageReportRows, financialYearStart, summaryReportRows } from "../src/lib/revenueCsv.ts";
import { badLink, enterpriseProfit, parseLinks, pincodeError } from "../src/lib/propertyForm.ts";
import { typingLine, unseenByMe } from "../src/lib/chat.ts";
import { profileDraftError, profileDraftFrom, profilePatch, reportingCandidates, targetProgress, taskStats } from "../src/lib/userAdmin.ts";

const draft = (over = {}) => ({ ...profileDraftFrom({ name: "Riya Shah", email: "riya@acme.in", parentId: "m1" }), ...over });

test("profile draft starts from the server record, with its defaults", () => {
  const start = profileDraftFrom({ name: "A B", email: "a@b.co", parentId: { _id: "m1", name: "Mgr" }, roleType: "BOTH" });
  assert.equal(start.reportingToId, "m1");
  assert.equal(start.roleType, "BOTH");
  assert.equal(start.monthlyTarget, "10");
  assert.equal(start.brokerageMode, "FLAT");
  assert.equal(start.brokerageValue, "50000");
  assert.equal(profileDraftFrom({ brokerageConfig: { mode: "percentage" } }).brokerageValue, "2");
  assert.equal(profileDraftFrom({ roleType: "WHATEVER" }).roleType, "COMMERCIAL");
});

test("profile draft checks match the server's", () => {
  assert.equal(profileDraftError(draft(), "EXECUTIVE"), null);
  assert.match(profileDraftError(draft({ name: "" }), "EXECUTIVE")!, /required/);
  assert.match(profileDraftError(draft({ name: "A" }), "EXECUTIVE")!, /2 to 80/);
  assert.match(profileDraftError(draft({ email: "nope" }), "EXECUTIVE")!, /valid email/);
  assert.match(profileDraftError(draft({ monthlyTarget: "-1" }), "EXECUTIVE")!, /0 or more/);
  assert.match(profileDraftError(draft({ monthlyTarget: "" }), "EXECUTIVE")!, /0 or more/);
  assert.match(profileDraftError(draft({ reportingToId: "" }), "MANAGER")!, /admin/);
  assert.equal(profileDraftError(draft({ reportingToId: "" }), "ADMIN"), null);
  assert.match(profileDraftError(draft({ brokerageMode: "PERCENTAGE", brokerageValue: "120" }), "CHANNEL_PARTNER")!, /100/);
  assert.equal(profileDraftError(draft({ brokerageMode: "PERCENTAGE", brokerageValue: "120" }), "EXECUTIVE"), null);
});

test("the saved patch only carries partner fields for a channel partner", () => {
  const exec = profilePatch(draft({ canViewInventory: true }), "EXECUTIVE");
  assert.equal(exec.canViewInventory, false);
  assert.equal("brokerageConfig" in exec, false);
  assert.equal(exec.reportingToId, "m1");
  assert.equal(exec.monthlyTarget, 10);
  const partner = profilePatch(draft({ canViewInventory: true, brokerageMode: "PERCENTAGE", brokerageValue: "3", brokerageNotes: " net " }), "CHANNEL_PARTNER");
  assert.deepEqual(partner.brokerageConfig, { mode: "PERCENTAGE", value: 3, notes: "net" });
  assert.equal(partner.canViewInventory, true);
  assert.equal(profilePatch(draft(), "ADMIN").reportingToId, null);
});

test("reporting candidates follow the parent-role rules", () => {
  const users = [
    { _id: "a", role: "ADMIN" },
    { _id: "m1", role: "MANAGER" },
    { _id: "m2", role: "MANAGER", isActive: false },
    { _id: "e", role: "EXECUTIVE" },
  ];
  assert.deepEqual(reportingCandidates(users, "EXECUTIVE", "e").map((u) => u._id), ["m1"]);
  assert.deepEqual(reportingCandidates(users, "MANAGER", "m1").map((u) => u._id), ["a"]);
  assert.deepEqual(reportingCandidates(users, "ADMIN", "a"), []);
});

test("task load and target progress", () => {
  const now = new Date(2026, 9, 15, 12);
  const stats = taskStats(
    [
      { status: "COMPLETED", dueDate: "2026-10-01" },
      { status: "IN_PROGRESS", dueDate: new Date(2026, 9, 10).toISOString() },
      { status: "PENDING", dueDate: new Date(2026, 9, 15, 9).toISOString() },
      { status: "PENDING" },
    ],
    now,
  );
  assert.deepEqual(stats, { total: 4, completed: 1, inProgress: 1, open: 3, overdue: 1, completionRate: 25 });
  assert.deepEqual(targetProgress(10, 4), { target: 10, achieved: 4, remaining: 6, percent: 40 });
  assert.equal(targetProgress(10, 14).percent, 100);
  assert.equal(targetProgress(0, 3).percent, 0);
});

const buildPalette = (scheme: "light" | "dark", accent?: AccentId, contrast?: boolean) => build(scheme === "dark" ? dark : light, scheme, accent, contrast);

test("colour themes recolour the accent only; high contrast strengthens text", () => {
  const classic = buildPalette("light");
  assert.equal(classic.primary, "#2549d6");
  const emerald = buildPalette("light", "emerald");
  assert.equal(emerald.primary, "#059669");
  assert.equal(emerald.hero, "#059669");
  assert.equal(emerald.danger, classic.danger);
  assert.equal(buildPalette("dark", "emerald").primary, "#34d399");
  assert.equal(buildPalette("dark", "graphite").onPrimary, "#09090b");
  assert.notEqual(buildPalette("light", "classic", true).textMuted, classic.textMuted);
  assert.equal(buildPalette("light", "classic", true).primary, classic.primary);
  assert.equal(isAccentId("violet"), true);
  assert.equal(isAccentId("neon"), false);
});

test("assistant handles 'take me to' locally and leaves questions to the server", () => {
  assert.deepEqual(navTarget("Take me to reports"), { route: "Reports", label: "Reports", page: "reports" });
  assert.equal(navTarget("open the leads page")?.tab, "Leads");
  assert.equal(navTarget("go to field ops")?.route, "FieldOps");
  assert.equal(navTarget("Show interested leads"), null);
  assert.equal(navTarget("open lead by phone 98765"), null);
  assert.equal(navTarget("who is the best performer"), null);
  const many = Array.from({ length: 100 }, (_, i) => ({ id: String(i), from: "me" as const, text: "q", at: "" }));
  assert.equal(trimHistory(many).length, 80);
  assert.equal(trimHistory(many)[0]!.id, "20");
});

test("inbox date windows and search", () => {
  const now = new Date(2026, 9, 15, 15);
  assert.equal(withinWindow(new Date(2026, 9, 15, 1), "TODAY", now), true);
  assert.equal(withinWindow(new Date(2026, 9, 14, 23), "TODAY", now), false);
  assert.equal(withinWindow(new Date(2026, 9, 9, 16), "WEEK", now), true);
  assert.equal(withinWindow(new Date(2026, 9, 1), "WEEK", now), false);
  assert.equal(withinWindow(new Date(2026, 9, 1), "MONTH", now), true);
  assert.equal(withinWindow(null, "MONTH", now), false);
  assert.equal(withinWindow(null, "ALL", now), true);
  assert.equal(matchesQuery(["Payment request", "Rahul Sharma · UPI"], "rahul upi"), true);
  assert.equal(matchesQuery(["Payment request", "Rahul Sharma"], "rahul cash"), false);
  assert.equal(matchesQuery([null, "x"], "  "), true);
});

const office = { _id: "64f0aa11bb22cc33dd44ee55", propertyId: "OOR-118", projectName: "Cyber Park", towerName: "Tower B", unitNumber: "1204", city: "Gurugram", area: "Sector 39", type: "Rent" as const, rent: 185000, category: "Office", inventoryType: "COMMERCIAL" as const, images: [] };

test("proposal never shows the building or unit, and prices a rental by rent", () => {
  assert.equal(clientLabel(office), "OOR-118 - Cyber Park");
  assert.equal(clientLabel({ _id: "64f0aa11bb22cc33dd44ee55" }), "Property 44EE55");
  assert.equal(amountText(office), "Rs. 1,85,000 / month");
  assert.equal(amountText({ ...office, type: "Sale", price: 0 }), "On request");
  assert.equal(amountText({ ...office, type: "Both", price: 32000000 }), "Rs. 3,20,00,000 | Rs. 1,85,000 / month");
  assert.equal(validityOf("15"), 15);
  assert.equal(validityOf("0"), 7);
  assert.equal(validityOf("abc"), 7);
  const input = { clientName: "Ananya Das", items: [{ property: office, link: "https://x/shared/inventory/t1" }], validityDays: "10", note: "Rent negotiable", date: new Date(2026, 9, 15) };
  const text = proposalText(input);
  assert.match(text, /^THE OFFICE ON RENT - PROPERTY PROPOSAL\nDate: 15\/10\/2026/);
  assert.match(text, /Property 1: OOR-118 - Cyber Park/);
  assert.match(text, /Location: Gurugram, Sector 39/);
  assert.match(text, /Rent: Rs\. 1,85,000 \/ month/);
  assert.match(text, /Details Link: https:\/\/x\/shared\/inventory\/t1/);
  assert.match(text, /Validity: 10 day\(s\)\nSpecial Note: Rent negotiable/);
  assert.doesNotMatch(text, /Tower B|1204/);
  const html = proposalHtml({ ...input, clientName: "<Ananya>", items: [{ property: office, images: ["https://cdn/x.jpg"] }] });
  assert.match(html, /&lt;ANANYA&gt;/);
  assert.match(html, /<img src="https:\/\/cdn\/x.jpg"/);
  assert.match(html, /10 Days/);
  assert.doesNotMatch(html, /Tower B|1204/);
  assert.equal(proposalSubject([{ property: office }]), "Property Proposal | OOR-118 - Cyber Park");
  assert.equal(proposalSubject([{ property: office }, { property: office }]), "Property Proposal | 2 Properties");
  assert.equal(proposalFileName("Ananya Das!"), "proposal-ananya-das.pdf");
  assert.equal(proposalMailUrl("", "S b", "x&y"), "mailto:?subject=S%20b&body=x%26y");
});

test("csv quotes every cell", () => {
  assert.equal(toCsv([["Name", "Note"], ["Rahul", 'Said "call me", later']]), '"Name","Note"\r\n"Rahul","Said ""call me"", later"');
  assert.equal(toCsv([[null, undefined, 0]]), '"","","0"');
  assert.equal(datedFileName("leads", new Date(2026, 0, 5)), "leads-2026-01-05.csv");
});

test("contact sheets are read by header meaning", () => {
  const rows = contactRowsFromMatrix([
    ["Owners list"],
    ["Owner Name", "Mobile No.", "Firm", "Remarks", "Mystery"],
    ["Ravi Sharma", "98765 43210", "Sharma Realty", "evenings", "x"],
    ["", "", "", "", ""],
    ["Only Name", "", "", "", ""],
  ]);
  assert.deepEqual(rows[0], { name: "Ravi Sharma", phone: "98765 43210", email: "", company: "Sharma Realty", city: "", propertyDetails: "", notes: "evenings" });
  assert.equal(rows.length, 2);
  assert.throws(() => contactRowsFromMatrix([["Name", "City"], ["A", "B"]]), /phone column/);
  assert.throws(() => contactRowsFromMatrix([["foo", "bar"]]), /No recognisable columns/);
});

test("call and visit notes carry their prefix", () => {
  assert.equal(withLogMode("spoke about rent", "CALL"), "Call: spoke about rent");
  assert.equal(withLogMode("Call: spoke about rent", "VISIT"), "Visit: spoke about rent");
  assert.equal(withLogMode("Visit: liked it", "NOTE"), "liked it");
  assert.equal(logModeOf("Call: x"), "CALL");
  assert.equal(logModeOf("Visit: x"), "VISIT");
  assert.equal(logModeOf("called back"), "NOTE");
  assert.equal(matchesTimeline("Lead diary note added", "NOTES"), true);
  assert.equal(matchesTimeline("Lead transferred to Riya", "ASSIGNMENTS"), true);
  assert.equal(matchesTimeline("Status changed", "CALLS"), false);
  assert.equal(matchesTimeline("anything", "ALL"), true);
});

test("follow-up rules match the server", () => {
  const partial = { status: "CLOSED", dealPayment: { paymentType: "PARTIAL", remainingAmount: 50000 } };
  assert.equal(isUnpaidCollection(partial), true);
  assert.equal(canScheduleFollowUp(partial), true);
  assert.equal(canScheduleFollowUp({ status: "CLOSED", dealPayment: { paymentType: "FULL" } }), false);
  assert.equal(canScheduleFollowUp({ status: "LOST" }), false);
  assert.equal(canScheduleFollowUp({ status: "INTERESTED" }), true);
  assert.equal(phoneSearch("+91 98765-43210"), "9876543210");
  assert.equal(phoneSearch("98765 43210"), "9876543210");
  assert.equal(phoneSearch("Rahul 2"), "Rahul 2");
  const now = new Date(2026, 9, 15, 14, 20);
  assert.equal(defaultFollowUpOn(new Date(2026, 9, 15), now).getHours(), 15);
  assert.equal(defaultFollowUpOn(new Date(2026, 9, 16), now).getHours(), 11);
  assert.equal(defaultFollowUpOn(new Date(2026, 9, 15), new Date(2026, 9, 15, 23, 30)).getHours(), 23);
});

test("field dashboard matches the web's numbers", () => {
  const now = new Date(2026, 9, 15, 12);
  const users = [
    { _id: "f1", name: "Fiza", role: "FIELD_EXECUTIVE", liveLocation: { lat: 28.5, lng: 77.3 } },
    { _id: "f2", name: "Farhan", role: "FIELD_EXECUTIVE" },
    { _id: "f3", name: "Old", role: "FIELD_EXECUTIVE", isActive: false },
    { _id: "e1", name: "Esha", role: "EXECUTIVE" },
  ];
  const leads = [
    { _id: "l1", name: "A", status: "SITE_VISIT", nextFollowUp: new Date(2026, 9, 15, 16).toISOString(), assignedTo: { _id: "e1", role: "EXECUTIVE" }, assignedFieldExecutive: { _id: "f1" } },
    { _id: "l2", name: "B", status: "INTERESTED", nextFollowUp: new Date(2026, 9, 14).toISOString(), assignedTo: { _id: "f1", role: "FIELD_EXECUTIVE" } },
    { _id: "l3", name: "C", status: "NEW" },
    { _id: "l4", name: "D", status: "CLOSED", assignedTo: { _id: "f2", role: "FIELD_EXECUTIVE" } },
  ];
  const d = buildFieldDashboard(leads, users, now);
  assert.equal(d.fieldExecutives.length, 2);
  assert.equal(d.activeLeads.length, 3);
  assert.equal(d.siteVisitLeads.length, 1);
  assert.deepEqual(d.unassignedQueue.map((lead) => lead._id), ["l3"]);
  assert.equal(d.overdueFollowUps.length, 1);
  assert.deepEqual(d.workload.map((row) => [row.executive._id, row.activeAssigned, row.siteVisits, row.overdue, row.todaysVisits]), [["f1", 2, 1, 1, 1], ["f2", 0, 0, 0, 0]]);
  assert.equal(d.tracked, 1);
  assert.equal(d.coveragePercent, 50);
  assert.equal(d.averageLoad, 1);
  assert.equal(fieldExecutiveOf({ _id: "x", name: "x", assignedTo: { _id: "e1", role: "EXECUTIVE" } }), null);
  assert.equal(validPoint(0, 0), null);
  assert.equal(validPoint(null, 77), null);
  assert.deepEqual(validPoint("28.5", 77.1), { lat: 28.5, lng: 77.1 });
  assert.equal(directionsUrl({ lat: 1, lng: 2 }, { lat: 3, lng: 4 }), "https://www.google.com/maps/dir/?api=1&destination=1,2&travelmode=driving&origin=3,4");
});

test("project units follow the web form's rules", () => {
  const office = newUnit("offices", 2);
  assert.equal(office.officeCode, "OFF-003");
  assert.equal(office.status, "AVAILABLE");
  assert.match(unitError(office, "Office 3")!, /length/);
  const sized = withDimension(withDimension(office, "length", "20"), "breadth", "12.5");
  assert.equal(sized.carpetArea, "250");
  assert.equal(unitError({ ...sized, startingRate: "9000", currentRate: "8000" }, "Office 3"), "Office 3: current rate can't be below the starting rate");
  assert.equal(unitError(sized, "Office 3"), null);
  const payload = unitPayload("offices", { ...sized, floorNumber: "4", officeName: " Corner ", reservedParking: "", plc: "" });
  assert.equal(payload.officeCode, "OFF-003");
  assert.equal(payload.floorNumber, 4);
  assert.equal(payload.carpetArea, 250);
  assert.equal(payload.reservedParking, 0);
  assert.equal(payload.officeName, "Corner");
  assert.equal(payload.height, null);
  const shop = unitPayload("shops", unitDraftFrom("shops", { _id: "s1", shopCode: "SHOP-001", floorNumber: 0, length: 10, breadth: 10, parking: 2, status: "SOLD" }));
  assert.equal(shop.parking, 2);
  assert.equal("officeName" in shop, false);
  assert.equal(unitsError({ offices: [sized], shops: [], showrooms: [newUnit("showrooms", 0)] }), "Showroom 1: length must be more than 0");
  assert.equal(unitSummary({ ...sized, floorNumber: "2" }), "Floor 2 · 250 sq ft · Available");
});

test("reports: year, custom ranges and the web's date rule", () => {
  const now = new Date(2026, 9, 15);
  assert.equal(rangeBounds("YEAR", 0, now)!.from.getMonth(), 0);
  assert.equal(rangeBounds("CUSTOM", -1, now, { from: now, to: now }), null);
  const custom = rangeBounds("CUSTOM", 0, now, { from: new Date(2026, 9, 10, 15), to: new Date(2026, 9, 1) })!;
  assert.equal(custom.from.getDate(), 1);
  assert.equal(custom.to.getDate(), 10);
  assert.equal(rangeDateOf({ status: "CLOSED", createdAt: "2026-01-01", updatedAt: "2026-10-02" }), "2026-10-02");
  assert.equal(rangeDateOf({ status: "NEW", createdAt: "2026-01-01", updatedAt: "2026-10-02" }), "2026-01-01");
  const leads = [
    { status: "CLOSED", createdAt: new Date(2026, 3, 1).toISOString(), updatedAt: new Date(2026, 9, 3).toISOString(), brokerageReceived: 50000, assignmentHistory: [{ action: "MANUAL_TRANSFER" }] },
    { status: "NEW", createdAt: new Date(2026, 9, 5).toISOString() },
    { status: "NEW", createdAt: new Date(2026, 8, 5).toISOString() },
  ];
  const report = buildReport(leads, "MONTH", now);
  assert.equal(report.summary.received, 2);
  assert.equal(report.transferred, 1);
  assert.equal(report.monthly.length, 6);
  assert.deepEqual(report.monthly.at(-1), { label: report.monthly.at(-1)!.label, leads: 2, closed: 1 });
  const rows = reportCsvRows(report);
  assert.deepEqual(rows[0], ["Section", "Metric", "Value"]);
  assert.deepEqual(rows[2], ["Summary", "Transferred leads", 1]);
  assert.equal(buildReport(leads, "CUSTOM", now, { from: new Date(2026, 8, 1), to: new Date(2026, 8, 30) }).hasPrevious, false);
});

test("revenue CSVs carry the web's columns", () => {
  const rows = brokerageReportRows([{ dealId: "D-1", model: "BUY_SELL", brokerageAgreed: null, closingDate: "2026-10-01T06:00:00Z" }]);
  assert.equal(rows[0]!.length, 14);
  assert.equal(rows[1]![1], "Buy & Sell");
  assert.equal(rows[1]![9], "");
  assert.match(String(rows[1]![12]), /01 Oct 2026/);
  assert.deepEqual(summaryReportRows({ summary: { totalRevenue: 9 } })[7], ["Total revenue", 9]);
  assert.equal(financialYearStart(new Date(2026, 1, 10)), "2025-04-01");
  assert.equal(financialYearStart(new Date(2026, 3, 1)), "2026-04-01");
});

test("property form helpers", () => {
  assert.deepEqual(parseLinks(" https://a.io/v \n\nhttps://a.io/v\nhttps://b.io "), ["https://a.io/v", "https://b.io"]);
  assert.equal(badLink(["https://a.io", "youtube.com/x"]), "youtube.com/x");
  assert.equal(badLink(["https://a.io"]), null);
  assert.equal(enterpriseProfit("50,000", "65000"), 15000);
  assert.equal(enterpriseProfit("", "65000"), null);
  assert.equal(pincodeError("12345"), "PIN code is 6 digits");
  assert.equal(pincodeError(""), null);
});

test("chat typing line and unseen messages", () => {
  assert.equal(typingLine(["Riya Shah"]), "Riya is typing…");
  assert.equal(typingLine(["Riya Shah", "Aman"]), "Riya and Aman are typing…");
  assert.equal(typingLine(["a", "b", "c"]), "3 people are typing…");
  assert.equal(typingLine([]), "");
  const list = [
    { _id: "1", sender: { _id: "me", name: "Me" }, createdAt: "1" },
    { _id: "2", sender: { _id: "u2", name: "U" }, createdAt: "2", seenBy: [{ user: "me" }] },
    { _id: "3", sender: { _id: "u2", name: "U" }, createdAt: "3" },
    { _id: "local-9", sender: { _id: "u2", name: "U" }, createdAt: "4" },
  ];
  assert.deepEqual(unseenByMe(list, "me").map((item) => item._id), ["3"]);
});
