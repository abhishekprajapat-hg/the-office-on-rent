/*
 * The centralised project knowledge record (requirements 16 Oct 2026,
 * section 05). One catalogue describes every field: the form draws from it,
 * the server checks against it, completeness is counted from it and the two
 * PDFs read it. `client: false` keeps a field out of the client brochure;
 * `restricted: true` limits it to Admin/Manager.
 *
 * kinds: text | longtext | number | money | date | url | yesno | list
 *
 * `source: "project"` marks a field kept on the project itself and edited in
 * the main project form (Edit project -> Pricing). The knowledge panel shows
 * it read-only and the PDFs read it from there, so it lives in one place.
 * `legacy` names where an older copy may sit in details.pricing.
 */
const F = (key, label, kind = "text", extra = {}) => ({ key, label, kind, client: true, ...extra });
const S = (key, label, options, extra = {}) => F(key, label, "select", { options, ...extra });

const OVERVIEW_FIELDS = [
  F("developer", "Developer / operator"),
  F("description", "Description", "longtext"),
  F("launchDate", "Launch date", "date"),
  F("possessionDate", "Possession date", "date"),
  F("completionDate", "Completion date", "date"),
  F("mapsUrl", "Google Maps link", "url"),
  F("locality", "Locality"),
  F("nearbyLandmarks", "Nearby landmarks", "list"),
  F("roadAccess", "Road access"),
  F("distances", "Verified distances / travel times", "longtext"),
];

const PRICING_FIELDS = [
  F("baseRate", "Base rate", "money"),
  F("rateUnit", "Rate unit (e.g. per sq ft)"),
  F("priceFrom", "Starting price", "money"),
  F("priceTo", "Price up to", "money"),
  F("premiums", "Corner / facing / floor premiums", "longtext"),
  F("plc", "PLC", "text", { source: "project" }),
  F("plcWideRoad", "Wide road PLC", "text", { source: "project" }),
  F("plcGardenFacing", "Garden facing PLC", "text", { source: "project" }),
  F("plcCorner", "Corner plot PLC", "text", { source: "project" }),
  F("plcGardenCorner", "Garden facing + corner PLC", "text", { source: "project" }),
  F("developmentCharges", "Development charges", "text", { source: "project" }),
  F("maintenanceCharges", "Maintenance charges", "text", { source: "project" }),
  F("amenityCharges", "Amenity / club charges", "text", { source: "project" }),
  F("utilityCharges", "Utility connections", "text", { source: "project", legacy: "utilities" }),
  F("parkingCharges", "Parking charges", "text", { source: "project" }),
  F("taxes", "Taxes (GST etc.)", "text", { source: "project" }),
  F("registrationStampDuty", "Registration / stamp duty", "text", { source: "project", legacy: "registration" }),
  F("bookingAmount", "Booking amount", "money"),
  F("paymentSchedule", "Payment schedule / milestones", "longtext"),
];

const LEGAL_FIELDS = [
  F("reraNumber", "RERA registration no."),
  F("reraUrl", "RERA verification link", "url"),
  F("approvingAuthority", "Approving authority"),
  F("approvedLayout", "Approved layout / plan reference"),
  F("permissions", "Relevant permissions & status", "longtext"),
];

const SPEC_FIELDS = {
  RESIDENTIAL: [
    F("residentialType", "Type (plotted, apartment, villa, row house, mixed)"),
    F("sizeRanges", "Size ranges / typical dimensions"),
    F("layoutPlan", "Layout plan"),
    F("plotNumbering", "Plot numbering scheme"),
    F("roadWidths", "Road widths"),
    F("facing", "Facing / orientation"),
    F("developmentStatus", "Development / possession status"),
    // The gated entry / CCTV / roads / water... checklist is in the project's
    // amenities (main form); this is for anything that needs explaining.
    F("infrastructure", "Infrastructure notes", "longtext"),
  ],
  COMMERCIAL: [
    F("commercialCategory", "Category (office, retail, showroom, mixed-use)"),
    F("builtUpArea", "Land / built-up area"),
    F("areaBasis", "Area basis (carpet / built-up / super built-up)"),
    F("floorPlate", "Typical floor plate"),
    F("floorConfiguration", "Floor-wise configuration", "longtext"),
    F("floorToFloorHeight", "Floor-to-floor height"),
    F("clearHeight", "Clear ceiling height"),
    F("deliveryCondition", "Delivery condition"),
    F("combinableUnits", "Units can be combined", "yesno"),
    F("lifts", "Lifts"),
    F("washrooms", "Common washrooms"),
    F("showroomSpecs", "Showroom: frontage, depth, clear height, mezzanine, road access, loading, signage", "longtext"),
    F("buildingInfrastructure", "Parking, power backup & load, fire safety, CCTV, AC, internet, accessibility, water", "longtext"),
    F("leaseRent", "Lease rent / unit basis"),
    F("cam", "CAM / maintenance"),
    F("leaseDeposit", "Lease deposit"),
    F("lockIn", "Lock-in"),
    F("tenure", "Tenure"),
    F("escalation", "Escalation"),
    F("fitOut", "Fit-out / rent-free period"),
    F("leaseBrokerage", "Internal brokerage terms", "longtext", { client: false, restricted: true }),
  ],
  COWORKING: [
    F("operatorBrand", "Operator / brand"),
    S("relationshipType", "Relationship type", ["COMPANY_OPERATED", "MANAGED_WORKSPACE", "THIRD_PARTY_PARTNER_BROKERAGE"]),
    F("building", "Building"),
    F("floor", "Floor"),
    F("address", "Workspace address", "longtext"),
    F("totalArea", "Total area", "number"),
    S("areaUnit", "Area unit", ["SQ_FT", "SQ_M", "SQ_YD"]),
    F("seatCapacity", "Total seat capacity", "number"),
    F("operatingHours", "Operating hours", "longtext"),
    S("operationalStatus", "Operational status", ["PLANNED", "OPERATIONAL", "TEMPORARILY_CLOSED", "INACTIVE"]),
    F("capacity", "Additional capacity details"),
    F("cabinCount", "Number of cabins", "number", { completeness: false }),
    F("cabinCapacityMin", "Cabin capacity from (seats)", "number", { completeness: false }),
    F("cabinCapacityMax", "Cabin capacity to (seats)", "number", { completeness: false }),
    F("cabins", "Cabins & capacity range"),
    F("dedicatedDeskCount", "Dedicated desks", "number", { completeness: false }),
    F("hotDeskCount", "Hot desks", "number", { completeness: false }),
    F("desks", "Additional desk details"),
    F("privateOfficeCount", "Private office count", "number", { completeness: false }),
    F("privateOffices", "Private office options"),
    F("meetingRoomCount", "Meeting rooms", "number", { completeness: false }),
    F("conferenceRoomCount", "Conference rooms", "number", { completeness: false }),
    F("trainingRoomCount", "Training rooms", "number", { completeness: false }),
    F("meetingRooms", "Meeting / conference / training rooms"),
    F("expansion", "Expansion options"),
    F("cabinRate", "Cabin rate", "money", { completeness: false }),
    S("cabinRateBasis", "Cabin rate basis", ["MONTHLY", "DAILY"], { completeness: false }),
    F("seatRate", "Seat rate", "money", { completeness: false }),
    S("seatRateBasis", "Seat rate basis", ["MONTHLY", "DAILY"], { completeness: false }),
    F("dedicatedDeskRate", "Dedicated desk rate", "money", { completeness: false }),
    S("dedicatedDeskRateBasis", "Dedicated desk rate basis", ["MONTHLY", "DAILY"], { completeness: false }),
    F("hotDeskRate", "Hot desk rate", "money", { completeness: false }),
    S("hotDeskRateBasis", "Hot desk rate basis", ["MONTHLY", "DAILY", "HOURLY"], { completeness: false }),
    F("meetingRoomRate", "Meeting room rate", "money", { completeness: false }),
    S("meetingRoomRateBasis", "Meeting room rate basis", ["HOURLY", "HALF_DAY", "FULL_DAY"], { completeness: false }),
    F("conferenceRoomRate", "Conference room rate", "money", { completeness: false }),
    S("conferenceRoomRateBasis", "Conference room rate basis", ["HOURLY", "HALF_DAY", "FULL_DAY"], { completeness: false }),
    F("seatPricing", "Additional pricing details", "longtext"),
    F("deposit", "Deposit"),
    F("securityDeposit", "Security deposit (Rs)", "money", { completeness: false }),
    F("lockIn", "Lock-in"),
    F("noticePeriod", "Notice period"),
    F("includedServices", "Included services", "longtext"),
    F("extraCharges", "Extra charges & taxes", "longtext"),
    F("taxes", "Taxes (GST etc.)", "longtext", { completeness: false }),
    F("partnerTerms", "Partner brokerage / referral terms", "longtext", { client: false, restricted: true }),
  ],
};

const CONTACT_ROLES = ["SALES", "SITE", "DEVELOPER", "MANAGER", "RECEPTION", "MAINTENANCE", "ESCALATION", "LEGAL", "OTHER"];
const AMENITY_STATUSES = ["AVAILABLE", "PLANNED", "NOT_AVAILABLE"];
const DOCUMENT_CATEGORIES = ["BROCHURE", "LAYOUT", "PRICE_LIST", "FLOOR_PLAN", "APPROVAL", "OC_CC", "FIRE_SAFETY", "PAYMENT_PLAN", "AGREEMENT", "OTHER"];
// 5.5: residential (entrance, roads, layouts, gardens, amenities, plots,
// villas, progress), commercial (elevation, offices, showrooms, floor plans,
// parking, lobby, progress), coworking (interiors, cabins, open seating,
// meeting rooms, reception, pantry, amenities).
const MEDIA_CATEGORIES = [
  "ENTRANCE", "ELEVATION", "ROADS", "LAYOUT", "GARDENS", "AMENITIES", "PLOTS", "VILLAS", "UNITS",
  "OFFICES", "SHOWROOMS", "FLOOR_PLANS", "INTERIORS", "CABINS", "OPEN_SEATING", "MEETING_ROOMS",
  "RECEPTION", "PANTRY", "PARKING", "LOBBY", "PROGRESS", "OTHER",
];

// Standard amenity / service lists per segment, offered as one-click adds in
// the Amenities tab (5.2-5.4). Coworking ones can be marked chargeable.
const AMENITY_PRESETS = {
  RESIDENTIAL: ["Gated entry", "24x7 security", "CCTV", "Gardens", "Clubhouse", "Kids play area", "Internal roads", "Street lighting", "Water supply", "Electricity connection", "Drainage / sewerage", "Parking"],
  COMMERCIAL: ["Parking", "Power backup", "Lifts", "Fire safety", "CCTV / security", "Central AC", "Internet provision", "Accessibility", "Water", "Common washrooms", "Maintenance"],
  COWORKING: ["Internet", "Wi-Fi backup", "Power backup", "AC", "Reception", "Housekeeping", "Security", "Pantry", "Cafeteria", "Parking", "Lockers", "Access control"],
};
const APPROVAL_STATUSES = ["NOT_STARTED", "APPLIED", "APPROVED", "VERIFIED"];

const RESTRICTED_ROLES = ["ADMIN", "MANAGER"];

const allFields = (category) => [...OVERVIEW_FIELDS, ...PRICING_FIELDS, ...LEGAL_FIELDS, ...(SPEC_FIELDS[category] || [])];

module.exports = {
  OVERVIEW_FIELDS, PRICING_FIELDS, LEGAL_FIELDS, SPEC_FIELDS,
  CONTACT_ROLES, AMENITY_STATUSES, DOCUMENT_CATEGORIES, MEDIA_CATEGORIES, APPROVAL_STATUSES, AMENITY_PRESETS,
  RESTRICTED_ROLES, allFields,
};
