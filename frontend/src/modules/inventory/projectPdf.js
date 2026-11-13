/*
 * The two project PDFs (requirements 16 Oct 2026, 5.6), drawn from what the
 * server's export returned - so the client brochure only ever holds what the
 * server judged client-safe, and the internal dossier only reaches Admin and
 * Manager.
 */
const LABELS = (fields = []) => new Map(fields.map((f) => [f.key, f.label]));
const human = (v) => String(v || "").replaceAll("_", " ").toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase());
const money = (v) => (v === null || v === undefined || v === "" ? "" : `Rs. ${Number(v).toLocaleString("en-IN")}`);
// The PDF fonts have no rupee sign, so these mirror projectStockFormat with "Rs.".
const basisText = (basis, value) => (value === null || value === undefined || value === "" ? "" : basis === "PERCENT" ? `${Number(value)}%` : basis === "PER_SQFT" ? `${money(value)} / sq ft` : money(value));
const dateText = (v) => { if (!v) return ""; const d = new Date(v); return Number.isNaN(d.getTime()) ? "" : d.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" }); };
const sizeText = (r = {}) => [String(r.dimension || "").replace(/\s*[xX*]\s*/, " x "), r.areaSqft ? `${Number(r.areaSqft).toLocaleString("en-IN")} sq ft` : ""].filter(Boolean).join(" · ") || "Size not set";

const toDataUrl = async (url) => {
  try {
    const res = await fetch(url, { credentials: "include" });
    if (!res.ok) return null;
    const blob = await res.blob();
    if (!/^image\/(png|jpe?g)/.test(blob.type)) return null;
    return await new Promise((resolve) => { const r = new FileReader(); r.onload = () => resolve(r.result); r.onerror = () => resolve(null); r.readAsDataURL(blob); });
  } catch {
    return null;
  }
};

// Sections a salesperson can switch on or off for one download (3 Nov 2026, 6).
export const BROCHURE_SECTIONS = [
  ["photos", "Photos"],
  ["overview", "Overview & about"],
  ["sizes", "Sizes & availability"],
  ["specs", "Specifications"],
  ["pricing", "Pricing, PLCs & charges"],
  ["market", "Nearby market rates"],
  ["links", "Map & video links"],
  ["approvals", "Approvals & authority"],
  ["amenities", "Amenities"],
  ["contacts", "Contacts"],
];
export const BRAND_LOGO_URL = "/theofficeonrentlogo.png";

export const downloadProjectPdf = async (data, catalogue, { sections = null } = {}) => {
  // null = every section; otherwise only the keys given.
  const show = (key) => !sections || sections.includes(key);
  const { jsPDF } = await import("jspdf");
  const doc = new jsPDF({ unit: "pt", format: "a4", compress: true });
  const W = doc.internal.pageSize.getWidth();
  const H = doc.internal.pageSize.getHeight();
  const M = 40;
  let y = 0;
  const internal = data.type === "internal";
  const p = data.project || {};
  const k = data.knowledge || {};
  const category = p.projectCategory;

  const footer = () => {
    doc.setFontSize(8); doc.setTextColor(120, 130, 145);
    doc.text(`${internal ? "INTERNAL - not for clients" : "The Office on Rent"} · generated ${new Date(data.generatedAt).toLocaleString("en-IN")}`, M, H - 18);
    doc.text(`Page ${doc.internal.getNumberOfPages()}`, W - M, H - 18, { align: "right" });
  };
  const ensure = (h) => { if (y + h > H - 40) { footer(); doc.addPage(); y = M; } };
  const heading = (t) => { ensure(36); y += 10; doc.setFont("helvetica", "bold"); doc.setFontSize(12); doc.setTextColor(15, 118, 110); doc.text(t.toUpperCase(), M, y); y += 6; doc.setDrawColor(204, 251, 241); doc.line(M, y, W - M, y); y += 14; };
  const row = (label, value) => {
    if (value === undefined || value === null || value === "" || (Array.isArray(value) && !value.length)) return;
    const v = Array.isArray(value) ? value.join(", ") : typeof value === "boolean" ? (value ? "Yes" : "No") : String(value);
    const lines = doc.splitTextToSize(v, W - M * 2 - 170);
    ensure(lines.length * 12 + 6);
    doc.setFont("helvetica", "bold"); doc.setFontSize(9); doc.setTextColor(100, 116, 139); doc.text(label, M, y);
    doc.setFont("helvetica", "normal"); doc.setTextColor(15, 23, 42); doc.text(lines, M + 170, y);
    y += lines.length * 12 + 4;
  };
  const section = (title, fields, values) => {
    const entries = Object.entries(values || {});
    if (!entries.length) return;
    heading(title);
    const fieldRows = new Map((fields || []).map((field) => [field.key, field]));
    entries.forEach(([key, value]) => {
      const field = fieldRows.get(key);
      const shown = field?.kind === "money" ? money(value) : field?.kind === "select" ? human(value) : value;
      row(field?.label || human(key), shown);
    });
  };

  // Cover band
  doc.setFillColor(internal ? 30 : 15, internal ? 41 : 118, internal ? 59 : 110);
  doc.rect(0, 0, W, 110, "F");
  doc.setFont("helvetica", "bold"); doc.setFontSize(20); doc.setTextColor(255, 255, 255);
  doc.text(String(p.projectName || "Project"), M, 48);
  doc.setFont("helvetica", "normal"); doc.setFontSize(11);
  doc.text(`${internal ? "INTERNAL PROJECT DOSSIER" : "PROJECT BROCHURE"} · ${human(category)}${p.projectType ? ` · ${human(p.projectType)}` : ""}`, M, 70);
  doc.text([p.location, p.city, p.state].filter(Boolean).join(", "), M, 90);
  // Company logo on a white card at the right of the cover band.
  const logo = await toDataUrl(BRAND_LOGO_URL);
  if (logo) {
    try {
      const props = doc.getImageProperties(logo);
      const lh = 34;
      const lw = Math.min(150, (props.width / props.height) * lh);
      doc.setFillColor(255, 255, 255);
      doc.roundedRect(W - M - lw - 16, 18, lw + 16, lh + 12, 6, 6, "F");
      doc.addImage(logo, props.fileType || "PNG", W - M - lw - 8, 24, lw, lh, undefined, "FAST");
    } catch { /* logo is optional */ }
  }
  // 3 Nov 2026 (6): when the details, prices and availability were last updated.
  doc.setFontSize(9);
  doc.text(`Last updated ${dateText(p.lastUpdatedAt) || "-"} · availability as of ${dateText(data.generatedAt)}`, W - M, 90, { align: "right" });
  y = 130;

  const cover = (k.media || []).find((m) => m.isCover) || (k.media || [])[0];
  const coverUrl = cover?.url || (p.images || [])[0];
  if (coverUrl && show("photos")) {
    const img = await toDataUrl(coverUrl);
    if (img) { try { doc.addImage(img, "JPEG", M, y, W - M * 2, 220, undefined, "FAST"); y += 232; } catch { /* unreadable image */ } }
  }

  const { videoLinks, mapsUrl, ...aboutValues } = k.overview || {};
  if (show("overview")) {
    heading("Overview");
    row("Project ID", p.projectId);
    row("Status", human(p.status));
    row("Land area", p.totalLandArea);
    row("Landmark", p.landmark);
    row("Pincode", p.pincode);
    section("About", catalogue?.overview, aboutValues);
  }
  // 3 Nov 2026 (4.2 / 6): size-wise counts, never the individual plots.
  const avail = p.availability;
  if (avail?.rows?.length && show("sizes")) {
    heading("Sizes & availability");
    avail.rows.forEach((r) => row(sizeText(r), r.soldOut ? `None left (of ${r.total})` : `${r.available} available of ${r.total}`));
    row("All sizes", `${avail.totals.available} available of ${avail.totals.total}`);
    if (avail.hasManual) {
      ensure(14); doc.setFontSize(8); doc.setTextColor(120, 130, 145);
      doc.text(avail.hasLive ? "Some sizes are aggregate figures; exact plots are confirmed on request." : "Aggregate figures; exact plots are confirmed on request.", M, y); y += 12;
    }
  }
  if (show("specs")) section("Specifications", catalogue?.specs?.[category], k.specs);
  if ((Object.keys(k.pricing || {}).length || p.startingRate) && show("pricing")) {
    heading("Pricing");
    if (p.startingRate) row("Starting rate", `${money(p.startingRate)}${p.startingRateDate ? ` (from ${dateText(p.startingRateDate)})` : ""}`);
    if (p.currentRate) row("Current rate", `${money(p.currentRate)}${p.currentRateDate ? ` (as of ${dateText(p.currentRateDate)})` : ""}`);
    if (p.rentRateBareShell) row("Bare shell rent", `${money(p.rentRateBareShell)} / sq ft / month`);
    if (p.rentRateFurnished) row("Furnished rent", `${money(p.rentRateFurnished)} / sq ft / month`);
    (p.plcOptions || []).forEach((plc) => row(`PLC · ${plc.name}`, [basisText(plc.basis, plc.value), plc.condition].filter(Boolean).join(" · ")));
    if ((p.plcOptions || []).length && p.plcRule && p.plcRule !== "NOT_SET") row("Several PLCs on a plot", p.plcRule === "HIGHEST_ONLY" ? "Only the highest applies" : "All are added together");
    (p.chargeItems || []).forEach((c) => row(c.label, [basisText(c.basis, c.value), c.note].filter(Boolean).join(" · ")));
    if (p.gstPercent !== null && p.gstPercent !== undefined) row("GST", `${p.gstPercent}%`);
    if (p.stampDutyPercent !== null && p.stampDutyPercent !== undefined) row("Stamp duty / registration", `${p.stampDutyPercent}%`);
    const labels = LABELS(catalogue?.pricing);
    Object.entries(k.pricing || {}).forEach(([key, value]) => row(labels.get(key) || human(key), ["baseRate", "priceFrom", "priceTo", "bookingAmount", "guidelineRate"].includes(key) ? money(value) : value));
  }
  if ((p.marketRates || []).length && show("market")) {
    heading("Nearby market rates (reference)");
    p.marketRates.forEach((r) => row(r.place, [r.rate ? `${money(r.rate)} ${r.unit || ""}`.trim() : "", r.asOf ? `as of ${dateText(r.asOf)}` : "", r.source].filter(Boolean).join(" · ")));
  }
  const links = [...(mapsUrl ? [["Location on Google Maps", mapsUrl]] : []), ...(Array.isArray(videoLinks) ? videoLinks : []).map((u, i) => [`Video ${i + 1}`, u])]
    .filter(([, u]) => /^https?:\/\//i.test(String(u)));
  if (links.length && show("links")) {
    heading("Map & videos");
    links.forEach(([label, url]) => {
      ensure(16);
      doc.setFont("helvetica", "bold"); doc.setFontSize(9); doc.setTextColor(100, 116, 139); doc.text(label, M, y);
      doc.setFont("helvetica", "normal"); doc.setTextColor(13, 148, 136);
      doc.textWithLink(doc.splitTextToSize(url, W - M * 2 - 170)[0], M + 170, y, { url });
      y += 16;
    });
  }
  if (Object.keys(k.legal || {}).length && show("approvals")) {
    section(internal ? `Approvals (${human(k.approvalStatus)})` : "Approvals (verified)", catalogue?.legal, k.legal);
  }
  // Amenities with a status first, then anything ticked in the project form
  // that hasn't been given one (shown as available), then free-text extras.
  const withStatus = k.amenityStatuses || [];
  const named = new Set(withStatus.map((a) => String(a.name || "").trim().toLowerCase()));
  const ticked = (k.amenities || p.amenities || [])
    .map((a) => ({ name: human(a), status: "AVAILABLE" }))
    .filter((a) => !named.has(a.name.toLowerCase()));
  const amenities = [...withStatus, ...ticked];
  const otherFacilities = k.otherFacilities || p.otherFacilities || "";
  if ((amenities.length || otherFacilities) && show("amenities")) {
    heading("Amenities & infrastructure");
    amenities.forEach((a) => row(a.name, `${human(a.status)}${a.chargeable ? " · chargeable" : ""}${a.notes ? ` · ${a.notes}` : ""}`));
    if (otherFacilities) row("Other facilities", otherFacilities);
  }
  if ((k.contacts || []).length && show("contacts")) {
    heading(internal ? "Contacts" : "Contact");
    k.contacts.forEach((c) => row(`${c.name}${c.organization ? ` (${c.organization})` : ""}`, [human(c.role), c.phone, c.email, internal && !c.shareable ? "internal only" : ""].filter(Boolean).join(" · ")));
  }
  if (internal) {
    if (p.ownerManagerName || p.brokerManagerName) {
      heading("Managers");
      row("Owner manager", [p.ownerManagerName, p.ownerManagerMobile].filter(Boolean).join(" · "));
      row("Broker manager", [p.brokerManagerName, p.brokerManagerMobile].filter(Boolean).join(" · "));
    }
    if ((k.documents || []).length) {
      heading("Document library");
      k.documents.forEach((d) => row(`${human(d.category)} · v${d.version}`, `${d.name}${d.superseded ? " (superseded)" : ""} · ${new Date(d.uploadedAt).toLocaleDateString("en-IN")} · ${d.uploadedByName || ""}`));
    }
    if (data.inventory) {
      heading("Units in inventory (live)");
      Object.entries(data.inventory.counts || {}).forEach(([status, count]) => row(status, String(count)));
      (data.inventory.units || []).slice(0, 40).forEach((u) => row(u.propertyId || u.unitNumber, [u.towerName, u.unitNumber, u.status, u.price ? money(u.price) : u.rent ? `${money(u.rent)}/mo` : ""].filter(Boolean).join(" · ")));
    }
    if (k.internalNotes) { heading("Internal notes"); row("Notes", k.internalNotes); }
    row("Completeness", k.completeness ? `${k.completeness.percent}%` : "");
    row("Last verified", k.lastVerifiedAt ? new Date(k.lastVerifiedAt).toLocaleDateString("en-IN") : "Never");
  } else {
    // A few more approved visuals for the client.
    const extra = show("photos") ? (k.media || []).filter((m) => m !== cover).slice(0, 4) : [];
    if (extra.length) {
      heading("Gallery");
      for (const m of extra) {
        // eslint-disable-next-line no-await-in-loop
        const img = await toDataUrl(m.url);
        if (!img) continue;
        ensure(190);
        try { doc.addImage(img, "JPEG", M, y, (W - M * 2) / 2 - 6, 160, undefined, "FAST"); } catch { continue; }
        doc.setFontSize(8); doc.setTextColor(100, 116, 139); doc.text(m.caption || human(m.category), M, y + 172);
        y += 186;
      }
    }
    ensure(30);
    doc.setFontSize(8); doc.setTextColor(120, 130, 145);
    doc.text("Prices and availability are indicative and subject to confirmation. Availability is checked live before any booking.", M, y + 10);
  }
  footer();
  doc.save(`${String(p.projectName || "project").replace(/[^a-z0-9]+/gi, "-")}-${internal ? "internal-dossier" : "brochure"}.pdf`);
};
