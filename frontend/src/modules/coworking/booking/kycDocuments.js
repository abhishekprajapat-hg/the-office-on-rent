/*
 * What a client has to produce before they get keys.
 *
 * These three lists are the ones The Office on Rent actually issues to clients
 * (documents handout, Sept 2026) - not a generic KYC checklist. They are
 * reproduced exactly, including "GST if available" being the one optional item
 * on the company list. Nothing has been added: asking for a document the firm
 * does not ask for invents a blocker at the desk.
 *
 * The three types are genuinely different filings, which is why they are three
 * lists and not one with exceptions. A proprietorship is not a small company -
 * it files a Gumasta and an MSME certificate against the proprietor's own
 * Aadhaar and PAN. A company signs through an authorised signatory, so the
 * signatory's identity and the letter authorising them are both required.
 */

export const CLIENT_KINDS = [
  { id: "company", label: "Company", hint: "Pvt Ltd / Ltd / OPC / LLP" },
  { id: "proprietorship", label: "Proprietorship", hint: "Sole proprietor firm" },
  { id: "individual", label: "Individual", hint: "Signing in their own name" },
];

export const ENTITY_TYPES = ["Private Limited", "Limited", "One Person Company", "LLP"];

export const DOCUMENT_SETS = {
  individual: [
    { key: "aadhaar", label: "Aadhaar card", required: true },
    { key: "pan", label: "PAN card", required: true },
    { key: "photo", label: "Passport size photo", required: true },
  ],
  proprietorship: [
    { key: "gumasta", label: "Gumasta", hint: "Shop and establishment licence", required: true },
    { key: "msme", label: "MSME certificate", required: true },
    { key: "aadhaar", label: "Aadhaar card", hint: "Of the proprietor", required: true },
    { key: "pan", label: "PAN card", hint: "Of the proprietor", required: true },
    { key: "photo", label: "Passport size photo", required: true },
  ],
  company: [
    { key: "coi", label: "COI", hint: "Certificate of incorporation", required: true },
    { key: "companyPan", label: "Company PAN card", required: true },
    { key: "gst", label: "GST certificate", hint: "If available", required: false },
    { key: "signatureAuthority", label: "Signature authority", required: true },
    { key: "signatureAuthorityAadhaar", label: "Signature authority Aadhaar card", required: true },
    { key: "photo", label: "Passport size photo", required: true },
    { key: "authorisationLetter", label: "Authorization letter", required: true },
  ],
};

/** Where the client is told to send their papers. Straight off the handout. */
export const DOCUMENT_SUBMISSION = {
  email: "theofficeonrent.ws@gmail.com",
  phone: "7909702003",
};

export const ACCEPTED_TYPES = ".pdf,.jpg,.jpeg,.png";
export const MAX_FILE_BYTES = 10 * 1024 * 1024;

export const DOC_STATES = { PENDING: "PENDING", VERIFIED: "VERIFIED" };

export const documentsFor = (kind) => DOCUMENT_SETS[kind] || DOCUMENT_SETS.company;

export const labelForKind = (kind) => CLIENT_KINDS.find((option) => option.id === kind)?.label || "";

/**
 * Where a client stands, judged against their own document set.
 *
 * Uploaded and verified are deliberately separate numbers. A scan that has
 * arrived is not a scan anybody has looked at, and treating the two as one is
 * how an unreadable Aadhaar sits in a file for six months counted as done.
 */
export const kycStatusOf = (client) => {
  const set = documentsFor(client?.kind);
  const held = new Map((client?.documents || []).map((doc) => [doc.key, doc]));
  const required = set.filter((doc) => doc.required);

  const uploaded = required.filter((doc) => held.has(doc.key));
  const verified = required.filter((doc) => held.get(doc.key)?.status === DOC_STATES.VERIFIED);
  const awaitingReview = (client?.documents || []).filter((doc) => doc.status !== DOC_STATES.VERIFIED);

  return {
    required: required.length,
    uploaded: uploaded.length,
    verified: verified.length,
    missing: required.filter((doc) => !held.has(doc.key)),
    // Everything asked for has arrived.
    complete: uploaded.length === required.length,
    // Everything asked for has arrived and been checked.
    cleared: required.length > 0 && verified.length === required.length,
    awaitingReview: awaitingReview.length,
    total: set.length,
    totalUploaded: set.filter((doc) => held.has(doc.key)).length,
  };
};

/** One short phrase for a badge, and the tone it should carry. */
export const kycSummaryOf = (client) => {
  const status = kycStatusOf(client);
  if (status.cleared) return { ...status, label: "KYC verified", tone: "verified" };
  if (status.complete) return { ...status, label: `${status.awaitingReview} to review`, tone: "review" };
  return { ...status, label: `KYC ${status.uploaded}/${status.required}`, tone: "pending" };
};

export const formatBytes = (bytes) => {
  if (!Number.isFinite(bytes)) return "";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
};

/*
 * Uploaded files are held for the session only.
 *
 * The record that matters - which document, whose, when, what file, and who
 * verified it - is on the client and persists. The bytes are not: localStorage
 * is a ~5MB budget and a few Aadhaar scans would blow it, and KYC scans have no
 * business sitting in a browser store anyway. The file lives in this Map until
 * the tab closes, which is enough to check what was just attached, and the
 * upload endpoint takes over when the API is wired.
 */
const sessionFiles = new Map();

export const keepFile = (docId, file) => {
  const url = URL.createObjectURL(file);
  sessionFiles.set(docId, url);
  return url;
};

export const fileUrl = (docId) => sessionFiles.get(docId) || null;

/*
 * Building the record - id, timestamp - lives here rather than in the
 * component. Both read the clock, and the purity rule rightly refuses that
 * inside a component body even when only an event handler calls it.
 */
export const attachFile = (doc, file) => {
  const id = `${doc.key}-${Date.now()}`;
  keepFile(id, file);
  return {
    id,
    key: doc.key,
    label: doc.label,
    fileName: file.name,
    size: file.size,
    type: file.type,
    uploadedAt: new Date().toISOString(),
    // A fresh upload has not been looked at yet, whoever attached it.
    status: DOC_STATES.PENDING,
    verifiedAt: null,
  };
};

export const markVerified = (doc, verified) => ({
  ...doc,
  status: verified ? DOC_STATES.VERIFIED : DOC_STATES.PENDING,
  verifiedAt: verified ? new Date().toISOString() : null,
});

export const forgetFile = (docId) => {
  const url = sessionFiles.get(docId);
  if (url) URL.revokeObjectURL(url);
  sessionFiles.delete(docId);
};
