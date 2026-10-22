// Centralised project knowledge (requirements 16 Oct 2026, section 05).
const test = require("node:test");
const assert = require("node:assert/strict");
const mongoose = require("mongoose");
const svc = require("../src/services/projectDetails.service");
const C = require("../src/constants/projectDetails.constants");

const admin = { _id: new mongoose.Types.ObjectId(), role: "ADMIN", name: "Admin" };
const exec = { _id: new mongoose.Types.ObjectId(), role: "EXECUTIVE", name: "Exec" };
const fresh = (category = "COMMERCIAL") => ({ projectCategory: category, details: {}, projectContacts: [], documentLibrary: [], media: [], amenityStatuses: [], history: [], markModified() {} });

test("Residential, Commercial and Coworking each have their own fields; coworking is a project category", () => {
  assert.ok(C.SPEC_FIELDS.RESIDENTIAL.find((f) => f.key === "plotNumbering"));
  assert.ok(C.SPEC_FIELDS.COMMERCIAL.find((f) => f.key === "showroomSpecs"));
  assert.ok(C.SPEC_FIELDS.COWORKING.find((f) => f.key === "operatingHours"));
  assert.ok(require("../src/constants/project.constants").PROJECT_CATEGORIES.includes("COWORKING"));
});

test("edits are checked: dates, links, money; restricted terms need Admin/Manager", () => {
  const p = fresh();
  svc.applyDetailsPatch(p, { overview: { developer: "Omex", launchDate: "2026-01-15", mapsUrl: "https://maps.google.com/x" }, pricing: { baseRate: "4500" } }, exec);
  assert.equal(p.details.overview.developer, "Omex");
  assert.equal(p.details.pricing.baseRate, 4500);
  assert.throws(() => svc.applyDetailsPatch(fresh(), { overview: { launchDate: "15/01/2026" } }, exec), /must be a date/);
  assert.throws(() => svc.applyDetailsPatch(fresh(), { overview: { mapsUrl: "maps.google" } }, exec), /http/);
  assert.throws(() => svc.applyDetailsPatch(fresh(), { specs: { leaseBrokerage: "2%" } }, exec), /Admin or Manager/);
  assert.throws(() => svc.applyDetailsPatch(fresh(), { approvalStatus: "VERIFIED" }, exec), /Admin or Manager/);
  assert.throws(() => svc.applyDetailsPatch(fresh(), { pricingPublished: true }, exec), /Admin or Manager/);
  const ok = fresh();
  svc.applyDetailsPatch(ok, { approvalStatus: "VERIFIED", specs: { leaseBrokerage: "2%" } }, admin);
  assert.equal(ok.details.approvalStatus, "VERIFIED");
  assert.ok(ok.details.approvalVerifiedAt instanceof Date);
  assert.equal(ok.history.length, 1, "every change is in the project's history");
});

test("documents keep versions; a re-upload supersedes, never deletes", () => {
  const lib1 = svc.addDocuments([], [{ name: "Price list", category: "price_list", url: "/a.pdf" }], admin);
  const lib2 = svc.addDocuments(lib1, [{ name: "price list", category: "PRICE_LIST", url: "/b.pdf" }], admin);
  assert.equal(lib2.length, 2);
  assert.equal(lib2[0].superseded, true);
  assert.equal(lib2[1].version, 2);
  assert.equal(lib2[1].uploadedByName, "Admin");
});

test("images: captions, categories, order and exactly one cover", () => {
  const media = svc.cleanMedia([
    { url: "/1.jpg", order: 2, category: "lobby" },
    { url: "/2.jpg", order: 1, isCover: true },
    { url: "/3.jpg", order: 3, isCover: true },
  ]);
  assert.deepEqual(media.map((m) => m.url), ["/2.jpg", "/1.jpg", "/3.jpg"]);
  assert.equal(media.filter((m) => m.isCover).length, 1);
  assert.equal(media[1].category, "LOBBY");
  assert.equal(svc.cleanMedia([{ url: "/x.jpg" }])[0].isCover, true, "first image becomes the cover");
});

test("client brochure: no internal contacts, unpublished pricing, unverified approvals, restricted terms or hidden images", () => {
  const p = fresh("COMMERCIAL");
  p.details = {
    overview: { developer: "Omex" },
    pricing: { baseRate: 4500 },
    pricingPublished: false,
    legal: { reraNumber: "P-1" },
    approvalStatus: "APPROVED",
    specs: { lifts: "4", leaseBrokerage: "2%" },
    internalNotes: "owner is flexible",
  };
  p.projectContacts = [{ name: "Site", shareable: true, notes: "call after 6" }, { name: "Owner", shareable: false }];
  p.media = [{ url: "/a.jpg", clientVisible: true, order: 0 }, { url: "/b.jpg", clientVisible: false, order: 1 }];
  p.documentLibrary = [{ name: "Brochure", clientShareable: true }, { name: "Agreement", clientShareable: false }];
  const client = svc.toKnowledgeView(p, { user: exec, mode: "client" });
  assert.deepEqual(client.pricing, {}, "pricing waits until published");
  assert.deepEqual(client.legal, {}, "approvals wait until verified");
  assert.equal(client.specs.leaseBrokerage, undefined);
  assert.equal(client.specs.lifts, "4");
  assert.deepEqual(client.contacts.map((c) => c.name), ["Site"]);
  assert.equal(client.contacts[0].notes, undefined);
  assert.equal(client.media.length, 1);
  assert.deepEqual(client.documents.map((d) => d.name), ["Brochure"]);
  assert.equal(client.internalNotes, undefined);

  const internalExec = svc.toKnowledgeView(p, { user: exec, mode: "internal" });
  assert.equal(internalExec.specs.leaseBrokerage, undefined, "restricted even internally for executives");
  assert.equal(internalExec.internalNotes, undefined);
  const internalAdmin = svc.toKnowledgeView(p, { user: admin, mode: "internal" });
  assert.equal(internalAdmin.specs.leaseBrokerage, "2%");
  assert.equal(internalAdmin.internalNotes, "owner is flexible");
  assert.equal(internalAdmin.contacts.length, 2);
  assert.ok(internalAdmin.completeness.percent >= 0);
});

test("completeness counts what is filled in", () => {
  const empty = svc.completeness(fresh("RESIDENTIAL"));
  const p = fresh("RESIDENTIAL");
  p.details = { overview: { developer: "A", description: "B", locality: "C" } };
  p.projectContacts = [{ name: "x" }];
  assert.ok(svc.completeness(p).percent > empty.percent);
  assert.ok(empty.missing.includes("Developer / operator"));
});
