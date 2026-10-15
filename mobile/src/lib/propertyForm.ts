/* Add-property form checks, before the round trip; the server re-validates. Pure; unit tested. */

export const validateProperty = (form: {
  projectName: string;
  towerName: string;
  location: string;
  type: string;
  price: number | null;
  rent: number | null;
}) => {
  const errors: Record<string, string> = {};
  if (!form.projectName.trim()) errors.projectName = "Enter the project or building name";
  if (!form.towerName.trim()) errors.towerName = "Enter the tower, block or unit";
  if (!form.location.trim()) errors.location = "Enter where the property is";
  if (form.type !== "Rent" && !form.price) errors.price = "Enter the sale price";
  if (form.type !== "Sale" && !form.rent) errors.rent = "Enter the monthly rent";
  return errors;
};

/* The web form's pick lists (AssetVault, InventoryRevenueFields), with the server's stored values. */
export const OWNER_TYPES = [
  { key: "1ST", label: "1st owner" },
  { key: "2ND", label: "2nd owner" },
  { key: "3RD", label: "3rd owner" },
  { key: "POWER_OF_ATTORNEY", label: "Power of attorney" },
];
export const DEAL_TYPES = [
  { key: "PURCHASE", label: "Purchase" },
  { key: "RENT", label: "Rent" },
  { key: "LEASE", label: "Lease" },
];
export const OWNERSHIP = [
  { key: "SELF", label: "Self property", income: "Rental income" },
  { key: "THIRD_PARTY", label: "Third-party", income: "Brokerage income" },
];
/* Self-owned space earns rent; third-party space earns brokerage. */
export const MODELS_BY_OWNERSHIP: Record<string, { key: string; label: string }[]> = {
  SELF: [
    { key: "COWORKING", label: "Coworking" },
    { key: "ENTERPRISE", label: "Enterprise (lease & sublet)" },
  ],
  THIRD_PARTY: [
    { key: "RENTAL_BROKERAGE", label: "Rental brokerage" },
    { key: "BUY_SELL", label: "Buy & sell" },
  ],
};
export const PAYMENT_STATUSES = [
  { key: "PAID", label: "Paid" },
  { key: "PARTIAL", label: "Partial" },
  { key: "PENDING", label: "Pending" },
  { key: "OVERDUE", label: "Overdue" },
];
export const DOCUMENT_CHECKS = [
  { key: "registry", label: "Registry" },
  { key: "searchReport", label: "Search report" },
  { key: "electricityNoc", label: "Electricity NOC" },
  { key: "maintenanceNoc", label: "Maintenance NOC" },
  { key: "taxReceipt", label: "Tax receipt" },
  { key: "loanNoc", label: "Loan NOC" },
] as const;
export type DocumentChecks = Record<(typeof DOCUMENT_CHECKS)[number]["key"], boolean>;

/* Video tour links, one per line (web parseTextareaList): blanks and repeats dropped. */
export const parseLinks = (text: string) => [...new Set(text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean))];

/* A link the server will keep: http(s) only. */
export const badLink = (links: string[]) => links.find((link) => !/^https?:\/\/\S+$/i.test(link)) || null;

/* Enterprise model: monthly profit is what the client pays less the lease, or null until both are in. */
export const enterpriseProfit = (leaseRent: string, clientRent: string) => {
  if (leaseRent.trim() === "" || clientRent.trim() === "") return null;
  const lease = Number(leaseRent.replace(/,/g, ""));
  const client = Number(clientRent.replace(/,/g, ""));
  return Number.isFinite(lease) && Number.isFinite(client) ? client - lease : null;
};

/* Indian PIN codes are six digits; empty is fine. */
export const pincodeError = (value: string) => (value.trim() && !/^\d{6}$/.test(value.trim()) ? "PIN code is 6 digits" : null);
