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

/* The board's column order, as on the web. */
export const STATUS_ORDER = ["BACKLOG", "TODO", "IN_PROGRESS", "COMPLETED"] as const;
export const TASK_STATUS_TONE: Record<string, Tone> = { BACKLOG: "neutral", TODO: "violet", IN_PROGRESS: "primary", COMPLETED: "success" };
export const DEFAULT_TAGS = ["Call", "Meeting", "Client", "Follow-up"];

/* Local calendar day "YYYY-MM-DD"; due dates are days, not instants. */
export const dayKey = (value: string | Date = new Date()) => {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
};

type SubtaskLike = { status?: string; isCompleted?: boolean; dueDate?: string | null };
export const subtaskStatus = (subtask: SubtaskLike) => subtask.status || (subtask.isCompleted ? "COMPLETED" : "TODO");
export const isSubtaskDone = (subtask: SubtaskLike) => subtaskStatus(subtask) === "COMPLETED";

/* Web rule: not completed and due before today. */
export const isTaskOverdue = (task: { status: string; dueDate?: string | null }) =>
  task.status !== "COMPLETED" && Boolean(task.dueDate) && dayKey(task.dueDate!) < dayKey();
/* The row's red flag also counts an open subtask past its date. */
export const hasOverdueWork = (task: { status: string; dueDate?: string | null; subtasks?: SubtaskLike[] }) =>
  isTaskOverdue(task) || (task.subtasks || []).some((subtask) => !isSubtaskDone(subtask) && Boolean(subtask.dueDate) && dayKey(subtask.dueDate!) < dayKey());

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
