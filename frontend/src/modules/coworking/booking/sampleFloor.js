/*
 * DESIGN DATA ONLY.
 *
 * The booking board is being designed before the endpoints behind it are
 * settled, so this file stands in for the floor-occupancy API. It is seeded, so
 * the board looks identical on every reload and screenshots stay comparable;
 * dates are relative to today so the screen always reads as live.
 *
 * When the board is wired up, delete this file and map the real response onto
 * the same cabin shape - nothing in the components reaches past it.
 */

import { CABIN_SEATS } from "./floorPlanData";
import { documentsFor } from "./kycDocuments";

const SEAT_RATE = 6500; // per seat, per month
const DAY = 24 * 60 * 60 * 1000;

/** Mulberry32 - small, seeded, good enough to lay out a demo floor. */
const seeded = (seed) => () => {
  let t = (seed += 0x6d2b79f5);
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};

const COMPANIES = [
  ["Nexbridge Analytics", "Data & AI", "Rohit Ambekar"],
  ["Vaayu Logistics", "Supply chain", "Sneha Kulkarni"],
  ["Perceptive Labs", "Product design", "Imran Qureshi"],
  ["Kirana Konnect", "Retail tech", "Devika Rane"],
  ["Thrive Legal LLP", "Legal", "Adv. Mahesh Naik"],
  ["Solstice Interiors", "Architecture", "Pooja Bhatt"],
  ["Bluepine Fintech", "Financial services", "Karthik Iyer"],
  ["Aarambh Media", "Media & content", "Nikhil Save"],
  ["Quanta Robotics", "Hardware", "Sana Merchant"],
  ["Meridian Talent", "Staffing", "Farhan Shaikh"],
  ["Saffron Foods", "FMCG", "Ritu Deshpande"],
  ["Northwind Design Co", "Branding", "Aditya Menon"],
  ["Helio Energy", "Renewables", "Vikram Solanki"],
  ["Trailhead Studios", "Gaming", "Megha Pillai"],
  ["Cobalt Health", "Healthcare", "Dr. Anaya Rao"],
  ["Lumen Advisory", "Consulting", "Siddharth Jain"],
  ["Redgrid Systems", "Industrial IoT", "Prakash Dubey"],
  ["Peakform Sports", "Sports tech", "Tanvi Chauhan"],
  ["Ivory Ledger", "Accounting", "CA Neeraj Gupta"],
  ["Zenith Pharma", "Pharma", "Shalini Verma"],
  ["Gridline Infra", "Infrastructure", "Yash Tambe"],
  ["Amber Loom Textiles", "Textiles", "Harshad Patel"],
  ["Orbit Cargo", "Freight", "Rehana Kadri"],
  ["Wavelength Audio", "Audio tech", "Joel Fernandes"],
  ["Frontier Agritech", "Agritech", "Manoj Chavan"],
  ["Stonecrest Realty", "Real estate", "Alok Mehra"],
  ["Paperkite Learning", "Edtech", "Bhavna Sethi"],
  ["Verdant Packaging", "Packaging", "Sameer Bhosale"],
  ["Halcyon Travel", "Travel", "Priya Nambiar"],
  ["Ironwood Security", "Cybersecurity", "Zubin Daruwala"],
];

const PAST_TENANTS = [
  "Clearwater Exports", "Anvil Motors", "Tessellate Studio", "Grainhouse Trading",
  "Bluejay Recruiters", "Sparrow Insurance", "Mudra Printworks", "Cadence Audio",
  "Lakeview Builders", "Ranjan & Sons", "Pixelforge", "Marigold Events",
  "Silverline Tours", "Kestrel Analytics", "Bharat Weld Co",
];

const UNAVAILABLE_REASONS = {
  BLOCKED: "Held for the landlord's own team from next quarter.",
  MAINTENANCE: "False ceiling and AC duct replacement in progress.",
};

/*
 * The rare statuses are pinned rather than rolled. Left to the seed they either
 * clump or vanish, and the point of the sample floor is that every legend
 * colour is on screen. D1/D2 sit beside the conference room, and B7/C18 are the
 * two largest cabins - both plausible places to find work happening.
 */
const RESERVED_CABINS = ["A6", "B14", "C9"];
const BLOCKED_CABINS = ["D1", "D2"];
const MAINTENANCE_CABINS = ["B7", "C18"];

const phone = (rand) => `+91 ${Math.floor(70 + rand() * 29)}${String(Math.floor(rand() * 10000000)).padStart(7, "0")}`;
const slug = (name) => name.toLowerCase().replace(/[^a-z]+/g, "");
const monthsAgo = (n) => new Date(Date.now() - n * 30 * DAY);
const daysAgo = (n) => new Date(Date.now() - n * DAY);
const daysFromNow = (n) => new Date(Date.now() + n * DAY);

/**
 * One cabin as the board consumes it. Real occupancy should arrive in this shape.
 *
 * @typedef {object} BoardCabin
 * @property {string} code        A1 - D2, matching the plan
 * @property {string} label       "A-1", the way the plan prints it
 * @property {string} wing        A | B | C | D
 * @property {number} seats       how many the cabin seats - its capacity
 * @property {string} status      VACANT | BOOKED | RESERVED | BLOCKED | MAINTENANCE
 * @property {number} monthlyRent
 * @property {object|null} client current occupant
 * @property {Array}  previousClients  ex-tenants, newest first
 */


/*
 * Paperwork for the seeded clients, on its own generator.
 *
 * It has to be a separate stream: the floor's statuses come from a sequential
 * seeded generator, so drawing document rolls from the same one would reshuffle
 * which cabins are vacant every time this list changed. Roughly half arrive
 * fully compliant and the rest are mid-chase, which is what a real floor's
 * document tray looks like.
 */
const seedDocuments = (rand, kind, clientName) => {
  const set = documentsFor(kind);
  const complete = rand() < 0.55;
  return set
    .filter((doc) => (complete ? doc.required || rand() < 0.5 : rand() < 0.45))
    .map((doc) => ({
      id: `${slug(clientName)}-${doc.key}`,
      key: doc.key,
      label: doc.label,
      fileName: `${doc.key}-${slug(clientName).slice(0, 10)}.pdf`,
      size: 120000 + Math.floor(rand() * 2400000),
      type: "application/pdf",
      uploadedAt: monthsAgo(1 + rand() * 10).toISOString(),
    }));
};

const buildFloor = () => {
  const rand = seeded(20260908);
  const docRand = seeded(74110057);
  const codes = Object.keys(CABIN_SEATS);
  let companyIndex = 0;
  let pastIndex = 0;

  return codes.map((code, index) => {
    const seats = CABIN_SEATS[code];
    const monthlyRent = seats * SEAT_RATE;
    const deposit = monthlyRent * 2;
    const label = code.replace(/^([A-D])/, "$1-");

    // Roughly two cabins in three are let, which is what a floor at healthy
    // occupancy looks like; the pinned cabins override that roll.
    const roll = rand();
    let status = roll < 0.66 ? "BOOKED" : "VACANT";
    if (RESERVED_CABINS.includes(code)) status = "RESERVED";
    else if (BLOCKED_CABINS.includes(code)) status = "BLOCKED";
    else if (MAINTENANCE_CABINS.includes(code)) status = "MAINTENANCE";

    // Every cabin carries a history - that is the "how many ex-clients" answer,
    // and it has to be there for vacant cabins too.
    const historyCount = Math.floor(rand() * 4);
    const previousClients = Array.from({ length: historyCount }, (_, historyIndex) => {
      const name = PAST_TENANTS[pastIndex++ % PAST_TENANTS.length];
      const endedMonths = 3 + historyIndex * 14 + Math.floor(rand() * 5);
      const stayMonths = 6 + Math.floor(rand() * 18);
      return {
        id: `${slug(name)}-${code}`,
        name,
        from: monthsAgo(endedMonths + stayMonths).toISOString(),
        to: monthsAgo(endedMonths).toISOString(),
        seats,
      };
    });

    const cabin = {
      code,
      label,
      wing: code[0],
      seats,
      monthlyRent,
      deposit,
      status,
      client: null,
      contract: null,
      holdExpiresAt: null,
      unavailableReason: UNAVAILABLE_REASONS[status] || "",
      vacantSince: null,
      vacantDays: 0,
      previousClients,
      previousClientCount: previousClients.length,
      amenities: seats >= 8 ? ["Cabin AC", "Whiteboard", "Storage"] : ["Cabin AC", "Storage"],
    };

    if (status === "BOOKED" || status === "RESERVED") {
      const [name, industry, contact] = COMPANIES[companyIndex++ % COMPANIES.length];
      const termMonths = [6, 11, 12, 24][Math.floor(rand() * 4)];
      const termDays = termMonths * 30;
      /*
       * How far into the term the tenant is. Two things this has to get right:
       * it must land inside the term, or the agreement has already lapsed and
       * renders as a negative "days left" on a cabin still shown as let; and it
       * is drawn in days, not whole months, or every renewal in the floor
       * lands on the same day and the board looks generated.
       */
      const elapsedDays = Math.floor(rand() * (termDays - 3));
      const endsInDays = termDays - elapsedDays;
      const startedAt = daysAgo(elapsedDays);

      // A few cabins go to individuals - a consultant or a solo practice - and
      // they get a different document set entirely.
      const kind = docRand() < 0.18 ? "individual" : "company";

      cabin.client = {
        id: slug(name),
        name,
        kind,
        entityType: kind === "company" ? "Private Limited" : "",
        pan: kind === "individual" ? `${slug(name).slice(0, 5).toUpperCase()}${1000 + Math.floor(docRand() * 8999)}F` : "",
        documents: seedDocuments(docRand, kind, name),
        industry,
        contactPerson: contact,
        phone: phone(rand),
        email: `${slug(contact).slice(0, 12)}@${slug(name).slice(0, 14)}.in`,
        since: startedAt.toISOString(),
        gstin: `27${slug(name).slice(0, 5).toUpperCase()}${1000 + Math.floor(rand() * 8999)}K1Z${Math.floor(rand() * 9)}`,
      };
      cabin.contract = {
        id: `AGR-${2400 + index}`,
        startDate: startedAt.toISOString(),
        endDate: daysFromNow(endsInDays).toISOString(),
        endsInDays,
        monthlyRent,
        deposit,
        lockInMonths: termMonths >= 12 ? 6 : 3,
        nextInvoiceDate: daysFromNow(1 + Math.floor(rand() * 28)).toISOString(),
        nextInvoiceAmount: monthlyRent,
        duesAmount: rand() < 0.18 ? monthlyRent : 0,
      };
      if (status === "RESERVED") {
        cabin.contract.startDate = daysFromNow(4 + Math.floor(rand() * 20)).toISOString();
        cabin.holdExpiresAt = daysFromNow(2 + Math.floor(rand() * 6)).toISOString();
      }
    } else {
      // Precomputed rather than derived in the panel: reading the clock during
      // render is impure, and the board lints for it.
      const idleDays = Math.round(rand() * 180);
      cabin.vacantSince = new Date(Date.now() - idleDays * DAY).toISOString();
      cabin.vacantDays = idleDays;
    }

    return cabin;
  });
};

export const SAMPLE_CABINS = buildFloor();

export const SAMPLE_PROPERTY = {
  id: "oor-hq",
  name: "Office on Rent - Corporate Park",
  floorLabel: "5th Floor",
  address: "Wakad, Pune 411057",
};

/** Existing clients offered in the onboarding step. */
export const SAMPLE_CLIENT_BOOK = SAMPLE_CABINS
  .filter((cabin) => cabin.client)
  .map((cabin) => ({ ...cabin.client, cabinLabel: cabin.label, seats: cabin.seats }))
  .slice(0, 8);
