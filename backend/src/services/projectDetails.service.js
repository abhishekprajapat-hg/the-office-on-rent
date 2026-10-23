/*
 * Centralised project knowledge (requirements 16 Oct 2026, section 05):
 * checking edits against the catalogue, completeness, and the two views a
 * project is shown in - the internal dossier and the client brochure.
 */
const mongoose = require("mongoose");
const C = require("../constants/projectDetails.constants");

class ProjectDetailsError extends Error {
  constructor(statusCode, message) { super(message); this.statusCode = statusCode; }
}

const isManagement = (user) => C.RESTRICTED_ROLES.includes(String(user?.role || "").toUpperCase());
const text = (v, max = 2000) => String(v ?? "").trim().slice(0, max);

const cleanValue = (field, raw, currentValue) => {
  if (raw === null || raw === undefined || raw === "") return field.kind === "list" ? [] : "";
  switch (field.kind) {
    case "number":
    case "money": {
      const n = Number(raw);
      if (!Number.isFinite(n) || n < 0) throw new ProjectDetailsError(400, `${field.label} must be 0 or more`);
      return n;
    }
    case "date": {
      const s = text(raw, 10);
      if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) throw new ProjectDetailsError(400, `${field.label} must be a date`);
      return s;
    }
    case "url": {
      const s = text(raw, 1000);
      if (!/^https?:\/\//i.test(s)) throw new ProjectDetailsError(400, `${field.label} must start with http:// or https://`);
      return s;
    }
    case "yesno": return raw === true || raw === "true" || raw === "YES";
    case "select": {
      const value = text(raw, 120);
      const option = (field.options || []).find((candidate) => String(candidate).toUpperCase() === value.toUpperCase());
      if (option !== undefined) return option;
      // Older project records used free text for these fields. Preserve an
      // unchanged legacy value so saving another field does not erase it.
      if (currentValue !== undefined && String(raw) === String(currentValue)) return text(raw, 120);
      throw new ProjectDetailsError(400, `${field.label} has an invalid option`);
    }
    case "list": return (Array.isArray(raw) ? raw : String(raw).split(",")).map((x) => text(x, 160)).filter(Boolean).slice(0, 30);
    case "longtext": return text(raw, 4000);
    default: return text(raw, 400);
  }
};

const cleanSection = (fields, incoming = {}, current = {}, user) => {
  const out = { ...(current || {}) };
  for (const field of fields) {
    if (!Object.prototype.hasOwnProperty.call(incoming || {}, field.key)) continue;
    if (field.restricted && !isManagement(user)) throw new ProjectDetailsError(403, `Only Admin or Manager can edit ${field.label}`);
    out[field.key] = cleanValue(field, incoming[field.key], current?.[field.key]);
  }
  return out;
};

const cleanContacts = (list) => (Array.isArray(list) ? list : []).slice(0, 50).map((c) => {
  const name = text(c?.name, 120);
  if (!name) throw new ProjectDetailsError(400, "Every contact needs a name");
  const role = text(c?.role, 40).toUpperCase() || "OTHER";
  return {
    ...(c?._id && mongoose.isValidObjectId(c._id) ? { _id: c._id } : {}),
    name,
    organization: text(c?.organization, 160),
    role: C.CONTACT_ROLES.includes(role) ? role : "OTHER",
    phone: text(c?.phone, 20),
    whatsapp: text(c?.whatsapp, 20),
    email: text(c?.email, 160),
    notes: text(c?.notes, 500),
    shareable: Boolean(c?.shareable),
  };
});

const cleanAmenities = (list) => (Array.isArray(list) ? list : []).slice(0, 80).map((a) => {
  const name = text(a?.name, 80);
  if (!name) throw new ProjectDetailsError(400, "Every amenity needs a name");
  const status = String(a?.status || "AVAILABLE").toUpperCase();
  if (!C.AMENITY_STATUSES.includes(status)) throw new ProjectDetailsError(400, `${name}: status must be available, planned or not available`);
  return { name, status, chargeable: Boolean(a?.chargeable), notes: text(a?.notes, 300) };
});

const cleanMedia = (list) => {
  const rows = (Array.isArray(list) ? list : []).slice(0, 100).map((m, i) => {
    const url = text(m?.url, 1000);
    if (!url) throw new ProjectDetailsError(400, "Every image needs a file");
    const category = String(m?.category || "OTHER").toUpperCase();
    return {
      ...(m?._id && mongoose.isValidObjectId(m._id) ? { _id: m._id } : {}),
      url,
      caption: text(m?.caption, 200),
      category: C.MEDIA_CATEGORIES.includes(category) ? category : "OTHER",
      order: Number.isFinite(Number(m?.order)) ? Number(m.order) : i,
      isCover: Boolean(m?.isCover),
      clientVisible: m?.clientVisible !== false,
      archived: Boolean(m?.archived),
      uploadedAt: m?.uploadedAt ? new Date(m.uploadedAt) : new Date(),
    };
  }).sort((a, b) => a.order - b.order);
  // One cover image: the first one ticked, or the first image.
  let coverSeen = false;
  rows.forEach((m) => { if (m.isCover && !coverSeen && !m.archived) coverSeen = true; else m.isCover = false; });
  if (!coverSeen) { const first = rows.find((m) => !m.archived); if (first) first.isCover = true; }
  return rows;
};

/*
 * Adds documents to the library. A new file with the same category and name
 * as an existing one becomes its next version; the old one is kept, marked
 * superseded.
 */
const addDocuments = (current = [], incoming = [], user) => {
  const library = current.map((d) => (typeof d.toObject === "function" ? d.toObject() : { ...d }));
  (Array.isArray(incoming) ? incoming : []).slice(0, 20).forEach((d) => {
    const name = text(d?.name, 200);
    const url = text(d?.url, 1000);
    if (!name || !url) throw new ProjectDetailsError(400, "A document needs a name and a file");
    const category = String(d?.category || "OTHER").toUpperCase();
    const cat = C.DOCUMENT_CATEGORIES.includes(category) ? category : "OTHER";
    const same = library.filter((x) => x.category === cat && x.name.toLowerCase() === name.toLowerCase());
    same.forEach((x) => { x.superseded = true; });
    library.push({
      category: cat, name, url, version: same.length ? Math.max(...same.map((x) => x.version || 1)) + 1 : 1,
      uploadedAt: new Date(), uploadedBy: user._id, uploadedByName: user.name || "", superseded: false,
      clientShareable: Boolean(d?.clientShareable),
    });
  });
  return library;
};

/* How much of the knowledge record is filled in, 0-100. */
/*
 * The pricing section as stored: knowledge-panel fields from details.pricing,
 * charges from the project itself (or an older details.pricing copy).
 */
const pricingValues = (project) => {
  const stored = project.details?.pricing || {};
  const out = { ...stored };
  C.PRICING_FIELDS.filter((f) => f.source === "project").forEach((f) => {
    const own = project[f.key];
    const legacy = stored[f.legacy || f.key];
    out[f.key] = own !== undefined && own !== null && own !== "" ? own : legacy;
    if (f.legacy) delete out[f.legacy];
  });
  return out;
};

const completeness = (project) => {
  const category = project.projectCategory;
  // Optional PLCs aren't held against a project's completeness.
  const fields = C.allFields(category).filter((f) => !f.restricted && f.completeness !== false && !/^plc/.test(f.key));
  const d = project.details || {};
  const value = (f) => {
    const section = C.OVERVIEW_FIELDS.includes(f) ? d.overview : C.PRICING_FIELDS.includes(f) ? pricingValues(project) : C.LEGAL_FIELDS.includes(f) ? d.legal : d.specs;
    const v = section?.[f.key];
    return Array.isArray(v) ? v.length > 0 : v !== undefined && v !== null && v !== "";
  };
  const checks = [
    ...fields.map(value),
    (project.projectContacts || []).length > 0,
    (project.media || []).filter((m) => !m.archived).length > 0,
    (project.documentLibrary || []).length > 0,
    (project.amenityStatuses || []).length > 0 || (project.amenities || []).length > 0,
  ];
  const missing = fields.filter((f) => !value(f)).map((f) => f.label);
  return { percent: Math.round((checks.filter(Boolean).length / checks.length) * 100), missing: missing.slice(0, 12) };
};

const pick = (fields, section = {}, predicate) => Object.fromEntries(fields.filter(predicate)
  .filter((f) => section?.[f.key] !== undefined && section?.[f.key] !== "" && !(Array.isArray(section[f.key]) && !section[f.key].length))
  .map((f) => [f.key, section[f.key]]));

/*
 * The project as one audience sees it.
 *   client   - brochure: client-safe fields only, shareable contacts, pricing
 *              only once published, legal only once verified, visible images.
 *   internal - everything for staff; restricted commercial terms and internal
 *              notes only for Admin/Manager.
 */
const toKnowledgeView = (projectDoc, { user, mode = "internal" } = {}) => {
  const project = typeof projectDoc.toObject === "function" ? projectDoc.toObject() : { ...projectDoc };
  const d = project.details || {};
  const category = project.projectCategory;
  const specFields = C.SPEC_FIELDS[category] || [];
  const mgmt = isManagement(user);
  const client = mode === "client";
  const allow = (f) => (client ? f.client && !f.restricted : !f.restricted || mgmt);

  const view = {
    overview: pick(C.OVERVIEW_FIELDS, d.overview, allow),
    pricing: client && !d.pricingPublished ? {} : pick(C.PRICING_FIELDS, pricingValues(project), allow),
    pricingPublished: Boolean(d.pricingPublished),
    legal: client && d.approvalStatus !== "VERIFIED" ? {} : pick(C.LEGAL_FIELDS, d.legal, allow),
    approvalStatus: d.approvalStatus || "NOT_STARTED",
    specs: pick(specFields, d.specs, allow),
    contacts: (project.projectContacts || []).filter((c) => !client || c.shareable),
    amenityStatuses: project.amenityStatuses || [],
    // The main form's checklist and free-text extras, for the PDFs and the tab.
    amenities: project.amenities || [],
    otherFacilities: project.otherFacilities || "",
    documents: (project.documentLibrary || []).filter((doc) => (client ? doc.clientShareable && !doc.superseded : true)),
    media: (project.media || []).filter((m) => !m.archived && (!client || m.clientVisible)).sort((a, b) => a.order - b.order),
  };
  if (!client) {
    view.completeness = completeness(project);
    view.lastVerifiedAt = project.lastVerifiedAt || null;
    view.approvalVerifiedAt = d.approvalVerifiedAt || null;
    if (mgmt) view.internalNotes = d.internalNotes || "";
    view.history = (project.history || []).slice(-15).reverse();
  }
  if (client) {
    // Client copies never carry staff phone numbers from internal contacts' notes.
    view.contacts = view.contacts.map(({ notes, ...rest }) => rest);
  }
  return view;
};

/* The catalogue the form draws from, filtered for the user. */
const catalogueFor = (user) => {
  const strip = (fields) => fields.filter((f) => !f.restricted || isManagement(user));
  return {
    overview: strip(C.OVERVIEW_FIELDS),
    pricing: strip(C.PRICING_FIELDS),
    legal: strip(C.LEGAL_FIELDS),
    specs: Object.fromEntries(Object.entries(C.SPEC_FIELDS).map(([k, v]) => [k, strip(v)])),
    contactRoles: C.CONTACT_ROLES,
    amenityPresets: C.AMENITY_PRESETS,
    amenityStatuses: C.AMENITY_STATUSES,
    documentCategories: C.DOCUMENT_CATEGORIES,
    mediaCategories: C.MEDIA_CATEGORIES,
    approvalStatuses: C.APPROVAL_STATUSES,
  };
};

/* Applies a details PATCH to a project document; returns the list of changed parts. */
const applyDetailsPatch = (project, body = {}, user) => {
  const changed = [];
  const category = project.projectCategory;
  project.details = project.details || {};
  const d = project.details;
  if (body.overview) { d.overview = cleanSection(C.OVERVIEW_FIELDS, body.overview, d.overview, user); changed.push("overview"); }
  // Charges and PLCs are edited in the main project form, not here.
  if (body.pricing) { d.pricing = cleanSection(C.PRICING_FIELDS.filter((f) => f.source !== "project"), body.pricing, d.pricing, user); changed.push("pricing"); }
  if (body.legal) { d.legal = cleanSection(C.LEGAL_FIELDS, body.legal, d.legal, user); changed.push("legal"); }
  if (body.specs) { d.specs = cleanSection(C.SPEC_FIELDS[category] || [], body.specs, d.specs, user); changed.push("specs"); }
  if (body.pricingPublished !== undefined) {
    if (!isManagement(user)) throw new ProjectDetailsError(403, "Only Admin or Manager can publish pricing");
    d.pricingPublished = Boolean(body.pricingPublished); changed.push("pricingPublished");
  }
  if (body.approvalStatus !== undefined) {
    const status = String(body.approvalStatus).toUpperCase();
    if (!C.APPROVAL_STATUSES.includes(status)) throw new ProjectDetailsError(400, "Invalid approval status");
    if (status === "VERIFIED") {
      if (!isManagement(user)) throw new ProjectDetailsError(403, "Only Admin or Manager can mark approvals verified");
      d.approvalVerifiedBy = user._id; d.approvalVerifiedAt = new Date();
    }
    d.approvalStatus = status; changed.push("approvalStatus");
  }
  if (body.internalNotes !== undefined) {
    if (!isManagement(user)) throw new ProjectDetailsError(403, "Only Admin or Manager can edit internal notes");
    d.internalNotes = text(body.internalNotes, 5000); changed.push("internalNotes");
  }
  if (body.contacts !== undefined) { project.projectContacts = cleanContacts(body.contacts); changed.push("contacts"); }
  if (body.amenityStatuses !== undefined) { project.amenityStatuses = cleanAmenities(body.amenityStatuses); changed.push("amenities"); }
  if (body.media !== undefined) { project.media = cleanMedia(body.media); changed.push("media"); }
  if (body.addDocuments !== undefined) { project.documentLibrary = addDocuments(project.documentLibrary, body.addDocuments, user); changed.push("documents"); }
  if (body.projectOwnerId !== undefined) {
    if (body.projectOwnerId && !mongoose.isValidObjectId(body.projectOwnerId)) throw new ProjectDetailsError(400, "Invalid project owner");
    project.projectOwnerId = body.projectOwnerId || null; changed.push("owner");
  }
  project.markModified("details");
  if (changed.length) {
    project.history = [...(project.history || []), { at: new Date(), by: user._id, byName: user.name || "", change: changed.join(", ") }].slice(-100);
  }
  return changed;
};

module.exports = {
  ProjectDetailsError, isManagement, cleanValue, cleanSection, cleanContacts, cleanAmenities, cleanMedia,
  addDocuments, completeness, toKnowledgeView, catalogueFor, applyDetailsPatch,
};
