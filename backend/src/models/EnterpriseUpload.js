const mongoose = require("mongoose");

// Ownership is established at upload time, before the file is attached.
const schema = new mongoose.Schema({
  companyId: { type: mongoose.Schema.Types.ObjectId, ref: "Company", required: true, index: true },
  url: { type: String, required: true, unique: true },
  uploadedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
}, { timestamps: true });

module.exports = mongoose.model("EnterpriseUpload", schema);
