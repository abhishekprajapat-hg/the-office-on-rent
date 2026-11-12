/*
 * One-off (3 Nov 2026, 4.4): copy every project's owner/manager and broker
 * manager into its parties list (projectContacts). Safe to run again: a
 * contact already there (same phone) is not added twice.
 *   npm run migrate:project-manager-contacts
 */
require("dotenv").config();
const mongoose = require("mongoose");
const Project = require("../models/Project");
const { _test: { syncManagerContacts } } = require("../services/project.service");

(async () => {
  await mongoose.connect(process.env.MONGO_URI);
  let changed = 0;
  const cursor = Project.find({ deletedAt: null, $or: [{ ownerManagerName: { $gt: "" } }, { ownerManagerMobile: { $gt: "" } }, { brokerManagerName: { $gt: "" } }, { brokerManagerMobile: { $gt: "" } }] }).cursor();
  for await (const project of cursor) {
    if (syncManagerContacts(project)) {
      await project.save({ validateModifiedOnly: true });
      changed += 1;
    }
  }
  console.log(`Projects updated: ${changed}`);
  await mongoose.disconnect();
})().catch((error) => { console.error(error); process.exit(1); });
