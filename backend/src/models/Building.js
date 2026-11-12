const mongoose = require("mongoose");

/*
 * One record per physical building or complex (Database module, 1.4). Linked
 * properties, owners, contacts and brokers are counted from their links, never
 * stored as numbers here.
 */
const buildingSchema = new mongoose.Schema(
  {
    companyId: { type: mongoose.Schema.Types.ObjectId, ref: "Company", required: true, index: true },
    buildingCode: { type: String, required: true, trim: true, maxlength: 20 },
    name: { type: String, required: true, trim: true, maxlength: 200 },
    // Informal / alternate names people use, to help search and duplicate checks.
    aliases: { type: [{ type: String, trim: true, maxlength: 200 }], default: [] },
    address: { type: String, trim: true, maxlength: 500, default: "" },
    locality: { type: String, trim: true, maxlength: 160, default: "" },
    city: { type: String, trim: true, maxlength: 120, default: "" },
    pincode: { type: String, trim: true, maxlength: 12, default: "" },
    buildingType: { type: String, trim: true, maxlength: 40, default: "" },
    totalFloors: { type: Number, min: 0, default: null },
    landmark: { type: String, trim: true, maxlength: 200, default: "" },
    notes: { type: String, trim: true, maxlength: 3000, default: "" },
    assignedTo: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
    archived: { type: Boolean, default: false },
    // Search key: lower-case name, aliases and address words, for duplicate checks.
    searchKey: { type: String, default: "", select: false },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
    updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
  },
  { timestamps: true },
);

buildingSchema.index({ companyId: 1, buildingCode: 1 }, { unique: true });
buildingSchema.index({ companyId: 1, name: 1 });
buildingSchema.index({ companyId: 1, city: 1, locality: 1 });

buildingSchema.pre("save", function setSearchKey() {
  this.searchKey = [this.name, ...(this.aliases || []), this.address, this.locality, this.city]
    .filter(Boolean).join(" ").toLowerCase().replace(/[^a-z0-9 ]+/g, " ").replace(/\s+/g, " ").trim();
});

module.exports = mongoose.model("Building", buildingSchema);
