// @ts-nocheck
/*
 * Bulk lead sheet parsing - a verbatim port of the parser in
 * frontend/src/modules/leads/LeadsMatrix.jsx (normalizeCsvHeader .. parseBulkLeadCsvRows),
 * kept identical so a spreadsheet produces the same leads on web and mobile.
 * If the web parser changes, re-copy it here. Pure; unit tested.
 * Re-copied 13 Nov 2026: Coworking sheet type, budget ranges, follow-up 1-3,
 * NAME-cell call logs, and each row's sheet row number plus a list of rows
 * that were skipped (and why) for the upload report.
 */

const normalizeCsvHeader = (value) =>
  String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[\s_/-]+/g, "");

const BULK_LEAD_SHEET_TYPES = {
  COMMERCIAL: "COMMERCIAL",
  RESIDENTIAL: "RESIDENTIAL",
  COWORKING: "COWORKING",
};

const DEFAULT_BULK_LEAD_SHEET_TYPE = BULK_LEAD_SHEET_TYPES.COMMERCIAL;

const normalizeBulkCellText = (value) => {
  if (value === null || value === undefined) return "";
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return value.toISOString().slice(0, 10);
  }
  return String(value).trim();
};

const normalizeBulkPhone = (value) => {
  const raw = normalizeBulkCellText(value);
  if (!raw) return "";
  const digits = raw.replace(/\D/g, "");
  if (digits.length < 10) return "";
  return digits.slice(-10);
};

const normalizeBulkAmount = (value) => {
  const raw = normalizeBulkCellText(value);
  if (!raw) return null;
  const lower = raw.toLowerCase();
  const numeric = Number.parseFloat(raw.replace(/,/g, "").replace(/[^\d.]/g, ""));
  if (!Number.isFinite(numeric)) return null;
  if (/\blac\b|\blakh\b|\bl\b/.test(lower)) return Math.round(numeric * 100000);
  if (/\bk\b/.test(lower)) return Math.round(numeric * 1000);
  return Math.round(numeric);
};

const normalizeBulkNumber = (value) => {
  const raw = normalizeBulkCellText(value);
  if (!raw) return null;
  const numeric = Number.parseFloat(raw.replace(/,/g, "").replace(/[^\d.]/g, ""));
  return Number.isFinite(numeric) ? numeric : null;
};

const normalizeBulkBoolean = (value) => {
  const raw = normalizeBulkCellText(value).toLowerCase();
  if (!raw) return false;
  return ["yes", "y", "true", "1", "available", "required", "required hai", "hai"].includes(raw);
};

const normalizeBulkDate = (value) => {
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return value.toISOString();
  }

  const raw = normalizeBulkCellText(value);
  if (!raw) return "";

  const dateMatch = raw.replace(/\s+/g, "").match(/(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})/);
  if (dateMatch) {
    const day = Number.parseInt(dateMatch[1], 10);
    const month = Number.parseInt(dateMatch[2], 10) - 1;
    const rawYear = Number.parseInt(dateMatch[3], 10);
    const year = rawYear < 100 ? 2000 + rawYear : rawYear;
    const parsed = new Date(year, month, day, 12);
    if (
      parsed.getFullYear() === year
      && parsed.getMonth() === month
      && parsed.getDate() === day
    ) {
      return parsed.toISOString();
    }
  }

  const parsed = new Date(raw);
  return Number.isNaN(parsed.getTime()) ? "" : parsed.toISOString();
};

const normalizeBulkTransactionType = (value) => {
  const normalized = normalizeBulkCellText(value).toLowerCase();
  if (!normalized) return "";
  if (/\blease\b/.test(normalized)) return "LEASE";
  if (/\brent\b/.test(normalized)) return "RENT";
  if (/\b(purchase|sale|buy|sell)\b/.test(normalized)) return "SALE";
  return "";
};

const resolveLeadCsvHeaderKey = (rawHeader) => {
  const normalized = normalizeCsvHeader(rawHeader);
  if (!normalized) return "";

  if (["name", "leadname", "fullname", "clientname"].includes(normalized)) return "name";
  if (["phone", "mobile", "mobileno", "phonenumber", "number", "contact"].includes(normalized)) return "phone";
  if (["email", "emailid"].includes(normalized)) return "email";
  if (["city", "location"].includes(normalized)) return "city";
  if (["project", "projectinterested", "interestedproject"].includes(normalized)) {
    return "projectInterested";
  }
  if (["requirement", "requirment", "requiremnt", "requiremewnt"].includes(normalized)) return "requirement";
  if (["projectname"].includes(normalized)) return "projectName";
  if (["comment", "comments", "remark", "remarks", "feedback"].includes(normalized)) return "comment";
  if (["workprofile", "profession", "occupation", "clientprofession"].includes(normalized)) return "workProfile";
  if (["company", "companyname", "working", "business"].includes(normalized)) return "company";
  if (["status", "leadstatus", "leadstutas", "leadstutus"].includes(normalized)) return "status";
  if (["date", "leaddate"].includes(normalized)) return "date";
  if (["followup", "followupdate", "nextfollowup"].includes(normalized)) return "followUp";
  if (["followup1", "followupdate1", "1stfollowup", "firstfollowup"].includes(normalized)) return "followUp1";
  if (["followup2", "followupdate2", "2ndfollowup", "secondfollowup"].includes(normalized)) return "followUp2";
  if (["followup3", "followupdate3", "3rdfollowup", "thirdfollowup"].includes(normalized)) return "followUp3";
  if (["photovideo", "photosvideos", "photo", "photos", "video", "videos", "photovideoshared"].includes(normalized)) return "photoVideo";
  if (["callupdate", "callstatus"].includes(normalized)) return "callUpdate";
  if (["propertytype", "type"].includes(normalized)) return "propertyType";
  if (["bhk", "bhktype", "bedroom", "bedrooms", "configuration"].includes(normalized)) return "bhkType";
  if (["floor", "floornumber"].includes(normalized)) return "floor";
  if (["amenities", "amenity"].includes(normalized)) return "amenities";
  if (["lift", "elevator"].includes(normalized)) return "lift";
  if (["security"].includes(normalized)) return "security";
  if (["gym"].includes(normalized)) return "gym";
  if (["swimmingpool", "pool"].includes(normalized)) return "swimmingPool";
  if (["clubhouse", "club"].includes(normalized)) return "clubhouse";
  if (["powerbackup", "electricitybackup", "backup"].includes(normalized)) return "powerBackup";
  if (["parking", "carparking"].includes(normalized)) return "parking";
  if (["studyroom", "study"].includes(normalized)) return "studyRoom";
  if (["servantroom", "servant"].includes(normalized)) return "servantRoom";
  if (["modularkitchen", "kitchen"].includes(normalized)) return "modularKitchen";
  if (["gaspipeline", "gas"].includes(normalized)) return "gasPipeline";
  if (["seats", "seat", "workstations", "workstation"].includes(normalized)) return "seats";
  if (["cabins", "cabin", "privatecabins"].includes(normalized)) return "cabins";
  if (["conferencerooms", "meetingrooms", "meetingroom"].includes(normalized)) return "conferenceRooms";
  if (["conferenceseats", "meetingseats"].includes(normalized)) return "conferenceSeats";
  if (["pantry"].includes(normalized)) return "pantry";
  if (["reception", "receptionarea"].includes(normalized)) return "receptionArea";
  if (["waiting", "waitingarea"].includes(normalized)) return "waitingArea";
  if (["cafeteria", "cafe"].includes(normalized)) return "cafeteria";
  if (["serverroom", "server"].includes(normalized)) return "serverRoom";
  if (["storageroom", "storage"].includes(normalized)) return "storageRoom";
  if (["breakoutarea", "breakout"].includes(normalized)) return "breakoutArea";
  if (["centralac", "ac"].includes(normalized)) return "centralAC";
  if (["firesafety", "fire"].includes(normalized)) return "fireSafety";
  if (["readytomove", "ready"].includes(normalized)) return "readyToMove";
  if (["underconstruction", "construction"].includes(normalized)) return "underConstruction";
  if (["budget"].includes(normalized)) return "budget";
  if (["visit", "visitupdate"].includes(normalized)) return "visit";
  if (["handle", "handledby", "owner"].includes(normalized)) return "handle";
  if (["optionshare", "optionsshared", "optionsshare"].includes(normalized)) return "optionShare";
  if (["timeline", "timeLine"].includes(normalized)) return "timeline";
  if (["leadsource", "source"].includes(normalized)) return "source";
  if (["inventoryid", "propertyid", "unitid", "assetid"].includes(normalized)) {
    return "inventoryId";
  }
  if (["sitelat", "latitude", "lat"].includes(normalized)) return "siteLat";
  if (["sitelng", "longitude", "long", "lng"].includes(normalized)) return "siteLng";
  if (["siteradiusmeters", "radiusmeters", "radius", "siteradius"].includes(normalized)) {
    return "siteRadiusMeters";
  }

  return "";
};

/*
 * Budget cells are free text in real sheets: "12000", "15k to 20k", "1.2 lakh",
 * "no budget". Returns { min, max } in rupees, or null when there is no number.
 * A suffix on the last number carries to an earlier bare one ("15 to 20k").
 */
const BULK_BUDGET_MULTIPLIERS = { k: 1000, thousand: 1000, l: 100000, lac: 100000, lakh: 100000, lakhs: 100000, cr: 10000000, crore: 10000000 };
const normalizeBulkBudgetRange = (value) => {
  const raw = normalizeBulkCellText(value).toLowerCase().replace(/,/g, "");
  if (!raw) return null;
  const parts = [...raw.matchAll(/(\d+(?:\.\d+)?)\s*(k|thousand|lakhs?|lac|l|crore|cr)?\b/g)];
  if (!parts.length) return null;
  const lastSuffix = parts[parts.length - 1][2] || "";
  const amounts = parts.map(([, num, suffix]) => {
    const multiplier = BULK_BUDGET_MULTIPLIERS[suffix || lastSuffix] || 1;
    return Math.round(Number.parseFloat(num) * multiplier);
  }).filter((amount) => Number.isFinite(amount) && amount > 0);
  if (!amounts.length) return null;
  return { min: Math.min(...amounts), max: Math.max(...amounts) };
};

/*
 * Some sheets use the NAME column as a call log - "29/7/2025\ninterested",
 * "0" - rather than a person's name. Dates and bare status words are lifted
 * out (the words still count towards the lead's status) and whatever real
 * name text is left is kept.
 */
const BULK_STATUS_WORDS = /\b(interested|intersted|interseted|notint|not\s*interested|occupied|oocupied|npc|call\s*cut|busy|switch(?:ed)?\s*off|visited|visit|closed|lost|invalid|follow\s*up|callback|call\s*back)\b/gi;
const splitBulkNameCell = (value) => {
  const raw = normalizeBulkCellText(value);
  if (!raw) return { name: "", note: "" };
  const withoutDates = raw.replace(/\d{1,2}\s*[/.-]\s*\d{1,2}\s*[/.-]\s*\d{2,4}/g, " ");
  const note = (withoutDates.match(BULK_STATUS_WORDS) || []).join(" ");
  const name = withoutDates.replace(BULK_STATUS_WORDS, " ").replace(/\s+/g, " ").trim();
  // "0", "-", "na" and similar placeholders are not names.
  if (!name || /^[\d\s.\-/]*$/.test(name) || /^(na|n\/a|nil|none|-)$/i.test(name)) return { name: "", note };
  return { name, note };
};

/*
 * Coworking requirement text -> the Lead model's coworking block:
 *   "4 seater cabin"          one cabin of 4
 *   "6 seat 1 cabin"          one cabin of 6
 *   "2 cabins 4 seater each"  two cabins of 4
 *   "5 seats" / "8 SEATS"     5 / 8 workstations (open desks)
 */
const buildBulkCoworkingRequirement = (row) => {
  const text = [row.requirement, row.projectInterested].map(normalizeBulkCellText).filter(Boolean).join(" ").toLowerCase();
  const coworking = {};
  const seatsMatch = text.match(/(\d+)\s*(?:-\s*)?(?:seater|seats?|people|persons|pax|desks?|workstations?)\b/);
  const cabinCountMatch = text.match(/(\d+)\s*(?:private\s*)?cabins?\b/);
  const seats = seatsMatch ? Number.parseInt(seatsMatch[1], 10) : null;
  const explicitSeats = normalizeBulkNumber(row.seats);
  const explicitCabins = normalizeBulkNumber(row.cabins);

  if (/\bcabins?\b/.test(text) || explicitCabins) {
    const count = Math.min(Math.max(Math.round(explicitCabins || (cabinCountMatch ? Number.parseInt(cabinCountMatch[1], 10) : 1)), 1), 20);
    const perCabin = seats || (explicitSeats ? Math.round(explicitSeats) : null);
    if (perCabin && perCabin >= 1 && perCabin <= 100) {
      coworking.cabins = Array.from({ length: count }, () => ({ seats: perCabin }));
    }
  } else if (seats || explicitSeats) {
    coworking.workstations = Math.round(seats || explicitSeats);
  }
  return coworking;
};

const resolveBulkLeadStatus = ({ sheetName = "", row = {} }) => {
  // An explicit status (the STATUS column, or a status written into the NAME
  // column) outranks words that merely appear in comments.
  const explicit = resolveBulkLeadStatusFromText([row.status, row.nameNote].map((value) => normalizeBulkCellText(value).toLowerCase()).join(" "));
  if (explicit !== "NEW") return explicit;
  return resolveBulkLeadStatusFromText([
    sheetName,
    row.status,
    row.visit,
    row.comment,
    row.callUpdate,
    row.followUp,
    row.projectInterested,
  ]
    .map((value) => normalizeBulkCellText(value).toLowerCase())
    .join(" "));
};

const resolveBulkLeadStatusFromText = (haystack = "") => {
  if (!haystack.trim()) return "NEW";
  if (/\b(close|closed|token)\b/.test(haystack)) return "CLOSED";
  if (/\b(site\s*visit\s*(scheduled|schedule)|visit\s*(scheduled|schedule))\b/.test(haystack)) return "SITE_VISIT_SCHEDULED";
  if (/\b(site\s*visit\s*(overdue|over\s*due|over\s*deu)|visit\s*(overdue|over\s*due|over\s*deu))\b/.test(haystack)) return "SITE_VISIT_OVERDUE";
  if (/\b(missing\s*in\s*action|mia)\b/.test(haystack)) return "MISSING_IN_ACTION";
  const npcCount = haystack.match(/\bnpc\s*-?\s*([123])\b/);
  if (npcCount) return `NPC_${npcCount[1]}`;
  if (/\b(npc|not\s*picking|not\s*pick|call\s*not\s*picked|no\s*answer|call\s*cut|switch(?:ed)?\s*off|not\s*reachable)\b/.test(haystack)) return "NPC_1";
  if (/\b(invalid|invaild|wrong\s*number)\b/.test(haystack)) return "INVALID";
  if (/\b(owner)\b/.test(haystack)) return "OWNER";
  if (/\b(broker)\b/.test(haystack)) return "BROKER";
  if (/\b(not\s*interested|notint|not\s*int|cna|lost|le\s*liya|already\s*taken|occupied|oocupied)\b/.test(haystack)) return "LOST";
  // Only a visit that happened - "wants a visit" / "visit plan" is still interest.
  if (/\b(visited|revisit(?:ed)?|visit\s*done|site\s*visit(?!\s*(?:plan|planned)))\b/.test(haystack)) return "SITE_VISIT";
  if (/\binterested|interest\b/.test(haystack)) return "INTERESTED";
  if (/\btransfer|contacted|follow\s*up|callback|call back\b/.test(haystack)) return "CONTACTED";
  if (/\blost|not\s*interested|notint|cna\b/.test(haystack)) return "LOST";
  return "NEW";
};

const buildBulkLeadProjectSummary = (row) => {
  const transactionType = normalizeBulkTransactionType(row.projectName);
  const projectName = normalizeBulkCellText(row.projectName);
  const parts = [
    row.projectInterested,
    row.requirement ? `Requirement: ${row.requirement}` : "",
    row.propertyType ? `Property Type: ${row.propertyType}` : "",
    projectName && !transactionType ? `Project: ${projectName}` : "",
    transactionType ? `Transaction: ${transactionType}` : "",
    row.city ? `Location: ${row.city}` : "",
    row.budget ? `Budget: ${row.budget}` : "",
    row.company ? `Company: ${row.company}` : "",
    row.photoVideo ? `Photo/Video: ${row.photoVideo}` : "",
    ...["followUp1", "followUp2", "followUp3"].map((key, index) => (row[key] && !normalizeBulkDate(row[key]) ? `Follow-up ${index + 1}: ${row[key]}` : "")),
    row.callUpdate ? `Call Update: ${row.callUpdate}` : "",
    row.comment ? `Comment: ${row.comment}` : "",
    row.visit ? `Visit: ${row.visit}` : "",
    row.handle ? `Handle: ${row.handle}` : "",
    row.optionShare ? `Option Share: ${row.optionShare}` : "",
    row.timeline ? `Timeline: ${row.timeline}` : "",
  ]
    .map(normalizeBulkCellText)
    .filter(Boolean);

  return parts.join(" | ").slice(0, 500);
};

const buildBulkLeadRequirements = (row, sheetType = DEFAULT_BULK_LEAD_SHEET_TYPE) => {
  const budgetRange = normalizeBulkBudgetRange(row.budget);
  const budget = budgetRange ? null : normalizeBulkAmount(row.budget);
  const requirementText = [
    row.projectInterested,
    row.requirement,
  ].map(normalizeBulkCellText).filter(Boolean).join(" ");
  const propertyType = normalizeBulkCellText(row.propertyType).toUpperCase();
  const transactionType = normalizeBulkTransactionType(row.projectName || row.projectInterested);
  const requirements = {};

  if (budgetRange) {
    requirements.budgetMin = budgetRange.min;
    requirements.budgetMax = budgetRange.max;
  } else if (budget !== null) {
    requirements.budgetMin = budget;
    requirements.budgetMax = budget;
  }

  const selectedSheetType = Object.values(BULK_LEAD_SHEET_TYPES).includes(sheetType)
    ? sheetType
    : DEFAULT_BULK_LEAD_SHEET_TYPE;

  if (selectedSheetType === BULK_LEAD_SHEET_TYPES.COWORKING) {
    requirements.inventoryType = "COWORKING";
    requirements.transactionType = "RENT";
    const coworking = buildBulkCoworkingRequirement(row);
    if (Object.keys(coworking).length) requirements.coworking = coworking;
    const coworkingArea = requirementText.match(/(\d+(?:\.\d+)?)\s*(?:sq\s*\.?\s*ft|sqft|sqfit|sft)\b/i);
    if (coworkingArea) {
      requirements.areaMin = Number.parseFloat(coworkingArea[1]);
      requirements.areaMax = requirements.areaMin;
      requirements.areaUnit = "SQ_FT";
    }
    return requirements;
  }

  if (["COMMERCIAL", "RESIDENTIAL"].includes(propertyType)) {
    requirements.inventoryType = propertyType;
  } else {
    requirements.inventoryType = selectedSheetType;
  }
  if (transactionType) {
    requirements.transactionType = transactionType;
  } else {
    requirements.transactionType = selectedSheetType === BULK_LEAD_SHEET_TYPES.COMMERCIAL ? "RENT" : "";
  }

  const seatsMatch = requirementText.match(/(\d+)\s*(?:seat|seater|seats)\b/i);
  const cabinMatch = requirementText.match(/(\d+)\s*(?:cabin|cabins)\b/i);
  const conferenceSeatsMatch = requirementText.match(/(\d+)\s*(?:conference\s*seat|conference\s*seater|conference\s*seats)\b/i);
  const areaMatch = requirementText.match(/(\d+(?:\.\d+)?)\s*(?:sq\s*ft|sqft|sqfit|sft)\b/i);
  if (selectedSheetType === BULK_LEAD_SHEET_TYPES.COMMERCIAL || seatsMatch || cabinMatch || conferenceSeatsMatch) {
    requirements.inventoryType = "COMMERCIAL";
    requirements.transactionType = transactionType || "RENT";
    requirements.commercial = {};
    const seats = normalizeBulkNumber(row.seats);
    const cabins = normalizeBulkNumber(row.cabins);
    const conferenceRooms = normalizeBulkNumber(row.conferenceRooms);
    const conferenceSeats = normalizeBulkNumber(row.conferenceSeats);
    if (seats !== null) requirements.commercial.seats = Math.round(seats);
    if (cabins !== null) requirements.commercial.cabins = Math.round(cabins);
    if (conferenceRooms !== null) requirements.commercial.conferenceRooms = Math.round(conferenceRooms);
    if (conferenceSeats !== null) requirements.commercial.conferenceSeats = Math.round(conferenceSeats);
    if (seatsMatch && requirements.commercial.seats === undefined) {
      requirements.commercial.seats = Number.parseInt(seatsMatch[1], 10);
    }
    if (cabinMatch && requirements.commercial.cabins === undefined) {
      requirements.commercial.cabins = Number.parseInt(cabinMatch[1], 10);
    }
    if (conferenceSeatsMatch) {
      requirements.commercial.conferenceSeats = Number.parseInt(conferenceSeatsMatch[1], 10);
    }
    [
      "parking",
      "pantry",
      "receptionArea",
      "waitingArea",
      "cafeteria",
      "serverRoom",
      "storageRoom",
      "breakoutArea",
      "lift",
      "powerBackup",
      "centralAC",
      "fireSafety",
      "readyToMove",
      "underConstruction",
    ].forEach((key) => {
      if (!row[key]) return;
      const targetKey = key === "parking" ? "parkingAvailable" : key === "lift" ? "liftAvailable" : key;
      requirements.commercial[targetKey] = normalizeBulkBoolean(row[key]);
    });
  }

  if (selectedSheetType === BULK_LEAD_SHEET_TYPES.RESIDENTIAL) {
    requirements.inventoryType = "RESIDENTIAL";
    const floor = normalizeBulkNumber(row.floor);
    const amenitiesText = normalizeBulkCellText(row.amenities).toLowerCase();
    const hasAmenity = (key, aliases = []) =>
      normalizeBulkBoolean(row[key])
      || aliases.some((alias) => amenitiesText.includes(alias));

    requirements.residential = {
      bhkType: normalizeBulkCellText(row.bhkType).toUpperCase(),
      floor: floor === null ? null : Math.round(floor),
      amenities: {
        lift: hasAmenity("lift", ["lift", "elevator"]),
        security: hasAmenity("security", ["security"]),
        gym: hasAmenity("gym", ["gym"]),
        swimmingPool: hasAmenity("swimmingPool", ["pool", "swimming"]),
        clubhouse: hasAmenity("clubhouse", ["club"]),
        powerBackup: hasAmenity("powerBackup", ["power backup", "electricity backup", "backup"]),
        parking: hasAmenity("parking", ["parking"]),
        studyRoom: hasAmenity("studyRoom", ["study"]),
        servantRoom: hasAmenity("servantRoom", ["servant"]),
        modularKitchen: hasAmenity("modularKitchen", ["modular kitchen"]),
        electricityBackup: hasAmenity("powerBackup", ["electricity backup"]),
        gasPipeline: hasAmenity("gasPipeline", ["gas"]),
      },
    };
  }
  if (areaMatch) {
    const area = Number.parseFloat(areaMatch[1]);
    if (Number.isFinite(area)) {
      requirements.areaMin = area;
      requirements.areaMax = area;
      requirements.areaUnit = "SQ_FT";
    }
  }

  return Object.keys(requirements).length ? requirements : undefined;
};

const normalizeBulkLeadRow = ({ rawRow, mappedHeaders, sheetName = "", sheetType = DEFAULT_BULK_LEAD_SHEET_TYPE, sourceRow = null, skipped = null }) => {
  const row = {};
  const allCellValues = [];

  mappedHeaders.forEach((key, cellIndex) => {
    const value = normalizeBulkCellText(rawRow[cellIndex]);
    if (value) allCellValues.push(value);
    if (!key || !value) return;
    if (!row[key]) row[key] = value;
  });

  const phone = normalizeBulkPhone(row.phone)
    || allCellValues.map(normalizeBulkPhone).find(Boolean)
    || "";
  if (!phone) {
    // Rows that cannot become a lead are listed for the user, not dropped silently.
    if (skipped && allCellValues.length) {
      skipped.push({
        sheetName,
        sourceRow,
        name: normalizeBulkCellText(row.name).slice(0, 120),
        phone: normalizeBulkCellText(row.phone).slice(0, 40),
        reason: row.phone
          ? `"${normalizeBulkCellText(row.phone).slice(0, 40)}" is not a valid phone number (needs at least 10 digits)`
          : "No phone number in this row",
      });
    }
    return null;
  }

  const { name, note: nameNote } = splitBulkNameCell(row.name);
  if (nameNote) row.nameNote = nameNote;
  const safeName = name && !normalizeBulkPhone(name) ? name : `Lead ${phone}`;
  const sourceText = normalizeBulkCellText(row.source).toUpperCase();
  const projectInterested = buildBulkLeadProjectSummary(row);
  const requirements = buildBulkLeadRequirements(row, sheetType);
  // The latest dated follow-up column is the next one due.
  const nextFollowUp = ["followUp3", "followUp2", "followUp1", "followUp"]
    .map((key) => normalizeBulkDate(row[key]))
    .find(Boolean) || "";
  const lastContactedAt = normalizeBulkDate(row.date);

  return {
    name: safeName,
    phone,
    email: row.email || "",
    city: row.city || "",
    projectInterested,
    clientProfession: normalizeBulkCellText(row.workProfile).slice(0, 120),
    company: normalizeBulkCellText(row.company).slice(0, 200),
    requirements,
    source: sourceText.includes("META") ? "META" : "MANUAL",
    status: resolveBulkLeadStatus({ sheetName, row }),
    nextFollowUp,
    lastContactedAt,
    // Where the row came from, so the upload report can point at it.
    sourceRow,
    sheetName,
  };
};

// The spreadsheet row number of a matrix row: SheetJS keeps it on each row as
// __rowNum__ (0-based, blank rows included); otherwise its position + 1.
const bulkSourceRowOf = (matrix, rowIndex) => {
  const rowNum = matrix[rowIndex]?.__rowNum__;
  return Number.isInteger(rowNum) ? rowNum + 1 : rowIndex + 1;
};

const parseBulkLeadRowsFromMatrix = ({ matrix, sheetName = "", sheetType = DEFAULT_BULK_LEAD_SHEET_TYPE, skipped = null }) => {
  const headerIndex = matrix.findIndex((rawRow) => {
    const mappedHeaders = rawRow.map((cell) => resolveLeadCsvHeaderKey(cell));
    const mappedCount = mappedHeaders.filter(Boolean).length;
    return mappedCount >= 2 && (mappedHeaders.includes("phone") || mappedHeaders.includes("name"));
  });

  if (headerIndex < 0) {
    const hasContent = matrix.some((rawRow) => rawRow.some((cell) => normalizeBulkCellText(cell)));
    if (skipped && hasContent) {
      skipped.push({
        sheetName,
        sourceRow: null,
        name: "",
        phone: "",
        reason: "No header row found (needs at least two known columns, including NAME or CONTACT / PHONE), so this sheet was not read",
      });
    }
    return [];
  }

  const mappedHeaders = matrix[headerIndex].map((header) => resolveLeadCsvHeaderKey(header));
  const hasName = mappedHeaders.includes("name");
  const rows = [];

  for (let rowIndex = headerIndex + 1; rowIndex < matrix.length; rowIndex += 1) {
    const row = normalizeBulkLeadRow({
      rawRow: matrix[rowIndex],
      mappedHeaders,
      sheetName,
      sheetType,
      sourceRow: bulkSourceRowOf(matrix, rowIndex),
      skipped,
    });
    if (!row) continue;
    if (!hasName && !row.name) continue;
    rows.push(row);
  }

  return rows;
};

const parseCsvLine = (line) => {
  const values = [];
  let current = "";
  let inQuotes = false;

  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];

    if (char === "\"") {
      if (inQuotes && line[index + 1] === "\"") {
        current += "\"";
        index += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }

    if (char === "," && !inQuotes) {
      values.push(current.trim());
      current = "";
      continue;
    }

    current += char;
  }

  values.push(current.trim());
  return values;
};

const parseBulkLeadCsvRows = (csvText, sheetType = DEFAULT_BULK_LEAD_SHEET_TYPE, skipped = null) => {
  const normalizedText = String(csvText || "")
    .replace(/^\uFEFF/, "")
    .trim();

  if (!normalizedText) {
    throw new Error("CSV data is required");
  }

  const rawLines = normalizedText.split(/\r?\n/);
  const numberedLines = rawLines
    .map((line, lineIndex) => ({ text: String(line || "").trim(), lineIndex }))
    .filter((line) => line.text);
  const lines = numberedLines.map((line) => line.text);

  if (lines.length < 2) {
    throw new Error("CSV must include header and at least one data row");
  }

  const headerCells = parseCsvLine(lines[0]);
  const mappedHeaders = headerCells.map((header) => resolveLeadCsvHeaderKey(header));

  if (!mappedHeaders.includes("name") || !mappedHeaders.includes("phone")) {
    throw new Error("CSV header must include at least name and phone columns");
  }

  const rows = parseBulkLeadRowsFromMatrix({
    matrix: numberedLines.map((line) => {
      const cells = parseCsvLine(line.text);
      Object.defineProperty(cells, "__rowNum__", { value: line.lineIndex, enumerable: false });
      return cells;
    }),
    sheetName: "CSV",
    sheetType,
    skipped,
  });

  if (!rows.length) {
    throw new Error(
      skipped?.length
        ? `No lead rows could be read from the CSV: ${skipped.length} row${skipped.length === 1 ? " was" : "s were"} skipped. See the list below.`
        : "No valid lead rows found in CSV",
    );
  }

  return rows;
};

/*
 * Rows from every sheet of a workbook already read into matrices. Pass an
 * array as `skipped` to collect the rows and sheets that could not be used.
 */
export const parseMatrices = (sheets, sheetType = DEFAULT_BULK_LEAD_SHEET_TYPE, skipped: any[] | null = null) => {
  const rows = [];
  sheets.forEach(({ name, matrix }) => {
    const normalizedSheetName = normalizeCsvHeader(name);
    if (normalizedSheetName.includes("performance") || normalizedSheetName.includes("perfomance") || ["broker", "owners", "dealclose"].includes(normalizedSheetName)) {
      skipped?.push({ sheetName: name, sourceRow: null, name: "", phone: "", reason: "Sheet not read: performance, broker, owner and deal-close sheets are not lead lists" });
      return;
    }
    rows.push(...parseBulkLeadRowsFromMatrix({ matrix, sheetName: name, sheetType, skipped }));
  });
  return rows;
};

export { BULK_LEAD_SHEET_TYPES, DEFAULT_BULK_LEAD_SHEET_TYPE, parseBulkLeadCsvRows, resolveLeadCsvHeaderKey, resolveBulkLeadStatus, normalizeBulkAmount };
