// Plot size is a range in sq.ft (21 Oct 2026): plots in one project differ.
const test = require("node:test");
const assert = require("node:assert/strict");
const { _test } = require("../src/services/project.service");

const base = {
  projectCategory: "RESIDENTIAL", projectType: "PLOTTING", projectName: "Range Test",
  totalLandArea: "10 acres", totalPlots: 50, currentRate: 2000, startingRate: 1800,
};
const clean = (extra, mode = "update") => _test.sanitizeProjectPayload({
  payload: { ...base, ...extra }, mode, currentTotalPlots: 50, currentProjectType: "PLOTTING", currentProjectCategory: "RESIDENTIAL",
});

test("a smallest and largest plot size are kept as numbers", () => {
  const out = clean({ plotSizeMin: "900", plotSizeMax: 2400 });
  assert.equal(out.plotSizeMin, 900);
  assert.equal(out.plotSizeMax, 2400);
});

test("either end may be left empty", () => {
  const out = clean({ plotSizeMin: "", plotSizeMax: 1500 });
  assert.equal(out.plotSizeMin, null);
  assert.equal(out.plotSizeMax, 1500);
});

test("the smallest can't be bigger than the largest, and sizes can't be negative", () => {
  assert.throws(() => clean({ plotSizeMin: 3000, plotSizeMax: 1000 }), /smallest plot size/);
  assert.throws(() => clean({ plotSizeMin: -5 }), /non-negative/);
});

test("the four location PLCs are saved as text", () => {
  const out = clean({ plcWideRoad: " 5% ", plcGardenFacing: "₹50,000", plcCorner: "3%", plcGardenCorner: "8%" });
  assert.equal(out.plcWideRoad, "5%");
  assert.equal(out.plcGardenFacing, "₹50,000");
  assert.equal(out.plcCorner, "3%");
  assert.equal(out.plcGardenCorner, "8%");
});

test("buyer charges and other facilities are saved as text", () => {
  const out = clean({
    developmentCharges: "₹150/sq.ft", maintenanceCharges: "₹3/sq.ft", amenityCharges: "₹1,00,000",
    utilityCharges: "₹75,000", parkingCharges: "₹2,50,000", taxes: "5% GST", registrationStampDuty: "7%",
    otherFacilities: "Temple, school nearby",
  });
  assert.equal(out.developmentCharges, "₹150/sq.ft");
  assert.equal(out.taxes, "5% GST");
  assert.equal(out.registrationStampDuty, "7%");
  assert.equal(out.otherFacilities, "Temple, school nearby");
});

test("the new infrastructure amenities are accepted; unknown ones still aren't", () => {
  const keys = ["GATED_ENTRY", "CCTV_SURVEILLANCE", "INTERNAL_ROADS", "STREET_LIGHTING", "WATER_SUPPLY", "ELECTRICITY", "DRAINAGE", "PARKING", "GARDEN", "CLUB_HOUSE", "KIDS_PLAY_AREA", "SECURITY_24X7"];
  assert.deepEqual(clean({ amenities: keys }).amenities, keys);
  assert.throws(() => clean({ amenities: ["HELIPAD"] }));
});
