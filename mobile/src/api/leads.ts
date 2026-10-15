import { api } from "./client";
import type { Lead, LeadSummary, Pagination } from "./types";

/* What a list row needs. Keeps payloads small: a full lead carries requirements, payments, documents. */
const LIST_FIELDS = [
  "name",
  "phone",
  "email",
  "city",
  "company",
  "projectInterested",
  "status",
  "source",
  "sourceChannel",
  "temperature",
  "hotClient",
  "nextFollowUp",
  "assignedTo",
  "assignedExecutive",
  "createdAt",
  "updatedAt",
].join(",");

export type LeadListParams = {
  page?: number;
  limit?: number;
  search?: string;
  status?: string;
  followUpDueOnly?: boolean;
  /* Advanced filters, already shaped as query params (see lib/leadFilters). */
  extra?: Record<string, string>;
};

export const listLeads = async ({ page = 1, limit = 25, search, status, followUpDueOnly, extra }: LeadListParams) => {
  const res = await api.get<{ leads: Lead[]; pagination: Pagination }>("/leads", {
    params: {
      page,
      limit,
      fields: LIST_FIELDS,
      ...(search?.trim() ? { search: search.trim() } : {}),
      ...(status && status !== "ALL" ? { status } : {}),
      ...(followUpDueOnly ? { followUpDueOnly: "true" } : {}),
      ...(extra || {}),
    },
  });
  return { leads: res.data?.leads || [], pagination: res.data?.pagination };
};

export const getLeadSummary = async () => {
  const res = await api.get<{ summary: LeadSummary }>("/leads/summary", {
    params: { tzOffsetMinutes: -new Date().getTimezoneOffset() },
  });
  return res.data?.summary || null;
};

/* How many leads match (reads the pagination total, fetching a single row). */
export const countLeads = async (params: Record<string, string>) => {
  const res = await api.get<{ leads: Lead[]; pagination?: Pagination & { totalCount?: number; total?: number } }>("/leads", { params: { page: 1, limit: 1, fields: "_id", ...params } });
  const p = res.data?.pagination as { totalCount?: number; total?: number } | undefined;
  return Number(p?.totalCount ?? p?.total ?? res.data?.leads?.length ?? 0);
};

export const getTodayFollowUps = async (limit = 5) => {
  const res = await api.get<{ leads: Lead[] }>("/leads/followups/today", { params: { limit, fields: LIST_FIELDS } });
  return res.data?.leads || [];
};

/* Leads whose next follow-up falls in [from, to], for the schedule. */
export const listFollowUpsBetween = async (from: Date, to: Date) => {
  const res = await api.get<{ leads: Lead[] }>("/leads", {
    // dealPayment tells a part-paid closed deal (whose follow-up is collecting the rest) from the others.
    params: { page: 1, limit: 200, fields: `${LIST_FIELDS},dealPayment`, followUpFrom: from.toISOString(), followUpTo: to.toISOString(), sortBy: "nextFollowUp" },
  });
  return res.data?.leads || [];
};

/* Marks the current follow-up done and clears it. */
export const completeFollowUp = async (leadId: string) => {
  const res = await api.patch<{ lead: Lead }>(`/leads/${leadId}/follow-up/complete`);
  return res.data?.lead || null;
};

export const getLead = async (leadId: string) => {
  const res = await api.get<{ lead: Lead }>(`/leads/${leadId}`);
  return res.data?.lead || null;
};

export type NewLead = {
  name: string;
  phone: string;
  email?: string;
  city?: string;
  company?: string;
  projectInterested?: string;
  sourceChannel?: string;
  temperature?: string;
};

export const createLead = async (payload: NewLead) => {
  const res = await api.post<{ lead: Lead }>("/leads", { ...payload, source: "MANUAL" });
  return res.data?.lead || null;
};

export const updateLeadStatus = async (
  leadId: string,
  payload: { status: string; nextFollowUp?: string | null; followUpPurpose?: string; remark?: string },
) => {
  const res = await api.patch<{ lead: Lead }>(`/leads/${leadId}/status`, payload);
  return res.data?.lead || null;
};

export type LeadActivity = {
  _id: string;
  action: string;
  createdAt?: string;
  performedBy?: { name?: string; role?: string } | null;
};

export const getLeadActivity = async (leadId: string, limit = 20) => {
  const res = await api.get<{ activities: LeadActivity[] }>(`/leads/${leadId}/activity`, { params: { limit, page: 1 } });
  return res.data?.activities || [];
};

/* A free-text note in the lead's diary - what web calls a remark. */
export const addLeadNote = async (leadId: string, note: string) => {
  const res = await api.post(`/leads/${leadId}/diary`, { note: note.trim() });
  return res.data;
};

/* ---------------------------------------------------------------- depth -- */

export type LeadRequirements = {
  inventoryType?: "COMMERCIAL" | "RESIDENTIAL" | "COWORKING" | "";
  transactionType?: "SALE" | "LEASE" | "RENT" | "";
  furnishingStatus?: string;
  propertySubtype?: string;
  budgetMin?: number | null;
  budgetMax?: number | null;
  areaMin?: number | null;
  areaMax?: number | null;
  areaUnit?: "SQ_FT" | "SQ_M" | "";
  commercial?: Record<string, number | boolean | null>;
  residential?: { bhkType?: string; floor?: number | null; amenities?: Record<string, boolean> };
  coworking?: { workstations?: number | null; agreedRent?: number | null; lockInMonths?: number | null; noticePeriodMonths?: number | null; depositMonths?: number | null };
};

export type AssignmentEntry = {
  _id: string;
  action?: string;
  fromUser?: { _id: string; name: string } | null;
  toUser?: { _id: string; name: string } | null;
  createdBy?: { _id: string; name: string } | null;
  reason?: string;
  statusAtTransfer?: string;
  createdAt?: string;
};

export type LeadDetail = Lead & {
  preferredLocations?: string[];
  clientProfession?: string;
  requirements?: LeadRequirements;
  relatedInventoryIds?: Array<string | { _id: string }>;
  inventoryId?: string | { _id: string } | null;
  assignmentHistory?: AssignmentEntry[];
  siteLocation?: { lat: number | null; lng: number | null } | null;
  dealPayment?: { mode?: string | null; paymentType?: string | null; remainingAmount?: number | null; paymentReference?: string; note?: string; approvalStatus?: string; approvalNote?: string } | null;
  closureDocuments?: ClosureDocument[];
  brokerageReceived?: number | null;
  brokerageAgreed?: number | null;
  brokerageDistributed?: number | null;
  brokerageSource?: string;
};

export type ClosureDocument = { url: string; kind: "image" | "pdf" | "file"; mimeType?: string; name?: string; size?: number };

export const getLeadDetail = async (leadId: string) => {
  const res = await api.get<{ lead: LeadDetail }>(`/leads/${leadId}`);
  return res.data?.lead || null;
};

export type LeadBasics = {
  name?: string;
  phone?: string;
  email?: string;
  city?: string;
  company?: string;
  projectInterested?: string;
  clientProfession?: string;
  preferredLocations?: string[];
  sourceChannel?: string;
};

export const updateLeadBasics = async (leadId: string, payload: LeadBasics) => {
  const res = await api.patch<{ lead: LeadDetail }>(`/leads/${leadId}`, payload);
  return res.data?.lead || null;
};

/* Requirements, temperature and deal fields ride on the status endpoint with the status unchanged, as web does. */
export const updateLeadDetails = async (leadId: string, status: string, payload: Record<string, unknown>) => {
  const res = await api.patch<{ lead: LeadDetail }>(`/leads/${leadId}/status`, { status, ...payload });
  return res.data?.lead || null;
};

export const assignLead = async (leadId: string, assignedTo: string, reason?: string) => {
  const res = await api.patch<{ lead: LeadDetail }>(`/leads/${leadId}/assign`, { assignedTo, reason: reason?.trim() || undefined });
  return res.data?.lead || null;
};

export const linkProperty = async (leadId: string, inventoryId: string) => {
  const res = await api.patch<{ lead: LeadDetail }>(`/leads/${leadId}/properties`, { inventoryId });
  return res.data?.lead || null;
};

export const selectLinkedProperty = async (leadId: string, inventoryId: string) => {
  const res = await api.patch<{ lead: LeadDetail }>(`/leads/${leadId}/properties/${inventoryId}/select`);
  return res.data?.lead || null;
};

export const unlinkProperty = async (leadId: string, inventoryId: string) => {
  const res = await api.delete<{ lead: LeadDetail }>(`/leads/${leadId}/properties/${inventoryId}`);
  return res.data?.lead || null;
};

export type DiaryEntry = {
  _id: string;
  note: string;
  createdAt: string;
  createdBy?: { _id: string; name: string; role?: string } | null;
  author?: { _id: string; name: string } | null;
};

export const getDiary = async (leadId: string) => {
  const res = await api.get<{ entries: DiaryEntry[] }>(`/leads/${leadId}/diary`, { params: { limit: 50 } });
  return res.data?.entries || [];
};

/*
 * Admin deletes outright; a manager's delete becomes a request an admin
 * approves (202 { approvalRequired }).
 */
export const deleteLead = async (leadId: string) => {
  const res = await api.delete<{ approvalRequired?: boolean; message?: string }>(`/leads/${leadId}`);
  return { pendingApproval: res.status === 202 || Boolean(res.data?.approvalRequired), message: res.data?.message || "" };
};

/*
 * Every lead the caller can see, 200 at a time (at most 25 pages), with the
 * fields reports need. Mirrors the web's getAllLeads.
 */
export const listAllLeadsForReports = async () => {
  const fields = "_id,status,source,sourceChannel,createdAt,updatedAt,lastContactedAt,brokerageReceived,assignedTo";
  const rows: Lead[] = [];
  for (let page = 1; page <= 25; page += 1) {
    const res = await api.get<{ leads: Lead[]; pagination?: Pagination }>("/leads", { params: { page, limit: 200, fields } });
    rows.push(...(res.data?.leads || []));
    if (!res.data?.pagination?.hasNextPage) break;
  }
  return rows;
};

export type VisitLead = Lead & { siteLocation?: { lat: number | null; lng: number | null } | null };

/* Today's site visits (scheduled or done) with their pinned locations, for Field ops. */
export const listVisitsBetween = async (from: Date, to: Date) => {
  const res = await api.get<{ leads: VisitLead[] }>("/leads", {
    params: {
      page: 1,
      limit: 100,
      fields: "_id,name,phone,status,projectInterested,city,nextFollowUp,siteLocation,assignedTo,assignedFieldExecutive,updatedAt",
      followUpFrom: from.toISOString(),
      followUpTo: to.toISOString(),
      sortBy: "nextFollowUp",
    },
  });
  return res.data?.leads || [];
};
