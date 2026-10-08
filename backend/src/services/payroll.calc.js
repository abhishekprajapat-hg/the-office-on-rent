/*
 * Salary for one person for one month, worked out from their attendance.
 *
 * Pure on purpose: no database, no clock it does not get handed. The salary
 * controller gathers the attendance days, the leave requests and the rules;
 * this turns them into a deduction for every kind of day and a net figure.
 *
 * "So far" is the point. For the current month only the days up to today are
 * counted - a day that has not happened yet cannot have gone wrong - so the
 * net figure is what the person would be paid if the rest of the month were
 * perfect.
 */

const DATE_KEY_PATTERN = /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/;
const MONTH_KEY_PATTERN = /^\d{4}-(0[1-9]|1[0-2])$/;
const DAY_MS = 24 * 60 * 60 * 1000;

const PER_DAY_BASIS = Object.freeze({
  // Monthly salary / days in that month (28-31). The usual Indian payroll rule.
  CALENDAR_DAYS: "CALENDAR_DAYS",
  // Monthly salary / working days in that month (weekly offs left out).
  WORKING_DAYS: "WORKING_DAYS",
  // Monthly salary / a fixed number, e.g. 30 or 26, whatever the month.
  FIXED_DAYS: "FIXED_DAYS",
});

/*
 * What one deduction is measured in. Every rule picks its own:
 *   DAYS     value x the per-day salary (0.5 = half a day's pay)
 *   AMOUNT   a fixed number of rupees
 *   PERCENT  value % of the monthly salary
 */
const DEDUCTION_UNIT = Object.freeze({
  DAYS: "DAYS",
  AMOUNT: "AMOUNT",
  PERCENT: "PERCENT",
});

// Sanity caps on one deduction. Over 1 day is a penalty some companies apply
// to an absence nobody was told about; nothing sensible needs more than these.
const DEDUCTION_UNIT_LIMITS = Object.freeze({
  [DEDUCTION_UNIT.DAYS]: 5,
  [DEDUCTION_UNIT.AMOUNT]: 100000,
  [DEDUCTION_UNIT.PERCENT]: 100,
});

// The rules that each carry a unit and a value, in the order they are shown.
const DEDUCTION_RULE_KEYS = Object.freeze(["absent", "unapprovedLeave", "halfDay", "unpaidLeave", "paidLeave", "late"]);

const rule = (unit, value) => Object.freeze({ unit, value });

const DEFAULT_PAYROLL_POLICY = Object.freeze({
  perDayBasis: PER_DAY_BASIS.CALENDAR_DAYS,
  fixedDaysPerMonth: 30,
  absent: rule(DEDUCTION_UNIT.DAYS, 1),
  unapprovedLeave: rule(DEDUCTION_UNIT.DAYS, 1),
  halfDay: rule(DEDUCTION_UNIT.DAYS, 0.5),
  unpaidLeave: rule(DEDUCTION_UNIT.DAYS, 1),
  paidLeave: rule(DEDUCTION_UNIT.DAYS, 0),
  lateGraceCount: 0,
  lateEveryCount: 3,
  // Charged for every lateEveryCount late check-ins after the first lateGraceCount.
  late: rule(DEDUCTION_UNIT.DAYS, 0.5),
});

const MAX_MONTHLY_SALARY = 100000000;

/*
 * Deductions that admins and managers name themselves - "PF", "Professional
 * tax", "Advance recovery" - on top of the attendance rules. Each is either for
 * everybody (kept with the company's rules) or for one person (kept with their
 * salary), and runs every month from a month on, optionally until a month, or
 * in one month only.
 */
const DEDUCTION_FREQUENCY = Object.freeze({
  MONTHLY: "MONTHLY",
  ONCE: "ONCE",
});

const CUSTOM_DEDUCTION_SCOPE = Object.freeze({
  COMPANY: "COMPANY",
  EMPLOYEE: "EMPLOYEE",
});

/** Whether a named deduction applies in a month. A one-month one has from = to. */
const deductionAppliesInMonth = (item, monthKey) => {
  const from = String(item?.fromMonth || "");
  const to = String(item?.toMonth || "");
  if (!MONTH_KEY_PATTERN.test(from) || from > monthKey) return false;
  if (item?.frequency === DEDUCTION_FREQUENCY.ONCE) return from === monthKey;
  return !to || monthKey <= to;
};

const roundMoney = (value) => Math.round((Number(value) || 0) * 100) / 100;

const clampNumber = (value, min, max, fallback) => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(max, Math.max(min, parsed));
};

const clampInteger = (value, min, max, fallback) => {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(max, Math.max(min, parsed));
};

// Rules saved before each one had a unit were plain day counts (and the late
// rule a unit/value pair of its own). Read them as such rather than dropping
// them back to the defaults.
const LEGACY_DAY_FIELDS = Object.freeze({
  absent: "absentDays",
  unapprovedLeave: "unapprovedLeaveDays",
  halfDay: "halfDayDays",
  unpaidLeave: "unpaidLeaveDays",
  paidLeave: "paidLeaveDays",
});

const readStoredRule = (source, key) => {
  const stored = source[key];
  if (stored && typeof stored === "object") return stored;
  if (key === "late" && source.lateDeductionValue !== undefined) {
    return { unit: source.lateDeductionUnit, value: source.lateDeductionValue };
  }
  const legacyField = LEGACY_DAY_FIELDS[key];
  if (legacyField && source[legacyField] !== undefined) {
    return { unit: DEDUCTION_UNIT.DAYS, value: source[legacyField] };
  }
  return null;
};

const toDeductionRule = (raw, fallback) => {
  const unit = Object.values(DEDUCTION_UNIT).includes(raw?.unit) ? raw.unit : fallback.unit;
  // A value only means something in its own unit: never carry the default's
  // "1 day" over as "1 rupee".
  const fallbackValue = unit === fallback.unit ? fallback.value : 0;
  return { unit, value: clampNumber(raw?.value, 0, DEDUCTION_UNIT_LIMITS[unit], fallbackValue) };
};

/** Every field present and inside its range, whatever was stored or sent. */
const toPayrollPolicyView = (source = {}) => {
  const base = DEFAULT_PAYROLL_POLICY;
  const value = source || {};
  const view = {
    perDayBasis: Object.values(PER_DAY_BASIS).includes(value.perDayBasis)
      ? value.perDayBasis
      : base.perDayBasis,
    fixedDaysPerMonth: clampInteger(value.fixedDaysPerMonth, 1, 31, base.fixedDaysPerMonth),
    lateGraceCount: clampInteger(value.lateGraceCount, 0, 31, base.lateGraceCount),
    lateEveryCount: clampInteger(value.lateEveryCount, 1, 31, base.lateEveryCount),
  };
  DEDUCTION_RULE_KEYS.forEach((key) => {
    view[key] = toDeductionRule(readStoredRule(value, key), base[key]);
  });
  return view;
};

/*
 * What one person's own deduction amounts may replace. The per-day basis stays
 * the company's: it is how a day's pay is worked out, not what an absence costs.
 */
const EMPLOYEE_RULE_FIELDS = Object.freeze([...DEDUCTION_RULE_KEYS, "lateGraceCount", "lateEveryCount"]);

/**
 * The rules that apply to one person: their own amounts where a manager set
 * them, otherwise the company's.
 */
const mergeEmployeeRules = (companyRules, employeeRules) => {
  const company = toPayrollPolicyView(companyRules);
  if (!employeeRules) return company;
  const own = Object.fromEntries(
    EMPLOYEE_RULE_FIELDS
      .filter((field) => employeeRules[field] !== undefined && employeeRules[field] !== null)
      .map((field) => [field, employeeRules[field]]),
  );
  return toPayrollPolicyView({ ...company, ...own });
};

/* ------------------------------------------------------------------ dates -- */

const toUtcMs = (dateKey) => {
  const [year, month, day] = String(dateKey || "").split("-").map((part) => Number.parseInt(part, 10));
  if (!year || !month || !day) return Number.NaN;
  return Date.UTC(year, month - 1, day);
};

const fromUtcMs = (ms) => {
  const date = new Date(ms);
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}-${String(date.getUTCDate()).padStart(2, "0")}`;
};

const dateKeysBetween = (fromKey, toKey) => {
  const start = toUtcMs(fromKey);
  const end = toUtcMs(toKey);
  if (!Number.isFinite(start) || !Number.isFinite(end) || end < start) return [];
  const keys = [];
  for (let cursor = start; cursor <= end; cursor += DAY_MS) keys.push(fromUtcMs(cursor));
  return keys;
};

const previousDateKey = (dateKey) => fromUtcMs(toUtcMs(dateKey) - DAY_MS);

const weekdayOf = (dateKey) => new Date(toUtcMs(dateKey)).getUTCDay();

const monthRange = (monthKey) => {
  if (!MONTH_KEY_PATTERN.test(String(monthKey || ""))) return null;
  const [year, month] = monthKey.split("-").map((part) => Number.parseInt(part, 10));
  const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
  return { from: `${monthKey}-01`, to: `${monthKey}-${String(lastDay).padStart(2, "0")}`, daysInMonth: lastDay };
};

/** YYYY-MM-DD for an instant, in a timezone. en-CA formats exactly that way. */
const dateKeyInTimezone = (instant, timezone) => {
  const date = instant instanceof Date ? instant : new Date(instant);
  if (Number.isNaN(date.getTime())) return "";
  try {
    return new Intl.DateTimeFormat("en-CA", {
      timeZone: timezone || "Asia/Kolkata",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(date);
  } catch {
    return date.toISOString().slice(0, 10);
  }
};

/* ------------------------------------------------------------- revisions -- */

/**
 * The salary in force for a month: the revision with the latest effective
 * month not after it, and of those the one set last. Null when nothing was in
 * force yet - a salary set from November says nothing about October.
 */
const resolveSalaryForMonth = (revisions = [], monthKey) => {
  const candidates = (Array.isArray(revisions) ? revisions : [])
    .filter((row) => MONTH_KEY_PATTERN.test(String(row?.effectiveFrom || "")) && row.effectiveFrom <= monthKey)
    .filter((row) => Number.isFinite(Number(row?.monthlySalary)));
  if (!candidates.length) return null;
  candidates.sort((left, right) => {
    if (left.effectiveFrom !== right.effectiveFrom) return left.effectiveFrom < right.effectiveFrom ? 1 : -1;
    return new Date(right.setAt || 0).getTime() - new Date(left.setAt || 0).getTime();
  });
  return candidates[0];
};

/* --------------------------------------------------------- classification -- */

const DAY_KIND = Object.freeze({
  ABSENT: "ABSENT",
  UNAPPROVED_LEAVE: "UNAPPROVED_LEAVE",
  HALF_DAY: "HALF_DAY",
  UNPAID_LEAVE: "UNPAID_LEAVE",
  PAID_LEAVE: "PAID_LEAVE",
  WORKED: "WORKED",
});

/*
 * What a day counts as for pay.
 *
 * An approved leave day arrives with its leave type as the source (CASUAL,
 * SICK, UNPAID...); only UNPAID costs pay. A day an admin marked Leave by hand
 * is treated as paid leave - marking Absent is how they say it should cost.
 * An absence on a day the person did ask leave for, but which is still pending
 * or was rejected, is "unapproved leave" rather than a plain absence.
 */
const classifyDay = (row, unapprovedLeaveDates) => {
  const status = String(row?.status || "").toUpperCase();
  if (status === "ABSENT") {
    return unapprovedLeaveDates.has(row.attendanceDate) ? DAY_KIND.UNAPPROVED_LEAVE : DAY_KIND.ABSENT;
  }
  if (status === "HALF_DAY") return DAY_KIND.HALF_DAY;
  if (status === "LEAVE") {
    return String(row?.source || "").toUpperCase() === "UNPAID" ? DAY_KIND.UNPAID_LEAVE : DAY_KIND.PAID_LEAVE;
  }
  return DAY_KIND.WORKED;
};

const isLateDay = (row) => Boolean(row?.checkInAt)
  && (Boolean(row?.isLateCheckIn) || String(row?.status || "").toUpperCase() === "LATE");

/* ------------------------------------------------------------ calculation -- */

const formatRupeeValue = (value) =>
  `₹${Number(value).toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;

/** "Half a day's pay", "₹500", "5% of salary" */
const describeCost = ({ unit, value }) => {
  if (unit === DEDUCTION_UNIT.AMOUNT) return formatRupeeValue(value);
  if (unit === DEDUCTION_UNIT.PERCENT) return `${value}% of salary`;
  if (value === 0.5) return "Half a day's pay";
  if (value === 1) return "1 day's pay";
  return `${value} days' pay`;
};

const dayRuleLabel = (deduction) =>
  (deduction.value ? `${describeCost(deduction)} each` : "No deduction");

const lateRuleLabel = (policy) => {
  if (!policy.late.value) return "No deduction";
  const every = policy.lateEveryCount === 1 ? "every late check-in" : `every ${policy.lateEveryCount} late check-ins`;
  const grace = policy.lateGraceCount ? ` after the first ${policy.lateGraceCount}` : "";
  return `${describeCost(policy.late)} for ${every}${grace}`;
};

/**
 * @param {object} input
 * @param {string} input.monthKey             YYYY-MM
 * @param {string} input.todayKey             YYYY-MM-DD in the company's timezone
 * @param {number} input.monthlySalary
 * @param {object} input.policy               payroll rules (any shape; normalised here)
 * @param {number[]} input.weeklyOffDays      0 = Sunday, from the attendance policy
 * @param {object[]} input.days               attendance rows for the month (one per date)
 * @param {Iterable<string>} input.unapprovedLeaveDates  dates under a pending or rejected leave request
 * @param {string} [input.joiningKey]         YYYY-MM-DD, only when the joining date is actually set
 */
const calculateMonthlySalary = ({
  monthKey,
  todayKey,
  monthlySalary,
  policy: rawPolicy,
  weeklyOffDays = [0],
  days = [],
  unapprovedLeaveDates = [],
  joiningKey = "",
  customDeductions = [],
}) => {
  const range = monthRange(monthKey);
  if (!range) throw new Error("monthKey must be YYYY-MM");
  const policy = toPayrollPolicyView(rawPolicy);
  const salary = roundMoney(clampNumber(monthlySalary, 0, MAX_MONTHLY_SALARY, 0));
  const offDays = new Set((Array.isArray(weeklyOffDays) ? weeklyOffDays : []).map(Number));

  const allDates = dateKeysBetween(range.from, range.to);
  const workingDaysInMonth = allDates.filter((key) => !offDays.has(weekdayOf(key))).length;
  const divisor = policy.perDayBasis === PER_DAY_BASIS.WORKING_DAYS
    ? Math.max(1, workingDaysInMonth)
    : policy.perDayBasis === PER_DAY_BASIS.FIXED_DAYS
      ? policy.fixedDaysPerMonth
      : range.daysInMonth;
  const perDayRate = salary / divisor;

  const isFutureMonth = Boolean(todayKey) && range.from > todayKey;
  const throughKey = isFutureMonth ? "" : (todayKey && todayKey < range.to ? todayKey : range.to);
  const joined = DATE_KEY_PATTERN.test(String(joiningKey || "")) ? joiningKey : "";

  // Days before the joining date are not paid for, and not judged either.
  let beforeJoiningDates = [];
  if (joined && joined > range.from) {
    const lastBefore = joined > range.to ? range.to : previousDateKey(joined);
    beforeJoiningDates = dateKeysBetween(range.from, lastBefore);
    if (policy.perDayBasis === PER_DAY_BASIS.WORKING_DAYS) {
      beforeJoiningDates = beforeJoiningDates.filter((key) => !offDays.has(weekdayOf(key)));
    }
  }

  const unapproved = new Set(unapprovedLeaveDates);
  const buckets = {
    [DAY_KIND.ABSENT]: [],
    [DAY_KIND.UNAPPROVED_LEAVE]: [],
    [DAY_KIND.HALF_DAY]: [],
    [DAY_KIND.UNPAID_LEAVE]: [],
    [DAY_KIND.PAID_LEAVE]: [],
  };
  const lateDates = [];

  const seen = new Set();
  (Array.isArray(days) ? days : []).forEach((row) => {
    const dateKey = String(row?.attendanceDate || "");
    if (!DATE_KEY_PATTERN.test(dateKey) || seen.has(dateKey)) return;
    if (dateKey < range.from || dateKey > range.to) return;
    if (!throughKey || dateKey > throughKey) return;
    if (joined && dateKey < joined) return;
    seen.add(dateKey);
    const kind = classifyDay(row, unapproved);
    if (buckets[kind]) buckets[kind].push(dateKey);
    if (isLateDay(row)) lateDates.push(dateKey);
  });
  Object.values(buckets).forEach((dates) => dates.sort());
  lateDates.sort();

  // What one occurrence costs under a rule, in rupees.
  const costOf = ({ unit, value }) => {
    if (unit === DEDUCTION_UNIT.AMOUNT) return value;
    if (unit === DEDUCTION_UNIT.PERCENT) return (salary * value) / 100;
    return value * perDayRate;
  };

  const dayLine = (key, label, dates) => ({
    key,
    label,
    count: dates.length,
    dates,
    unit: policy[key].unit,
    value: policy[key].value,
    rule: dayRuleLabel(policy[key]),
    amount: roundMoney(dates.length * costOf(policy[key])),
  });

  const chargeableLates = Math.max(0, lateDates.length - policy.lateGraceCount);
  const lateBlocks = Math.floor(chargeableLates / policy.lateEveryCount);

  const lines = [
    dayLine("absent", "Absent", buckets[DAY_KIND.ABSENT]),
    dayLine("unapprovedLeave", "Unapproved leave", buckets[DAY_KIND.UNAPPROVED_LEAVE]),
    dayLine("halfDay", "Half day", buckets[DAY_KIND.HALF_DAY]),
    dayLine("unpaidLeave", "Unpaid leave", buckets[DAY_KIND.UNPAID_LEAVE]),
    dayLine("paidLeave", "Paid leave", buckets[DAY_KIND.PAID_LEAVE]),
    {
      key: "late",
      label: "Late check-in",
      count: lateDates.length,
      dates: lateDates,
      unit: policy.late.unit,
      value: policy.late.value,
      rule: lateRuleLabel(policy),
      chargeableCount: chargeableLates,
      amount: roundMoney(lateBlocks * costOf(policy.late)),
    },
  ];

  /*
   * Named deductions are monthly items, not attendance: they apply in full for
   * any month they cover - a month still to come included - and do not wait
   * for the days to pass the way absences do.
   */
  (Array.isArray(customDeductions) ? customDeductions : [])
    .filter((item) => deductionAppliesInMonth(item, monthKey))
    .forEach((item) => {
      const deduction = toDeductionRule(item, { unit: DEDUCTION_UNIT.DAYS, value: 0 });
      const once = item.frequency === DEDUCTION_FREQUENCY.ONCE;
      lines.push({
        key: `custom:${item.id}`,
        label: String(item.name || "Deduction"),
        custom: true,
        scope: item.scope === CUSTOM_DEDUCTION_SCOPE.EMPLOYEE
          ? CUSTOM_DEDUCTION_SCOPE.EMPLOYEE
          : CUSTOM_DEDUCTION_SCOPE.COMPANY,
        count: null,
        dates: [],
        unit: deduction.unit,
        value: deduction.value,
        rule: deduction.value ? `${describeCost(deduction)} ${once ? "this month only" : "every month"}` : "No deduction",
        amount: roundMoney(costOf(deduction)),
      });
    });

  if (beforeJoiningDates.length) {
    lines.push({
      key: "beforeJoining",
      label: "Before joining date",
      count: beforeJoiningDates.length,
      dates: beforeJoiningDates,
      unit: DEDUCTION_UNIT.DAYS,
      value: 1,
      rule: "Not paid",
      amount: roundMoney(beforeJoiningDates.length * perDayRate),
    });
  }

  const rawDeduction = lines.reduce((sum, line) => sum + line.amount, 0);
  // Never below zero: rules strict enough to cost more than the salary still
  // leave nothing to pay, not a debt.
  const totalDeduction = roundMoney(Math.min(salary, rawDeduction));

  return {
    month: monthKey,
    from: range.from,
    to: range.to,
    throughDate: throughKey || null,
    isFutureMonth,
    isMonthComplete: Boolean(todayKey) && range.to < todayKey,
    monthlySalary: salary,
    perDayRate: roundMoney(perDayRate),
    perDayBasis: policy.perDayBasis,
    divisor,
    daysInMonth: range.daysInMonth,
    workingDaysInMonth,
    lines,
    totalDeduction,
    netSalary: roundMoney(salary - totalDeduction),
  };
};

module.exports = {
  PER_DAY_BASIS,
  DEDUCTION_FREQUENCY,
  CUSTOM_DEDUCTION_SCOPE,
  deductionAppliesInMonth,
  DEDUCTION_UNIT,
  DEDUCTION_UNIT_LIMITS,
  DEDUCTION_RULE_KEYS,
  EMPLOYEE_RULE_FIELDS,
  mergeEmployeeRules,
  DEFAULT_PAYROLL_POLICY,
  MAX_MONTHLY_SALARY,
  MONTH_KEY_PATTERN,
  toPayrollPolicyView,
  resolveSalaryForMonth,
  calculateMonthlySalary,
  dateKeyInTimezone,
  dateKeysBetween,
  monthRange,
};
