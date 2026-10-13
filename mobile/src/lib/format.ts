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
