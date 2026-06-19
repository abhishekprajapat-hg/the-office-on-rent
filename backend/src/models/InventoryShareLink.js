const mongoose = require("mongoose");
const crypto = require("crypto");

const SHARE_TOKEN_BYTES = 16;
const DEFAULT_EXPIRY_DAYS = 30;

const inventoryShareLinkSchema = new mongoose.Schema(
  {
    token: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },
    inventoryId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Inventory",
      required: true,
      index: true,
    },
    companyId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Company",
      required: true,
      index: true,
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    expiresAt: {
      type: Date,
      required: true,
      index: true,
    },
    isActive: {
      type: Boolean,
      default: true,
      index: true,
    },
  },
  { timestamps: true },
);

inventoryShareLinkSchema.index({ inventoryId: 1, isActive: 1 });
inventoryShareLinkSchema.index({ token: 1, isActive: 1, expiresAt: 1 });

inventoryShareLinkSchema.statics.generateToken = function () {
  return crypto.randomBytes(SHARE_TOKEN_BYTES).toString("hex");
};

inventoryShareLinkSchema.statics.defaultExpiresAt = function () {
  const date = new Date();
  date.setDate(date.getDate() + DEFAULT_EXPIRY_DAYS);
  return date;
};

module.exports = mongoose.model("InventoryShareLink", inventoryShareLinkSchema);
