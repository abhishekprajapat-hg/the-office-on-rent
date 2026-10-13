/* Lead-detail rules beyond status: completeness, requirement summaries, proposals. Pure; unit tested. */

type Req = {
  inventoryType?: string;
  transactionType?: string;
  furnishingStatus?: string;
  propertySubtype?: string;
  budgetMin?: number | null;
  budgetMax?: number | null;
  areaMin?: number | null;
  areaMax?: number | null;
  residential?: { bhkType?: string };
  commercial?: Record<string, unknown>;
};

type LeadLike = {
  email?: string;
  city?: string;
  preferredLocations?: string[];
  nextFollowUp?: string | null;
  requirements?: Req;
  status?: string;
};

const lakhs = (value: number) => {
  if (value >= 1e7) return `₹${+(value / 1e7).toFixed(2)} Cr`;
  if (value >= 1e5) return `₹${+(value / 1e5).toFixed(2)} L`;
  return `₹${Math.round(value).toLocaleString("en-IN")}`;
};

export const budgetLabel = (min?: number | null, max?: number | null) => {
  if (min && max) return `${lakhs(min)} – ${lakhs(max)}`;
  if (max) return `Up to ${lakhs(max)}`;
  if (min) return `From ${lakhs(min)}`;
  return "";
};

export const areaRangeLabel = (min?: number | null, max?: number | null, unit = "sq ft") => {
  if (min && max) return `${min.toLocaleString("en-IN")} – ${max.toLocaleString("en-IN")} ${unit}`;
  if (max) return `Up to ${max.toLocaleString("en-IN")} ${unit}`;
  if (min) return `From ${min.toLocaleString("en-IN")} ${unit}`;
  return "";
};

/* The web's "missing details" checklist: what an executive should still find out. */
export const missingDetails = (lead: LeadLike) => {
  const missing: string[] = [];
  const req = lead.requirements || {};
  if (!lead.email) missing.push("Email");
  if (!lead.city && !(lead.preferredLocations || []).length) missing.push("Preferred location");
  if (!req.inventoryType) missing.push("Property type");
  if (!req.transactionType) missing.push("Buy / rent / lease");
  if (!req.budgetMin && !req.budgetMax) missing.push("Budget");
  const closed = ["CLOSED", "LOST", "INVALID", "OWNER", "BROKER"].includes(String(lead.status || ""));
  if (!closed && !lead.nextFollowUp) missing.push("Next follow-up");
  return missing;
};

const TYPE_LABEL: Record<string, string> = { COMMERCIAL: "Commercial", RESIDENTIAL: "Residential", COWORKING: "Coworking" };
const DEAL_LABEL: Record<string, string> = { SALE: "to buy", RENT: "to rent", LEASE: "on lease" };

/* One line: "Residential 2BHK to buy · ₹60 L – ₹80 L". */
export const requirementSummary = (req?: Req) => {
  if (!req) return "";
  const kind = [TYPE_LABEL[req.inventoryType || ""], req.residential?.bhkType, req.propertySubtype].filter(Boolean).join(" ");
  const what = [kind, DEAL_LABEL[req.transactionType || ""]].filter(Boolean).join(" ");
  return [what, budgetLabel(req.budgetMin, req.budgetMax)].filter(Boolean).join(" · ");
};

type ProposalProperty = { title: string; price?: string; location?: string; link?: string };

/* The WhatsApp message a proposal sends: greeting, one block per property, sign-off. */
export const proposalMessage = (leadName: string, agentName: string, properties: ProposalProperty[]) => {
  const first = leadName.trim().split(/\s+/)[0] || "there";
  const blocks = properties.map((property, index) =>
    [`${index + 1}. *${property.title}*`, property.price ? `   ${property.price}` : "", property.location ? `   📍 ${property.location}` : "", property.link ? `   ${property.link}` : ""]
      .filter(Boolean)
      .join("\n"),
  );
  return [`Hi ${first},`, "", `Here ${properties.length === 1 ? "is a property" : `are ${properties.length} properties`} that match what you're looking for:`, "", ...blocks, "", "Let me know which you'd like to visit.", `— ${agentName}`].join("\n");
};
