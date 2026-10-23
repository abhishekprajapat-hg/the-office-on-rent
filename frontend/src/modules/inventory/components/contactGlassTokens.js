/*
 * Shared tokens and helpers for the Broker / Owner Database screens (CRM Web
 * Glass "Broker Database" design). Colours come from the glass tokens, so the
 * screens follow the chosen colour theme and light/dark mode.
 */

// tone -> [foreground, soft background]
export const TONE = {
  a: ["var(--g-b)", "var(--g-bs)"],
  ok: ["var(--g-ok)", "var(--g-oks)"],
  warn: ["var(--g-warn)", "var(--g-warns)"],
  bad: ["var(--g-bad)", "var(--g-bads)"],
  info: ["var(--g-info, var(--g-b))", "var(--g-infos, var(--g-bs))"],
  vio: ["var(--g-vio)", "var(--g-vios)"],
  mute: ["var(--g-mut)", "var(--g-track)"],
};
export const AVATAR_TONES = ["a", "info", "warn", "vio", "ok"];
export const CP_TONE = { ACTIVE: "ok", PENDING: "warn", INACTIVE: "bad", NOT_ONBOARDED: "mute" };

export const glassCard = { background: "var(--g-glass)", border: "1px solid var(--g-line)", boxShadow: "var(--g-shadow)" };
export const field = { background: "var(--g-glassHi)", border: "1px solid var(--g-edge, var(--g-line))", color: "var(--g-ink)" };
export const MUT = { color: "var(--g-mut)" };
export const FNT = { color: "var(--g-fnt)" };

export const toneForId = (id = "") => {
  let h = 0;
  for (const ch of String(id)) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return AVATAR_TONES[h % AVATAR_TONES.length];
};

// "Lead 8889972812" -> "L#", "Rohit Khanna" -> "RK"
export const initialsOf = (name = "") => {
  const parts = String(name || "?").trim().split(/\s+/);
  if (/\d/.test(parts[parts.length - 1] || "")) return `${(parts[0] || "?")[0]}#`.toUpperCase();
  return parts.map((p) => p[0]).join("").slice(0, 2).toUpperCase() || "?";
};

export const telHref = (phone = "") => `tel:${String(phone).replace(/[^\d+]/g, "")}`;
export const waHref = (phone = "") => {
  let digits = String(phone).replace(/\D/g, "");
  if (digits.length === 10) digits = `91${digits}`;
  return `https://wa.me/${digits}`;
};
export const prettyPhone = (phone = "") => {
  const d = String(phone).replace(/\D/g, "");
  return d.length === 10 ? `+91 ${d.slice(0, 5)} ${d.slice(5)}` : phone;
};
