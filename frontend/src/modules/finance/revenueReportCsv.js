// CSV builders for the Revenue Module reports. Pure, so they can be tested.

const MODEL_LABELS = {
  RENTAL_BROKERAGE: "Rental Brokerage",
  BUY_SELL: "Buy & Sell",
  COWORKING: "Coworking",
  ENTERPRISE: "Enterprise",
};

export const modelLabel = (value) => MODEL_LABELS[value] || value || "";

export const formatCsvDate = (value) => {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric", timeZone: "Asia/Kolkata" });
};

const toCsvValue = (value) => `"${String(value ?? "").replace(/"/g, '""')}"`;

export const rowsToCsv = (rows) => rows.map((row) => row.map(toCsvValue).join(",")).join("\n");

export const brokerageReportRows = (deals = []) => [
  ["Deal ID", "Model", "Property", "Client", "Brokerage Source", "Brokerage Received", "Brokerage Distributed",
    "Gross Brokerage", "Net Brokerage Counted in Revenue", "Agreed Brokerage", "Pending Brokerage",
    "Brokerage Status", "Closing Date", "Closing Executive"],
  ...deals.map((d) => [
    d.dealId, modelLabel(d.model), d.property, d.client, d.brokerageSource,
    d.brokerageReceived, d.brokerageDistributed, d.grossBrokerage, d.netBrokerage,
    d.brokerageAgreed ?? "", d.pendingBrokerage, d.brokeragePaymentStatus,
    formatCsvDate(d.closingDate), d.closingExecutive,
  ]),
];

export const payoutReportRows = (payouts = []) => [
  ["Deal ID", "Property", "Client", "Paid To", "Recipient Type", "Amount", "Paid Date", "Note"],
  ...payouts.map((p) => [p.dealId, p.property, p.client, p.recipientName, p.recipientType, p.amount, formatCsvDate(p.paidDate), p.note]),
];

export const rentalReportRows = (report) => [
  ["Stream", "Property", "Client", "Lease Rent / month", "Client Rent / month", "Monthly Profit",
    "Client Rent (period)", "Lease Rent (period)", "Profit (period)", "Payment Status"],
  ["Coworking", "All coworking centres", "", "", "", "", report?.rental?.coworking?.collected ?? 0, "", "", `Invoiced ${report?.rental?.coworking?.invoiced ?? 0}; outstanding ${report?.rental?.coworking?.outstanding ?? 0}`],
  ...(report?.enterprise || []).map((e) => ["Enterprise", e.property, e.client, e.leaseRent, e.clientRent, e.monthlyProfit,
    e.periodClientRent, e.periodLeaseRent, e.periodProfit, e.paymentStatus]),
];

export const summaryReportRows = (report) => {
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

const pad = (n) => String(n).padStart(2, "0");
const dateKey = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

// Date ranges for the Period picker, as local calendar dates.
export const rangeForPreset = (preset, today = new Date()) => {
  const end = dateKey(today);
  if (preset === "LAST_3_MONTHS") {
    return { from: dateKey(new Date(today.getFullYear(), today.getMonth() - 2, 1)), to: end };
  }
  if (preset === "THIS_FY") {
    // Indian financial year: 1 April to 31 March.
    const fyStartYear = today.getMonth() >= 3 ? today.getFullYear() : today.getFullYear() - 1;
    return { from: `${fyStartYear}-04-01`, to: end };
  }
  return { from: dateKey(new Date(today.getFullYear(), today.getMonth(), 1)), to: end };
};

