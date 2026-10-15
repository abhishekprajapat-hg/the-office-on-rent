/*
 * The coworking booking board, as the web app keeps it
 * (frontend/src/modules/coworking/booking/boardStore.js + cabinData.js).
 *
 * The board is one document per company at /coworking/board: every cabin with
 * its status, client, agreement and history, plus an activity log. Both apps
 * read and write that same document, so this module mirrors the web reducer
 * action for action - a booking made on a phone must look exactly like one made
 * at the desk. Keep the two in step. Pure; unit tested.
 */

export type CabinStatus = "VACANT" | "BOOKED" | "RESERVED" | "BLOCKED" | "MAINTENANCE";

export type BoardDocument = {
  id?: string;
  key: string;
  label?: string;
  url?: string | null;
  fileName?: string;
  size?: number;
  type?: string;
  uploadedAt?: string;
  status?: "PENDING" | "VERIFIED" | string;
  verifiedAt?: string | null;
  extractedDateOfBirth?: string;
};

export type BoardClient = {
  id: string;
  identityKey?: string;
  name: string;
  kind?: "company" | "proprietorship" | "individual" | string;
  entityType?: string;
  industry?: string;
  contactPerson?: string;
  signingAuthority2?: string;
  secondPersonName?: string;
  phone?: string;
  email?: string;
  gstin?: string;
  pan?: string;
  dateOfBirth?: string;
  since?: string;
  documents?: BoardDocument[];
  [key: string]: unknown;
};

export type SecurityCheque = {
  number?: string;
  bank?: string;
  amount?: number | string;
  date?: string;
  notes?: string;
  file?: { url: string; fileName?: string; size?: number; type?: string; uploadedAt?: string } | null;
};

export type BoardContract = {
  id: string;
  startDate: string;
  endDate: string;
  monthlyRent: number;
  deposit: number;
  depositMode?: "months" | "custom";
  depositMonths?: number | null;
  lockInMonths?: number;
  noticePeriodDays?: number;
  tokenAmount?: number;
  securityCheque?: SecurityCheque;
  nextInvoiceDate: string;
  nextInvoiceAmount: number;
  duesAmount: number;
  notes?: string;
  /* Derived on load, never stored meaningfully. */
  endsInDays?: number;
};

export type PreviousStay = { id: string; clientId?: string; name: string; client?: BoardClient; from: string; to: string; seats: number };

export type Cabin = {
  code: string;
  label: string;
  wing: string;
  seats: number;
  status: CabinStatus;
  client: BoardClient | null;
  contract: BoardContract | null;
  holdExpiresAt: string | null;
  unavailableReason: string;
  vacantSince: string | null;
  monthlyRent: number;
  deposit: number;
  amenities: string[];
  previousClients: PreviousStay[];
  previousClientCount: number;
  /* Derived. */
  vacantDays?: number;
};

export type ActivityEntry = { id: string; at: string; kind: string; title: string; detail: string; cabinCodes: string[] };

export type BoardState = { cabins: Cabin[]; activity: ActivityEntry[] };

export type OnboardTerms = {
  startDate: string;
  termMonths: number;
  lockInMonths?: number;
  rent: number;
  depositMonths?: number;
  depositMode?: "months" | "custom";
  depositAmount?: number | string | null;
  noticePeriodDays?: number;
  tokenAmount?: number;
  securityCheque?: SecurityCheque;
  notes?: string;
};

export type BoardAction =
  | { type: "ONBOARD"; cabinCodes: string[]; client: Partial<BoardClient> & { name: string }; terms: OnboardTerms }
  | { type: "HOLD"; cabinCode: string; name: string; days: number }
  | { type: "CONFIRM_HOLD"; cabinCode: string }
  | { type: "DROP_HOLD"; cabinCode: string }
  | { type: "RELEASE"; cabinCode: string }
  | { type: "RENEW"; cabinCode: string; months: number }
  | { type: "TRANSFER"; fromCode: string; toCode: string }
  | { type: "SET_UNAVAILABLE"; cabinCode: string; status: "BLOCKED" | "MAINTENANCE"; reason: string }
  | { type: "RETURN_TO_INVENTORY"; cabinCode: string }
  | { type: "RECORD_PAYMENT"; cabinCode: string }
  | { type: "SET_CLIENT_DOCUMENTS"; clientId: string; documents: BoardDocument[] }
  | { type: "UPDATE_CLIENT"; clientId: string; client: Partial<BoardClient>; terms: Partial<OnboardTerms> }
  | { type: "UPDATE_CABIN"; cabinCode: string; seats?: number; monthlyRent?: number };

/* ------------------------------------------------------------- catalogue -- */

/* Seats printed under each cabin label on the plan (web cabinData.CABIN_SEATS). */
export const CABIN_SEATS: Record<string, number> = {
  A1: 4, A2: 4, A3: 4, A4: 2, A5: 6, A6: 4, A7: 6, A8: 4, A9: 6,
  A10: 6, A11: 6, A12: 4, A13: 8, A14: 8, A15: 4, A16: 4, A17: 4, A18: 4,
  B1: 4, B2: 4, B3: 4, B4: 4, B5: 4, B6: 4, B7: 10, B8: 4, B9: 4, B10: 4, B11: 4,
  B12: 6, B13: 6, B14: 6, B15: 4, B16: 8, B17: 8, B18: 4, B19: 4, B20: 4, B21: 4, B22: 4,
  C1: 4, C2: 4, C3: 4, C4: 4, C5: 4, C6: 6, C7: 4, C8: 4, C9: 4, C10: 4, C11: 4, C12: 4,
  C13: 6, C14: 4, C15: 4, C16: 5, C17: 4, C18: 8, C19: 4, C20: 4, C21: 4, C22: 4, C23: 4,
  D1: 4, D2: 4,
};

export const WINGS = [
  { id: "A", label: "Wing A", hint: "Entrance side" },
  { id: "B", label: "Wing B", hint: "Centre" },
  { id: "C", label: "Wing C", hint: "Temple side" },
  { id: "D", label: "Wing D", hint: "By conference" },
];

/*
 * Read from the landlord's side, as on web: red is an empty cabin earning
 * nothing, green is one that is let; blocked is violet so the two reds never meet.
 */
export const STATUS_META: Record<CabinStatus, { label: string; short: string; color: string }> = {
  VACANT: { label: "Vacant", short: "Vacant", color: "#b83232" },
  BOOKED: { label: "Booked", short: "Booked", color: "#0d8055" },
  RESERVED: { label: "Reserved", short: "Held", color: "#a26f06" },
  BLOCKED: { label: "Blocked", short: "Blocked", color: "#6d28d9" },
  MAINTENANCE: { label: "Maintenance", short: "Upkeep", color: "#6c7789" },
};
export const STATUS_ORDER: CabinStatus[] = ["VACANT", "BOOKED", "RESERVED", "BLOCKED", "MAINTENANCE"];

export const SEAT_BANDS = [
  { id: "small", label: "Up to 4", test: (cabin: Cabin) => cabin.seats <= 4 },
  { id: "medium", label: "5 to 6", test: (cabin: Cabin) => cabin.seats >= 5 && cabin.seats <= 6 },
  { id: "large", label: "8+", test: (cabin: Cabin) => cabin.seats >= 8 },
];

export const cabinLabel = (code: string) => code.replace(/^([A-D])/, "$1-");

export const emptyInventory = (): Cabin[] =>
  Object.entries(CABIN_SEATS).map(([code, seats]) => ({
    code,
    label: `${code[0]}-${code.slice(1)}`,
    wing: code[0]!,
    seats,
    status: "VACANT",
    client: null,
    contract: null,
    holdExpiresAt: null,
    unavailableReason: "",
    vacantSince: null,
    monthlyRent: 0,
    deposit: 0,
    amenities: [],
    previousClients: [],
    previousClientCount: 0,
  }));

/* ---------------------------------------------------------------- helpers -- */

const DAY = 24 * 60 * 60 * 1000;
const daysBetween = (from: string | Date, to: string | Date) => Math.round((new Date(to).getTime() - new Date(from).getTime()) / DAY);
export const addMonths = (iso: string, months: number) => {
  const date = new Date(iso);
  date.setMonth(date.getMonth() + months);
  return date.toISOString();
};
const addDays = (iso: string, days: number) => new Date(new Date(iso).getTime() + days * DAY).toISOString();
const uid = (prefix: string) => `${prefix}-${Math.random().toString(36).slice(2, 9)}`;
/* 32 hex characters, like the web's crypto-based key; Hermes has no crypto.getRandomValues. */
export const clientIdentity = () => Array.from({ length: 32 }, () => Math.floor(Math.random() * 16).toString(16)).join("");
const slug = (name: string) => String(name).toLowerCase().replace(/[^a-z]+/g, "");

/* Older board snapshots can miss fields; fill them so the screens never trip on undefined. */
const normalizeCabin = (cabin: Partial<Cabin> & { code: string }): Cabin => ({
  label: cabinLabel(cabin.code),
  wing: cabin.code[0] || "",
  seats: CABIN_SEATS[cabin.code] || 0,
  status: "VACANT",
  client: null,
  contract: null,
  holdExpiresAt: null,
  unavailableReason: "",
  vacantSince: null,
  monthlyRent: 0,
  deposit: 0,
  amenities: [],
  previousClientCount: 0,
  ...cabin,
  previousClients: Array.isArray(cabin.previousClients) ? cabin.previousClients : [],
});

/* Day counts are derived, never stored (web decorate). */
export const decorate = (cabins: Cabin[], now = new Date()): Cabin[] =>
  cabins.map((raw) => {
    const cabin = normalizeCabin(raw);
    return {
      ...cabin,
      vacantDays: cabin.vacantSince ? Math.max(0, daysBetween(cabin.vacantSince, now)) : 0,
      contract: cabin.contract ? { ...cabin.contract, endsInDays: daysBetween(now, cabin.contract.endDate) } : null,
    };
  });

/* What gets saved: no derived fields. */
export const stripDerived = (cabins: Cabin[]): Cabin[] =>
  cabins.map(({ vacantDays: _vacantDays, ...cabin }) => ({
    ...cabin,
    contract: cabin.contract ? (({ endsInDays: _endsInDays, ...contract }) => contract)(cabin.contract) : null,
  }));

const entry = (kind: string, title: string, detail: string, cabinCodes: string[] = []): ActivityEntry => ({
  id: uid("act"),
  at: new Date().toISOString(),
  kind,
  title,
  detail,
  cabinCodes,
});

const archiveClient = (cabin: Cabin): PreviousStay[] => {
  if (!cabin.client || !cabin.contract) return cabin.previousClients;
  return [
    {
      id: `${slug(cabin.client.name)}-${cabin.code}-${Date.now()}`,
      clientId: cabin.client.id,
      name: cabin.client.name,
      client: { ...cabin.client, documents: [...(cabin.client.documents || [])] },
      from: cabin.contract.startDate,
      to: new Date().toISOString(),
      seats: cabin.seats,
    },
    ...cabin.previousClients,
  ];
};

const vacate = (cabin: Cabin, extra: Partial<Cabin> = {}): Cabin => ({
  ...cabin,
  status: "VACANT",
  client: null,
  contract: null,
  holdExpiresAt: null,
  unavailableReason: "",
  vacantSince: new Date().toISOString(),
  ...extra,
});

const patch = (cabins: Cabin[], codes: string[], update: (cabin: Cabin) => Partial<Cabin>) =>
  cabins.map((cabin) => (codes.includes(cabin.code) ? { ...cabin, ...update(cabin) } : cabin));

/* Rent for a multi-cabin agreement, apportioned by list rent (then seats, then evenly). */
export const shareOf = (cabin: Cabin, selected: Cabin[], total: number) => {
  const amount = Number(total) || 0;
  if (!amount || !selected.length) return 0;
  const list = selected.reduce((sum, item) => sum + (Number(item.monthlyRent) || 0), 0);
  if (list > 0) return Math.round(((Number(cabin.monthlyRent) || 0) / list) * amount);
  const totalSeats = selected.reduce((sum, item) => sum + (Number(item.seats) || 0), 0);
  if (totalSeats > 0) return Math.round(((Number(cabin.seats) || 0) / totalSeats) * amount);
  return Math.round(amount / selected.length);
};

export const depositFor = (cabin: Cabin, cabins: Cabin[], terms: Partial<OnboardTerms>, rent: number) => {
  if (terms?.depositMode === "custom") {
    const total = Number(terms.depositAmount);
    return Number.isFinite(total) && total >= 0 ? shareOf(cabin, cabins, total) : 0;
  }
  return Math.round(rent * (Number(terms?.depositMonths) || 2));
};

const isClient = (stay: PreviousStay, clientId: string) => String(stay.clientId || stay.client?.id || slug(stay.name)) === String(clientId);

/* ---------------------------------------------------------------- reducer -- */

export const boardReducer = (state: BoardState, action: BoardAction): BoardState => {
  const { cabins, activity } = state;
  const now = new Date().toISOString();
  const find = (code: string) => cabins.find((item) => item.code === code);

  switch (action.type) {
    case "ONBOARD": {
      const { cabinCodes, client, terms } = action;
      const identityKey = (client.identityKey as string) || clientIdentity();
      const selected = cabins.filter((cabin) => cabinCodes.includes(cabin.code));
      const startDate = new Date(terms.startDate).toISOString();
      const endDate = addMonths(startDate, terms.termMonths);
      const agreementId = `AGR-${new Date().getFullYear()}-${String(activity.length + 1).padStart(3, "0")}`;
      const next = patch(cabins, cabinCodes, (cabin) => {
        const rent = shareOf(cabin, selected, terms.rent);
        return {
          status: "BOOKED",
          vacantSince: null,
          holdExpiresAt: null,
          client: { ...client, identityKey, id: (client.id as string) || identityKey, since: startDate } as BoardClient,
          contract: {
            id: agreementId,
            startDate,
            endDate,
            monthlyRent: rent,
            deposit: depositFor(cabin, selected, terms, rent),
            depositMode: terms.depositMode === "custom" ? "custom" : "months",
            depositMonths: terms.depositMode === "custom" ? null : Number(terms.depositMonths) || 2,
            lockInMonths: terms.lockInMonths ?? 0,
            noticePeriodDays: Number(terms.noticePeriodDays ?? 30),
            tokenAmount: shareOf(cabin, selected, Number(terms.tokenAmount || 0)),
            securityCheque: { ...(terms.securityCheque || {}) },
            nextInvoiceDate: addMonths(startDate, 1),
            nextInvoiceAmount: rent,
            duesAmount: 0,
            notes: terms.notes || "",
          },
        };
      });
      return {
        cabins: next,
        activity: [
          entry(
            "onboard",
            `${client.name} onboarded`,
            `${cabinCodes.length} ${cabinCodes.length === 1 ? "cabin" : "cabins"} on a ${terms.termMonths}-month agreement (${agreementId})`,
            cabinCodes,
          ),
          ...activity,
        ],
      };
    }

    case "HOLD": {
      const { cabinCode, name, days } = action;
      return {
        cabins: patch(cabins, [cabinCode], (cabin) => ({
          status: "RESERVED",
          vacantSince: null,
          holdExpiresAt: addDays(now, days),
          client: { id: uid("prospect"), identityKey: clientIdentity(), name, industry: "Prospect", contactPerson: "", phone: "", email: "", gstin: "" },
          contract: {
            id: uid("HOLD").toUpperCase(),
            startDate: addDays(now, days),
            endDate: addMonths(addDays(now, days), 12),
            monthlyRent: cabin.monthlyRent,
            deposit: cabin.deposit,
            lockInMonths: 0,
            nextInvoiceDate: addDays(now, days),
            nextInvoiceAmount: cabin.monthlyRent,
            duesAmount: 0,
          },
        })),
        activity: [entry("hold", `${cabinCode} held for ${name}`, `Hold expires in ${days} days`, [cabinCode]), ...activity],
      };
    }

    case "CONFIRM_HOLD": {
      const cabin = find(action.cabinCode);
      if (!cabin?.contract) return state;
      return {
        cabins: patch(cabins, [action.cabinCode], () => ({
          status: "BOOKED",
          holdExpiresAt: null,
          contract: { ...cabin.contract!, startDate: now, endDate: addMonths(now, 12) },
        })),
        activity: [entry("book", `${action.cabinCode} confirmed`, `${cabin.client?.name} moves in, 12-month agreement`, [action.cabinCode]), ...activity],
      };
    }

    case "DROP_HOLD": {
      const cabin = find(action.cabinCode);
      if (!cabin) return state;
      return {
        cabins: patch(cabins, [action.cabinCode], (item) => vacate(item)),
        activity: [entry("release", `Hold dropped on ${action.cabinCode}`, `${cabin.client?.name} did not proceed`, [action.cabinCode]), ...activity],
      };
    }

    case "RELEASE": {
      const cabin = find(action.cabinCode);
      if (!cabin) return state;
      return {
        cabins: patch(cabins, [action.cabinCode], (item) => vacate(item, { previousClients: archiveClient(item), previousClientCount: item.previousClientCount + 1 })),
        activity: [entry("release", `${action.cabinCode} released`, `${cabin.client?.name} moved out`, [action.cabinCode]), ...activity],
      };
    }

    case "RENEW": {
      const cabin = find(action.cabinCode);
      if (!cabin?.contract) return state;
      const from = new Date(cabin.contract.endDate) > new Date(now) ? cabin.contract.endDate : now;
      return {
        cabins: patch(cabins, [action.cabinCode], (item) => ({ contract: { ...item.contract!, endDate: addMonths(from, action.months) } })),
        activity: [entry("renew", `${action.cabinCode} renewed`, `${cabin.client?.name} extended by ${action.months} months`, [action.cabinCode]), ...activity],
      };
    }

    case "TRANSFER": {
      const from = find(action.fromCode);
      const to = find(action.toCode);
      if (!from?.contract || !to) return state;
      let next = patch(cabins, [action.toCode], () => ({
        status: from.status,
        vacantSince: null,
        client: from.client,
        contract: { ...from.contract!, monthlyRent: to.monthlyRent, deposit: to.deposit },
      }));
      next = patch(next, [action.fromCode], (item) => vacate(item, { previousClients: archiveClient(item), previousClientCount: item.previousClientCount + 1 }));
      return {
        cabins: next,
        activity: [
          entry("transfer", `${from.client?.name} moved to ${action.toCode}`, `From ${action.fromCode} (${from.seats} seater) to ${action.toCode} (${to.seats} seater)`, [action.fromCode, action.toCode]),
          ...activity,
        ],
      };
    }

    case "SET_UNAVAILABLE": {
      const { cabinCode, status, reason } = action;
      return {
        cabins: patch(cabins, [cabinCode], () => ({ status, client: null, contract: null, holdExpiresAt: null, unavailableReason: reason, vacantSince: null })),
        activity: [entry("block", `${cabinCode} marked ${status.toLowerCase()}`, reason, [cabinCode]), ...activity],
      };
    }

    case "RETURN_TO_INVENTORY":
      return {
        cabins: patch(cabins, [action.cabinCode], (item) => vacate(item)),
        activity: [entry("unblock", `${action.cabinCode} back in inventory`, "Available to let again", [action.cabinCode]), ...activity],
      };

    case "RECORD_PAYMENT": {
      const cabin = find(action.cabinCode);
      if (!cabin?.contract) return state;
      const amount = cabin.contract.duesAmount || cabin.contract.nextInvoiceAmount;
      return {
        cabins: patch(cabins, [action.cabinCode], (item) => ({
          contract: { ...item.contract!, duesAmount: 0, nextInvoiceDate: addMonths(item.contract!.nextInvoiceDate, 1) },
        })),
        activity: [entry("payment", `Payment recorded for ${action.cabinCode}`, `${cabin.client?.name} · ${amount}`, [action.cabinCode]), ...activity],
      };
    }

    /* Documents live on the client, stored on every cabin they hold and in former stays. */
    case "SET_CLIENT_DOCUMENTS": {
      const held = cabins.filter((cabin) => cabin.client?.id === action.clientId);
      const formerCabins = cabins.filter((cabin) => cabin.previousClients.some((stay) => isClient(stay, action.clientId)));
      if (!held.length && !formerCabins.length) return state;
      const formerStay = formerCabins[0]?.previousClients.find((stay) => isClient(stay, action.clientId));
      const previousDocuments = held[0]?.client?.documents || formerStay?.client?.documents || [];
      const clientName = held[0]?.client?.name || formerStay?.name || "Former client";
      const affectedCabins = [...new Set([...held, ...formerCabins].map((cabin) => cabin.code))];
      const added = action.documents.length - previousDocuments.length;
      return {
        cabins: cabins.map((cabin) => ({
          ...cabin,
          client:
            cabin.client?.id === action.clientId
              ? { ...cabin.client, documents: action.documents, dateOfBirth: cabin.client.dateOfBirth || action.documents.find((doc) => doc.extractedDateOfBirth)?.extractedDateOfBirth || "" }
              : cabin.client,
          previousClients: cabin.previousClients.map((stay) =>
            isClient(stay, action.clientId)
              ? { ...stay, clientId: action.clientId, client: { ...(stay.client || ({} as BoardClient)), id: action.clientId, name: stay.name, kind: stay.client?.kind || "company", documents: action.documents } }
              : stay,
          ),
        })),
        activity: [entry("document", `Documents updated for ${clientName}`, `${action.documents.length} on file${added > 0 ? `, ${added} added` : ""}`, affectedCabins), ...activity],
      };
    }

    case "UPDATE_CLIENT": {
      const held = cabins.filter((cabin) => cabin.client?.id === action.clientId);
      if (!held.length || !held[0]!.contract) return state;
      const changes = action.client || {};
      const terms = action.terms || {};
      const startDate = new Date(terms.startDate || held[0]!.contract!.startDate).toISOString();
      const endDate = addMonths(startDate, Number(terms.termMonths) || 12);
      const totalRent = Number(terms.rent);
      return {
        cabins: cabins.map((cabin) =>
          cabin.client?.id === action.clientId && cabin.contract
            ? {
                ...cabin,
                client: { ...cabin.client, ...changes, id: cabin.client.id } as BoardClient,
                contract: {
                  ...cabin.contract,
                  startDate,
                  endDate,
                  monthlyRent: Number.isFinite(totalRent) ? shareOf(cabin, held, totalRent) : cabin.contract.monthlyRent,
                  deposit:
                    terms.depositMode === "custom"
                      ? depositFor(cabin, held, terms, 0)
                      : Number.isFinite(totalRent)
                        ? Math.round(shareOf(cabin, held, totalRent) * (Number(terms.depositMonths) || 2))
                        : cabin.contract.deposit,
                  depositMode: terms.depositMode === "custom" ? "custom" : "months",
                  depositMonths: terms.depositMode === "custom" ? null : Number(terms.depositMonths) || 2,
                  lockInMonths: Number(terms.lockInMonths) || 0,
                  noticePeriodDays: Number(terms.noticePeriodDays ?? 30),
                  tokenAmount: shareOf(cabin, held, Number(terms.tokenAmount || 0)),
                  securityCheque: { ...(terms.securityCheque || {}) },
                  notes: terms.notes || "",
                },
              }
            : cabin,
        ),
        activity: [entry("edit", `${changes.name || held[0]!.client!.name} updated`, "Onboarded client details updated", held.map((cabin) => cabin.code)), ...activity],
      };
    }

    case "UPDATE_CABIN":
      return {
        cabins: patch(cabins, [action.cabinCode], (item) => ({
          seats: action.seats ?? item.seats,
          monthlyRent: action.monthlyRent ?? item.monthlyRent,
          deposit: (action.monthlyRent ?? item.monthlyRent) * 2,
        })),
        activity: [entry("edit", `${action.cabinCode} updated`, `Capacity ${action.seats ?? find(action.cabinCode)?.seats} seater`, [action.cabinCode]), ...activity],
      };

    default:
      return state;
  }
};

/* A hold past its expiry is not a held cabin; swept whenever the board is read (web expireHolds). */
export const expireHolds = (state: BoardState, now = Date.now()): BoardState => {
  const stale = state.cabins.filter((cabin) => cabin.status === "RESERVED" && cabin.holdExpiresAt && new Date(cabin.holdExpiresAt).getTime() < now);
  if (!stale.length) return state;
  return {
    cabins: state.cabins.map((cabin) => (stale.includes(cabin) ? vacate(cabin) : cabin)),
    activity: [
      entry("expire", `${stale.length} ${stale.length === 1 ? "hold" : "holds"} expired`, stale.map((cabin) => cabin.code).join(", "), stale.map((cabin) => cabin.code)),
      ...state.activity,
    ],
  };
};

/* The board as the server holds it, ready for screens: catalogue fallback, holds swept, days derived. */
export const hydrate = (state: Partial<BoardState> | null | undefined): BoardState => {
  const cabins = Array.isArray(state?.cabins) && state!.cabins.length ? state!.cabins.map(normalizeCabin) : emptyInventory();
  const swept = expireHolds({ cabins, activity: Array.isArray(state?.activity) ? state!.activity : [] });
  return { cabins: decorate(swept.cabins), activity: swept.activity };
};

/* ------------------------------------------------------------ the directory -- */

export type DirectoryClient = BoardClient & {
  kind: "active" | "former";
  entityKind: string;
  documents: BoardDocument[];
  cabins: Cabin[];
  capacity: number;
  monthlyRent: number;
  duesAmount: number;
  earliestEnd: string | null;
  stays: { id: string; cabinCode: string; cabinLabel: string; seats: number; from: string; to: string; months: number }[];
  totalMonths: number;
  lastLeft: string | null;
  returning: boolean;
};

const monthsBetween = (from: string, to: string) => Math.max(1, Math.round((new Date(to).getTime() - new Date(from).getTime()) / DAY / 30));

/* Current clients, from the cabins they hold. There is no separate list (web clientsFrom). */
export const clientsFrom = (cabins: Cabin[]) => {
  const byId = new Map<string, DirectoryClient>();
  cabins
    .filter((cabin) => cabin.client && (cabin.status === "BOOKED" || cabin.status === "RESERVED"))
    .forEach((cabin) => {
      const client = cabin.client!;
      const existing =
        byId.get(client.id) ||
        ({
          ...client,
          kind: "active",
          entityKind: client.kind || "company",
          documents: client.documents || [],
          cabins: [],
          capacity: 0,
          monthlyRent: 0,
          duesAmount: 0,
          earliestEnd: null,
          stays: [],
          totalMonths: 0,
          lastLeft: null,
          returning: false,
        } as DirectoryClient);
      existing.cabins.push(cabin);
      existing.capacity += cabin.seats;
      existing.monthlyRent += cabin.contract?.monthlyRent || 0;
      existing.duesAmount += cabin.contract?.duesAmount || 0;
      if (cabin.contract && (!existing.earliestEnd || new Date(cabin.contract.endDate) < new Date(existing.earliestEnd))) existing.earliestEnd = cabin.contract.endDate;
      byId.set(client.id, existing);
    });
  return [...byId.values()].sort((a, b) => b.monthlyRent - a.monthlyRent);
};

/* Everyone who has ever held a cabin: current tenants, then former ones (web directoryFrom). */
export const directoryFrom = (cabins: Cabin[]): DirectoryClient[] => {
  const byIdentity = new Map<string, DirectoryClient>(clientsFrom(cabins).map((client) => [client.id, client]));
  cabins.forEach((cabin) => {
    cabin.previousClients.forEach((stay) => {
      const snapshot = stay.client || ({} as Partial<BoardClient>);
      const identity = stay.clientId || snapshot.id || slug(stay.name);
      const record =
        byIdentity.get(identity) ||
        ({
          ...snapshot,
          id: identity,
          name: stay.name,
          kind: "former",
          entityKind: snapshot.kind || "company",
          documents: snapshot.documents || [],
          industry: snapshot.industry || "",
          contactPerson: snapshot.contactPerson || "",
          phone: snapshot.phone || "",
          email: snapshot.email || "",
          gstin: snapshot.gstin || "",
          cabins: [],
          capacity: 0,
          monthlyRent: 0,
          duesAmount: 0,
          earliestEnd: null,
          stays: [],
          totalMonths: 0,
          lastLeft: null,
          returning: false,
        } as DirectoryClient);
      const months = monthsBetween(stay.from, stay.to);
      record.stays.push({ id: stay.id, cabinCode: cabin.code, cabinLabel: cabin.label, seats: stay.seats ?? cabin.seats, from: stay.from, to: stay.to, months });
      record.totalMonths += months;
      if (!record.lastLeft || new Date(stay.to) > new Date(record.lastLeft)) record.lastLeft = stay.to;
      byIdentity.set(identity, record);
    });
  });
  return [...byIdentity.values()]
    .map((client) => ({ ...client, returning: client.kind === "active" && client.stays.length > 0, stays: client.stays.sort((a, b) => new Date(b.to).getTime() - new Date(a.to).getTime()) }))
    .sort((a, b) => {
      if (a.kind !== b.kind) return a.kind === "active" ? -1 : 1;
      if (a.kind === "active") return b.monthlyRent - a.monthlyRent;
      return new Date(b.lastLeft || 0).getTime() - new Date(a.lastLeft || 0).getTime();
    });
};

/* ------------------------------------------------------------- summaries -- */

/* Occupancy is cabins let over cabins (web SpaceSummaryPanel). */
export const summarize = (cabins: Cabin[]) => {
  const letCabins = cabins.filter((cabin) => cabin.status === "BOOKED" || cabin.status === "RESERVED").length;
  const freeingSoon = cabins.filter((cabin) => cabin.status === "BOOKED" && (cabin.contract?.endsInDays ?? Infinity) <= 45).sort((a, b) => a.contract!.endsInDays! - b.contract!.endsInDays!);
  const overdue = cabins.filter((cabin) => (cabin.contract?.duesAmount || 0) > 0);
  const counts = STATUS_ORDER.reduce((tally, status) => ({ ...tally, [status]: cabins.filter((cabin) => cabin.status === status).length }), { all: cabins.length } as Record<CabinStatus | "all", number>);
  return {
    counts,
    letCabins,
    percent: cabins.length ? Math.round((letCabins / cabins.length) * 100) : 0,
    vacantCapacity: cabins.filter((cabin) => cabin.status === "VACANT").reduce((total, cabin) => total + cabin.seats, 0),
    monthlyRevenue: cabins.filter((cabin) => cabin.status === "BOOKED").reduce((total, cabin) => total + cabin.monthlyRent, 0),
    freeingSoon,
    overdue,
    overdueAmount: overdue.reduce((total, cabin) => total + (cabin.contract?.duesAmount || 0), 0),
  };
};

/* Birthdays in the next 7 days (today included), in India time like the web reminder. */
export const upcomingBirthdays = <T extends { dateOfBirth?: string | null; documents?: BoardDocument[] }>(clients: T[], today = new Date()) => {
  const current = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata", year: "numeric", month: "2-digit", day: "2-digit" }).format(today);
  const anchor = new Date(`${current}T12:00:00Z`);
  const days = Array.from({ length: 8 }, (_, i) => new Date(anchor.getTime() + i * DAY).toISOString().slice(5, 10));
  return clients
    .map((client) => {
      const dob = client.dateOfBirth || client.documents?.find((doc) => doc.extractedDateOfBirth)?.extractedDateOfBirth || "";
      return { ...client, daysUntil: days.indexOf(String(dob).slice(5, 10)) };
    })
    .filter((client) => client.daysUntil >= 0)
    .sort((a, b) => a.daysUntil - b.daysUntil);
};

/* --------------------------------------------------------------------- CSV -- */

const csvEscape = (value: unknown) => `"${String(value ?? "").replace(/"/g, '""')}"`;
const toCsv = (rows: unknown[][]) => rows.map((row) => row.map(csvEscape).join(",")).join("\r\n");

export const boardCsv = (cabins: Cabin[]) =>
  toCsv([
    ["Cabin", "Wing", "Capacity", "Status", "Client", "Monthly rent", "Agreement ends", "Dues"],
    ...cabins.map((cabin) => [
      cabin.label,
      cabin.wing,
      `${cabin.seats} seater`,
      STATUS_META[cabin.status].label,
      cabin.client?.name || "",
      cabin.contract?.monthlyRent ?? cabin.monthlyRent,
      cabin.contract ? new Date(cabin.contract.endDate).toISOString().slice(0, 10) : "",
      cabin.contract?.duesAmount || 0,
    ]),
  ]);

/* -------------------------------------------------------------- conflicts -- */

/*
 * Why an action no longer fits the board, or null. Every phone action is
 * re-applied to the latest server copy, so a cabin someone else let a moment
 * ago must not be onboarded again on top of them.
 */
export const actionConflict = (state: BoardState, action: BoardAction): string | null => {
  const cabin = (code: string) => state.cabins.find((item) => item.code === code);
  const need = (code: string, statuses: CabinStatus[], verb: string) => {
    const found = cabin(code);
    if (!found) return `Cabin ${cabinLabel(code)} isn't on the board.`;
    if (!statuses.includes(found.status)) return `${found.label} is now ${STATUS_META[found.status].label.toLowerCase()}, so it can't be ${verb}.`;
    return null;
  };
  switch (action.type) {
    case "ONBOARD":
      for (const code of action.cabinCodes) {
        const problem = need(code, ["VACANT"], "allotted");
        if (problem) return problem;
      }
      return action.cabinCodes.length ? null : "Pick at least one cabin.";
    case "HOLD":
    case "SET_UNAVAILABLE":
      return need(action.cabinCode, ["VACANT"], action.type === "HOLD" ? "held" : "taken off the market");
    case "CONFIRM_HOLD":
    case "DROP_HOLD":
      return need(action.cabinCode, ["RESERVED"], action.type === "CONFIRM_HOLD" ? "confirmed" : "released from its hold");
    case "RELEASE":
    case "RENEW":
      return need(action.cabinCode, ["BOOKED"], action.type === "RELEASE" ? "released" : "renewed");
    case "RECORD_PAYMENT":
      return need(action.cabinCode, ["BOOKED", "RESERVED"], "paid for");
    case "RETURN_TO_INVENTORY":
      return need(action.cabinCode, ["BLOCKED", "MAINTENANCE"], "returned to inventory");
    case "TRANSFER":
      return need(action.fromCode, ["BOOKED", "RESERVED"], "moved") || need(action.toCode, ["VACANT"], "moved into");
    case "UPDATE_CLIENT":
      return state.cabins.some((item) => item.client?.id === action.clientId && item.contract) ? null : "This client no longer holds a cabin.";
    default:
      return null;
  }
};
