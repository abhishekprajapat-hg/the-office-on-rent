import { api } from "./client";

/*
 * Every approval queue the web's notification inbox works through, flattened
 * into one shape. Each queue is fetched on its own and a queue the caller may
 * not see (a manager and user deletes, say) is simply empty.
 */

export type ApprovalKind = "payment" | "leave" | "delete" | "inventory" | "status" | "user";

type Person = { _id: string; name: string; role?: string; profileImageUrl?: string } | null | undefined;

export type ApprovalItem = {
  kind: ApprovalKind;
  id: string;
  title: string;
  detail: string;
  note?: string;
  requestedBy?: Person;
  createdAt?: string;
  status: "PENDING" | "APPROVED" | "REJECTED" | "CANCELLED" | string;
  /* Where tapping the item goes, if anywhere. */
  leadId?: string;
  documents?: { url: string; name?: string }[];
  raw: Record<string, unknown>;
};

const upper = (value: unknown) => String(value || "").toUpperCase();
const settle = <T,>(promise: Promise<T>, fallback: T) => promise.catch(() => fallback);

const PAYMENT_MODE: Record<string, string> = { UPI: "UPI", CASH: "Cash", CHECK: "Cheque", NET_BANKING_NEFTRTGSIMPS: "Bank transfer" };
const rupees = (value: unknown) => `₹${Math.round(Number(value) || 0).toLocaleString("en-IN")}`;

type AnyRecord = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

export const loadApprovals = async (): Promise<ApprovalItem[]> => {
  const [payments, leaves, deletes, inventory, statuses, users] = await Promise.all([
    settle(api.get("/leads/payment-requests", { params: { approvalStatus: "ALL" } }).then((r) => (r.data?.requests || []) as AnyRecord[]), []),
    settle(api.get("/attendance/leave-requests/admin").then((r) => (r.data?.leaveRequests || []) as AnyRecord[]), []),
    settle(api.get("/delete-requests", { params: { status: "ALL" } }).then((r) => (r.data?.requests || []) as AnyRecord[]), []),
    settle(api.get("/inventory-request/pending").then((r) => (r.data?.requests || []) as AnyRecord[]), []),
    settle(api.get("/leads/status-requests/pending").then((r) => (r.data?.requests || []) as AnyRecord[]), []),
    settle(api.get("/users/delete-requests/admin").then((r) => (r.data?.requests || []) as AnyRecord[]), []),
  ]);

  const items: ApprovalItem[] = [
    ...payments.map((lead): ApprovalItem => {
      const pay = lead.dealPayment || {};
      return {
        kind: "payment",
        id: lead._id,
        title: `Deal payment · ${lead.name}`,
        detail: [PAYMENT_MODE[pay.mode] || pay.mode, pay.paymentType === "PARTIAL" ? `part paid, ${rupees(pay.remainingAmount)} due` : "paid in full", pay.paymentReference ? `ref ${pay.paymentReference}` : ""]
          .filter(Boolean)
          .join(" · "),
        note: pay.note || pay.approvalNote,
        requestedBy: pay.approvalRequestedBy,
        createdAt: pay.approvalRequestedAt || lead.updatedAt,
        status: upper(pay.approvalStatus) || "PENDING",
        leadId: lead._id,
        documents: lead.closureDocuments || [],
        raw: lead,
      };
    }),
    ...leaves.map((leave): ApprovalItem => ({
      kind: "leave",
      id: leave._id,
      title: `Leave · ${leave.userId?.name || "Someone"}`,
      detail: [`${leave.fromDate}${leave.toDate && leave.toDate !== leave.fromDate ? ` → ${leave.toDate}` : ""}`, leave.totalDays ? `${leave.totalDays} day${leave.totalDays === 1 ? "" : "s"}` : "", String(leave.leaveType || "").toLowerCase()]
        .filter(Boolean)
        .join(" · "),
      note: leave.reason,
      requestedBy: leave.userId,
      createdAt: leave.createdAt,
      status: upper(leave.status),
      raw: leave,
    })),
    ...deletes.map((request): ApprovalItem => ({
      kind: "delete",
      id: request._id,
      title: `Delete ${String(request.entityLabel || request.actionType || "record").toLowerCase()} · ${request.entityName || ""}`.trim(),
      detail: request.reason || "No reason given",
      note: request.reviewNote,
      requestedBy: request.requestedBy,
      createdAt: request.createdAt,
      status: upper(request.status),
      leadId: request.actionType === "lead" ? request.entityId : undefined,
      raw: request,
    })),
    ...inventory.map((request): ApprovalItem => ({
      kind: "inventory",
      id: request._id,
      title: `${String(request.type || "change").replace(/^\w/, (c: string) => c.toUpperCase())} property · ${request.inventoryId?.projectName || request.proposedData?.projectName || request.payload?.projectName || "Inventory"}`,
      detail: [request.inventoryId?.unitNumber, request.proposedData?.location || request.payload?.location, request.preApprovedBy ? "pre-approved by manager" : ""].filter(Boolean).join(" · ") || "Inventory change",
      note: request.note || request.reason,
      requestedBy: request.requestedBy,
      createdAt: request.createdAt,
      status: upper(request.status) || "PENDING",
      raw: request,
    })),
    ...statuses.map((request): ApprovalItem => ({
      kind: "status",
      id: request._id,
      title: `Status change · ${request.lead?.name || request.leadId?.name || "Lead"}`,
      detail: `${request.currentStatus || request.fromStatus || "?"} → ${request.proposedStatus || "?"}`,
      note: request.requestNote,
      requestedBy: request.requestedBy,
      createdAt: request.createdAt,
      status: upper(request.status) || "PENDING",
      leadId: request.lead?._id || request.leadId?._id || request.leadId,
      raw: request,
    })),
    ...users.map((request): ApprovalItem => ({
      kind: "user",
      id: request._id,
      title: `Remove user · ${request.targetUser?.name || request.user?.name || "Team member"}`,
      detail: request.reason || "No reason given",
      requestedBy: request.requestedBy,
      createdAt: request.createdAt,
      status: upper(request.status),
      raw: request,
    })),
  ];

  return items.sort((a, b) => {
    // Pending first, newest first within each group.
    const pa = a.status === "PENDING" ? 0 : 1;
    const pb = b.status === "PENDING" ? 0 : 1;
    if (pa !== pb) return pa - pb;
    return new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime();
  });
};

/* Approve or reject one item through the endpoint its queue uses. */
export const decide = async (item: ApprovalItem, approve: boolean, note: string, role: string) => {
  const trimmed = note.trim();
  switch (item.kind) {
    case "payment":
      return api.patch(`/leads/${item.id}/status`, {
        status: item.raw.status,
        dealPayment: { approvalStatus: approve ? "APPROVED" : "REJECTED", approvalNote: trimmed },
      });
    case "leave":
      return api.patch(`/attendance/leave-requests/${item.id}/review`, { status: approve ? "APPROVED" : "REJECTED", reviewNote: trimmed });
    case "delete":
      return api.post(`/delete-requests/${item.id}/${approve ? "approve" : "reject"}`, { note: trimmed });
    case "inventory":
      // A manager's approval is a pre-approval; the admin makes it final.
      if (approve) return api.patch(`/inventory-request/${item.id}/${role === "ADMIN" ? "approve" : "pre-approve"}`);
      return api.patch(`/inventory-request/${item.id}/reject`, { rejectionReason: trimmed });
    case "status":
      return api.patch(`/leads/status-requests/${item.id}/${approve ? "approve" : "reject"}`, approve ? {} : { rejectionReason: trimmed });
    case "user":
      return api.patch(`/users/delete-requests/${item.id}/review`, { action: approve ? "APPROVE" : "REJECT", note: trimmed });
  }
};

/* Which decisions need a written reason. */
export const reasonRequired = (kind: ApprovalKind, approve: boolean) => !approve && (kind === "inventory" || kind === "status");
