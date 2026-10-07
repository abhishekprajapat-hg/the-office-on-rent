/*
 * Revenue Module (CRM Revenue Module FRD + Brokerage Received & Distribution).
 *
 * Two streams, kept apart:
 *  - Rental income: self-owned space. Coworking (invoices and payments) and
 *    Enterprise (lease a space, sublet it: profit = client rent - lease rent).
 *  - Brokerage: third-party space. Rental Brokerage and Buy & Sell deals,
 *    i.e. closed leads. Only Brokerage Received is company revenue; what was
 *    distributed to other parties is recorded for audit. Gross (what the deal
 *    generated) = Received + Distributed.
 *
 * buildRevenueReport is pure so the arithmetic can be tested without a DB.
 */
const mongoose = require("mongoose");
const Lead = require("../models/Lead");
const Inventory = require("../models/Inventory");
const CoworkingInvoice = require("../models/CoworkingInvoice");
const CoworkingPayment = require("../models/CoworkingPayment");
const { BUSINESS_MODELS } = require("../constants/revenue.constants");
const { createHttpError } = require("../utils/httpError");

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const IST_OFFSET_MINUTES = 330;

const round2 = (value) => Math.round((Number(value) || 0) * 100) / 100;
const num = (value) => {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
};
const sum = (rows, pick) => round2(rows.reduce((total, row) => total + num(pick(row)), 0));

// Calendar dates are Indian dates: 2026-10-01 starts at 00:00 IST.
const istDayStart = (dateKey) =>
  new Date(Date.parse(`${dateKey}T00:00:00.000Z`) - IST_OFFSET_MINUTES * 60000);

const toIstDateKey = (date) =>
  new Date(date.getTime() + IST_OFFSET_MINUTES * 60000).toISOString().slice(0, 10);

const resolveRange = ({ from, to } = {}, now = new Date()) => {
  const today = toIstDateKey(now);
  const fromKey = DATE_PATTERN.test(String(from || "")) ? String(from) : `${today.slice(0, 8)}01`;
  const toKey = DATE_PATTERN.test(String(to || "")) ? String(to) : today;
  const start = istDayStart(fromKey);
  const end = new Date(istDayStart(toKey).getTime() + 24 * 3600 * 1000 - 1);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
    throw createHttpError(400, "from and to must be dates (YYYY-MM-DD)");
  }
  if (start > end) throw createHttpError(400, "from must be on or before to");
  if (end - start > 3 * 366 * 24 * 3600 * 1000) {
    throw createHttpError(400, "The report range can be at most 3 years");
  }
  return { from: fromKey, to: toKey, start, end };
};

// Calendar months the range touches; Enterprise rent is monthly.
const monthsInRange = (fromKey, toKey) => {
  const [fy, fm] = fromKey.split("-").map(Number);
  const [ty, tm] = toKey.split("-").map(Number);
  return Math.max(1, (ty - fy) * 12 + (tm - fm) + 1);
};

const shortId = (id) => String(id || "").slice(-6).toUpperCase();

const dealModelOf = (lead) => {
  const model = lead?.inventoryId?.businessModel;
  if (model === BUSINESS_MODELS.BUY_SELL || model === BUSINESS_MODELS.RENTAL_BROKERAGE) return model;
  return String(lead?.requirements?.transactionType || "").toUpperCase() === "SALE"
    ? BUSINESS_MODELS.BUY_SELL
    : BUSINESS_MODELS.RENTAL_BROKERAGE;
};

const brokeragePaymentStatusOf = ({ received, agreed }) => {
  if (agreed === null) return received > 0 ? "RECEIVED" : "PENDING";
  if (received >= agreed) return "RECEIVED";
  return received > 0 ? "PARTIAL" : "PENDING";
};

const toDealRow = (lead) => {
  const received = round2(num(lead.brokerageReceived));
  const distributed = round2(num(lead.brokerageDistributed));
  const agreedRaw = lead.brokerageAgreed;
  const agreed = agreedRaw === null || agreedRaw === undefined || agreedRaw === "" ? null : round2(num(agreedRaw));
  const inventory = lead.inventoryId && typeof lead.inventoryId === "object" ? lead.inventoryId : null;
  const closer = lead.brokerageClosedBy || lead.assignedTo || null;
  const payment = lead.dealPayment || {};
  return {
    leadId: String(lead._id || ""),
    dealId: shortId(lead._id),
    model: dealModelOf(lead),
    property: inventory
      ? [inventory.propertyId, inventory.projectName].filter(Boolean).join(" - ")
      : String(lead.projectInterested || "").trim(),
    client: String(lead.name || "").trim(),
    brokerageSource: lead.brokerageSource || "",
    brokerageReceived: received,
    brokerageDistributed: distributed,
    grossBrokerage: round2(received + distributed),
    netBrokerage: received,
    brokerageAgreed: agreed,
    pendingBrokerage: agreed === null ? 0 : round2(Math.max(0, agreed - received)),
    brokeragePaymentStatus: brokeragePaymentStatusOf({ received, agreed }),
    brokeragePaymentDate: lead.brokeragePaymentDate || null,
    dealPaymentType: payment.paymentType || "",
    dealPaymentMode: payment.mode || "",
    dealPendingAmount: payment.remainingAmount ?? null,
    closingDate: lead.brokerageClosedAt || null,
    closingExecutive: closer && typeof closer === "object" ? String(closer.name || "") : "",
    distribution: (Array.isArray(lead.brokerageDistributionBreakdown) ? lead.brokerageDistributionBreakdown : [])
      .map((row) => ({
        recipientName: row.recipientName || "",
        recipientType: row.recipientType || "",
        amount: round2(num(row.amount)),
        paidDate: row.paidDate || null,
        note: row.note || "",
      })),
  };
};

const toPayoutRows = (deals) => deals.flatMap((deal) => {
  if (deal.distribution.length) {
    return deal.distribution
      .filter((row) => row.amount > 0)
      .map((row) => ({ dealId: deal.dealId, leadId: deal.leadId, client: deal.client, property: deal.property, ...row }));
  }
  if (deal.brokerageDistributed > 0) {
    return [{
      dealId: deal.dealId,
      leadId: deal.leadId,
      client: deal.client,
      property: deal.property,
      recipientName: "",
      recipientType: "Not itemised",
      amount: deal.brokerageDistributed,
      paidDate: null,
      note: "",
    }];
  }
  return [];
});

const toEnterpriseRow = (inventory, months) => {
  const details = inventory.enterpriseDetails || {};
  const leaseRent = round2(num(details.leaseRent));
  const clientRent = round2(num(details.clientRent));
  const monthlyProfit = round2(clientRent - leaseRent);
  return {
    inventoryId: String(inventory._id || ""),
    property: [inventory.propertyId, inventory.projectName].filter(Boolean).join(" - "),
    client: details.clientName || "",
    leaseRent,
    clientRent,
    monthlyProfit,
    periodClientRent: round2(clientRent * months),
    periodLeaseRent: round2(leaseRent * months),
    periodProfit: round2(monthlyProfit * months),
    rentDueDay: details.rentDueDay ?? null,
    paymentStatus: details.paymentStatus || "",
    lastPaymentDate: details.lastPaymentDate || null,
  };
};

const summariseDeals = (deals) => ({
  count: deals.length,
  grossBrokerage: sum(deals, (d) => d.grossBrokerage),
  brokerageReceived: sum(deals, (d) => d.brokerageReceived),
  brokerageDistributed: sum(deals, (d) => d.brokerageDistributed),
  netBrokerage: sum(deals, (d) => d.netBrokerage),
  pendingBrokerage: sum(deals, (d) => d.pendingBrokerage),
});

const buildRevenueReport = ({ range, closedLeads = [], enterpriseInventories = [], coworking = {} }) => {
  const months = monthsInRange(range.from, range.to);
  const deals = closedLeads.map(toDealRow)
    .sort((a, b) => new Date(b.closingDate || 0) - new Date(a.closingDate || 0));
  const rentalBrokerageDeals = deals.filter((d) => d.model === BUSINESS_MODELS.RENTAL_BROKERAGE);
  const buySellDeals = deals.filter((d) => d.model === BUSINESS_MODELS.BUY_SELL);
  const enterprise = enterpriseInventories.map((row) => toEnterpriseRow(row, months));

  const coworkingSummary = {
    invoiced: round2(coworking.invoiced),
    collected: round2(coworking.collected),
    outstanding: round2(coworking.outstanding),
  };
  const enterpriseSummary = {
    count: enterprise.length,
    clientRent: sum(enterprise, (e) => e.periodClientRent),
    leaseRent: sum(enterprise, (e) => e.periodLeaseRent),
    profit: sum(enterprise, (e) => e.periodProfit),
    monthlyProfit: sum(enterprise, (e) => e.monthlyProfit),
  };
  const brokerage = summariseDeals(deals);
  const rentalIncome = round2(coworkingSummary.collected + enterpriseSummary.clientRent);

  return {
    range: { from: range.from, to: range.to, months },
    rental: {
      total: rentalIncome,
      coworking: coworkingSummary,
      enterprise: enterpriseSummary,
    },
    brokerage: {
      ...brokerage,
      rentalBrokerage: summariseDeals(rentalBrokerageDeals),
      buySell: summariseDeals(buySellDeals),
    },
    summary: {
      rentalIncome,
      brokerageRevenue: brokerage.brokerageReceived,
      totalRevenue: round2(rentalIncome + brokerage.brokerageReceived),
      enterpriseLeaseCost: enterpriseSummary.leaseRent,
      netRevenue: round2(rentalIncome + brokerage.brokerageReceived - enterpriseSummary.leaseRent),
      brokerageDistributed: brokerage.brokerageDistributed,
    },
    deals,
    payouts: toPayoutRows(deals),
    enterprise,
  };
};

const getRevenueReport = async ({ companyId, query = {} }) => {
  if (!companyId || !mongoose.Types.ObjectId.isValid(String(companyId))) {
    throw createHttpError(403, "Company context is required");
  }
  const range = resolveRange(query);

  const [closedLeads, enterpriseInventories, invoices, openInvoices, payments] = await Promise.all([
    Lead.find({
      companyId,
      status: "CLOSED",
      brokerageClosedAt: { $gte: range.start, $lte: range.end },
    })
      .select("name projectInterested requirements.transactionType inventoryId brokerageReceived brokerageDistributed brokerageDistributionBreakdown brokerageSource brokerageAgreed brokeragePaymentDate brokerageClosedAt brokerageClosedBy assignedTo dealPayment")
      .populate("inventoryId", "propertyId projectName businessModel ownershipType")
      .populate("brokerageClosedBy", "name")
      .populate("assignedTo", "name")
      .limit(5000)
      .lean(),
    Inventory.find({ companyId, businessModel: BUSINESS_MODELS.ENTERPRISE })
      .select("propertyId projectName enterpriseDetails")
      .limit(2000)
      .lean(),
    CoworkingInvoice.find({ companyId, status: { $ne: "CANCELLED" }, createdAt: { $gte: range.start, $lte: range.end } })
      .select("totalAmount")
      .lean(),
    CoworkingInvoice.find({ companyId, status: { $in: ["PENDING", "PARTIALLY_PAID", "OVERDUE"] } })
      .select("totalAmount amountPaid")
      .lean(),
    CoworkingPayment.find({ companyId, status: "COMPLETED", paymentDate: { $gte: range.start, $lte: range.end } })
      .select("amount type")
      .lean(),
  ]);

  const coworking = {
    invoiced: sum(invoices, (r) => r.totalAmount),
    collected: sum(payments.filter((r) => r.type !== "REFUND"), (r) => r.amount)
      - sum(payments.filter((r) => r.type === "REFUND"), (r) => r.amount),
    outstanding: sum(openInvoices, (r) => Math.max(0, num(r.totalAmount) - num(r.amountPaid))),
  };

  return buildRevenueReport({ range, closedLeads, enterpriseInventories, coworking });
};

module.exports = {
  buildRevenueReport,
  getRevenueReport,
  resolveRange,
  monthsInRange,
};
