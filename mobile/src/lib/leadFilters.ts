/* Advanced lead filters, mirroring backend/src/utils/leadAdvancedFilters.js. Pure; unit tested. */

export type LeadFilters = {
  source?: "META" | "MANUAL" | "";
  assignedTo?: string; // user id, or "UNASSIGNED"
  city?: string;
  project?: string;
  inventoryType?: "COMMERCIAL" | "RESIDENTIAL" | "COWORKING" | "";
  transactionType?: "SALE" | "RENT" | "LEASE" | "";
  budgetMin?: number | null;
  budgetMax?: number | null;
  createdFrom?: string; // YYYY-MM-DD
  createdTo?: string;
  followUpDateFrom?: string;
  followUpDateTo?: string;
};

/* Only the filters actually set, as query params the API accepts. */
export const filterParams = (filters: LeadFilters) => {
  const params: Record<string, string> = {};
  Object.entries(filters).forEach(([key, value]) => {
    if (value === null || value === undefined || value === "") return;
    params[key] = typeof value === "number" ? String(value) : String(value).trim();
  });
  return params;
};

export const activeFilterCount = (filters: LeadFilters) => {
  const params = filterParams(filters);
  // A range counts once, not once per end.
  const pairs = [["budgetMin", "budgetMax"], ["createdFrom", "createdTo"], ["followUpDateFrom", "followUpDateTo"]];
  let count = Object.keys(params).length;
  pairs.forEach(([a, b]) => {
    if (params[a!] && params[b!]) count -= 1;
  });
  return count;
};

/* Mirrors the server's checks so a bad range is caught before the round trip. */
export const filterError = (filters: LeadFilters) => {
  if (filters.budgetMin && filters.budgetMax && filters.budgetMin > filters.budgetMax) return "Minimum budget is higher than the maximum.";
  const ranges: [string | undefined, string | undefined][] = [
    [filters.createdFrom, filters.createdTo],
    [filters.followUpDateFrom, filters.followUpDateTo],
  ];
  if (ranges.some(([from, to]) => from && to && from > to)) return "A 'from' date is after its 'to' date.";
  return null;
};
