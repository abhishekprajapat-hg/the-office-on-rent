const mongoose = require("mongoose");
const { OWNER_CONTACT_ROLES } = require("../constants/enterprise.constants");

// Each owner keeps its own contacts (PA, property manager, accountant...) so the
// master lease never needs a CRM contact (2.2).
const ownerContactSchema = new mongoose.Schema({
  role: { type: String, enum: OWNER_CONTACT_ROLES, default: "PRIMARY" },
  name: { type: String, required: true, trim: true, maxlength: 200 },
  designation: { type: String, trim: true, maxlength: 120, default: "" },
  phone: { type: String, trim: true, maxlength: 30, default: "" },
  email: { type: String, trim: true, maxlength: 200, default: "" },
  notes: { type: String, trim: true, maxlength: 500, default: "" },
  active: { type: Boolean, default: true },
});

// Owner/landlord records belong to Enterprise Offices and are independent of CRM contacts.
const enterpriseOwnerSchema = new mongoose.Schema({
  companyId: { type: mongoose.Schema.Types.ObjectId, ref: "Company", required: true, index: true },
  ownerCode: { type: String, required: true, trim: true, maxlength: 20 },
  name: { type: String, required: true, trim: true, maxlength: 200 },
  entityName: { type: String, trim: true, maxlength: 240, default: "" },
  phone: { type: String, trim: true, maxlength: 30, default: "" },
  email: { type: String, trim: true, maxlength: 200, default: "" },
  address: { type: String, trim: true, maxlength: 500, default: "" },
  pan: { type: String, trim: true, uppercase: true, maxlength: 20, default: "" },
  gstin: { type: String, trim: true, uppercase: true, maxlength: 20, default: "" },
  notes: { type: String, trim: true, maxlength: 3000, default: "" },
  contacts: { type: [ownerContactSchema], default: [] },
  active: { type: Boolean, default: true },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
}, { timestamps: true });
enterpriseOwnerSchema.index({ companyId: 1, ownerCode: 1 }, { unique: true });
enterpriseOwnerSchema.index({ companyId: 1, name: 1 });
module.exports = mongoose.model("EnterpriseOwner", enterpriseOwnerSchema);
