/* Shared helpers for the project knowledge editors (panel and project form). */
export const humanizeKey = (v) => String(v || "").replaceAll("_", " ").toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase());

/* An empty knowledge draft for a project that doesn't exist yet. */
export const emptyKnowledgeDraft = () => ({
  overview: {}, specs: {}, pricing: {}, legal: {},
  contacts: [], amenityStatuses: [],
  approvalStatus: "NOT_STARTED", pricingPublished: false, internalNotes: "",
});

/*
 * The PATCH body for /projects/:id/details from a draft. Charges/PLCs that
 * live on the project itself are left out (the server ignores them anyway);
 * publishing and internal notes are management-only.
 */
export const knowledgePatchFromDraft = (draft, { isManagement, pendingDocuments = [] } = {}) => ({
  overview: draft.overview || {},
  specs: draft.specs || {},
  pricing: draft.pricing || {},
  legal: draft.legal || {},
  approvalStatus: draft.approvalStatus || "NOT_STARTED",
  contacts: (draft.contacts || []).filter((c) => String(c.name || "").trim()),
  amenityStatuses: (draft.amenityStatuses || []).filter((a) => String(a.name || "").trim()),
  ...(isManagement ? { pricingPublished: Boolean(draft.pricingPublished), internalNotes: draft.internalNotes || "" } : {}),
  ...(pendingDocuments.length ? { addDocuments: pendingDocuments } : {}),
});
