// "Unavailable" (3 Nov 2026, 5): withdrawn or not for sale right now; kept for history, never deleted.
const INVENTORY_STATUSES = ["Available", "Blocked", "Sold", "Unavailable"];
const INVENTORY_TYPES = ["Sale", "Rent", "Both"];
const INVENTORY_SALE_PAYMENT_MODES = [
  "UPI",
  "CASH",
  "CHECK",
  "NET_BANKING_NEFTRTGSIMPS",
];
const INVENTORY_SALE_PAYMENT_TYPES = ["FULL", "PARTIAL"];
const INVENTORY_DEAL_TYPES = ["PURCHASE", "RENT", "LEASE"];
const INVENTORY_OWNER_TYPES = ["1ST", "2ND", "3RD", "POWER_OF_ATTORNEY"];
// People who speak for the owner, listed under Owner Details.
const INVENTORY_OWNER_CONTACT_ROLES = ["MANAGER", "PA", "ACCOUNTANT", "RELATIVE", "BROKER", "OTHER"];

const INVENTORY_REQUEST_TYPES = ["create", "update", "delete"];
const INVENTORY_REQUEST_STATUSES = ["pending", "approved", "rejected"];

// propertyId and unitNumber are server-generated (see generatePropertyId in
// inventoryWorkflow.service.js) and must never be settable from client payloads.
const INVENTORY_ALLOWED_FIELDS = [
  "projectName",
  "towerName",
  "inventoryType",
  "price",
  "rent",
  "deposit",
  "depositMonths",
  "agreementYears",
  "lockInYears",
  "type",
  "category",
  "furnishingStatus",
  "status",
  "reservationReason",
  "reservationLeadId",
  "saleDetails",
  "location",
  "city",
  "area",
  "pincode",
  "buildingName",
  "floorNumber",
  "totalFloors",
  "totalArea",
  "carpetArea",
  "builtUpArea",
  "superBuiltUpArea",
  "length",
  "width",
  "height",
  "areaUnit",
  "maintenanceCharges",
  "priceBasis",
  "pricePerArea",
  "commercialDetails",
  "residentialDetails",
  "documentsAvailable",
  "siteLocation",
  "images",
  "documents",
  "floorPlans",
  "videoTours",
  "officeNumber",
  "ownerName",
  "ownerNumber",
  "ownerWhatsappNumber",
  "ownerContacts",
  "ownerType",
  "ownershipType",
  "businessModel",
  "enterpriseDetails",
  "keyManagerName",
  "keyManagerNumber",
  "brokerName",
  "brokerNumber",
  "developerName",
  "developerNumber",
  "dealType",
  "propertyDate",
  "gstApplicable",
  // Requirements 16 Oct 2026 (7.1): where it came from and when it was last checked.
  "sourceType",
  "lastConfirmedAt",
  "projectId",
  "originLeadId",
  // 3 Nov 2026: PLCs that apply to this plot (names from the project's PLC list).
  "appliedPlcs",
  // Database module (Oct 2026): the building, and the contact who reported the unit.
  "buildingId",
  "initialSourceContactId",
];

const INVENTORY_REQUIRED_CREATE_FIELDS = [
  "projectName",
  "towerName",
  "location",
];

const INVENTORY_ACTIVITY_ACTIONS = {
  REQUEST_CREATED: "REQUEST_CREATED",
  REQUEST_APPROVED_CREATE: "REQUEST_APPROVED_CREATE",
  REQUEST_APPROVED_UPDATE: "REQUEST_APPROVED_UPDATE",
  REQUEST_APPROVED_DELETE: "REQUEST_APPROVED_DELETE",
  REQUEST_REJECTED: "REQUEST_REJECTED",
  DIRECT_CREATE: "DIRECT_CREATE",
  DIRECT_UPDATE: "DIRECT_UPDATE",
  DIRECT_DELETE: "DIRECT_DELETE",
  BULK_CREATE: "BULK_CREATE",
};

module.exports = {
  INVENTORY_STATUSES,
  INVENTORY_TYPES,
  INVENTORY_SALE_PAYMENT_MODES,
  INVENTORY_SALE_PAYMENT_TYPES,
  INVENTORY_DEAL_TYPES,
  INVENTORY_OWNER_TYPES,
  INVENTORY_OWNER_CONTACT_ROLES,
  INVENTORY_REQUEST_TYPES,
  INVENTORY_REQUEST_STATUSES,
  INVENTORY_ALLOWED_FIELDS,
  INVENTORY_REQUIRED_CREATE_FIELDS,
  INVENTORY_ACTIVITY_ACTIONS,
};
