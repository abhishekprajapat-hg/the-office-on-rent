import type { DeductionRule, DeductionUnit, NamedDeduction, NamedDeductionInput, RuleKey } from "../api/salary";

/* Labels and limits from salary.controller / payroll.calc.js; keep in step with the server. */
export const RULE_KEYS: { key: RuleKey; label: string; hint: string }[] = [
  { key: "absent", label: "Absent", hint: "Each day absent without leave" },
  { key: "unapprovedLeave", label: "Unapproved leave", hint: "Each day off on a pending or rejected request" },
  { key: "halfDay", label: "Half day", hint: "Each half day" },
  { key: "unpaidLeave", label: "Unpaid leave", hint: "Each approved unpaid leave day" },
  { key: "paidLeave", label: "Paid leave", hint: "Each approved paid leave day" },
  { key: "late", label: "Late check-ins", hint: "Each deduction for late check-ins" },
];

export const UNITS: { key: DeductionUnit; label: string }[] = [
  { key: "DAYS", label: "Days of pay" },
  { key: "AMOUNT", label: "Rupees" },
  { key: "PERCENT", label: "% of salary" },
];

export const UNIT_LIMITS: Record<DeductionUnit, number> = { DAYS: 5, AMOUNT: 100000, PERCENT: 100 };

export const PER_DAY_BASES = [
  { key: "CALENDAR_DAYS", label: "Days in the month" },
  { key: "WORKING_DAYS", label: "Working days" },
  { key: "FIXED_DAYS", label: "Fixed days" },
] as const;

const trim = (value: number) => String(Math.round(value * 100) / 100);

/* "1 day of pay" / "₹500" / "5% of salary" */
export const describeRule = (rule?: { unit?: string; value?: number } | null) => {
  if (!rule) return "—";
  const value = Number(rule.value || 0);
  if (rule.unit === "AMOUNT") return `₹${value.toLocaleString("en-IN")}`;
  if (rule.unit === "PERCENT") return `${trim(value)}% of salary`;
  return value === 0 ? "Nothing" : `${trim(value)} ${value === 1 ? "day" : "days"} of pay`;
};

/* "Every month from Oct 2026" / "Oct 2026 only" / "Oct 2026 – Mar 2027" */
export const describeSchedule = (item: Pick<NamedDeduction, "frequency" | "fromMonth" | "toMonth">, monthLabel: (key: string) => string) => {
  if (item.frequency === "ONCE") return `${monthLabel(item.fromMonth)} only`;
  if (item.toMonth) return `${monthLabel(item.fromMonth)} – ${monthLabel(item.toMonth)}`;
  return `Every month from ${monthLabel(item.fromMonth)}`;
};

/* A rule's value as typed, checked against its unit's cap. Returns an error message or null. */
export const ruleError = (label: string, rule: { unit: DeductionUnit; value: string | number }) => {
  const value = Number(rule.value);
  if (String(rule.value).trim() === "" || !Number.isFinite(value) || value < 0) return `${label} needs a number`;
  if (value > UNIT_LIMITS[rule.unit]) return `${label} can be at most ${rule.unit === "AMOUNT" ? "₹1,00,000" : rule.unit === "PERCENT" ? "100%" : "5 days of pay"}`;
  return null;
};

/* A named deduction form, checked the way the server checks it (validateCustomDeduction). */
export const validateNamedDeduction = (input: { name: string; unit: DeductionUnit; value: string; frequency: "MONTHLY" | "ONCE"; fromMonth: string; toMonth: string }):
  | { error: string }
  | { deduction: NamedDeductionInput } => {
  const name = input.name.trim();
  if (!name || name.length > 60) return { error: "Give the deduction a name of up to 60 characters" };
  const value = Number(input.value);
  if (!Number.isFinite(value) || value <= 0 || value > UNIT_LIMITS[input.unit]) {
    return { error: `${name} must be more than 0 and at most ${input.unit === "AMOUNT" ? "₹1,00,000" : input.unit === "PERCENT" ? "100% of salary" : "5 days of pay"}` };
  }
  if (!/^\d{4}-\d{2}$/.test(input.fromMonth)) return { error: "Choose the month it starts from" };
  const toMonth = input.frequency === "ONCE" ? input.fromMonth : input.toMonth;
  if (toMonth && toMonth < input.fromMonth) return { error: "The end month cannot be before the start month" };
  return { deduction: { name, unit: input.unit, value, frequency: input.frequency, fromMonth: input.fromMonth, toMonth: toMonth || "" } };
};

/* Rules as editable strings, and back. */
export type RuleDraft = Record<RuleKey, { unit: DeductionUnit; value: string }>;
export const toRuleDraft = (rules: Partial<Record<RuleKey, DeductionRule>>): RuleDraft =>
  Object.fromEntries(RULE_KEYS.map(({ key }) => [key, { unit: rules[key]?.unit || "DAYS", value: String(rules[key]?.value ?? 0) }])) as RuleDraft;
export const fromRuleDraft = (draft: RuleDraft) =>
  Object.fromEntries(RULE_KEYS.map(({ key }) => [key, { unit: draft[key].unit, value: Number(draft[key].value) }])) as Record<RuleKey, DeductionRule>;
export const ruleDraftError = (draft: RuleDraft) => {
  for (const { key, label } of RULE_KEYS) {
    const error = ruleError(label, draft[key]);
    if (error) return error;
  }
  return null;
};
