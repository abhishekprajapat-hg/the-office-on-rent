// Section 05 follow-ups (21 Oct 2026): charges live on the project (main form)
// and feed the knowledge view / PDFs; amenity presets; media categories.
const test = require("node:test");
const assert = require("node:assert/strict");
const { toKnowledgeView, catalogueFor, applyDetailsPatch, completeness } = require("../src/services/projectDetails.service");
const C = require("../src/constants/projectDetails.constants");

const admin = { _id: "a", role: "ADMIN" };
const exec = { _id: "e", role: "EXECUTIVE" };
const project = (extra = {}) => ({
  projectCategory: "RESIDENTIAL",
  developmentCharges: "₹150/sq.ft",
  taxes: "5% GST",
  plcCorner: "3%",
  amenities: ["GATED_ENTRY", "CCTV_SURVEILLANCE"],
  otherFacilities: "Temple",
  details: { pricing: { baseRate: 2000, utilities: "₹75,000 (old copy)" }, pricingPublished: true },
  ...extra,
});

test("charges and PLCs come from the project itself", () => {
  const view = toKnowledgeView(project(), { user: admin });
  assert.equal(view.pricing.developmentCharges, "₹150/sq.ft");
  assert.equal(view.pricing.taxes, "5% GST");
  assert.equal(view.pricing.plcCorner, "3%");
  assert.equal(view.pricing.baseRate, 2000);
});

test("an older copy in the panel is still shown until the project field is filled", () => {
  assert.equal(toKnowledgeView(project(), { user: admin }).pricing.utilityCharges, "₹75,000 (old copy)");
  assert.equal(toKnowledgeView(project({ utilityCharges: "₹90,000" }), { user: admin }).pricing.utilityCharges, "₹90,000");
});

test("the client brochure only carries pricing once it is published", () => {
  const draftOnly = project({ details: { pricing: { baseRate: 2000 }, pricingPublished: false } });
  assert.deepEqual(toKnowledgeView(draftOnly, { user: exec, mode: "client" }).pricing, {});
  assert.equal(toKnowledgeView(project(), { user: exec, mode: "client" }).pricing.taxes, "5% GST");
});

test("the knowledge view carries the ticked amenities and other facilities", () => {
  const view = toKnowledgeView(project(), { user: admin });
  assert.deepEqual(view.amenities, ["GATED_ENTRY", "CCTV_SURVEILLANCE"]);
  assert.equal(view.otherFacilities, "Temple");
});

test("saving the panel's pricing never writes the project-form charges into it", () => {
  const doc = { ...project(), markModified() {} };
  applyDetailsPatch(doc, { pricing: { baseRate: 2100, taxes: "18% GST" } }, admin);
  assert.equal(doc.details.pricing.baseRate, 2100);
  assert.equal(doc.details.pricing.taxes, undefined);
  assert.equal(doc.taxes, "5% GST");
});

test("standard amenity lists and the new image categories are offered", () => {
  const cat = catalogueFor(admin);
  assert.ok(cat.amenityPresets.COWORKING.includes("Wi-Fi backup"));
  assert.ok(cat.amenityPresets.RESIDENTIAL.includes("Gated entry"));
  for (const c of ["GARDENS", "PLOTS", "VILLAS", "OFFICES", "SHOWROOMS", "FLOOR_PLANS", "OPEN_SEATING"]) assert.ok(C.MEDIA_CATEGORIES.includes(c), c);
});

test("completeness counts charges from the project, not missing optional PLCs", () => {
  const { missing } = completeness(project());
  assert.ok(!missing.includes("Development charges"));
  assert.ok(!missing.some((label) => /PLC/.test(label)));
});
