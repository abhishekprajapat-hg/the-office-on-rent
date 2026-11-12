const mongoose = require("mongoose");

/*
 * Enterprise reminders (2.10): one row per alert the reminder sweep found -
 * lease expiry, escalation, lock-in end, notice deadline, money due or
 * overdue, deposit refund due. The key stops the same reminder being sent
 * twice; marking it done stops it coming back. A reminder whose alert has
 * gone (the bill was paid, the date passed) is cleared automatically.
 */
const enterpriseReminderSchema = new mongoose.Schema(
  {
    companyId: { type: mongoose.Schema.Types.ObjectId, ref: "Company", required: true },
    officeId: { type: mongoose.Schema.Types.ObjectId, ref: "EnterpriseOffice", required: true },
    key: { type: String, required: true, maxlength: 300 },
    type: { type: String, required: true, maxlength: 40 },
    severity: { type: String, default: "medium" },
    message: { type: String, default: "", maxlength: 500 },
    officeName: { type: String, default: "" },
    dueDate: { type: Date, default: null },
    amount: { type: Number, default: null },
    status: { type: String, enum: ["OPEN", "DONE", "CLEARED"], default: "OPEN" },
    notifiedUserIds: { type: [mongoose.Schema.Types.ObjectId], default: [] },
    notifiedAt: { type: Date, default: null },
    lastSeenAt: { type: Date, default: Date.now },
    doneBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
    doneByName: { type: String, default: "" },
    doneAt: { type: Date, default: null },
    doneNote: { type: String, default: "", maxlength: 500 },
  },
  { timestamps: true },
);
enterpriseReminderSchema.index({ companyId: 1, key: 1 }, { unique: true });
enterpriseReminderSchema.index({ companyId: 1, status: 1, dueDate: 1 });

module.exports = mongoose.model("EnterpriseReminder", enterpriseReminderSchema);
