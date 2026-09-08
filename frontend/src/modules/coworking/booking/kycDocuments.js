/*
 * What a client has to produce before they get keys.
 *
 * An individual and a company are not the same onboarding. A freelancer signs
 * for themselves, so their identity is the whole of it. A company signs through
 * somebody, so there are two identities to establish - the entity, and the
 * person authorised to bind it - and the authorisation that connects them. Ask
 * a sole proprietor for a board resolution and you have invented a blocker;
 * skip it for a Pvt Ltd and the agreement is signed by nobody in particular.
 *
 * Optional here means genuinely optional: a cabin can be let without a
 * cancelled cheque. Required means the desk should not hand over access.
 */

export const CLIENT_KINDS = [
  { id: "company", label: "Company" },
  { id: "individual", label: "Individual" },
];

export const ENTITY_TYPES = [
  "Private Limited",
  "LLP",
  "Partnership",
  "Proprietorship",
  "One Person Company",
  "Trust / Society",
];

export const DOCUMENT_SETS = {
  individual: [
    { key: "aadhaar", label: "Aadhaar card", hint: "Front and back", required: true },
    { key: "pan", label: "PAN card", required: true },
    { key: "photo", label: "Passport photograph", required: true },
    { key: "address", label: "Address proof", hint: "Only if different from the Aadhaar address", required: false },
    { key: "cheque", label: "Cancelled cheque", hint: "For the deposit refund and any mandate", required: false },
  ],
  company: [
    {
      key: "incorporation",
      label: "Certificate of incorporation",
      hint: "LLP agreement or partnership deed for an LLP or firm",
      required: true,
    },
    { key: "companyPan", label: "Company PAN", required: true },
    { key: "gst", label: "GST certificate", hint: "Or a declaration if unregistered", required: true },
    {
      key: "authorisation",
      label: "Board resolution or authorisation letter",
      hint: "Naming the signatory below",
      required: true,
    },
    { key: "signatoryAadhaar", label: "Signatory's Aadhaar", required: true },
    { key: "signatoryPan", label: "Signatory's PAN", required: true },
    { key: "addressProof", label: "Registered address proof", hint: "Utility bill or rent agreement", required: false },
    { key: "cheque", label: "Cancelled cheque", hint: "For the deposit refund and any mandate", required: false },
  ],
};

export const ACCEPTED_TYPES = ".pdf,.jpg,.jpeg,.png";
export const MAX_FILE_BYTES = 10 * 1024 * 1024;

export const documentsFor = (kind) => DOCUMENT_SETS[kind] || DOCUMENT_SETS.company;

/**
 * KYC completeness for a client, judged against their own document set.
 * A company measured against the individual list would always look complete.
 */
export const kycStatusOf = (client) => {
  const set = documentsFor(client?.kind);
  const uploaded = new Set((client?.documents || []).map((doc) => doc.key));
  const required = set.filter((doc) => doc.required);
  const have = required.filter((doc) => uploaded.has(doc.key));
  return {
    required: required.length,
    uploaded: have.length,
    missing: required.filter((doc) => !uploaded.has(doc.key)),
    complete: have.length === required.length,
    total: set.length,
    totalUploaded: set.filter((doc) => uploaded.has(doc.key)).length,
  };
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
 * The record that matters - which document, whose, when, what file - is in the
 * client and persists. The bytes are not: localStorage is a ~5MB budget and a
 * few scans of an Aadhaar would blow it, and KYC scans have no business sitting
 * in a browser store anyway. So the file itself lives in this Map until the tab
 * closes, which is enough to preview what you just attached, and the upload
 * endpoint takes over when the API is wired.
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
  };
};

export const forgetFile = (docId) => {
  const url = sessionFiles.get(docId);
  if (url) URL.revokeObjectURL(url);
  sessionFiles.delete(docId);
};
