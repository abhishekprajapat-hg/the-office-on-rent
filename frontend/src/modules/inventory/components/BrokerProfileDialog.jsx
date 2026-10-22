import React, { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { Button, Modal } from "../../../components/ui";
import { createFirm, listFirms } from "../../../services/relationshipService";
import {
  CONTACT_METHOD_OPTIONS, CP_STATUS_OPTIONS, CUSTOMER_TYPE_OPTIONS, RELATIONSHIP_OPTIONS, SEGMENT_OPTIONS, TRANSACTION_OPTIONS,
} from "../relationshipOptions";

const inputClass = "h-9 w-full rounded-lg border border-slate-300 bg-white px-3 text-[13px] outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100";
const areaClass = "w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-[13px] outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100";
const toDateInput = (v) => (v ? new Date(v).toISOString().slice(0, 10) : "");

const Field = ({ label, hint, children, wide }) => (
  <label className={`block ${wide ? "sm:col-span-2" : ""}`}>
    <span className="mb-1 block text-[11.5px] font-semibold text-slate-600">{label}</span>
    {children}
    {hint ? <span className="mt-1 block text-[11px] text-slate-400">{hint}</span> : null}
  </label>
);

const Chips = ({ options, value = [], onChange }) => (
  <div className="flex flex-wrap gap-1.5">
    {options.map((o) => {
      const on = value.includes(o.value);
      return (
        <button key={o.value} type="button" aria-pressed={on}
          onClick={() => onChange(on ? value.filter((v) => v !== o.value) : [...value, o.value])}
          className={`rounded-full border px-2.5 py-1 text-[12px] font-semibold ${on ? "border-blue-600 bg-blue-600 text-white" : "border-slate-300 bg-white text-slate-600"}`}>
          {o.label}
        </button>
      );
    })}
  </div>
);

/*
 * Full broker / owner profile editor (requirements 16 Oct 2026, 6.1/17.1).
 * Restricted commercial fields and CP status only show for Admin/Manager.
 */
const BrokerProfileDialog = ({ contact, canSeeRestricted, saving, onClose, onSave }) => {
  const isBroker = contact.kind === "BROKER";
  const [d, setD] = useState(() => ({
    name: contact.name || "", phone: contact.phone || "", alternatePhone: contact.alternatePhone || "", whatsapp: contact.whatsapp || "",
    email: contact.email || "", designation: contact.designation || "", brokerType: contact.brokerType || "",
    firmId: contact.firmId?._id || contact.firmId || "", company: contact.company || "", city: contact.city || "",
    segments: contact.segments || [], areas: (contact.areas || []).join(", "), projects: (contact.projects || []).join(", "),
    propertyTypes: (contact.propertyTypes || []).join(", "), transactionTypes: contact.transactionTypes || [], customerTypes: contact.customerTypes || [],
    marketNotes: contact.marketNotes || "", relationshipStatus: contact.relationshipStatus || "", preferredContact: contact.preferredContact || "",
    lastContactAt: toDateInput(contact.lastContactAt), nextFollowUpAt: toDateInput(contact.nextFollowUpAt), relationshipNotes: contact.relationshipNotes || "",
    cpStatus: contact.cpStatus || "NOT_ONBOARDED", reraNumber: contact.reraNumber || "", verified: Boolean(contact.verified),
    brokerageTerms: contact.brokerageTerms || "", netRateNotes: contact.netRateNotes || "", internalRemarks: contact.internalRemarks || "",
    notes: contact.notes || "", propertyDetails: contact.propertyDetails || "", lastVerifiedAt: toDateInput(contact.lastVerifiedAt),
  }));
  const [firms, setFirms] = useState([]);
  const [newFirm, setNewFirm] = useState("");
  const set = (k) => (e) => setD((v) => ({ ...v, [k]: e?.target ? (e.target.type === "checkbox" ? e.target.checked : e.target.value) : e }));

  useEffect(() => { if (isBroker) listFirms().then((r) => setFirms(r.firms || [])).catch(() => {}); }, [isBroker]);

  const addFirm = async () => {
    const name = newFirm.trim();
    if (!name) return;
    try {
      const { firm } = await createFirm({ name });
      setFirms((f) => [...f, firm].sort((a, b) => a.name.localeCompare(b.name)));
      setD((v) => ({ ...v, firmId: firm._id, company: v.company || firm.name }));
      setNewFirm("");
    } catch (e) {
      const existing = e?.response?.data?.firm;
      if (existing) setD((v) => ({ ...v, firmId: existing._id }));
    }
  };

  const save = () => {
    const patch = { ...d, firmId: d.firmId || null, lastContactAt: d.lastContactAt || null, nextFollowUpAt: d.nextFollowUpAt || null, lastVerifiedAt: d.lastVerifiedAt || null };
    if (!isBroker) {
      ["designation", "brokerType", "firmId", "segments", "areas", "projects", "propertyTypes", "transactionTypes", "customerTypes", "marketNotes", "cpStatus", "reraNumber", "brokerageTerms", "netRateNotes"].forEach((k) => delete patch[k]);
    }
    if (!canSeeRestricted) ["brokerageTerms", "netRateNotes", "internalRemarks", "cpStatus", "verified"].forEach((k) => delete patch[k]);
    onSave(patch);
  };

  return (
    <Modal open size="xl" title={`Edit ${isBroker ? "broker" : "owner"} profile`} description={contact.name} onClose={onClose}
      footer={(
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose} disabled={saving}>Cancel</Button>
          <Button onClick={save} disabled={saving}>{saving ? <Loader2 size={14} className="animate-spin" /> : null} Save profile</Button>
        </div>
      )}>
      <div className="space-y-5">
        <section className="grid gap-3 sm:grid-cols-2">
          <Field label="Name"><input className={inputClass} value={d.name} onChange={set("name")} /></Field>
          <Field label="Primary mobile" hint="Checked for duplicates"><input className={inputClass} value={d.phone} onChange={set("phone")} inputMode="tel" /></Field>
          <Field label="Alternate phone"><input className={inputClass} value={d.alternatePhone} onChange={set("alternatePhone")} inputMode="tel" /></Field>
          <Field label="WhatsApp"><input className={inputClass} value={d.whatsapp} onChange={set("whatsapp")} inputMode="tel" /></Field>
          <Field label="Email"><input className={inputClass} value={d.email} onChange={set("email")} type="email" /></Field>
          <Field label="City"><input className={inputClass} value={d.city} onChange={set("city")} /></Field>
          {isBroker ? (
            <>
              <Field label="Designation"><input className={inputClass} value={d.designation} onChange={set("designation")} /></Field>
              <Field label="Broker type">
                <select className={inputClass} value={d.brokerType} onChange={set("brokerType")}>
                  <option value="">Not set</option><option value="INDEPENDENT">Independent</option><option value="COMPANY">Company broker</option>
                </select>
              </Field>
              <Field label="Firm" hint="Pick a firm or add a new one" wide>
                <div className="flex gap-2">
                  <select className={inputClass} value={d.firmId} onChange={set("firmId")}>
                    <option value="">No firm</option>
                    {firms.map((f) => <option key={f._id} value={f._id}>{f.name}</option>)}
                  </select>
                  <input className={inputClass} placeholder="New firm name" value={newFirm} onChange={(e) => setNewFirm(e.target.value)} />
                  <Button variant="secondary" onClick={addFirm}>Add</Button>
                </div>
              </Field>
              <Field label="RERA registration no."><input className={inputClass} value={d.reraNumber} onChange={set("reraNumber")} /></Field>
            </>
          ) : (
            <>
              <Field label="Company / entity"><input className={inputClass} value={d.company} onChange={set("company")} /></Field>
              <Field label="Last verified"><input type="date" className={inputClass} value={d.lastVerifiedAt} onChange={set("lastVerifiedAt")} /></Field>
              <Field label="Property details" wide><textarea rows={2} className={areaClass} value={d.propertyDetails} onChange={set("propertyDetails")} /></Field>
            </>
          )}
        </section>

        {isBroker ? (
          <section className="space-y-3 border-t border-slate-100 pt-4">
            <p className="text-[13px] font-semibold text-slate-800">Segments &amp; expertise</p>
            <Field label="Segments"><Chips options={SEGMENT_OPTIONS} value={d.segments} onChange={set("segments")} /></Field>
            <Field label="Transaction types"><Chips options={TRANSACTION_OPTIONS} value={d.transactionTypes} onChange={set("transactionTypes")} /></Field>
            <Field label="Customer types"><Chips options={CUSTOMER_TYPE_OPTIONS} value={d.customerTypes} onChange={set("customerTypes")} /></Field>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Areas / localities" hint="Comma separated"><input className={inputClass} value={d.areas} onChange={set("areas")} placeholder="Vijay Nagar, AB Road" /></Field>
              <Field label="Projects" hint="Comma separated"><input className={inputClass} value={d.projects} onChange={set("projects")} placeholder="Omex City, Shalimar Township" /></Field>
              <Field label="Property types" hint="Comma separated"><input className={inputClass} value={d.propertyTypes} onChange={set("propertyTypes")} placeholder="Plots, Offices, Showrooms" /></Field>
              <Field label="Market knowledge"><input className={inputClass} value={d.marketNotes} onChange={set("marketNotes")} /></Field>
            </div>
          </section>
        ) : null}

        <section className="grid gap-3 border-t border-slate-100 pt-4 sm:grid-cols-2">
          <p className="text-[13px] font-semibold text-slate-800 sm:col-span-2">Relationship</p>
          <Field label="Status"><select className={inputClass} value={d.relationshipStatus} onChange={set("relationshipStatus")}>{RELATIONSHIP_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}</select></Field>
          <Field label="Preferred contact"><select className={inputClass} value={d.preferredContact} onChange={set("preferredContact")}>{CONTACT_METHOD_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}</select></Field>
          <Field label="Last contact"><input type="date" className={inputClass} value={d.lastContactAt} onChange={set("lastContactAt")} /></Field>
          <Field label="Next follow-up"><input type="date" className={inputClass} value={d.nextFollowUpAt} onChange={set("nextFollowUpAt")} /></Field>
          <Field label="Relationship notes" wide><textarea rows={2} className={areaClass} value={d.relationshipNotes} onChange={set("relationshipNotes")} /></Field>
          <Field label="General notes" wide><textarea rows={2} className={areaClass} value={d.notes} onChange={set("notes")} /></Field>
        </section>

        {canSeeRestricted ? (
          <section className="grid gap-3 rounded-xl border border-amber-200 bg-amber-50/50 p-4 sm:grid-cols-2">
            <p className="text-[13px] font-semibold text-amber-900 sm:col-span-2">Restricted - Admin &amp; Manager only</p>
            {isBroker ? (
              <>
                <Field label="Channel partner status">
                  <select className={inputClass} value={d.cpStatus} onChange={set("cpStatus")}>{CP_STATUS_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}</select>
                </Field>
                <label className="flex items-center gap-2 self-end pb-2 text-[13px]"><input type="checkbox" checked={d.verified} onChange={set("verified")} /> Details verified</label>
                <Field label="Brokerage / referral terms" wide><textarea rows={2} className={areaClass} value={d.brokerageTerms} onChange={set("brokerageTerms")} /></Field>
                <Field label="Net rates" wide><textarea rows={2} className={areaClass} value={d.netRateNotes} onChange={set("netRateNotes")} /></Field>
              </>
            ) : null}
            <Field label="Internal remarks" wide><textarea rows={2} className={areaClass} value={d.internalRemarks} onChange={set("internalRemarks")} /></Field>
          </section>
        ) : null}
      </div>
    </Modal>
  );
};

export default BrokerProfileDialog;
