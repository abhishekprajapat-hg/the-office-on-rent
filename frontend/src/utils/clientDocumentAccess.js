// Coworking client documents are served only to the Admin or an authorised
// manager (requirements 16 Oct 2026, section 09). The server enforces it; this
// only spares everyone else a link that would answer "not allowed".
export const isRestrictedClientFile = (url) => /\/api\/uploads\/files\/coworking-(documents|clients|contracts)\//.test(String(url || ""));

export const RESTRICTED_DOCUMENT_NOTE = "Uploaded · only the Admin or an authorised manager can open it";
