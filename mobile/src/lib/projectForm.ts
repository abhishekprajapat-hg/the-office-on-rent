/* Choices and checks for the project form; mirrors project.constants.js and project.service.js. Pure; unit tested. */

export const PROJECT_TYPES = [
  { key: "PLOTTING", label: "Plotting" },
  { key: "BUILDING", label: "Building" },
  { key: "VILLAS_FARMHOUSE", label: "Villas / farmhouse" },
] as const;
export const PROJECT_STATUSES = ["PRE_LAUNCH", "TNC", "RERA_APPROVED", "UNDER_CONSTRUCTION", "READY_TO_MOVE", "RESALE"] as const;
export const PLOT_SIZES = ["600", "800", "1000", "1200", "1500", "1800", "2000", "CUSTOM"] as const;
export const BHK_TYPES = ["1_BHK", "2_BHK", "2_5_BHK", "3_BHK", "4_BHK", "4_5_BHK"] as const;
export const HOUSING_CATEGORIES = ["EWS", "LIG", "MIG", "HIG"] as const;
export const RESIDENTIAL_AMENITIES = ["KIDS_PLAY_AREA", "PARTY_LAWN", "SPORTS_AREA", "GARDEN", "YOGA_MEDITATION_AREA", "WATER_TANK", "SECURITY_24X7", "GAZEBO", "SWIMMING_POOL", "WALKING_TRACK", "CLUB_HOUSE",
  // Infrastructure (21 Oct 2026) - keep in step with backend constants/project.constants.js.
  "GATED_ENTRY", "CCTV_SURVEILLANCE", "INTERNAL_ROADS", "STREET_LIGHTING", "WATER_SUPPLY", "ELECTRICITY", "DRAINAGE", "PARKING",
] as const;
export const COMMERCIAL_AMENITIES = [
  "LIFT", "HIGH_SPEED_ELEVATOR", "VISITOR_PARKING", "RESERVED_PARKING", "CAFETERIA", "FOOD_COURT", "RECEPTION_LOBBY", "WAITING_LOUNGE",
  "CONFERENCE_ROOM", "MEETING_ROOM", "POWER_BACKUP", "DG_BACKUP", "FIRE_SAFETY_SYSTEM", "CCTV_SURVEILLANCE", "SECURITY_24X7", "ACCESS_CONTROL",
  "BIOMETRIC_ENTRY", "CENTRAL_AIR_CONDITIONING", "PANTRY", "WASHROOMS", "ATM_SPACE", "EV_CHARGING", "LOADING_BAY", "SERVICE_LIFT", "LANDSCAPED_GARDEN",
] as const;

export type ProjectDraft = {
  projectCategory: "RESIDENTIAL" | "COMMERCIAL";
  projectType: string;
  projectName: string;
  totalLandArea: string;
  status: string;
  startingRate: number | null;
  currentRate: number | null;
  totalPlots: string;
  plotsAvailable: string;
  plotSize: string;
  customPlotSize: string;
  // Plot size range in sq ft (21 Oct 2026) - replaces the single plot size.
  plotSizeMin: string;
  plotSizeMax: string;
  numberOfFlats: string;
  numberOfFloors: string;
  flatsPerFloor: string;
  bhk: { bhk: string; size: string }[];
  totalFloors: string;
  officesPerFloor: string;
  ownerManagerMobile: string;
  brokerManagerMobile: string;
};

const positiveInt = (value: string) => /^\d+$/.test(value.trim()) && Number(value) > 0;

/* The first problem with the form, or null. The server re-checks everything. */
export const validateProjectDraft = (draft: ProjectDraft) => {
  if (!draft.projectName.trim()) return "Enter the project name";
  if (!draft.totalLandArea.trim()) return "Enter the total land area";
  if (!draft.status) return "Pick the project status";
  if (draft.startingRate === null || draft.startingRate < 0) return "Enter the starting rate";
  if (draft.currentRate === null || draft.currentRate < 0) return "Enter the current rate";
  if (draft.currentRate < draft.startingRate) return "The current rate can't be below the starting rate";
  if (draft.projectCategory === "RESIDENTIAL") {
    if (!draft.projectType) return "Pick the project type";
    if (draft.projectType === "BUILDING") {
      if (!positiveInt(draft.numberOfFlats)) return "Enter the number of flats";
      if (!positiveInt(draft.numberOfFloors)) return "Enter the number of floors";
      if (!positiveInt(draft.flatsPerFloor)) return "Enter flats per floor";
      if (!draft.bhk.length) return "Add at least one BHK configuration";
      const seen = new Set<string>();
      for (const row of draft.bhk) {
        if (seen.has(row.bhk)) return `${row.bhk.replace(/_/g, " ").replace(" 5 ", ".5 ")} is listed twice`;
        seen.add(row.bhk);
        if (!(Number(row.size) > 0)) return "Every BHK configuration needs a flat size";
      }
    } else {
      if (!/^\d+$/.test(draft.totalPlots.trim())) return "Enter the total number of plots";
      if (draft.plotsAvailable.trim() && Number(draft.plotsAvailable) > Number(draft.totalPlots)) return "Plots available can't exceed total plots";
      if (draft.plotSizeMin.trim() && draft.plotSizeMax.trim() && Number(draft.plotSizeMin) > Number(draft.plotSizeMax)) {
        return "The smallest plot size can't be bigger than the largest";
      }
    }
  } else {
    if (!positiveInt(draft.totalFloors)) return "Enter the total floors";
    if (!positiveInt(draft.officesPerFloor)) return "Enter offices per floor";
  }
  for (const [label, value] of [["Owner manager mobile", draft.ownerManagerMobile], ["Broker manager mobile", draft.brokerManagerMobile]] as const) {
    if (value.trim() && !/^\d{10}$/.test(value.trim())) return `${label} must be 10 digits`;
  }
  return null;
};
