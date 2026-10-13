/* Month-grid maths for the schedule. Pure; unit tested. Weeks start on Monday. */

export const WEEKDAYS = ["M", "T", "W", "T", "F", "S", "S"];
export const MONTH_NAMES = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

/* Local calendar day, "2026-10-12" - the key every grouping uses. */
export const dayKey = (value: Date | string) => {
  const date = typeof value === "string" ? new Date(value) : value;
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
};

/* The six weeks shown for a month, padded with the neighbouring months' days. */
export const monthGrid = (cursor: Date) => {
  const first = new Date(cursor.getFullYear(), cursor.getMonth(), 1);
  const offset = (first.getDay() + 6) % 7; // Monday = 0
  const start = new Date(first);
  start.setDate(first.getDate() - offset);
  return Array.from({ length: 42 }, (_, index) => {
    const date = new Date(start);
    date.setDate(start.getDate() + index);
    return { date, key: dayKey(date), inMonth: date.getMonth() === cursor.getMonth() };
  });
};

/* First and last instants of the grid, for fetching exactly what it shows. */
export const gridRange = (cursor: Date) => {
  const days = monthGrid(cursor);
  const from = new Date(days[0]!.date);
  from.setHours(0, 0, 0, 0);
  const to = new Date(days[days.length - 1]!.date);
  to.setHours(23, 59, 59, 999);
  return { from, to };
};

export const groupByDay = <T,>(items: T[], dateOf: (item: T) => string | null | undefined) => {
  const groups: Record<string, T[]> = {};
  items.forEach((item) => {
    const value = dateOf(item);
    if (!value) return;
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return;
    (groups[dayKey(date)] ||= []).push(item);
  });
  return groups;
};

export const addMonths = (cursor: Date, step: number) => new Date(cursor.getFullYear(), cursor.getMonth() + step, 1);
