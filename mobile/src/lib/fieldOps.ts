/*
 * The manager's field operations picture (web modules/field/FieldOps
 * `dashboard`): who is in the field, their load, today's visits, overdue
 * follow-ups and the unassigned queue. Pure; unit tested.
 */

type Person = { _id: string; name: string; role?: string; isActive?: boolean; phone?: string; liveLocation?: { lat?: number | null; lng?: number | null; updatedAt?: string | null } | null; isLocationFresh?: boolean };
export type FieldLead = {
  _id: string;
  name: string;
  phone?: string;
  status?: string;
  city?: string;
  projectInterested?: string;
  nextFollowUp?: string | null;
  createdAt?: string;
  siteLocation?: { lat?: number | null; lng?: number | null } | null;
  assignedTo?: { _id: string; name?: string; role?: string } | null;
  assignedFieldExecutive?: { _id: string; name?: string } | null;
};

export const ACTIVE_STATUSES = new Set(["NEW", "CONTACTED", "INTERESTED", "SITE_VISIT", "REQUESTED"]);
const VISIT = "SITE_VISIT";

const dateOf = (value?: string | null) => {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
};
const sameDay = (a: Date, b: Date) => a.toDateString() === b.toDateString();

export const validPoint = (lat: unknown, lng: unknown) => {
  const y = Number(lat);
  const x = Number(lng);
  return lat !== null && lng !== null && lat !== undefined && lng !== undefined && Number.isFinite(y) && Number.isFinite(x) && y >= -90 && y <= 90 && x >= -180 && x <= 180 && !(y === 0 && x === 0) ? { lat: y, lng: x } : null;
};

/* The field executive a lead is with: its field executive, or its owner when that is one. */
export const fieldExecutiveOf = (lead: FieldLead) => (lead.assignedFieldExecutive?._id ? lead.assignedFieldExecutive : lead.assignedTo?.role === "FIELD_EXECUTIVE" ? lead.assignedTo : null);

export const buildFieldDashboard = <P extends Person>(leads: FieldLead[], users: P[], now = new Date()) => {
  const fieldExecutives = users.filter((user) => user.role === "FIELD_EXECUTIVE" && user.isActive !== false);
  const activeLeads = leads.filter((lead) => ACTIVE_STATUSES.has(String(lead.status || "")));
  const siteVisitLeads = activeLeads.filter((lead) => lead.status === VISIT);
  const unassignedQueue = activeLeads.filter((lead) => !lead.assignedTo?._id);
  const isOverdue = (lead: FieldLead) => {
    const due = dateOf(lead.nextFollowUp);
    return Boolean(due && due < now);
  };
  const overdueFollowUps = activeLeads.filter(isOverdue);

  const byExecutive = new Map<string, FieldLead[]>();
  activeLeads.forEach((lead) => {
    const executive = fieldExecutiveOf(lead);
    if (!executive?._id) return;
    byExecutive.set(executive._id, [...(byExecutive.get(executive._id) || []), lead]);
  });
  const order = (lead: FieldLead) => (dateOf(lead.nextFollowUp) || dateOf(lead.createdAt) || new Date(0)).getTime();

  const workload = fieldExecutives
    .map((executive) => {
      const rows = [...(byExecutive.get(executive._id) || [])].sort((a, b) => order(a) - order(b));
      return {
        executive,
        activeAssigned: rows.length,
        siteVisits: rows.filter((lead) => lead.status === VISIT).length,
        overdue: rows.filter(isOverdue).length,
        todaysVisits: rows.filter((lead) => lead.status === VISIT && dateOf(lead.nextFollowUp) && sameDay(dateOf(lead.nextFollowUp)!, now)).length,
        live: validPoint(executive.liveLocation?.lat, executive.liveLocation?.lng),
        rows,
      };
    })
    .sort((a, b) => b.siteVisits - a.siteVisits || b.activeAssigned - a.activeAssigned);

  const tracked = workload.filter((row) => row.live).length;
  return {
    fieldExecutives,
    activeLeads,
    siteVisitLeads,
    unassignedQueue: [...unassignedQueue].sort((a, b) => order(a) - order(b)),
    overdueFollowUps,
    workload,
    visitsTimeline: [...siteVisitLeads].sort((a, b) => order(a) - order(b)).slice(0, 10),
    tracked,
    coveragePercent: fieldExecutives.length ? Math.round((tracked / fieldExecutives.length) * 100) : 0,
    visitShare: activeLeads.length ? Math.round((siteVisitLeads.length / activeLeads.length) * 100) : 0,
    averageLoad: fieldExecutives.length ? Math.round((workload.reduce((sum, row) => sum + row.activeAssigned, 0) / fieldExecutives.length) * 10) / 10 : 0,
  };
};

/* Google Maps driving directions, from a known point when there is one (web buildDirectionsUrl). */
export const directionsUrl = (to: { lat: number; lng: number }, from?: { lat: number; lng: number } | null) =>
  `https://www.google.com/maps/dir/?api=1&destination=${to.lat},${to.lng}&travelmode=driving${from ? `&origin=${from.lat},${from.lng}` : ""}`;
