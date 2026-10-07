import React from "react";

export const EMPTY_ENTERPRISE_DETAILS = Object.freeze({
  leaseRent: "",
  clientRent: "",
  clientName: "",
  rentDueDay: "",
  paymentStatus: "",
  lastPaymentDate: "",
});

// Self-owned space earns rent; third-party space earns brokerage.
const MODELS_BY_OWNERSHIP = {
  SELF: [["COWORKING", "Coworking"], ["ENTERPRISE", "Enterprise (lease & sublet)"]],
  THIRD_PARTY: [["RENTAL_BROKERAGE", "Rental Brokerage"], ["BUY_SELL", "Buy & Sell"]],
};

const REVENUE_TYPE_LABEL = { SELF: "Rental income", THIRD_PARTY: "Brokerage income" };

const labelClass = "text-[10px] font-bold text-slate-400 uppercase tracking-widest";

const InventoryRevenueFields = ({ formData, setFormData, inputClass, sectionClass, headingClass }) => {
  const ownership = formData.ownershipType || "";
  const models = MODELS_BY_OWNERSHIP[ownership] || [];
  const enterprise = { ...EMPTY_ENTERPRISE_DETAILS, ...(formData.enterpriseDetails || {}) };
  const setEnterprise = (key, value) =>
    setFormData((prev) => ({ ...prev, enterpriseDetails: { ...EMPTY_ENTERPRISE_DETAILS, ...(prev.enterpriseDetails || {}), [key]: value } }));
  const lease = Number(enterprise.leaseRent);
  const client = Number(enterprise.clientRent);
  const profit = enterprise.leaseRent !== "" && enterprise.clientRent !== "" && Number.isFinite(lease) && Number.isFinite(client)
    ? client - lease
    : null;

  return (
    <div className={`${sectionClass} grid grid-cols-1 gap-3 sm:grid-cols-2 sm:gap-4`}>
      <div className="sm:col-span-2">
        <div className={headingClass}>Revenue</div>
        {ownership ? <p className="mt-1 text-xs text-slate-500">Earns {REVENUE_TYPE_LABEL[ownership].toLowerCase()}.</p> : null}
      </div>
      <div>
        <label className={labelClass} htmlFor="inv-ownership-type">Ownership Type</label>
        <select
          id="inv-ownership-type"
          value={ownership}
          onChange={(e) => {
            const next = e.target.value;
            setFormData((prev) => ({
              ...prev,
              ownershipType: next,
              businessModel: (MODELS_BY_OWNERSHIP[next] || []).some(([value]) => value === prev.businessModel) ? prev.businessModel : "",
            }));
          }}
          className={`${inputClass} mt-1`}
        >
          <option value="">Select ownership type</option>
          <option value="SELF">Self property</option>
          <option value="THIRD_PARTY">Third-party property</option>
        </select>
      </div>
      <div>
        <label className={labelClass} htmlFor="inv-business-model">Business Model</label>
        <select
          id="inv-business-model"
          value={formData.businessModel || ""}
          disabled={!ownership}
          onChange={(e) => setFormData((prev) => ({ ...prev, businessModel: e.target.value }))}
          className={`${inputClass} mt-1`}
        >
          <option value="">{ownership ? "Select business model" : "Pick ownership first"}</option>
          {models.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
        </select>
      </div>
      {formData.businessModel === "ENTERPRISE" ? (
        <>
          <div>
            <label className={labelClass} htmlFor="inv-lease-rent">Lease Rent (we pay) / month</label>
            <input id="inv-lease-rent" type="number" min="0" step="1" value={enterprise.leaseRent} onChange={(e) => setEnterprise("leaseRent", e.target.value)} placeholder="e.g. 80000" className={`${inputClass} mt-1`} />
          </div>
          <div>
            <label className={labelClass} htmlFor="inv-client-rent">Client Rent (we receive) / month</label>
            <input id="inv-client-rent" type="number" min="0" step="1" value={enterprise.clientRent} onChange={(e) => setEnterprise("clientRent", e.target.value)} placeholder="e.g. 120000" className={`${inputClass} mt-1`} />
          </div>
          <div>
            <label className={labelClass} htmlFor="inv-client-name">Client</label>
            <input id="inv-client-name" type="text" value={enterprise.clientName} onChange={(e) => setEnterprise("clientName", e.target.value)} placeholder="Client company" className={`${inputClass} mt-1`} />
          </div>
          <div>
            <label className={labelClass}>Monthly Profit</label>
            <div className={`${inputClass} mt-1 font-semibold ${profit !== null && profit < 0 ? "text-rose-600" : "text-emerald-700"}`}>
              {profit === null ? "Enter both rents" : new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 }).format(profit)}
            </div>
          </div>
          <div>
            <label className={labelClass} htmlFor="inv-rent-due">Rent Due Day</label>
            <input id="inv-rent-due" type="number" min="1" max="31" step="1" value={enterprise.rentDueDay} onChange={(e) => setEnterprise("rentDueDay", e.target.value)} placeholder="1 to 31" className={`${inputClass} mt-1`} />
          </div>
          <div>
            <label className={labelClass} htmlFor="inv-rent-status">Payment Status</label>
            <select id="inv-rent-status" value={enterprise.paymentStatus} onChange={(e) => setEnterprise("paymentStatus", e.target.value)} className={`${inputClass} mt-1`}>
              <option value="">Not set</option>
              <option value="PAID">Paid</option>
              <option value="PARTIAL">Partial</option>
              <option value="PENDING">Pending</option>
              <option value="OVERDUE">Overdue</option>
            </select>
          </div>
          <div>
            <label className={labelClass} htmlFor="inv-rent-paid-on">Last Payment Date</label>
            <input id="inv-rent-paid-on" type="date" value={enterprise.lastPaymentDate} onChange={(e) => setEnterprise("lastPaymentDate", e.target.value)} className={`${inputClass} mt-1`} />
          </div>
        </>
      ) : null}
    </div>
  );
};

export default InventoryRevenueFields;
