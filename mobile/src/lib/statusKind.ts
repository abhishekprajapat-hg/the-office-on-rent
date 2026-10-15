/*
 * Which full-page state a failure deserves. Screens hand ErrorState the
 * sentence errorMessage() produced, so the kind is read back from it (and
 * from an HTTP status when there is one). Pure; unit tested.
 */
export type StatusKind = "success" | "error" | "offline" | "slow" | "server" | "notFound" | "noAccess" | "sessionExpired";

export const statusKindOf = (message?: string | null, status?: number): StatusKind => {
  if (status === 401) return "sessionExpired";
  if (status === 403) return "noAccess";
  if (status === 404) return "notFound";
  if (status === 502 || status === 503 || status === 504) return "server";
  const text = String(message || "");
  if (/can't reach the server|check your internet|network error|you're offline/i.test(text)) return "offline";
  if (/took too long|timed? ?out|slow connection/i.test(text)) return "slow";
  if (/don't have access|not allowed|permission|forbidden/i.test(text)) return "noAccess";
  if (/no longer exists|not found/i.test(text)) return "notFound";
  if (/bad gateway|service unavailable|under maintenance|server is down/i.test(text)) return "server";
  if (/session (has )?expired|sign in again/i.test(text)) return "sessionExpired";
  return "error";
};

/* Default words for each page; a screen can pass its own. */
export const STATUS_COPY: Record<StatusKind, { title: string; message: string }> = {
  success: { title: "Done", message: "That's saved." },
  error: { title: "Something went wrong", message: "That didn't work. Please try again." },
  offline: { title: "No internet connection", message: "Check your mobile data or Wi-Fi, then try again." },
  slow: { title: "This is taking a while", message: "Your connection seems slow. Try again, or move somewhere with a better signal." },
  server: { title: "The CRM isn't answering", message: "The server is down or being updated. Give it a minute and try again." },
  notFound: { title: "Page not found", message: "This link doesn't go anywhere, or what it pointed to has been removed." },
  noAccess: { title: "You don't have access", message: "Your role can't open this. Ask an admin if you need it." },
  sessionExpired: { title: "Session expired", message: "For your security you've been signed out. Sign in again to carry on." },
};
