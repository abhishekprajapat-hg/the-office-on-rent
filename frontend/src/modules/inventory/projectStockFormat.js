/*
 * Size-wise stock, PLCs, charge rows and market rates on a project
 * (requirements 3 Nov 2026, 4.2-4.5). Shared by the project form, the project
 * page, the inventory form / detail and the brochure PDF.
 */
export const CHARGE_BASIS_OPTIONS = [
  { value: "PERCENT", label: "%" },
  { value: "AMOUNT", label: "₹ amount" },
  { value: "PER_SQFT", label: "₹ / sq ft" },
];
export const CHARGE_PRESET_OPTIONS = [
  { value: "MAINTENANCE", label: "Maintenance" },
  { value: "CLUB_HOUSE", label: "Club house" },
  { value: "ELECTRICITY", label: "Electricity / utilities" },
  { value: "PARKING", label: "Parking" },
  { value: "DEVELOPMENT", label: "Development" },
  { value: "OTHER", label: "Other (name it)" },
];
// Offered as one click in the PLC editor (3 Nov meeting examples).
export const STANDARD_PLCS = [
  { name: "Garden facing", basis: "PERCENT", value: "", condition: "" },
  { name: "Corner", basis: "PERCENT", value: "", condition: "" },
  { name: "Wide road (12 m)", basis: "PERCENT", value: "", condition: "Road 12 m wide" },
  { name: "Wide road (18 m)", basis: "PERCENT", value: "", condition: "Road 18 m wide" },
];
// How several PLCs on one plot combine; set per project (3 Nov 2026 open point).
export const PLC_RULE_OPTIONS = [
  { value: "NOT_SET", label: "Not decided yet (no PLC amount charged)" },
  { value: "ADD_ALL", label: "Add all ticked PLCs together" },
  { value: "HIGHEST_ONLY", label: "Charge only the highest PLC" },
];
export const PLC_RULE_SHORT = { NOT_SET: "Rule not set", ADD_ALL: "All added together", HIGHEST_ONLY: "Highest one only" };

export const LOCAL_AUTHORITY_LABELS = { NAGAR_NIGAM: "Nagar Nigam", GRAM_PANCHAYAT: "Gram Panchayat", OTHER: "Other" };

const inr = (value) => `₹${Number(value).toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;
const blank = (v) => v === null || v === undefined || v === "";

export const formatBasisValue = (basis, value) => {
  if (blank(value)) return "—";
  if (basis === "PERCENT") return `${Number(value)}%`;
  if (basis === "PER_SQFT") return `${inr(value)} / sq ft`;
  return inr(value);
};

export const formatDate = (value) => {
  if (!value) return "";
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? "" : d.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
};
export const toDateInput = (value) => {
  if (!value) return "";
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? "" : d.toISOString().slice(0, 10);
};

/* "20x40 · 800 sq ft", "1,140 sq ft" or "Size not set". */
export const sizeLabel = (row = {}) => {
  const dim = String(row.dimension || "").trim();
  const area = blank(row.areaSqft) ? "" : `${Number(row.areaSqft).toLocaleString("en-IN")} sq ft`;
  return [dim ? dim.replace(/\s*[xX*×]\s*/, "×") : "", area].filter(Boolean).join(" · ") || "Size not set";
};

/* "20 x 40" -> 800, for filling the area as the dimension is typed. */
export const areaFromDimension = (dimension) => {
  const nums = String(dimension || "").match(/\d+(?:\.\d+)?/g);
  return nums && nums.length >= 2 ? Number(nums[0]) * Number(nums[1]) : null;
};

/* The PLCs ticked on a plot and what they add up to, if they are additive. */
export const combinePlcs = (plcOptions = [], selected = []) => {
  const wanted = new Set((selected || []).map((s) => String(s).trim().toLowerCase()));
  const items = (plcOptions || []).filter((p) => wanted.has(String(p.name).trim().toLowerCase()));
  const sum = (basis) => items.filter((p) => p.basis === basis && !blank(p.value)).reduce((acc, p) => acc + Number(p.value), 0);
  const parts = [["PERCENT", sum("PERCENT")], ["AMOUNT", sum("AMOUNT")], ["PER_SQFT", sum("PER_SQFT")]]
    .filter(([, v]) => v > 0).map(([basis, v]) => formatBasisValue(basis, v));
  return { items, ifAdded: parts.join(" + ") };
};

/*
 * The PLC amount on one plot under the project's rule (mirrors the server's
 * plcCharge). Percent PLCs on the base price, per-sq-ft on the area.
 */
export const plcCharge = ({ plcOptions = [], selected = [], rule = "NOT_SET", basePrice = null, areaSqft = null } = {}) => {
  const { items } = combinePlcs(plcOptions, selected);
  const pos = (v) => (Number.isFinite(Number(v)) && Number(v) > 0 ? Number(v) : null);
  const lines = items.map((p) => {
    let amount = null;
    if (!blank(p.value)) {
      const v = Number(p.value);
      if (p.basis === "AMOUNT") amount = v;
      else if (p.basis === "PER_SQFT") amount = pos(areaSqft) ? v * pos(areaSqft) : null;
      else amount = pos(basePrice) ? (pos(basePrice) * v) / 100 : null;
    }
    return { name: p.name, basis: p.basis, value: p.value, amount };
  });
  if (!rule || rule === "NOT_SET") return { rule: "NOT_SET", lines, total: null, applied: [] };
  const priced = lines.filter((l) => l.amount !== null);
  if (rule === "HIGHEST_ONLY") {
    const top = priced.reduce((best, l) => (!best || l.amount > best.amount ? l : best), null);
    return { rule, lines, total: top ? top.amount : 0, applied: top ? [top.name] : [], incomplete: priced.length < lines.length };
  }
  return { rule, lines, total: priced.reduce((a, l) => a + l.amount, 0), applied: priced.map((l) => l.name), incomplete: priced.length < lines.length };
};

/* A plot's area and base price for PLC maths: its own price, else area x the project's current rate. */
export const plotBasis = (unit = {}, project = {}) => {
  const sub = unit.residentialDetails?.subtypeData || {};
  const pos = (v) => (Number.isFinite(Number(v)) && Number(v) > 0 ? Number(v) : null);
  const areaSqft = pos(sub.plotArea) ?? (pos(sub.plotLength) && pos(sub.plotWidth) ? pos(sub.plotLength) * pos(sub.plotWidth) : null) ?? pos(unit.totalArea) ?? pos(unit.carpetArea);
  const basePrice = pos(unit.price) ?? (areaSqft && pos(project.currentRate) ? areaSqft * pos(project.currentRate) : null);
  return { areaSqft, basePrice };
};

export const inrRounded = (v) => (blank(v) ? "—" : inr(Math.round(Number(v))));

/*
 * A worked example of the charges for one area at the current rate. Percent
 * rows, GST and stamp duty are taken on the base price. Labelled as an
 * estimate: the business still confirms the exact rules.
 */
export const chargeBreakdown = (project = {}, areaSqft = 1000) => {
  const rate = Number(project.currentRate);
  const base = Number.isFinite(rate) && rate > 0 && areaSqft ? rate * areaSqft : null;
  const amountOf = (basis, value) => {
    if (blank(value)) return null;
    const v = Number(value);
    if (basis === "AMOUNT") return v;
    if (basis === "PER_SQFT") return v * areaSqft;
    return base === null ? null : (base * v) / 100;
  };
  const lines = (project.chargeItems || []).map((c) => ({ label: c.label, rate: formatBasisValue(c.basis, c.value), amount: amountOf(c.basis, c.value), note: c.note || "" }));
  if (!blank(project.gstPercent)) lines.push({ label: "GST", rate: `${Number(project.gstPercent)}%`, amount: amountOf("PERCENT", project.gstPercent), note: "On the base price" });
  if (!blank(project.stampDutyPercent)) lines.push({ label: "Stamp duty / registration", rate: `${Number(project.stampDutyPercent)}%`, amount: amountOf("PERCENT", project.stampDutyPercent), note: "Government charge" });
  const charges = lines.reduce((acc, l) => acc + (l.amount || 0), 0);
  return { base, lines, charges, total: base === null ? null : base + charges, money: (v) => (blank(v) ? "—" : inr(Math.round(v))) };
};

export const hasStockSetup = (project = {}) => Boolean(
  (project.sizeInventory || []).length || (project.plcOptions || []).length || (project.chargeItems || []).length
  || (project.marketRates || []).length || !blank(project.gstPercent) || !blank(project.stampDutyPercent),
);
