// Client answers 23 Nov 2026 (BillStack decisions):
//   D25 - Goldhawk's people are paid by Goldhawk: each person's pay goes to TOOR's or Goldhawk's
//         books, each company's part sent with that company's own BillStack key; a corrected
//         sheet with nobody left for a company withdraws that company's month.
//   D24 - payroll is finalised by an admin or someone an admin names (Aashi ma'am) by the 5th;
//         a reminder goes out on the 3rd, the 5th and the day after.
// The calculations always run. The parts that need a database run only with a throw-away one:
//   TEST_MONGO_URI="mongodb://127.0.0.1:27027/crm_payroll_companies_test?replicaSet=rs0&directConnection=true" node --test test/payroll-companies.test.cjs
const test = require("node:test");
const assert = require("node:assert/strict");
const calc = require("../src/services/payrollRun.calc");

const row = (userId, company, net, extra = {}) => ({
  userId, name: userId, company, companySource: "SET", monthlySalary: net, perDayRate: 0, attendanceLines: [], attendanceDeduction: 0,
  earnedSalary: net, additions: [], gross: net, deductions: [], totalDeduction: 0, net, kpi: {}, edits: {}, computed: {}, warnings: [], ...extra,
});
const RUN = { _id: "6a0000000000000000000001", month: "2026-10", version: 1, finalisedByName: "Aashi", finalisedAt: new Date("2026-11-04T10:00:00Z") };

test("D25: paid by - set per person; until then the residential team is Goldhawk's, everyone else TOOR's", () => {
  assert.deepEqual(calc.payingCompanyFor({ roleType: "RESIDENTIAL" }), { company: "GOLDHAWK", companySource: "TEAM" });
  assert.deepEqual(calc.payingCompanyFor({ roleType: "COMMERCIAL" }), { company: "TOOR", companySource: "DEFAULT" });
  assert.deepEqual(calc.payingCompanyFor({ roleType: "BOTH" }), { company: "TOOR", companySource: "DEFAULT" });
  assert.deepEqual(calc.payingCompanyFor({ roleType: "RESIDENTIAL" }, "TOOR"), { company: "TOOR", companySource: "SET" });
  assert.deepEqual(calc.payingCompanyFor({}, "GOLDHAWK"), { company: "GOLDHAWK", companySource: "SET" });
  assert.deepEqual(calc.payingCompanyFor({}, "SOMEONE"), { company: "TOOR", companySource: "DEFAULT" });
});

test("D25: a run is sent as one part per company, each with its own id; CRM-only fields stay behind", () => {
  const run = { ...RUN, rows: [row("asha", "TOOR", 20000), row("ravi", "GOLDHAWK", 15000), row("meena", "GOLDHAWK", 12000.5)] };
  const jobs = calc.billstackJobs(run);
  assert.deepEqual(jobs.map((j) => [j.company, j.withdraw, j.runId, j.employees, j.net]), [
    ["TOOR", false, RUN._id, 1, 20000],
    ["GOLDHAWK", false, `${RUN._id}:GOLDHAWK`, 2, 27000.5],
  ]);
  const goldhawk = jobs[1].payload;
  assert.equal(goldhawk.runId, `${RUN._id}:GOLDHAWK`);
  assert.deepEqual(goldhawk.rows.map((r) => r.userId), ["ravi", "meena"]);
  for (const key of ["company", "companySource", "edits", "computed", "warnings"]) assert.ok(!(key in goldhawk.rows[0]), `${key} is not sent`);
  assert.deepEqual(calc.totalsByCompany(run.rows).map((p) => [p.label, p.employees, p.net]), [["The Office on Rent", 1, 20000], ["Goldhawk", 2, 27000.5]]);
  // runs from before the split have no company on their rows: TOOR's
  assert.deepEqual(calc.billstackJobs({ ...RUN, rows: [{ ...row("old", "TOOR", 100), company: undefined }] }).map((j) => j.company), ["TOOR"]);
});

test("D25: a correction with nobody left for a company withdraws what an earlier version put in its books", () => {
  const v2 = { ...RUN, _id: "6a0000000000000000000002", version: 2, rows: [row("asha", "TOOR", 20000), row("ravi", "TOOR", 15000)] };
  const sentBoth = { billstackParts: [{ company: "TOOR", status: "SENT" }, { company: "GOLDHAWK", status: "SENT" }] };
  assert.deepEqual(calc.billstackJobs(v2, [sentBoth]).map((j) => [j.company, j.withdraw, j.payload.withdraw || false]), [["TOOR", false, false], ["GOLDHAWK", true, true]]);
  const withdrawal = calc.billstackJobs(v2, [sentBoth])[1].payload;
  assert.deepEqual(withdrawal, { withdraw: true, runId: "6a0000000000000000000002:GOLDHAWK", month: "2026-10", version: 2 });
  // Goldhawk's part never reached BillStack (failed): nothing to withdraw
  assert.equal(calc.billstackJobs(v2, [{ billstackParts: [{ company: "GOLDHAWK", status: "FAILED" }] }]).length, 1);
  // a run from before the split that was sent counts as TOOR's
  const v3 = { ...v2, version: 3, rows: [row("ravi", "GOLDHAWK", 15000)] };
  assert.deepEqual(calc.billstackJobs(v3, [{ billstack: { status: "SENT" } }]).map((j) => [j.company, j.withdraw]), [["TOOR", true], ["GOLDHAWK", false]]);
});

test("D25: the run's BillStack state is the sum of its parts", () => {
  assert.equal(calc.summariseParts([]).status, "NOT_SENT");
  assert.equal(calc.summariseParts([{ company: "TOOR", status: "SENT" }, { company: "GOLDHAWK", status: "SENT" }]).status, "SENT");
  const failed = calc.summariseParts([{ company: "TOOR", status: "SENT" }, { company: "GOLDHAWK", status: "FAILED", lastError: "key not set" }]);
  assert.deepEqual(failed, { status: "FAILED", lastError: "Goldhawk: key not set" });
});

test("D24: reminders on the 3rd, the 5th and the day after, for last month, until it is finalised", () => {
  const schedule = calc.scheduleOf({});
  assert.deepEqual(schedule, { reminderDay: 3, dueDay: 5 });
  assert.equal(calc.payrollReminderFor({ todayKey: "2026-12-02", schedule, finalised: false }), null);
  const third = calc.payrollReminderFor({ todayKey: "2026-12-03", schedule, finalised: false });
  assert.equal(third.key, "2026-11:remind");
  assert.equal(third.title, "Payroll for November 2026 is due by 5 December");
  assert.equal(calc.payrollReminderFor({ todayKey: "2026-12-04", schedule, finalised: false }).key, "2026-11:remind", "same key: sent once");
  assert.equal(calc.payrollReminderFor({ todayKey: "2026-12-05", schedule, finalised: false }).key, "2026-11:due");
  assert.equal(calc.payrollReminderFor({ todayKey: "2026-12-06", schedule, finalised: false }).key, "2026-11:late");
  assert.equal(calc.payrollReminderFor({ todayKey: "2026-12-03", schedule, finalised: true }), null);
  assert.equal(calc.payrollReminderFor({ todayKey: "2027-01-03", schedule, finalised: false }).month, "2026-12", "January reminds about December");
  assert.deepEqual(calc.scheduleOf({ payrollReminderDay: 9, payrollDueDay: 7 }), { reminderDay: 7, dueDay: 7 }, "the reminder never comes after the due day");
});

// ------------------------------------------------------------------ with a database

const MONGO_URI = process.env.TEST_MONGO_URI;
const needsDb = { skip: MONGO_URI ? false : "set TEST_MONGO_URI to run" };

test("D25 + D24 against a database: parts sent with each key, a missing Goldhawk key fails only its part, withdrawal, finalisers and reminders", needsDb, async () => {
  assert.ok(!/\/(crm|the-office-on-rent|toor)(\?|$)/i.test(MONGO_URI), "Use a throw-away test database");
  process.env.NODE_ENV = "test";
  process.env.BILLSTACK_BASE_URL = "http://127.0.0.1:5999";
  process.env.BILLSTACK_FRONTEND_URL = "http://127.0.0.1:5998/";
  process.env.BILLSTACK_API_KEY = "toor-test-key";
  delete process.env.BILLSTACK_GOLDHAWK_API_KEY;
  const mongoose = require("mongoose");
  await mongoose.connect(MONGO_URI, { serverSelectionTimeoutMS: 5000 });
  try {
    const User = require("../src/models/User");
    const PayrollRun = require("../src/models/PayrollRun");
    const remote = require("../src/services/billstack.service");
    const { getBillstackConfig } = require("../src/config/billstack");
    const service = require("../src/services/payrollRun.service");
    const companyId = new mongoose.Types.ObjectId();
    process.env.BILLSTACK_COMPANY_ID = String(companyId);

    const calls = [];
    remote.sendPayrollRun = async (cid, payload, { payrollCompany }) => {
      const config = getBillstackConfig(cid, { payrollCompany }); // a missing key fails here, as it would for real
      calls.push({ key: config.apiKey, runId: payload.runId, withdraw: Boolean(payload.withdraw), people: (payload.rows || []).length });
      return { outcome: payload.withdraw ? "withdrawn" : "created", remoteRunId: `remote-${calls.length}`, remoteStatus: "RECEIVED" };
    };
    const checked = [];
    remote.getPayrollRunStatus = async (cid, runId, { payrollCompany }) => { checked.push([runId, payrollCompany]); return { locked: false }; };

    const v1 = (await PayrollRun.create({ companyId, month: "2026-10", version: 1, rows: [row("asha", "TOOR", 20000), row("ravi", "GOLDHAWK", 15000)], totals: { employees: 2, net: 35000 } })).toObject();
    let sent = await service.resend({ companyId, runId: v1._id });
    assert.deepEqual(calls.map((c) => [c.key, c.runId, c.people]), [["toor-test-key", String(v1._id), 1]]);
    assert.equal(sent.billstack.status, "FAILED");
    assert.match(sent.billstack.lastError, /^Goldhawk: Goldhawk's BillStack key is not set/);
    assert.deepEqual(sent.billstackParts.map((p) => [p.company, p.status]), [["TOOR", "SENT"], ["GOLDHAWK", "FAILED"]]);

    process.env.BILLSTACK_GOLDHAWK_API_KEY = "goldhawk-test-key";
    sent = await service.resend({ companyId, runId: v1._id });
    assert.deepEqual(calls.slice(1).map((c) => [c.key, c.runId, c.people]), [["goldhawk-test-key", `${v1._id}:GOLDHAWK`, 1]], "only the failed part is sent again");
    assert.equal(sent.billstack.status, "SENT");
    assert.equal(sent.billstackParts.find((p) => p.company === "GOLDHAWK").attempts, 2);

    const admin = await User.create({ companyId, name: "Admin", email: `admin-${companyId}@example.com`, password: "x".repeat(20), role: "ADMIN" });
    await service.reopen({ companyId, runId: v1._id, actor: admin, reason: "Ravi moves to TOOR" });
    assert.deepEqual(checked, [[String(v1._id), "TOOR"], [`${v1._id}:GOLDHAWK`, "GOLDHAWK"]], "both companies' books are checked before reopening");

    const v2 = (await PayrollRun.create({ companyId, month: "2026-10", version: 2, rows: [row("asha", "TOOR", 20000), row("ravi", "TOOR", 15000)], totals: { employees: 2, net: 35000 } })).toObject();
    sent = await service.resend({ companyId, runId: v2._id });
    assert.deepEqual(calls.slice(2).map((c) => [c.key, c.runId, c.withdraw, c.people]), [
      ["toor-test-key", String(v2._id), false, 2],
      ["goldhawk-test-key", `${v2._id}:GOLDHAWK`, true, 0],
    ]);
    assert.equal(sent.billstack.status, "SENT");

    // D24: who may finalise
    const aashi = await User.create({ companyId, name: "Aashi", email: `aashi-${companyId}@example.com`, password: "x".repeat(20), role: "MANAGER" });
    const other = await User.create({ companyId, name: "Other", email: `other-${companyId}@example.com`, password: "x".repeat(20), role: "EXECUTIVE", roleType: "RESIDENTIAL" });
    assert.equal(await service.canFinalise({ companyId, user: aashi }), false);
    await assert.rejects(() => service.setAccess({ companyId, actor: aashi, body: { finaliserIds: [String(aashi._id)] } }), /Only an admin/);
    await assert.rejects(() => service.setAccess({ companyId, actor: admin, body: { finaliserIds: [String(new mongoose.Types.ObjectId())] } }), /not an active member/);
    const access = await service.setAccess({ companyId, actor: admin, body: { finaliserIds: [String(aashi._id)], dueDay: 5, reminderDay: 3 } });
    assert.deepEqual(access.finaliserIds, [String(aashi._id)]);
    assert.equal(await service.canFinalise({ companyId, user: aashi }), true);
    assert.equal(await service.canFinalise({ companyId, user: other }), false);
    const hers = await service.getAccess({ companyId, user: aashi });
    assert.equal(hers.canFinalise, true);
    assert.equal(hers.people, undefined, "only the admin sees the list of people");

    // D25: paid by, set and cleared
    assert.deepEqual((await service.setPayingCompany({ companyId, userId: other._id, company: "TOOR" })).companySource, "SET");
    assert.deepEqual(await service.setPayingCompany({ companyId, userId: other._id, company: "" }), { userId: String(other._id), name: "Other", company: "GOLDHAWK", companySource: "TEAM" });
    await assert.rejects(() => service.setPayingCompany({ companyId, userId: other._id, company: "ACME" }), /Paid by must be/);

    // D24: reminders, once each, to admins and the named finalisers
    const pushes = [];
    const sendPush = async (to, note) => { pushes.push({ to: [...to].sort(), title: note.title }); };
    const ist = (day, time = "10:00") => new Date(`${day}T${time}:00+05:30`);
    let out = await service.runPayrollReminders({ now: ist("2026-12-03"), sendPush });
    const mine = (list) => list.filter((s) => s.companyId === String(companyId));
    assert.deepEqual(mine(out.sent).map((s) => s.key), ["2026-11:remind"]);
    assert.deepEqual(pushes.at(-1), { to: [String(admin._id), String(aashi._id)].sort(), title: "Payroll for November 2026 is due by 5 December" });
    out = await service.runPayrollReminders({ now: ist("2026-12-03", "15:00"), sendPush });
    assert.equal(mine(out.sent).length, 0, "not sent twice");
    out = await service.runPayrollReminders({ now: ist("2026-12-05"), sendPush });
    assert.deepEqual(mine(out.sent).map((s) => s.key), ["2026-11:due"]);
    await PayrollRun.create({ companyId, month: "2026-11", version: 1, rows: [row("asha", "TOOR", 20000)], totals: { employees: 1, net: 20000 } });
    out = await service.runPayrollReminders({ now: ist("2026-12-06"), sendPush });
    assert.equal(mine(out.sent).length, 0, "finalised: no more reminders");
  } finally {
    await mongoose.connection.dropDatabase();
    await mongoose.disconnect();
  }
});
