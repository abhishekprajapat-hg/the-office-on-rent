import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import {
  Plus,
  Search,
  Eye,
  Pencil,
  Trash2,
  Copy,
  ChevronDown,
  ChevronUp,
  X,
  Loader,
  Building2,
  UploadCloud,
  MapPin,
  Image as ImageIcon,
  Layers3,
  Loader2,
  Home,
  Briefcase,
  LayoutGrid,
  Map as MapIcon,
  Trees,
  Receipt,
  User,
  ShieldHalf,
  Flag,
  Landmark,
  Hash,
  Sparkles,
  FileText,
} from "lucide-react";
import {
  getProjectsWithMeta,
  getProjectById,
  createProject,
  updateProject,
  deleteProject,
} from "../../services/projectService";
import { deleteOutcomeMessage, isDeleteApprovalPending } from "../../services/deleteRequestService";
import { uploadFile } from "../../services/uploadService";
import { getProjectDetailsCatalogue, getProjectKnowledge, updateProjectDetails } from "../../services/projectService";
import { AmenityStatusEditor, ApprovalStatusSelect, ContactsEditor, DocumentUploader, FieldGrid } from "./ProjectKnowledgeFields";
import { emptyKnowledgeDraft, humanizeKey, knowledgePatchFromDraft } from "./projectKnowledgeFormat";
import {
  CoworkingBasicsFields, CoworkingContactsFields, CoworkingPartnerTerms, CoworkingPricingFields, CoworkingServicesEditor,
} from "./ProjectCoworkingFields";
import { COWORKING_FORM_KEYS, coworkingReviewRows, withCoworkingDerived } from "./projectCoworkingFormat";
import { toErrorMessage } from "../../utils/errorMessage";
import { useDebouncedValue } from "../../hooks/useDebouncedValue";
import { usePermissions } from "../../context/usePermissions";
import ToastNotice from "../../components/ui/ToastNotice";
import FittedImage from "../../components/ui/FittedImage";
import FormWizard from "../../components/ui/FormWizard";
import { ChoiceCards, FormCollapsible, FormField, FormGroup, FormInput, PickChips, ReviewGroup } from "../../components/ui/formKit";
import {
  PROJECT_CATEGORY_OPTIONS,
  PROJECT_TYPE_OPTIONS,
  PLOT_BASED_PROJECT_TYPES,
  plotSizeRangeFromProject,
  PROJECT_BHK_OPTIONS,
  PROJECT_STATUS_OPTIONS,
  PROJECT_AMENITY_OPTIONS,
  PROJECT_HOUSING_CATEGORY_OPTIONS,
  PROJECT_OFFICE_TYPE_OPTIONS,
  PROJECT_FACING_OPTIONS,
  PROJECT_UNIT_STATUS_OPTIONS,
  PROJECT_COMMERCIAL_AMENITY_OPTIONS,
  getProjectOptionLabel,
} from "../../config/projectConfig";

const isPlotBasedType = (projectType) => PLOT_BASED_PROJECT_TYPES.includes(projectType);
const isBuildingType = (projectType) => projectType === "BUILDING";
const isCommercialCategory = (projectCategory) => projectCategory === "COMMERCIAL";
// Coworking workspaces have no project type or unit grid here; their details
// go in the project's knowledge record (requirements 16 Oct 2026, 5.4).
const isCoworkingCategory = (projectCategory) => projectCategory === "COWORKING";

const makeUnitKey = () => `unit_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

const DEFAULT_OFFICE = {
  officeCode: "",
  officeName: "",
  floorNumber: "",
  officeType: "",
  length: "",
  breadth: "",
  height: "",
  carpetArea: "",
  builtUpArea: "",
  superBuiltUpArea: "",
  facing: "",
  reservedParking: "",
  status: "AVAILABLE",
  startingRate: "",
  currentRate: "",
  plc: "",
  remarks: "",
};

const DEFAULT_SHOP = {
  shopCode: "",
  floorNumber: "",
  length: "",
  breadth: "",
  height: "",
  carpetArea: "",
  builtUpArea: "",
  facing: "",
  parking: "",
  status: "AVAILABLE",
  startingRate: "",
  currentRate: "",
};

const DEFAULT_SHOWROOM = {
  showroomCode: "",
  floorNumber: "",
  length: "",
  breadth: "",
  height: "",
  carpetArea: "",
  builtUpArea: "",
  entranceWidth: "",
  ceilingHeight: "",
  parking: "",
  status: "AVAILABLE",
  startingRate: "",
  currentRate: "",
};

const SOLD_LIKE_UNIT_STATUSES = new Set(["SOLD", "LEASED", "BOOKED"]);

const DEFAULT_BHK_CONFIG = {
  size: "",
  bedrooms: "",
  kitchens: "",
  washrooms: "",
  drawingRooms: "",
  balconies: "",
  servantRoom: false,
  reservedParking: "",
};

const OFFICE_FIELDS = [
  { key: "officeName", label: "Office Name (Optional)", type: "text", placeholder: "Marketing Office" },
  { key: "floorNumber", label: "Floor Number", type: "floor" },
  { key: "officeType", label: "Office Type", type: "select", options: PROJECT_OFFICE_TYPE_OPTIONS },
  { key: "length", label: "Length (ft) *", type: "number" },
  { key: "breadth", label: "Breadth (ft) *", type: "number" },
  { key: "height", label: "Height (ft)", type: "number" },
  { key: "carpetArea", label: "Carpet Area (Sq.ft)", type: "number" },
  { key: "builtUpArea", label: "Built-up Area (Sq.ft)", type: "number" },
  { key: "superBuiltUpArea", label: "Super Built-up Area (Sq.ft)", type: "number" },
  { key: "facing", label: "Facing", type: "select", options: PROJECT_FACING_OPTIONS },
  { key: "reservedParking", label: "Reserved Parking", type: "number" },
  { key: "status", label: "Office Status", type: "select", options: PROJECT_UNIT_STATUS_OPTIONS },
  { key: "startingRate", label: "Starting Rate / Sq.ft", type: "number" },
  { key: "currentRate", label: "Current Rate / Sq.ft", type: "number" },
  { key: "plc", label: "PLC", type: "text" },
  { key: "remarks", label: "Remarks", type: "textarea" },
];

const SHOP_FIELDS = [
  { key: "floorNumber", label: "Floor Number", type: "floor" },
  { key: "length", label: "Length (ft) *", type: "number" },
  { key: "breadth", label: "Breadth (ft) *", type: "number" },
  { key: "height", label: "Height (ft)", type: "number" },
  { key: "carpetArea", label: "Carpet Area (Sq.ft)", type: "number" },
  { key: "builtUpArea", label: "Built-up Area (Sq.ft)", type: "number" },
  { key: "facing", label: "Facing", type: "select", options: PROJECT_FACING_OPTIONS },
  { key: "parking", label: "Parking", type: "number" },
  { key: "status", label: "Status", type: "select", options: PROJECT_UNIT_STATUS_OPTIONS },
  { key: "startingRate", label: "Starting Rate / Sq.ft", type: "number" },
  { key: "currentRate", label: "Current Rate / Sq.ft", type: "number" },
];

const SHOWROOM_FIELDS = [
  { key: "floorNumber", label: "Floor Number", type: "floor" },
  { key: "length", label: "Length (ft) *", type: "number" },
  { key: "breadth", label: "Breadth (ft) *", type: "number" },
  { key: "height", label: "Height (ft)", type: "number" },
  { key: "carpetArea", label: "Carpet Area (Sq.ft)", type: "number" },
  { key: "builtUpArea", label: "Built-up Area (Sq.ft)", type: "number" },
  { key: "entranceWidth", label: "Entrance Width (ft)", type: "number" },
  { key: "ceilingHeight", label: "Ceiling Height (ft)", type: "number" },
  { key: "parking", label: "Parking", type: "number" },
  { key: "status", label: "Status", type: "select", options: PROJECT_UNIT_STATUS_OPTIONS },
  { key: "startingRate", label: "Starting Rate / Sq.ft", type: "number" },
  { key: "currentRate", label: "Current Rate / Sq.ft", type: "number" },
];

const PROJECT_MANAGE_ROLES = new Set(["ADMIN", "MANAGER"]);
// A Manager's delete is a request an Admin approves.
const PROJECT_DELETE_ROLES = new Set(["ADMIN", "MANAGER"]);
const MOBILE_PATTERN = /^[0-9]{10}$/;
const PAGE_LIMIT = 25;

// Form styling (CRM Web Glass "New Project Form" design) - theme-aware.
const SECTION_CLASS = "gl-form-section flex flex-col gap-3 rounded-2xl p-4";
const SECTION_HEADING_CLASS = "text-[14px] font-semibold text-[var(--g-ink)]";
const FIELD_TITLE_CLASS = "text-[13px] font-medium text-[var(--g-mut)]";
const INPUT_CLASS =
  "h-[46px] w-full rounded-[13px] border-[1.5px] border-[var(--g-edge)] bg-[var(--g-glassHi)] px-3.5 text-[14px] text-[var(--g-ink)] outline-none transition focus:border-[var(--g-b)] focus:shadow-[0_0_0_4px_var(--g-bs)]";
const CHECKBOX_CLASS =
  "inline-flex min-h-9 items-center gap-1.5 rounded-full border border-[var(--g-edge)] bg-[var(--g-glassHi)] px-3 py-1.5 text-[12.5px] font-medium text-[var(--g-ink)]";

const CATEGORY_CARD_META = {
  RESIDENTIAL: { icon: Home, sub: "Plots, flats, villas" },
  COMMERCIAL: { icon: Briefcase, sub: "Offices, shops, showrooms" },
  COWORKING: { icon: LayoutGrid, sub: "Desks & cabins" },
};
const TYPE_ICON = { PLOTTING: MapIcon, BUILDING: Building2, VILLAS_FARMHOUSE: Trees };
const STATUS_DOT = {
  PRE_LAUNCH: "var(--g-info, var(--g-b))", TNC: "var(--g-vio)", RERA_APPROVED: "var(--g-b)",
  UNDER_CONSTRUCTION: "var(--g-warn)", READY_TO_MOVE: "var(--g-ok)", RESALE: "var(--g-fnt)",
};
const PLC_FIELDS = [["plc", "General PLC"], ["plcWideRoad", "Wide road"], ["plcGardenFacing", "Garden facing"], ["plcCorner", "Corner plot"], ["plcGardenCorner", "Garden + corner"], ["group", "Group"]];
const CHARGE_FIELDS = [
  ["developmentCharges", "Development", "e.g. ₹150/sq.ft"], ["maintenanceCharges", "Maintenance", "e.g. ₹3/sq.ft per month"],
  ["amenityCharges", "Amenity", "e.g. ₹1,00,000 one time"], ["utilityCharges", "Utilities (water / electricity)", "e.g. ₹75,000"],
  ["parkingCharges", "Parking", "e.g. ₹2,50,000 per slot"], ["taxes", "Taxes (GST etc.)", "e.g. 5% GST"],
  ["registrationStampDuty", "Registration / stamp duty", "e.g. 7% of agreement value"],
];
const WIZARD_STEPS = [
  { key: "basic", label: "Basics", hint: "Category & size" },
  { key: "pricing", label: "Pricing", hint: "Rates & PLC" },
  { key: "location", label: "Location", hint: "Address & contacts" },
  { key: "features", label: "Features", hint: "Status & amenities" },
  { key: "review", label: "Review", hint: "Check & save" },
];
// Which wizard step a validateForm() message belongs to.
const stepOfError = (message = "") => {
  if (!message) return -1;
  if (/^(Starting|Current) Rate/.test(message)) return 1;
  if (/Mobile/.test(message)) return 2;
  if (/^Status is required/.test(message)) return 3;
  return 0;
};

const DEFAULT_FORM = {
  projectCategory: "",
  projectType: "",
  projectName: "",
  totalLandArea: "",
  totalPlots: "",
  plotSizeMin: "",
  plotSizeMax: "",
  numberOfFlats: "",
  numberOfFloors: "",
  flatsPerFloor: "",
  bhkConfigurations: [],
  totalFloors: "",
  totalOffices: "",
  officesPerFloor: "",
  totalShops: "",
  totalShowrooms: "",
  offices: [],
  shops: [],
  showrooms: [],
  plc: "",
  plcWideRoad: "",
  plcGardenFacing: "",
  plcCorner: "",
  plcGardenCorner: "",
  group: "",
  startingRate: "",
  currentRate: "",
  otherCharges: "",
  developmentCharges: "",
  maintenanceCharges: "",
  amenityCharges: "",
  utilityCharges: "",
  parkingCharges: "",
  taxes: "",
  registrationStampDuty: "",
  otherFacilities: "",
  status: "",
  amenities: [],
  housingCategory: "",
  location: "",
  landmark: "",
  city: "",
  state: "",
  pincode: "",
  locationLat: "",
  locationLng: "",
  ownerManagerName: "",
  ownerManagerMobile: "",
  brokerManagerName: "",
  brokerManagerMobile: "",
  plotsAvailable: "",
  images: [],
};

const toFormFromProject = (project = {}) => ({
  projectCategory: project.projectCategory || "",
  projectType: project.projectType || "",
  projectName: project.projectName || "",
  totalLandArea: project.totalLandArea || "",
  totalPlots: project.totalPlots ?? "",
  ...plotSizeRangeFromProject(project),
  numberOfFlats: project.numberOfFlats ?? "",
  numberOfFloors: project.numberOfFloors ?? "",
  flatsPerFloor: project.flatsPerFloor ?? "",
  bhkConfigurations: Array.isArray(project.bhkConfigurations)
    ? project.bhkConfigurations.map((entry) => ({
      bhk: entry.bhk,
      size: entry.size ?? "",
      bedrooms: entry.bedrooms ?? "",
      kitchens: entry.kitchens ?? "",
      washrooms: entry.washrooms ?? "",
      drawingRooms: entry.drawingRooms ?? "",
      balconies: entry.balconies ?? "",
      servantRoom: Boolean(entry.servantRoom),
      reservedParking: entry.reservedParking ?? "",
    }))
    : [],
  totalFloors: project.totalFloors ?? "",
  totalOffices: project.totalOffices ?? "",
  officesPerFloor: project.officesPerFloor ?? "",
  totalShops: project.totalShops ?? "",
  totalShowrooms: project.totalShowrooms ?? "",
  offices: Array.isArray(project.offices)
    ? project.offices.map((entry) => ({ ...DEFAULT_OFFICE, ...entry, _key: entry._id || makeUnitKey() }))
    : [],
  shops: Array.isArray(project.shops)
    ? project.shops.map((entry) => ({ ...DEFAULT_SHOP, ...entry, _key: entry._id || makeUnitKey() }))
    : [],
  showrooms: Array.isArray(project.showrooms)
    ? project.showrooms.map((entry) => ({ ...DEFAULT_SHOWROOM, ...entry, _key: entry._id || makeUnitKey() }))
    : [],
  plc: project.plc || "",
  plcWideRoad: project.plcWideRoad || "",
  plcGardenFacing: project.plcGardenFacing || "",
  plcCorner: project.plcCorner || "",
  plcGardenCorner: project.plcGardenCorner || "",
  group: project.group || "",
  startingRate: project.startingRate ?? "",
  currentRate: project.currentRate ?? "",
  otherCharges: project.otherCharges || "",
  developmentCharges: project.developmentCharges || "",
  maintenanceCharges: project.maintenanceCharges || "",
  amenityCharges: project.amenityCharges || "",
  utilityCharges: project.utilityCharges || "",
  parkingCharges: project.parkingCharges || "",
  taxes: project.taxes || "",
  registrationStampDuty: project.registrationStampDuty || "",
  otherFacilities: project.otherFacilities || "",
  status: project.status || "",
  amenities: Array.isArray(project.amenities) ? project.amenities : [],
  housingCategory: project.housingCategory || "",
  location: project.location || "",
  landmark: project.landmark || "",
  city: project.city || "",
  state: project.state || "",
  pincode: project.pincode || "",
  locationLat: project.siteLocation?.lat ?? "",
  locationLng: project.siteLocation?.lng ?? "",
  ownerManagerName: project.ownerManagerName || "",
  ownerManagerMobile: project.ownerManagerMobile || "",
  brokerManagerName: project.brokerManagerName || "",
  brokerManagerMobile: project.brokerManagerMobile || "",
  plotsAvailable: project.plotsAvailable ?? "",
  images: Array.isArray(project.images) ? project.images : [],
});

const numOrZero = (value) => (value === "" || value === null || value === undefined ? 0 : Number(value));
const numOrNull = (value) => (value === "" || value === null || value === undefined ? null : Number(value));

const buildProjectPayload = (formData) => {
  const isCommercial = isCommercialCategory(formData.projectCategory);
  const isCoworking = isCoworkingCategory(formData.projectCategory);
  const isPlotBased = !isCommercial && !isCoworking && isPlotBasedType(formData.projectType);
  const isBuilding = !isCommercial && !isCoworking && isBuildingType(formData.projectType);

  const payload = {
    projectCategory: formData.projectCategory,
    projectType: isCommercial || isCoworking ? "" : formData.projectType,
    projectName: formData.projectName.trim(),
    totalLandArea: formData.totalLandArea.trim(),
    plc: formData.plc.trim(),
    plcWideRoad: (formData.plcWideRoad || "").trim(),
    plcGardenFacing: (formData.plcGardenFacing || "").trim(),
    plcCorner: (formData.plcCorner || "").trim(),
    plcGardenCorner: (formData.plcGardenCorner || "").trim(),
    group: formData.group.trim(),
    startingRate: Number(formData.startingRate),
    currentRate: Number(formData.currentRate),
    otherCharges: formData.otherCharges.trim(),
    developmentCharges: (formData.developmentCharges || "").trim(),
    maintenanceCharges: (formData.maintenanceCharges || "").trim(),
    amenityCharges: (formData.amenityCharges || "").trim(),
    utilityCharges: (formData.utilityCharges || "").trim(),
    parkingCharges: (formData.parkingCharges || "").trim(),
    taxes: (formData.taxes || "").trim(),
    registrationStampDuty: (formData.registrationStampDuty || "").trim(),
    otherFacilities: (formData.otherFacilities || "").trim(),
    status: formData.status,
    amenities: formData.amenities,
    housingCategory: isCommercial || isCoworking ? "" : formData.housingCategory,
    location: formData.location.trim(),
    ownerManagerName: formData.ownerManagerName.trim(),
    ownerManagerMobile: formData.ownerManagerMobile.trim(),
    brokerManagerName: formData.brokerManagerName.trim(),
    brokerManagerMobile: formData.brokerManagerMobile.trim(),
    images: Array.isArray(formData.images) ? formData.images : [],
  };

  if (isPlotBased) {
    payload.totalPlots = Number(formData.totalPlots);
    payload.plotSizeMin = formData.plotSizeMin === "" ? null : Number(formData.plotSizeMin);
    payload.plotSizeMax = formData.plotSizeMax === "" ? null : Number(formData.plotSizeMax);
    // The range replaces the older single plot size.
    payload.plotSize = "";
    payload.customPlotSize = "";
    payload.plotsAvailable = formData.plotsAvailable === "" ? 0 : Number(formData.plotsAvailable);
  }

  if (isBuilding) {
    payload.numberOfFlats = Number(formData.numberOfFlats);
    payload.numberOfFloors = Number(formData.numberOfFloors);
    payload.flatsPerFloor = Number(formData.flatsPerFloor);
    payload.bhkConfigurations = formData.bhkConfigurations.map((config) => ({
      bhk: config.bhk,
      size: Number(config.size),
      bedrooms: config.bedrooms === "" ? 0 : Number(config.bedrooms),
      kitchens: config.kitchens === "" ? 0 : Number(config.kitchens),
      washrooms: config.washrooms === "" ? 0 : Number(config.washrooms),
      drawingRooms: config.drawingRooms === "" ? 0 : Number(config.drawingRooms),
      balconies: config.balconies === "" ? 0 : Number(config.balconies),
      servantRoom: Boolean(config.servantRoom),
      reservedParking: config.reservedParking === "" ? 0 : Number(config.reservedParking),
    }));
  }

  if (isCommercial || isCoworking) {
    payload.landmark = formData.landmark.trim();
    payload.city = formData.city.trim();
    payload.state = formData.state.trim();
    payload.pincode = formData.pincode.trim();
    payload.siteLocation = { lat: numOrNull(formData.locationLat), lng: numOrNull(formData.locationLng) };
  }

  if (isCommercial) {
    payload.totalFloors = Number(formData.totalFloors);
    payload.officesPerFloor = Number(formData.officesPerFloor);
    payload.totalOffices = numOrZero(formData.totalOffices);
    payload.totalShops = numOrZero(formData.totalShops);
    payload.totalShowrooms = numOrZero(formData.totalShowrooms);
    payload.offices = formData.offices.map((office) => ({
      officeCode: office.officeCode.trim(),
      officeName: office.officeName.trim(),
      floorNumber: Number(office.floorNumber),
      officeType: office.officeType,
      length: Number(office.length),
      breadth: Number(office.breadth),
      height: numOrNull(office.height),
      carpetArea: numOrNull(office.carpetArea),
      builtUpArea: numOrNull(office.builtUpArea),
      superBuiltUpArea: numOrNull(office.superBuiltUpArea),
      facing: office.facing,
      reservedParking: numOrZero(office.reservedParking),
      status: office.status,
      startingRate: numOrNull(office.startingRate),
      currentRate: numOrNull(office.currentRate),
      plc: office.plc.trim(),
      remarks: office.remarks.trim(),
    }));
    payload.shops = formData.shops.map((shop) => ({
      shopCode: shop.shopCode.trim(),
      floorNumber: Number(shop.floorNumber),
      length: Number(shop.length),
      breadth: Number(shop.breadth),
      height: numOrNull(shop.height),
      carpetArea: numOrNull(shop.carpetArea),
      builtUpArea: numOrNull(shop.builtUpArea),
      facing: shop.facing,
      parking: numOrZero(shop.parking),
      status: shop.status,
      startingRate: numOrNull(shop.startingRate),
      currentRate: numOrNull(shop.currentRate),
    }));
    payload.showrooms = formData.showrooms.map((showroom) => ({
      showroomCode: showroom.showroomCode.trim(),
      floorNumber: Number(showroom.floorNumber),
      length: Number(showroom.length),
      breadth: Number(showroom.breadth),
      height: numOrNull(showroom.height),
      carpetArea: numOrNull(showroom.carpetArea),
      builtUpArea: numOrNull(showroom.builtUpArea),
      entranceWidth: numOrNull(showroom.entranceWidth),
      ceilingHeight: numOrNull(showroom.ceilingHeight),
      parking: numOrZero(showroom.parking),
      status: showroom.status,
      startingRate: numOrNull(showroom.startingRate),
      currentRate: numOrNull(showroom.currentRate),
    }));
  }

  return payload;
};

const validateForm = (formData) => {
  const isCommercial = isCommercialCategory(formData.projectCategory);
  const isPlotBased = !isCommercial && isPlotBasedType(formData.projectType);
  const isBuilding = !isCommercial && isBuildingType(formData.projectType);

  if (!formData.projectCategory) return "Project Category is required";
  if (!isCommercial && !isCoworkingCategory(formData.projectCategory) && !formData.projectType) return "Project Type is required";
  if (!formData.projectName.trim()) return "Project Name is required";
  if (!formData.totalLandArea.trim()) return "Total Land Area is required";

  if (isPlotBased) {
    if (formData.totalPlots === "" || Number(formData.totalPlots) < 0) {
      return "Number of Plots is required and cannot be negative";
    }
    if ([formData.plotSizeMin, formData.plotSizeMax].some((v) => v !== "" && (!Number.isFinite(Number(v)) || Number(v) < 0))) {
      return "Plot sizes must be positive numbers";
    }
    if (formData.plotSizeMin !== "" && formData.plotSizeMax !== "" && Number(formData.plotSizeMin) > Number(formData.plotSizeMax)) {
      return "The smallest plot size can't be bigger than the largest";
    }
    if (
      formData.plotsAvailable !== ""
      && Number(formData.plotsAvailable) > Number(formData.totalPlots)
    ) {
      return "Plots Available cannot exceed Total Number of Plots";
    }
  }

  if (isBuilding) {
    if (formData.numberOfFlats === "" || Number(formData.numberOfFlats) <= 0) {
      return "Number of Flats must be greater than 0";
    }
    if (formData.numberOfFloors === "" || Number(formData.numberOfFloors) <= 0) {
      return "Number of Floors must be greater than 0";
    }
    if (formData.flatsPerFloor === "" || Number(formData.flatsPerFloor) <= 0) {
      return "Flats Per Floor must be greater than 0";
    }
    if (formData.bhkConfigurations.length === 0) {
      return "At least one BHK configuration is required";
    }
    for (const config of formData.bhkConfigurations) {
      const bhkLabel = getProjectOptionLabel(PROJECT_BHK_OPTIONS, config.bhk);
      if (config.size === "" || Number(config.size) <= 0) {
        return `Flat Size for ${bhkLabel} must be greater than 0`;
      }
      const nonNegativeFields = [
        ["bedrooms", "Bedrooms"],
        ["kitchens", "Kitchens"],
        ["washrooms", "Washrooms"],
        ["drawingRooms", "Drawing Rooms"],
        ["balconies", "Balconies"],
        ["reservedParking", "Reserved Parking"],
      ];
      for (const [field, label] of nonNegativeFields) {
        if (config[field] !== "" && Number(config[field]) < 0) {
          return `${label} for ${bhkLabel} cannot be negative`;
        }
      }
    }
  }

  if (isCommercial) {
    if (formData.totalFloors === "" || Number(formData.totalFloors) <= 0) {
      return "Total Floors must be greater than 0";
    }
    if (formData.officesPerFloor === "" || Number(formData.officesPerFloor) <= 0) {
      return "Offices Per Floor must be greater than 0";
    }

    const unitGroups = [
      ["offices", "Office", formData.offices],
      ["shops", "Shop", formData.shops],
      ["showrooms", "Showroom", formData.showrooms],
    ];
    for (const [, unitLabel, units] of unitGroups) {
      for (let index = 0; index < units.length; index += 1) {
        const unit = units[index];
        const label = `${unitLabel} ${index + 1}`;
        if (unit.length === "" || Number(unit.length) <= 0) {
          return `${label}: Length must be greater than 0`;
        }
        if (unit.breadth === "" || Number(unit.breadth) <= 0) {
          return `${label}: Breadth must be greater than 0`;
        }
        if (unit.height !== "" && Number(unit.height) < 0) {
          return `${label}: Height cannot be negative`;
        }
        if (
          unit.startingRate !== ""
          && unit.currentRate !== ""
          && Number(unit.currentRate) < Number(unit.startingRate)
        ) {
          return `${label}: Current Rate cannot be less than Starting Rate`;
        }
      }
    }
  }

  if (formData.startingRate === "" || Number(formData.startingRate) < 0) {
    return "Starting Rate is required and cannot be negative";
  }
  if (formData.currentRate === "" || Number(formData.currentRate) < 0) {
    return "Current Rate is required and cannot be negative";
  }
  if (Number(formData.currentRate) < Number(formData.startingRate)) {
    return "Current Rate cannot be less than Starting Rate";
  }
  if (!formData.status) return "Status is required";
  if (formData.ownerManagerMobile && !MOBILE_PATTERN.test(formData.ownerManagerMobile)) {
    return "Owner / Manager Mobile must be a valid 10-digit number";
  }
  if (formData.brokerManagerMobile && !MOBILE_PATTERN.test(formData.brokerManagerMobile)) {
    return "Broker Manager Mobile must be a valid 10-digit number";
  }
  return "";
};

const formatCurrency = (value) => {
  if (value === null || value === undefined || value === "") return "-";
  const num = Number(value);
  if (!Number.isFinite(num)) return "-";
  return `₹${num.toLocaleString("en-IN")}`;
};

const StatusPill = ({ status }) => {
  const label = getProjectOptionLabel(PROJECT_STATUS_OPTIONS, status) || "-";
  return (
    <span className="inline-flex items-center rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide text-emerald-700">
      {label}
    </span>
  );
};

const ProjectMeta = ({ icon, label, value }) => (
  <div className="min-w-0 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2">
    <div className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-widest text-slate-400">
      {React.createElement(icon, { size: 12 })}
      {label}
    </div>
    <div className="mt-1 truncate text-sm font-semibold text-slate-800">{value ?? "-"}</div>
  </div>
);

const ProjectCard = ({ project, canManage, canDelete, onView, onEdit, onDelete }) => {
  const image = Array.isArray(project?.images) ? project.images[0] : "";
  const imageCount = Array.isArray(project?.images) ? project.images.length : 0;
  const commercial = isCommercialCategory(project?.projectCategory);

  // Offices for commercial, flats for a building, plots otherwise.
  const secondaryMeta = commercial
    ? { label: "Total Offices", value: project.totalOffices || project.offices?.length || (project.totalFloors && project.officesPerFloor ? project.totalFloors * project.officesPerFloor : 0) }
    : String(project?.projectType || "").toUpperCase() === "BUILDING"
      ? { label: "Total Flats", value: project.numberOfFlats ?? "-" }
      : { label: "Total Plots", value: project.totalPlots ?? "-" };

  return (
    <article className="group flex h-full flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:border-emerald-300 hover:shadow-lg">
      <button
        type="button"
        onClick={() => onView(project)}
        className="relative block h-40 w-full overflow-hidden bg-slate-100 text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 sm:h-52"
        aria-label={`View ${project.projectName}`}
      >
        {image ? (
          <FittedImage src={image} alt={project.projectName} />
        ) : (
          <div className="flex h-full flex-col items-center justify-center text-slate-300">
            <ImageIcon size={34} />
            <span className="mt-2 text-[10px] font-bold uppercase tracking-widest">No Image</span>
          </div>
        )}
        <div className="absolute left-3 top-3">
          <StatusPill status={project?.status} />
        </div>
        {imageCount > 1 && (
          <div className="absolute bottom-3 right-3 rounded-full bg-slate-950/75 px-2 py-1 text-[10px] font-bold text-white">
            +{imageCount - 1} photos
          </div>
        )}
      </button>

      <div className="flex flex-1 flex-col gap-3 p-3 sm:gap-4 sm:p-4">
        <div className="min-w-0">
          <div className="flex items-start justify-between gap-2 sm:gap-3">
            <div className="min-w-0">
              <h3 className="truncate text-base font-bold text-slate-900">{project.projectName}</h3>
              <p className="mt-1 flex items-center gap-1.5 truncate text-xs font-medium text-slate-500">
                <MapPin size={13} />
                {project.location || "-"}
              </p>
            </div>
            <div className="shrink-0 text-right">
              <div className="text-sm font-extrabold text-slate-950">{formatCurrency(project.currentRate)}</div>
              <div className="mt-0.5 font-mono text-[10px] text-slate-400">{project.projectId}</div>
            </div>
          </div>

          <div className="mt-2 flex flex-wrap gap-1.5 sm:mt-3 sm:gap-2">
            <span className="rounded-full border border-slate-200 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-slate-600">
              {getProjectOptionLabel(PROJECT_CATEGORY_OPTIONS, project.projectCategory)}
            </span>
            {!commercial && project.projectType && (
              <span className="rounded-full border border-slate-200 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-slate-600">
                {getProjectOptionLabel(PROJECT_TYPE_OPTIONS, project.projectType)}
              </span>
            )}
          </div>
        </div>

        <div className="grid grid-cols-2 gap-1.5 sm:gap-2">
          <ProjectMeta icon={Layers3} label="Land Area" value={project.totalLandArea} />
          <ProjectMeta icon={Building2} label={secondaryMeta.label} value={secondaryMeta.value} />
        </div>

        <div className="mt-auto flex items-center gap-2 border-t border-slate-100 pt-3">
          <button
            type="button"
            onClick={() => onView(project)}
            className="flex flex-1 items-center justify-center gap-1.5 rounded-xl border border-slate-200 bg-white py-2 text-xs font-bold uppercase tracking-widest text-slate-600 hover:bg-slate-50"
          >
            <Eye size={14} />
            View
          </button>
          {canManage && (
            <button
              type="button"
              onClick={() => onEdit(project)}
              aria-label="Edit project"
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-500 hover:bg-slate-50"
            >
              <Pencil size={15} />
            </button>
          )}
          {canDelete && (
            <button
              type="button"
              onClick={() => onDelete(project)}
              aria-label="Delete project"
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-red-200 bg-white text-red-500 hover:bg-red-50"
            >
              <Trash2 size={15} />
            </button>
          )}
        </div>
      </div>
    </article>
  );
};

const ProjectsPage = () => {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const role = String(localStorage.getItem("role") || "").trim().toUpperCase();
  const { canPageAction, enforcePageAccess } = usePermissions();
  const canManage = PROJECT_MANAGE_ROLES.has(role)
    || (enforcePageAccess && canPageAction("projects", "edit"))
    || (enforcePageAccess && canPageAction("projects", "create"));
  const canDelete = PROJECT_DELETE_ROLES.has(role)
    || (enforcePageAccess && canPageAction("projects", "delete"));
  const deleteNeedsApproval = role === "MANAGER";

  const [projects, setProjects] = useState([]);
  const [pagination, setPagination] = useState(null);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const [searchTerm, setSearchTerm] = useState("");
  const debouncedSearchTerm = useDebouncedValue(searchTerm, 250);
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [typeFilter, setTypeFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  // Knowledge search (requirements 5.1): developer, location, rate, size, amenity.
  const [showMoreFilters, setShowMoreFilters] = useState(false);
  const [moreFilters, setMoreFilters] = useState({ developer: "", city: "", priceMin: "", priceMax: "", sizeMin: "", sizeMax: "", amenity: "" });
  const debouncedMoreFilters = useDebouncedValue(moreFilters, 300);
  const activeMoreFilters = Object.values(moreFilters).filter((v) => String(v).trim() !== "").length;

  const [isFormModalOpen, setIsFormModalOpen] = useState(false);
  // Project details (requirements section 05), edited in this form too.
  const [knowledgeCatalogue, setKnowledgeCatalogue] = useState(null);
  const [knowledgeDraft, setKnowledgeDraft] = useState(() => emptyKnowledgeDraft());
  const [knowledgeInitial, setKnowledgeInitial] = useState("");
  const [knowledgeLoading, setKnowledgeLoading] = useState(false);
  const [existingDocuments, setExistingDocuments] = useState([]);
  const [pendingDocuments, setPendingDocuments] = useState([]);
  const isProjectManagement = ["ADMIN", "MANAGER"].includes(String(role || "").toUpperCase());
  const [editingProjectId, setEditingProjectId] = useState("");
  const [formData, setFormData] = useState({ ...DEFAULT_FORM });
  const [formError, setFormError] = useState("");
  const [saving, setSaving] = useState(false);
  const [uploadingImages, setUploadingImages] = useState(false);
  // Step-by-step form (CRM Web Glass "New Project Form" design).
  const [wizardStep, setWizardStep] = useState(0);
  const [wizardDir, setWizardDir] = useState(1);
  const [wizardTried, setWizardTried] = useState({});
  const [stepError, setStepError] = useState("");
  const [chargesOpen, setChargesOpen] = useState(false);
  const resetWizard = () => { setWizardStep(0); setWizardDir(1); setWizardTried({}); setStepError(""); setChargesOpen(false); };

  const [deleteTarget, setDeleteTarget] = useState(null);
  const [deleting, setDeleting] = useState(false);
  const [collapsedUnits, setCollapsedUnits] = useState(() => new Set());

  useEffect(() => {
    if (!error && !success) return undefined;
    const timer = window.setTimeout(() => {
      setError("");
      setSuccess("");
    }, 4000);
    return () => window.clearTimeout(timer);
  }, [error, success]);

  const fetchProjects = useCallback(async () => {
    setLoading(true);
    try {
      const params = { page, limit: PAGE_LIMIT };
      if (debouncedSearchTerm.trim()) params.search = debouncedSearchTerm.trim();
      if (categoryFilter !== "all") params.projectCategory = categoryFilter;
      if (typeFilter !== "all") params.projectType = typeFilter;
      if (statusFilter !== "all") params.status = statusFilter;
      Object.entries(debouncedMoreFilters).forEach(([key, value]) => {
        if (String(value).trim() !== "") params[key] = String(value).trim();
      });

      const result = await getProjectsWithMeta(params);
      setProjects(result.projects);
      setPagination(result.pagination);
    } catch (fetchError) {
      setError(toErrorMessage(fetchError, "Failed to load projects"));
    } finally {
      setLoading(false);
    }
  }, [page, debouncedSearchTerm, categoryFilter, typeFilter, statusFilter, debouncedMoreFilters]);

  useEffect(() => {
    fetchProjects();
  }, [fetchProjects]);

  useEffect(() => {
    setPage(1);
  }, [debouncedSearchTerm, categoryFilter, typeFilter, statusFilter, debouncedMoreFilters]);

  const resetForm = () => {
    setFormData({ ...DEFAULT_FORM });
    setFormError("");
    setEditingProjectId("");
  };

  const loadKnowledgeCatalogue = () => {
    if (knowledgeCatalogue) return;
    getProjectDetailsCatalogue().then(setKnowledgeCatalogue).catch(() => setKnowledgeCatalogue(null));
  };

  const startKnowledge = (draft, documents = []) => {
    setKnowledgeDraft(draft);
    setKnowledgeInitial(JSON.stringify(draft));
    setExistingDocuments(documents);
    setPendingDocuments([]);
  };

  const openAddModal = () => {
    resetForm();
    resetWizard();
    startKnowledge(emptyKnowledgeDraft());
    loadKnowledgeCatalogue();
    setIsFormModalOpen(true);
  };

  const openEditModal = async (project) => {
    setFormError("");
    resetWizard();
    setEditingProjectId(project._id);
    setFormData(toFormFromProject(project));
    startKnowledge(emptyKnowledgeDraft());
    loadKnowledgeCatalogue();
    setIsFormModalOpen(true);
    setKnowledgeLoading(true);
    try {
      const data = await getProjectKnowledge(project._id);
      const k = data?.knowledge || {};
      startKnowledge({
        ...emptyKnowledgeDraft(),
        overview: k.overview || {}, specs: k.specs || {}, pricing: k.pricing || {}, legal: k.legal || {},
        contacts: k.contacts || [], amenityStatuses: k.amenityStatuses || [],
        approvalStatus: k.approvalStatus || "NOT_STARTED", pricingPublished: Boolean(k.pricingPublished),
        internalNotes: k.internalNotes || "",
      }, k.documents || []);
    } catch {
      // The project form still works; its details can be filled on the project page.
    } finally {
      setKnowledgeLoading(false);
    }
  };

  const setKnowledgeIn = (section) => (key, value) => setKnowledgeDraft((d) => ({ ...d, [section]: { ...(d[section] || {}), [key]: value } }));

  const closeFormModal = () => {
    setIsFormModalOpen(false);
    resetForm();
  };

  const handleBhkToggle = (bhkValue) => {
    setFormData((prev) => {
      const exists = prev.bhkConfigurations.some((config) => config.bhk === bhkValue);
      return {
        ...prev,
        bhkConfigurations: exists
          ? prev.bhkConfigurations.filter((config) => config.bhk !== bhkValue)
          : [...prev.bhkConfigurations, { ...DEFAULT_BHK_CONFIG, bhk: bhkValue }],
      };
    });
  };

  const handleBhkFieldChange = (bhkValue, field, value) => {
    setFormData((prev) => ({
      ...prev,
      bhkConfigurations: prev.bhkConfigurations.map((config) =>
        config.bhk === bhkValue ? { ...config, [field]: value } : config),
    }));
  };

  const handleCategoryChange = (nextCategory) => {
    setFormData((prev) => ({
      ...prev,
      projectCategory: nextCategory,
      projectType: "",
    }));
  };

  const toggleUnitCollapse = (unitKey) => {
    setCollapsedUnits((prev) => {
      const next = new Set(prev);
      if (next.has(unitKey)) next.delete(unitKey);
      else next.add(unitKey);
      return next;
    });
  };

  const addUnit = (groupKey, defaults, codePrefix, codeField) => {
    setFormData((prev) => {
      const nextIndex = prev[groupKey].length + 1;
      const newUnit = {
        ...defaults,
        _key: makeUnitKey(),
        [codeField]: `${codePrefix}-${String(nextIndex).padStart(3, "0")}`,
      };
      return { ...prev, [groupKey]: [...prev[groupKey], newUnit] };
    });
  };

  const duplicateUnit = (groupKey, unitKey) => {
    setFormData((prev) => {
      const source = prev[groupKey].find((unit) => unit._key === unitKey);
      if (!source) return prev;
      const duplicate = { ...source, _key: makeUnitKey() };
      const sourceIndex = prev[groupKey].findIndex((unit) => unit._key === unitKey);
      const nextGroup = [...prev[groupKey]];
      nextGroup.splice(sourceIndex + 1, 0, duplicate);
      return { ...prev, [groupKey]: nextGroup };
    });
  };

  const removeUnit = (groupKey, unitKey) => {
    setFormData((prev) => ({
      ...prev,
      [groupKey]: prev[groupKey].filter((unit) => unit._key !== unitKey),
    }));
  };

  const updateUnitField = (groupKey, unitKey, field, value) => {
    setFormData((prev) => ({
      ...prev,
      [groupKey]: prev[groupKey].map((unit) => {
        if (unit._key !== unitKey) return unit;
        const nextUnit = { ...unit, [field]: value };
        if (field === "length" || field === "breadth") {
          const length = Number(field === "length" ? value : unit.length);
          const breadth = Number(field === "breadth" ? value : unit.breadth);
          if (Number.isFinite(length) && Number.isFinite(breadth) && length > 0 && breadth > 0) {
            nextUnit.carpetArea = String(Math.round(length * breadth * 100) / 100);
          }
        }
        return nextUnit;
      }),
    }));
  };

  const handleImageUpload = async (e) => {
    const files = Array.from(e.target.files || []);
    if (!files.length) return;

    setUploadingImages(true);
    const newImageUrls = [];
    const failedFiles = [];

    for (const file of files) {
      try {
        const result = await uploadFile(file, "project-images");
        newImageUrls.push(result.url);
      } catch (uploadError) {
        failedFiles.push(`${file.name}: ${toErrorMessage(uploadError, "unknown error")}`);
      }
    }

    if (newImageUrls.length) {
      setFormData((prev) => ({
        ...prev,
        images: [...prev.images, ...newImageUrls],
      }));
    }
    if (failedFiles.length) {
      setFormError(`Failed to upload: ${failedFiles.join(", ")}`);
    }

    setUploadingImages(false);
    e.target.value = null;
  };

  const removeImage = (urlToRemove) => {
    setFormData((prev) => ({
      ...prev,
      images: prev.images.filter((url) => url !== urlToRemove),
    }));
  };

  const renderUnitCard = (unit, fields, groupKey, codeField, codeLabel) => {
    const isCollapsed = collapsedUnits.has(unit._key);
    return (
      <div key={unit._key} className="rounded-lg border border-slate-200 bg-white">
        <div className="flex items-center justify-between gap-2 px-3 py-2.5">
          <button
            type="button"
            onClick={() => toggleUnitCollapse(unit._key)}
            className="flex flex-1 items-center gap-2 text-left"
          >
            {isCollapsed ? <ChevronDown size={14} className="text-slate-400" /> : <ChevronUp size={14} className="text-slate-400" />}
            <span className="text-xs font-bold text-slate-800">{unit[codeField] || codeLabel}</span>
            <span className="rounded-full border border-slate-200 px-2 py-0.5 text-[9px] font-bold uppercase tracking-widest text-slate-500">
              {getProjectOptionLabel(PROJECT_UNIT_STATUS_OPTIONS, unit.status)}
            </span>
          </button>
          <div className="flex items-center gap-1">
            <button
              type="button"
              title="Duplicate"
              onClick={() => duplicateUnit(groupKey, unit._key)}
              className="rounded-lg border border-slate-200 p-1.5 text-slate-500 hover:bg-slate-100"
            >
              <Copy size={13} />
            </button>
            <button
              type="button"
              title="Delete"
              onClick={() => removeUnit(groupKey, unit._key)}
              className="rounded-lg border border-red-200 p-1.5 text-red-500 hover:bg-red-50"
            >
              <Trash2 size={13} />
            </button>
          </div>
        </div>

        {!isCollapsed && (
          <div className="border-t border-slate-100 p-3">
            <div className="mb-2.5">
              <label className={FIELD_TITLE_CLASS}>{codeLabel} Number / Code</label>
              <input
                type="text"
                value={unit[codeField]}
                onChange={(e) => updateUnitField(groupKey, unit._key, codeField, e.target.value)}
                className={`${INPUT_CLASS} mt-1 sm:max-w-xs`}
              />
            </div>
            <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
              {fields.map((field) => (
                <div key={field.key} className={field.type === "textarea" ? "col-span-2 sm:col-span-4" : ""}>
                  <label className={FIELD_TITLE_CLASS}>{field.label}</label>
                  {field.type === "select" ? (
                    <select
                      value={unit[field.key]}
                      onChange={(e) => updateUnitField(groupKey, unit._key, field.key, e.target.value)}
                      className={`${INPUT_CLASS} mt-1`}
                    >
                      <option value="">Select</option>
                      {field.options.map((option) => (
                        <option key={option.value} value={option.value}>{option.label}</option>
                      ))}
                    </select>
                  ) : field.type === "floor" ? (
                    <select
                      value={unit.floorNumber}
                      onChange={(e) => updateUnitField(groupKey, unit._key, "floorNumber", e.target.value)}
                      className={`${INPUT_CLASS} mt-1`}
                    >
                      <option value="">Select floor</option>
                      {Array.from({ length: Number(formData.totalFloors) || 0 }, (_, i) => i + 1).map((floor) => (
                        <option key={floor} value={floor}>{floor}</option>
                      ))}
                    </select>
                  ) : field.type === "textarea" ? (
                    <textarea
                      rows={2}
                      value={unit[field.key]}
                      onChange={(e) => updateUnitField(groupKey, unit._key, field.key, e.target.value)}
                      className="mt-1 w-full resize-none rounded-lg border border-slate-300 bg-white p-2.5 text-sm text-slate-700 focus:outline-none focus:border-emerald-500"
                    />
                  ) : (
                    <input
                      type={field.type}
                      min={field.type === "number" ? "0" : undefined}
                      value={unit[field.key]}
                      placeholder={field.placeholder}
                      onChange={(e) => updateUnitField(groupKey, unit._key, field.key, e.target.value)}
                      className={`${INPUT_CLASS} mt-1`}
                    />
                  )}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    );
  };

  // Keep Total Offices synced to the office list length whenever it changes, while still
  // letting the user manually override the number afterward (per "auto-calculated but editable").
  useEffect(() => {
    setFormData((prev) => ({ ...prev, totalOffices: String(prev.offices.length) }));
  }, [formData.offices.length]);

  const handleSubmit = async () => {
    const validationError = validateForm(formData);
    if (validationError) {
      setFormError(validationError);
      return;
    }

    setSaving(true);
    setFormError("");
    try {
      const payload = buildProjectPayload(formData);
      let savedId = editingProjectId;
      if (editingProjectId) {
        await updateProject(editingProjectId, payload);
      } else {
        const created = await createProject(payload);
        savedId = created?._id || "";
      }

      // Then the project details, only the parts that changed.
      const draftToSave = isCoworkingCategory(formData.projectCategory)
        ? withCoworkingDerived(knowledgeDraft, formData)
        : knowledgeDraft;
      const fullPatch = knowledgePatchFromDraft(draftToSave, { isManagement: isProjectManagement, pendingDocuments });
      const initial = JSON.parse(knowledgeInitial || "{}");
      const initialPatch = knowledgePatchFromDraft(initial, { isManagement: isProjectManagement });
      const detailsPatch = Object.fromEntries(Object.entries(fullPatch)
        .filter(([key, value]) => key === "addDocuments" || JSON.stringify(value) !== JSON.stringify(initialPatch[key])));
      if (savedId && Object.keys(detailsPatch).length) {
        try {
          await updateProjectDetails(savedId, detailsPatch);
        } catch (detailsError) {
          // The project itself is saved; keep the form open on it so the details can be retried.
          setEditingProjectId(savedId);
          setFormError(`Project saved, but its details weren't: ${toErrorMessage(detailsError, "please try again")}`);
          await fetchProjects();
          return;
        }
      }

      setSuccess(editingProjectId ? "Project updated successfully" : "Project created successfully");
      closeFormModal();
      await fetchProjects();
    } catch (submitError) {
      setFormError(toErrorMessage(submitError, "Failed to save project"));
    } finally {
      setSaving(false);
    }
  };

  const goToProjectDetails = (project) => {
    navigate(`/projects/${project._id}`);
  };

  useEffect(() => {
    const editId = searchParams.get("edit");
    if (!editId) return;

    getProjectById(editId)
      .then((project) => {
        if (project) openEditModal(project);
      })
      .catch((editLoadError) => {
        setError(toErrorMessage(editLoadError, "Failed to load project for editing"));
      })
      .finally(() => {
        setSearchParams((prev) => {
          const next = new URLSearchParams(prev);
          next.delete("edit");
          return next;
        }, { replace: true });
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      const result = await deleteProject(deleteTarget._id);
      setSuccess(deleteOutcomeMessage(result, "Project deleted"));
      setDeleteTarget(null);
      if (!isDeleteApprovalPending(result)) await fetchProjects();
    } catch (deleteError) {
      setError(toErrorMessage(deleteError, "Failed to delete project"));
    } finally {
      setDeleting(false);
    }
  };

  /* ---------------- step-by-step form ---------------- */
  const formIssue = isFormModalOpen ? validateForm(formData) : "";
  const issueStep = stepOfError(formIssue);
  const lastWizardStep = WIZARD_STEPS.length - 1;
  const goToStep = (index) => {
    setWizardDir(index >= wizardStep ? 1 : -1);
    setWizardStep(index);
    setStepError("");
    setFormError("");
  };
  const flagStep = (index) => {
    setWizardTried((tried) => ({ ...tried, [index]: true }));
    setStepError(formIssue);
  };
  const wizardNext = () => {
    if (wizardStep === lastWizardStep) {
      if (issueStep !== -1) { goToStep(issueStep); flagStep(issueStep); return; }
      handleSubmit();
      return;
    }
    if (issueStep !== -1 && issueStep <= wizardStep) { flagStep(issueStep); return; }
    goToStep(wizardStep + 1);
  };
  // A validation message only shows while it is still the problem.
  const wizardError = (stepError && stepError === formIssue ? stepError : "") || formError;
  const issueHere = (index) => Boolean(wizardTried[index] && issueStep === index);
  const isCommercialForm = isCommercialCategory(formData.projectCategory);
  const isCoworkingForm = isCoworkingCategory(formData.projectCategory);
  // The workspace sections are drawn from the same catalogue as the details
  // accordion, so they are there only once it has loaded.
  const coworkingFields = isCoworkingForm ? (knowledgeCatalogue?.specs?.COWORKING || []) : [];
  const coworkingServices = knowledgeCatalogue?.amenityPresets?.COWORKING || [];
  const setSpecField = (key, value) => setKnowledgeIn("specs")(key, value);
  const typeLabel = getProjectOptionLabel(PROJECT_TYPE_OPTIONS, formData.projectType);
  const categoryLabel = getProjectOptionLabel(PROJECT_CATEGORY_OPTIONS, formData.projectCategory);
  const filledCharges = CHARGE_FIELDS.filter(([key]) => String(formData[key] || "").trim()).length + (String(formData.otherCharges || "").trim() ? 1 : 0);
  const filledPlc = PLC_FIELDS.filter(([key]) => key !== "group" && String(formData[key] || "").trim()).length;
  const rateIssue = issueHere(1) ? formIssue : "";

  const emptyState = !loading && projects.length === 0;

  const paginationSummary = useMemo(() => {
    if (!pagination) return "";
    const { page: currentPage, limit, totalCount } = pagination;
    if (!totalCount) return "";
    const start = (currentPage - 1) * limit + 1;
    const end = Math.min(currentPage * limit, totalCount);
    return `Showing ${start}-${end} of ${totalCount}`;
  }, [pagination]);

  return (
    <div className="ui-page-shell projects-page custom-scrollbar relative flex flex-col bg-slate-50/50">
      <ToastNotice message={error} type="error" />
      <ToastNotice message={success} type="success" />

      <div className="flex flex-wrap items-center justify-between gap-3 py-2">
        <div>
          <h1 className="text-xl font-extrabold text-slate-900 sm:text-2xl">Projects</h1>
          <p className="text-xs text-slate-500">Manage plotting, building, and villa/farmhouse projects</p>
        </div>
        {canManage && (
          <button
            type="button"
            onClick={openAddModal}
            className="inline-flex items-center gap-2 rounded-xl bg-slate-900 px-4 py-2.5 text-xs font-bold uppercase tracking-widest text-white hover:bg-slate-800"
          >
            <Plus size={14} />
            New Project
          </button>
        )}
      </div>

      <div className="flex flex-col gap-2 rounded-xl border border-slate-200 bg-white p-3 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Search by project name, ID, or location"
            className="h-10 w-full rounded-lg border border-slate-200 bg-slate-50 pl-9 pr-3 text-sm text-slate-700 focus:outline-none focus:border-emerald-500"
          />
        </div>
        <select
          value={categoryFilter}
          onChange={(e) => setCategoryFilter(e.target.value)}
          className="h-10 rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-700 focus:outline-none focus:border-emerald-500"
        >
          <option value="all">Category (All)</option>
          {PROJECT_CATEGORY_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>{option.label}</option>
          ))}
        </select>
        <select
          value={typeFilter}
          onChange={(e) => setTypeFilter(e.target.value)}
          className="h-10 rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-700 focus:outline-none focus:border-emerald-500"
        >
          <option value="all">Type (All)</option>
          {PROJECT_TYPE_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>{option.label}</option>
          ))}
        </select>
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="h-10 rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-700 focus:outline-none focus:border-emerald-500"
        >
          <option value="all">Status (All)</option>
          {PROJECT_STATUS_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>{option.label}</option>
          ))}
        </select>
        <button
          type="button"
          onClick={() => setShowMoreFilters((open) => !open)}
          aria-expanded={showMoreFilters}
          className="h-10 whitespace-nowrap rounded-lg border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-700 hover:bg-slate-50"
        >
          More filters{activeMoreFilters ? ` (${activeMoreFilters})` : ""}
        </button>
      </div>
      {showMoreFilters ? (
        <div className="mt-2 grid grid-cols-2 gap-2 rounded-xl border border-slate-200 bg-white p-3 sm:grid-cols-4 xl:grid-cols-7">
          {[
            ["developer", "Developer / operator", "text"],
            ["city", "Location / locality", "text"],
            ["priceMin", "Rate from (₹/sq.ft)", "number"],
            ["priceMax", "Rate up to (₹/sq.ft)", "number"],
            ["sizeMin", "Size from (sq.ft)", "number"],
            ["sizeMax", "Size up to (sq.ft)", "number"],
          ].map(([key, label, type]) => (
            <label key={key} className="block">
              <span className="mb-1 block text-[11px] font-semibold text-slate-500">{label}</span>
              <input
                type={type}
                min={type === "number" ? "0" : undefined}
                value={moreFilters[key]}
                onChange={(e) => setMoreFilters((prev) => ({ ...prev, [key]: e.target.value }))}
                className="h-9 w-full rounded-lg border border-slate-200 bg-slate-50 px-2.5 text-sm text-slate-700 focus:outline-none focus:border-emerald-500"
              />
            </label>
          ))}
          <label className="block">
            <span className="mb-1 block text-[11px] font-semibold text-slate-500">Amenity</span>
            <select
              value={moreFilters.amenity}
              onChange={(e) => setMoreFilters((prev) => ({ ...prev, amenity: e.target.value }))}
              className="h-9 w-full rounded-lg border border-slate-200 bg-white px-2 text-sm text-slate-700 focus:outline-none focus:border-emerald-500"
            >
              <option value="">Any</option>
              {[...new Map([...PROJECT_AMENITY_OPTIONS, ...PROJECT_COMMERCIAL_AMENITY_OPTIONS].map((o) => [o.value, o])).values()].map((option) => (
                <option key={option.value} value={option.value}>{option.label}</option>
              ))}
            </select>
          </label>
          {activeMoreFilters ? (
            <button
              type="button"
              onClick={() => setMoreFilters({ developer: "", city: "", priceMin: "", priceMax: "", sizeMin: "", sizeMax: "", amenity: "" })}
              className="col-span-2 h-9 self-end rounded-lg text-sm font-semibold text-slate-500 hover:text-slate-800 sm:col-span-1"
            >
              Clear filters
            </button>
          ) : null}
        </div>
      ) : null}

      {loading && (
        <div className="mt-3 grid grid-cols-1 gap-3 pb-8 sm:gap-5 md:grid-cols-2 2xl:grid-cols-3">
          {Array.from({ length: 6 }).map((_, index) => (
            <div key={index} className="animate-pulse rounded-2xl border border-slate-200 bg-white p-4">
              <div className="h-40 w-full rounded-xl bg-slate-100 sm:h-52" />
              <div className="mt-4 h-5 w-3/4 rounded bg-slate-100" />
              <div className="mt-2 h-4 w-1/2 rounded bg-slate-100" />
              <div className="mt-4 grid grid-cols-2 gap-2">
                <div className="h-12 rounded-xl bg-slate-100" />
                <div className="h-12 rounded-xl bg-slate-100" />
              </div>
            </div>
          ))}
        </div>
      )}

      {emptyState && (
        <div className="mt-3 rounded-xl border border-slate-200 bg-white px-3 py-14 text-center">
          <Building2 size={28} className="mx-auto mb-2 text-slate-300" />
          <p className="text-sm font-bold text-slate-500">No projects found</p>
          <p className="text-xs text-slate-400">Try adjusting your search or filters</p>
        </div>
      )}

      {!loading && !emptyState && (
        <div className="mt-3 grid grid-cols-1 gap-3 pb-8 sm:gap-5 md:grid-cols-2 2xl:grid-cols-3">
          {projects.map((project) => (
            <ProjectCard
              key={project._id}
              project={project}
              canManage={canManage}
              canDelete={canDelete}
              onView={goToProjectDetails}
              onEdit={openEditModal}
              onDelete={setDeleteTarget}
            />
          ))}
        </div>
      )}

      {pagination && pagination.totalCount > 0 && (
        <div className="flex items-center justify-between py-3 text-xs text-slate-500">
          <span>{paginationSummary}</span>
          <div className="flex items-center gap-2">
            <button
              type="button"
              disabled={!pagination.hasPrevPage}
              onClick={() => setPage((prev) => Math.max(1, prev - 1))}
              className="rounded-lg border border-slate-200 px-3 py-1.5 font-bold uppercase tracking-widest disabled:cursor-not-allowed disabled:opacity-40"
            >
              Prev
            </button>
            <button
              type="button"
              disabled={!pagination.hasNextPage}
              onClick={() => setPage((prev) => prev + 1)}
              className="rounded-lg border border-slate-200 px-3 py-1.5 font-bold uppercase tracking-widest disabled:cursor-not-allowed disabled:opacity-40"
            >
              Next
            </button>
          </div>
        </div>
      )}

      {isFormModalOpen && (
        <FormWizard
          icon={Layers3}
          title={editingProjectId ? "Edit project" : "New project"}
          steps={WIZARD_STEPS}
          step={wizardStep}
          dir={wizardDir}
          stepState={(index) => (issueHere(index) ? "bad" : index < wizardStep && issueStep !== index ? "done" : "todo")}
          canOpenStep={(index) => index <= wizardStep || Boolean(editingProjectId) || issueStep === -1 || issueStep >= index}
          onStep={goToStep}
          onClose={closeFormModal}
          onBack={() => goToStep(Math.max(0, wizardStep - 1))}
          onNext={wizardNext}
          onSkip={wizardStep === 2 ? () => goToStep(3) : undefined}
          primaryLabel={wizardStep === lastWizardStep ? (saving ? "Saving…" : editingProjectId ? "Save changes" : "Save project") : `Next: ${WIZARD_STEPS[wizardStep + 1].label}`}
          primaryIcon={wizardStep === lastWizardStep ? "save" : "next"}
          busy={saving}
          error={wizardError}
        >
              {wizardStep === 0 && (<>
                <div className="flex flex-col gap-2">
                  <span className={FIELD_TITLE_CLASS}>Project category *</span>
                  <ChoiceCards
                    options={PROJECT_CATEGORY_OPTIONS.map((option) => ({ ...option, icon: CATEGORY_CARD_META[option.value]?.icon, sub: CATEGORY_CARD_META[option.value]?.sub }))}
                    value={formData.projectCategory}
                    onChange={handleCategoryChange}
                    error={issueHere(0) && !formData.projectCategory}
                  />
                </div>
                {!isCommercialForm && !isCoworkingForm && (
                  <div className="flex flex-col gap-2">
                    <span className={FIELD_TITLE_CLASS}>Project type *</span>
                    <PickChips
                      options={PROJECT_TYPE_OPTIONS.map((option) => ({ ...option, icon: TYPE_ICON[option.value] }))}
                      value={formData.projectType}
                      onChange={(value) => setFormData((prev) => ({ ...prev, projectType: value }))}
                      error={issueHere(0) && !formData.projectType}
                    />
                  </div>
                )}
                <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2">
                  <div className="sm:col-span-2">
                    <label className={FIELD_TITLE_CLASS}>{isCoworkingCategory(formData.projectCategory) ? "Workspace Name *" : "Project Name *"}</label>
                    <input
                      type="text"
                      value={formData.projectName}
                      onChange={(e) => setFormData((prev) => ({ ...prev, projectName: e.target.value }))}
                      placeholder="e.g. Sunrise Meadows"
                      className={`${INPUT_CLASS} mt-1`}
                    />
                  </div>
                  <div>
                    <label className={FIELD_TITLE_CLASS}>{isCoworkingForm ? "Total Area *" : "Total Land Area *"}</label>
                    <input
                      type="text"
                      value={formData.totalLandArea}
                      onChange={(e) => setFormData((prev) => ({ ...prev, totalLandArea: e.target.value }))}
                      placeholder={isCoworkingForm ? "Example: 12,000 sq ft" : "Example: 20 Acres"}
                      className={`${INPUT_CLASS} mt-1`}
                    />
                  </div>

                  {isCommercialCategory(formData.projectCategory) ? (
                    <>
                      <div>
                        <label className={FIELD_TITLE_CLASS}>Total Floors *</label>
                        <input
                          type="number"
                          min="0"
                          value={formData.totalFloors}
                          onChange={(e) => setFormData((prev) => ({ ...prev, totalFloors: e.target.value }))}
                          className={`${INPUT_CLASS} mt-1`}
                        />
                      </div>
                      <div>
                        <label className={FIELD_TITLE_CLASS}>Offices Per Floor *</label>
                        <input
                          type="number"
                          min="0"
                          value={formData.officesPerFloor}
                          onChange={(e) => setFormData((prev) => ({ ...prev, officesPerFloor: e.target.value }))}
                          className={`${INPUT_CLASS} mt-1`}
                        />
                      </div>
                      <div>
                        <label className={FIELD_TITLE_CLASS}>Total Offices</label>
                        <input
                          type="number"
                          min="0"
                          value={formData.totalOffices}
                          onChange={(e) => setFormData((prev) => ({ ...prev, totalOffices: e.target.value }))}
                          placeholder="Auto-calculated from Office Inventory"
                          className={`${INPUT_CLASS} mt-1`}
                        />
                      </div>
                      <div>
                        <label className={FIELD_TITLE_CLASS}>Total Shops</label>
                        <input
                          type="number"
                          min="0"
                          value={formData.totalShops}
                          onChange={(e) => setFormData((prev) => ({ ...prev, totalShops: e.target.value }))}
                          className={`${INPUT_CLASS} mt-1`}
                        />
                      </div>
                      <div>
                        <label className={FIELD_TITLE_CLASS}>Total Showrooms</label>
                        <input
                          type="number"
                          min="0"
                          value={formData.totalShowrooms}
                          onChange={(e) => setFormData((prev) => ({ ...prev, totalShowrooms: e.target.value }))}
                          className={`${INPUT_CLASS} mt-1`}
                        />
                      </div>
                    </>
                  ) : isBuildingType(formData.projectType) ? (
                    <>
                      <div>
                        <label className={FIELD_TITLE_CLASS}>Number of Flats *</label>
                        <input
                          type="number"
                          min="0"
                          value={formData.numberOfFlats}
                          onChange={(e) => setFormData((prev) => ({ ...prev, numberOfFlats: e.target.value }))}
                          className={`${INPUT_CLASS} mt-1`}
                        />
                      </div>
                      <div>
                        <label className={FIELD_TITLE_CLASS}>Number of Floors *</label>
                        <input
                          type="number"
                          min="0"
                          value={formData.numberOfFloors}
                          onChange={(e) => setFormData((prev) => ({ ...prev, numberOfFloors: e.target.value }))}
                          className={`${INPUT_CLASS} mt-1`}
                        />
                      </div>
                      <div>
                        <label className={FIELD_TITLE_CLASS}>Flats Per Floor *</label>
                        <input
                          type="number"
                          min="0"
                          value={formData.flatsPerFloor}
                          onChange={(e) => setFormData((prev) => ({ ...prev, flatsPerFloor: e.target.value }))}
                          className={`${INPUT_CLASS} mt-1`}
                        />
                      </div>
                    </>
                  ) : isCoworkingCategory(formData.projectCategory) ? null : (
                    <>
                      <div>
                        <label className={FIELD_TITLE_CLASS}>Number of Plots *</label>
                        <input
                          type="number"
                          min="0"
                          value={formData.totalPlots}
                          onChange={(e) => setFormData((prev) => ({ ...prev, totalPlots: e.target.value }))}
                          className={`${INPUT_CLASS} mt-1`}
                        />
                      </div>
                      <div>
                        <label className={FIELD_TITLE_CLASS}>Plot Size Range (Sq.ft)</label>
                        <div className="mt-1 flex items-center gap-2">
                          <input
                            type="number"
                            min="0"
                            value={formData.plotSizeMin}
                            onChange={(e) => setFormData((prev) => ({ ...prev, plotSizeMin: e.target.value }))}
                            placeholder="From, e.g. 900"
                            aria-label="Smallest plot size in sq.ft"
                            className={INPUT_CLASS}
                          />
                          <span className="text-sm text-slate-400">to</span>
                          <input
                            type="number"
                            min="0"
                            value={formData.plotSizeMax}
                            onChange={(e) => setFormData((prev) => ({ ...prev, plotSizeMax: e.target.value }))}
                            placeholder="To, e.g. 2400"
                            aria-label="Largest plot size in sq.ft"
                            className={INPUT_CLASS}
                          />
                        </div>
                      </div>
                    </>
                  )}
                </div>

                {isCoworkingForm ? (
                  coworkingFields.length ? (
                    <CoworkingBasicsFields fields={coworkingFields} specs={knowledgeDraft.specs || {}} setSpec={setSpecField} />
                  ) : (
                    <p className="text-[12.5px]" style={{ color: "var(--g-mut)" }}>Loading the workspace fields…</p>
                  )
                ) : null}
                {issueHere(0) ? <p className="rounded-xl px-3.5 py-2.5 text-[12.5px]" style={{ background: "var(--g-bads)", color: "var(--g-bad)" }}>{formIssue}</p> : null}

              {isCommercialCategory(formData.projectCategory) && (
                <div className={SECTION_CLASS}>
                  <div className={SECTION_HEADING_CLASS}>Summary</div>
                  <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-6">
                    {[
                      ["Total Floors", formData.totalFloors || 0],
                      ["Total Offices", formData.offices.length],
                      ["Total Shops", formData.shops.length],
                      ["Total Showrooms", formData.showrooms.length],
                      ["Available Units", [...formData.offices, ...formData.shops, ...formData.showrooms].filter((unit) => unit.status === "AVAILABLE").length],
                      ["Sold / Leased Units", [...formData.offices, ...formData.shops, ...formData.showrooms].filter((unit) => SOLD_LIKE_UNIT_STATUSES.has(unit.status)).length],
                    ].map(([label, value]) => (
                      <div key={label} className="rounded-lg border border-slate-200 bg-white p-2.5 text-center">
                        <div className="text-lg font-extrabold text-slate-900">{value}</div>
                        <div className="text-[9px] font-bold uppercase tracking-widest text-slate-400">{label}</div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {isCommercialCategory(formData.projectCategory) && (
                <div className={SECTION_CLASS}>
                  <div className="mb-3 flex items-center justify-between">
                    <div className={`${SECTION_HEADING_CLASS} mb-0`}>Office Inventory</div>
                    <button
                      type="button"
                      onClick={() => addUnit("offices", DEFAULT_OFFICE, "OFF", "officeCode")}
                      className="inline-flex items-center gap-1.5 rounded-lg bg-slate-900 px-3 py-1.5 text-[10px] font-bold uppercase tracking-widest text-white hover:bg-slate-800"
                    >
                      <Plus size={12} /> Add Office
                    </button>
                  </div>
                  {formData.offices.length === 0 ? (
                    <p className="text-xs text-slate-400">No offices added yet.</p>
                  ) : (
                    <div className="space-y-2.5">
                      {formData.offices.map((office) => renderUnitCard(office, OFFICE_FIELDS, "offices", "officeCode", "Office"))}
                    </div>
                  )}
                </div>
              )}

              {isCommercialCategory(formData.projectCategory) && (
                <div className={SECTION_CLASS}>
                  <div className="mb-3 flex items-center justify-between">
                    <div className={`${SECTION_HEADING_CLASS} mb-0`}>Shop Inventory</div>
                    <button
                      type="button"
                      onClick={() => addUnit("shops", DEFAULT_SHOP, "SHOP", "shopCode")}
                      className="inline-flex items-center gap-1.5 rounded-lg bg-slate-900 px-3 py-1.5 text-[10px] font-bold uppercase tracking-widest text-white hover:bg-slate-800"
                    >
                      <Plus size={12} /> Add Shop
                    </button>
                  </div>
                  {formData.shops.length === 0 ? (
                    <p className="text-xs text-slate-400">No shops added yet.</p>
                  ) : (
                    <div className="space-y-2.5">
                      {formData.shops.map((shop) => renderUnitCard(shop, SHOP_FIELDS, "shops", "shopCode", "Shop"))}
                    </div>
                  )}
                </div>
              )}

              {isCommercialCategory(formData.projectCategory) && (
                <div className={SECTION_CLASS}>
                  <div className="mb-3 flex items-center justify-between">
                    <div className={`${SECTION_HEADING_CLASS} mb-0`}>Showroom Inventory</div>
                    <button
                      type="button"
                      onClick={() => addUnit("showrooms", DEFAULT_SHOWROOM, "SR", "showroomCode")}
                      className="inline-flex items-center gap-1.5 rounded-lg bg-slate-900 px-3 py-1.5 text-[10px] font-bold uppercase tracking-widest text-white hover:bg-slate-800"
                    >
                      <Plus size={12} /> Add Showroom
                    </button>
                  </div>
                  {formData.showrooms.length === 0 ? (
                    <p className="text-xs text-slate-400">No showrooms added yet.</p>
                  ) : (
                    <div className="space-y-2.5">
                      {formData.showrooms.map((showroom) => renderUnitCard(showroom, SHOWROOM_FIELDS, "showrooms", "showroomCode", "Showroom"))}
                    </div>
                  )}
                </div>
              )}

              {isBuildingType(formData.projectType) && (
                <div className={SECTION_CLASS}>
                  <div className={SECTION_HEADING_CLASS}>Flat Configuration</div>
                  <div>
                    <label className={FIELD_TITLE_CLASS}>BHK Configuration *</label>
                    <div className="mt-1.5 flex flex-wrap gap-2">
                      {PROJECT_BHK_OPTIONS.map((option) => (
                        <label key={option.value} className={CHECKBOX_CLASS}>
                          <input
                            type="checkbox"
                            checked={formData.bhkConfigurations.some((config) => config.bhk === option.value)}
                            onChange={() => handleBhkToggle(option.value)}
                            className="h-3.5 w-3.5 rounded border-slate-300 text-emerald-600 focus:ring-emerald-500"
                          />
                          {option.label}
                        </label>
                      ))}
                    </div>
                  </div>

                  {formData.bhkConfigurations.length > 0 && (
                    <div className="mt-3 space-y-3">
                      {formData.bhkConfigurations.map((config) => (
                        <div key={config.bhk} className="rounded-lg border border-slate-200 bg-white p-3">
                          <div className="mb-2 text-[11px] font-bold uppercase tracking-widest text-emerald-700">
                            {getProjectOptionLabel(PROJECT_BHK_OPTIONS, config.bhk)}
                          </div>
                          <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
                            <div>
                              <label className={FIELD_TITLE_CLASS}>Flat Size (Sq.ft) *</label>
                              <input
                                type="number"
                                min="0"
                                value={config.size}
                                onChange={(e) => handleBhkFieldChange(config.bhk, "size", e.target.value)}
                                placeholder="1250"
                                className={`${INPUT_CLASS} mt-1`}
                              />
                            </div>
                            <div>
                              <label className={FIELD_TITLE_CLASS}>Bedrooms</label>
                              <input
                                type="number"
                                min="0"
                                value={config.bedrooms}
                                onChange={(e) => handleBhkFieldChange(config.bhk, "bedrooms", e.target.value)}
                                className={`${INPUT_CLASS} mt-1`}
                              />
                            </div>
                            <div>
                              <label className={FIELD_TITLE_CLASS}>Kitchens</label>
                              <input
                                type="number"
                                min="0"
                                value={config.kitchens}
                                onChange={(e) => handleBhkFieldChange(config.bhk, "kitchens", e.target.value)}
                                className={`${INPUT_CLASS} mt-1`}
                              />
                            </div>
                            <div>
                              <label className={FIELD_TITLE_CLASS}>Washrooms</label>
                              <input
                                type="number"
                                min="0"
                                value={config.washrooms}
                                onChange={(e) => handleBhkFieldChange(config.bhk, "washrooms", e.target.value)}
                                className={`${INPUT_CLASS} mt-1`}
                              />
                            </div>
                            <div>
                              <label className={FIELD_TITLE_CLASS}>Drawing / Living Rooms</label>
                              <input
                                type="number"
                                min="0"
                                value={config.drawingRooms}
                                onChange={(e) => handleBhkFieldChange(config.bhk, "drawingRooms", e.target.value)}
                                className={`${INPUT_CLASS} mt-1`}
                              />
                            </div>
                            <div>
                              <label className={FIELD_TITLE_CLASS}>Balconies</label>
                              <input
                                type="number"
                                min="0"
                                value={config.balconies}
                                onChange={(e) => handleBhkFieldChange(config.bhk, "balconies", e.target.value)}
                                className={`${INPUT_CLASS} mt-1`}
                              />
                            </div>
                            <div>
                              <label className={FIELD_TITLE_CLASS}>Servant Room</label>
                              <select
                                value={config.servantRoom ? "yes" : "no"}
                                onChange={(e) => handleBhkFieldChange(config.bhk, "servantRoom", e.target.value === "yes")}
                                className={`${INPUT_CLASS} mt-1`}
                              >
                                <option value="no">No</option>
                                <option value="yes">Yes</option>
                              </select>
                            </div>
                            <div>
                              <label className={FIELD_TITLE_CLASS}>Reserved Parking</label>
                              <input
                                type="number"
                                min="0"
                                value={config.reservedParking}
                                onChange={(e) => handleBhkFieldChange(config.bhk, "reservedParking", e.target.value)}
                                placeholder="2"
                                className={`${INPUT_CLASS} mt-1`}
                              />
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              </>)}

              {wizardStep === 1 && (<>
                <div className="grid gap-3.5 [grid-template-columns:repeat(auto-fit,minmax(220px,1fr))]">
                  <FormField label={isCoworkingForm ? "Starting price" : "Starting rate"} required error={/^Starting/.test(rateIssue) ? rateIssue : ""}>
                    <FormInput big prefix="₹" suffix={isCoworkingForm ? "/ seat / mo" : "/ sq ft"} type="number" min="0" inputMode="decimal" placeholder="4,500" value={formData.startingRate} error={/^Starting/.test(rateIssue)} onChange={(e) => setFormData((prev) => ({ ...prev, startingRate: e.target.value }))} />
                  </FormField>
                  <FormField label={isCoworkingForm ? "Current price" : "Current rate"} required error={/^Current/.test(rateIssue) ? rateIssue : ""}>
                    <FormInput big prefix="₹" suffix={isCoworkingForm ? "/ seat / mo" : "/ sq ft"} type="number" min="0" inputMode="decimal" placeholder="5,200" value={formData.currentRate} error={/^Current/.test(rateIssue)} onChange={(e) => setFormData((prev) => ({ ...prev, currentRate: e.target.value }))} />
                  </FormField>
                </div>
                {isCoworkingForm && coworkingFields.length ? (
                  <CoworkingPricingFields fields={coworkingFields} specs={knowledgeDraft.specs || {}} setSpec={setSpecField} />
                ) : null}
                {!isCoworkingForm ? (
                <FormGroup icon={MapPin} title="Preferential location charges" aside="% or ₹ amount">
                  <div className="grid gap-2.5 [grid-template-columns:repeat(auto-fit,minmax(200px,1fr))]">
                    {PLC_FIELDS.map(([key, label]) => (
                      <FormField key={key} label={label}>
                        <FormInput maxLength={60} placeholder={key === "group" ? "e.g. Group A, Premium" : "5% or ₹50,000"} value={formData[key] || ""} onChange={(e) => setFormData((prev) => ({ ...prev, [key]: e.target.value }))} />
                      </FormField>
                    ))}
                  </div>
                </FormGroup>
                ) : null}
                <FormCollapsible icon={Receipt} title="Other charges" hint={filledCharges ? `${filledCharges} added` : `Optional · ${CHARGE_FIELDS.length + 1} fields`} open={chargesOpen} onToggle={() => setChargesOpen((open) => !open)}>
                  <div className="grid gap-2.5 [grid-template-columns:repeat(auto-fit,minmax(200px,1fr))]">
                    {CHARGE_FIELDS.map(([key, label, placeholder]) => (
                      <FormField key={key} label={label}>
                        <FormInput maxLength={120} placeholder={placeholder} value={formData[key] || ""} onChange={(e) => setFormData((prev) => ({ ...prev, [key]: e.target.value }))} />
                      </FormField>
                    ))}
                    <FormField label="Other charges" wide>
                      <textarea rows={2} value={formData.otherCharges} onChange={(e) => setFormData((prev) => ({ ...prev, otherCharges: e.target.value }))} placeholder="Maintenance, Electricity, Water Connection, Registry, Club Charges" className="gl-field w-full resize-none px-3.5 py-2.5 text-[14px] outline-none" />
                    </FormField>
                  </div>
                </FormCollapsible>
              </>)}

              {wizardStep === 3 && (<>
              <div className="flex flex-col gap-2">
                <span className={FIELD_TITLE_CLASS}>Status *</span>
                <ChoiceCards
                  options={PROJECT_STATUS_OPTIONS.map((option) => ({ ...option, dot: STATUS_DOT[option.value] }))}
                  value={formData.status}
                  onChange={(value) => setFormData((prev) => ({ ...prev, status: value }))}
                  error={issueHere(3) && !formData.status}
                />
                {issueHere(3) && !formData.status ? <span className="text-[11.5px]" style={{ color: "var(--g-bad)" }}>Pick a status</span> : null}
              </div>

              <div className={SECTION_CLASS}>
                <div className={SECTION_HEADING_CLASS}>Amenities &amp; Infrastructure</div>
                {isCoworkingCategory(formData.projectCategory) ? (
                  <CoworkingServicesEditor
                    presets={coworkingServices}
                    amenities={knowledgeDraft.amenityStatuses || []}
                    onChange={(amenityStatuses) => setKnowledgeDraft((d) => ({ ...d, amenityStatuses }))}
                  />
                ) : (
                  <>
                    <PickChips
                      multi
                      round
                      options={isCommercialCategory(formData.projectCategory) ? PROJECT_COMMERCIAL_AMENITY_OPTIONS : PROJECT_AMENITY_OPTIONS}
                      value={formData.amenities}
                      onChange={(amenities) => setFormData((prev) => ({ ...prev, amenities }))}
                    />
                    {formData.amenities.length ? <span className="text-[12px] font-medium" style={{ color: "var(--g-b)" }}>{formData.amenities.length} selected</span> : null}
                    <label className={`${FIELD_TITLE_CLASS} mt-3 block`}>Other Facilities</label>
                    <textarea
                      rows={2}
                      maxLength={500}
                      value={formData.otherFacilities}
                      onChange={(e) => setFormData((prev) => ({ ...prev, otherFacilities: e.target.value }))}
                      placeholder="Anything not in the list, e.g. temple, shopping complex, school nearby"
                      className="mt-1 w-full resize-none rounded-lg border border-slate-300 bg-white p-2.5 text-sm text-slate-700 focus:outline-none focus:border-emerald-500"
                    />
                  </>
                )}
              </div>

              {!isCommercialForm && !isCoworkingForm && (
                <div className={SECTION_CLASS}>
                  <div className={SECTION_HEADING_CLASS}>Housing Category</div>
                  <PickChips
                    allowClear
                    options={PROJECT_HOUSING_CATEGORY_OPTIONS}
                    value={formData.housingCategory}
                    onChange={(value) => setFormData((prev) => ({ ...prev, housingCategory: value }))}
                  />
                </div>
              )}

              </>)}

              {wizardStep === 2 && (<>
              <div className={SECTION_CLASS}>
                <div className={SECTION_HEADING_CLASS}>Location</div>
                <div>
                  <label className={FIELD_TITLE_CLASS}>Complete Address</label>
                  <textarea
                    rows={2}
                    value={formData.location}
                    onChange={(e) => setFormData((prev) => ({ ...prev, location: e.target.value }))}
                    placeholder="Complete address"
                    className="mt-1 w-full resize-none rounded-lg border border-slate-300 bg-white p-2.5 text-sm text-slate-700 focus:outline-none focus:border-emerald-500"
                  />
                </div>
                {(isCommercialForm || isCoworkingForm) && (
                  <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
                    <div>
                      <label className={FIELD_TITLE_CLASS}>Landmark</label>
                      <input
                        type="text"
                        value={formData.landmark}
                        onChange={(e) => setFormData((prev) => ({ ...prev, landmark: e.target.value }))}
                        className={`${INPUT_CLASS} mt-1`}
                      />
                    </div>
                    <div>
                      <label className={FIELD_TITLE_CLASS}>City</label>
                      <input
                        type="text"
                        value={formData.city}
                        onChange={(e) => setFormData((prev) => ({ ...prev, city: e.target.value }))}
                        className={`${INPUT_CLASS} mt-1`}
                      />
                    </div>
                    <div>
                      <label className={FIELD_TITLE_CLASS}>State</label>
                      <input
                        type="text"
                        value={formData.state}
                        onChange={(e) => setFormData((prev) => ({ ...prev, state: e.target.value }))}
                        className={`${INPUT_CLASS} mt-1`}
                      />
                    </div>
                    <div>
                      <label className={FIELD_TITLE_CLASS}>Pincode</label>
                      <input
                        type="text"
                        value={formData.pincode}
                        onChange={(e) => setFormData((prev) => ({ ...prev, pincode: e.target.value }))}
                        className={`${INPUT_CLASS} mt-1`}
                      />
                    </div>
                    <div>
                      <label className={FIELD_TITLE_CLASS}>Latitude (Optional)</label>
                      <input
                        type="number"
                        step="any"
                        value={formData.locationLat}
                        onChange={(e) => setFormData((prev) => ({ ...prev, locationLat: e.target.value }))}
                        className={`${INPUT_CLASS} mt-1`}
                      />
                    </div>
                    <div>
                      <label className={FIELD_TITLE_CLASS}>Longitude (Optional)</label>
                      <input
                        type="number"
                        step="any"
                        value={formData.locationLng}
                        onChange={(e) => setFormData((prev) => ({ ...prev, locationLng: e.target.value }))}
                        className={`${INPUT_CLASS} mt-1`}
                      />
                    </div>
                  </div>
                )}
              </div>

              <div className="grid gap-3 [grid-template-columns:repeat(auto-fit,minmax(260px,1fr))]">
                {[["ownerManager", "Owner / manager", User, "Owner"], ["brokerManager", "Broker manager", ShieldHalf, "Broker"]].map(([prefix, title, Icon, errorStart]) => {
                  const bad = issueHere(2) && formIssue.startsWith(errorStart);
                  return (
                    <FormGroup key={prefix} icon={Icon} title={title}>
                      <FormInput placeholder="Name" value={formData[`${prefix}Name`] || ""} onChange={(e) => setFormData((prev) => ({ ...prev, [`${prefix}Name`]: e.target.value }))} />
                      <FormInput prefix="+91" type="tel" inputMode="numeric" maxLength={10} placeholder="10-digit mobile" error={bad} value={formData[`${prefix}Mobile`] || ""} onChange={(e) => setFormData((prev) => ({ ...prev, [`${prefix}Mobile`]: e.target.value.replace(/\D/g, "") }))} />
                      {bad ? <span className="text-[11.5px]" style={{ color: "var(--g-bad)" }}>Enter a valid 10-digit number</span> : null}
                    </FormGroup>
                  );
                })}
              </div>

              {isCoworkingForm ? (
                <>
                  <CoworkingContactsFields
                    contacts={knowledgeDraft.contacts || []}
                    onChange={(contacts) => setKnowledgeDraft((d) => ({ ...d, contacts }))}
                  />
                  <CoworkingPartnerTerms fields={coworkingFields} specs={knowledgeDraft.specs || {}} setSpec={setSpecField} />
                </>
              ) : null}
              </>)}

              {wizardStep === 0 && isPlotBasedType(formData.projectType) && (
                <div className={SECTION_CLASS}>
                  <div className={SECTION_HEADING_CLASS}>Inventory</div>
                  <div className="sm:max-w-xs">
                    <label className={FIELD_TITLE_CLASS}>Plots Available With Us</label>
                    <input
                      type="number"
                      min="0"
                      value={formData.plotsAvailable}
                      onChange={(e) => setFormData((prev) => ({ ...prev, plotsAvailable: e.target.value }))}
                      className={`${INPUT_CLASS} mt-1`}
                    />
                  </div>
                </div>
              )}

              {wizardStep === 3 && (<>
              <div className={SECTION_CLASS}>
                <div className={SECTION_HEADING_CLASS}>Project Media</div>
                <label className={`${FIELD_TITLE_CLASS} mb-2 block`}>Project Photos</label>

                {formData.images.length > 0 && (
                  <div className="mb-3 flex flex-wrap gap-2">
                    {formData.images.map((url, index) => (
                      <div
                        key={`${url}-${index}`}
                        className="group relative h-16 w-16 shrink-0 overflow-hidden rounded-lg"
                      >
                        <FittedImage src={url} alt="project" backdrop={false} />
                        <button
                          type="button"
                          onClick={() => removeImage(url)}
                          className="absolute right-0 top-0 bg-red-500 p-1 text-white opacity-0 transition-opacity group-hover:opacity-100"
                        >
                          <Trash2 size={12} />
                        </button>
                      </div>
                    ))}
                  </div>
                )}

                <div className="flex w-full items-center justify-center">
                  <label
                    className={`flex h-24 w-full flex-col items-center justify-center rounded-xl border-2 border-dashed border-slate-200 bg-slate-50 transition-all hover:bg-slate-100 ${
                      uploadingImages ? "cursor-not-allowed opacity-50" : "cursor-pointer"
                    }`}
                  >
                    <div className="flex flex-col items-center justify-center pb-6 pt-5">
                      {uploadingImages ? (
                        <Loader className="mb-2 animate-spin text-slate-400" size={24} />
                      ) : (
                        <UploadCloud className="mb-2 text-slate-400" size={24} />
                      )}
                      <p className="text-xs font-bold text-slate-500">
                        {uploadingImages ? "Uploading..." : "Click to upload photos"}
                      </p>
                      <p className="text-[10px] text-slate-400">SVG, PNG, JPG</p>
                    </div>
                    <input
                      type="file"
                      multiple
                      accept="image/*"
                      onChange={handleImageUpload}
                      disabled={uploadingImages}
                      className="hidden"
                    />
                  </label>
                </div>
              </div>

              {/* Project details (requirements 16 Oct 2026, section 05) - the same
                  record as the Project knowledge panel on the project page. */}
              {knowledgeCatalogue ? (
                <div className={SECTION_CLASS}>
                  <div className={SECTION_HEADING_CLASS}>
                    Project Details{knowledgeLoading ? <Loader2 size={12} className="ml-2 inline animate-spin" /> : null}
                  </div>
                  <p className="mb-3 text-[12px] text-slate-500">Everything a colleague needs to brief a client. All optional; it feeds the client brochure and internal dossier PDFs.</p>
                  <div className="space-y-2">
                    {[
                      ["overview", "Overview & location", (
                        <>
                          <FieldGrid fields={knowledgeCatalogue.overview} values={knowledgeDraft.overview} onChange={setKnowledgeIn("overview")} />
                          {isProjectManagement ? (
                            <label className="mt-3 block">
                              <span className="mb-1 block text-[11.5px] font-semibold text-slate-600">Internal notes <span className="text-amber-600">(Admin/Manager only, never in the brochure)</span></span>
                              <textarea rows={3} className="w-full rounded-lg border border-slate-300 bg-white px-2.5 py-2 text-[13px]" value={knowledgeDraft.internalNotes || ""} onChange={(e) => setKnowledgeDraft((d) => ({ ...d, internalNotes: e.target.value }))} />
                            </label>
                          ) : null}
                        </>
                      )],
                      ["specs", "Specifications", (() => {
                        const specFields = knowledgeCatalogue.specs?.[formData.projectCategory] || [];
                        // A workspace fills most of these in the steps above.
                        const rest = isCoworkingForm ? specFields.filter((f) => !COWORKING_FORM_KEYS.has(f.key)) : specFields;
                        if (!specFields.length) return <p className="text-[12.5px] text-slate-500">Pick the project category first.</p>;
                        return (
                          <>
                            {isCoworkingForm ? <p className="mb-2 text-[11.5px] text-slate-500">The workspace, pricing, services and contacts are in the steps above. The address and area here are filled from the form when you save.</p> : null}
                            {rest.length ? <FieldGrid fields={rest} values={knowledgeDraft.specs} onChange={setKnowledgeIn("specs")} /> : null}
                          </>
                        );
                      })()],
                      ["pricing", "Pricing details", (
                        <>
                          <FieldGrid fields={(knowledgeCatalogue.pricing || []).filter((f) => f.source !== "project")} values={knowledgeDraft.pricing} onChange={setKnowledgeIn("pricing")} />
                          <p className="mt-2 text-[11.5px] text-slate-500">Charges and PLCs are in the Pricing section above.</p>
                          <label className="mt-2 flex items-center gap-2 text-[13px]">
                            <input type="checkbox" checked={Boolean(knowledgeDraft.pricingPublished)} disabled={!isProjectManagement} onChange={(e) => setKnowledgeDraft((d) => ({ ...d, pricingPublished: e.target.checked }))} />
                            Pricing is published (shown in the client brochure){!isProjectManagement ? " - Admin/Manager decide" : ""}
                          </label>
                        </>
                      )],
                      ["legal", "Approvals & RERA", (
                        <>
                          <FieldGrid fields={knowledgeCatalogue.legal} values={knowledgeDraft.legal} onChange={setKnowledgeIn("legal")} />
                          <div className="mt-3"><ApprovalStatusSelect statuses={knowledgeCatalogue.approvalStatuses} value={knowledgeDraft.approvalStatus} isManagement={isProjectManagement} onChange={(approvalStatus) => setKnowledgeDraft((d) => ({ ...d, approvalStatus }))} /></div>
                        </>
                      )],
                      ["contacts", `Contacts (${(knowledgeDraft.contacts || []).length})`, (
                        <ContactsEditor contacts={knowledgeDraft.contacts || []} roles={knowledgeCatalogue.contactRoles} onChange={(contacts) => setKnowledgeDraft((d) => ({ ...d, contacts }))} />
                      )],
                      ["amenityStatus", `Amenity status (${(knowledgeDraft.amenityStatuses || []).length})`, (
                        <>
                          <p className="mb-2 text-[11.5px] text-slate-500">Give amenities a status (available, planned, not available), mark chargeable ones and add notes.</p>
                          <AmenityStatusEditor
                            amenities={knowledgeDraft.amenityStatuses || []}
                            statuses={knowledgeCatalogue.amenityStatuses}
                            presets={knowledgeCatalogue.amenityPresets?.[formData.projectCategory] || []}
                            onChange={(amenityStatuses) => setKnowledgeDraft((d) => ({ ...d, amenityStatuses }))}
                          />
                        </>
                      )],
                      ["documents", `Documents (${existingDocuments.length + pendingDocuments.length})`, (
                        <>
                          {existingDocuments.length || pendingDocuments.length ? (
                            <ul className="mb-2 space-y-1 text-[12.5px]">
                              {existingDocuments.map((d, i) => (
                                <li key={d._id || `e${i}`} className={d.superseded ? "text-slate-400" : "text-slate-700"}>
                                  <a href={d.url} target="_blank" rel="noreferrer" className="font-semibold text-blue-700 hover:underline">{d.name}</a> · {humanizeKey(d.category)} · v{d.version}{d.superseded ? " · superseded" : ""}
                                </li>
                              ))}
                              {pendingDocuments.map((d, i) => (
                                <li key={`p${i}`} className="flex items-center gap-2 text-slate-700">
                                  <span className="font-semibold">{d.name}</span> · {humanizeKey(d.category)}{d.clientShareable ? " · client-shareable" : ""}
                                  <span className="rounded-full bg-amber-50 px-2 text-[11px] text-amber-700">added when you save</span>
                                  <button type="button" className="text-rose-500" aria-label={`Remove ${d.name}`} onClick={() => setPendingDocuments((list) => list.filter((_, n) => n !== i))}>×</button>
                                </li>
                              ))}
                            </ul>
                          ) : null}
                          <DocumentUploader
                            categories={knowledgeCatalogue.documentCategories}
                            onUpload={async (file, meta) => {
                              const saved = await uploadFile(file, "inventory-documents");
                              const url = saved?.url || saved?.fileUrl || saved?.file?.url;
                              if (!url) throw new Error("Upload failed");
                              setPendingDocuments((list) => [...list, { ...meta, url }]);
                            }}
                          />
                          <p className="mt-1 text-[11.5px] text-slate-500">Brochure, layout, price list, plans, approvals, payment plan… Site and progress photos go in Project Media above, or on the project page.</p>
                        </>
                      )],
                    ].map(([id, title, body]) => (
                      <details key={id} className="rounded-lg border border-slate-200 bg-white">
                        <summary className="cursor-pointer select-none px-3 py-2 text-[13px] font-semibold text-slate-800">{title}</summary>
                        <div className="border-t border-slate-100 p-3">{body}</div>
                      </details>
                    ))}
                  </div>
                </div>
              ) : null}
              </>)}

              {wizardStep === 4 && (<>
                <div className="flex items-center gap-3.5 rounded-[18px] p-4" style={{ background: "var(--g-bs)" }}>
                  <span className="grid h-[52px] w-[52px] shrink-0 place-items-center rounded-2xl text-white" style={{ background: "var(--g-bfill, var(--g-b))" }}>
                    {React.createElement(CATEGORY_CARD_META[formData.projectCategory]?.icon || Layers3, { size: 24 })}
                  </span>
                  <div className="flex min-w-0 flex-col gap-0.5">
                    <span className="truncate text-[18px] font-semibold">{formData.projectName || "Untitled project"}</span>
                    <span className="truncate text-[13px]" style={{ color: "var(--g-mut)" }}>{[categoryLabel, typeLabel, formData.city].filter(Boolean).join(" · ")}</span>
                  </div>
                </div>
                <ReviewGroup title="Basics" onEdit={() => goToStep(0)} rows={[
                  ["Category", categoryLabel],
                  ...(!isCommercialForm && !isCoworkingForm ? [["Type", typeLabel]] : []),
                  [isCoworkingForm ? "Total area" : "Land area", formData.totalLandArea],
                  ...(isPlotBasedType(formData.projectType) && !isCommercialForm ? [["Plots", formData.totalPlots], ["Plot size", formData.plotSizeMin || formData.plotSizeMax ? `${formData.plotSizeMin || "?"}–${formData.plotSizeMax || "?"} sq ft` : ""], ["Plots available with us", formData.plotsAvailable]] : []),
                  ...(isBuildingType(formData.projectType) && !isCommercialForm ? [["Flats", formData.numberOfFlats], ["Floors", formData.numberOfFloors], ["BHK", formData.bhkConfigurations.map((c) => getProjectOptionLabel(PROJECT_BHK_OPTIONS, c.bhk)).join(", ")]] : []),
                  ...(isCommercialForm ? [["Floors", formData.totalFloors], ["Units", `${formData.offices.length} offices · ${formData.shops.length} shops · ${formData.showrooms.length} showrooms`]] : []),
                ]} />
                {isCoworkingForm ? (
                  <ReviewGroup title="Workspace" onEdit={() => goToStep(0)} rows={coworkingReviewRows(knowledgeDraft.specs || {}, knowledgeDraft.amenityStatuses || [])} />
                ) : null}
                <ReviewGroup title="Pricing" onEdit={() => goToStep(1)} rows={[
                  [isCoworkingForm ? "Starting price" : "Starting rate", formData.startingRate !== "" ? `₹${Number(formData.startingRate).toLocaleString("en-IN")} ${isCoworkingForm ? "/ seat / mo" : "/ sq ft"}` : ""],
                  [isCoworkingForm ? "Current price" : "Current rate", formData.currentRate !== "" ? `₹${Number(formData.currentRate).toLocaleString("en-IN")} ${isCoworkingForm ? "/ seat / mo" : "/ sq ft"}` : ""],
                  ...(isCoworkingForm ? [] : [["PLC", `${filledPlc} of ${PLC_FIELDS.length - 1} filled`]]),
                  ["Other charges", `${filledCharges} of ${CHARGE_FIELDS.length + 1} filled`],
                ]} />
                <ReviewGroup title="Location & contacts" onEdit={() => goToStep(2)} rows={[
                  ["Address", [formData.location, formData.city, formData.pincode].filter(Boolean).join(", ")],
                  ["Owner / manager", formData.ownerManagerName ? `${formData.ownerManagerName} · ${formData.ownerManagerMobile || "no mobile"}` : ""],
                  ["Broker manager", formData.brokerManagerName ? `${formData.brokerManagerName} · ${formData.brokerManagerMobile || "no mobile"}` : ""],
                ]} />
                <ReviewGroup title="Features" onEdit={() => goToStep(3)} rows={[
                  ["Status", getProjectOptionLabel(PROJECT_STATUS_OPTIONS, formData.status)],
                  ...(isCoworkingForm ? [] : [["Amenities", formData.amenities.length ? `${formData.amenities.length} selected` : ""]]),
                  ...(!isCommercialForm && !isCoworkingForm ? [["Housing category", getProjectOptionLabel(PROJECT_HOUSING_CATEGORY_OPTIONS, formData.housingCategory)]] : []),
                  ["Photos", formData.images.length ? `${formData.images.length} uploaded` : ""],
                  ["Documents", pendingDocuments.length ? `${pendingDocuments.length} to add on save` : existingDocuments.length ? `${existingDocuments.length} on file` : ""],
                ]} />
                {issueStep !== -1 ? <p className="rounded-xl px-3.5 py-2.5 text-[12.5px]" style={{ background: "var(--g-warns)", color: "var(--g-warn)" }}>{WIZARD_STEPS[issueStep].label} still needs attention - {formIssue}</p> : null}
              </>)}
        </FormWizard>
      )}

      {deleteTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-3">
          <div className="w-full max-w-sm rounded-2xl bg-white p-5 shadow-2xl">
            <h2 className="text-base font-extrabold text-slate-900">{deleteNeedsApproval ? "Request project delete?" : "Delete Project?"}</h2>
            <p className="mt-2 text-sm text-slate-500">
              {deleteNeedsApproval ? (
                <>An Admin has to approve deleting <span className="font-bold text-slate-700">{deleteTarget.projectName}</span>. It stays until they do.</>
              ) : (
                <>Are you sure you want to delete <span className="font-bold text-slate-700">{deleteTarget.projectName}</span>? This action cannot be undone.</>
              )}
            </p>
            <div className="mt-5 flex gap-3">
              <button
                type="button"
                onClick={() => setDeleteTarget(null)}
                className="flex-1 rounded-xl py-2.5 text-xs font-bold uppercase text-slate-500 hover:bg-slate-100"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={confirmDelete}
                disabled={deleting}
                className={`flex-1 rounded-xl py-2.5 text-xs font-bold uppercase tracking-widest text-white ${
                  deleting ? "cursor-not-allowed bg-slate-400" : "bg-red-600 hover:bg-red-700"
                }`}
              >
                {deleting ? (deleteNeedsApproval ? "Sending..." : "Deleting...") : (deleteNeedsApproval ? "Send request" : "Delete")}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ProjectsPage;
