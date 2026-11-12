/*
 * Broker, channel partner, owner and inventory-source vocabulary
 * (requirements 16 Oct 2026, sections 06, 07 and 17).
 */

const SEGMENTS = Object.freeze(["COMMERCIAL", "RESIDENTIAL", "COWORKING"]);
const TRANSACTION_TYPES = Object.freeze(["SALE", "PURCHASE", "RENT", "LEASE"]);
const CUSTOMER_TYPES = Object.freeze(["CORPORATE", "SME", "STARTUP", "INDIVIDUAL", "INVESTOR", "END_USER", "OTHER"]);
const BROKER_TYPES = Object.freeze(["INDEPENDENT", "COMPANY", ""]);
// UNREACHABLE and INACTIVE added for owners (Database module, 1.3).
const RELATIONSHIP_STATUSES = Object.freeze(["NEW", "ACTIVE", "WARM", "COLD", "UNREACHABLE", "INACTIVE", "DO_NOT_CONTACT", ""]);
const CONTACT_METHODS = Object.freeze(["CALL", "WHATSAPP", "EMAIL", "VISIT", ""]);
const CP_STATUSES = Object.freeze(["NOT_ONBOARDED", "PENDING", "ACTIVE", "INACTIVE"]);
// KYC papers a broker hands over to become a channel partner.
const CP_DOCUMENT_TYPES = Object.freeze(["AADHAAR", "PHOTO", "PAN", "OTHER"]);
// 3 Nov 2026 (3.1): how a broker is registered. Only a Channel Partner can be
// marked Preferred, and only by hand.
const BROKER_REGISTRATION_TYPES = Object.freeze(["REGULAR_BROKER", "CHANNEL_PARTNER"]);
// Documents a CP registration asks for (Aadhaar and photo per the 3 Nov
// meeting; confirm with the business). Shown as a checklist, not enforced.
const CP_REQUIRED_DOCUMENTS = Object.freeze(
  String(process.env.CP_REQUIRED_DOCUMENTS || "AADHAAR,PHOTO").split(",").map((d) => d.trim().toUpperCase()).filter(Boolean),
);
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
// cpDocuments (Aadhaar / PAN) and the CP login link are management-only too.
const RESTRICTED_CONTACT_FIELDS = Object.freeze(["brokerageTerms", "netRateNotes", "internalRemarks", "cpDocuments", "cpUserId"]);

module.exports = {
  SEGMENTS,
  TRANSACTION_TYPES,
  CUSTOMER_TYPES,
  BROKER_TYPES,
  RELATIONSHIP_STATUSES,
  CONTACT_METHODS,
  CP_STATUSES,
  CP_DOCUMENT_TYPES,
  BROKER_REGISTRATION_TYPES,
  CP_REQUIRED_DOCUMENTS,
  CONTACT_SOURCES,
  IMPORT_STATUSES,
  INVENTORY_SOURCE_TYPES,
  SOURCE_AVAILABILITY,
  STALE_AFTER_DAYS,
  RESTRICTED_VIEW_ROLES,
  RESTRICTED_CONTACT_FIELDS,
};
