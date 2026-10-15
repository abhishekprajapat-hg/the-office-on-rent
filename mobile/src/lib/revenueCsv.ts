/* The Revenue reports as CSV rows (web modules/finance/revenueReportCsv). Pure; unit tested. */

const MODEL_LABELS: Record<string, string> = { RENTAL_BROKERAGE: "Rental Brokerage", BUY_SELL: "Buy & Sell", COWORKING: "Coworking", ENTERPRISE: "Enterprise" };
export const modelLabel = (value?: string) => MODEL_LABELS[value || ""] || value || "";

export const formatCsvDate = (value?: string | null) => {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric", timeZone: "Asia/Kolkata" });
};

type Num = number | null | undefined;
type Deal = {
  dealId?: string;
  model?: string;
  property?: string;
  client?: string;
  brokerageSource?: string;
  brokerageReceived?: Num;
  brokerageDistributed?: Num;
  grossBrokerage?: Num;
  netBrokerage?: Num;
  brokerageAgreed?: Num;
  pendingBrokerage?: Num;
  brokeragePaymentStatus?: string;
  closingDate?: string | null;
  closingExecutive?: string;
};
type Payout = { dealId?: string; property?: string; client?: string; recipientName?: string; recipientType?: string; amount?: Num; paidDate?: string | null; note?: string };
type Enterprise = { property?: string; client?: string; leaseRent?: Num; clientRent?: Num; monthlyProfit?: Num; periodClientRent?: Num; periodLeaseRent?: Num; periodProfit?: Num; paymentStatus?: string };
type Summary = { rentalIncome?: Num; brokerageRevenue?: Num; totalRevenue?: Num; enterpriseLeaseCost?: Num; netRevenue?: Num; brokerageDistributed?: Num };
type Report = {
  rental?: { coworking?: { invoiced?: Num; collected?: Num; outstanding?: Num }; enterprise?: { clientRent?: Num } };
  brokerage?: { rentalBrokerage?: { brokerageReceived?: Num }; buySell?: { brokerageReceived?: Num }; pendingBrokerage?: Num };
  summary?: Summary;
  enterprise?: Enterprise[];
};

export const brokerageReportRows = (deals: Deal[] = []) => [
  ["Deal ID", "Model", "Property", "Client", "Brokerage Source", "Brokerage Received", "Brokerage Distributed", "Gross Brokerage", "Net Brokerage Counted in Revenue", "Agreed Brokerage", "Pending Brokerage", "Brokerage Status", "Closing Date", "Closing Executive"],
  ...deals.map((d) => [
    d.dealId,
    modelLabel(d.model),
    d.property,
    d.client,
    d.brokerageSource,
    d.brokerageReceived,
    d.brokerageDistributed,
    d.grossBrokerage,
    d.netBrokerage,
    d.brokerageAgreed ?? "",
    d.pendingBrokerage,
    d.brokeragePaymentStatus,
    formatCsvDate(d.closingDate),
    d.closingExecutive,
  ]),
];

export const payoutReportRows = (payouts: Payout[] = []) => [
  ["Deal ID", "Property", "Client", "Paid To", "Recipient Type", "Amount", "Paid Date", "Note"],
  ...payouts.map((p) => [p.dealId, p.property, p.client, p.recipientName, p.recipientType, p.amount, formatCsvDate(p.paidDate), p.note]),
];

export const rentalReportRows = (report?: Report) => [
  ["Stream", "Property", "Client", "Lease Rent / month", "Client Rent / month", "Monthly Profit", "Client Rent (period)", "Lease Rent (period)", "Profit (period)", "Payment Status"],
  ["Coworking", "All coworking centres", "", "", "", "", report?.rental?.coworking?.collected ?? 0, "", "", `Invoiced ${report?.rental?.coworking?.invoiced ?? 0}; outstanding ${report?.rental?.coworking?.outstanding ?? 0}`],
  ...(report?.enterprise || []).map((e) => ["Enterprise", e.property, e.client, e.leaseRent, e.clientRent, e.monthlyProfit, e.periodClientRent, e.periodLeaseRent, e.periodProfit, e.paymentStatus]),
];

export const summaryReportRows = (report?: Report) => {
  const s = report?.summary || {};
  const b = report?.brokerage || {};
  return [
    ["Line", "Amount"],
    ["Coworking rent collected", report?.rental?.coworking?.collected ?? 0],
    ["Enterprise client rent", report?.rental?.enterprise?.clientRent ?? 0],
    ["Rental income", s.rentalIncome ?? 0],
    ["Rental Brokerage received", b.rentalBrokerage?.brokerageReceived ?? 0],
    ["Buy & Sell brokerage received", b.buySell?.brokerageReceived ?? 0],
    ["Brokerage revenue", s.brokerageRevenue ?? 0],
    ["Total revenue", s.totalRevenue ?? 0],
    ["Less: Enterprise lease rent", s.enterpriseLeaseCost ?? 0],
    ["Net revenue", s.netRevenue ?? 0],
    ["Brokerage distributed to other parties (not revenue)", s.brokerageDistributed ?? 0],
    ["Brokerage still pending", b.pendingBrokerage ?? 0],
  ];
};

/* Indian financial year so far: 1 April to today (web rangeForPreset THIS_FY). */
export const financialYearStart = (today = new Date()) => `${today.getMonth() >= 3 ? today.getFullYear() : today.getFullYear() - 1}-04-01`;
