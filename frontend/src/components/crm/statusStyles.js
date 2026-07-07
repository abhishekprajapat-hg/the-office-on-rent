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
