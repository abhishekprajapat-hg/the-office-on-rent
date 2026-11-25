import React, { useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { Download, FileText, Plus } from "lucide-react";
import { toErrorMessage } from "../../utils/errorMessage";
import { getEnterpriseReport, listEnterpriseAgreements, listEnterpriseDocuments, listEnterpriseOwners, listOffices, listTenants } from "../../services/enterpriseService";
import { Btn, ErrorLine, Input, Panel, Select, Table, Tag } from "../database/dbUi";
import { FNT, MUT } from "../inventory/components/contactGlassTokens";
import { useLoader, fmtDate, money, titleCase } from "../database/dbHelpers";
import { EnterpriseOwnerDialog, OfficeDialog, TenantDialog } from "./enterpriseForms";
import { STATUS_META } from "../coworking/booking/cabinData";

const Head = ({ title, description, action }) => <div className="mb-4 flex flex-wrap items-end gap-2"><div className="min-w-0 flex-1"><h1 className="text-[22px] font-semibold">{title}</h1><p className="text-[13px]" style={MUT}>{description}</p></div>{action}</div>;
const Page = ({ children }) => <div className="custom-scrollbar h-full min-h-0 w-full overflow-y-auto overscroll-contain p-3 sm:p-4 lg:p-5" style={{ color: "var(--g-ink)" }}><div className="flex w-full flex-col gap-4">{children}</div></div>;
const officeLabel = (o) => [o.officeCode, o.name].filter(Boolean).join(" · ");
const officeLink = (office) => office?._id ? <Link to={`/enterprise/offices/${office._id}`} onClick={(e) => e.stopPropagation()} style={{ color: "var(--g-b)" }}>{officeLabel(office)}</Link> : "—";

/*
 * One office as a tile, in the same visual language as the coworking CabinTile:
 * status colour carries the whole card, the name leads, a pill holds the
 * floor and unit, and whoever holds it sits underneath. Offices carry money
 * both ways, so a slim footer shows what is owed each side.
 */
const officeCity = (address = "") => {
  const parts = String(address).split(",").map((x) => x.trim()).filter(Boolean);
  if (parts.length <= 2) return parts[parts.length - 1] || "";
  return parts[parts.length - 2];
};

const OfficeTile = ({ office: o }) => {
  const rented = Boolean(o.tenantId || o.tenantName);
  const vacant = !rented && o.operationalStatus === "READY_VACANT";
  const tone = rented ? STATUS_META.BOOKED : vacant ? STATUS_META.VACANT : ["NEGOTIATION", "TENANT_ONBOARDING", "NOTICE_EXIT"].includes(o.operationalStatus) ? STATUS_META.RESERVED : STATUS_META.BLOCKED;
  const statusLabel = rented ? "Occupied" : vacant ? "Vacant" : titleCase(o.operationalStatus || "");
  const holder = o.tenantName || (vacant ? "Not rented" : statusLabel);
  const place = [o.floor ? `Floor ${o.floor}` : "", o.unit ? `Unit ${o.unit}` : ""].filter(Boolean).join(" · ");
  const area = o.area != null ? `${Number(o.area).toLocaleString("en-IN")} ${titleCase(o.areaBasis || "sq ft")}` : "";
  const pill = place || area || o.officeCode || "Office";
  const city = officeCity(o.address);
  const owe = Number(o.financial?.payableOutstanding || 0);
  const due = Number(o.financial?.receivableOutstanding || 0);
  const alerts = Number(o.alertCount || 0);
  const details = [o.name, o.officeCode, o.address, pill, area, holder, `Owe landlord: ${money(owe)}`, `Tenant owes: ${money(due)}`, `${alerts} alerts`].filter(Boolean).join(" · ");

  return <Link to={`/enterprise/offices/${o._id}`} title={details} aria-label={`${o.name}, ${pill}, ${holder}. Open office details`}
    className={`group/tile relative flex min-h-[156px] w-full min-w-0 flex-col overflow-hidden rounded-xl border outline-none transition duration-200 hover:-translate-y-0.5 hover:shadow-lg hover:shadow-black/20 focus-visible:z-20 focus-visible:ring-2 focus-visible:ring-blue-600 focus-visible:ring-offset-1 dark:focus-visible:ring-offset-slate-950 ${tone.tile}`}>
    <span aria-hidden="true" className="pointer-events-none absolute inset-x-0 top-0 h-[3px]" style={{ background: tone.dot }} />
    <span aria-hidden="true" className="pointer-events-none absolute -right-10 -top-10 h-28 w-28 rounded-full opacity-[0.14] blur-2xl transition group-hover/tile:opacity-25" style={{ background: tone.dot }} />

    <div className="flex items-center justify-between gap-2 px-3 pt-3">
      <span className="inline-flex items-center gap-1.5 text-[10.5px] font-semibold uppercase tracking-[0.08em] opacity-80">
        <i className="h-1.5 w-1.5 rounded-full" style={{ background: tone.dot, boxShadow: `0 0 0 3px ${tone.dot}22` }} />{statusLabel}
      </span>
      {alerts ? <span className="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-amber-400/90 px-1.5 text-[10.5px] font-bold leading-none text-amber-950" title={`${alerts} alerts`}>{alerts}</span> : null}
    </div>

    <div className="flex flex-1 flex-col items-center justify-center gap-1.5 px-3 py-2.5 text-center">
      <span className="w-full truncate text-[18px] font-semibold leading-tight tracking-tight">{o.name}</span>
      <span className="max-w-full truncate rounded-full bg-black/5 px-2.5 py-0.5 text-[11px] font-semibold leading-tight dark:bg-white/10">{pill}</span>
      <span className="w-full truncate text-[11.5px] font-medium leading-tight opacity-80">{holder}{city ? <span className="opacity-70"> · {city}</span> : null}</span>
    </div>

    <div className="grid grid-cols-2 border-t border-black/5 text-[10.5px] leading-tight dark:border-white/10">
      <span className="flex flex-col items-center gap-0.5 px-2 py-2">
        <span className="uppercase tracking-[0.06em] opacity-60">Owe landlord</span>
        <span className="text-[12.5px] font-semibold tabular-nums">{money(owe)}</span>
      </span>
      <span className="flex flex-col items-center gap-0.5 border-l border-black/5 px-2 py-2 dark:border-white/10">
        <span className="uppercase tracking-[0.06em] opacity-60">Tenant owes</span>
        <span className="text-[12.5px] font-semibold tabular-nums">{money(due)}</span>
      </span>
    </div>
  </Link>;
};

export const EnterpriseOfficesPage = () => {
  const navigate = useNavigate();
  const { data, error, reload } = useLoader(listOffices, []);
  const [adding, setAdding] = useState(false);
  const offices = data?.offices || [];
  return <Page>
    <Head title="Enterprise Offices" description="Choose an office to view its tenant, owner lease, documents, and payments." action={<Btn tone="primary" onClick={() => setAdding(true)}><Plus size={14} /> Add office</Btn>} />
    <ErrorLine message={error} />
    <Panel title={`Offices · ${offices.length}`} bodyClass="p-3" action={<div className="flex flex-wrap gap-3 text-[12px]" style={MUT}>
      <span className="inline-flex items-center gap-1.5"><i className="h-2 w-2 rounded-full bg-emerald-500" />{offices.filter((o) => o.tenantId || o.tenantName).length} rented</span>
      <span className="inline-flex items-center gap-1.5"><i className="h-2 w-2 rounded-full bg-rose-500" />{offices.filter((o) => !o.tenantId && !o.tenantName && o.operationalStatus === "READY_VACANT").length} vacant</span>
    </div>}>
      {offices.length ? <div className="grid gap-3" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(230px, 1fr))" }}>
        {offices.map((o) => <OfficeTile key={o._id} office={o} />)}
      </div> : <div className="py-8 text-center text-[13px]" style={FNT}>No offices added yet. Add your first office to get started.</div>}
    </Panel>
    {adding ? <OfficeDialog onClose={() => setAdding(false)} onSaved={(o) => { reload(); navigate(`/enterprise/offices/${o._id}`); }} /> : null}
  </Page>;
};

export const EnterpriseTenantsPage = () => {
  const { data, error, reload } = useLoader(() => Promise.all([listTenants(), listOffices()]), []);
  const [tenant, setTenant] = useState(undefined);
  const tenants = data?.[0]?.tenants || [];
  const offices = data?.[1]?.offices || [];
  const officeByTenant = new Map();
  offices.filter((o) => o.tenantId).forEach((o) => officeByTenant.set(String(o.tenantId), [...(officeByTenant.get(String(o.tenantId)) || []), o]));
  return <Page>
    <Head title="Tenants" description="Tenant entities, their current Enterprise offices, and registration details." action={<Btn tone="primary" onClick={() => setTenant(null)}><Plus size={14} /> Add tenant</Btn>} />
    <ErrorLine message={error} />
    <Panel title={`Tenant directory · ${tenants.length}`}>
      <Table rows={tenants} empty="No tenants added yet" columns={[
        { key: "entity", label: "Tenant", render: (t) => <span><b>{t.tradeName || t.legalName}</b><div className="text-[11.5px]" style={FNT}>{t.tradeName && t.tradeName !== t.legalName ? t.legalName : ""}{t.tenantCode ? ` · ${t.tenantCode}` : ""}</div></span> },
        { key: "type", label: "Entity type", render: (t) => titleCase(t.entityType) },
        { key: "office", label: "Rented office(s)", render: (t) => {
          const linked = officeByTenant.get(String(t._id)) || [];
          return linked.length ? linked.map((o) => <div key={o._id}>{officeLink(o)}</div>) : <span style={MUT}>No current office</span>;
        } },
        { key: "tax", label: "PAN / GSTIN", render: (t) => <span style={FNT}>{[t.pan && `PAN ${t.pan}`, t.gstin && `GSTIN ${t.gstin}`].filter(Boolean).join(" · ") || "—"}</span> },
        { key: "contacts", label: "Contacts", right: true, render: (t) => (t.contacts || []).filter((c) => c.active !== false).length },
        { key: "edit", label: "", render: (t) => <Btn onClick={(e) => { e.stopPropagation(); setTenant(t); }}>Edit</Btn> },
      ]} />
    </Panel>
    {tenant !== undefined ? <TenantDialog tenant={tenant || undefined} onClose={() => setTenant(undefined)} onSaved={() => { setTenant(undefined); reload(); }} /> : null}
  </Page>;
};

export const EnterpriseOwnersPage = () => {
  const { data, error, reload } = useLoader(() => Promise.all([listEnterpriseOwners(), listEnterpriseAgreements()]), []);
  const [owner, setOwner] = useState(undefined);
  const owners = data?.[0]?.owners || [];
  // Offices each Enterprise Owner leases to us, from their owner-side master leases.
  const officesByOwner = new Map();
  (data?.[1]?.agreements || []).filter((a) => a.side === "OWNER" && a.enterpriseOwnerId && a.status !== "TERMINATED").forEach((a) => {
    const key = String(a.enterpriseOwnerId);
    const list = officesByOwner.get(key) || [];
    if (!list.some((x) => String(x._id) === String(a.officeId))) list.push({ _id: a.officeId, name: a.officeName, officeCode: a.officeCode });
    officesByOwner.set(key, list);
  });
  return <Page>
    <Head title="Enterprise Owners" description="Landlords and owner entities for leased Enterprise Offices. Stored separately from CRM owners." action={<Btn tone="primary" onClick={() => setOwner(null)}><Plus size={14} /> Add owner</Btn>} />
    <ErrorLine message={error} />
    <Panel title={`Owner directory · ${owners.length}`}><Table rows={owners} empty="No Enterprise Owners added yet" columns={[
      { key: "owner", label: "Owner", render: (o) => <span><b>{o.name}</b><div className="text-[11.5px]" style={FNT}>{[o.entityName, o.ownerCode].filter(Boolean).join(" · ")}</div></span> },
      { key: "offices", label: "Leased offices", render: (o) => {
        const linked = officesByOwner.get(String(o._id)) || [];
        return linked.length ? linked.map((x) => <div key={x._id}>{officeLink(x)}</div>) : <span style={MUT}>No office yet</span>;
      } },
      { key: "phone", label: "Phone", render: (o) => o.phone || "—" },
      { key: "email", label: "Email", render: (o) => o.email || "—" },
      { key: "contacts", label: "Contacts", render: (o) => {
        const list = (o.contacts || []).filter((c) => c.active !== false);
        return list.length ? <span title={list.map((c) => `${c.name} (${titleCase(c.role)})`).join(", ")}>{list.slice(0, 2).map((c) => c.name).join(", ")}{list.length > 2 ? ` +${list.length - 2}` : ""}</span> : <span style={MUT}>—</span>;
      } },
      { key: "edit", label: "", render: (o) => <Btn onClick={(e) => { e.stopPropagation(); setOwner(o); }}>Edit</Btn> },
    ]} /></Panel>
    {owner !== undefined ? <EnterpriseOwnerDialog owner={owner || undefined} onClose={() => setOwner(undefined)} onSaved={() => { setOwner(undefined); reload(); }} /> : null}
  </Page>;
};

export const EnterpriseAgreementsPage = () => {
  const navigate = useNavigate();
  const { data, error } = useLoader(listEnterpriseAgreements, []);
  const rows = data?.agreements || [];
  return <Page>
    <Head title="Agreements" description="Owner leases and tenant agreements across the office portfolio." />
    <ErrorLine message={error} />
    <Panel title={`Agreements · ${rows.length}`}>
      <Table rows={rows} onRow={(a) => navigate(`/enterprise/offices/${a.officeId}`)} empty="No agreements recorded yet" columns={[
        { key: "code", label: "Agreement", render: (a) => <span><b>{a.agreementCode}</b><div className="text-[11.5px]" style={FNT}>{titleCase(a.side)} side · {titleCase(a.agreementType || "Lease")}</div></span> },
        { key: "office", label: "Office", render: (a) => <span>{a.officeName}<div className="text-[11.5px]" style={FNT}>{a.officeCode} · {a.officeAddress}</div></span> },
        { key: "party", label: "Owner / tenant", render: (a) => a.partyName || "—" },
        { key: "dates", label: "Term", render: (a) => `${fmtDate(a.commencementDate)} – ${fmtDate(a.endDate)}` },
        { key: "rent", label: "Monthly rent", right: true, render: (a) => money(a.baseRent) },
        { key: "status", label: "Status", render: (a) => <Tag tone={a.status === "ACTIVE" ? "ok" : a.status === "NOTICE" ? "warn" : "mute"}>{titleCase(a.status)}</Tag> },
      ]} />
    </Panel>
  </Page>;
};

export const EnterprisePaymentsPage = () => {
  const navigate = useNavigate();
  const [range, setRange] = useState({ from: "", to: "" });
  const { data, error } = useLoader(() => getEnterpriseReport(range), [range.from, range.to]);
  const report = data || {};
  return <Page>
    <Head title="Payments & dues" description="Track what is payable to each owner and collectible from each tenant." />
    <ErrorLine message={error} />
    <div className="flex flex-wrap gap-2"><Input type="date" label="From" value={range.from} onChange={(e) => setRange((r) => ({ ...r, from: e.target.value }))} /><Input type="date" label="To" value={range.to} onChange={(e) => setRange((r) => ({ ...r, to: e.target.value }))} /></div>
    <Panel title={`Open / settled items · ${(report.obligations || []).length}`}>
      <Table rows={report.obligations || []} empty="No due items in this range" columns={[
        { key: "office", label: "Office", render: (o) => o.office },
        { key: "side", label: "Direction", render: (o) => o.side === "PAYABLE" ? "Pay owner" : "Collect from tenant" },
        { key: "item", label: "Item", render: (o) => o.label },
        { key: "due", label: "Due", render: (o) => fmtDate(o.dueDate) },
        { key: "balance", label: "Balance", right: true, render: (o) => money(o.balance) },
        { key: "status", label: "Status", render: (o) => titleCase(o.status) },
      ]} />
    </Panel>
    <Panel title={`Payments · ${(report.transactions || []).length}`}>
      <Table rows={report.transactions || []} onRow={(t) => navigate(`/enterprise/offices/${t.officeId}`)} empty="No payments in this range" columns={[
        { key: "office", label: "Office", render: (t) => t.office },
        { key: "side", label: "Direction", render: (t) => t.direction === "PAYABLE" ? "Paid to owner" : "Received from tenant" },
        { key: "date", label: "Date", render: (t) => fmtDate(t.date) },
        { key: "amount", label: "Cash", right: true, render: (t) => money(t.amount) },
        { key: "tds", label: "TDS", right: true, render: (t) => money(t.tdsAmount) },
        { key: "ref", label: "Reference", render: (t) => t.reference || t.bankReference || "—" },
      ]} />
    </Panel>
  </Page>;
};

export const EnterpriseDocumentsPage = () => {
  const navigate = useNavigate();
  const { data, error } = useLoader(listEnterpriseDocuments, []);
  const documents = data?.documents || [];
  return <Page>
    <Head title="Documents" description="Office, lease, tenant and signatory documents in one searchable portfolio list." action={<FileText size={17} color="var(--g-b)" />} />
    <ErrorLine message={error} />
    <Panel title={`Document register · ${documents.length}`}>
      <Table rows={documents} onRow={(d) => d.office?._id && navigate(`/enterprise/offices/${d.office._id}`)} empty="No Enterprise documents uploaded yet" columns={[
        { key: "document", label: "Document", render: (d) => <span><b>{d.label}</b><div className="text-[11.5px]" style={FNT}>{titleCase(d.category || d.scope)}{d.latestVersion?.name ? ` · ${d.latestVersion.name}` : ""}</div></span> },
        { key: "office", label: "Office", render: (d) => d.office ? `${d.office.officeCode} · ${d.office.name}` : "—" },
        { key: "tenant", label: "Tenant", render: (d) => d.tenant?.tradeName || d.tenant?.legalName || "—" },
        { key: "agreement", label: "Agreement", render: (d) => d.agreement?.agreementCode || "—" },
        { key: "updated", label: "Uploaded", render: (d) => fmtDate(d.latestVersion?.uploadedAt) },
        { key: "status", label: "Status", render: (d) => <Tag tone={d.status === "VERIFIED" ? "ok" : d.status === "REJECTED" ? "bad" : "warn"}>{titleCase(d.status)}</Tag> },
      ]} />
    </Panel>
  </Page>;
};

export const EnterpriseReportsPage = () => {
  const [range, setRange] = useState({ from: "", to: "", officeId: "" });
  const [exportError, setExportError] = useState("");
  const { data, error } = useLoader(() => getEnterpriseReport({ from: range.from || undefined, to: range.to || undefined, officeId: range.officeId || undefined }), [range.from, range.to, range.officeId]);
  const { data: officeData } = useLoader(listOffices, []);
  const officeChoices = (officeData?.offices || []).map((o) => ({ value: o._id, label: officeLabel(o) }));
  const report = data || {};
  const day = (d) => (d ? new Date(d).toISOString().slice(0, 10) : "");
  const sideLabel = (side) => (side === "OWNER" || side === "PAYABLE" ? "Landlord" : "Tenant");
  const exportExcel = async () => {
    try {
      const XLSX = await import("xlsx");
      const workbook = XLSX.utils.book_new();
      const addSheet = (name, rows) => XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(rows.length ? rows : [{ "": "No rows" }]), name);
      addSheet("Offices", report.offices || []);
      addSheet("Dues", (report.obligations || []).map((o) => ({ ...o, dueDate: day(o.dueDate) })));
      addSheet("Payments", (report.transactions || []).map((t) => ({ ...t, date: day(t.date) })));
      addSheet("Maintenance", report.maintenance || []);
      addSheet("Deposits", (report.deposits || []).map((d) => ({ office: d.office, side: sideLabel(d.side), required: d.required, paidOrCollected: d.paidOrCollected, shortfall: d.shortfall, refunded: d.refunded, deducted: d.deducted, adjusted: d.adjusted, outstanding: d.outstanding, expectedSettlement: day(d.expectedSettlementDate) })));
      addSheet("Fit-out", (report.fitOut || []).map((f) => ({ ...f, date: day(f.date) })));
      addSheet("Deadlines", (report.deadlines || []).map((d) => ({ office: d.officeName, type: titleCase(d.type), message: d.message, date: day(d.date) })));
      const officeTag = range.officeId ? `-${(officeChoices.find((o) => o.value === range.officeId)?.label || "office").replace(/[^a-z0-9]+/gi, "-").toLowerCase()}` : "";
      XLSX.writeFile(workbook, `enterprise-offices${officeTag}-${new Date().toISOString().slice(0, 10)}.xlsx`);
      setExportError("");
    } catch (e) { setExportError(toErrorMessage(e, "Could not export report")); }
  };
  const fitOutRows = report.offices || [];
  return <Page>
    <Head title="Enterprise reports" description="Office performance, payments, maintenance, deposits, fit-out and lease deadlines. Filter by office and date range." action={<Btn onClick={exportExcel}><Download size={14} /> Export Excel</Btn>} />
    <ErrorLine message={error || exportError} />
    <div className="flex flex-wrap items-end gap-2">
      <div className="min-w-[220px]"><Select label="Office" value={range.officeId} onChange={(e) => setRange((r) => ({ ...r, officeId: e.target.value }))} placeholder="All offices" options={officeChoices} /></div>
      <Input type="date" label="From" value={range.from} onChange={(e) => setRange((r) => ({ ...r, from: e.target.value }))} />
      <Input type="date" label="To" value={range.to} onChange={(e) => setRange((r) => ({ ...r, to: e.target.value }))} />
      {range.from || range.to || range.officeId ? <Btn onClick={() => setRange({ from: "", to: "", officeId: "" })}>Clear</Btn> : null}
    </div>
    <p className="text-[12px]" style={FNT}>The date range applies to dues, payments and fit-out expenses. Contribution and payback are management estimates (tenant rent − owner rent, pass-through charges excluded), not statutory profit.</p>
    <Panel title={`Office performance · ${(report.offices || []).length}`}>
      <Table rows={report.offices || []} empty="No Enterprise offices" columns={[
        { key: "office", label: "Office", render: (o) => o.office },
        { key: "status", label: "Status", render: (o) => titleCase(o.status) },
        { key: "tenant", label: "Tenant", render: (o) => o.tenant || "Not rented" },
        { key: "ownerRent", label: "Owner rent", right: true, render: (o) => money(o.ownerRent) },
        { key: "tenantRent", label: "Tenant rent", right: true, render: (o) => money(o.tenantRent) },
        { key: "contribution", label: "Contribution (est.)", right: true, render: (o) => money(o.contribution) },
        { key: "payOver", label: "Landlord overdue", right: true, render: (o) => money(o.payableOverdue) },
        { key: "recOver", label: "Tenant overdue", right: true, render: (o) => money(o.receivableOverdue) },
      ]} />
    </Panel>
    <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
      <Panel title={`Maintenance · ${(report.maintenance || []).length}`}>
        <Table rows={report.maintenance || []} empty="No maintenance charges" columns={[
          { key: "office", label: "Office", render: (m) => m.office },
          { key: "ob", label: "Landlord billed", right: true, render: (m) => money(m.ownerBilled) },
          { key: "op", label: "Paid", right: true, render: (m) => money(m.ownerPaid) },
          { key: "tb", label: "Tenant billed", right: true, render: (m) => money(m.tenantBilled) },
          { key: "tc", label: "Collected", right: true, render: (m) => money(m.tenantCollected) },
          { key: "v", label: "Variance", right: true, render: (m) => <span style={{ color: m.variance < 0 ? "var(--g-warn)" : undefined }}>{money(m.variance)}</span> },
        ]} />
      </Panel>
      <Panel title={`Deposits · ${(report.deposits || []).length}`}>
        <Table rows={report.deposits || []} empty="No deposits" columns={[
          { key: "office", label: "Office", render: (d) => d.office },
          { key: "side", label: "Side", render: (d) => <Tag tone={d.side === "OWNER" ? "warn" : "info"}>{d.side === "OWNER" ? "With landlord" : "From tenant"}</Tag> },
          { key: "req", label: "Required", right: true, render: (d) => money(d.required) },
          { key: "paid", label: "Paid / collected", right: true, render: (d) => money(d.paidOrCollected) },
          { key: "back", label: "Refunded / adjusted", right: true, render: (d) => money((d.refunded || 0) + (d.deducted || 0) + (d.adjusted || 0)) },
          { key: "out", label: "Outstanding", right: true, render: (d) => money(d.outstanding) },
          { key: "by", label: "Settle by", render: (d) => (d.expectedSettlementDate ? fmtDate(d.expectedSettlementDate) : "—") },
        ]} />
      </Panel>
    </div>
    <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
      <Panel title="Fit-out budget vs actual">
        <Table rows={fitOutRows} empty="No offices" columns={[
          { key: "office", label: "Office", render: (o) => o.office },
          { key: "b", label: "Budget", right: true, render: (o) => money(o.fitOutBudget) },
          { key: "a", label: "Actual", right: true, render: (o) => <span style={{ color: (o.fitOutActual || 0) > (o.fitOutBudget || 0) && o.fitOutBudget ? "var(--g-warn)" : undefined }}>{money(o.fitOutActual)}</span> },
          { key: "v", label: "Variance", right: true, render: (o) => money((o.fitOutBudget || 0) - (o.fitOutActual || 0)) },
          { key: "p", label: "Payback (est.)", right: true, render: (o) => (o.paybackMonths != null ? `${o.paybackMonths} mo` : "—") },
        ]} />
      </Panel>
      <Panel title={`Fit-out expenses · ${(report.fitOut || []).length}`}>
        <Table rows={report.fitOut || []} empty="No fit-out expenses in this range" columns={[
          { key: "office", label: "Office", render: (f) => f.office },
          { key: "date", label: "Date", render: (f) => fmtDate(f.date) },
          { key: "cat", label: "Category", render: (f) => titleCase(f.category || "") },
          { key: "vendor", label: "Vendor", render: (f) => f.vendor || "—" },
          { key: "amt", label: "Amount", right: true, render: (f) => money(f.amount) },
          { key: "st", label: "Status", render: (f) => titleCase(f.status || "") },
        ]} />
      </Panel>
    </div>
    <Panel title={`Deadlines · ${(report.deadlines || []).length}`}>
      <Table rows={report.deadlines || []} empty="No upcoming lease deadlines" columns={[
        { key: "office", label: "Office", render: (d) => d.officeName },
        { key: "type", label: "Type", render: (d) => titleCase(d.type) },
        { key: "message", label: "Details", render: (d) => d.message },
        { key: "date", label: "Date", render: (d) => fmtDate(d.date) },
      ]} />
    </Panel>
  </Page>;
};

const EnterpriseWorkspacePage = () => {
  const page = useLocation().pathname.split("/")[2] || "overview";
  if (page === "offices") return <EnterpriseOfficesPage />;
  if (page === "tenants") return <EnterpriseTenantsPage />;
  if (page === "owners") return <EnterpriseOwnersPage />;
  if (page === "agreements") return <EnterpriseAgreementsPage />;
  if (page === "payments") return <EnterprisePaymentsPage />;
  if (page === "documents") return <EnterpriseDocumentsPage />;
  if (page === "reports") return <EnterpriseReportsPage />;
  return null;
};

export default EnterpriseWorkspacePage;
