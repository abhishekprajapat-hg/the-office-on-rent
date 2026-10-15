/*
 * Logging a call or a visit (web lead → Log activity): it is a diary note that
 * starts "Call: " or "Visit: ", so the timeline can tell them apart. Pure; unit tested.
 */
export type LogMode = "NOTE" | "CALL" | "VISIT";
export type TimelineFilter = "ALL" | "NOTES" | "CALLS" | "VISITS" | "ASSIGNMENTS";

const PREFIX: Record<LogMode, string> = { NOTE: "", CALL: "Call: ", VISIT: "Visit: " };

/* Switches the draft's prefix, keeping what was written. */
export const withLogMode = (draft: string, mode: LogMode) => `${PREFIX[mode]}${draft.replace(/^(Call|Visit):\s*/, "")}`;

export const logModeOf = (note: string): LogMode => (/^Call:/.test(note) ? "CALL" : /^Visit:/.test(note) ? "VISIT" : "NOTE");

/* Web activityMatchesFilter: a plain-text match on the entry. */
export const matchesTimeline = (text: string, filter: TimelineFilter) => {
  const value = text.toLowerCase();
  if (filter === "NOTES") return value.includes("note") || value.includes("diary");
  if (filter === "CALLS") return value.includes("call");
  if (filter === "VISITS") return value.includes("visit");
  if (filter === "ASSIGNMENTS") return value.includes("assign") || value.includes("transfer");
  return true;
};
