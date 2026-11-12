/*
 * Enterprise leasing (Developmental Updates Oct 2026 - Update 02).
 *
 * An Enterprise Office joins two independent agreements: the owner-side master
 * lease (what the company owes the landlord) and the tenant-side agreement
 * (what the company expects to collect). Statuses are kept apart: the office's
 * operational status, each agreement's status, and each payment's status.
 *
 * Lists that company policy can change are read from env (comma separated)
 * with these defaults.
 */
const list = (envKey, fallback) => Object.freeze(
  String(process.env[envKey] || fallback).split(",").map((s) => s.trim().toUpperCase()).filter(Boolean),
);

const OPERATIONAL_STATUSES = list("ENTERPRISE_OPERATIONAL_STATUSES", "NEGOTIATION,FIT_OUT,READY_VACANT,TENANT_ONBOARDING,OCCUPIED,NOTICE_EXIT,TRANSITION,CLOSED");
const FIT_OUT_STATUSES = list("ENTERPRISE_FIT_OUT_STATUSES", "NOT_STARTED,IN_PROGRESS,COMPLETED,OTHER");
const AGREEMENT_STATUSES = Object.freeze(["DRAFT", "ACTIVE", "NOTICE", "EXPIRED", "TERMINATED", "RENEWED"]);
const AGREEMENT_SIDES = Object.freeze(["OWNER", "TENANT"]);
// Vacant-looking statuses: the owner-side rent still runs while these last.
const VACANT_STATUSES = Object.freeze(["READY_VACANT", "TRANSITION", "NOTICE_EXIT", "FIT_OUT", "TENANT_ONBOARDING"]);

const ENTITY_TYPES = Object.freeze(["INDIVIDUAL", "PROPRIETORSHIP", "PARTNERSHIP", "LLP", "COMPANY", "OTHER"]);
const TENANT_CONTACT_ROLES = Object.freeze(["PRIMARY", "SIGNATORY", "ACCOUNTS", "TDS", "FACILITY", "NOTICE", "OTHER"]);

const MAINTENANCE_METHODS = Object.freeze(["INCLUDED", "FIXED", "ACTUAL", "OTHER"]);
const CHARGE_TYPES = Object.freeze(["RENT", "MAINTENANCE", "PARKING", "UTILITIES", "REPAIRS", "OTHER"]);
const CHARGE_FREQUENCIES = Object.freeze(["MONTHLY", "ONE_TIME"]);
const ESCALATION_METHODS = Object.freeze(["PERCENT", "AMOUNT", "NEW_RENT"]);

// Worked out from due dates and recorded transactions; never typed in.
const OBLIGATION_STATUSES = Object.freeze(["UPCOMING", "DUE", "PARTIALLY_PAID", "PAID", "OVERDUE", "DISPUTED", "WAIVED_ADJUSTED"]);
const PAYMENT_MODES = Object.freeze(["BANK_TRANSFER", "CHEQUE", "UPI", "CASH", "CARD", "OTHER"]);

// Deposit ledger entries. Owner side: the company PAYS the landlord and gets a REFUND.
// Tenant side: the company COLLECTS from the tenant and REFUNDS it. Deductions and
// adjustments are their own entries so every change is visible.
const DEPOSIT_ENTRY_TYPES = Object.freeze(["REQUIRED", "PAID", "COLLECTED", "REFUND", "DEDUCTION", "ADJUSTMENT"]);

const EXPENSE_CATEGORIES = list("ENTERPRISE_EXPENSE_CATEGORIES", "CIVIL,ELECTRICAL,FURNITURE,INTERIORS,EQUIPMENT,HVAC,IT_NETWORK,OTHER");
const EXPENSE_PAYMENT_STATUSES = Object.freeze(["OUTSTANDING", "PARTIALLY_PAID", "PAID"]);

const DOCUMENT_STATUSES = Object.freeze(["PENDING", "UPLOADED", "UNDER_REVIEW", "VERIFIED", "REJECTED", "NOT_APPLICABLE"]);
const DOCUMENT_SCOPES = Object.freeze(["ENTITY", "SIGNATORY", "AGREEMENT", "OFFICE"]);
// Office and agreement papers (2.2 "Documents and audit"). Configurable.
const DOCUMENT_CATEGORIES = list("ENTERPRISE_DOCUMENT_CATEGORIES", "LEASE_DEED,AMENDMENT,BILL,RECEIPT,APPROVAL,NOC,HANDOVER,NOTICE,OTHER");
// Reminders (2.10): which alerts are sent to people, and how often the sweep runs.
const REMINDER_TYPES = list("ENTERPRISE_REMINDER_TYPES", "LEASE_EXPIRY,ESCALATION,LOCK_IN_END,NOTICE_DEADLINE,NOTICE_RUNNING,OVERDUE_COLLECTION,OVERDUE_PAYABLE,PAYABLE_DUE,RECEIVABLE_DUE,DEPOSIT_SETTLEMENT,VACANT_EXPOSURE");

// Alert windows (days). Configurable.
const num = (key, fallback) => Number(process.env[key]) || fallback;
const ALERT_WINDOWS = Object.freeze({
  dueSoon: num("ENTERPRISE_DUE_SOON_DAYS", 7),
  leaseExpiry: num("ENTERPRISE_EXPIRY_ALERT_DAYS", 90),
  escalation: num("ENTERPRISE_ESCALATION_ALERT_DAYS", 60),
  lockIn: num("ENTERPRISE_LOCKIN_ALERT_DAYS", 60),
  noticeDeadline: num("ENTERPRISE_NOTICE_ALERT_DAYS", 60),
});
// How far ahead a schedule runs when an agreement has no end date yet (months).
const OPEN_ENDED_SCHEDULE_MONTHS = num("ENTERPRISE_OPEN_SCHEDULE_MONTHS", 24);

/*
 * Default document checklists by tenant entity type.
 *
 * Taken from the company's own client documents handout (Sept 2026), the list
 * the Co-working module already uses (frontend coworking/booking/kycDocuments.js):
 * Individual, Proprietorship and Company. LLP uses the company list, as the
 * handout groups LLP with companies. Partnership and Other have no list in the
 * handout, so they start empty for an Admin to fill in from the entity-wise
 * checklist PDF - the brief says not to guess one. Admins can change every list
 * in Enterprise -> Checklists without a code change.
 *
 * scope: ENTITY (the tenant), SIGNATORY (repeated for each signing authority),
 * AGREEMENT (the tenant agreement).
 */
const item = (key, label, scope, required = true, hint = "") => ({ key, label, scope, required, hint });
const PERSON_ITEMS = [
  item("aadhaar", "Aadhaar card", "SIGNATORY"),
  item("pan", "PAN card", "SIGNATORY"),
  item("policeVerification", "Police verification", "SIGNATORY"),
  item("photo", "Passport size photo", "SIGNATORY"),
];
const COMPANY_ITEMS = [
  item("coi", "Certificate of incorporation (COI)", "ENTITY"),
  item("companyPan", "Company PAN card", "ENTITY"),
  item("cinProof", "CIN proof", "ENTITY", false, "CIN is also saved as a field on the tenant"),
  item("gst", "GST certificate", "ENTITY", false, "If available"),
  item("authorisationLetter", "Authorization letter / board resolution", "ENTITY"),
  item("signatoryAuthority", "Proof of signing authority", "SIGNATORY", true, "Board resolution or authority document"),
  item("aadhaar", "Aadhaar card", "SIGNATORY"),
  item("pan", "PAN card", "SIGNATORY", false),
  item("policeVerification", "Police verification", "SIGNATORY"),
  item("photo", "Passport size photo", "SIGNATORY"),
  item("rentAgreement", "Executed rent / lease agreement", "AGREEMENT"),
];
const DEFAULT_CHECKLISTS = Object.freeze({
  INDIVIDUAL: [...PERSON_ITEMS, item("rentAgreement", "Executed rent / lease agreement", "AGREEMENT")],
  PROPRIETORSHIP: [
    item("gumasta", "Gumasta", "ENTITY", true, "Shop and establishment licence"),
    item("msme", "MSME certificate", "ENTITY"),
    ...PERSON_ITEMS,
    item("rentAgreement", "Executed rent / lease agreement", "AGREEMENT"),
  ],
  COMPANY: COMPANY_ITEMS,
  LLP: COMPANY_ITEMS,
  PARTNERSHIP: [],
  OTHER: [],
});

const ENTERPRISE_ROLES = Object.freeze(["ADMIN", "MANAGER"]);

module.exports = {
  OPERATIONAL_STATUSES,
  FIT_OUT_STATUSES,
  AGREEMENT_STATUSES,
  AGREEMENT_SIDES,
  VACANT_STATUSES,
  ENTITY_TYPES,
  TENANT_CONTACT_ROLES,
  MAINTENANCE_METHODS,
  CHARGE_TYPES,
  CHARGE_FREQUENCIES,
  ESCALATION_METHODS,
  OBLIGATION_STATUSES,
  PAYMENT_MODES,
  DEPOSIT_ENTRY_TYPES,
  EXPENSE_CATEGORIES,
  EXPENSE_PAYMENT_STATUSES,
  DOCUMENT_STATUSES,
  DOCUMENT_SCOPES,
  ALERT_WINDOWS,
  DOCUMENT_CATEGORIES,
  REMINDER_TYPES,
  OPEN_ENDED_SCHEDULE_MONTHS,
  DEFAULT_CHECKLISTS,
  ENTERPRISE_ROLES,
};
