/* Date and number formatting. Pure functions, so they are unit tested. */

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

const toDate = (value?: string | Date | null) => {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
};

const sameDay = (a: Date, b: Date) =>
  a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();

export const formatTime = (value?: string | Date | null) => {
  const date = toDate(value);
  if (!date) return "";
  const hours = date.getHours();
  const minutes = String(date.getMinutes()).padStart(2, "0");
  const h12 = hours % 12 === 0 ? 12 : hours % 12;
  return `${h12}:${minutes} ${hours < 12 ? "AM" : "PM"}`;
};

export const formatDate = (value?: string | Date | null, now = new Date()) => {
  const date = toDate(value);
  if (!date) return "";
  const base = `${date.getDate()} ${MONTHS[date.getMonth()]}`;
  return date.getFullYear() === now.getFullYear() ? base : `${base} ${date.getFullYear()}`;
};

/* "Today, 4:30 PM" / "Tomorrow, 10:00 AM" / "Yesterday" / "14 Oct, 9:00 AM". */
export const formatWhen = (value?: string | Date | null, now = new Date()) => {
  const date = toDate(value);
  if (!date) return "";
  const tomorrow = new Date(now);
  tomorrow.setDate(now.getDate() + 1);
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  const time = formatTime(date);
  if (sameDay(date, now)) return `Today, ${time}`;
  if (sameDay(date, tomorrow)) return `Tomorrow, ${time}`;
  if (sameDay(date, yesterday)) return `Yesterday, ${time}`;
  return `${formatDate(date, now)}, ${time}`;
};

export const isOverdue = (value?: string | Date | null, now = new Date()) => {
  const date = toDate(value);
  return Boolean(date && date.getTime() < now.getTime());
};

/* 135 -> "2h 15m", 45 -> "45m", 0 -> "0m". */
export const formatMinutes = (minutes?: number | null) => {
  const total = Math.max(0, Math.round(Number(minutes) || 0));
  const h = Math.floor(total / 60);
  const m = total % 60;
  if (!h) return `${m}m`;
  return m ? `${h}h ${m}m` : `${h}h`;
};

export const greeting = (now = new Date()) => {
  const hour = now.getHours();
  if (hour < 12) return "Good morning";
  if (hour < 17) return "Good afternoon";
  return "Good evening";
};

export const initials = (name?: string) =>
  String(name || "")
    .trim()
    .split(/\s+/)
    .map((part) => part.replace(/[^\p{L}\p{N}]/gu, ""))
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]!.toUpperCase())
    .join("") || "?";

export const firstName = (name?: string) => String(name || "").trim().split(/\s+/)[0] || "";

/* Digits only, keeping a leading +, for tel: and WhatsApp links. */
export const dialable = (phone?: string) => {
  const raw = String(phone || "").trim();
  const digits = raw.replace(/[^\d]/g, "");
  return raw.startsWith("+") ? `+${digits}` : digits;
};

/* WhatsApp needs a country code; a bare 10-digit Indian number gets 91. */
export const whatsappNumber = (phone?: string) => {
  const digits = String(phone || "").replace(/[^\d]/g, "");
  return digits.length === 10 ? `91${digits}` : digits;
};

const WEEKDAYS_SHORT = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const WEEKDAYS_LONG = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const MONTHS_LONG = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

/* "Mon, 12 Oct" - the date line under greetings. */
export const formatDayShort = (now = new Date()) => `${WEEKDAYS_SHORT[now.getDay()]}, ${now.getDate()} ${MONTHS[now.getMonth()]}`;

/* "Monday, 12 October" */
export const formatDayLong = (now = new Date()) => `${WEEKDAYS_LONG[now.getDay()]}, ${now.getDate()} ${MONTHS_LONG[now.getMonth()]}`;

/* 138 -> "2:18" (hours:minutes on a clock face). */
export const formatClock = (minutes?: number | null) => {
  const total = Math.max(0, Math.floor(Number(minutes) || 0));
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, "0")}`;
};

/* "9:00" + "AM" split, for the time column in follow-up lists. */
export const splitTime = (value?: string | Date | null) => {
  const label = formatTime(value);
  const [clock = "", meridiem = ""] = label.split(" ");
  return { clock, meridiem };
};

/* "now", "2m", "41m", "3h", "Sun", "14 Oct" - compact age for feeds. */
export const formatAgo = (value?: string | Date | null, now = new Date()) => {
  const date = value ? new Date(value) : null;
  if (!date || Number.isNaN(date.getTime())) return "";
  const minutes = Math.floor((now.getTime() - date.getTime()) / 60000);
  if (minutes < 1) return "now";
  if (minutes < 60) return `${minutes}m`;
  if (minutes < 24 * 60 && date.getDate() === now.getDate()) return `${Math.floor(minutes / 60)}h`;
  if (minutes < 7 * 24 * 60) return WEEKDAYS_SHORT[date.getDay()]!;
  return `${date.getDate()} ${MONTHS[date.getMonth()]}`;
};

/* Task due line: "12:00 PM" today, "Yesterday", "Tomorrow", "Fri, 16 Oct" this week, else "16 Oct". */
export const formatDueDay = (value?: string | Date | null, now = new Date()) => {
  const date = value ? new Date(value) : null;
  if (!date || Number.isNaN(date.getTime())) return "";
  const start = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const days = Math.round((start(date) - start(now)) / 86400000);
  if (days === 0) return formatTime(date);
  if (days === -1) return "Yesterday";
  if (days === 1) return "Tomorrow";
  if (days > 1 && days < 7) return `${WEEKDAYS_SHORT[date.getDay()]}, ${date.getDate()} ${MONTHS[date.getMonth()]}`;
  return formatDate(date, now);
};

/* ------------------------------------------------------------- months -- */

/* "2026-10" for a date, in the device calendar. */
export const monthKeyOf = (date = new Date()) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;

/* "2026-10" + -1 -> "2026-09" */
export const shiftMonth = (key: string, delta: number) => {
  const [y, m] = key.split("-").map(Number);
  return monthKeyOf(new Date(y!, m! - 1 + delta, 1));
};

/* "2026-10" -> "October 2026" / short: "Oct" */
export const monthLabel = (key: string, short = false) => {
  const [y, m] = key.split("-").map(Number);
  if (!y || !m) return key;
  return short ? MONTHS[m - 1]! : `${MONTHS_LONG[m - 1]} ${y}`;
};

/* "₹40,280" - whole rupees with Indian grouping (paise only when present). */
export const rupees = (value?: number | null) => {
  const amount = Number(value) || 0;
  const fixed = Math.round(amount * 100) / 100;
  return `₹${fixed.toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;
};
