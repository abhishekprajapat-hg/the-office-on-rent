/*
 * Enterprise leasing - the arithmetic (2.5 - 2.10), kept free of the database
 * so every rule can be tested on its own.
 *
 *   buildSchedule       expected amounts from one agreement's own terms
 *   obligationView      settled / adjusted / balance / status of one item
 *   depositLedger       one side's deposit position from its entries
 *   fitOutSummary       budget vs actual and vendor amounts outstanding
 *   officeMetrics       operating contribution and payback (estimates)
 *   officeAlerts        dates and amounts that need someone's attention
 *
 * The two sides are never netted together: a tenant's non-payment leaves the
 * owner payable outstanding, and a vacant office still shows its owner rent.
 */
const E = require("../constants/enterprise.constants");

const DAY = 86400000;
const round2 = (n) => Math.round((Number(n) || 0) * 100) / 100;
const startOfDay = (d) => { const x = new Date(d); x.setUTCHours(0, 0, 0, 0); return x; };
const daysBetween = (a, b) => Math.round((startOfDay(b) - startOfDay(a)) / DAY);
const addDays = (d, n) => new Date(startOfDay(d).getTime() + n * DAY);
const addMonths = (d, n) => {
  const x = startOfDay(d);
  const day = x.getUTCDate();
  const target = new Date(Date.UTC(x.getUTCFullYear(), x.getUTCMonth() + n, 1));
  const last = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0)).getUTCDate();
  target.setUTCDate(Math.min(day, last));
  return target;
};
const iso = (d) => (d ? startOfDay(d).toISOString().slice(0, 10) : "");

/* ------------------------------------------------------------- rent -- */

/* The rent in force on a date: the base rent with every escalation dated on or before it, in order. */
const rentOn = (agreement, date) => {
  let rent = Number(agreement.baseRent) || 0;
  const when = startOfDay(date).getTime();
  [...(agreement.escalations || [])]
    .filter((e) => e.effectiveDate && startOfDay(e.effectiveDate).getTime() <= when)
    .sort((a, b) => new Date(a.effectiveDate) - new Date(b.effectiveDate))
    .forEach((e) => {
      const v = Number(e.value) || 0;
      if (e.method === "PERCENT") rent *= 1 + v / 100;
      else if (e.method === "AMOUNT") rent += v;
      else if (e.method === "NEW_RENT") rent = v;
    });
  return round2(rent);
};

/* The future escalation schedule: each date with the rent before and after. */
const escalationSchedule = (agreement) => [...(agreement.escalations || [])]
  .filter((e) => e.effectiveDate)
  .sort((a, b) => new Date(a.effectiveDate) - new Date(b.effectiveDate))
  .map((e) => ({ effectiveDate: e.effectiveDate, method: e.method, value: e.value, rentBefore: rentOn(agreement, addDays(e.effectiveDate, -1)), rentAfter: rentOn(agreement, e.effectiveDate), note: e.note || "" }));

/* --------------------------------------------------------- schedule -- */

const scheduleEnd = (agreement, today) => {
  const ends = [agreement.endDate, agreement.vacatingDate].filter(Boolean).map(startOfDay);
  if (ends.length) return new Date(Math.min(...ends.map((d) => d.getTime())));
  const anchor = agreement.rentCommencementDate || agreement.commencementDate || today;
  return addDays(addMonths(new Date(Math.max(startOfDay(anchor).getTime(), startOfDay(today).getTime())), E.OPEN_ENDED_SCHEDULE_MONTHS), -1);
};

const dueDateFor = (periodStart, rentDueDay) => {
  if (!rentDueDay) return startOfDay(periodStart);
  const ps = startOfDay(periodStart);
  let due = new Date(Date.UTC(ps.getUTCFullYear(), ps.getUTCMonth(), Math.min(rentDueDay, 28)));
  if (due < ps) due = new Date(Date.UTC(ps.getUTCFullYear(), ps.getUTCMonth() + 1, Math.min(rentDueDay, 28)));
  return due;
};

/* Monthly periods from start to end; the last one is cut at the end date and pro-rated by days. */
const monthlyPeriods = (start, end) => {
  const out = [];
  if (!start || !end || startOfDay(start) > startOfDay(end)) return out;
  for (let k = 0; k < 600; k += 1) {
    const periodStart = addMonths(start, k);
    if (periodStart > startOfDay(end)) break;
    const fullEnd = addDays(addMonths(start, k + 1), -1);
    const periodEnd = fullEnd > startOfDay(end) ? startOfDay(end) : fullEnd;
    const fullDays = daysBetween(periodStart, fullEnd) + 1;
    const days = daysBetween(periodStart, periodEnd) + 1;
    out.push({ periodStart, periodEnd, fraction: days >= fullDays ? 1 : days / fullDays });
  }
  return out;
};

/*
 * Every expected amount from one agreement, from its own dates and terms:
 *   rent       from rent commencement, at the rent in force on each period's
 *              start (escalations as saved), pro-rated for a short last period;
 *   maintenance a FIXED monthly charge from commencement; INCLUDED adds nothing;
 *              ACTUAL and OTHER are entered against bills, not scheduled;
 *   other      monthly or one-time charges as saved.
 * GST (if the agreement sets it) is added on top; TDS (if set) is the expected
 * withholding. Nothing here assumes a tax rate.
 */
const buildSchedule = (agreement, { today = new Date() } = {}) => {
  const items = [];
  const end = scheduleEnd(agreement, today);
  const gst = Number(agreement.gstPercent) || 0;
  const tds = Number(agreement.tdsPercent) || 0;
  const push = (chargeType, label, p, gross) => {
    const g = round2(gross);
    if (g <= 0) return;
    items.push({
      scheduleKey: `${chargeType}:${label}:${iso(p.periodStart)}`,
      chargeType, label,
      periodStart: p.periodStart, periodEnd: p.periodEnd,
      dueDate: p.dueDate || dueDateFor(p.periodStart, agreement.rentDueDay),
      gross: g,
      taxAmount: round2((g * gst) / 100),
      tdsExpected: round2((g * tds) / 100),
    });
  };
  const rentStart = agreement.rentCommencementDate || agreement.commencementDate;
  if (rentStart && Number(agreement.baseRent) > 0) {
    monthlyPeriods(rentStart, end).forEach((p) => push("RENT", "Rent", p, rentOn(agreement, p.periodStart) * p.fraction));
  }
  const chargeStart = agreement.commencementDate || agreement.rentCommencementDate;
  if (chargeStart && agreement.maintenance?.method === "FIXED" && Number(agreement.maintenance.amount) > 0) {
    monthlyPeriods(chargeStart, end).forEach((p) => push("MAINTENANCE", "Maintenance", p, Number(agreement.maintenance.amount) * p.fraction));
  }
  (agreement.otherCharges || []).forEach((c) => {
    if (c.frequency === "ONE_TIME") {
      const due = c.dueDate || chargeStart;
      if (due) push(c.chargeType || "OTHER", c.label, { periodStart: startOfDay(due), periodEnd: startOfDay(due), dueDate: startOfDay(due) }, Number(c.amount));
    } else if (chargeStart) {
      monthlyPeriods(chargeStart, end).forEach((p) => push(c.chargeType || "OTHER", c.label, p, Number(c.amount) * p.fraction));
    }
  });
  return items.sort((a, b) => a.dueDate - b.dueDate || a.scheduleKey.localeCompare(b.scheduleKey));
};

/*
 * Which existing rows a regenerated schedule may touch. A row is kept exactly
 * as it is once anything has happened to it - money, an adjustment, a dispute,
 * a promise - or once it has fallen due. Only untouched future rows follow an
 * amendment, so earlier periods are never silently rewritten (2.5).
 */
const isLocked = (ob, today = new Date()) => Boolean(
  (ob.settlements || []).length || (ob.adjustments || []).length || ob.disputed || (ob.promises || []).length
  || startOfDay(ob.dueDate) < startOfDay(today) || !ob.generated,
);

const planRegeneration = (existing = [], generated = [], { today = new Date() } = {}) => {
  const byKey = new Map(existing.filter((o) => o.scheduleKey).map((o) => [o.scheduleKey, o]));
  const create = [];
  const update = [];
  const keep = [];
  generated.forEach((g) => {
    const ob = byKey.get(g.scheduleKey);
    // New rows are created for past periods too: an agreement entered late still gets its full history.
    if (!ob) { create.push(g); return; }
    byKey.delete(g.scheduleKey);
    if (isLocked(ob, today)) { keep.push(ob); return; }
    if (round2(ob.gross) !== g.gross || round2(ob.taxAmount) !== g.taxAmount || round2(ob.tdsExpected) !== g.tdsExpected || iso(ob.dueDate) !== iso(g.dueDate)) update.push({ _id: ob._id, ...g });
    else keep.push(ob);
  });
  // Rows the new terms no longer produce: removed only if untouched and in the future.
  const remove = [];
  byKey.forEach((ob) => { if (ob.generated && !isLocked(ob, today)) remove.push(ob); else keep.push(ob); });
  return { create, update, remove, keep };
};

/* --------------------------------------------------------- one item -- */

const obligationView = (ob, today = new Date()) => {
  const paidCash = round2((ob.settlements || []).reduce((a, s) => a + (Number(s.cash) || 0), 0));
  const paidTds = round2((ob.settlements || []).reduce((a, s) => a + (Number(s.tds) || 0), 0));
  const adjusted = round2((ob.adjustments || []).reduce((a, s) => a + (Number(s.amount) || 0), 0));
  const totalDue = round2((Number(ob.gross) || 0) + (Number(ob.taxAmount) || 0));
  const settled = round2(paidCash + paidTds);
  const balance = round2(totalDue - settled - adjusted);
  const due = startOfDay(ob.dueDate);
  const t = startOfDay(today);
  const daysOverdue = balance > 0.009 && due < t ? daysBetween(due, t) : 0;
  let status;
  if (balance <= 0.009) status = settled > 0 ? "PAID" : "WAIVED_ADJUSTED";
  else if (ob.disputed) status = "DISPUTED";
  else if (settled > 0 || adjusted > 0) status = "PARTIALLY_PAID";
  else if (due < t) status = "OVERDUE";
  else if (daysBetween(t, due) <= E.ALERT_WINDOWS.dueSoon) status = "DUE";
  else status = "UPCOMING";
  const promises = [...(ob.promises || [])].sort((a, b) => new Date(b.at) - new Date(a.at));
  const followUps = [...(ob.followUps || [])].sort((a, b) => new Date(b.at) - new Date(a.at));
  // TDS short-withheld or over-withheld against the agreement's expectation, once fully settled.
  const tdsDifference = status === "PAID" ? round2((Number(ob.tdsExpected) || 0) - paidTds) : null;
  return {
    ...ob,
    totalDue, paidCash, paidTds, settled, adjusted, balance, status, daysOverdue,
    overdue: daysOverdue > 0,
    latestPromise: promises[0] || null,
    lastFollowUp: followUps[0] || null,
    nextFollowUpAt: followUps[0]?.nextFollowUpAt || null,
    tdsDifference,
  };
};

/*
 * Checks one transaction's allocations against the items' balances: each
 * allocation fits the item's balance, cash and TDS allocated never exceed what
 * the transaction carried, and every item is on the same office and side.
 */
const validateAllocations = ({ transaction, allocations = [], obligations = [] }) => {
  const byId = new Map(obligations.map((o) => [String(o._id), o]));
  let cash = 0;
  let tds = 0;
  const seen = new Set();
  allocations.forEach((a) => {
    const key = String(a.obligationId);
    if (seen.has(key)) throw Object.assign(new Error("An item is listed twice in this payment"), { statusCode: 400 });
    seen.add(key);
    const ob = byId.get(key);
    if (!ob) throw Object.assign(new Error("A payment can only settle items of this office"), { statusCode: 400 });
    if (ob.direction !== transaction.direction) throw Object.assign(new Error("A payment can't settle items on the other side"), { statusCode: 400 });
    if (String(ob.officeId) !== String(transaction.officeId)) throw Object.assign(new Error("A payment can only settle items of its own office"), { statusCode: 400 });
    const c = round2(a.cash);
    const t = round2(a.tds);
    if (c < 0 || t < 0 || c + t <= 0) throw Object.assign(new Error("Each allocation needs an amount"), { statusCode: 400 });
    const view = obligationView(ob);
    if (round2(c + t) > round2(view.balance) + 0.009) throw Object.assign(new Error(`${ob.label || ob.chargeType} (${iso(ob.dueDate)}) has only ${view.balance} outstanding`), { statusCode: 400 });
    cash += c;
    tds += t;
  });
  if (round2(cash) > round2(transaction.amount) + 0.009) throw Object.assign(new Error("More cash is allocated than the payment carried"), { statusCode: 400 });
  if (round2(tds) > round2(transaction.tdsAmount || 0) + 0.009) throw Object.assign(new Error("More TDS is allocated than was withheld on this payment"), { statusCode: 400 });
  return { cash: round2(cash), tds: round2(tds), unallocatedCash: round2(transaction.amount - cash), unallocatedTds: round2((transaction.tdsAmount || 0) - tds) };
};

const transactionView = (tx) => {
  const cash = round2((tx.allocations || []).reduce((a, x) => a + (Number(x.cash) || 0), 0));
  const tds = round2((tx.allocations || []).reduce((a, x) => a + (Number(x.tds) || 0), 0));
  return { ...tx, allocatedCash: cash, allocatedTds: tds, unallocatedCash: round2((tx.amount || 0) - cash), unallocatedTds: round2((tx.tdsAmount || 0) - tds) };
};

/* ---------------------------------------------------------- deposits -- */

/*
 * One side's deposit position. Owner side: what the company paid the landlord
 * and what has come back; tenant side: what the company collected and what it
 * has returned. Deductions and adjustments are their own entries. A deposit
 * stays outstanding until it is refunded, adjusted or settled by an entry.
 */
const depositLedger = (entries = [], side, required = null) => {
  const rows = entries.filter((e) => e.side === side).sort((a, b) => new Date(a.date) - new Date(b.date));
  const sum = (type) => round2(rows.filter((e) => e.entryType === type).reduce((a, e) => a + (Number(e.amount) || 0), 0));
  const requiredEntry = [...rows].reverse().find((e) => e.entryType === "REQUIRED");
  const requiredAmount = round2(requiredEntry ? requiredEntry.amount : (required || 0));
  const inAmount = side === "OWNER" ? sum("PAID") : sum("COLLECTED");
  const refunded = sum("REFUND");
  const deducted = sum("DEDUCTION");
  const adjusted = sum("ADJUSTMENT");
  const held = round2(inAmount - refunded - deducted - adjusted);
  const expected = [...rows].reverse().find((e) => e.expectedSettlementDate)?.expectedSettlementDate || null;
  return {
    side,
    required: requiredAmount,
    paidOrCollected: inAmount,
    shortfall: round2(Math.max(0, requiredAmount - inAmount)),
    refunded, deducted, adjusted,
    // Still with the landlord (owner side) / still owed back to the tenant (tenant side).
    outstanding: Math.max(0, held),
    expectedSettlementDate: expected,
    entries: rows,
  };
};

/* ------------------------------------------------------------ fit-out -- */

const fitOutSummary = (office = {}, expenses = []) => {
  const rows = expenses.filter((e) => e.kind === "EXPENSE");
  const actual = round2(rows.reduce((a, e) => a + (Number(e.amount) || 0), 0));
  const paid = round2(rows.reduce((a, e) => a + Math.min(Number(e.amountPaid) || 0, Number(e.amount) || 0), 0));
  const budget = office.fitOutBudget === null || office.fitOutBudget === undefined ? null : round2(office.fitOutBudget);
  const byCategory = {};
  rows.forEach((e) => { byCategory[e.category || "OTHER"] = round2((byCategory[e.category || "OTHER"] || 0) + (Number(e.amount) || 0)); });
  return {
    budget,
    actual,
    variance: budget === null ? null : round2(budget - actual),
    overBudget: budget !== null && actual > budget,
    vendorPaid: paid,
    vendorOutstanding: round2(actual - paid),
    byCategory,
    items: rows.length,
  };
};

/* ------------------------------------------------------------ metrics -- */

/*
 * Management estimates (2.9), labelled as such: monthly operating
 * contribution = tenant rent receivable - owner rent payable for the month.
 * Maintenance and other pass-through items are left out, as are deposits.
 * Payback = actual fit-out / monthly contribution, when that is positive.
 */
const officeMetrics = ({ ownerAgreement = null, tenantAgreement = null, fitOut = null, today = new Date() } = {}) => {
  const active = (a) => a && ["ACTIVE", "NOTICE"].includes(a.status);
  const ownerRent = active(ownerAgreement) ? rentOn(ownerAgreement, today) : 0;
  const tenantRent = active(tenantAgreement) ? rentOn(tenantAgreement, today) : 0;
  const contribution = round2(tenantRent - ownerRent);
  const actualFitOut = fitOut?.actual || 0;
  return {
    ownerRentMonthly: ownerRent,
    tenantRentMonthly: tenantRent,
    operatingContributionMonthly: contribution,
    paybackMonths: contribution > 0 && actualFitOut > 0 ? round2(actualFitOut / contribution) : null,
    basis: "Estimate: tenant rent minus owner rent for the current month; maintenance, pass-through charges and deposits excluded. Not statutory profit.",
  };
};

/* ------------------------------------------------------------- alerts -- */

const within = (date, today, days) => date && daysBetween(today, date) >= 0 && daysBetween(today, date) <= days;

/*
 * What needs attention for one office, from the dates and amounts saved on
 * its own agreements: dues, overdue items, expiry, escalations, lock-in and
 * notice deadlines (kept apart), tenant notice, missing documents, deposits to
 * settle and owner rent running while the office is vacant.
 */
const officeAlerts = ({ office, ownerAgreement, tenantAgreement, obligations = [], deposits = {}, missingDocuments = 0, today = new Date() }) => {
  const t = startOfDay(today);
  const out = [];
  const add = (type, severity, message, date = null, amount = null) => out.push({ type, severity, message, date, amount, officeId: office?._id, officeName: office?.name || "" });
  const views = obligations.map((o) => (o.status ? o : obligationView(o, today)));
  const overdue = (dir) => views.filter((v) => v.direction === dir && v.daysOverdue > 0 && v.status !== "DISPUTED");
  const dueSoon = views.filter((v) => v.balance > 0 && within(v.dueDate, t, E.ALERT_WINDOWS.dueSoon));
  const sumBal = (rows) => round2(rows.reduce((a, r) => a + r.balance, 0));
  if (overdue("RECEIVABLE").length) add("OVERDUE_COLLECTION", "high", `${overdue("RECEIVABLE").length} tenant item(s) overdue`, null, sumBal(overdue("RECEIVABLE")));
  if (overdue("PAYABLE").length) add("OVERDUE_PAYABLE", "high", `${overdue("PAYABLE").length} landlord item(s) overdue`, null, sumBal(overdue("PAYABLE")));
  dueSoon.forEach((v) => add(v.direction === "PAYABLE" ? "PAYABLE_DUE" : "RECEIVABLE_DUE", "medium", `${v.direction === "PAYABLE" ? "Pay landlord" : "Collect from tenant"}: ${v.label || v.chargeType}`, v.dueDate, v.balance));
  [["Owner lease", ownerAgreement], ["Tenant agreement", tenantAgreement]].forEach(([name, a]) => {
    if (!a || !["ACTIVE", "NOTICE"].includes(a.status)) return;
    if (within(a.endDate, t, E.ALERT_WINDOWS.leaseExpiry)) add("LEASE_EXPIRY", "high", `${name} ends`, a.endDate);
    (a.escalations || []).forEach((e) => { if (within(e.effectiveDate, t, E.ALERT_WINDOWS.escalation)) add("ESCALATION", "medium", `${name}: rent escalation`, e.effectiveDate); });
    const lockIn = a.lockInEndDate || (a.lockInMonths && (a.commencementDate || a.rentCommencementDate) ? addMonths(a.commencementDate || a.rentCommencementDate, a.lockInMonths) : null);
    if (within(lockIn, t, E.ALERT_WINDOWS.lockIn)) add("LOCK_IN_END", "medium", `${name}: lock-in ends`, lockIn);
    // The last day to give notice so the agreement ends on its end date.
    const noticeBy = a.endDate && a.noticePeriodMonths ? addMonths(a.endDate, -a.noticePeriodMonths) : null;
    if (within(noticeBy, t, E.ALERT_WINDOWS.noticeDeadline)) add("NOTICE_DEADLINE", "high", `${name}: last day to give notice / decide on renewal`, noticeBy);
    if (a.noticeExpiryDate && daysBetween(t, a.noticeExpiryDate) >= 0) add("NOTICE_RUNNING", "high", `${name}: notice period ends`, a.noticeExpiryDate);
  });
  if (missingDocuments > 0) add("MISSING_DOCUMENTS", "medium", `${missingDocuments} tenant document(s) pending or rejected`);
  ["OWNER", "TENANT"].forEach((side) => {
    const d = deposits[side];
    if (!d) return;
    if (d.shortfall > 0) add("DEPOSIT_SHORTFALL", "medium", side === "OWNER" ? "Deposit to landlord not fully paid" : "Tenant deposit not fully collected", null, d.shortfall);
    if (d.outstanding > 0 && d.expectedSettlementDate && startOfDay(d.expectedSettlementDate) <= t) add("DEPOSIT_SETTLEMENT", "high", side === "OWNER" ? "Landlord deposit refund is due" : "Tenant deposit refund is due", d.expectedSettlementDate, d.outstanding);
  });
  const tenantActive = tenantAgreement && ["ACTIVE", "NOTICE"].includes(tenantAgreement.status);
  const ownerActive = ownerAgreement && ["ACTIVE", "NOTICE"].includes(ownerAgreement.status);
  if (ownerActive && (!tenantActive || E.VACANT_STATUSES.includes(office?.operationalStatus)) && office?.operationalStatus !== "OCCUPIED") {
    add("VACANT_EXPOSURE", "high", "Office without a paying tenant while owner rent runs", null, rentOn(ownerAgreement, today));
  }
  const order = { high: 0, medium: 1, low: 2 };
  return out.sort((a, b) => order[a.severity] - order[b.severity] || (a.date ? new Date(a.date) : Infinity) - (b.date ? new Date(b.date) : Infinity));
};

module.exports = {
  round2,
  startOfDay,
  addMonths,
  addDays,
  daysBetween,
  rentOn,
  escalationSchedule,
  monthlyPeriods,
  dueDateFor,
  buildSchedule,
  isLocked,
  planRegeneration,
  obligationView,
  validateAllocations,
  transactionView,
  depositLedger,
  fitOutSummary,
  officeMetrics,
  officeAlerts,
};
