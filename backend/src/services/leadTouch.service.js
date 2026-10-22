/*
 * Lead touch time (requirements 16 Oct 2026, section 08).
 *
 * The clock starts when the lead is created in the CRM and stops at the first
 * qualifying touch: a logged call or a message sent. Opening the lead is not a
 * touch. The first touch is written once (an atomic "only if still empty"
 * update), so reassigning the lead or touching it again never changes it.
 */
const Lead = require("../models/Lead");
const LeadActivity = require("../models/leadActivity.model");

const TOUCH_CHANNELS = Object.freeze(["CALL", "WHATSAPP", "SMS", "EMAIL", "OTHER"]);
const TOUCH_SOURCES = Object.freeze(["MANUAL", "CRM_ACTION", "SYSTEM"]);

class TouchError extends Error {
  constructor(statusCode, message) { super(message); this.statusCode = statusCode; }
}

/* Whole minutes from creation to the touch; never negative. */
const minutesBetween = (from, to) => {
  const a = new Date(from).getTime();
  const b = new Date(to).getTime();
  if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
  return Math.max(0, Math.floor((b - a) / 60000));
};

const touchState = (lead) => (lead?.firstTouchAt ? "TOUCHED" : "UNTOUCHED");

/* "8 min", "2 h 5 min", "3 d 4 h" */
const formatTouchTime = (minutes) => {
  if (minutes === null || minutes === undefined) return "";
  if (minutes < 60) return `${minutes} min`;
  const h = Math.floor(minutes / 60);
  if (h < 24) return `${h} h${minutes % 60 ? ` ${minutes % 60} min` : ""}`;
  const d = Math.floor(h / 24);
  return `${d} d${h % 24 ? ` ${h % 24} h` : ""}`;
};

/*
 * Records a qualifying touch. Returns the lead's touch fields afterwards.
 * `at` defaults to now; a manual log may backdate it (not before creation,
 * not in the future).
 */
const recordTouch = async ({ lead, user, channel, source = "MANUAL", at = null, note = "" }) => {
  const ch = String(channel || "").toUpperCase();
  const src = String(source || "MANUAL").toUpperCase();
  if (!TOUCH_CHANNELS.includes(ch)) throw new TouchError(400, "Choose call, WhatsApp, SMS, email or other");
  if (!TOUCH_SOURCES.includes(src)) throw new TouchError(400, "Invalid touch source");
  // Callers may pass a lead loaded with a narrow projection; the touch time
  // is measured from creation, so make sure we have it.
  if (!lead.createdAt) {
    const base = await Lead.findById(lead._id).select("createdAt companyId").lean();
    if (base) lead = { ...lead, createdAt: base.createdAt, companyId: lead.companyId || base.companyId };
  }
  let when = at ? new Date(at) : new Date();
  if (Number.isNaN(when.getTime())) throw new TouchError(400, "Invalid time");
  if (when.getTime() > Date.now() + 60000) throw new TouchError(400, "A touch can't be in the future");
  if (lead.createdAt && when < new Date(lead.createdAt)) when = new Date(lead.createdAt);

  const minutes = minutesBetween(lead.createdAt, when);
  // First touch: only if nobody touched it yet (never overwritten).
  const first = await Lead.updateOne(
    { _id: lead._id, companyId: lead.companyId, firstTouchAt: null },
    { $set: { firstTouchAt: when, firstTouchBy: user._id, firstTouchChannel: ch, firstTouchSource: src, touchMinutes: minutes } },
  );
  await Lead.updateOne(
    { _id: lead._id, companyId: lead.companyId },
    { $inc: { touchCount: 1 }, $max: { lastTouchAt: when, lastContactedAt: when } },
  );
  await LeadActivity.create({
    lead: lead._id,
    action: `Touch logged: ${ch.toLowerCase()}${src === "CRM_ACTION" ? " (from the CRM)" : src === "SYSTEM" ? " (verified)" : " (logged by hand)"}${note ? ` - ${String(note).slice(0, 200)}` : ""}`,
    performedBy: user._id,
  });
  const fresh = await Lead.findById(lead._id).select("createdAt firstTouchAt firstTouchBy firstTouchChannel firstTouchSource touchMinutes lastTouchAt touchCount").lean();
  return { isFirstTouch: Boolean(first.modifiedCount), ...toTouchView(fresh) };
};

const toTouchView = (lead) => ({
  createdAt: lead?.createdAt || null,
  state: touchState(lead),
  firstTouchAt: lead?.firstTouchAt || null,
  firstTouchBy: lead?.firstTouchBy || null,
  firstTouchChannel: lead?.firstTouchChannel || "",
  firstTouchSource: lead?.firstTouchSource || "",
  touchMinutes: lead?.touchMinutes ?? null,
  touchTimeLabel: formatTouchTime(lead?.touchMinutes ?? null),
  verified: lead?.firstTouchSource === "SYSTEM",
  lastTouchAt: lead?.lastTouchAt || null,
  touchCount: lead?.touchCount || 0,
});

/* Mongo clauses for the lead list filters (section 08 "filter by touch time"). */
const touchFilterClauses = (query = {}) => {
  const clauses = [];
  const state = String(query.touchState || "").toUpperCase();
  if (state === "UNTOUCHED") clauses.push({ firstTouchAt: null });
  if (state === "TOUCHED") clauses.push({ firstTouchAt: { $ne: null } });
  const min = Number.parseInt(query.touchMinutesMin, 10);
  const max = Number.parseInt(query.touchMinutesMax, 10);
  if (Number.isFinite(min) || Number.isFinite(max)) {
    clauses.push({ touchMinutes: { ...(Number.isFinite(min) ? { $gte: min } : {}), ...(Number.isFinite(max) ? { $lte: max } : {}) } });
  }
  if (query.firstTouchBy && /^[a-f0-9]{24}$/i.test(String(query.firstTouchBy))) clauses.push({ firstTouchBy: query.firstTouchBy });
  return clauses;
};

/* Per-employee response report: touched, untouched, average and median minutes. */
const summarizeTouches = (leads = []) => {
  const byUser = new Map();
  const ensure = (id) => {
    const key = String(id || "unassigned");
    if (!byUser.has(key)) byUser.set(key, { userId: id || null, leads: 0, touched: 0, untouched: 0, minutes: [] });
    return byUser.get(key);
  };
  leads.forEach((lead) => {
    const owner = ensure(lead.firstTouchBy || lead.assignedTo);
    owner.leads += 1;
    if (lead.firstTouchAt) {
      owner.touched += 1;
      if (lead.touchMinutes !== null && lead.touchMinutes !== undefined) owner.minutes.push(lead.touchMinutes);
    } else {
      owner.untouched += 1;
    }
  });
  return [...byUser.values()].map(({ minutes, ...row }) => {
    const sorted = [...minutes].sort((a, b) => a - b);
    const median = sorted.length ? (sorted.length % 2 ? sorted[(sorted.length - 1) / 2] : Math.round((sorted[sorted.length / 2 - 1] + sorted[sorted.length / 2]) / 2)) : null;
    return {
      ...row,
      averageMinutes: sorted.length ? Math.round(sorted.reduce((a, b) => a + b, 0) / sorted.length) : null,
      medianMinutes: median,
      within15Minutes: sorted.filter((m) => m <= 15).length,
    };
  });
};

module.exports = {
  TOUCH_CHANNELS, TOUCH_SOURCES, TouchError, minutesBetween, touchState, formatTouchTime,
  recordTouch, toTouchView, touchFilterClauses, summarizeTouches,
};
