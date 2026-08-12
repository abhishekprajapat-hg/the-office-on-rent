export const STATUS_STYLES = {
  NEW: {
    label: "New",
    tone: "slate",
  },
  CONTACTED: {
    label: "Contacted",
    tone: "cyan",
  },
  INTERESTED: {
    label: "Interested",
    tone: "amber",
  },
  SITE_VISIT: {
    label: "Site Visit",
    tone: "violet",
  },
  REQUESTED: {
    label: "Requested",
    tone: "blue",
  },
  CLOSED: {
    label: "Closed",
    tone: "emerald",
  },
  LOST: {
    label: "Lost",
    tone: "rose",
  },
  AVAILABLE: {
    label: "Available",
    tone: "emerald",
  },
  BLOCKED: {
    label: "Blocked",
    tone: "rose",
  },
  SOLD: {
    label: "Sold",
    tone: "slate",
  },
  PENDING: {
    label: "Pending",
    tone: "amber",
  },
  APPROVED: {
    label: "Approved",
    tone: "emerald",
  },
  REJECTED: {
    label: "Rejected",
    tone: "rose",
  },
  RESERVED: {
    label: "Reserved",
    tone: "amber",
  },
  PARTIALLY_OCCUPIED: {
    label: "Partially Occupied",
    tone: "amber",
  },
  FULLY_OCCUPIED: {
    label: "Fully Occupied",
    tone: "rose",
  },
  OCCUPIED: {
    label: "Occupied",
    tone: "rose",
  },
  MAINTENANCE: {
    label: "Maintenance",
    tone: "violet",
  },
  INACTIVE: {
    label: "Inactive",
    tone: "slate",
  },
  ACTIVE: {
    label: "Active",
    tone: "emerald",
  },
  DRAFT: {
    label: "Draft",
    tone: "slate",
  },
  EXPIRED: {
    label: "Expired",
    tone: "rose",
  },
  CANCELLED: {
    label: "Cancelled",
    tone: "rose",
  },
  CONFIRMED: {
    label: "Confirmed",
    tone: "emerald",
  },
  PAID: {
    label: "Paid",
    tone: "emerald",
  },
  PARTIALLY_PAID: {
    label: "Partially Paid",
    tone: "amber",
  },
  UNPAID: {
    label: "Unpaid",
    tone: "rose",
  },
  OVERDUE: {
    label: "Overdue",
    tone: "rose",
  },
  OPEN: {
    label: "Open",
    tone: "blue",
  },
  IN_PROGRESS: {
    label: "In Progress",
    tone: "amber",
  },
  RESOLVED: {
    label: "Resolved",
    tone: "emerald",
  },
  CHECKED_IN: {
    label: "Checked In",
    tone: "emerald",
  },
  CHECKED_OUT: {
    label: "Checked Out",
    tone: "slate",
  },
  LEAD: {
    label: "Lead",
    tone: "slate",
  },
  PROSPECT: {
    label: "Prospect",
    tone: "cyan",
  },
  SUSPENDED: {
    label: "Suspended",
    tone: "rose",
  },
  SUBMITTED: {
    label: "Submitted",
    tone: "amber",
  },
  VERIFIED: {
    label: "Verified",
    tone: "emerald",
  },
  COMPLETED: {
    label: "Completed",
    tone: "slate",
  },
  NO_SHOW: {
    label: "No Show",
    tone: "rose",
  },
};

export const normalizeStatusKey = (status) =>
  String(status || "")
    .trim()
    .replace(/[\s-]+/g, "_")
    .toUpperCase();

export const getStatusMeta = (status) => {
  const key = normalizeStatusKey(status);
  const meta = STATUS_STYLES[key];
  if (meta) return meta;

  return {
    label: String(status || "Unknown")
      .replace(/_/g, " ")
      .toLowerCase()
      .replace(/\b\w/g, (char) => char.toUpperCase()),
    tone: "slate",
  };
};
