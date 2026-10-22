/*
 * Handing over someone's open work when they change segment or role
 * (requirements 16 Oct 2026, section 10): nothing is moved silently, and
 * nothing is left without an owner. The manager sees what is open, picks who
 * takes it, and every moved lead and task keeps a history line.
 */
const mongoose = require("mongoose");
const User = require("../models/User");
const Lead = require("../models/Lead");
const Task = require("../models/Task");
const Contact = require("../models/CrmContact");
const Inventory = require("../models/Inventory");

const CLOSED_LEAD_STATUSES = ["CLOSED", "LOST", "INVALID", "OWNER", "BROKER"];
const HANDOVER_KINDS = Object.freeze(["leads", "tasks", "brokers", "inventory"]);

class HandoverError extends Error {
  constructor(statusCode, message) { super(message); this.statusCode = statusCode; }
}

const openLeadFilter = (companyId, userId) => ({ companyId, assignedTo: userId, status: { $nin: CLOSED_LEAD_STATUSES } });
const openTaskFilter = (companyId, userId) => ({ companyId, assignedTo: userId, status: { $ne: "COMPLETED" } });
const brokerFilter = (companyId, userId) => ({ companyId, relationshipOwnerId: userId });
const inventoryFilter = (companyId, userId) => ({ companyId, teamId: userId, status: { $ne: "Sold" } });

const getOpenRecords = async ({ companyId, userId }) => {
  const [leads, tasks, brokers, inventory, leadSample, taskSample] = await Promise.all([
    Lead.countDocuments(openLeadFilter(companyId, userId)),
    Task.countDocuments(openTaskFilter(companyId, userId)),
    Contact.countDocuments(brokerFilter(companyId, userId)),
    Inventory.countDocuments(inventoryFilter(companyId, userId)),
    Lead.find(openLeadFilter(companyId, userId)).select("name phone status inventoryType").sort({ updatedAt: -1 }).limit(10).lean(),
    Task.find(openTaskFilter(companyId, userId)).select("title status dueDate").sort({ dueDate: 1 }).limit(10).lean(),
  ]);
  return { counts: { leads, tasks, brokers, inventory }, samples: { leads: leadSample, tasks: taskSample } };
};

/* Which lead "role slot" the receiving person fills. */
const leadSlotsFor = (role, toId) => {
  if (role === "FIELD_EXECUTIVE") return { assignedExecutive: null, assignedFieldExecutive: toId };
  if (role === "EXECUTIVE" || role === "INSIDE_EXECUTIVE") return { assignedExecutive: toId, assignedFieldExecutive: null };
  return {};
};

const transferRecords = async ({ companyId, fromId, toId, include = HANDOVER_KINDS, note = "", actor }) => {
  if (!mongoose.isValidObjectId(fromId) || !mongoose.isValidObjectId(toId)) throw new HandoverError(400, "Invalid user");
  if (String(fromId) === String(toId)) throw new HandoverError(400, "Pick someone else to take over");
  const kinds = (Array.isArray(include) ? include : []).filter((k) => HANDOVER_KINDS.includes(k));
  if (!kinds.length) throw new HandoverError(400, "Choose what to hand over");
  const [from, to] = await Promise.all([
    User.findOne({ _id: fromId, companyId }).select("_id name role").lean(),
    User.findOne({ _id: toId, companyId, isActive: true }).select("_id name role roleType").lean(),
  ]);
  if (!from) throw new HandoverError(404, "Employee not found");
  if (!to) throw new HandoverError(400, "The person taking over must be an active employee");
  if (to.role === "CHANNEL_PARTNER") throw new HandoverError(400, "Open work can't be handed to a Channel Partner");

  const reason = String(note || "").trim().slice(0, 300) || `Handover from ${from.name}`;
  const now = new Date();
  const moved = { leads: 0, tasks: 0, brokers: 0, inventory: 0 };

  if (kinds.includes("leads")) {
    const leads = await Lead.find(openLeadFilter(companyId, fromId)).select("_id status").lean();
    // eslint-disable-next-line no-restricted-syntax
    for (const lead of leads) {
      // eslint-disable-next-line no-await-in-loop
      await Lead.updateOne({ _id: lead._id, companyId }, {
        $set: { assignedTo: to._id, ...leadSlotsFor(to.role, to._id) },
        $push: {
          assignmentHistory: {
            action: "HANDOVER", fromUser: from._id, toUser: to._id, reason,
            statusAtTransfer: lead.status || "", createdAt: now, createdBy: actor._id,
          },
        },
      });
    }
    moved.leads = leads.length;
  }
  if (kinds.includes("tasks")) {
    const r = await Task.updateMany(openTaskFilter(companyId, fromId), {
      $set: { assignedTo: to._id },
      $push: { activity: { action: "REASSIGNED", actor: actor._id, detail: `Handed over from ${from.name} to ${to.name}`.slice(0, 300), at: now } },
    });
    moved.tasks = r.modifiedCount || 0;
  }
  if (kinds.includes("brokers")) {
    const r = await Contact.updateMany(brokerFilter(companyId, fromId), { $set: { relationshipOwnerId: to._id } });
    moved.brokers = r.modifiedCount || 0;
  }
  if (kinds.includes("inventory")) {
    const r = await Inventory.updateMany(inventoryFilter(companyId, fromId), { $set: { teamId: to._id } });
    moved.inventory = r.modifiedCount || 0;
  }
  return { from: { _id: from._id, name: from.name }, to: { _id: to._id, name: to.name }, moved };
};

module.exports = { HANDOVER_KINDS, CLOSED_LEAD_STATUSES, HandoverError, getOpenRecords, transferRecords, leadSlotsFor };
