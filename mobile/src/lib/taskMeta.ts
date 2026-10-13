import type { Tone } from "../theme/tokens";

export const PRIORITY: Record<string, { label: string; tone: Tone }> = {
  HIGH: { label: "High", tone: "danger" },
  MEDIUM: { label: "Medium", tone: "warning" },
  LOW: { label: "Low", tone: "neutral" },
};

export const priorityMeta = (priority?: string) => PRIORITY[String(priority || "").toUpperCase()] || PRIORITY.MEDIUM!;

export const TASK_STATUS: Record<string, { label: string }> = {
  TODO: { label: "To do" },
  IN_PROGRESS: { label: "In progress" },
  COMPLETED: { label: "Completed" },
  BACKLOG: { label: "Backlog" },
};

export const taskStatusMeta = (status?: string) => TASK_STATUS[String(status || "").toUpperCase()] || { label: String(status || "") };

/* Open first, then by due date (undated last), then high priority first. */
export const sortTasks = <T extends { status: string; dueDate?: string | null; priority?: string }>(tasks: T[]) => {
  const rank: Record<string, number> = { HIGH: 0, MEDIUM: 1, LOW: 2 };
  return [...tasks].sort((a, b) => {
    const doneA = a.status === "COMPLETED" ? 1 : 0;
    const doneB = b.status === "COMPLETED" ? 1 : 0;
    if (doneA !== doneB) return doneA - doneB;
    const dueA = a.dueDate ? new Date(a.dueDate).getTime() : Number.POSITIVE_INFINITY;
    const dueB = b.dueDate ? new Date(b.dueDate).getTime() : Number.POSITIVE_INFINITY;
    if (dueA !== dueB) return dueA - dueB;
    return (rank[String(a.priority)] ?? 1) - (rank[String(b.priority)] ?? 1);
  });
};
