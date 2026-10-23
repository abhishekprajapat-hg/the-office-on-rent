/* Shared bits for the coworking project sections (form and review). */
import { Building2, Handshake, Network } from "lucide-react";
import { humanizeKey } from "./projectKnowledgeFormat";

export const RELATIONSHIP_META = {
  COMPANY_OPERATED: { label: "Company operated", sub: "We run this workspace", icon: Building2 },
  MANAGED_WORKSPACE: { label: "Managed workspace", sub: "We manage it for the owner", icon: Handshake },
  THIRD_PARTY_PARTNER_BROKERAGE: { label: "Partner / brokerage", sub: "Someone else runs it", icon: Network },
};

/* The contact roles every workspace has; the rest are added in the Contacts tab. */
export const COWORKING_CONTACT_ROLES = [
  ["MANAGER", "Workspace manager"],
  ["RECEPTION", "Reception / front desk"],
  ["SALES", "Sales"],
  ["MAINTENANCE", "Maintenance"],
  ["ESCALATION", "Escalation"],
];

/*
 * The spec fields the wizard steps now own. The details accordion leaves
 * these out for a workspace so the same value is not edited in two places;
 * what is left there (address, area) is filled from the main form on save.
 */
export const COWORKING_FORM_KEYS = new Set([
  "relationshipType", "operatorBrand", "building", "floor", "seatCapacity", "operatingHours", "operationalStatus",
  "capacity", "cabinCount", "cabinCapacityMin", "cabinCapacityMax", "cabins",
  "dedicatedDeskCount", "hotDeskCount", "desks", "privateOfficeCount", "privateOffices",
  "meetingRoomCount", "conferenceRoomCount", "trainingRoomCount", "meetingRooms", "expansion",
  "cabinRate", "cabinRateBasis", "seatRate", "seatRateBasis", "dedicatedDeskRate", "dedicatedDeskRateBasis",
  "hotDeskRate", "hotDeskRateBasis", "meetingRoomRate", "meetingRoomRateBasis",
  "conferenceRoomRate", "conferenceRoomRateBasis", "seatPricing",
  "deposit", "securityDeposit", "lockIn", "noticePeriod", "includedServices", "extraCharges", "taxes",
  "partnerTerms",
]);

/* The Review step's workspace rows. */
export const coworkingReviewRows = (specs = {}, amenities = []) => {
  const seats = [specs.cabinCapacityMin, specs.cabinCapacityMax]
    .filter((value) => value !== "" && value !== undefined && value !== null);
  const rooms = [
    [specs.meetingRoomCount, "meeting"],
    [specs.conferenceRoomCount, "conference"],
    [specs.trainingRoomCount, "training"],
  ].filter(([count]) => Number(count) > 0).map(([count, kind]) => `${count} ${kind}`);
  const desks = [
    [specs.dedicatedDeskCount, "dedicated"],
    [specs.hotDeskCount, "hot"],
  ].filter(([count]) => Number(count) > 0).map(([count, kind]) => `${count} ${kind}`);
  const included = amenities.filter((amenity) => String(amenity.status || "").toUpperCase() !== "NOT_AVAILABLE" && !amenity.chargeable).length;
  const chargeable = amenities.filter((amenity) => amenity.chargeable).length;

  return [
    ["Relationship", specs.relationshipType ? (RELATIONSHIP_META[specs.relationshipType]?.label || humanizeKey(specs.relationshipType)) : ""],
    ["Operator / brand", specs.operatorBrand || ""],
    ["Building & floor", [specs.building, specs.floor].filter(Boolean).join(" · ")],
    ["Operational status", specs.operationalStatus ? humanizeKey(specs.operationalStatus) : ""],
    ["Seat capacity", specs.seatCapacity ? `${specs.seatCapacity} seats` : ""],
    ["Cabins", specs.cabinCount ? `${specs.cabinCount}${seats.length ? ` · ${seats.join("–")} seats` : ""}` : ""],
    ["Desks", desks.join(", ")],
    ["Private offices", specs.privateOfficeCount || ""],
    ["Rooms", rooms.join(", ")],
    ["Services", included || chargeable ? `${included} included · ${chargeable} chargeable` : ""],
  ];
};

/*
 * A workspace's address and area are typed once in the main form; the
 * knowledge record keeps its own copies for the PDFs, so fill them from the
 * form when they are still empty (never overwriting what someone typed).
 */
export const withCoworkingDerived = (draft, formData) => {
  const specs = { ...(draft.specs || {}) };
  if (!String(specs.address || "").trim() && String(formData.location || "").trim()) {
    specs.address = formData.location.trim();
  }
  if (!String(specs.totalArea ?? "").trim()) {
    const raw = String(formData.totalLandArea || "");
    const amount = Number.parseFloat(raw.replace(/,/g, ""));
    if (Number.isFinite(amount) && amount > 0) {
      specs.totalArea = String(amount);
      if (!specs.areaUnit) {
        specs.areaUnit = /sq\.?\s*m/i.test(raw) ? "SQ_M" : /sq\.?\s*(yd|yard)/i.test(raw) ? "SQ_YD" : "SQ_FT";
      }
    }
  }
  return { ...draft, specs };
};
