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

/* ------------------------------------------------------- deduction rules -- */

// Mirrors DEDUCTION_RULE_KEYS and DEDUCTION_UNIT_LIMITS in the backend's
// payroll.calc - the API refuses anything outside them.
export const DEDUCTION_RULE_KEYS = ["absent", "unapprovedLeave", "halfDay", "unpaidLeave", "paidLeave", "late"];

export const DEDUCTION_UNITS = [
  { value: "DAYS", label: "days of pay", max: 5, step: 0.25 },
  { value: "AMOUNT", label: "rupees (₹)", max: 100000, step: 1 },
  { value: "PERCENT", label: "% of monthly salary", max: 100, step: 0.5 },
];

export const deductionUnit = (unit) =>
  DEDUCTION_UNITS.find((entry) => entry.value === unit) || DEDUCTION_UNITS[0];

const COUNT_FIELDS = ["fixedDaysPerMonth", "lateGraceCount", "lateEveryCount"];

/** The saved rules as form state: every number a string, so a field can be empty. */
export const toRulesForm = (policy) => {
  if (!policy) return null;
  const form = { perDayBasis: policy.perDayBasis };
  COUNT_FIELDS.forEach((field) => { form[field] = String(policy[field] ?? ""); });
  DEDUCTION_RULE_KEYS.forEach((key) => {
    form[key] = { unit: policy[key]?.unit || "DAYS", value: String(policy[key]?.value ?? "") };
  });
  return form;
};

const isBlank = (value) => String(value ?? "").trim() === "";

/** Form state back to what the API takes, or the reason it cannot be sent yet. */
export const rulesFormToPayload = (form) => {
  if (COUNT_FIELDS.some((field) => isBlank(form[field]))
    || DEDUCTION_RULE_KEYS.some((key) => isBlank(form[key]?.value))) {
    return { error: "Fill in every rule - use 0 for no deduction" };
  }
  const payload = { perDayBasis: form.perDayBasis };
  COUNT_FIELDS.forEach((field) => { payload[field] = Number(form[field]); });
  DEDUCTION_RULE_KEYS.forEach((key) => {
    payload[key] = { unit: form[key].unit, value: Number(form[key].value) };
  });
  return { payload };
};

/** Whether the form differs from what is saved. A blank field counts as a change. */
export const isRulesFormChanged = (form, policy) => {
  if (!form || !policy) return false;
  if (form.perDayBasis !== policy.perDayBasis) return true;
  if (COUNT_FIELDS.some((field) => isBlank(form[field]) || Number(form[field]) !== policy[field])) return true;
  return DEDUCTION_RULE_KEYS.some((key) => form[key].unit !== policy[key].unit
    || isBlank(form[key].value)
    || Number(form[key].value) !== policy[key].value);
};

/* ------------------------------------------------------ named deductions -- */

/** "₹200", "12% of salary", "Half a day's pay" */
export const describeDeductionCost = ({ unit, value }) => {
  const amount = Number(value);
  if (unit === "AMOUNT") return formatRupees(amount);
  if (unit === "PERCENT") return `${amount}% of salary`;
  if (amount === 0.5) return "Half a day's pay";
  if (amount === 1) return "1 day's pay";
  return `${amount} days' pay`;
};

/** "Every month from October 2026", "Only in October 2026" */
export const describeDeductionSchedule = (item) => {
  if (!item) return "";
  if (item.frequency === "ONCE") return `Only in ${formatMonthLabel(item.fromMonth)}`;
  if (item.toMonth) return `Every month, ${formatMonthLabel(item.fromMonth)} to ${formatMonthLabel(item.toMonth)}`;
  return `Every month from ${formatMonthLabel(item.fromMonth)}`;
};

/** Where a named deduction stands against a month: "upcoming", "active" or "ended". */
export const deductionStatus = (item, monthKey) => {
  const end = item?.frequency === "ONCE" ? item?.fromMonth : item?.toMonth;
  if (String(item?.fromMonth || "") > monthKey) return "upcoming";
  if (end && end < monthKey) return "ended";
  return "active";
};

/** What a month's named deductions add up to, company-wide and personal together. */
export const customDeductionTotal = (salary) => Math.round(
  (salary?.lines || []).filter((line) => line.custom).reduce((sum, line) => sum + Number(line.amount || 0), 0) * 100,
) / 100;

/* ---------------------------------------------- rules, in a line or two -- */

const DAY_RULE_LABELS = [
  ["absent", "Absent"],
  ["halfDay", "Half day"],
  ["unapprovedLeave", "Unapproved leave"],
  ["unpaidLeave", "Unpaid leave"],
  ["paidLeave", "Paid leave"],
];

/** "₹200 per 3 late check-ins, after 2 free" */
export const describeLateRule = (rules) => {
  if (!rules?.late?.value) return "No deduction";
  const every = Number(rules.lateEveryCount) === 1 ? "late check-in" : `${rules.lateEveryCount} late check-ins`;
  const grace = Number(rules.lateGraceCount) ? `, after ${rules.lateGraceCount} free` : "";
  return `${describeDeductionCost(rules.late)} per ${every}${grace}`;
};

/** Each rule as { key, label, text }, for showing a set of rules at a glance. */
export const summarizeRules = (rules) => {
  if (!rules) return [];
  return [
    ...DAY_RULE_LABELS.map(([key, label]) => ({
      key,
      label,
      // "₹1,000 per day", but "1 day's pay" already says it is per day.
      text: !rules[key]?.value
        ? "No deduction"
        : rules[key].unit === "DAYS"
          ? describeDeductionCost(rules[key])
          : `${describeDeductionCost(rules[key])} per day`,
    })),
    { key: "late", label: "Late", text: describeLateRule(rules) },
  ];
};
