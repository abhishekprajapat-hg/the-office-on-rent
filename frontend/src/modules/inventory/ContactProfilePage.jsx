import React, { useCallback, useEffect, useState } from "react";
import { Link, useLocation, useParams } from "react-router-dom";
import {
  AlertTriangle, ArrowLeft, Building2, CheckCircle2, GitMerge, Handshake, Loader2, Pencil, Plus, Search, Users,
} from "lucide-react";
import { Button, Modal } from "../../components/ui";
import { toErrorMessage } from "../../utils/errorMessage";
import { usePermissions } from "../../context/usePermissions";
import api from "../../services/api";
import { addInventorySource, getContactProfile, mergeContact, updateContact } from "../../services/relationshipService";
import BrokerProfileDialog from "./components/BrokerProfileDialog";
import {
  AVAILABILITY_OPTIONS, CP_STATUS_OPTIONS, RELATIONSHIP_OPTIONS, SEGMENT_OPTIONS, TRANSACTION_OPTIONS, formatShortDate, labelOf, toneOf,
} from "./relationshipOptions";

const money = (v) => (v === null || v === undefined || v === "" ? "–" : `₹${Number(v).toLocaleString("en-IN")}`);
const titleCase = (s) => String(s || "").replaceAll("_", " ").toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase());

const Stat = ({ label, value, tone = "text-slate-900" }) => (
  <div className="rounded-xl border border-slate-200 bg-white p-3">
    <p className="text-[12px] text-slate-500">{label}</p>
    <p className={`font-mono text-[20px] font-bold ${tone}`}>{value}</p>
  </div>
);

const Row = ({ label, children }) => (children ? (
  <div className="flex gap-3 py-1.5 text-[13px]"><span className="w-36 shrink-0 text-slate-500">{label}</span><span className="min-w-0 flex-1 text-slate-800">{children}</span></div>
) : null);

/* Link an existing inventory unit to this broker (6.3 / 7.2 quick action). */
const LinkInventoryDialog = ({ broker, onClose, onLinked }) => {
  const [search, setSearch] = useState(broker.projects?.[0] || "");
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);
  const [picked, setPicked] = useState(null);
  const [askingPrice, setAskingPrice] = useState("");
  const [availability, setAvailability] = useState("AVAILABLE");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (search.trim().length < 2) return undefined;
    let active = true;
    const t = setTimeout(() => {
      setLoading(true);
      api.get("/inventory", { params: { search: search.trim(), limit: 20, page: 1 } })
        .then(({ data }) => { if (active) setRows(data.assets || []); })
        .catch(() => { if (active) setRows([]); })
        .finally(() => { if (active) setLoading(false); });
    }, 250);
    return () => { active = false; clearTimeout(t); };
  }, [search]);

  const save = async () => {
    if (!picked) { setError("Choose a unit"); return; }
    setSaving(true); setError("");
    try {
      await addInventorySource(picked._id, { contactId: broker._id, askingPrice: askingPrice || null, availability });
      onLinked();
    } catch (e) { setError(toErrorMessage(e, "Couldn't link")); } finally { setSaving(false); }
  };

  return (
    <Modal open size="lg" title={`Link inventory to ${broker.name}`} description="One unit stays one record; this adds the broker as a source on it." onClose={onClose}
      footer={<div className="flex justify-end gap-2"><Button variant="secondary" onClick={onClose}>Cancel</Button><Button onClick={save} disabled={saving}>{saving ? <Loader2 size={14} className="animate-spin" /> : null} Link</Button></div>}>
      {error ? <p role="alert" className="mb-2 rounded-lg bg-rose-50 p-2 text-[12px] text-rose-700">{error}</p> : null}
      <div className="flex h-9 items-center gap-2 rounded-lg border border-slate-300 px-3">
        <Search size={14} className="text-slate-400" />
        <input data-bare-input className="h-full flex-1 border-0 bg-transparent text-[13px] outline-none" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search project, building, property ID" />
        {loading ? <Loader2 size={14} className="animate-spin text-slate-400" /> : null}
      </div>
      <ul className="mt-2 max-h-64 space-y-1 overflow-auto">
        {(search.trim().length < 2 ? [] : rows).map((r) => (
          <li key={r._id}>
            <button type="button" onClick={() => setPicked(r)} className={`w-full rounded-lg border px-3 py-2 text-left text-[13px] ${picked?._id === r._id ? "border-blue-500 bg-blue-50" : "border-slate-200 hover:bg-slate-50"}`}>
              <span className="font-semibold">{r.propertyId}</span> · {r.title} <span className="text-slate-500">· {r.location} · {r.status}</span>
            </button>
          </li>
        ))}
      </ul>
      <div className="mt-3 grid grid-cols-2 gap-2">
        <input className="h-9 rounded-lg border border-slate-300 px-3 text-[13px]" inputMode="numeric" placeholder="Broker's asking price ₹" value={askingPrice} onChange={(e) => setAskingPrice(e.target.value.replace(/[^\d]/g, ""))} />
        <select className="h-9 rounded-lg border border-slate-300 px-2 text-[13px]" value={availability} onChange={(e) => setAvailability(e.target.value)}>
          {AVAILABILITY_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
      </div>
      <p className="mt-2 text-[12px] text-slate-500">Unit not in the CRM yet? <Link className="font-semibold text-blue-700" to="/inventory">Add it in Inventory</Link>, then link it here.</p>
    </Modal>
  );
};

/* Owner or broker profile (requirements 16 Oct 2026, 6.1-6.4, 17.1-17.2). */
const ContactProfilePage = () => {
  const { contactId } = useParams();
  const { pathname } = useLocation();
  const kind = pathname.includes("/brokers/") ? "BROKER" : "OWNER";
  const back = kind === "BROKER" ? "/inventory/brokers" : "/inventory/owners";
  const { role } = usePermissions();
  const isManagement = ["ADMIN", "MANAGER"].includes(String(role || localStorage.getItem("role") || "").toUpperCase());
  const [data, setData] = useState(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [linking, setLinking] = useState(false);
  const [merging, setMerging] = useState("");

  const load = useCallback(async () => {
    try { setData(await getContactProfile(contactId)); setError(""); } catch (e) { setError(toErrorMessage(e, "Couldn't load this contact")); }
  }, [contactId]);
  useEffect(() => { load(); }, [load]);

  const save = async (patch) => {
    setSaving(true); setError("");
    try { await updateContact(contactId, patch); setEditing(false); setNotice("Profile saved"); await load(); } catch (e) { setError(toErrorMessage(e, "Couldn't save")); } finally { setSaving(false); }
  };

  const merge = async (dup) => {
    if (!window.confirm(`Merge ${dup.name} (${dup.phone}) into this record? Their leads, inventory and history move here and the duplicate is removed.`)) return;
    setMerging(dup._id); setError("");
    try {
      const out = await mergeContact(contactId, dup._id);
      setNotice(`Merged. Moved ${out.moved.ownedInventory + out.moved.sourcedInventory} inventory link(s) and ${out.moved.referredLeads + out.moved.brokerLeads} lead link(s).`);
      await load();
    } catch (e) { setError(toErrorMessage(e, "Merge failed")); } finally { setMerging(""); }
  };

  if (!data) {
    return (
      <div className="p-6">
        {error ? <p role="alert" className="rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">{error}</p>
          : <p className="flex items-center gap-2 text-sm text-slate-500"><Loader2 size={15} className="animate-spin" /> Loading…</p>}
        <Link to={back} className="mt-3 inline-flex items-center gap-1 text-sm text-slate-500 hover:underline"><ArrowLeft size={14} /> Back</Link>
      </div>
    );
  }

  const c = data.contact;
  const cp = CP_STATUS_OPTIONS.find((o) => o.value === c.cpStatus);

  return (
    <div className="ui-page-shell custom-scrollbar h-full space-y-4 overflow-auto p-6">
      <Link to={back} className="inline-flex items-center gap-1 text-sm text-slate-500 hover:underline"><ArrowLeft size={14} /> {kind === "BROKER" ? "Broker Database" : "Owner Database"}</Link>
      {error ? <p role="alert" className="rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">{error}</p> : null}
      {notice ? <p role="status" className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-700">{notice}</p> : null}

      <div className="flex flex-wrap items-start gap-3">
        <div className="min-w-0 flex-1">
          <h1 className="text-2xl font-semibold text-slate-900">{c.name}</h1>
          <p className="text-sm text-slate-600">{c.phone}{c.alternatePhone ? ` · ${c.alternatePhone}` : ""}{c.email ? ` · ${c.email}` : ""}</p>
          <div className="mt-2 flex flex-wrap gap-1.5 text-[12px] font-semibold">
            {kind === "BROKER" ? <span className={`rounded-full px-2.5 py-1 ${cp?.tone}`}>{cp?.label}</span> : null}
            {c.verified ? <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2.5 py-1 text-emerald-700"><CheckCircle2 size={12} /> Verified</span> : <span className="rounded-full bg-slate-100 px-2.5 py-1 text-slate-500">Not verified</span>}
            {c.source === "RERA_IMPORT" ? <span className="rounded-full bg-violet-50 px-2.5 py-1 text-violet-700">From RERA list</span> : null}
            {(c.segments || []).map((s) => <span key={s} className="rounded-full bg-blue-50 px-2.5 py-1 text-blue-700">{labelOf(SEGMENT_OPTIONS, s)}</span>)}
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          {kind === "BROKER" ? <Button variant="secondary" leftIcon={Plus} onClick={() => setLinking(true)}>Link inventory</Button> : null}
          <Button leftIcon={Pencil} onClick={() => setEditing(true)}>Edit profile</Button>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Linked inventory" value={data.stats.inventoryCount} />
        <Stat label="Needs re-verification" value={data.stats.staleInventory} tone={data.stats.staleInventory ? "text-amber-600" : "text-slate-900"} />
        {kind === "BROKER" ? <Stat label="Referred leads" value={data.stats.referredLeads} /> : null}
        {kind === "BROKER" ? <Stat label="Closed deals" value={data.stats.closedDeals} tone="text-emerald-700" /> : null}
        {kind === "BROKER" && data.stats.brokerageReceived !== undefined ? <Stat label="Brokerage received" value={money(data.stats.brokerageReceived)} /> : null}
      </div>

      {data.possibleDuplicates?.length ? (
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-4">
          <p className="flex items-center gap-2 text-[13px] font-semibold text-amber-900"><AlertTriangle size={15} /> Possible duplicates (same phone or RERA number)</p>
          <ul className="mt-2 space-y-1.5">
            {data.possibleDuplicates.map((d) => (
              <li key={d._id} className="flex flex-wrap items-center gap-2 text-[13px]">
                <Link className="font-semibold text-blue-700 hover:underline" to={`${back}/${d._id}`}>{d.name}</Link>
                <span className="text-slate-600">{d.phone}{d.reraNumber ? ` · RERA ${d.reraNumber}` : ""}</span>
                {isManagement ? (
                  <Button size="sm" variant="secondary" leftIcon={GitMerge} disabled={merging === d._id} onClick={() => merge(d)}>{merging === d._id ? "Merging…" : "Merge into this record"}</Button>
                ) : <span className="text-[12px] text-slate-500">Ask a manager to merge</span>}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-2">
        <section className="rounded-xl border border-slate-200 bg-white p-4">
          <h2 className="mb-2 flex items-center gap-2 text-[14px] font-semibold"><Users size={15} className="text-blue-600" /> Details</h2>
          <Row label="Firm">{c.firmId?.name || c.company}</Row>
          <Row label="Designation">{c.designation}</Row>
          <Row label="Broker type">{titleCase(c.brokerType)}</Row>
          <Row label="City">{c.city}</Row>
          <Row label="WhatsApp">{c.whatsapp}</Row>
          <Row label="RERA no.">{c.reraNumber}</Row>
          <Row label="Areas">{(c.areas || []).join(", ")}</Row>
          <Row label="Projects">{(c.projects || []).join(", ")}</Row>
          <Row label="Property types">{(c.propertyTypes || []).join(", ")}</Row>
          <Row label="Transactions">{(c.transactionTypes || []).map((t) => labelOf(TRANSACTION_OPTIONS, t)).join(", ")}</Row>
          <Row label="Customer types">{(c.customerTypes || []).map(titleCase).join(", ")}</Row>
          <Row label="Market knowledge">{c.marketNotes}</Row>
          <Row label="Property details">{c.propertyDetails}</Row>
          <Row label="Notes">{c.notes}</Row>
          <Row label="Last verified">{formatShortDate(c.lastVerifiedAt)}</Row>
        </section>
        <section className="rounded-xl border border-slate-200 bg-white p-4">
          <h2 className="mb-2 flex items-center gap-2 text-[14px] font-semibold"><Handshake size={15} className="text-blue-600" /> Relationship</h2>
          <Row label="Status">{labelOf(RELATIONSHIP_OPTIONS, c.relationshipStatus)}</Row>
          <Row label="Owner (internal)">{c.relationshipOwnerId?.name}</Row>
          <Row label="Last contact">{formatShortDate(c.lastContactAt)}</Row>
          <Row label="Next follow-up">{formatShortDate(c.nextFollowUpAt)}</Row>
          <Row label="Preferred contact">{titleCase(c.preferredContact)}</Row>
          <Row label="Notes">{c.relationshipNotes}</Row>
          {kind === "BROKER" ? <Row label="CP onboarded">{formatShortDate(c.cpOnboardedAt)}</Row> : null}
          {data.canSeeRestricted ? (
            <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50/60 p-3">
              <p className="mb-1 text-[12px] font-semibold text-amber-900">Restricted</p>
              <Row label="Brokerage terms">{c.brokerageTerms || "–"}</Row>
              <Row label="Net rates">{c.netRateNotes || "–"}</Row>
              <Row label="Internal remarks">{c.internalRemarks || "–"}</Row>
            </div>
          ) : null}
        </section>
      </div>

      <section className="rounded-xl border border-slate-200 bg-white">
        <h2 className="flex items-center gap-2 border-b border-slate-100 px-4 py-3 text-[14px] font-semibold"><Building2 size={15} className="text-blue-600" /> Inventory ({data.inventory.length})</h2>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px] text-[13px]">
            <thead><tr className="bg-slate-50 text-left text-[11.5px] font-semibold uppercase tracking-wide text-slate-500">
              <th className="px-4 py-2">Property</th><th className="px-4 py-2">Location</th><th className="px-4 py-2">Link</th><th className="px-4 py-2">Unit status</th>
              {kind === "BROKER" ? <th className="px-4 py-2">Broker quote</th> : null}<th className="px-4 py-2">Last confirmed</th>
            </tr></thead>
            <tbody>
              {data.inventory.map((r) => (
                <tr key={r._id} className="border-t border-slate-100">
                  <td className="px-4 py-2.5"><Link to={`/inventory/${r._id}`} className="font-semibold text-blue-700 hover:underline">{r.propertyId || r.projectName}</Link><span className="block text-[12px] text-slate-500">{[r.projectName, r.buildingName, r.unitNumber].filter(Boolean).join(" · ")}</span></td>
                  <td className="px-4 py-2.5 text-slate-600">{[r.area, r.city].filter(Boolean).join(", ") || r.location}</td>
                  <td className="px-4 py-2.5">{r.relation === "OWNER" ? "Owner" : r.relation === "SOURCE_BROKER" ? "Source broker" : "Linked"}</td>
                  <td className="px-4 py-2.5">{r.status}</td>
                  {kind === "BROKER" ? (
                    <td className="px-4 py-2.5">
                      {r.myLink ? (<><span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${toneOf(AVAILABILITY_OPTIONS, r.myLink.availability)}`}>{labelOf(AVAILABILITY_OPTIONS, r.myLink.availability)}</span> <span className="text-slate-600">{money(r.myLink.askingPrice ?? r.myLink.askingRent)}</span>{r.myLink.netRate !== undefined && r.myLink.netRate !== null ? <span className="block text-[11.5px] text-amber-700">Net {money(r.myLink.netRate)}</span> : null}</>) : "–"}
                    </td>
                  ) : null}
                  <td className="px-4 py-2.5">{r.stale ? <span className="inline-flex items-center gap-1 text-amber-700"><AlertTriangle size={12} /> Re-verify</span> : formatShortDate(r.myLink?.confirmedAt || r.lastConfirmedAt)}</td>
                </tr>
              ))}
              {!data.inventory.length ? <tr><td colSpan={6} className="px-4 py-6 text-center text-slate-500">No inventory linked yet.</td></tr> : null}
            </tbody>
          </table>
        </div>
      </section>

      {kind === "BROKER" ? (
        <section className="rounded-xl border border-slate-200 bg-white">
          <h2 className="border-b border-slate-100 px-4 py-3 text-[14px] font-semibold">Referred leads ({data.referredLeads.length})</h2>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[560px] text-[13px]">
              <thead><tr className="bg-slate-50 text-left text-[11.5px] font-semibold uppercase tracking-wide text-slate-500"><th className="px-4 py-2">Lead</th><th className="px-4 py-2">Status</th><th className="px-4 py-2">Assigned to</th><th className="px-4 py-2">Created</th>{data.canSeeRestricted ? <th className="px-4 py-2">Brokerage</th> : null}</tr></thead>
              <tbody>
                {data.referredLeads.map((l) => (
                  <tr key={l._id} className="border-t border-slate-100">
                    <td className="px-4 py-2.5"><Link to={`/leads/${l._id}`} className="font-semibold text-blue-700 hover:underline">{l.name}</Link><span className="block text-[12px] text-slate-500">{l.phone}</span></td>
                    <td className="px-4 py-2.5">{titleCase(l.status)}</td>
                    <td className="px-4 py-2.5">{l.assignedTo?.name || "–"}</td>
                    <td className="px-4 py-2.5">{formatShortDate(l.createdAt)}</td>
                    {data.canSeeRestricted ? <td className="px-4 py-2.5">{money(l.brokerageReceived)}</td> : null}
                  </tr>
                ))}
                {!data.referredLeads.length ? <tr><td colSpan={5} className="px-4 py-6 text-center text-slate-500">No referred leads yet. Pick this broker under "Referred by broker" when adding a lead.</td></tr> : null}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}

      {editing ? <BrokerProfileDialog contact={c} canSeeRestricted={data.canSeeRestricted} saving={saving} onClose={() => setEditing(false)} onSave={save} /> : null}
      {linking ? <LinkInventoryDialog broker={c} onClose={() => setLinking(false)} onLinked={() => { setLinking(false); setNotice("Inventory linked"); load(); }} /> : null}
    </div>
  );
};

export default ContactProfilePage;
