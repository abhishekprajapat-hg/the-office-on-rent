/*
 * Unit-by-unit lists on a commercial project (web Projects form: offices,
 * shops, showrooms). Drafts hold what is typed; the payload is shaped exactly
 * as the web sends it. Pure; unit tested.
 */

export type UnitGroup = "offices" | "shops" | "showrooms";
export type UnitDraft = Record<string, string> & { _key: string };

export const UNIT_STATUSES = [
  { key: "AVAILABLE", label: "Available" },
  { key: "BOOKED", label: "Booked" },
  { key: "SOLD", label: "Sold" },
  { key: "LEASED", label: "Leased" },
  { key: "RESERVED", label: "Reserved" },
];
export const FACINGS = [
  { key: "NORTH", label: "N" },
  { key: "SOUTH", label: "S" },
  { key: "EAST", label: "E" },
  { key: "WEST", label: "W" },
  { key: "NORTH_EAST", label: "NE" },
  { key: "NORTH_WEST", label: "NW" },
  { key: "SOUTH_EAST", label: "SE" },
  { key: "SOUTH_WEST", label: "SW" },
];
export const OFFICE_TYPES = [
  { key: "STANDARD_OFFICE", label: "Standard" },
  { key: "EXECUTIVE_OFFICE", label: "Executive" },
  { key: "PREMIUM_OFFICE", label: "Premium" },
  { key: "CO_WORKING_OFFICE", label: "Co-working" },
  { key: "CABIN_OFFICE", label: "Cabin" },
  { key: "OPEN_WORKSPACE", label: "Open workspace" },
];

type Spec = { label: string; codeField: string; prefix: string; numbers: string[]; texts: string[]; parkingField: string };

/* Per group: its code field, code prefix, and the extra fields it carries. */
export const UNIT_SPECS: Record<UnitGroup, Spec> = {
  offices: { label: "Office", codeField: "officeCode", prefix: "OFF", numbers: ["superBuiltUpArea"], texts: ["officeName", "officeType", "plc", "remarks"], parkingField: "reservedParking" },
  shops: { label: "Shop", codeField: "shopCode", prefix: "SHOP", numbers: [], texts: [], parkingField: "parking" },
  showrooms: { label: "Showroom", codeField: "showroomCode", prefix: "SR", numbers: ["entranceWidth", "ceilingHeight"], texts: [], parkingField: "parking" },
};

const COMMON_NUMBERS = ["length", "breadth", "height", "carpetArea", "builtUpArea", "startingRate", "currentRate"];

const str = (value: unknown) => (value === null || value === undefined ? "" : String(value));
let counter = 0;
const newKey = () => `unit_${Date.now().toString(36)}_${(counter += 1)}`;

export const unitDraftFrom = (group: UnitGroup, unit: Record<string, unknown>): UnitDraft => {
  const spec = UNIT_SPECS[group];
  const fields = [spec.codeField, "floorNumber", "facing", "status", spec.parkingField, ...COMMON_NUMBERS, ...spec.numbers, ...spec.texts];
  const draft = Object.fromEntries(fields.map((key) => [key, str(unit[key])])) as UnitDraft;
  draft.status = draft.status || "AVAILABLE";
  draft._key = String(unit._id || newKey());
  return draft;
};

/* The next code in the web's pattern: OFF-001, SHOP-002… */
export const newUnit = (group: UnitGroup, count: number): UnitDraft => {
  const spec = UNIT_SPECS[group];
  return { ...unitDraftFrom(group, {}), [spec.codeField]: `${spec.prefix}-${String(count + 1).padStart(3, "0")}` };
};

/* Length × breadth fills the carpet area, as the web does while typing. */
export const withDimension = (draft: UnitDraft, field: "length" | "breadth", value: string): UnitDraft => {
  const next = { ...draft, [field]: value };
  const length = Number(next.length);
  const breadth = Number(next.breadth);
  if (Number.isFinite(length) && Number.isFinite(breadth) && length > 0 && breadth > 0) next.carpetArea = String(Math.round(length * breadth * 100) / 100);
  return next;
};

/* The web's checks, labelled "Office 2: …". */
export const unitError = (draft: UnitDraft, label: string) => {
  if (draft.length === "" || !(Number(draft.length) > 0)) return `${label}: length must be more than 0`;
  if (draft.breadth === "" || !(Number(draft.breadth) > 0)) return `${label}: breadth must be more than 0`;
  if (draft.height !== "" && Number(draft.height) < 0) return `${label}: height can't be negative`;
  if (draft.startingRate !== "" && draft.currentRate !== "" && Number(draft.currentRate) < Number(draft.startingRate)) return `${label}: current rate can't be below the starting rate`;
  return null;
};

export const unitsError = (units: Record<UnitGroup, UnitDraft[]>) => {
  for (const group of Object.keys(UNIT_SPECS) as UnitGroup[]) {
    for (let index = 0; index < units[group].length; index += 1) {
      const problem = unitError(units[group][index]!, `${UNIT_SPECS[group].label} ${index + 1}`);
      if (problem) return problem;
    }
  }
  return null;
};

const numOrNull = (value: string) => (value.trim() !== "" && Number.isFinite(Number(value)) ? Number(value) : null);
const numOrZero = (value: string) => numOrNull(value) ?? 0;

export const unitPayload = (group: UnitGroup, draft: UnitDraft) => {
  const spec = UNIT_SPECS[group];
  return {
    [spec.codeField]: draft[spec.codeField]!.trim(),
    floorNumber: Number(draft.floorNumber),
    length: Number(draft.length),
    breadth: Number(draft.breadth),
    height: numOrNull(draft.height!),
    carpetArea: numOrNull(draft.carpetArea!),
    builtUpArea: numOrNull(draft.builtUpArea!),
    facing: draft.facing,
    [spec.parkingField]: numOrZero(draft[spec.parkingField] || ""),
    status: draft.status,
    startingRate: numOrNull(draft.startingRate!),
    currentRate: numOrNull(draft.currentRate!),
    ...Object.fromEntries(spec.numbers.map((key) => [key, numOrNull(draft[key] || "")])),
    ...Object.fromEntries(spec.texts.map((key) => [key, key === "officeType" ? draft[key] || "" : (draft[key] || "").trim()])),
  };
};

/* "Floor 3 · 1,200 sq ft · Available" for the list row. */
export const unitSummary = (draft: UnitDraft) =>
  [
    draft.floorNumber !== "" ? `Floor ${draft.floorNumber}` : null,
    draft.carpetArea ? `${Number(draft.carpetArea).toLocaleString("en-IN")} sq ft` : null,
    UNIT_STATUSES.find((item) => item.key === draft.status)?.label,
  ]
    .filter(Boolean)
    .join(" · ");
