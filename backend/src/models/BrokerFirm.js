const mongoose = require("mongoose");
const { SEGMENTS } = require("../constants/relationship.constants");

/*
 * A brokerage firm or company (requirements 16 Oct 2026, 6.2). One firm has
 * many broker contacts; brokers point at their firm instead of copying its
 * name into a text field.
 */
const brokerFirmSchema = new mongoose.Schema(
  {
    companyId: { type: mongoose.Schema.Types.ObjectId, ref: "Company", required: true, index: true },
    name: { type: String, required: true, trim: true, maxlength: 200 },
    nameKey: { type: String, required: true },
    phone: { type: String, trim: true, default: "", maxlength: 20 },
    email: { type: String, trim: true, default: "", maxlength: 200 },
    address: { type: String, trim: true, default: "", maxlength: 500 },
    city: { type: String, trim: true, default: "", maxlength: 120 },
    reraNumber: { type: String, trim: true, default: "", maxlength: 80 },
    segments: { type: [{ type: String, enum: SEGMENTS }], default: [] },
    isBrokerageFirm: { type: Boolean, default: true },
    notes: { type: String, trim: true, default: "", maxlength: 3000 },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
  },
  { timestamps: true },
);

brokerFirmSchema.index({ companyId: 1, nameKey: 1 }, { unique: true });

brokerFirmSchema.statics.toNameKey = (name) => String(name || "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

module.exports = mongoose.model("BrokerFirm", brokerFirmSchema);
