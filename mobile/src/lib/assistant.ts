/*
 * The office assistant (web AdminCommandConsole). Questions go to the server
 * (POST /assistant/ask), which answers from the caller's own scope; "take me
 * to …" is handled here, since it only moves around the app. Pure; unit tested.
 */

export type NavTarget = { route: string; tab?: string; label: string; page?: string };

const TARGETS: (NavTarget & { aliases: string[] })[] = [
  { route: "Tabs", tab: "Home", label: "Home", aliases: ["home", "dashboard"] },
  { route: "Tabs", tab: "Leads", label: "Leads", page: "leads", aliases: ["leads", "lead", "pipeline", "deals"] },
  { route: "Tabs", tab: "Tasks", label: "Tasks", page: "tasks", aliases: ["tasks", "task", "to do", "todo"] },
  { route: "Inventory", label: "Inventory", page: "inventory", aliases: ["inventory", "property", "properties", "listings", "assets"] },
  { route: "Projects", label: "Projects", page: "projects", aliases: ["projects", "project"] },
  { route: "Reports", label: "Reports", page: "reports", aliases: ["reports", "report", "analytics"] },
  { route: "Schedule", label: "Schedule", page: "calendar", aliases: ["schedule", "calendar", "follow ups", "follow-ups", "followups"] },
  { route: "TeamAttendance", label: "Team attendance", page: "attendance", aliases: ["attendance", "team attendance"] },
  { route: "Approvals", label: "Approvals", page: "admin_console", aliases: ["approvals", "approval", "pending approvals", "requests"] },
  { route: "Users", label: "Users", page: "admin_team", aliases: ["users", "team", "employees", "staff"] },
  { route: "Chats", label: "Chats", page: "chat", aliases: ["chat", "chats", "messages"] },
  { route: "Finance", label: "Finance", page: "finance", aliases: ["finance", "payments", "expenses"] },
  { route: "Revenue", label: "Revenue", page: "finance", aliases: ["revenue", "sales report"] },
  { route: "TeamSalary", label: "Salaries", page: "salary", aliases: ["salary", "salaries", "payroll"] },
  { route: "FieldOps", label: "Field ops", page: "field_ops", aliases: ["field ops", "field", "site visits", "visits"] },
  { route: "Leaderboard", label: "Leaderboard", page: "leaderboard", aliases: ["leaderboard", "performance", "rankings"] },
  { route: "Contacts", label: "Contacts", page: "inventory", aliases: ["contacts", "contact database"] },
  { route: "Notifications", label: "Notifications", aliases: ["notifications", "alerts", "inbox"] },
  { route: "Settings", label: "Settings", aliases: ["settings", "preferences"] },
];

const NAV_PATTERN = /^(?:please\s+)?(?:take me to|go to|navigate to|open|show me)\s+(?:the\s+|my\s+)?(.+?)(?:\s+(?:page|screen|tab|section))?[\s.!?]*$/i;

/* "Take me to reports" → the Reports screen; anything else is a question for the server. */
export const navTarget = (query: string): NavTarget | null => {
  const match = NAV_PATTERN.exec(query.trim());
  if (!match) return null;
  const phrase = match[1]!.toLowerCase().replace(/\s+/g, " ").trim();
  const found = TARGETS.find((target) => target.aliases.includes(phrase));
  if (!found) return null;
  const { aliases: _aliases, ...target } = found;
  return target;
};

/* Questions the server understands (detectIntent), offered before the first one. */
export const SUGGESTED_PROMPTS = [
  "Give me a quick overview",
  "Show interested leads",
  "Who is the best performer this month?",
  "Show sold inventory this month",
  "Sold and interested snapshot",
  "Show available inventory",
  "Take me to reports",
];

export type AssistantMessage =
  | { id: string; from: "me"; text: string; at: string }
  | { id: string; from: "assistant"; text: string; at: string; intent?: string; data?: Record<string, unknown>; nav?: NavTarget; error?: boolean };

/* The newest messages only, so stored history stays small (web keeps 120). */
export const trimHistory = (messages: AssistantMessage[], max = 80) => (messages.length > max ? messages.slice(messages.length - max) : messages);
