/* Team workload, exactly as web TaskManager's workloadStatusFor. Pure; unit tested. */

import type { Tone } from "../theme/tokens";

export type Workload = "busy" | "balanced" | "available" | "offline";

export const workloadFor = (stat?: { total?: number; COMPLETED?: number; overdue?: number } | null): Workload => {
  const total = stat?.total || 0;
  if (total === 0) return "offline";
  const open = total - (stat?.COMPLETED || 0);
  if ((stat?.overdue || 0) > 0 || open >= 5) return "busy";
  if (open >= 3) return "balanced";
  return "available";
};

export const WORKLOAD: Record<Workload, { label: string; tone: Tone }> = {
  busy: { label: "Busy", tone: "danger" },
  balanced: { label: "Balanced", tone: "info" },
  available: { label: "Available", tone: "success" },
  offline: { label: "No tasks", tone: "neutral" },
};

/* Completion rate as a whole percent; 0 when there is nothing to complete. */
export const completionRate = (stat?: { total?: number; COMPLETED?: number } | null) =>
  stat?.total ? Math.round(((stat.COMPLETED || 0) / stat.total) * 100) : 0;

const ACTIVITY_LABELS: Record<string, string> = {
  CREATED: "created the task",
  STATUS_CHANGED: "changed the status",
  REASSIGNED: "reassigned it",
  COMMENTED: "commented",
  FILE_ADDED: "added a file",
  FILE_REMOVED: "removed a file",
};

export const activityLabel = (action: string, detail?: string) =>
  [ACTIVITY_LABELS[action] || action.replace(/_/g, " ").toLowerCase(), detail].filter(Boolean).join(": ");
