import type { Tone } from "../theme/tokens";

/*
 * The lead pipeline, mirroring backend/src/models/Lead.js and the web's
 * components/crm/statusStyles.js + leadStatusSteps.js. Pure data, unit tested.
 */

type StatusMeta = { label: string; tone: Tone };

export const LEAD_STATUS: Record<string, StatusMeta> = {
  NEW: { label: "New", tone: "primary" },
  CONTACTED: { label: "Contacted", tone: "primary" },
  FOLLOW_UP_1: { label: "Follow-Up 1", tone: "violet" },
  FOLLOW_UP_2: { label: "Follow-Up 2", tone: "violet" },
  FOLLOW_UP_3: { label: "Follow-Up 3", tone: "violet" },
  QUALIFIED_LEAD: { label: "Qualified Lead", tone: "warning" },
  INTERESTED: { label: "Interested", tone: "warning" },
  REQUESTED: { label: "Requested", tone: "warning" },
  SITE_VISIT_SCHEDULED: { label: "Visit Scheduled", tone: "primary" },
  SITE_VISIT: { label: "Site Visit", tone: "primary" },
  SITE_VISIT_OVERDUE: { label: "Visit Overdue", tone: "danger" },
  MISSING_IN_ACTION: { label: "Missing In Action", tone: "danger" },
  NPC_1: { label: "NPC 1", tone: "danger" },
  NPC_2: { label: "NPC 2", tone: "danger" },
  NPC_3: { label: "NPC 3", tone: "danger" },
  CLOSED: { label: "Closed", tone: "success" },
  LOST: { label: "Lost", tone: "neutral" },
  INVALID: { label: "Invalid", tone: "neutral" },
  OWNER: { label: "Owner", tone: "neutral" },
  BROKER: { label: "Broker", tone: "neutral" },
};

/* Retired 12 Oct 2026; older data or an older client may still send them. */
const LEGACY: Record<string, string> = {
  NOT_PICKING_CALLS: "NPC_1",
  REQUIREMENT_AFTER_1_MONTH: "FOLLOW_UP_1",
  REQUIREMENT_AFTER_2_MONTH: "FOLLOW_UP_1",
  REQUIREMENT_AFTER_2_MONTHS: "FOLLOW_UP_1",
};

export const normalizeStatus = (status?: string) => {
  const key = String(status || "").trim().toUpperCase().replace(/[\s-]+/g, "_");
  return LEGACY[key] || key || "NEW";
};

export const statusMeta = (status?: string): StatusMeta => {
  const key = normalizeStatus(status);
  return LEAD_STATUS[key] || { label: key.replace(/_/g, " ").toLowerCase().replace(/^\w/, (c) => c.toUpperCase()), tone: "neutral" };
};

/* The order statuses are offered in when updating a lead. */
export const STATUS_OPTIONS = Object.keys(LEAD_STATUS);

/* Five stages of forward motion, as the web's status stepper shows them. */
export const LEAD_STAGES = [
  { key: "NEW", label: "New" },
  { key: "CONTACTED", label: "Contacted" },
  { key: "INTERESTED", label: "Interested" },
  { key: "SITE_VISIT", label: "Visit" },
  { key: "CLOSED", label: "Closed" },
] as const;

export type StageKey = (typeof LEAD_STAGES)[number]["key"];

/* A status's stage, or null for the ones off the forward path (lost, invalid, owner, broker). */
export const statusStage = (status?: string): StageKey | null => {
  switch (normalizeStatus(status)) {
    case "NEW":
      return "NEW";
    case "CONTACTED":
    case "FOLLOW_UP_1":
    case "FOLLOW_UP_2":
    case "FOLLOW_UP_3":
      return "CONTACTED";
    case "INTERESTED":
    case "QUALIFIED_LEAD":
    case "REQUESTED":
      return "INTERESTED";
    case "SITE_VISIT_SCHEDULED":
    case "SITE_VISIT":
    case "SITE_VISIT_OVERDUE":
    case "MISSING_IN_ACTION":
    case "NPC_1":
    case "NPC_2":
    case "NPC_3":
      return "SITE_VISIT";
    case "CLOSED":
      return "CLOSED";
    default:
      return null;
  }
};

/* Rolls the summary's per-status counts up into the five stages. */
export const countByStage = (byStatus: Record<string, number> = {}) => {
  const totals: Record<StageKey, number> = { NEW: 0, CONTACTED: 0, INTERESTED: 0, SITE_VISIT: 0, CLOSED: 0 };
  Object.entries(byStatus).forEach(([status, count]) => {
    const stage = statusStage(status);
    if (stage) totals[stage] += Number(count) || 0;
  });
  return totals;
};

/* Statuses where a next follow-up date is the natural next step. */
export const suggestsFollowUp = (status?: string) => {
  const key = normalizeStatus(status);
  return !["CLOSED", "LOST", "INVALID", "OWNER", "BROKER"].includes(key);
};

export const TEMPERATURE: Record<string, { label: string; tone: Tone }> = {
  HOT: { label: "Hot", tone: "danger" },
  WARM: { label: "Warm", tone: "warning" },
  COLD: { label: "Cold", tone: "primary" },
};

/* "" predates the field: read it as HOT when the old hotClient flag is set. */
export const leadTemperature = (lead: { temperature?: string; hotClient?: boolean }) =>
  lead.temperature || (lead.hotClient ? "HOT" : "");
