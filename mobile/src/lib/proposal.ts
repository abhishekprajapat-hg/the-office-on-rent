import type { Property } from "../api/inventory";

/*
 * The property proposal (web LeadDetailsRebuilt: proposal text, mail link and
 * the jsPDF summary). The client sees a property's ID and listing name only -
 * never the building, tower or unit. Pure; unit tested.
 */

export type ProposalItem = { property: Property; link?: string; images?: string[] };
export type ProposalInput = {
  clientName: string;
  projectInterested?: string;
  city?: string;
  items: ProposalItem[];
  validityDays: string;
  note?: string;
  date?: Date;
};

export const clientLabel = (property: Property) =>
  [property.propertyId, property.projectName]
    .map((value) => String(value || "").trim())
    .filter(Boolean)
    .filter((value, index, all) => all.indexOf(value) === index)
    .join(" - ") || `Property ${property._id.slice(-6).toUpperCase()}`;

export const locationLabel = (property: Property) => {
  const parts = [property.city, property.area, property.pincode].map((value) => String(value || "").trim()).filter(Boolean);
  return parts.length ? parts.join(", ") : String(property.location || "").trim();
};

const listingType = (property: Property) => (property.type === "Rent" ? "RENT" : property.type === "Both" ? "BOTH" : "SALE");

const inr = (value?: number | null) => {
  const amount = Number(value);
  return Number.isFinite(amount) && amount > 0 ? `Rs. ${Math.round(amount).toLocaleString("en-IN")}` : "On request";
};

/* A rental is priced by its monthly rent, not its sale price. */
export const amountText = (property: Property) => {
  const kind = listingType(property);
  const rent = inr(property.rent);
  const monthly = rent === "On request" ? rent : `${rent} / month`;
  if (kind === "RENT") return monthly;
  if (kind === "BOTH") return `${inr(property.price)} | ${monthly}`;
  return inr(property.price);
};

export const amountLabel = (property: Property) => {
  const kind = listingType(property);
  return kind === "RENT" ? "Rent" : kind === "BOTH" ? "Price / Rent" : "Price";
};

const titleCase = (value?: string) =>
  String(value || "")
    .trim()
    .toLowerCase()
    .replace(/_/g, " ")
    .replace(/\b\w/g, (char) => char.toUpperCase());

/* 1-90 days; anything else falls back to the web's 7. */
export const validityOf = (value: string) => {
  const days = Math.round(Number(value));
  return Number.isFinite(days) && days >= 1 && days <= 90 ? days : 7;
};

const dateText = (date: Date) => `${date.getDate()}/${date.getMonth() + 1}/${date.getFullYear()}`;

export const proposalSubject = (items: ProposalItem[]) =>
  `Property Proposal | ${items.length === 1 ? clientLabel(items[0]!.property) : `${items.length} Properties`}`;

export const proposalFileName = (clientName: string) =>
  `proposal-${
    String(clientName || "client")
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "") || "client"
  }.pdf`;

/* The message body for WhatsApp and email (web proposalText). */
export const proposalText = ({ clientName, projectInterested, city, items, validityDays, note, date = new Date() }: ProposalInput) => {
  const lines = [
    "THE OFFICE ON RENT - PROPERTY PROPOSAL",
    `Date: ${dateText(date)}`,
    "",
    `Dear ${clientName.trim() || "Client"},`,
    "Thank you for your interest. Please find your selected property proposal below:",
    `Selected Properties: ${items.length}`,
  ];
  items.forEach(({ property, link }, index) => {
    lines.push(
      "",
      `Property ${index + 1}: ${clientLabel(property)}`,
      `Project: ${String(property.projectName || projectInterested || "-").trim() || "-"}`,
      `Location: ${locationLabel(property) || String(city || "-").trim() || "-"}`,
      `Property Type: ${property.type || "Sale"}`,
      `Inventory Category: ${titleCase(property.inventoryType) || "-"}`,
      `Category: ${String(property.category || "-").trim() || "-"}`,
      `${amountLabel(property)}: ${amountText(property)}`,
    );
    if (link) lines.push(`Details Link: ${link}`);
  });
  lines.push("", `Validity: ${validityOf(validityDays)} day(s)`);
  if (note?.trim()) lines.push(`Special Note: ${note.trim()}`);
  lines.push("", "Regards,", "The Office on Rent");
  return lines.join("\n");
};

export const proposalMailUrl = (email: string | undefined, subject: string, body: string) =>
  `mailto:${encodeURIComponent(String(email || "").trim())}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;

const escape = (value: unknown) =>
  String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");

/* The PDF, as HTML for the phone's print engine; laid out like the web's jsPDF summary (teal band, a card per property, two photos each). */
export const proposalHtml = ({ clientName, projectInterested, city, items, validityDays, note, date = new Date() }: ProposalInput) => {
  const cards = items
    .map(({ property, link, images = [] }, index) => {
      const rows = [
        ["Project", String(property.projectName || projectInterested || "-").trim() || "-"],
        ["Location", locationLabel(property) || String(city || "-").trim() || "-"],
        ["Type", property.type || "Sale"],
        ["Category", String(property.category || "-").trim() || "-"],
      ];
      return `
      <section class="property">
        <h2>Property ${index + 1}: ${escape(clientLabel(property).toUpperCase())}</h2>
        <div class="card">
          <table>${rows.map(([label, value]) => `<tr><th>${escape(label)}:</th><td>${escape(value)}</td></tr>`).join("")}
            <tr><th>${listingType(property) === "RENT" ? "Rent" : "Asking Price"}:</th><td class="price">${escape(amountText(property))}</td></tr>
          </table>
          ${link ? `<a class="link" href="${escape(link)}">CLICK TO VIEW DETAILS ONLINE</a>` : ""}
        </div>
        ${images.length ? `<div class="photos">${images.slice(0, 2).map((url) => `<img src="${escape(url)}" />`).join("")}</div>` : ""}
      </section>`;
    })
    .join("");
  return `<!doctype html><html><head><meta charset="utf-8" /><meta name="viewport" content="width=device-width, initial-scale=1" />
<style>
  @page { size: A4; margin: 0; }
  * { box-sizing: border-box; }
  body { margin: 0; font-family: Helvetica, Arial, sans-serif; color: #0f172a; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  header { background: #0f766e; color: #fff; padding: 32px 36px 24px; }
  header h1 { margin: 0; font-size: 22px; letter-spacing: 0.5px; }
  header p { margin: 8px 0 0; color: #ccfbf1; font-size: 13px; letter-spacing: 1px; }
  .meta { display: flex; gap: 24px; padding: 24px 36px 16px; border-bottom: 1px solid #e2e8f0; margin: 0 0 8px; }
  .meta div { flex: 1; }
  .meta .label { font-size: 10px; font-weight: bold; color: #64748b; letter-spacing: 0.5px; }
  .meta .value { font-size: 14px; margin-top: 4px; }
  .meta .client { font-weight: bold; font-size: 15px; }
  main { padding: 8px 36px 24px; }
  .property { margin-top: 18px; page-break-inside: avoid; }
  .property h2 { font-size: 13px; color: #0f766e; margin: 0 0 8px; }
  .card { background: #f8fafc; border: 1px solid #f1f5f9; padding: 12px 14px; }
  table { border-collapse: collapse; width: 100%; font-size: 11px; }
  th { text-align: left; color: #64748b; width: 110px; padding: 3px 0; vertical-align: top; }
  td { padding: 3px 0; }
  td.price { color: #10b981; font-weight: bold; }
  .link { display: inline-block; margin-top: 8px; font-size: 11px; font-weight: bold; color: #0366d6; }
  .photos { display: flex; gap: 16px; margin-top: 10px; }
  .photos img { width: calc(50% - 8px); height: 170px; object-fit: cover; background: #f8fafc; border: 1px solid #e2e8f0; }
  .note { margin-top: 22px; page-break-inside: avoid; }
  .note h3 { font-size: 11px; margin: 0 0 4px; }
  .note p { font-size: 11px; color: #475569; margin: 0; white-space: pre-wrap; }
  .regards { margin-top: 22px; font-size: 12px; color: #475569; }
  .regards strong { display: block; color: #0f766e; margin-top: 4px; }
  footer { padding: 16px 36px 28px; font-size: 9px; color: #94a3b8; }
</style></head><body>
<header><h1>THE OFFICE ON RENT</h1><p>PROPERTY PROPOSAL SUMMARY</p></header>
<div class="meta">
  <div><div class="label">PREPARED FOR:</div><div class="value client">${escape((clientName.trim() || "Client").toUpperCase())}</div></div>
  <div><div class="label">PROPOSAL DATE:</div><div class="value">${dateText(date)}</div></div>
  <div><div class="label">VALIDITY:</div><div class="value">${validityOf(validityDays)} Days</div></div>
</div>
<main>${cards}
  ${note?.trim() ? `<div class="note"><h3>SPECIAL NOTE:</h3><p>${escape(note.trim())}</p></div>` : ""}
  <div class="regards">Regards,<strong>The Office on Rent</strong></div>
</main>
<footer>Generated by The Office On Rent</footer>
</body></html>`;
};
