/*
 * Editing a teammate's employment details (web UserDetailsEditor). Mirrors the
 * server's rules in role.constants (who may report to whom) and
 * updateUserByAdmin (what is checked). Pure; unit tested.
 */

/* Who someone may report to, by their role (ROLE_PARENT_RULES). */
export const PARENT_ROLES: Record<string, string[]> = {
  ADMIN: [],
  MANAGER: ["ADMIN"],
  INSIDE_EXECUTIVE: ["MANAGER"],
  EXECUTIVE: ["MANAGER"],
  FIELD_EXECUTIVE: ["MANAGER"],
  PRODUCTION_EXECUTIVE: ["MANAGER"],
  COMMUNITY_MANAGER: ["MANAGER"],
  CHANNEL_PARTNER: ["MANAGER"],
  COWORKING_ADMIN: ["MANAGER"],
};

export const BUSINESS_CATEGORIES = [
  { key: "COMMERCIAL", label: "Commercial" },
  { key: "RESIDENTIAL", label: "Residential" },
  { key: "BOTH", label: "Both" },
  { key: "COWORKING", label: "Coworking" },
] as const;

export type ProfileDraft = {
  name: string;
  email: string;
  phone: string;
  roleType: string;
  reportingToId: string;
  department: string;
  branch: string;
  shiftTiming: string;
  monthlyTarget: string;
  canViewInventory: boolean;
  brokerageMode: "FLAT" | "PERCENTAGE";
  brokerageValue: string;
  brokerageNotes: string;
};

export const reportingCandidates = <T extends { _id: string; role: string; isActive?: boolean }>(users: T[], role: string, selfId: string) => {
  const allowed = PARENT_ROLES[role] || [];
  return users.filter((user) => user.isActive !== false && allowed.includes(user.role) && user._id !== selfId);
};

/* The first problem with the draft, or null (web handleSave checks). */
export const profileDraftError = (draft: ProfileDraft, role: string) => {
  if (!draft.name.trim() || !draft.email.trim()) return "Name and email are required.";
  if (draft.name.trim().length < 2 || draft.name.trim().length > 80) return "Name must be 2 to 80 characters.";
  if (!/^\S+@\S+\.\S+$/.test(draft.email.trim())) return "Enter a valid email.";
  const target = Number(draft.monthlyTarget);
  if (draft.monthlyTarget.trim() === "" || !Number.isFinite(target) || target < 0) return "Monthly target must be 0 or more.";
  if ((PARENT_ROLES[role] || []).length && !draft.reportingToId) return `Pick who they report to (${(PARENT_ROLES[role] || []).join(" or ").toLowerCase()}).`;
  if (role === "CHANNEL_PARTNER") {
    const value = Number(draft.brokerageValue);
    if (draft.brokerageValue.trim() === "" || !Number.isFinite(value) || value < 0) return "Brokerage value must be 0 or more.";
    if (draft.brokerageMode === "PERCENTAGE" && value > 100) return "Brokerage percentage can't be more than 100.";
  }
  return null;
};

/* The PATCH body for /users/admin/:id from a valid draft. */
export const profilePatch = (draft: ProfileDraft, role: string) => ({
  name: draft.name.trim(),
  email: draft.email.trim(),
  phone: draft.phone.trim(),
  roleType: draft.roleType as "COMMERCIAL" | "RESIDENTIAL" | "BOTH" | "COWORKING",
  reportingToId: (PARENT_ROLES[role] || []).length ? draft.reportingToId : null,
  department: draft.department.trim(),
  branch: draft.branch.trim(),
  shiftTiming: draft.shiftTiming.trim(),
  monthlyTarget: Number(draft.monthlyTarget),
  canViewInventory: role === "CHANNEL_PARTNER" ? draft.canViewInventory : false,
  ...(role === "CHANNEL_PARTNER" ? { brokerageConfig: { mode: draft.brokerageMode, value: Number(draft.brokerageValue), notes: draft.brokerageNotes.trim() } } : {}),
});

const idOf = (value: unknown) => (value && typeof value === "object" ? String((value as { _id?: string })._id || "") : String(value || ""));

/* The editor's starting point from what the server holds (web loadData). */
export const profileDraftFrom = (user: {
  name?: string;
  email?: string;
  phone?: string;
  roleType?: string;
  parentId?: unknown;
  department?: string;
  branch?: string;
  shiftTiming?: string;
  monthlyTarget?: number;
  canViewInventory?: boolean;
  brokerageConfig?: { mode?: string; value?: number; notes?: string } | null;
}): ProfileDraft => {
  const mode = String(user.brokerageConfig?.mode || "").toUpperCase() === "PERCENTAGE" ? "PERCENTAGE" : "FLAT";
  const value = Number(user.brokerageConfig?.value);
  return {
    name: user.name || "",
    email: user.email || "",
    phone: user.phone || "",
    roleType: BUSINESS_CATEGORIES.some((item) => item.key === user.roleType) ? String(user.roleType) : "COMMERCIAL",
    reportingToId: idOf(user.parentId),
    department: user.department || "",
    branch: user.branch || "",
    shiftTiming: user.shiftTiming || "",
    monthlyTarget: String(Number.isFinite(user.monthlyTarget) ? user.monthlyTarget : 10),
    canViewInventory: Boolean(user.canViewInventory),
    brokerageMode: mode,
    // The server's own defaults when nothing was set (toBrokerageConfigView).
    brokerageValue: String(Number.isFinite(value) ? value : mode === "PERCENTAGE" ? 2 : 50000),
    brokerageNotes: user.brokerageConfig?.notes || "",
  };
};

/* Someone's task load (web taskStats): overdue is open work due before today. */
export const taskStats = (tasks: { status: string; dueDate?: string | null }[], now = new Date()) => {
  const startOfToday = new Date(now);
  startOfToday.setHours(0, 0, 0, 0);
  const total = tasks.length;
  const completed = tasks.filter((task) => task.status === "COMPLETED").length;
  const inProgress = tasks.filter((task) => task.status === "IN_PROGRESS").length;
  const overdue = tasks.filter((task) => task.status !== "COMPLETED" && task.dueDate && new Date(task.dueDate) < startOfToday).length;
  return { total, completed, inProgress, open: total - completed, overdue, completionRate: total ? Math.round((completed / total) * 100) : 0 };
};

/* Monthly target progress, capped at 100% (web targetAchievementPercent). */
export const targetProgress = (target: number, achieved: number) => ({
  target,
  achieved,
  remaining: Math.max(0, target - achieved),
  percent: target > 0 ? Math.min(100, Math.round((achieved / target) * 100)) : 0,
});
