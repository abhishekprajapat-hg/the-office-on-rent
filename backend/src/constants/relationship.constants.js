/*
 * Broker, channel partner, owner and inventory-source vocabulary
 * (requirements 16 Oct 2026, sections 06, 07 and 17).
 */

const SEGMENTS = Object.freeze(["COMMERCIAL", "RESIDENTIAL", "COWORKING"]);
const TRANSACTION_TYPES = Object.freeze(["SALE", "PURCHASE", "RENT", "LEASE"]);
const CUSTOMER_TYPES = Object.freeze(["CORPORATE", "SME", "STARTUP", "INDIVIDUAL", "INVESTOR", "END_USER", "OTHER"]);
const BROKER_TYPES = Object.freeze(["INDEPENDENT", "COMPANY", ""]);
const RELATIONSHIP_STATUSES = Object.freeze(["NEW", "ACTIVE", "WARM", "COLD", "DO_NOT_CONTACT", ""]);
const CONTACT_METHODS = Object.freeze(["CALL", "WHATSAPP", "EMAIL", "VISIT", ""]);
const CP_STATUSES = Object.freeze(["NOT_ONBOARDED", "PENDING", "ACTIVE", "INACTIVE"]);
const CONTACT_SOURCES = Object.freeze(["MANUAL", "LEAD", "INVENTORY", "BULK", "RERA_IMPORT", ""]);
const IMPORT_STATUSES = Object.freeze(["IMPORTED", "REVIEWED", "MERGED", ""]);

// Where an inventory record came from (7.1).
const INVENTORY_SOURCE_TYPES = Object.freeze(["COMPANY", "OWNER", "BROKER", "PARTNER", "OTHER", ""]);

// A broker's quote on a unit has its own availability, because two brokers
// can disagree about the same unit (6.3).
const SOURCE_AVAILABILITY = Object.freeze(["UNVERIFIED", "AVAILABLE", "ON_HOLD", "BOOKED", "SOLD", "WITHDRAWN"]);

// Until management sets a number, a source not confirmed for this many days
// is flagged for re-verification (open decision in section 13).
const STALE_AFTER_DAYS = Number(process.env.INVENTORY_STALE_AFTER_DAYS) || 30;

// Who may see net rates, brokerage terms and internal remarks (6.1). Open
// decision; Admin and Manager until management says otherwise.
const RESTRICTED_VIEW_ROLES = Object.freeze(["ADMIN", "MANAGER"]);
const RESTRICTED_CONTACT_FIELDS = Object.freeze(["brokerageTerms", "netRateNotes", "internalRemarks"]);

module.exports = {
  SEGMENTS,
  TRANSACTION_TYPES,
  CUSTOMER_TYPES,
  BROKER_TYPES,
  RELATIONSHIP_STATUSES,
  CONTACT_METHODS,
  CP_STATUSES,
  CONTACT_SOURCES,
  IMPORT_STATUSES,
  INVENTORY_SOURCE_TYPES,
  SOURCE_AVAILABILITY,
  STALE_AFTER_DAYS,
  RESTRICTED_VIEW_ROLES,
  RESTRICTED_CONTACT_FIELDS,
};
