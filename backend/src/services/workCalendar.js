/*
 * Whose day off is which (requirements 16 Oct 2026, 4.3 and 4.4).
 *
 * Most people follow the company's weekly off (usually Sunday), but a team or
 * a person can have their own - Production works Sunday and is off Monday.
 * A person's schedule is a list of { days, effectiveFrom } entries, so a change
 * applies from its date onward and earlier months keep the old schedule.
 * Company holidays are days off for everybody.
 */
const DATE_KEY = /^\d{4}-\d{2}-\d{2}$/;

const normalizeDays = (days) => [...new Set((Array.isArray(days) ? days : [])
  .map(Number).filter((d) => Number.isInteger(d) && d >= 0 && d <= 6))].sort();

const normalizeSchedule = (schedule) => (Array.isArray(schedule) ? schedule : [])
  .filter((entry) => entry && DATE_KEY.test(String(entry.effectiveFrom || "")))
  .map((entry) => ({ days: normalizeDays(entry.days), effectiveFrom: String(entry.effectiveFrom) }))
  .sort((a, b) => a.effectiveFrom.localeCompare(b.effectiveFrom));

/* The weekdays off on a date: the latest schedule entry in force, or the company's. */
const weeklyOffDaysOn = (schedule, dateKey, companyDays = [0]) => {
  const entries = normalizeSchedule(schedule);
  let current = null;
  for (const entry of entries) {
    if (entry.effectiveFrom <= dateKey) current = entry;
  }
  return current ? current.days : normalizeDays(companyDays);
};

const weekdayOfKey = (dateKey) => new Date(`${dateKey}T00:00:00Z`).getUTCDay();

const normalizeHolidays = (holidays) => (Array.isArray(holidays) ? holidays : [])
  .filter((h) => h && DATE_KEY.test(String(h.date || "")))
  .map((h) => ({ date: String(h.date), name: String(h.name || "Holiday").trim().slice(0, 80) || "Holiday" }))
  .sort((a, b) => a.date.localeCompare(b.date));

const holidaySet = (policy) => new Set(normalizeHolidays(policy?.holidays).map((h) => h.date));

/* True when the date is this person's day off or a company holiday. */
const isOffDate = (dateKey, { schedule, policy } = {}) => {
  if (!DATE_KEY.test(String(dateKey || ""))) return false;
  if (holidaySet(policy).has(dateKey)) return true;
  return weeklyOffDaysOn(schedule, dateKey, policy?.weeklyOffDays || [0]).includes(weekdayOfKey(dateKey));
};

const makeOffDayChecker = ({ schedule, policy } = {}) => {
  const holidays = holidaySet(policy);
  const entries = normalizeSchedule(schedule);
  const companyDays = normalizeDays(policy?.weeklyOffDays || [0]);
  return (dateKey) => {
    if (holidays.has(dateKey)) return true;
    const days = weeklyOffDaysOn(entries, dateKey, companyDays);
    return days.includes(weekdayOfKey(dateKey));
  };
};

module.exports = {
  normalizeDays,
  normalizeSchedule,
  normalizeHolidays,
  weeklyOffDaysOn,
  isOffDate,
  makeOffDayChecker,
  holidaySet,
};
