const mongoose = require("mongoose");

// A WhatsApp message the CRM asked the company's WhatsApp app to send to a lead's customer (an
// enquiry acknowledgement, a site-visit confirmation or reminder, an executive's follow-up). The row is
// written first and handed to the WhatsApp app by the worker, so a moment when that app is down loses
// nothing. `key` is the CRM's own id for the message; the WhatsApp app sends a key only once.
const customerMessageSchema = new mongoose.Schema(
  {
    companyId: { type: mongoose.Schema.Types.ObjectId, ref: "Company", required: true },
    lead: { type: mongoose.Schema.Types.ObjectId, ref: "Lead", required: true },
    key: { type: String, required: true, trim: true },
    purpose: { type: String, required: true, trim: true },
    phone: { type: String, required: true, trim: true },
    variables: { type: mongoose.Schema.Types.Mixed, default: {} },
    sendAt: { type: Date, default: null },
    consent: {
      given: { type: Boolean, default: false },
      at: { type: Date, default: null },
      source: { type: String, default: "", trim: true },
    },
    requestedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },

    // Handing it to the WhatsApp app.
    handedOff: { type: Boolean, default: false },
    attempts: { type: Number, default: 0 },
    nextTryAt: { type: Date, default: () => new Date() },
    lastError: { type: String, default: "" },
    // A cancellation the WhatsApp app has not heard yet.
    cancelPending: { type: Boolean, default: false },

    // As the WhatsApp app reports it.
    status: {
      type: String,
      enum: ["pending", "scheduled", "queued", "sent", "delivered", "read", "failed", "cancelled", "skipped"],
      default: "pending",
    },
    reason: { type: String, default: "" },
    statusAt: { type: Date, default: () => new Date() },
  },
  { timestamps: true },
);

customerMessageSchema.index({ companyId: 1, key: 1 }, { unique: true });
customerMessageSchema.index({ handedOff: 1, nextTryAt: 1 });
customerMessageSchema.index({ cancelPending: 1 });
customerMessageSchema.index({ lead: 1, createdAt: -1 });

module.exports = mongoose.models.CustomerMessage || mongoose.model("CustomerMessage", customerMessageSchema);
