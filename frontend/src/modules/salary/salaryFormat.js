/*
 * Formatting for the salary screens. Kept apart from the components so it can
 * be tested on its own and imported without a screen's worth of component.
 */

const rupeeFormatter = new Intl.NumberFormat("en-IN", {
  style: "currency",
  currency: "INR",
  minimumFractionDigits: 0,
  maximumFractionDigits: 2,
});

/** ₹31,000 / ₹967.74 - Indian digit grouping, paise only when there are some. */
export const formatRupees = (value) => {
  const amount = Number(value);
  return rupeeFormatter.format(Number.isFinite(amount) ? amount : 0);
};

const parseKey = (key) => String(key || "").split("-").map((part) => Number.parseInt(part, 10));

/** "2026-10" -> "October 2026" */
export const formatMonthLabel = (monthKey) => {
  const [year, month] = parseKey(monthKey);
  if (!year || !month) return monthKey || "";
  return new Date(year, month - 1, 1).toLocaleDateString("en-IN", { month: "long", year: "numeric" });
};

/** "2026-10-05" -> "5 Oct" */
export const formatShortDate = (dateKey) => {
  const [year, month, day] = parseKey(dateKey);
  if (!year || !month || !day) return dateKey || "";
  return new Date(year, month - 1, day).toLocaleDateString("en-IN", { day: "numeric", month: "short" });
};

/** "2026-10-08" -> "Thu, 8 Oct" */
export const formatWeekdayDate = (dateKey) => {
  const [year, month, day] = parseKey(dateKey);
  if (!year || !month || !day) return dateKey || "";
  return new Date(year, month - 1, day).toLocaleDateString("en-IN", { weekday: "short", day: "numeric", month: "short" });
};

export const currentMonthKey = (now = new Date()) =>
  `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;

/** How the per-day salary was reached, in words: "₹31,000 ÷ 31 days in the month". */
export const describePerDay = (salary) => {
  if (!salary) return "";
  const basis = {
    CALENDAR_DAYS: `${salary.divisor} days in the month`,
    WORKING_DAYS: `${salary.divisor} working days in the month`,
    FIXED_DAYS: `a fixed ${salary.divisor} days`,
  }[salary.perDayBasis] || `${salary.divisor} days`;
  return `${formatRupees(salary.monthlySalary)} ÷ ${basis}`;
};

/** How far into the month the deductions reach. */
export const describeCoverage = (salary) => {
  if (!salary) return "";
  if (salary.isFutureMonth) return "This month has not started - nothing is deducted yet";
  if (salary.isMonthComplete) return "Whole month";
  return `Up to ${formatWeekdayDate(salary.throughDate)}`;
};

/** How many days (or late check-ins) one deduction line covers. */
export const countLine = (salary, key) =>
  Number(salary?.lines?.find((line) => line.key === key)?.count || 0);

const AVATAR_TONES = ["bg-blue-500", "bg-emerald-500", "bg-violet-500", "bg-amber-500", "bg-rose-500", "bg-cyan-600", "bg-indigo-500", "bg-teal-600"];

// Same name-derived colour as the attendance table, so a face keeps its badge.
export const avatarTone = (name = "") => {
  const text = String(name || "?");
  let hash = 0;
  for (let index = 0; index < text.length; index += 1) hash = (hash * 31 + text.charCodeAt(index)) >>> 0;
  return AVATAR_TONES[hash % AVATAR_TONES.length];
};

export const getInitials = (name = "") => {
  const parts = String(name || "-").trim().split(/\s+/).filter(Boolean);
  return parts.slice(0, 2).map((part) => part[0]?.toUpperCase()).join("") || "-";
};
