const axios = require("axios");
const nodemailer = require("nodemailer");
const logger = require("../config/logger");

const isDisabled = (value) => String(value || "").trim().toLowerCase() === "false";

const normalizePhoneForWhatsapp = (value) => {
  const digits = String(value || "").replace(/\D/g, "");
  if (!digits) return "";
  if (digits.length === 10) return `91${digits}`;
  if (digits.length === 11 && digits.startsWith("0")) return `91${digits.slice(1)}`;
  return digits;
};

const formatDate = (value) =>
  new Intl.DateTimeFormat("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(new Date(value));

const formatMoney = (value) =>
  new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 2,
  }).format(Number(value || 0));

const buildReminderCopy = ({ invoice, balance, daysBefore }) => {
  const clientName = invoice.clientId?.companyName || invoice.clientId?.contactPerson || "Client";
  const dueDate = formatDate(invoice.dueDate);
  const balanceLabel = formatMoney(balance);

  const text = [
    `Dear ${clientName},`,
    "",
    `This is a rent invoice reminder for ${invoice.invoiceNumber}.`,
    `Due date: ${dueDate}`,
    `Balance due: ${balanceLabel}`,
    "",
    `Please clear the payment within ${daysBefore} days to avoid overdue marking.`,
    "",
    "Regards,",
    "Office On Rent",
  ].join("\n");

  const html = `
    <p>Dear ${clientName},</p>
    <p>This is a rent invoice reminder for <strong>${invoice.invoiceNumber}</strong>.</p>
    <p>
      Due date: <strong>${dueDate}</strong><br />
      Balance due: <strong>${balanceLabel}</strong>
    </p>
    <p>Please clear the payment within ${daysBefore} days to avoid overdue marking.</p>
    <p>Regards,<br />Office On Rent</p>
  `;

  return {
    clientName,
    dueDate,
    balanceLabel,
    subject: `Rent invoice reminder: ${invoice.invoiceNumber}`,
    text,
    html,
  };
};

const createMailTransport = () => {
  if (!process.env.SMTP_HOST) return null;
  const port = Number.parseInt(process.env.SMTP_PORT, 10) || 587;
  const user = process.env.SMTP_USER || "";
  const pass = process.env.SMTP_PASS || "";
  return nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port,
    secure: String(process.env.SMTP_SECURE || "").toLowerCase() === "true" || port === 465,
    auth: user || pass ? { user, pass } : undefined,
  });
};

const sendEmailReminder = async ({ invoice, copy }) => {
  if (isDisabled(process.env.EMAIL_REMINDERS_ENABLED)) {
    return { channel: "email", status: "skipped", reason: "disabled" };
  }

  const to = String(invoice.clientId?.email || "").trim();
  if (!to) return { channel: "email", status: "skipped", reason: "missing-email" };

  const transporter = createMailTransport();
  if (!transporter) {
    return { channel: "email", status: "skipped", reason: "smtp-not-configured" };
  }

  const fromAddress = process.env.EMAIL_FROM || process.env.SMTP_USER;
  if (!fromAddress) {
    return { channel: "email", status: "skipped", reason: "missing-from-address" };
  }

  await transporter.sendMail({
    from: process.env.EMAIL_FROM_NAME ? `"${process.env.EMAIL_FROM_NAME}" <${fromAddress}>` : fromAddress,
    to,
    subject: copy.subject,
    text: copy.text,
    html: copy.html,
  });

  return { channel: "email", status: "sent", to };
};

const buildWhatsappPayload = ({ to, invoice, copy, daysBefore }) => {
  const templateName = String(process.env.WHATSAPP_TEMPLATE_NAME || "").trim();
  const languageCode = String(process.env.WHATSAPP_TEMPLATE_LANGUAGE || "en_US").trim();
  if (templateName) {
    return {
      messaging_product: "whatsapp",
      to,
      type: "template",
      template: {
        name: templateName,
        language: { code: languageCode },
        components: [
          {
            type: "body",
            parameters: [
              { type: "text", text: copy.clientName },
              { type: "text", text: invoice.invoiceNumber },
              { type: "text", text: copy.dueDate },
              { type: "text", text: copy.balanceLabel },
              { type: "text", text: String(daysBefore) },
            ],
          },
        ],
      },
    };
  }

  if (String(process.env.WHATSAPP_ALLOW_FREEFORM_TEXT || "").toLowerCase() === "true") {
    return {
      messaging_product: "whatsapp",
      to,
      type: "text",
      text: { preview_url: false, body: copy.text },
    };
  }

  return null;
};

const sendWhatsappReminder = async ({ invoice, copy, daysBefore }) => {
  if (isDisabled(process.env.WHATSAPP_REMINDERS_ENABLED)) {
    return { channel: "whatsapp", status: "skipped", reason: "disabled" };
  }

  const to = normalizePhoneForWhatsapp(invoice.clientId?.phone);
  if (!to) return { channel: "whatsapp", status: "skipped", reason: "missing-phone" };

  const token = process.env.WHATSAPP_ACCESS_TOKEN;
  const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;
  if (!token || !phoneNumberId) {
    return { channel: "whatsapp", status: "skipped", reason: "whatsapp-not-configured" };
  }

  const payload = buildWhatsappPayload({ to, invoice, copy, daysBefore });
  if (!payload) {
    return { channel: "whatsapp", status: "skipped", reason: "template-not-configured" };
  }

  const graphVersion = process.env.WHATSAPP_GRAPH_VERSION || "v20.0";
  await axios.post(`https://graph.facebook.com/${graphVersion}/${phoneNumberId}/messages`, payload, {
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    timeout: 15000,
  });

  return { channel: "whatsapp", status: "sent", to };
};

const settleDelivery = async (label, fn) => {
  try {
    return await fn();
  } catch (error) {
    logger.error({
      channel: label,
      error: error.response?.data || error.message,
      message: "Invoice reminder delivery failed",
    });
    return { channel: label, status: "failed", reason: error.message };
  }
};

const sendInvoiceReminder = async ({ invoice, balance, daysBefore }) => {
  const copy = buildReminderCopy({ invoice, balance, daysBefore });
  const [email, whatsapp] = await Promise.all([
    settleDelivery("email", () => sendEmailReminder({ invoice, copy })),
    settleDelivery("whatsapp", () => sendWhatsappReminder({ invoice, copy, daysBefore })),
  ]);

  return { email, whatsapp };
};

module.exports = {
  sendInvoiceReminder,
  normalizePhoneForWhatsapp,
  buildReminderCopy,
};
