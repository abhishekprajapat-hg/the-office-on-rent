const express = require("express");
const authMiddleware = require("../middleware/auth.middleware");
const companyMiddleware = require("../middleware/company.middleware");
const { checkRoleOrPageAccess, requirePageAccess, requirePageActionForMethod } = require("../middleware/pageAccess.middleware");
const { writeLimiter } = require("../middleware/rateLimit.middleware");
const { writeAuditLog } = require("../services/auditLog.service");
const ent = require("../services/enterprise.service");
const E = require("../constants/enterprise.constants");

/*
 * Enterprise leasing (Developmental Updates Oct 2026 - Update 02). Admin and
 * Manager by default; anyone else only with the "enterprise" page granted.
 * Verifying documents, waiving amounts and changing checklists are checked
 * again inside the service, so a page grant alone never allows them.
 */
const router = express.Router();
router.use(authMiddleware.protect);
router.use(companyMiddleware.requireCompanyContext);
router.use(checkRoleOrPageAccess(E.ENTERPRISE_ROLES, "enterprise"));
router.use(requirePageAccess("enterprise"));
router.use(requirePageActionForMethod("enterprise"));

const send = (fn, status = 200) => async (req, res) => {
  try {
    return res.status(status).json(await fn(req));
  } catch (error) {
    if (error.statusCode) return res.status(error.statusCode).json({ message: error.message });
    if (error.name === "ValidationError" || error.name === "CastError") return res.status(400).json({ message: error.message });
    if (error.code === 11000) return res.status(409).json({ message: "That record already exists" });
    req.log?.error?.(error);
    return res.status(500).json({ message: "Something went wrong in Enterprise Leasing" });
  }
};
const audit = (req, action, entityType, entityId, metadata = {}) => writeAuditLog({ companyId: req.user.companyId, actor: req.user, action, entityType, entityId, metadata, req }).catch(() => {});
const today = (req) => (req.query.asOf && !Number.isNaN(new Date(req.query.asOf).getTime()) ? new Date(req.query.asOf) : new Date());

router.get("/meta", (req, res) => res.json({
  operationalStatuses: E.OPERATIONAL_STATUSES, fitOutStatuses: E.FIT_OUT_STATUSES, agreementStatuses: E.AGREEMENT_STATUSES,
  entityTypes: E.ENTITY_TYPES, tenantContactRoles: E.TENANT_CONTACT_ROLES, maintenanceMethods: E.MAINTENANCE_METHODS,
  chargeTypes: E.CHARGE_TYPES, chargeFrequencies: E.CHARGE_FREQUENCIES, escalationMethods: E.ESCALATION_METHODS,
  paymentModes: E.PAYMENT_MODES, depositEntryTypes: E.DEPOSIT_ENTRY_TYPES, expenseCategories: E.EXPENSE_CATEGORIES,
  documentStatuses: E.DOCUMENT_STATUSES, documentCategories: E.DOCUMENT_CATEGORIES, alertWindows: E.ALERT_WINDOWS,
  canManage: E.ENTERPRISE_ROLES.includes(String(req.user.role).toUpperCase()), isAdmin: String(req.user.role).toUpperCase() === "ADMIN",
}));

/* ---- dashboard, report ---- */
router.get("/dashboard", send((req) => ent.dashboard({ user: req.user, today: today(req) })));
router.get("/report", send(async (req) => {
  const out = await ent.report({ user: req.user, query: req.query, today: today(req) });
  await audit(req, "ENTERPRISE_REPORT_EXPORTED", "EnterpriseOffice", req.query.officeId || "all", { from: req.query.from || null, to: req.query.to || null });
  return out;
}));

/* ---- offices ---- */
router.get("/offices", send((req) => ent.listOffices({ user: req.user, today: today(req) })));
router.post("/offices", writeLimiter, send(async (req) => {
  const office = await ent.createOffice({ user: req.user, body: req.body || {} });
  await audit(req, "ENTERPRISE_OFFICE_CREATED", "EnterpriseOffice", office._id, { officeCode: office.officeCode, name: office.name });
  return { office };
}, 201));
router.get("/offices/:id", send((req) => ent.officeDetail({ user: req.user, id: req.params.id, today: today(req) })));
router.patch("/offices/:id", writeLimiter, send(async (req) => {
  const office = await ent.updateOffice({ user: req.user, id: req.params.id, body: req.body || {} });
  await audit(req, "ENTERPRISE_OFFICE_UPDATED", "EnterpriseOffice", office._id, { fields: Object.keys(req.body || {}) });
  return { office };
}));

/* ---- agreements ---- */
router.post("/offices/:id/agreements", writeLimiter, send(async (req) => {
  const out = await ent.createAgreement({ user: req.user, officeId: req.params.id, body: req.body || {} });
  await audit(req, "ENTERPRISE_AGREEMENT_CREATED", "EnterpriseAgreement", out.agreement._id, { side: out.agreement.side, code: out.agreement.agreementCode });
  return out;
}, 201));
router.patch("/agreements/:id", writeLimiter, send(async (req) => {
  const out = await ent.updateAgreement({ user: req.user, id: req.params.id, body: req.body || {} });
  await audit(req, "ENTERPRISE_AGREEMENT_AMENDED", "EnterpriseAgreement", out.agreement._id, { changes: out.changes, schedule: out.schedule });
  return out;
}));

/* ---- tenants ---- */
router.get("/tenants", send(async (req) => ({ tenants: await require("../models/EnterpriseTenant").find({ companyId: req.user.companyId }).sort({ legalName: 1 }).lean() })));
router.post("/tenants", writeLimiter, send(async (req) => {
  const tenant = await ent.createTenant({ user: req.user, body: req.body || {} });
  await audit(req, "ENTERPRISE_TENANT_CREATED", "EnterpriseTenant", tenant._id, { legalName: tenant.legalName });
  return { tenant };
}, 201));
router.patch("/tenants/:id", writeLimiter, send(async (req) => ({ tenant: await ent.updateTenant({ user: req.user, id: req.params.id, body: req.body || {} }) })));
router.get("/tenants/:id/checklist", send(async (req) => {
  const tenant = await require("../models/EnterpriseTenant").findOne({ _id: req.params.id, companyId: req.user.companyId }).lean();
  if (!tenant) throw new ent.EnterpriseError(404, "Tenant not found");
  return ent.tenantChecklist({ companyId: req.user.companyId, tenant, agreementId: req.query.agreementId || null });
}));

/* ---- document checklists (Admin edits; everyone with the page reads) ---- */
router.get("/checklists", send(async (req) => ({ checklists: await Promise.all(E.ENTITY_TYPES.map((t) => ent.checklistFor(req.user.companyId, t))) })));
router.put("/checklists/:entityType", writeLimiter, send(async (req) => {
  const out = await ent.saveChecklist({ user: req.user, entityType: req.params.entityType, body: req.body || {} });
  await audit(req, "ENTERPRISE_CHECKLIST_UPDATED", "EnterpriseChecklist", out._id, { entityType: out.entityType, items: out.items.length });
  return { checklist: out };
}));

/* ---- documents ---- */
router.post("/documents", writeLimiter, send(async (req) => {
  const doc = await ent.uploadDocument({ user: req.user, body: req.body || {} });
  await audit(req, "ENTERPRISE_DOCUMENT_UPLOADED", "EnterpriseDocument", doc._id, { label: doc.label, version: doc.versions.length });
  return { document: doc };
}, 201));
router.patch("/documents/:id/status", writeLimiter, send(async (req) => {
  const doc = await ent.reviewDocument({ user: req.user, id: req.params.id === "new" ? null : req.params.id, body: req.body || {}, rowContext: req.body?.row || null });
  await audit(req, "ENTERPRISE_DOCUMENT_REVIEWED", "EnterpriseDocument", doc._id, { status: doc.status });
  return { document: doc };
}));

/* ---- payables / receivables ---- */
router.post("/offices/:id/obligations", writeLimiter, send(async (req) => ({ obligation: await ent.createObligation({ user: req.user, officeId: req.params.id, body: req.body || {} }) }), 201));
router.post("/obligations/:id/recover", writeLimiter, send(async (req) => ({ obligation: await ent.recoverFromTenant({ user: req.user, obligationId: req.params.id, body: req.body || {} }) }), 201));
router.post("/obligations/:id/promise", writeLimiter, send(async (req) => ({ obligation: await ent.addPromise({ user: req.user, id: req.params.id, body: req.body || {} }) })));
router.post("/obligations/:id/follow-up", writeLimiter, send(async (req) => ({ obligation: await ent.addFollowUp({ user: req.user, id: req.params.id, body: req.body || {} }) })));
router.post("/obligations/:id/dispute", writeLimiter, send(async (req) => ({ obligation: await ent.setDispute({ user: req.user, id: req.params.id, body: req.body || {} }) })));
router.post("/obligations/:id/adjust", writeLimiter, send(async (req) => {
  const ob = await ent.addAdjustment({ user: req.user, id: req.params.id, body: req.body || {} });
  await audit(req, "ENTERPRISE_AMOUNT_ADJUSTED", "EnterpriseObligation", ob._id, { amount: req.body?.amount, reason: req.body?.reason });
  return { obligation: ob };
}));

/* ---- payments ---- */
router.post("/offices/:id/transactions", writeLimiter, send(async (req) => {
  const tx = await ent.recordTransaction({ user: req.user, officeId: req.params.id, body: req.body || {} });
  await audit(req, "ENTERPRISE_PAYMENT_RECORDED", "EnterpriseTransaction", tx._id, { direction: tx.direction, amount: tx.amount, tds: tx.tdsAmount });
  return { transaction: tx };
}, 201));
router.post("/transactions/:id/allocate", writeLimiter, send(async (req) => ({ transaction: await ent.allocateTransaction({ user: req.user, id: req.params.id, body: req.body || {} }) })));

/* ---- deposits and fit-out ---- */
router.post("/offices/:id/ledger", writeLimiter, send(async (req) => {
  const row = await ent.addLedgerEntry({ user: req.user, officeId: req.params.id, body: req.body || {} });
  await audit(req, row.kind === "DEPOSIT" ? "ENTERPRISE_DEPOSIT_ENTRY" : "ENTERPRISE_FITOUT_EXPENSE", "EnterpriseLedgerEntry", row._id, { amount: row.amount, entryType: row.entryType || row.category });
  return { entry: row };
}, 201));
router.patch("/ledger/:id", writeLimiter, send(async (req) => ({ entry: await ent.updateExpense({ user: req.user, id: req.params.id, body: req.body || {} }) })));

/* ---- receipts / bills / proof on a payment or ledger entry ---- */
router.post("/attachments", writeLimiter, send(async (req) => {
  const body = req.body || {};
  const row = await ent.addAttachment({ user: req.user, target: body.target, id: body.id, body });
  await audit(req, "ENTERPRISE_PROOF_ATTACHED", body.target === "transaction" ? "EnterpriseTransaction" : "EnterpriseLedgerEntry", row._id, { name: body.name || "" });
  return { record: row };
}, 201));

/* ---- reminders ---- */
router.get("/reminders", send((req) => ent.listReminders({ user: req.user, query: req.query })));
router.post("/reminders/:id/done", writeLimiter, send(async (req) => ({ reminder: await ent.markReminderDone({ user: req.user, id: req.params.id, body: req.body || {} }) })));
// Run the reminder check now (it also runs on its own every hour).
router.post("/reminders/run", writeLimiter, send(async (req) => {
  if (!E.ENTERPRISE_ROLES.includes(String(req.user.role).toUpperCase())) throw new ent.EnterpriseError(403, "Only Admin or Manager can run reminders");
  return ent.runReminders({ companyId: req.user.companyId, today: today(req) });
}));

module.exports = router;
