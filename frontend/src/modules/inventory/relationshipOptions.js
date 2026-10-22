/* Labels for broker / owner / inventory-source values (requirements 16 Oct 2026). */
export const SEGMENT_OPTIONS = [
  { value: "COMMERCIAL", label: "Commercial" },
  { value: "RESIDENTIAL", label: "Residential" },
  { value: "COWORKING", label: "Coworking" },
];
export const TRANSACTION_OPTIONS = [
  { value: "SALE", label: "Sale" },
  { value: "PURCHASE", label: "Purchase" },
  { value: "RENT", label: "Rent" },
  { value: "LEASE", label: "Lease" },
];
export const CUSTOMER_TYPE_OPTIONS = ["CORPORATE", "SME", "STARTUP", "INDIVIDUAL", "INVESTOR", "END_USER", "OTHER"]
  .map((value) => ({ value, label: value.replace("_", " ").toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase()) }));
export const CP_STATUS_OPTIONS = [
  { value: "NOT_ONBOARDED", label: "Not onboarded", tone: "bg-slate-100 text-slate-600" },
  { value: "PENDING", label: "CP pending", tone: "bg-amber-50 text-amber-700" },
  { value: "ACTIVE", label: "Active CP", tone: "bg-emerald-50 text-emerald-700" },
  { value: "INACTIVE", label: "Inactive CP", tone: "bg-rose-50 text-rose-700" },
];
export const RELATIONSHIP_OPTIONS = [
  { value: "", label: "Not set" },
  { value: "NEW", label: "New" },
  { value: "ACTIVE", label: "Active" },
  { value: "WARM", label: "Warm" },
  { value: "COLD", label: "Cold" },
  { value: "DO_NOT_CONTACT", label: "Do not contact" },
];
export const CONTACT_METHOD_OPTIONS = [
  { value: "", label: "Not set" },
  { value: "CALL", label: "Call" },
  { value: "WHATSAPP", label: "WhatsApp" },
  { value: "EMAIL", label: "Email" },
  { value: "VISIT", label: "Visit" },
];
export const SOURCE_TYPE_OPTIONS = [
  { value: "", label: "Not set" },
  { value: "COMPANY", label: "Company-owned / managed" },
  { value: "OWNER", label: "Owner-provided" },
  { value: "BROKER", label: "Broker-provided" },
  { value: "PARTNER", label: "Partner / operator" },
  { value: "OTHER", label: "Other" },
];
export const AVAILABILITY_OPTIONS = [
  { value: "UNVERIFIED", label: "Unverified", tone: "bg-slate-100 text-slate-600" },
  { value: "AVAILABLE", label: "Available", tone: "bg-emerald-50 text-emerald-700" },
  { value: "ON_HOLD", label: "On hold", tone: "bg-amber-50 text-amber-700" },
  { value: "BOOKED", label: "Booked", tone: "bg-blue-50 text-blue-700" },
  { value: "SOLD", label: "Sold", tone: "bg-rose-50 text-rose-700" },
  { value: "WITHDRAWN", label: "Withdrawn", tone: "bg-slate-200 text-slate-600" },
];
export const labelOf = (options, value) => options.find((o) => o.value === value)?.label || value || "";
export const toneOf = (options, value) => options.find((o) => o.value === value)?.tone || "bg-slate-100 text-slate-600";
export const formatShortDate = (value) => (value ? new Date(value).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" }) : "");
export const daysAgo = (value) => {
  if (!value) return null;
  return Math.floor((Date.now() - new Date(value).getTime()) / 86400000);
};
