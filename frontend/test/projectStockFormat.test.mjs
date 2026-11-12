// Requirements 3 Nov 2026: helpers behind the project's sizes, PLCs and charges.
import test from "node:test";
import assert from "node:assert/strict";
import { areaFromDimension, chargeBreakdown, combinePlcs, formatBasisValue, plcCharge, plotBasis, sizeLabel } from "../src/modules/inventory/projectStockFormat.js";

test("area is filled from a typed dimension", () => {
  assert.equal(areaFromDimension("20 x 40"), 800);
  assert.equal(areaFromDimension("20X50 ft"), 1000);
  assert.equal(areaFromDimension("1140"), null);
});

test("size labels read well with or without a dimension", () => {
  assert.equal(sizeLabel({ dimension: "20x40", areaSqft: 800 }), "20×40 · 800 sq ft");
  assert.equal(sizeLabel({ areaSqft: 1265 }), "1,265 sq ft");
  assert.equal(sizeLabel({}), "Size not set");
});

test("several PLCs on one plot add up only for reference", () => {
  const plcs = [{ name: "Garden", basis: "PERCENT", value: 5 }, { name: "Corner", basis: "PERCENT", value: 3 }, { name: "Wide road", basis: "AMOUNT", value: 50000 }];
  const { items, ifAdded } = combinePlcs(plcs, ["garden", "Corner", "Wide road"]);
  assert.equal(items.length, 3);
  assert.equal(ifAdded, "8% + ₹50,000");
  assert.equal(formatBasisValue("PER_SQFT", 100), "₹100 / sq ft");
});

test("charge breakdown keeps GST and stamp duty as separate lines with a total", () => {
  const b = chargeBreakdown({ currentRate: 2000, gstPercent: 18, stampDutyPercent: 7, chargeItems: [{ label: "Maintenance", basis: "AMOUNT", value: 50000 }, { label: "Club house", basis: "PER_SQFT", value: 20 }] }, 1000);
  assert.equal(b.base, 2000000);
  assert.deepEqual(b.lines.map((l) => l.label), ["Maintenance", "Club house", "GST", "Stamp duty / registration"]);
  assert.equal(b.charges, 50000 + 20000 + 360000 + 140000);
  assert.equal(b.total, 2000000 + 570000);
  // No current rate: percent lines have no amount, nothing is guessed.
  const noRate = chargeBreakdown({ gstPercent: 18, chargeItems: [] }, 1000);
  assert.equal(noRate.total, null);
  assert.equal(noRate.lines[0].amount, null);
});

test("PLC amount on a plot follows the project's rule", () => {
  const plcOptions = [{ name: "Garden", basis: "PERCENT", value: 5 }, { name: "Corner", basis: "PERCENT", value: 3 }];
  // No price on the plot: area x current rate is the base.
  const basis = plotBasis({ residentialDetails: { subtypeData: { plotLength: 20, plotWidth: 40 } } }, { currentRate: 2000 });
  assert.deepEqual(basis, { areaSqft: 800, basePrice: 1600000 });
  assert.equal(plcCharge({ plcOptions, selected: ["Garden", "Corner"], rule: "ADD_ALL", ...basis }).total, 128000);
  assert.equal(plcCharge({ plcOptions, selected: ["Garden", "Corner"], rule: "HIGHEST_ONLY", ...basis }).total, 80000);
  assert.equal(plcCharge({ plcOptions, selected: ["Garden"], rule: "NOT_SET", ...basis }).total, null);
  // The plot's own price wins over area x rate.
  assert.equal(plotBasis({ price: 1500000, totalArea: 800 }, { currentRate: 2000 }).basePrice, 1500000);
});
