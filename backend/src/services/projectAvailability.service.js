/*
 * Project stock, pricing rows and PLCs (requirements 3 Nov 2026, 4.2-4.5 and 5).
 *
 * Size-wise availability has two sources and they are never added together:
 *   - LIVE: counted from the individual Inventory records linked to the project.
 *           A status change on a plot shows here on the next read.
 *   - MANUAL: typed into the project ("aggregate only") for sizes that have no
 *           individual records yet. Once a plot of that size is linked, the
 *           live count takes over and the typed figure is shown for reference.
 */
const { PROJECT_CHARGE_BASES, PROJECT_CHARGE_PRESETS, PROJECT_PLC_RULES } = require("../constants/project.constants");

const httpError = (statusCode, message) => Object.assign(new Error(message), { statusCode });

const MAX_ROWS = 100;
const CHARGE_PRESET_LABELS = {
  MAINTENANCE: "Maintenance",
  CLUB_HOUSE: "Club house",
  ELECTRICITY: "Electricity / utilities",
  PARKING: "Parking",
  DEVELOPMENT: "Development",
  OTHER: "Other",
};

const text = (value, max) => String(value ?? "").trim().slice(0, max);
const blank = (value) => value === null || value === undefined || value === "";
const toNumber = (value, label, { integer = false, max = Infinity } = {}) => {
  if (blank(value)) return null;
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0 || n > max) throw httpError(400, `${label} must be a number between 0 and ${max === Infinity ? "any amount" : max}`);
  if (integer && !Number.isInteger(n)) throw httpError(400, `${label} must be a whole number`);
  return n;
};
const toDate = (value, label) => {
  if (blank(value)) return null;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) throw httpError(400, `${label} is not a valid date`);
  return d;
};
const rows = (value, label) => {
  if (blank(value)) return [];
  if (!Array.isArray(value)) throw httpError(400, `${label} must be a list`);
  if (value.length > MAX_ROWS) throw httpError(400, `${label} can have at most ${MAX_ROWS} rows`);
  return value.filter((row) => row && typeof row === "object");
};
const basisOf = (value, fallback) => {
  const b = String(value || fallback).trim().toUpperCase();
  if (!PROJECT_CHARGE_BASES.includes(b)) throw httpError(400, `Pricing basis must be one of ${PROJECT_CHARGE_BASES.join(", ")}`);
  return b;
};

/* "20 x 40", "20X40 ft", "20*40" -> { a: 20, b: 40, key: "20x40" }. Orientation doesn't matter. */
const parseDimension = (value) => {
  const nums = String(value || "").match(/\d+(?:\.\d+)?/g);
  if (!nums || nums.length < 2) return null;
  const [a, b] = nums.slice(0, 2).map(Number).sort((x, y) => x - y);
  if (!(a > 0 && b > 0)) return null;
  return { a, b, key: `${a}x${b}` };
};

/* ------------------------------------------------------------ sanitizers -- */

const sanitizeSizeInventory = (value) => rows(value, "Size-wise availability").map((row, i) => {
  const label = `Size row ${i + 1}`;
  const dimension = text(row.dimension, 40);
  const parsed = parseDimension(dimension);
  let areaSqft = toNumber(row.areaSqft, `${label} area`);
  if (areaSqft === null && parsed) areaSqft = parsed.a * parsed.b;
  if (!dimension && areaSqft === null) throw httpError(400, `${label}: enter a size in sq ft or a dimension like 20x40`);
  const total = toNumber(row.total, `${label} total`, { integer: true }) ?? 0;
  const available = toNumber(row.available, `${label} available`, { integer: true }) ?? 0;
  const sold = toNumber(row.sold, `${label} sold/reserved`, { integer: true }) ?? 0;
  if (total && available + sold > total) throw httpError(400, `${label}: available + sold can't be more than the total (${total})`);
  return { dimension, areaSqft, total, available, sold };
});

const sanitizePlcOptions = (value) => {
  const out = rows(value, "PLCs").map((row, i) => {
    const name = text(row.name, 80);
    if (!name) throw httpError(400, `PLC ${i + 1} needs a name`);
    const basis = basisOf(row.basis, "PERCENT");
    return { name, basis, value: toNumber(row.value, `PLC ${name}`, { max: basis === "PERCENT" ? 100 : Infinity }), condition: text(row.condition, 200) };
  });
  const names = out.map((p) => p.name.toLowerCase());
  const dup = names.find((n, i) => names.indexOf(n) !== i);
  if (dup) throw httpError(400, `PLC "${dup}" is listed twice`);
  return out;
};

const sanitizeChargeItems = (value) => rows(value, "Charges").map((row, i) => {
  const key = PROJECT_CHARGE_PRESETS.includes(String(row.key || "").toUpperCase()) ? String(row.key).toUpperCase() : "OTHER";
  const label = text(row.label, 80) || (key === "OTHER" ? "" : CHARGE_PRESET_LABELS[key]);
  if (!label) throw httpError(400, `Charge ${i + 1}: give the "Other" charge a name`);
  const basis = basisOf(row.basis, "AMOUNT");
  return { key, label, basis, value: toNumber(row.value, `Charge ${label}`, { max: basis === "PERCENT" ? 100 : Infinity }), note: text(row.note, 200) };
});

const sanitizeMarketRates = (value) => rows(value, "Nearby market rates").map((row, i) => {
  const place = text(row.place, 120);
  if (!place) throw httpError(400, `Market rate ${i + 1} needs a project or place name`);
  return { place, rate: toNumber(row.rate, `Market rate ${place}`), unit: text(row.unit, 40) || "per sq ft", asOf: toDate(row.asOf, `Market rate ${place} date`), source: text(row.source, 160) };
});

/* Called by project.service for the 3 Nov fields; returns undefined for others. */
const sanitizeProjectExtras = (field, value) => {
  switch (field) {
    case "startingRateDate": return toDate(value, "Starting rate date");
    case "currentRateDate": return toDate(value, "Current rate date");
    case "sizeInventory": return sanitizeSizeInventory(value);
    case "plcOptions": return sanitizePlcOptions(value);
    case "chargeItems": return sanitizeChargeItems(value);
    case "gstPercent": return toNumber(value, "GST %", { max: 100 });
    case "stampDutyPercent": return toNumber(value, "Stamp duty / registration %", { max: 100 });
    case "marketRates": return sanitizeMarketRates(value);
    case "plcRule": {
      const rule = String(value || "NOT_SET").trim().toUpperCase();
      if (!PROJECT_PLC_RULES.includes(rule)) throw httpError(400, `PLC rule must be one of ${PROJECT_PLC_RULES.join(", ")}`);
      return rule;
    }
    default: return undefined;
  }
};
const EXTRA_FIELDS = ["startingRateDate", "currentRateDate", "sizeInventory", "plcOptions", "chargeItems", "gstPercent", "stampDutyPercent", "marketRates", "plcRule"];

/* ---------------------------------------------------------- availability -- */

const num = (v) => (blank(v) || !Number.isFinite(Number(v)) || Number(v) <= 0 ? null : Number(v));

/* The size of one inventory record: plot length x width when known, and its area. */
const inventorySize = (row = {}) => {
  const sub = row.residentialDetails?.subtypeData || {};
  const length = num(sub.plotLength) ?? num(row.length);
  const width = num(sub.plotWidth) ?? num(row.width);
  const parsed = length && width ? parseDimension(`${length}x${width}`) : null;
  const areaSqft = num(sub.plotArea) ?? (parsed ? parsed.a * parsed.b : null)
    ?? num(row.totalArea) ?? num(row.carpetArea) ?? num(row.builtUpArea) ?? num(row.superBuiltUpArea);
  return { dimension: parsed ? `${parsed.a}x${parsed.b}` : "", dimensionKey: parsed?.key || "", areaSqft: areaSqft === null ? null : Math.round(areaSqft) };
};

const STATUS_BUCKET = { Available: "available", Blocked: "onHold", Sold: "sold", Unavailable: "unavailable" };

const sameSize = (manual, live) => {
  const md = parseDimension(manual.dimension);
  if (md && live.dimensionKey) return md.key === live.dimensionKey;
  const ma = num(manual.areaSqft);
  return ma !== null && live.areaSqft !== null && Math.round(ma) === live.areaSqft;
};

/*
 * project: { sizeInventory } ; inventory: linked Inventory rows (status + size fields).
 * Returns one row per size and the totals, each row tagged LIVE or MANUAL.
 */
const buildAvailability = (project = {}, inventory = []) => {
  const groups = new Map();
  inventory.forEach((row) => {
    const size = inventorySize(row);
    const key = size.dimensionKey ? `D:${size.dimensionKey}` : size.areaSqft !== null ? `A:${size.areaSqft}` : "NONE";
    const g = groups.get(key) || { ...size, total: 0, available: 0, onHold: 0, sold: 0, unavailable: 0 };
    g.total += 1;
    const bucket = STATUS_BUCKET[row.status];
    if (bucket) g[bucket] += 1;
    groups.set(key, g);
  });

  const manualRows = Array.isArray(project.sizeInventory) ? project.sizeInventory : [];
  const usedManual = new Set();
  const out = [...groups.values()].map((g) => {
    const idx = g.dimensionKey || g.areaSqft !== null ? manualRows.findIndex((m, i) => !usedManual.has(i) && sameSize(m, g)) : -1;
    if (idx >= 0) usedManual.add(idx);
    const m = idx >= 0 ? manualRows[idx] : null;
    return {
      dimension: g.dimension || (m?.dimension || ""),
      areaSqft: g.areaSqft ?? (m ? num(m.areaSqft) : null),
      total: g.total, available: g.available, onHold: g.onHold, sold: g.sold, unavailable: g.unavailable,
      source: "LIVE",
      // The typed figure for the same size, kept for reference only.
      manual: m ? { total: m.total || 0, available: m.available || 0, sold: m.sold || 0 } : null,
    };
  });
  manualRows.forEach((m, i) => {
    if (usedManual.has(i)) return;
    out.push({ dimension: m.dimension || "", areaSqft: num(m.areaSqft), total: m.total || 0, available: m.available || 0, onHold: 0, sold: m.sold || 0, unavailable: 0, source: "MANUAL", manual: null });
  });
  out.forEach((r) => { r.soldOut = r.total > 0 && r.available === 0; });
  out.sort((a, b) => (a.areaSqft ?? Infinity) - (b.areaSqft ?? Infinity) || String(a.dimension).localeCompare(String(b.dimension)));

  const sum = (list, f) => list.reduce((acc, r) => acc + (r[f] || 0), 0);
  const live = out.filter((r) => r.source === "LIVE");
  const manual = out.filter((r) => r.source === "MANUAL");
  return {
    rows: out,
    totals: {
      total: sum(out, "total"),
      available: sum(out, "available"),
      onHold: sum(out, "onHold"),
      sold: sum(out, "sold"),
      unavailable: sum(out, "unavailable"),
      liveTotal: sum(live, "total"),
      liveAvailable: sum(live, "available"),
      manualTotal: sum(manual, "total"),
      manualAvailable: sum(manual, "available"),
    },
    hasLive: live.length > 0,
    hasManual: manual.length > 0,
  };
};

/* ------------------------------------------------------------------ PLC -- */

/*
 * The PLCs ticked on one plot, looked up in its project's PLC list. The sums
 * are only "if added together": the business hasn't confirmed whether PLCs
 * stack (3 Nov 2026, open point), so nothing is charged from them.
 */
const combinePlcs = (plcOptions = [], selected = []) => {
  const wanted = new Set((selected || []).map((s) => String(s).trim().toLowerCase()).filter(Boolean));
  const items = (plcOptions || []).filter((p) => wanted.has(String(p.name).trim().toLowerCase()));
  const add = (basis) => items.filter((p) => p.basis === basis && Number.isFinite(Number(p.value))).reduce((a, p) => a + Number(p.value), 0);
  return { items, ifAdded: { percent: add("PERCENT"), amount: add("AMOUNT"), perSqft: add("PER_SQFT") }, unknown: [...wanted].filter((n) => !items.some((p) => p.name.toLowerCase() === n)) };
};

/*
 * The PLC amount on one plot under the project's rule. Percent PLCs are taken
 * on the plot's base price (its price, or area x the project's current rate);
 * per-sq-ft PLCs on its area. NOT_SET charges nothing.
 */
const plcCharge = ({ plcOptions = [], selected = [], rule = "NOT_SET", basePrice = null, areaSqft = null } = {}) => {
  const { items } = combinePlcs(plcOptions, selected);
  const lines = items.map((p) => {
    const v = Number(p.value);
    let amount = null;
    if (Number.isFinite(v)) {
      if (p.basis === "AMOUNT") amount = v;
      else if (p.basis === "PER_SQFT") amount = num(areaSqft) ? v * num(areaSqft) : null;
      else amount = num(basePrice) ? (num(basePrice) * v) / 100 : null;
    }
    return { name: p.name, basis: p.basis, value: p.value, amount };
  });
  if (rule === "NOT_SET") return { rule, lines, total: null, applied: [] };
  const priced = lines.filter((l) => l.amount !== null);
  if (rule === "HIGHEST_ONLY") {
    const top = priced.reduce((best, l) => (!best || l.amount > best.amount ? l : best), null);
    return { rule, lines, total: top ? top.amount : 0, applied: top ? [top.name] : [], incomplete: priced.length < lines.length };
  }
  return { rule, lines, total: priced.reduce((a, l) => a + l.amount, 0), applied: priced.map((l) => l.name), incomplete: priced.length < lines.length };
};

/* ---------------------------------------------------------- charge total -- */

/*
 * A charge breakdown for an example area and base price. Percent charges and
 * GST / stamp duty apply to the base price. Shown as a worked example; the
 * business confirms the actual rules (3 Nov 2026 open point).
 */
const chargeBreakdown = (project = {}, { areaSqft = null, basePrice = null } = {}) => {
  const base = num(basePrice) ?? (num(areaSqft) && num(project.currentRate) ? num(areaSqft) * num(project.currentRate) : null);
  const amountOf = (basis, value) => {
    const v = Number(value);
    if (!Number.isFinite(v)) return null;
    if (basis === "AMOUNT") return v;
    if (basis === "PER_SQFT") return num(areaSqft) ? v * num(areaSqft) : null;
    return base !== null ? (base * v) / 100 : null;
  };
  const lines = (project.chargeItems || []).map((c) => ({ label: c.label, basis: c.basis, value: c.value, amount: amountOf(c.basis, c.value), note: c.note || "" }));
  const gst = num(project.gstPercent) !== null && base !== null ? (base * Number(project.gstPercent)) / 100 : null;
  const stamp = num(project.stampDutyPercent) !== null && base !== null ? (base * Number(project.stampDutyPercent)) / 100 : null;
  const known = [...lines.map((l) => l.amount), gst, stamp].filter((v) => v !== null);
  const charges = known.reduce((a, v) => a + v, 0);
  return { base, lines, gst, stampDuty: stamp, chargesTotal: charges, grandTotal: base !== null ? base + charges : null, incomplete: lines.some((l) => l.amount === null) };
};

module.exports = {
  EXTRA_FIELDS,
  CHARGE_PRESET_LABELS,
  parseDimension,
  sanitizeProjectExtras,
  inventorySize,
  buildAvailability,
  combinePlcs,
  plcCharge,
  chargeBreakdown,
};
