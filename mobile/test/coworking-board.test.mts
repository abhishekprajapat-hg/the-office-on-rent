import { test } from "node:test";
import assert from "node:assert/strict";
import {
  actionConflict,
  boardCsv,
  boardReducer,
  clientsFrom,
  decorate,
  depositFor,
  directoryFrom,
  emptyInventory,
  expireHolds,
  hydrate,
  shareOf,
  stripDerived,
  summarize,
  upcomingBirthdays,
  type BoardState,
} from "../src/lib/coworkingBoard.ts";
import { clientsCsv, documentRecord, documentsFor, groupsOf, kycStatusOf, resolveIndustry, splitIndustry, withDocument } from "../src/lib/coworkingKyc.ts";
import { PLAN_CABINS } from "../src/lib/coworkingPlan.ts";

const fresh = (): BoardState => {
  const cabins = emptyInventory().map((cabin) => ({ ...cabin, monthlyRent: cabin.seats * 5000, deposit: cabin.seats * 10000 }));
  return { cabins, activity: [] };
};
const terms = { startDate: "2026-10-01T00:00:00.000Z", termMonths: 12, rent: 60000, depositMonths: 2, lockInMonths: 6, noticePeriodDays: 30, tokenAmount: 10000 };

test("the floor is 65 cabins in four wings, each on the plan", () => {
  const cabins = emptyInventory();
  assert.equal(cabins.length, 65);
  assert.deepEqual([...new Set(cabins.map((cabin) => cabin.wing))], ["A", "B", "C", "D"]);
  assert.equal(cabins.find((cabin) => cabin.code === "B7")?.seats, 10);
  assert.equal(cabins.find((cabin) => cabin.code === "C13")?.label, "C-13");
  for (const cabin of cabins) assert.ok(PLAN_CABINS[cabin.code], `${cabin.code} has a plan footprint`);
});

test("onboarding splits the agreed rent and token across cabins by list rent", () => {
  const state = boardReducer(fresh(), { type: "ONBOARD", cabinCodes: ["A1", "A5"], client: { name: "Nexbridge", kind: "company" }, terms });
  const a1 = state.cabins.find((c) => c.code === "A1")!;
  const a5 = state.cabins.find((c) => c.code === "A5")!;
  assert.equal(a1.status, "BOOKED");
  assert.equal(a1.contract!.monthlyRent + a5.contract!.monthlyRent, 60000);
  assert.equal(a1.contract!.monthlyRent, 24000); // 4 of 10 seats' list rent
  assert.equal(a1.contract!.deposit, 48000);
  assert.equal(a1.contract!.tokenAmount! + a5.contract!.tokenAmount!, 10000);
  assert.equal(a1.client!.id, a5.client!.id);
  assert.equal(a1.contract!.id, "AGR-" + new Date().getFullYear() + "-001");
  assert.equal(new Date(a1.contract!.endDate).toISOString().slice(0, 7), "2027-10");
  assert.equal(state.activity[0]!.kind, "onboard");
  assert.match(state.activity[0]!.detail, /2 cabins on a 12-month agreement/);
});

test("a custom deposit is split like rent", () => {
  const cabins = fresh().cabins.filter((c) => ["A1", "A5"].includes(c.code));
  assert.equal(depositFor(cabins[0]!, cabins, { depositMode: "custom", depositAmount: 50000 }, 0) + depositFor(cabins[1]!, cabins, { depositMode: "custom", depositAmount: 50000 }, 0), 50000);
  const unpriced = emptyInventory().filter((c) => ["A1", "A5"].includes(c.code));
  assert.equal(shareOf(unpriced[0]!, unpriced, 1000), 400); // by seats when no list rent
});

test("hold, confirm, release and history", () => {
  let state = boardReducer(fresh(), { type: "HOLD", cabinCode: "B1", name: "Lead Co", days: 7 });
  assert.equal(state.cabins.find((c) => c.code === "B1")!.status, "RESERVED");
  state = boardReducer(state, { type: "CONFIRM_HOLD", cabinCode: "B1" });
  assert.equal(state.cabins.find((c) => c.code === "B1")!.status, "BOOKED");
  state = boardReducer(state, { type: "RELEASE", cabinCode: "B1" });
  const b1 = state.cabins.find((c) => c.code === "B1")!;
  assert.equal(b1.status, "VACANT");
  assert.equal(b1.previousClientCount, 1);
  assert.equal(b1.previousClients[0]!.name, "Lead Co");
  const directory = directoryFrom(state.cabins);
  assert.equal(directory.length, 1);
  assert.equal(directory[0]!.kind, "former");
});

test("transfer keeps the agreement and archives the old cabin", () => {
  let state = boardReducer(fresh(), { type: "ONBOARD", cabinCodes: ["A1"], client: { name: "Mover" }, terms: { ...terms, rent: 20000 } });
  const agreement = state.cabins.find((c) => c.code === "A1")!.contract!.id;
  state = boardReducer(state, { type: "TRANSFER", fromCode: "A1", toCode: "A13" });
  const a13 = state.cabins.find((c) => c.code === "A13")!;
  assert.equal(a13.client!.name, "Mover");
  assert.equal(a13.contract!.id, agreement);
  assert.equal(a13.contract!.monthlyRent, a13.monthlyRent);
  assert.equal(state.cabins.find((c) => c.code === "A1")!.status, "VACANT");
  assert.equal(directoryFrom(state.cabins)[0]!.returning, true);
});

test("renew, payment, block and return", () => {
  let state = boardReducer(fresh(), { type: "ONBOARD", cabinCodes: ["C1"], client: { name: "Renewer" }, terms });
  const end = state.cabins.find((c) => c.code === "C1")!.contract!.endDate;
  state = boardReducer(state, { type: "RENEW", cabinCode: "C1", months: 12 });
  assert.equal(new Date(state.cabins.find((c) => c.code === "C1")!.contract!.endDate).getFullYear(), new Date(end).getFullYear() + 1);
  const next = state.cabins.find((c) => c.code === "C1")!.contract!.nextInvoiceDate;
  state = boardReducer(state, { type: "RECORD_PAYMENT", cabinCode: "C1" });
  assert.notEqual(state.cabins.find((c) => c.code === "C1")!.contract!.nextInvoiceDate, next);
  state = boardReducer(state, { type: "SET_UNAVAILABLE", cabinCode: "C2", status: "MAINTENANCE", reason: "Leak" });
  assert.equal(state.cabins.find((c) => c.code === "C2")!.unavailableReason, "Leak");
  state = boardReducer(state, { type: "RETURN_TO_INVENTORY", cabinCode: "C2" });
  assert.equal(state.cabins.find((c) => c.code === "C2")!.status, "VACANT");
});

test("documents land on every cabin the client holds; edits keep the client id", () => {
  let state = boardReducer(fresh(), { type: "ONBOARD", cabinCodes: ["A1", "A2"], client: { name: "Docs Ltd", kind: "company" }, terms });
  const id = state.cabins.find((c) => c.code === "A1")!.client!.id;
  const doc = documentRecord(documentsFor("company").find((d) => d.key === "coi")!, { url: "/api/uploads/files/x.pdf", fileName: "coi.pdf", size: 1000 });
  state = boardReducer(state, { type: "SET_CLIENT_DOCUMENTS", clientId: id, documents: [doc] });
  assert.equal(state.cabins.find((c) => c.code === "A2")!.client!.documents!.length, 1);
  state = boardReducer(state, { type: "UPDATE_CLIENT", clientId: id, client: { name: "Docs Pvt Ltd", phone: "98" }, terms: { ...terms, rent: 50000 } });
  const a1 = state.cabins.find((c) => c.code === "A1")!;
  assert.equal(a1.client!.id, id);
  assert.equal(a1.client!.name, "Docs Pvt Ltd");
  assert.equal(state.cabins.filter((c) => c.client?.id === id).reduce((sum, c) => sum + c.contract!.monthlyRent, 0), 50000);
});

test("conflicts stop a stale action from overwriting someone else's booking", () => {
  const state = boardReducer(fresh(), { type: "ONBOARD", cabinCodes: ["A1"], client: { name: "First" }, terms });
  assert.match(String(actionConflict(state, { type: "ONBOARD", cabinCodes: ["A1"], client: { name: "Second" }, terms })), /A-1 is now booked/);
  assert.equal(actionConflict(state, { type: "ONBOARD", cabinCodes: ["A2"], client: { name: "Second" }, terms }), null);
  assert.match(String(actionConflict(state, { type: "CONFIRM_HOLD", cabinCode: "A2" })), /vacant/);
  assert.equal(actionConflict(state, { type: "RELEASE", cabinCode: "A1" }), null);
  assert.match(String(actionConflict(state, { type: "TRANSFER", fromCode: "A1", toCode: "A1" })), /booked/);
  assert.match(String(actionConflict(state, { type: "UPDATE_CLIENT", clientId: "nobody", client: {}, terms: {} })), /no longer holds/);
});

test("lapsed holds are swept and logged; derived days are not saved", () => {
  const held = boardReducer(fresh(), { type: "HOLD", cabinCode: "D1", name: "Cold lead", days: 3 });
  const swept = expireHolds(held, Date.now() + 4 * 86400000);
  assert.equal(swept.cabins.find((c) => c.code === "D1")!.status, "VACANT");
  assert.equal(swept.activity[0]!.kind, "expire");
  const decorated = decorate(boardReducer(fresh(), { type: "ONBOARD", cabinCodes: ["A1"], client: { name: "X" }, terms }).cabins);
  assert.equal(typeof decorated.find((c) => c.code === "A1")!.contract!.endsInDays, "number");
  const stored = stripDerived(decorated);
  assert.equal("endsInDays" in stored.find((c) => c.code === "A1")!.contract!, false);
  assert.equal("vacantDays" in stored[0]!, false);
  assert.equal(hydrate(null).cabins.length, 65);
  assert.equal(hydrate({ cabins: [{ code: "A1", status: "VACANT" } as never], activity: [] }).cabins[0]!.previousClients.length, 0);
});

test("summary, directory, birthdays and CSV", () => {
  let state = boardReducer(fresh(), { type: "ONBOARD", cabinCodes: ["A1"], client: { name: "Big", contactPerson: "Asha", dateOfBirth: "1990-10-16", kind: "individual" }, terms: { ...terms, startDate: new Date(Date.now() - 340 * 86400000).toISOString() } });
  state = boardReducer(state, { type: "HOLD", cabinCode: "A2", name: "Maybe", days: 7 });
  const cabins = decorate(state.cabins);
  const summary = summarize(cabins);
  assert.equal(summary.letCabins, 2);
  assert.equal(summary.percent, Math.round((2 / 65) * 100));
  assert.equal(summary.freeingSoon.length, 1);
  assert.equal(clientsFrom(cabins).length, 2);
  const soon = upcomingBirthdays([{ dateOfBirth: "1990-10-16" }, { dateOfBirth: "1990-12-25" }], new Date("2026-10-15T06:00:00Z"));
  assert.deepEqual(soon.map((c) => c.daysUntil), [1]);
  assert.match(boardCsv(cabins).split("\r\n")[1]!, /^"A-1","A","4 seater","Booked","Big"/);
  assert.match(clientsCsv(directoryFrom(cabins)), /"Big","Current","Individual"/);
});

test("KYC follows the client type", () => {
  assert.equal(documentsFor("company").filter((d) => d.required).length, 8);
  assert.equal(documentsFor("individual").filter((d) => d.required).length, 5);
  assert.equal(documentsFor("unknown"), documentsFor("company"));
  assert.deepEqual(groupsOf(documentsFor("proprietorship")).map((g) => g.group), ["Business", "Person 1", "Person 2", "Agreement"]);
  const spec = documentsFor("individual")[0]!;
  const docs = withDocument([], spec.key, documentRecord(spec, { url: "/u/a.jpg", fileName: "a.jpg" }));
  const status = kycStatusOf({ kind: "individual", documents: docs });
  assert.equal(status.uploaded, 1);
  assert.equal(status.complete, false);
  assert.equal(withDocument(docs, spec.key, null).length, 0);
  assert.deepEqual(splitIndustry("Cybersecurity"), { industryChoice: "Other", industryCustom: "Cybersecurity" });
  assert.equal(resolveIndustry({ industryChoice: "Legal", industryCustom: "" }), "Legal");
  assert.equal(resolveIndustry({ industryChoice: "Other", industryCustom: " " }), "Other");
});
