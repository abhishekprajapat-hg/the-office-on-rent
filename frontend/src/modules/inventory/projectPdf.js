/*
 * The two project PDFs (requirements 16 Oct 2026, 5.6), drawn from what the
 * server's export returned - so the client brochure only ever holds what the
 * server judged client-safe, and the internal dossier only reaches Admin and
 * Manager.
 */
const LABELS = (fields = []) => new Map(fields.map((f) => [f.key, f.label]));
const human = (v) => String(v || "").replaceAll("_", " ").toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase());
const money = (v) => (v === null || v === undefined || v === "" ? "" : `Rs. ${Number(v).toLocaleString("en-IN")}`);

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

export const downloadProjectPdf = async (data, catalogue) => {
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
    const labels = LABELS(fields);
    entries.forEach(([key, value]) => row(labels.get(key) || human(key), key.toLowerCase().includes("price") || key === "baseRate" || key === "bookingAmount" ? money(value) || value : value));
  };

  // Cover band
  doc.setFillColor(internal ? 30 : 15, internal ? 41 : 118, internal ? 59 : 110);
  doc.rect(0, 0, W, 110, "F");
  doc.setFont("helvetica", "bold"); doc.setFontSize(20); doc.setTextColor(255, 255, 255);
  doc.text(String(p.projectName || "Project"), M, 48);
  doc.setFont("helvetica", "normal"); doc.setFontSize(11);
  doc.text(`${internal ? "INTERNAL PROJECT DOSSIER" : "PROJECT BROCHURE"} · ${human(category)}${p.projectType ? ` · ${human(p.projectType)}` : ""}`, M, 70);
  doc.text([p.location, p.city, p.state].filter(Boolean).join(", "), M, 90);
  y = 130;

  const cover = (k.media || []).find((m) => m.isCover) || (k.media || [])[0];
  const coverUrl = cover?.url || (p.images || [])[0];
  if (coverUrl) {
    const img = await toDataUrl(coverUrl);
    if (img) { try { doc.addImage(img, "JPEG", M, y, W - M * 2, 220, undefined, "FAST"); y += 232; } catch { /* unreadable image */ } }
  }

  heading("Overview");
  row("Project ID", p.projectId);
  row("Status", human(p.status));
  row("Land area", p.totalLandArea);
  row("Landmark", p.landmark);
  row("Pincode", p.pincode);
  section("About", catalogue?.overview, k.overview);
  section("Specifications", catalogue?.specs?.[category], k.specs);
  if (Object.keys(k.pricing || {}).length || p.startingRate) {
    heading("Pricing");
    if (p.startingRate) row("Starting rate", money(p.startingRate));
    if (p.currentRate) row("Current rate", money(p.currentRate));
    const labels = LABELS(catalogue?.pricing);
    Object.entries(k.pricing || {}).forEach(([key, value]) => row(labels.get(key) || human(key), ["baseRate", "priceFrom", "priceTo", "bookingAmount"].includes(key) ? money(value) : value));
  }
  if (Object.keys(k.legal || {}).length) {
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
  if (amenities.length || otherFacilities) {
    heading("Amenities & infrastructure");
    amenities.forEach((a) => row(a.name, `${human(a.status)}${a.chargeable ? " · chargeable" : ""}${a.notes ? ` · ${a.notes}` : ""}`));
    if (otherFacilities) row("Other facilities", otherFacilities);
  }
  if ((k.contacts || []).length) {
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
    const extra = (k.media || []).filter((m) => m !== cover).slice(0, 4);
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
