/*
 * The web's Intelligence Reports, computed the same way from the same leads
 * (modules/reports/IntelligenceReports.jsx). Pure; unit testable.
 */

export type ReportLead = {
  status?: string;
  source?: string;
  sourceChannel?: string;
  createdAt?: string;
  updatedAt?: string;
  lastContactedAt?: string | null;
  brokerageReceived?: number | null;
  assignedTo?: { _id: string; name: string } | null;
  assignedExecutive?: { _id: string; name: string } | null;
  createdBy?: { _id: string; name: string } | null;
};

export const SITE_VISIT_STATUSES = new Set(["SITE_VISIT", "SITE_VISIT_SCHEDULED", "SITE_VISIT_OVERDUE"]);
export const LOST_REASON_LABELS: Record<string, string> = {
  NPC_1: "NPC 1",
  NPC_2: "NPC 2",
  NPC_3: "NPC 3",
  MISSING_IN_ACTION: "Missing in action",
  SITE_VISIT_OVERDUE: "Visit no-show",
  INVALID: "Invalid number",
  LOST: "Lost",
};

/* Furthest stage a status has reached, for the funnel: 0 lead, 1 contacted, 2 interested, 3 site visit, 4 closed. */
const STAGE: Record<string, number> = {
  NEW: 0,
  CONTACTED: 1,
  FOLLOW_UP_1: 1,
  FOLLOW_UP_2: 1,
  FOLLOW_UP_3: 1,
  NPC_1: 1,
  NPC_2: 1,
  NPC_3: 1,
  QUALIFIED_LEAD: 2,
  INTERESTED: 2,
  REQUESTED: 2,
  SITE_VISIT_SCHEDULED: 3,
  SITE_VISIT: 3,
  SITE_VISIT_OVERDUE: 3,
  CLOSED: 4,
};

export type RangeKey = "WEEK" | "MONTH" | "QUARTER";

/* [from, to] for this week/month/quarter; offset -1 gives the one before. */
export const rangeBounds = (key: RangeKey, offset = 0, now = new Date()) => {
  if (key === "WEEK") {
    const start = new Date(now);
    start.setHours(0, 0, 0, 0);
    start.setDate(start.getDate() - ((start.getDay() + 6) % 7) + offset * 7);
    const end = new Date(start);
    end.setDate(end.getDate() + 6);
    end.setHours(23, 59, 59, 999);
    return { from: start, to: end };
  }
  const span = key === "MONTH" ? 1 : 3;
  const firstMonth = key === "MONTH" ? now.getMonth() : Math.floor(now.getMonth() / 3) * 3;
  const from = new Date(now.getFullYear(), firstMonth + offset * span, 1);
  const to = new Date(now.getFullYear(), firstMonth + offset * span + span, 0, 23, 59, 59, 999);
  return { from, to };
};

const upper = (value?: string) => String(value || "").toUpperCase();
const inRange = (value: string | undefined, bounds: { from: Date; to: Date }) => {
  const time = value ? new Date(value).getTime() : NaN;
  return Number.isFinite(time) && time >= bounds.from.getTime() && time <= bounds.to.getTime();
};

export const sourceLabel = (lead: ReportLead) => {
  if (lead.sourceChannel) return lead.sourceChannel;
  const source = upper(lead.source);
  return source === "META" ? "Meta ads" : source === "MANUAL" ? "Manual entry" : source ? source.charAt(0) + source.slice(1).toLowerCase() : "Other";
};

export const buildReport = (all: ReportLead[], key: RangeKey, now = new Date()) => {
  const current = rangeBounds(key, 0, now);
  const previous = rangeBounds(key, -1, now);
  const leads = all.filter((lead) => inRange(lead.createdAt, current));
  const before = all.filter((lead) => inRange(lead.createdAt, previous));

  const summarize = (rows: ReportLead[]) => {
    const closed = rows.filter((lead) => upper(lead.status) === "CLOSED");
    const ages = closed
      .map((lead) => (new Date(lead.updatedAt || lead.createdAt || 0).getTime() - new Date(lead.createdAt || 0).getTime()) / 86400000)
      .filter((days) => Number.isFinite(days) && days >= 0);
    const responses = rows
      .filter((lead) => lead.lastContactedAt && lead.createdAt)
      .map((lead) => (new Date(lead.lastContactedAt!).getTime() - new Date(lead.createdAt!).getTime()) / 60000)
      .filter((minutes) => Number.isFinite(minutes) && minutes >= 0)
      .sort((a, b) => a - b);
    const revenue = closed.reduce((sum, lead) => sum + (Number(lead.brokerageReceived) > 0 ? Number(lead.brokerageReceived) : 0), 0);
    return {
      received: rows.length,
      closed: closed.length,
      visits: rows.filter((lead) => SITE_VISIT_STATUSES.has(upper(lead.status))).length,
      lost: rows.filter((lead) => LOST_REASON_LABELS[upper(lead.status)]).length,
      conversion: rows.length ? (closed.length / rows.length) * 100 : 0,
      avgDaysToClose: ages.length ? ages.reduce((sum, days) => sum + days, 0) / ages.length : 0,
      medianResponseMinutes: responses.length ? responses[Math.floor(responses.length / 2)]! : null,
      revenue,
      avgDeal: closed.length ? revenue / closed.length : 0,
    };
  };

  const funnelCounts = [0, 1, 2, 3, 4].map((stage) => leads.filter((lead) => (STAGE[upper(lead.status)] ?? 0) >= stage).length);
  const funnel = ["Leads", "Contacted", "Interested", "Site visit", "Closed"].map((label, index) => ({ label, value: funnelCounts[index]! }));

  const sources = new Map<string, number>();
  leads.forEach((lead) => sources.set(sourceLabel(lead), (sources.get(sourceLabel(lead)) || 0) + 1));
  const sourceRows = [...sources.entries()].sort((a, b) => b[1] - a[1]);
  const top = sourceRows.slice(0, 4);
  const rest = sourceRows.slice(4).reduce((sum, [, count]) => sum + count, 0);
  const sourceMix = [...top, ...(rest ? ([["Other", rest]] as [string, number][]) : [])].map(([label, count]) => ({
    label,
    count,
    share: leads.length ? Math.round((count / leads.length) * 100) : 0,
  }));

  const people = new Map<string, { key: string; name: string; leads: number; visits: number; closed: number }>();
  leads.forEach((lead) => {
    const who = lead.assignedTo || lead.assignedExecutive || lead.createdBy;
    const keyOf = String(who?._id || "unassigned");
    const row = people.get(keyOf) || { key: keyOf, name: who?.name || "Unassigned", leads: 0, visits: 0, closed: 0 };
    row.leads += 1;
    if (SITE_VISIT_STATUSES.has(upper(lead.status))) row.visits += 1;
    if (upper(lead.status) === "CLOSED") row.closed += 1;
    people.set(keyOf, row);
  });
  const executives = [...people.values()]
    .map((row) => ({ ...row, conversion: row.leads ? (row.closed / row.leads) * 100 : 0 }))
    .sort((a, b) => b.closed - a.closed || b.visits - a.visits || b.leads - a.leads)
    .slice(0, 5);

  const lost = new Map<string, number>();
  leads.forEach((lead) => {
    const label = LOST_REASON_LABELS[upper(lead.status)];
    if (label) lost.set(label, (lost.get(label) || 0) + 1);
  });
  const lostReasons = [...lost.entries()].map(([label, count]) => ({ label, count })).sort((a, b) => b.count - a.count).slice(0, 5);

  return { bounds: current, summary: summarize(leads), previous: summarize(before), funnel, sourceMix, executives, lostReasons };
};

/* "▲ 18%" / "▼ 12 min" style change against the previous period. */
export const delta = (current: number, previous: number, inverse = false) => {
  if (!Number.isFinite(previous) || previous <= 0) return { text: "No previous data", good: null as boolean | null };
  const change = ((current - previous) / previous) * 100;
  return { text: `${change >= 0 ? "▲" : "▼"} ${Math.abs(Math.round(change))}%`, good: inverse ? change <= 0 : change >= 0 };
};
