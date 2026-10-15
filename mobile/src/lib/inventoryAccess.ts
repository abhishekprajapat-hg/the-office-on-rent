/*
 * Who may change a property, and how - mirrors web AssetVault (canManage,
 * canDeleteDirect, canRequestDelete, canRequestEdit, canRequestStatusChange)
 * and the inventory routes. The server has the final say on every call.
 */
type AccessLike = { permissions: string[]; enforcePageAccess?: boolean; hasExplicitPageOverride?: boolean } | null | undefined;

const REQUEST_ROLES = new Set(["ADMIN", "MANAGER", "EXECUTIVE", "FIELD_EXECUTIVE"]);

export const inventoryAccess = (role: string | undefined, access: AccessLike) => {
  const explicit = (action: string) => Boolean(access?.hasExplicitPageOverride ?? access?.enforcePageAccess) && Boolean(access?.permissions.includes(`page.inventory.${action}`));
  const canManage = role === "ADMIN" || role === "MANAGER" || explicit("edit");
  // A manager never deletes directly: their delete is a request an admin approves.
  const canDeleteDirect = role === "ADMIN" || (role !== "MANAGER" && explicit("delete"));
  const canRequestDelete = !canDeleteDirect && (REQUEST_ROLES.has(String(role)) || explicit("delete"));
  const canRequestEdit = REQUEST_ROLES.has(String(role)) || explicit("edit");
  return {
    canManage,
    canDeleteDirect,
    canRequestDelete,
    canEdit: canManage || canRequestEdit,
    canChangeStatus: canManage || REQUEST_ROLES.has(String(role)),
    canSeeActivity: role === "ADMIN" || role === "MANAGER" || explicit("view"),
  };
};

export const SOLD_PAYMENT_MODES = [
  { key: "UPI", label: "UPI" },
  { key: "CASH", label: "Cash" },
  { key: "CHECK", label: "Cheque" },
  { key: "NET_BANKING_NEFTRTGSIMPS", label: "NEFT / RTGS / IMPS" },
] as const;

/* Sold needs who bought it and how it was paid (web buildSaleDetailsPayload). */
export const validateSale = (input: { leadId: string; paymentMode: string; paymentType: "FULL" | "PARTIAL"; totalAmount: number | null; remainingAmount: number | null; paymentReference: string }) => {
  if (!input.leadId) return "Pick the lead it was sold to";
  if (!input.paymentMode) return "Pick how it was paid";
  if (!input.totalAmount || input.totalAmount <= 0) return "Enter the sold amount";
  if (input.paymentType === "PARTIAL" && (!input.remainingAmount || input.remainingAmount <= 0)) return "Enter the amount still to come";
  if (input.paymentMode !== "CASH" && !input.paymentReference.trim()) return "Enter the payment reference";
  return null;
};

const ACTIVITY_LABEL: Record<string, string> = {
  REQUEST_CREATED: "Request raised",
  REQUEST_APPROVED_CREATE: "Listing approved",
  REQUEST_APPROVED_UPDATE: "Change approved",
  REQUEST_APPROVED_DELETE: "Delete approved",
  REQUEST_REJECTED: "Request rejected",
  DIRECT_CREATE: "Listed",
  DIRECT_UPDATE: "Edited",
  DIRECT_DELETE: "Deleted",
  BULK_CREATE: "Bulk uploaded",
};
export const activityLabel = (action?: string) => ACTIVITY_LABEL[String(action || "")] || String(action || "Change").replace(/_/g, " ").toLowerCase();

const show = (value: unknown): string => {
  if (value === null || value === undefined || value === "") return "—";
  if (Array.isArray(value)) return `${value.length} item${value.length === 1 ? "" : "s"}`;
  if (typeof value === "object") return "updated";
  return String(value);
};
const humanKey = (key: string) => key.replace(/([a-z])([A-Z])/g, "$1 $2").replace(/_/g, " ").toLowerCase();

/* "status: Available → Blocked" for each field the activity changed (top level only). */
export const describeChanges = (oldValue: unknown, newValue: unknown, limit = 6) => {
  const before = oldValue && typeof oldValue === "object" ? (oldValue as Record<string, unknown>) : {};
  const after = newValue && typeof newValue === "object" ? (newValue as Record<string, unknown>) : {};
  const keys = [...new Set([...Object.keys(before), ...Object.keys(after)])].filter((key) => !["updatedAt", "updatedBy", "approvedBy", "_id", "__v"].includes(key));
  return keys.slice(0, limit).map((key) => `${humanKey(key)}: ${show(before[key])} → ${show(after[key])}`);
};
