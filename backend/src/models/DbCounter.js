const mongoose = require("mongoose");

/*
 * Per-company running numbers for the Database and Enterprise modules
 * (CON-00001, BLD-00001, ENT-001 ...). One document per company and key.
 */
const dbCounterSchema = new mongoose.Schema({
  companyId: { type: mongoose.Schema.Types.ObjectId, ref: "Company", required: true },
  key: { type: String, required: true, trim: true, maxlength: 40 },
  seq: { type: Number, default: 0 },
});
dbCounterSchema.index({ companyId: 1, key: 1 }, { unique: true });

const DbCounter = mongoose.model("DbCounter", dbCounterSchema);

/* The next code for a key, e.g. nextCode(companyId, "BLD", 5) -> "BLD-00012". */
DbCounter.nextCode = async (companyId, key, width = 5) => {
  const row = await DbCounter.findOneAndUpdate(
    { companyId, key },
    { $inc: { seq: 1 } },
    { upsert: true, returnDocument: "after" },
  ).lean();
  return `${key}-${String(row.seq).padStart(width, "0")}`;
};

module.exports = DbCounter;
