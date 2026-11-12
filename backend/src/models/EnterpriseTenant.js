const mongoose = require("mongoose");
const E = require("../constants/enterprise.constants");

/*
 * The business that rents an Enterprise Office (2.3). The legal name matches
 * the agreement; the trade name is separate. Contacts carry a role, so the
 * primary contact, each signing authority, accounts, TDS, facility and notice
 * contacts are distinct people. A signatory's documents are filed against that
 * contact's _id, never as an unlabelled company file.
 */
const tenantContactSchema = new mongoose.Schema({
  role: { type: String, enum: E.TENANT_CONTACT_ROLES, required: true },
  name: { type: String, required: true, trim: true, maxlength: 160 },
  designation: { type: String, trim: true, maxlength: 120, default: "" },
  phone: { type: String, trim: true, maxlength: 20, default: "" },
  email: { type: String, trim: true, maxlength: 200, default: "" },
  notes: { type: String, trim: true, maxlength: 500, default: "" },
  active: { type: Boolean, default: true },
});

const enterpriseTenantSchema = new mongoose.Schema(
  {
    companyId: { type: mongoose.Schema.Types.ObjectId, ref: "Company", required: true, index: true },
    tenantCode: { type: String, required: true, trim: true, maxlength: 20 },
    legalName: { type: String, required: true, trim: true, maxlength: 240 },
    tradeName: { type: String, trim: true, maxlength: 240, default: "" },
    entityType: { type: String, enum: E.ENTITY_TYPES, required: true },
    businessAddress: { type: String, trim: true, maxlength: 500, default: "" },
    registeredAddress: { type: String, trim: true, maxlength: 500, default: "" },
    pan: { type: String, trim: true, uppercase: true, maxlength: 20, default: "" },
    gstin: { type: String, trim: true, uppercase: true, maxlength: 20, default: "" },
    cin: { type: String, trim: true, uppercase: true, maxlength: 30, default: "" },
    llpin: { type: String, trim: true, uppercase: true, maxlength: 20, default: "" },
    tan: { type: String, trim: true, uppercase: true, maxlength: 20, default: "" },
    contacts: { type: [tenantContactSchema], default: [] },
    notes: { type: String, trim: true, maxlength: 3000, default: "" },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
  },
  { timestamps: true },
);
enterpriseTenantSchema.index({ companyId: 1, tenantCode: 1 }, { unique: true });
enterpriseTenantSchema.index({ companyId: 1, legalName: 1 });

module.exports = mongoose.model("EnterpriseTenant", enterpriseTenantSchema);
