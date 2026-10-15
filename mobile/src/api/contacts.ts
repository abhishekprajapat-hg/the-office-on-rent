import { api } from "./client";

export type ContactKind = "OWNER" | "BROKER";

export type CrmContact = {
  _id: string;
  kind: ContactKind;
  name: string;
  phone: string;
  email?: string;
  notes?: string;
  propertyDetails?: string;
  company?: string;
  city?: string;
  leadIds?: string[];
  inventoryIds?: string[];
  blockedLeadCount?: number;
  createdAt?: string;
};

export type BlockedLead = { name?: string; phone?: string; origin?: "MANUAL" | "META" | "BULK"; at?: string };

/* GET /contacts?kind=OWNER|BROKER - 50 a page, sorted by name. */
export const listContacts = async (kind: ContactKind, search = "", page = 1) => {
  const res = await api.get<{ contacts: CrmContact[]; total: number; page: number }>("/contacts", {
    params: { kind, page, ...(search.trim() ? { search: search.trim() } : {}) },
  });
  return { contacts: res.data?.contacts || [], total: res.data?.total ?? 0 };
};

/* POST /contacts - creates, or updates the contact with the same kind + phone. */
export const saveContact = async (payload: Omit<CrmContact, "_id" | "leadIds" | "inventoryIds" | "blockedLeadCount" | "createdAt">) => {
  const res = await api.post<CrmContact>("/contacts", payload);
  return res.data;
};

/* DELETE /contacts/:id - admins delete; a manager's delete goes to an admin for approval. */
export const deleteContact = async (id: string) => {
  const res = await api.delete<{ approvalRequired?: boolean; message?: string }>(`/contacts/${id}`);
  return res.data || {};
};

/* The leads this broker's number was refused on (brokers gate lead intake). */
export const getBlockedLeads = async (id: string) => {
  const res = await api.get<{ blockedLeads: BlockedLead[] }>(`/contacts/${id}/blocked-leads`);
  return res.data?.blockedLeads || [];
};

export type ContactImportResult = { createdCount: number; updatedCount: number; failedCount: number; failures: { row: number; message: string }[] };

/* POST /contacts/bulk - up to 5,000 rows; rows are keyed by phone, so re-uploading a corrected sheet updates. */
export const importContacts = async (kind: ContactKind, rows: Record<string, string>[]) => {
  const res = await api.post<ContactImportResult>("/contacts/bulk", { kind, rows }, { timeout: 120000 });
  return res.data;
};

/* GET /contacts/identify?phone - whether a number is in the Broker Database (brokers can't be saved as leads). */
export const identifyPhone = async (phone: string) => {
  const res = await api.get<{ isBroker: boolean; contactId: string | null; name: string }>("/contacts/identify", { params: { phone } });
  return res.data;
};
