import { api } from "./client";

/* BillStack customer sync and invoice hand-off (web: components/billing/BillstackSection). */
export type BillingEntity = "lead" | "coworking-client";
export type BillingState = { syncStatus: string; lastSyncedAt?: string | null; lastSyncError?: string };

const path = (type: BillingEntity, id: string) => `/billing/${encodeURIComponent(type)}/${encodeURIComponent(id)}`;

export const getBillingStatus = async (type: BillingEntity, id: string) => (await api.get<BillingState>(path(type, id))).data;
/* Answers 202 while the sync is still pending. */
export const retryBillingSync = async (type: BillingEntity, id: string) => (await api.post<BillingState>(`${path(type, id)}/sync`, {}, { timeout: 30000 })).data;
/* A one-time BillStack URL that opens an invoice for this customer. */
export const createBillingHandoff = async (type: BillingEntity, id: string) =>
  (await api.post<{ handoffUrl: string }>(`${path(type, id)}/handoff`, {}, { timeout: 45000 })).data?.handoffUrl;
