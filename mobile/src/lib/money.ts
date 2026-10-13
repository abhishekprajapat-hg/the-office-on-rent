/* Rupee formatting the way Indian real-estate prices are read: lakh and crore. Pure; unit tested. */

const trim = (value: number) => {
  const fixed = value >= 100 ? value.toFixed(0) : value >= 10 ? value.toFixed(1) : value.toFixed(2);
  return fixed.replace(/\.0+$/, "").replace(/(\.\d*?)0+$/, "$1");
};

/* 6500000 -> "₹65 L", 12500000 -> "₹1.25 Cr", 62000 -> "₹62,000". */
export const formatPrice = (amount?: number | null) => {
  const value = Number(amount);
  if (!Number.isFinite(value) || value <= 0) return "";
  if (value >= 1e7) return `₹${trim(value / 1e7)} Cr`;
  if (value >= 1e5) return `₹${trim(value / 1e5)} L`;
  return `₹${Math.round(value).toLocaleString("en-IN")}`;
};

/* Exact figure with Indian digit grouping: 1234567 -> "₹12,34,567". */
export const formatRupees = (amount?: number | null) => {
  const value = Number(amount);
  if (!Number.isFinite(value)) return "";
  const [whole, fraction] = Math.abs(Math.round(value)).toString().split(".");
  const last3 = whole!.slice(-3);
  const rest = whole!.slice(0, -3).replace(/\B(?=(\d{2})+(?!\d))/g, ",");
  return `${value < 0 ? "-" : ""}₹${rest ? `${rest},${last3}` : last3}${fraction ? `.${fraction}` : ""}`;
};

/* Accepts what people type ("65,00,000", "65 lakh", "1.2 cr", "62k") and returns rupees, or null. */
export const parseAmount = (input: string): number | null => {
  const text = input.trim().toLowerCase().replace(/[₹,\s]/g, "");
  if (!text) return null;
  const match = text.match(/^(\d+(?:\.\d+)?)(cr|crore|crores|l|lac|lacs|lakh|lakhs|k)?$/);
  if (!match) return null;
  const number = Number(match[1]);
  const unit = match[2] || "";
  const factor = unit.startsWith("c") ? 1e7 : unit.startsWith("l") ? 1e5 : unit === "k" ? 1e3 : 1;
  return Math.round(number * factor);
};
