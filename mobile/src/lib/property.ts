import type { Property } from "../api/inventory";
import type { Tone } from "../theme/tokens";
import { formatPrice } from "./money";

export const INVENTORY_STATUS: Record<string, { label: string; tone: Tone }> = {
  Available: { label: "Available", tone: "success" },
  // Stored as Blocked; the list API reports it as Reserved.
  Blocked: { label: "Reserved", tone: "warning" },
  Reserved: { label: "Reserved", tone: "warning" },
  Sold: { label: "Sold", tone: "neutral" },
};

export const FURNISHING: Record<string, string> = {
  BARE_SHELL: "Bare shell",
  WARM_SHELL: "Warm shell",
  UNFURNISHED: "Unfurnished",
  SEMI_FURNISHED: "Semi-furnished",
  FULLY_FURNISHED: "Fully furnished",
  PLUG_AND_PLAY: "Plug & play",
};

export const propertyTitle = (property: Property) =>
  property.title || [property.projectName, property.towerName].filter(Boolean).join(" · ") || property.propertyId || "Property";

/* The headline number: sale price, monthly rent, or both. */
export const priceLine = (property: Property) => {
  const sale = property.type !== "Rent" ? formatPrice(property.price) : "";
  const rent = property.type !== "Sale" ? formatPrice(property.rent) : "";
  if (sale && rent) return `${sale} · ${rent}/mo`;
  if (rent) return `${rent}/mo`;
  return sale || "Price on request";
};

const AREA_UNITS: Record<string, string> = { SQ_FT: "sq ft", SQ_M: "sq m", SQ_YD: "sq yd" };

export const areaLine = (property: Property) => {
  const size = property.totalArea || property.carpetArea;
  return size ? `${Math.round(size).toLocaleString("en-IN")} ${AREA_UNITS[property.areaUnit || "SQ_FT"] || "sq ft"}` : "";
};

/* The short spec a list row shows: "2BHK · 1,450 sq ft · Floor 2". */
export const specLine = (property: Property) => {
  const kind =
    property.inventoryType === "RESIDENTIAL"
      ? property.residentialDetails?.bhkType || property.category
      : property.category || "Commercial";
  const floor = typeof property.floorNumber === "number" ? (property.floorNumber === 0 ? "Ground floor" : `Floor ${property.floorNumber}`) : "";
  return [kind, areaLine(property), floor].filter(Boolean).join(" · ");
};

/* "Ground", "3", "3 of 12". */
export const floorLabel = (property: Property) => {
  if (typeof property.floorNumber !== "number") return undefined;
  const floor = property.floorNumber === 0 ? "Ground" : String(property.floorNumber);
  return property.totalFloors ? `${floor} of ${property.totalFloors}` : floor;
};

/* Location, then city and pincode only when the location doesn't already spell them out. */
export const fullAddress = (property: Property) => {
  const location = String(property.location || "").trim();
  const lower = location.toLowerCase();
  const extras = [property.city, property.pincode].filter((part) => part && !lower.includes(String(part).toLowerCase()));
  return [location, ...extras].filter(Boolean).join(", ");
};

/* camelCase amenity keys -> "Modular kitchen"; only the ones switched on. */
export const amenityLabels = (amenities?: Record<string, unknown> | null) =>
  Object.entries(amenities || {})
    .filter(([, value]) => value === true)
    .map(([key]) => key.replace(/([A-Z])/g, " $1").replace(/^\w/, (c) => c.toUpperCase()).replace(/\s+(\w)/g, (_m, c: string) => ` ${c.toLowerCase()}`));
