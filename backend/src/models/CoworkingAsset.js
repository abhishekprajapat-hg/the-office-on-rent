const mongoose = require("mongoose");

const ASSET_STATUSES = ["ACTIVE", "MAINTENANCE", "RETIRED", "LOST"];
const ASSET_CATEGORIES = ["FURNITURE", "EQUIPMENT", "IT", "APPLIANCE", "ACCESS_CONTROL", "SUPPLIES", "OTHER"];

const coworkingAssetSchema = new mongoose.Schema(
  {
    companyId: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
      ref: "Company",
      index: true,
    },
    propertyId: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
      ref: "CoworkingProperty",
      index: true,
    },
    assetCode: {
      type: String,
      required: true,
      trim: true,
    },
    name: {
      type: String,
      required: true,
      trim: true,
      maxlength: 160,
    },
    category: {
      type: String,
      enum: ASSET_CATEGORIES,
      default: "OTHER",
      index: true,
    },
    status: {
      type: String,
      enum: ASSET_STATUSES,
      default: "ACTIVE",
      index: true,
    },
    quantity: {
      type: Number,
      default: 1,
      min: 1,
      max: 100000,
    },
    locationLabel: {
      type: String,
      trim: true,
      default: "",
      maxlength: 160,
    },
    assignedToName: {
      type: String,
      trim: true,
      default: "",
      maxlength: 120,
    },
    vendor: {
      type: String,
      trim: true,
      default: "",
      maxlength: 160,
    },
    purchaseDate: {
      type: Date,
      default: null,
    },
    purchaseValue: {
      type: Number,
      default: 0,
      min: 0,
    },
    warrantyExpiry: {
      type: Date,
      default: null,
    },
    lastServiceDate: {
      type: Date,
      default: null,
    },
    nextServiceDate: {
      type: Date,
      default: null,
    },
    serialNumber: {
      type: String,
      trim: true,
      default: "",
      maxlength: 120,
    },
    notes: {
      type: String,
      trim: true,
      default: "",
      maxlength: 2000,
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    updatedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
  },
  { timestamps: true },
);

coworkingAssetSchema.index({ companyId: 1, assetCode: 1 }, { unique: true });
coworkingAssetSchema.index({ companyId: 1, propertyId: 1, status: 1 });
coworkingAssetSchema.index({ companyId: 1, category: 1, status: 1 });

module.exports = mongoose.model("CoworkingAsset", coworkingAssetSchema);
module.exports.ASSET_STATUSES = ASSET_STATUSES;
module.exports.ASSET_CATEGORIES = ASSET_CATEGORIES;
