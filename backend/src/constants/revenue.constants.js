// Revenue Module (CRM Revenue Module FRD, Oct 2026).
//
// Every property is either the company's own (SELF) or someone else's
// (THIRD_PARTY). Ownership decides the revenue type: self-owned space earns
// rental income, third-party space earns brokerage. The business model narrows
// it further and must agree with the ownership.

const OWNERSHIP_TYPES = Object.freeze({
  SELF: "SELF",
  THIRD_PARTY: "THIRD_PARTY",
});

const BUSINESS_MODELS = Object.freeze({
  COWORKING: "COWORKING",
  ENTERPRISE: "ENTERPRISE",
  RENTAL_BROKERAGE: "RENTAL_BROKERAGE",
  BUY_SELL: "BUY_SELL",
});

const REVENUE_TYPES = Object.freeze({
  RENTAL_INCOME: "RENTAL_INCOME",
  BROKERAGE: "BROKERAGE",
});

const BUSINESS_MODELS_BY_OWNERSHIP = Object.freeze({
  [OWNERSHIP_TYPES.SELF]: Object.freeze([BUSINESS_MODELS.COWORKING, BUSINESS_MODELS.ENTERPRISE]),
  [OWNERSHIP_TYPES.THIRD_PARTY]: Object.freeze([BUSINESS_MODELS.RENTAL_BROKERAGE, BUSINESS_MODELS.BUY_SELL]),
});

const RENT_PAYMENT_STATUSES = Object.freeze(["PAID", "PARTIAL", "PENDING", "OVERDUE"]);
const BROKERAGE_SOURCES = Object.freeze(["TENANT", "OWNER", "BOTH"]);

const revenueTypeForOwnership = (ownershipType) => {
  if (ownershipType === OWNERSHIP_TYPES.SELF) return REVENUE_TYPES.RENTAL_INCOME;
  if (ownershipType === OWNERSHIP_TYPES.THIRD_PARTY) return REVENUE_TYPES.BROKERAGE;
  return "";
};

const ownershipForBusinessModel = (businessModel) => {
  if ([BUSINESS_MODELS.COWORKING, BUSINESS_MODELS.ENTERPRISE].includes(businessModel)) {
    return OWNERSHIP_TYPES.SELF;
  }
  if ([BUSINESS_MODELS.RENTAL_BROKERAGE, BUSINESS_MODELS.BUY_SELL].includes(businessModel)) {
    return OWNERSHIP_TYPES.THIRD_PARTY;
  }
  return "";
};

module.exports = {
  OWNERSHIP_TYPES,
  BUSINESS_MODELS,
  REVENUE_TYPES,
  BUSINESS_MODELS_BY_OWNERSHIP,
  RENT_PAYMENT_STATUSES,
  BROKERAGE_SOURCES,
  revenueTypeForOwnership,
  ownershipForBusinessModel,
};
