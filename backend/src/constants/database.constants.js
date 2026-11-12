/*
 * Database module (Developmental Updates, Oct 2026 - Update 01).
 *
 * One identity record per person (CrmContact), one record per building, the
 * existing Inventory record per property, and Relationship rows that say how
 * they connect. Interactions keep calls, source reports and verifications as a
 * history that is added to, never overwritten.
 */

// A person can hold several of these at once (e.g. building manager and broker).
const CONTACT_ROLES = Object.freeze([
  "OWNER",
  "BROKER",
  "MAINTENANCE_STAFF",
  "SECURITY_GUARD",
  "BUILDING_MANAGER",
  "PROPERTY_MANAGER",
  "PA",
  "ACCOUNTANT",
  "AUTHORIZED_REPRESENTATIVE",
  "OTHER",
]);

// Kinds of CrmContact. OWNER and BROKER keep their existing databases and IDs;
// CONTACT is everyone else who gives the team information (guards, managers…).
const CONTACT_KINDS = Object.freeze(["OWNER", "BROKER", "CONTACT"]);

const OWNER_TYPES = Object.freeze(["INDIVIDUAL", "COMPANY", "PARTNERSHIP", "OTHER", ""]);

// Configurable via env (comma separated) as the brief asks; these are the defaults.
const BUILDING_TYPES = Object.freeze(
  String(process.env.DATABASE_BUILDING_TYPES || "OFFICE_BUILDING,RETAIL_COMPLEX,MIXED_USE,OTHER")
    .split(",").map((t) => t.trim().toUpperCase()).filter(Boolean),
);

// How far a relationship reaches.
const RELATIONSHIP_SCOPES = Object.freeze(["WHOLE_BUILDING", "FLOORS_UNITS", "PROPERTIES", "OWNER_WIDE", "OTHER"]);
// Kept on the relationship, not the person: someone can be current at one building and former at another.
const RELATIONSHIP_STATES = Object.freeze(["CURRENT", "FORMER", "UNCONFIRMED"]);
// Being a source is not authority: authority is stated separately.
const AUTHORITY_LEVELS = Object.freeze(["UNCONFIRMED", "REPORTED", "VERIFIED"]);

// Availability verification of a property, separate from owner/contact verification.
// OVERDUE is worked out from the due date, never stored.
const VERIFICATION_STATES = Object.freeze(["NEVER", "PENDING", "CONFIRMED_OWNER", "CONFIRMED_REPRESENTATIVE", "DISPUTED"]);
const OCCUPANCY_STATES = Object.freeze(["UNKNOWN", "VACANT", "OCCUPIED"]);

const INTERACTION_TYPES = Object.freeze(["CALL", "NOTE", "SOURCE_REPORT", "VERIFICATION", "OWNERSHIP_CHANGE", "RELATIONSHIP_CHANGE"]);
const CALL_OUTCOMES = Object.freeze([
  "CONNECTED",
  "INVENTORY_AVAILABLE",
  "NO_CURRENT_INVENTORY",
  "CALL_LATER",
  "NO_ANSWER",
  "BUSY_SWITCHED_OFF",
  "WRONG_NUMBER",
  "NOT_INTERESTED",
  "DO_NOT_CONTACT",
  "OTHER",
]);
// A call outcome that sets a follow-up when none is given (days).
const OUTCOME_FOLLOW_UP_DAYS = Object.freeze({ CALL_LATER: 1, NO_ANSWER: 1, BUSY_SWITCHED_OFF: 1, CONNECTED: 7, INVENTORY_AVAILABLE: 3 });

// How long a confirmed availability stays fresh before it is due again.
const VERIFICATION_DUE_DAYS = Number(process.env.DATABASE_VERIFICATION_DUE_DAYS) || 30;

// Who can merge and archive (spec 1.7): the people who can already merge contacts.
const DATABASE_MANAGE_ROLES = Object.freeze(["ADMIN", "MANAGER"]);
const DATABASE_ROLES = Object.freeze(["ADMIN", "MANAGER", "EXECUTIVE", "INSIDE_EXECUTIVE", "FIELD_EXECUTIVE"]);

module.exports = {
  CONTACT_ROLES,
  CONTACT_KINDS,
  OWNER_TYPES,
  BUILDING_TYPES,
  RELATIONSHIP_SCOPES,
  RELATIONSHIP_STATES,
  AUTHORITY_LEVELS,
  VERIFICATION_STATES,
  OCCUPANCY_STATES,
  INTERACTION_TYPES,
  CALL_OUTCOMES,
  OUTCOME_FOLLOW_UP_DAYS,
  VERIFICATION_DUE_DAYS,
  DATABASE_MANAGE_ROLES,
  DATABASE_ROLES,
};
