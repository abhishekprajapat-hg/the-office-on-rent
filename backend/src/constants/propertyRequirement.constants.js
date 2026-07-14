const INVENTORY_TYPES = ["COMMERCIAL", "RESIDENTIAL"];

const FURNISHING_OPTIONS = [
  "",
  "UNFURNISHED",
  "SEMI_FURNISHED",
  "FULLY_FURNISHED",
  "BARE_SHELL",
  "WARM_SHELL",
];

const text = (key) => ({ key, type: "text" });
const number = (key) => ({ key, type: "number" });
const bool = (key) => ({ key, type: "boolean" });
const date = (key) => ({ key, type: "date" });
const select = (key) => ({ key, type: "select" });

const PROPERTY_REQUIREMENT_CONFIG = {
  COMMERCIAL: {
    OFFICE: [
      number("seats"), number("cabins"), number("conferenceRooms"), number("conferenceSeats"), text("preferredFloor"),
      bool("receptionArea"), bool("waitingArea"), bool("pantry"), bool("cafeteria"),
      bool("serverRoom"), bool("storageRoom"), bool("breakoutArea"), bool("parking"),
      bool("liftAvailable"), bool("powerBackup"), bool("centralAC"),
    ],
    COWORKING: [
      number("requiredSeats"), select("deskType"), number("privateCabins"), number("meetingRooms"),
      number("perSeatBudget"), bool("internetRequired"), bool("printingFacility"),
      bool("reception"), bool("pantry"), bool("parking"), bool("access24x7"), bool("powerBackup"),
    ],
    MANAGED_OFFICE: [
      number("requiredSeats"), number("cabins"), number("meetingRooms"), bool("brandingRequired"),
      bool("itSetupRequired"), bool("dedicatedReception"), text("leaseDuration"), date("moveInDate"),
      select("budgetMode"), bool("pantry"), bool("parking"), bool("powerBackup"), bool("centralAC"),
    ],
    SHOP: [
      text("preferredFloor"), bool("groundFloorPreferred"), number("carpetArea"), number("frontage"),
      select("roadType"), bool("cornerShop"), bool("washroom"), bool("parking"),
      text("suitableBusinessCategory"), date("possessionDate"),
    ],
    SHOWROOM: [
      text("preferredFloor"), number("carpetArea"), number("frontage"), number("ceilingHeight"),
      bool("mainRoadVisibility"), number("displayArea"), number("parkingCapacity"),
      text("brandCategory"), bool("washroom"), text("powerLoad"), date("possessionDate"),
    ],
    CAFE: [
      number("indoorArea"), number("outdoorArea"), number("seatingCapacity"), bool("kitchenAvailable"),
      bool("exhaustProvision"), bool("gasConnection"), bool("fireNocRequired"), bool("washroom"),
      bool("parking"), bool("highFootfallPreferred"), bool("outdoorSeatingRequired"),
    ],
    ROOFTOP: [
      number("totalRooftopArea"), number("coveredArea"), number("openArea"), bool("liftAccess"),
      bool("washroom"), bool("kitchenSetup"), select("intendedUse"),
      bool("commercialPermissionRequired"), text("viewPreference"), bool("parking"),
    ],
    WAREHOUSE: [
      number("warehouseArea"), number("clearHeight"), number("entryGateHeight"), bool("truckAccess"),
      bool("loadingUnloadingArea"), bool("dockAvailable"), text("powerLoad"), bool("fireSafety"),
      bool("officeSpaceRequired"), bool("washroom"), bool("parking"), number("roadWidth"),
    ],
    INDUSTRIAL: [
      number("landArea"), number("builtUpArea"), text("powerLoad"), number("shedHeight"),
      bool("machinerySetupRequired"), bool("labourAccommodation"), bool("truckAccess"),
      bool("loadingArea"), bool("fireSafety"), text("pollutionCategory"),
      bool("waterConnection"), bool("electricityConnection"),
    ],
    OTHER: [text("customRequirementNotes")],
  },
  RESIDENTIAL: {
    APARTMENT: [
      select("bhkType"), text("preferredFloor"), number("totalFloors"), number("bathrooms"),
      number("balconies"), text("facing"), text("propertyAge"), bool("gatedSociety"),
      bool("lift"), bool("security"), bool("gym"), bool("swimmingPool"), bool("clubhouse"),
      bool("parking"), bool("powerBackup"), bool("gasPipeline"), bool("modularKitchen"),
      bool("servantRoom"), bool("studyRoom"),
    ],
    INDEPENDENT_HOUSE: [
      select("bhkType"), number("numberOfFloors"), number("plotArea"), number("builtUpArea"),
      number("bathrooms"), number("balconies"), text("facing"), bool("cornerProperty"),
      bool("privateParking"), bool("garden"), bool("terrace"), bool("servantRoom"),
      bool("storageRoom"), bool("powerBackup"), bool("gasPipeline"), bool("separateEntry"),
    ],
    VILLA: [
      select("bhkType"), number("plotArea"), number("builtUpArea"), number("numberOfFloors"),
      number("bathrooms"), number("balconies"), text("facing"), bool("privateGarden"),
      bool("privatePool"), number("parkingCapacity"), bool("servantRoom"), bool("studyRoom"),
      bool("clubhouse"), bool("security"), bool("powerBackup"), bool("gatedCommunity"),
    ],
    PENTHOUSE: [
      select("bhkType"), text("preferredFloor"), number("terraceArea"), bool("privateTerrace"),
      bool("privateLift"), number("bathrooms"), number("balconies"), bool("servantRoom"),
      bool("studyRoom"), bool("parking"), bool("powerBackup"), bool("clubhouse"),
      bool("swimmingPool"), text("viewPreference"),
    ],
    STUDIO_APARTMENT: [
      number("carpetArea"), text("preferredFloor"), bool("attachedBathroom"), text("kitchenType"),
      bool("balcony"), bool("parking"), bool("lift"), bool("security"), bool("powerBackup"),
      select("suitableFor"),
    ],
    BUILDER_FLOOR: [
      select("bhkType"), text("preferredFloor"), number("totalFloors"), bool("independentEntry"),
      bool("parking"), bool("lift"), bool("terraceRights"), number("balconies"),
      number("bathrooms"), text("facing"), bool("powerBackup"), text("propertyAge"),
    ],
    PLOT: [
      number("plotArea"), number("plotLength"), number("plotWidth"), number("frontage"),
      number("roadWidth"), text("facing"), bool("cornerPlot"), bool("gatedColony"),
      bool("approvedColony"), bool("boundaryWall"), bool("constructionAllowed"),
      text("ownershipType"), select("suitableFor"),
    ],
    FARM_HOUSE: [
      number("landArea"), number("builtUpArea"), number("bedrooms"), number("bathrooms"),
      bool("existingConstruction"), bool("boundaryWall"), bool("waterConnection"),
      bool("electricityConnection"), bool("roadAccess"), bool("gardenPlantation"),
      bool("swimmingPool"), bool("servantQuarter"), bool("parking"), text("distanceFromCity"),
    ],
    PG_HOSTEL: [
      select("occupancyType"), select("sharingType"), number("numberOfBeds"), number("perBedBudget"),
      bool("foodIncluded"), bool("attachedWashroom"), bool("acRequired"), bool("wifi"),
      bool("laundry"), bool("powerBackup"), bool("security"), bool("parking"), date("moveInDate"),
    ],
    OTHER: [text("customRequirementNotes")],
  },
};

const PROPERTY_SUBTYPE_VALUES = Object.fromEntries(
  Object.entries(PROPERTY_REQUIREMENT_CONFIG).map(([inventoryType, subtypes]) => [
    inventoryType,
    Object.keys(subtypes),
  ]),
);

const PROPERTY_SUBTYPE_FIELD_MAP = Object.fromEntries(
  Object.entries(PROPERTY_REQUIREMENT_CONFIG).flatMap(([inventoryType, subtypes]) =>
    Object.entries(subtypes).map(([subtype, fields]) => [
      `${inventoryType}:${subtype}`,
      new Map(fields.map((field) => [field.key, field])),
    ]),
  ),
);

module.exports = {
  INVENTORY_TYPES,
  FURNISHING_OPTIONS,
  PROPERTY_REQUIREMENT_CONFIG,
  PROPERTY_SUBTYPE_VALUES,
  PROPERTY_SUBTYPE_FIELD_MAP,
};
