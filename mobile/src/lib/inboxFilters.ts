/* The inbox filters the web notifications page has (date window and free-text search). Pure; unit tested. */

export type DateWindow = "ALL" | "TODAY" | "WEEK" | "MONTH";

export const DATE_WINDOWS: { key: DateWindow; label: string }[] = [
  { key: "ALL", label: "Any time" },
  { key: "TODAY", label: "Today" },
  { key: "WEEK", label: "Last 7 days" },
  { key: "MONTH", label: "Last 30 days" },
];

/* Web withinDateFilter: today is the calendar day; week and month are rolling windows. */
export const withinWindow = (value: string | Date | null | undefined, window: DateWindow, now = new Date()) => {
  if (window === "ALL") return true;
  if (!value) return false;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return false;
  if (window === "TODAY") return date.toDateString() === now.toDateString();
  const days = window === "WEEK" ? 7 : 30;
  return now.getTime() - date.getTime() <= days * 24 * 60 * 60 * 1000;
};

/* Every word of the query appears somewhere in the fields, ignoring case. */
export const matchesQuery = (fields: (string | null | undefined)[], query: string) => {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  if (!words.length) return true;
  const haystack = fields.filter(Boolean).join(" ").toLowerCase();
  return words.every((word) => haystack.includes(word));
};
