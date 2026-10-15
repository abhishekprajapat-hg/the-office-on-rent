import { api } from "./client";
import type { Lead } from "./types";

export type FinanceSummary = {
  month: string;
  income: number;
  expenses: number;
  net: number;
  collected: number;
  receivables: number;
  receivablesCount: number;
  payables: number;
  payablesCount: number;
  overdue: number;
  overdueCount: number;
};

export type FinanceSeriesPoint = { month: string; income: number; expenses: number };

export type Transaction = {
  id: string;
  kind: "INCOME" | "EXPENSE";
  source: "PAYMENT" | "EXPENSE";
  code: string;
  title: string;
  party: string;
  category: string;
  amount: number;
  method: string;
  status: "PAID" | "PENDING" | "CANCELLED";
  date: string;
  reference: string;
  invoiceNumber: string;
  notes: string;
};

export type Invoice = {
  _id: string;
  invoiceNumber?: string;
  clientId?: { _id: string; name?: string; companyName?: string } | null;
  totalAmount?: number;
  amountPaid?: number;
  status?: "DRAFT" | "PENDING" | "PARTIALLY_PAID" | "PAID" | "OVERDUE" | "CANCELLED" | string;
  dueDate?: string;
  issueDate?: string;
  createdAt?: string;
};

export const PAYMENT_METHODS = [
  { key: "UPI", label: "UPI", icon: "phone-portrait-outline" },
  { key: "BANK_TRANSFER", label: "NEFT", icon: "swap-horizontal-outline" },
  { key: "CHEQUE", label: "Cheque", icon: "document-outline" },
  { key: "CASH", label: "Cash", icon: "cash-outline" },
  { key: "CARD", label: "Card", icon: "card-outline" },
  { key: "OTHER", label: "Other", icon: "ellipsis-horizontal-circle-outline" },
] as const;

export const EXPENSE_CATEGORIES = ["RENT", "UTILITIES", "MAINTENANCE", "SALARY", "MARKETING", "SUPPLIES", "REPAIRS", "OTHER"] as const;
export const INCOME_CATEGORIES = ["SECURITY_DEPOSIT", "RENT", "TOKEN", "BROKERAGE", "MAINTENANCE", "OTHER"] as const;

/* GET /finance/overview - this month's money plus a six-month series. Admins, managers, and anyone with the Finance page. */
export const getFinanceOverview = async (month?: string) => {
  const res = await api.get<{ summary: FinanceSummary; series: FinanceSeriesPoint[] }>("/finance/overview", { params: month ? { month, months: 6 } : { months: 6 } });
  return res.data;
};

export const listTransactions = async (params: { type?: "ALL" | "INCOME" | "EXPENSE"; month?: string; q?: string; limit?: number } = {}) => {
  const res = await api.get<{ transactions: Transaction[]; totals: { in: number; out: number; net: number }; count: number }>("/finance/transactions", {
    params: { limit: 100, ...params },
  });
  return res.data;
};

export const listInvoices = async (params: { status?: string; page?: number; limit?: number } = {}) => {
  const res = await api.get<{ invoices: Invoice[] }>("/finance/invoices", { params: { page: 1, limit: 50, ...params } });
  return res.data?.invoices || [];
};

export type EntryPayload = {
  kind: "INCOME" | "EXPENSE";
  amount: number;
  method: string;
  category?: string;
  title?: string;
  party?: string;
  reference?: string;
  notes?: string;
  date?: string;
  status?: "PAID" | "PENDING";
  leadId?: string;
  inventoryId?: string;
  receipts?: { name?: string; fileUrl: string; fileType?: string }[];
};

/* POST /finance/entries - income becomes a ledger payment, expense an expense. */
export const createEntry = async (payload: EntryPayload) => {
  const res = await api.post<{ kind: string; entry: Record<string, unknown> }>("/finance/entries", payload);
  return res.data;
};

/* Closed leads with their deal-payment record - the executive's side of Finance (web: FinancialCore). */
export const listDealPayments = async () => {
  const res = await api.get<{ leads: (Lead & { dealPayment?: Record<string, any>; brokerageReceived?: number | null; closureDocuments?: { url: string; name?: string }[] })[] }>("/leads", {
    params: { page: 1, limit: 100, status: "CLOSED", fields: "_id,name,phone,status,projectInterested,dealPayment,brokerageReceived,brokerageAgreed,closureDocuments,assignedTo,updatedAt" },
  });
  return res.data?.leads || [];
};

/* ---------------------------------------------------------------- revenue -- */
/* Web: modules/finance/RevenueCenter. Rental income (coworking + enterprise) and brokerage, kept apart. */

type DealSummary = { count: number; grossBrokerage: number; brokerageReceived: number; brokerageDistributed: number; netBrokerage: number; pendingBrokerage: number };

export type RevenueDeal = {
  leadId: string;
  dealId: string;
  model: "RENTAL_BROKERAGE" | "BUY_SELL" | string;
  property: string;
  client: string;
  brokerageReceived: number;
  brokerageDistributed: number;
  grossBrokerage: number;
  pendingBrokerage: number;
  brokeragePaymentStatus: "RECEIVED" | "PARTIAL" | "PENDING" | string;
  closingDate: string | null;
  closingExecutive: string;
};

export type RevenuePayout = { dealId: string; leadId: string; client: string; property: string; recipientName: string; recipientType: string; amount: number; paidDate: string | null };

export type EnterpriseRow = { inventoryId: string; property: string; client: string; leaseRent: number; clientRent: number; monthlyProfit: number; periodProfit: number; paymentStatus: string };

export type RevenueReport = {
  range: { from: string; to: string; months: number };
  rental: {
    total: number;
    coworking: { invoiced: number; collected: number; outstanding: number };
    enterprise: { count: number; clientRent: number; leaseRent: number; profit: number; monthlyProfit: number };
  };
  brokerage: DealSummary & { rentalBrokerage: DealSummary; buySell: DealSummary };
  summary: { rentalIncome: number; brokerageRevenue: number; totalRevenue: number; enterpriseLeaseCost: number; netRevenue: number; brokerageDistributed: number };
  deals: RevenueDeal[];
  payouts: RevenuePayout[];
  enterprise: EnterpriseRow[];
};

/* GET /finance/revenue?from&to (YYYY-MM-DD, IST; defaults to this month so far). */
export const getRevenueReport = async (params: { from?: string; to?: string } = {}) => {
  const res = await api.get<RevenueReport>("/finance/revenue", { params });
  return res.data;
};
