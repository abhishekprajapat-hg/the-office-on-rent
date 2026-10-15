import type { BoardDocument, DirectoryClient } from "./coworkingBoard";

/*
 * What a client has to produce before they get keys - the three lists The
 * Office on Rent issues (web kycDocuments.js). Reproduced exactly; keys match
 * the web so files attached on either app line up. Pure; unit tested.
 */

export const CLIENT_KINDS = [
  { id: "company", label: "Company", hint: "Pvt Ltd / Ltd / OPC / LLP" },
  { id: "proprietorship", label: "Proprietorship", hint: "Sole proprietor firm" },
  { id: "individual", label: "Individual", hint: "Signing in their own name" },
] as const;

export const ENTITY_TYPES = ["Private Limited", "Limited", "One Person Company", "LLP"] as const;

export const INDUSTRIES = ["Data & AI", "Consulting", "Financial services", "Healthcare", "Legal", "Logistics", "Media & content", "Product design", "Retail tech", "Other"] as const;

export type DocSpec = { key: string; label: string; hint?: string; required: boolean; group: string };

const personDocuments = (person: 1 | 2, { panRequired = true, aadhaarHint, panHint }: { panRequired?: boolean; aadhaarHint?: string; panHint?: string } = {}): DocSpec[] => {
  const second = person === 2;
  const suffix = second ? "2" : "";
  const group = `Person ${person}`;
  return [
    { key: `aadhaar${suffix}`, label: `Aadhaar card - Person ${person}`, hint: aadhaarHint, required: !second, group },
    { key: `pan${suffix}`, label: `PAN card - Person ${person}`, hint: panHint, required: !second && panRequired, group },
    { key: `policeVerification${suffix}`, label: `Police verification - Person ${person}`, required: !second, group },
  ];
};

const RENT_AGREEMENT: DocSpec = { key: "rentAgreement", label: "Rent agreement", required: true, group: "Agreement" };

export const DOCUMENT_SETS: Record<string, DocSpec[]> = {
  individual: [...personDocuments(1), { key: "photo", label: "Passport size photo", required: true, group: "Person 1" }, ...personDocuments(2), RENT_AGREEMENT],
  proprietorship: [
    { key: "gumasta", label: "Gumasta", hint: "Shop and establishment licence", required: true, group: "Business" },
    { key: "msme", label: "MSME certificate", required: true, group: "Business" },
    ...personDocuments(1, { aadhaarHint: "Of the proprietor", panHint: "Of the proprietor" }),
    { key: "photo", label: "Passport size photo", required: true, group: "Person 1" },
    ...personDocuments(2, { aadhaarHint: "Partner or co-signatory, if any" }),
    RENT_AGREEMENT,
  ],
  company: [
    { key: "coi", label: "COI", hint: "Certificate of incorporation", required: true, group: "Company" },
    { key: "companyPan", label: "Company PAN card", required: true, group: "Company" },
    { key: "gst", label: "GST certificate", hint: "If available", required: false, group: "Company" },
    { key: "authorisationLetter", label: "Authorization letter", required: true, group: "Company" },
    { key: "signatureAuthority", label: "Signing authority 1 - proof", hint: "Board resolution or authority document", required: true, group: "Signing authority 1" },
    { key: "signatureAuthorityAadhaar", label: "Aadhaar card - Signing authority 1", required: true, group: "Signing authority 1" },
    { key: "signatoryPan", label: "PAN card - Signing authority 1", required: false, group: "Signing authority 1" },
    { key: "policeVerification", label: "Police verification - Signing authority 1", required: true, group: "Signing authority 1" },
    { key: "photo", label: "Passport size photo", required: true, group: "Signing authority 1" },
    { key: "signatureAuthority2", label: "Signing authority 2 - proof", hint: "Only if a second person signs", required: false, group: "Signing authority 2" },
    { key: "signatureAuthorityAadhaar2", label: "Aadhaar card - Signing authority 2", required: false, group: "Signing authority 2" },
    { key: "signatoryPan2", label: "PAN card - Signing authority 2", required: false, group: "Signing authority 2" },
    { key: "policeVerification2", label: "Police verification - Signing authority 2", required: false, group: "Signing authority 2" },
    RENT_AGREEMENT,
  ],
};

export const documentsFor = (kind?: string) => DOCUMENT_SETS[kind || ""] || DOCUMENT_SETS.company!;
export const labelForKind = (kind?: string) => CLIENT_KINDS.find((option) => option.id === kind)?.label || "";

/* Grouped so Person 1 / Person 2 (or Signing authority 1 / 2) read as separate people. */
export const groupsOf = (docs: DocSpec[]) => {
  const groups: { group: string; docs: DocSpec[] }[] = [];
  docs.forEach((doc) => {
    let found = groups.find((item) => item.group === doc.group);
    if (!found) groups.push((found = { group: doc.group, docs: [] }));
    found.docs.push(doc);
  });
  return groups;
};

/* Uploaded and verified are separate numbers on purpose (web kycStatusOf). */
export const kycStatusOf = (client: { kind?: string; documents?: BoardDocument[] } | null | undefined) => {
  const set = documentsFor(client?.kind);
  const held = new Map((client?.documents || []).map((doc) => [doc.key, doc]));
  const required = set.filter((doc) => doc.required);
  const uploaded = required.filter((doc) => held.has(doc.key));
  const verified = required.filter((doc) => held.get(doc.key)?.status === "VERIFIED");
  return {
    required: required.length,
    uploaded: uploaded.length,
    verified: verified.length,
    missing: required.filter((doc) => !held.has(doc.key)),
    complete: uploaded.length === required.length,
    cleared: required.length > 0 && verified.length === required.length,
    awaitingReview: (client?.documents || []).filter((doc) => doc.status !== "VERIFIED").length,
    total: set.length,
    totalUploaded: set.filter((doc) => held.has(doc.key)).length,
  };
};

/* A file the server holds, as a board document record. A fresh upload is unreviewed. */
export const documentRecord = (spec: DocSpec, file: { url: string; fileName: string; mimeType?: string; size?: number }, now = new Date()): BoardDocument => ({
  id: `${spec.key}-${now.getTime()}`,
  key: spec.key,
  label: spec.label,
  url: file.url,
  fileName: file.fileName,
  size: file.size,
  type: file.mimeType,
  uploadedAt: now.toISOString(),
  status: "PENDING",
  verifiedAt: null,
});

/* Replace the document for one key (or remove it). */
export const withDocument = (documents: BoardDocument[], key: string, doc: BoardDocument | null) => [...documents.filter((item) => item.key !== key), ...(doc ? [doc] : [])];

export const formatBytes = (bytes?: number) => {
  if (!Number.isFinite(bytes)) return "";
  const value = bytes as number;
  if (value < 1024) return `${value} B`;
  if (value < 1024 * 1024) return `${Math.round(value / 1024)} KB`;
  return `${(value / (1024 * 1024)).toFixed(1)} MB`;
};

/* "Other" opens a free-text work profile (web splitIndustry / resolveIndustry). */
export const splitIndustry = (value?: string) => {
  const text = String(value || "").trim();
  if (!text) return { industryChoice: INDUSTRIES[0] as string, industryCustom: "" };
  if ((INDUSTRIES as readonly string[]).includes(text) && text !== "Other") return { industryChoice: text, industryCustom: "" };
  return { industryChoice: "Other", industryCustom: text === "Other" ? "" : text };
};
export const resolveIndustry = ({ industryChoice, industryCustom }: { industryChoice: string; industryCustom: string }) =>
  industryChoice === "Other" ? industryCustom.trim() || "Other" : industryChoice;

const csvEscape = (value: unknown) => `"${String(value ?? "").replace(/"/g, '""')}"`;

/* The directory as a spreadsheet (web ClientsPage exportCsv). */
export const clientsCsv = (directory: DirectoryClient[]) =>
  [
    ["Client", "Status", "Type", "Industry", "Contact", "Phone", "Cabins", "Seats", "Monthly rent", "Dues", "KYC"],
    ...directory.map((client) => {
      const status = kycStatusOf({ kind: client.entityKind, documents: client.documents });
      return [
        client.name,
        client.kind === "active" ? (client.returning ? "Current (returning)" : "Current") : "Former",
        client.kind === "active" ? (client.entityKind === "individual" ? "Individual" : "Company") : "",
        client.industry,
        client.contactPerson,
        client.phone,
        (client.kind === "active" ? client.cabins.map((cabin) => cabin.label) : client.stays.map((stay) => stay.cabinLabel)).join(" / "),
        client.capacity || client.stays.reduce((sum, stay) => sum + stay.seats, 0),
        client.monthlyRent,
        client.duesAmount,
        client.kind === "active" ? (status.complete ? "Complete" : `${status.uploaded}/${status.required}`) : "",
      ];
    }),
  ]
    .map((row) => row.map(csvEscape).join(","))
    .join("\r\n");
