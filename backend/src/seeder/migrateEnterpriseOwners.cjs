/** Move legacy Enterprise landlord references into the Enterprise Owner directory.
 * CRM contacts are left untouched; only EnterpriseAgreement references change.
 * Usage: set MONGO_URI, then run `node src/seeder/migrateEnterpriseOwners.cjs` from backend.
 */
require("dotenv").config();
const mongoose = require("mongoose");
const Contact = require("../models/CrmContact");
const Agreement = require("../models/EnterpriseAgreement");
const EnterpriseOwner = require("../models/EnterpriseOwner");
const DbCounter = require("../models/DbCounter");

const main = async () => {
  if (!process.env.MONGO_URI) throw new Error("MONGO_URI is missing");
  await mongoose.connect(process.env.MONGO_URI);
  try {
    const legacy = await Agreement.collection.find({ side: "OWNER", landlordContactId: { $exists: true, $ne: null } }).toArray();
    let migrated = 0;
    for (const agreement of legacy) {
      const contact = await Contact.findOne({ _id: agreement.landlordContactId, companyId: agreement.companyId }).lean();
      if (!contact) continue;
      let owner = await EnterpriseOwner.findOne({ companyId: agreement.companyId, name: contact.name, phone: contact.phone || "" });
      if (!owner) {
        owner = new EnterpriseOwner({
          companyId: agreement.companyId,
          ownerCode: await DbCounter.nextCode(agreement.companyId, "EOW", 4),
          name: contact.name,
          entityName: contact.company || "",
          phone: contact.phone || "",
          email: contact.email || "",
          address: contact.address || "",
          pan: contact.pan || "",
          notes: "Migrated from the legacy Enterprise landlord reference.",
          createdBy: agreement.createdBy || null,
        });
        await owner.save();
      }
      await Agreement.collection.updateOne({ _id: agreement._id }, { $set: { enterpriseOwnerId: owner._id }, $unset: { landlordContactId: "" } });
      migrated += 1;
    }
    process.stdout.write(`Migrated ${migrated} Enterprise owner agreement reference(s). CRM contacts were preserved.\n`);
  } finally { await mongoose.disconnect(); }
};
main().catch((error) => { process.stderr.write(`${error.stack || error.message}\n`); process.exitCode = 1; });
