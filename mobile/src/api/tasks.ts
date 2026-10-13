import { api } from "./client";
import type { PersonRef, Task, TaskFile } from "./types";

/*
 * GET /tasks is unpaginated. `assignedTo` narrows to one person's work and
 * `scope: "mine"` to tasks the caller created; with neither, the server
 * returns everything the caller may see (the whole team for a manager).
 */
export const listTasks = async (
  params: { assignedTo?: string; scope?: "mine" | "assigned"; status?: string; dueDateStart?: string; dueDateEnd?: string; leadId?: string } = {},
) => {
  const res = await api.get<Task[]>("/tasks", { params });
  return Array.isArray(res.data) ? res.data : [];
};

export const getTask = async (taskId: string) => {
  const res = await api.get<Task>(`/tasks/${taskId}`);
  return res.data || null;
};

export const createTask = async (payload: {
  title: string;
  description?: string;
  priority: string;
  dueDate: string;
  assignedTo: string;
  leadId?: string;
  tags?: string[];
}) => {
  const res = await api.post<Task>("/tasks", payload);
  return res.data || null;
};

export const updateTask = async (taskId: string, payload: Partial<Pick<Task, "status" | "priority">>) => {
  const res = await api.patch<Task>(`/tasks/${taskId}`, payload);
  return res.data || null;
};

export const setSubtaskDone = async (taskId: string, subtaskId: string, done: boolean) => {
  const res = await api.patch(`/tasks/${taskId}/subtasks/${subtaskId}`, { isCompleted: done, status: done ? "COMPLETED" : "TODO" });
  return res.data;
};

export const getAssignees = async () => {
  const res = await api.get<{ users: NonNullable<PersonRef>[] }>("/tasks/assignees");
  return (res.data?.users || []).filter(Boolean);
};

/* ---------------------------------------------------------------- depth -- */


export type TaskEdit = Partial<{ title: string; description: string; priority: string; status: string; dueDate: string | null; assignedTo: string; tags: string[] }>;

export const editTask = async (taskId: string, payload: TaskEdit) => {
  const res = await api.patch<Task>(`/tasks/${taskId}`, payload);
  return res.data || null;
};

/* Admins delete; anyone else's delete becomes a request an admin approves (202). */
export const deleteTask = async (taskId: string) => {
  const res = await api.delete<{ approvalRequired?: boolean; message?: string }>(`/tasks/${taskId}`);
  return { pendingApproval: res.status === 202 || Boolean(res.data?.approvalRequired), message: res.data?.message || "" };
};

/* Subtasks inherit the task's owner (the server enforces it) and need a due date - the task's, unless given. */
export const addSubtask = async (taskId: string, payload: { title: string; dueDate?: string | null }) => {
  const res = await api.post<Task>(`/tasks/${taskId}/subtasks`, payload);
  return res.data || null;
};

export const deleteSubtask = async (taskId: string, subtaskId: string) => {
  const res = await api.delete<Task>(`/tasks/${taskId}/subtasks/${subtaskId}`);
  return res.data || null;
};

/* Task files must be CRM uploads given as the server's own relative path (/api/uploads/files/...). */
type FileRef = Pick<TaskFile, "url" | "name" | "mimeType" | "size">;

export const addComment = async (taskId: string, body: string, attachments: FileRef[] = []) => {
  const res = await api.post<Task>(`/tasks/${taskId}/comments`, { body: body.trim(), attachments });
  return res.data || null;
};

export const deleteComment = async (taskId: string, commentId: string) => {
  const res = await api.delete<Task>(`/tasks/${taskId}/comments/${commentId}`);
  return res.data || null;
};

export const addAttachments = async (taskId: string, attachments: FileRef[]) => {
  const res = await api.post<Task>(`/tasks/${taskId}/attachments`, { attachments });
  return res.data || null;
};

export const deleteAttachment = async (taskId: string, attachmentId: string) => {
  const res = await api.delete<Task>(`/tasks/${taskId}/attachments/${attachmentId}`);
  return res.data || null;
};

export type TaskCounts = { total: number; TODO: number; IN_PROGRESS: number; COMPLETED: number; BACKLOG: number; pending: number; overdue: number };

export const getTaskStats = async () => {
  const res = await api.get<TaskCounts & { subtaskTotal?: number; subtaskCompleted?: number; subtaskOverdue?: number }>("/tasks/stats");
  return res.data || null;
};

export const getTaskStatsByUser = async () => {
  const res = await api.get<Record<string, TaskCounts>>("/tasks/stats/by-user");
  return res.data || {};
};

/* Edit a checklist item's own title, note or due date (the task's manager only). */
export const editSubtask = async (taskId: string, subtaskId: string, payload: { title?: string; description?: string; dueDate?: string | null }) => {
  const res = await api.patch<Task>(`/tasks/${taskId}/subtasks/${subtaskId}`, payload);
  return res.data || null;
};
