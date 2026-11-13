/**
 * Deletes EVERY lead from the LOCAL database, with the lead's own history.
 *
 *   Deleted:   leads, their activity log, diary notes, status requests,
 *              lead chat rooms (and their messages and escalation logs),
 *              and lead delete-approval requests.
 *   Unlinked:  tasks (leadId -> null), owner/broker contacts (leadIds -> []),
 *              inventory requests (relatedLead -> null).
 *   Released:  properties Blocked for a lead go back to Available.
 *   Kept:      sold properties and coworking invoices / payments / expenses
 *              stay as they are (they just no longer find their lead).
 *
 * Safety:
 *   - Refuses to run unless MONGO_URI is a loopback Mongo on a normal port
 *     (never the VPS or the 27018 SSH tunnel). There is no override.
 *   - Shows the counts first and asks you to type DELETE (skip with --yes).
 *   - Exports every collection it touches to
 *     backend/.local-db-backups/<timestamp>-before-delete-leads/ first.
 *
 * Usage: node src/seeder/deleteLocalLeads.cjs        (asks to confirm)
 *        node src/seeder/deleteLocalLeads.cjs --yes  (no prompt)
 */
require("dotenv").config({ quiet: true });

const fs = require("fs");
const path = require("path");
const readline = require("readline");
const mongoose = require("mongoose");

const Lead = require("../models/Lead");
const LeadActivity = require("../models/leadActivity.model");
const LeadDiary = require("../models/leadDiary.model");
const LeadStatusRequest = require("../models/LeadStatusRequest");
const ChatRoom = require("../models/ChatRoom");
const ChatMessage = require("../models/ChatMessage");
const ChatEscalationLog = require("../models/ChatEscalationLog");
const RecordDeleteRequest = require("../models/RecordDeleteRequest");
const Task = require("../models/Task");
const CrmContact = require("../models/CrmContact");
const Inventory = require("../models/Inventory");
const InventoryRequest = require("../models/InventoryRequest");

const parseMongoTarget = (mongoUri) => {
  try {
    const parsed = new URL(String(mongoUri || "").replace(/^mongodb(\+srv)?:\/\//i, "http://"));
    return {
      protocolSrv: /^mongodb\+srv:/i.test(String(mongoUri || "")),
      host: parsed.hostname,
      port: parsed.port || "27017",
      dbName: decodeURIComponent(String(parsed.pathname || "").replace(/^\/+/, "").split("/")[0]),
    };
  } catch {
    return { protocolSrv: false, host: "", port: "", dbName: "" };
  }
};

const assertLocalTarget = () => {
  const target = parseMongoTarget(process.env.MONGO_URI);
  const isLoopback = ["127.0.0.1", "localhost", "::1", "[::1]"].includes(String(target.host || "").toLowerCase());
  /*
   * Loopback alone does not mean "this laptop": on the VPS, production Mongo is
   * also 127.0.0.1:27017, so run there with the server's .env this check passed
   * and --yes would have wiped every production lead. The server's .env sets
   * NODE_ENV=production and a laptop's does not, so that is refused outright.
   */
  if (String(process.env.NODE_ENV || "").trim().toLowerCase() === "production") {
    throw new Error("Refusing to delete: NODE_ENV is production. This script is for a local database only.");
  }
  if (!process.env.MONGO_URI || target.protocolSrv || !isLoopback || target.port === "27018" || !target.dbName) {
    throw new Error(
      `Refusing to delete: MONGO_URI must be a local Mongo (127.0.0.1/localhost, not port 27018) with a database name. Target: ${target.host || "unknown"}:${target.port || "unknown"}/${target.dbName || "unknown"}.`,
    );
  }
  return target;
};

// A copy of what happened, next to the .cmd that runs this script.
const LOG_FILE = path.join(__dirname, "..", "..", "..", "delete-leads.log");
const writeLog = (lines) => {
  try {
    fs.writeFileSync(LOG_FILE, [`${new Date().toISOString()}`, ...lines, ""].join("\n"));
  } catch {
    // The log is a convenience only.
  }
};

const ask = (question) => new Promise((resolve) => {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  rl.question(question, (answer) => {
    rl.close();
    resolve(String(answer || "").trim());
  });
});

const main = async () => {
  const target = assertLocalTarget();
  await mongoose.connect(process.env.MONGO_URI, { serverSelectionTimeoutMS: 8000 });
  const db = mongoose.connection.db;
  console.log(`Connected to LOCAL database "${db.databaseName}" at ${target.host}:${target.port}.`);

  // Native collections: no schema validation or hooks run during the cleanup.
  const c = {
    leads: Lead.collection,
    activities: LeadActivity.collection,
    diary: LeadDiary.collection,
    statusRequests: LeadStatusRequest.collection,
    chatRooms: ChatRoom.collection,
    chatMessages: ChatMessage.collection,
    escalations: ChatEscalationLog.collection,
    deleteRequests: RecordDeleteRequest.collection,
    tasks: Task.collection,
    contacts: CrmContact.collection,
    inventory: Inventory.collection,
    inventoryRequests: InventoryRequest.collection,
  };

  const leadIds = (await c.leads.find({}, { projection: { _id: 1 } }).toArray()).map((row) => row._id);
  if (!leadIds.length) {
    console.log("There are no leads in the local database. Nothing to do.");
    writeLog(["No leads in the local database. Nothing to do."]);
    await mongoose.disconnect();
    return;
  }
  const inLeads = { $in: leadIds };
  const leadRoomIds = (await c.chatRooms.find({ leadId: inLeads }, { projection: { _id: 1 } }).toArray()).map((row) => row._id);

  const filters = {
    activities: { lead: inLeads },
    diary: { lead: inLeads },
    statusRequests: { $or: [{ lead: inLeads }, { leadId: inLeads }] },
    chatRooms: { leadId: inLeads },
    chatMessages: { room: { $in: leadRoomIds } },
    escalations: { $or: [{ leadId: inLeads }, { room: { $in: leadRoomIds } }, { roomId: { $in: leadRoomIds } }] },
    deleteRequests: { actionType: "lead" },
    tasks: { leadId: inLeads },
    contacts: { leadIds: inLeads },
    blockedInventory: { status: "Blocked", reservationLeadId: inLeads },
    inventoryRequests: { relatedLead: inLeads },
    soldInventory: { "saleDetails.leadId": inLeads },
  };

  const counts = {
    leads: leadIds.length,
    activities: await c.activities.countDocuments(filters.activities),
    diary: await c.diary.countDocuments(filters.diary),
    statusRequests: await c.statusRequests.countDocuments(filters.statusRequests),
    chatRooms: leadRoomIds.length,
    chatMessages: await c.chatMessages.countDocuments(filters.chatMessages),
    escalations: await c.escalations.countDocuments(filters.escalations),
    deleteRequests: await c.deleteRequests.countDocuments(filters.deleteRequests),
    tasks: await c.tasks.countDocuments(filters.tasks),
    contacts: await c.contacts.countDocuments(filters.contacts),
    blockedInventory: await c.inventory.countDocuments(filters.blockedInventory),
    inventoryRequests: await c.inventoryRequests.countDocuments(filters.inventoryRequests),
    soldInventory: await c.inventory.countDocuments(filters.soldInventory),
  };

  console.log("");
  console.log("This will permanently change the LOCAL database:");
  console.log(`  DELETE  ${counts.leads} leads`);
  console.log(`  DELETE  ${counts.activities} lead activity entries, ${counts.diary} diary notes, ${counts.statusRequests} status requests`);
  console.log(`  DELETE  ${counts.chatRooms} lead chat rooms (${counts.chatMessages} messages, ${counts.escalations} escalation logs)`);
  console.log(`  DELETE  ${counts.deleteRequests} lead delete-approval requests`);
  console.log(`  UNLINK  ${counts.tasks} tasks, ${counts.contacts} owner/broker contacts, ${counts.inventoryRequests} inventory requests`);
  console.log(`  FREE    ${counts.blockedInventory} properties blocked for a lead (back to Available)`);
  console.log(`  KEEP    ${counts.soldInventory} sold properties and all coworking invoices / payments / expenses`);
  console.log("");

  if (!process.argv.includes("--yes")) {
    const answer = await ask('Type DELETE and press Enter to continue (anything else cancels): ');
    if (answer !== "DELETE") {
      console.log("Cancelled. Nothing was changed.");
      writeLog(["Cancelled at the prompt. Nothing was changed.", `Would have affected: ${JSON.stringify(counts)}`]);
      await mongoose.disconnect();
      return;
    }
  }

  // 1) Backup every collection this script touches.
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const backupDir = path.join(__dirname, "..", "..", ".local-db-backups", `${stamp}-before-delete-leads`);
  fs.mkdirSync(backupDir, { recursive: true });
  const { EJSON } = mongoose.mongo.BSON;
  for (const collection of new Set(Object.values(c))) {
    const docs = await collection.find({}).toArray();
    fs.writeFileSync(path.join(backupDir, `${collection.collectionName}.json`), EJSON.stringify(docs, { relaxed: false }));
  }
  console.log(`Backup written to ${backupDir}`);

  // 2) Unlink and release first, then delete.
  const now = new Date();
  const results = {};
  results.tasksUnlinked = (await c.tasks.updateMany(filters.tasks, { $set: { leadId: null } })).modifiedCount;
  results.contactsUnlinked = (await c.contacts.updateMany(filters.contacts, { $pull: { leadIds: inLeads } })).modifiedCount;
  results.inventoryRequestsUnlinked = (await c.inventoryRequests.updateMany(filters.inventoryRequests, { $set: { relatedLead: null } })).modifiedCount;
  results.propertiesReleased = (await c.inventory.updateMany(filters.blockedInventory, {
    $set: { status: "Available", reservationLeadId: null, reservationReason: "", updatedAt: now },
  })).modifiedCount;

  results.chatMessagesDeleted = (await c.chatMessages.deleteMany(filters.chatMessages)).deletedCount;
  results.escalationsDeleted = (await c.escalations.deleteMany(filters.escalations)).deletedCount;
  results.chatRoomsDeleted = (await c.chatRooms.deleteMany(filters.chatRooms)).deletedCount;
  results.activitiesDeleted = (await c.activities.deleteMany(filters.activities)).deletedCount;
  results.diaryDeleted = (await c.diary.deleteMany(filters.diary)).deletedCount;
  results.statusRequestsDeleted = (await c.statusRequests.deleteMany(filters.statusRequests)).deletedCount;
  results.deleteRequestsDeleted = (await c.deleteRequests.deleteMany(filters.deleteRequests)).deletedCount;
  results.leadsDeleted = (await c.leads.deleteMany({ _id: inLeads })).deletedCount;

  console.log("Done:");
  console.log(JSON.stringify(results, null, 2));
  console.log(`Leads left in the local database: ${await c.leads.countDocuments({})}`);
  console.log(`To undo, restore the JSON files in ${backupDir}`);
  writeLog([
    `Database: ${db.databaseName} at ${target.host}:${target.port}`,
    `Before: ${JSON.stringify(counts)}`,
    `Result: ${JSON.stringify(results)}`,
    `Leads left: ${await c.leads.countDocuments({})}`,
    `Backup: ${backupDir}`,
  ]);

  await mongoose.disconnect();
};

main().catch(async (error) => {
  console.error(`deleteLocalLeads failed: ${error.message}`);
  writeLog([`FAILED: ${error.message}`]);
  try {
    await mongoose.disconnect();
  } catch {
    // ignore
  }
  process.exitCode = 1;
});
