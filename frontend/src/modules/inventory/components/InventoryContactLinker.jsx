import React, { useEffect, useState } from "react";
import { Handshake, Loader2, Plus, Search, UserRound, X } from "lucide-react";
import api from "../../../services/api";
import { listContacts } from "../../../services/relationshipService";
import { toErrorMessage } from "../../../utils/errorMessage";
import ContactFormDialog from "./ContactFormDialog";

/*
 * Link this property to an owner and a broker from the Owner / Broker
 * Databases while adding or editing it. Picking fills the form's owner and
 * broker name/number; the server links the records by phone on save.
 */
const ContactColumn = ({ title, icon, rows, loading, selectedPhone, onPick, onAdd, addLabel }) => (
  <div className="min-w-0 rounded-xl border border-slate-200 bg-white">
    <div className="flex items-center justify-between gap-2 border-b border-slate-100 px-3 py-2">
      <span className="inline-flex items-center gap-1.5 text-[12.5px] font-semibold text-slate-700">
        {icon} {title} {loading ? <Loader2 size={12} className="animate-spin text-slate-400" /> : <span className="font-normal text-slate-400">({rows.length})</span>}
      </span>
      <button type="button" onClick={onAdd} className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-[12px] font-semibold text-emerald-700 hover:bg-emerald-50">
        <Plus size={13} /> {addLabel}
      </button>
    </div>
    <ul className="max-h-48 overflow-auto py-1">
      {rows.map((contact) => {
        const selected = selectedPhone && String(contact.phone) === String(selectedPhone).replace(/\D/g, "").slice(-String(contact.phone).length);
        return (
          <li key={contact._id}>
            <button
              type="button"
              onClick={() => onPick(contact)}
              className={`block w-full px-3 py-1.5 text-left text-[13px] hover:bg-emerald-50 ${selected ? "bg-emerald-50" : ""}`}
            >
              <span className="font-semibold text-slate-800">{contact.name}</span>
              <span className="text-slate-500"> · {contact.phone}{contact.firmId?.name || contact.company ? ` · ${contact.firmId?.name || contact.company}` : ""}</span>
            </button>
          </li>
        );
      })}
      {!loading && !rows.length ? <li className="px-3 py-2 text-[12.5px] text-slate-400">No match.</li> : null}
    </ul>
  </div>
);

const SelectedChip = ({ label, name, number, onClear }) => (
  <div className="flex min-w-0 items-center justify-between gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-[13px] text-emerald-900">
    <span className="truncate"><span className="text-emerald-700">{label}:</span> <span className="font-semibold">{name || "Unnamed"}</span>{number ? ` · ${number}` : ""}</span>
    <button type="button" onClick={onClear} aria-label={`Clear ${label.toLowerCase()}`} className="text-emerald-700 hover:text-emerald-900"><X size={14} /></button>
  </div>
);

const InventoryContactLinker = ({ formData, setFormData, sectionClass, headingClass, inputClass }) => {
  const [query, setQuery] = useState("");
  const [owners, setOwners] = useState([]);
  const [brokers, setBrokers] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [dialogKind, setDialogKind] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let active = true;
    const timer = setTimeout(() => {
      setLoading(true);
      const search = query.trim();
      Promise.all([
        listContacts({ kind: "OWNER", search }).catch(() => ({ contacts: [] })),
        listContacts({ kind: "BROKER", search }).catch(() => ({ contacts: [] })),
      ])
        .then(([ownerData, brokerData]) => {
          if (!active) return;
          setOwners(ownerData.contacts || []);
          setBrokers(brokerData.contacts || []);
        })
        .finally(() => { if (active) setLoading(false); });
    }, 250);
    return () => { active = false; clearTimeout(timer); };
  }, [query]);

  const pickOwner = (contact) => setFormData((prev) => ({ ...prev, ownerName: contact.name || "", ownerNumber: contact.phone || "" }));
  const pickBroker = (contact) => setFormData((prev) => ({ ...prev, brokerName: contact.name || "", brokerNumber: contact.phone || "" }));

  const createContact = async (draft) => {
    setSaving(true);
    setError("");
    try {
      const { data } = await api.post("/contacts", { ...draft, kind: dialogKind });
      if (dialogKind === "BROKER") {
        pickBroker(data);
        setBrokers((rows) => [data, ...rows.filter((row) => row._id !== data._id)]);
      } else {
        pickOwner(data);
        setOwners((rows) => [data, ...rows.filter((row) => row._id !== data._id)]);
      }
      setDialogKind("");
    } catch (createError) {
      setError(toErrorMessage(createError, "Could not save the contact"));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className={`${sectionClass} space-y-3`}>
      <div className={headingClass}>Link Owner &amp; Broker</div>
      <div className="relative">
        <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search owners and brokers by name, phone or firm"
          aria-label="Search owners and brokers"
          className={`${inputClass} pl-9`}
        />
      </div>
      {error ? <p role="alert" className="rounded-lg bg-rose-50 p-2 text-[12px] text-rose-700">{error}</p> : null}
      {formData.ownerNumber || formData.ownerName || formData.brokerNumber || formData.brokerName ? (
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          {formData.ownerNumber || formData.ownerName ? (
            <SelectedChip label="Owner" name={formData.ownerName} number={formData.ownerNumber}
              onClear={() => setFormData((prev) => ({ ...prev, ownerName: "", ownerNumber: "" }))} />
          ) : <div />}
          {formData.brokerNumber || formData.brokerName ? (
            <SelectedChip label="Broker" name={formData.brokerName} number={formData.brokerNumber}
              onClear={() => setFormData((prev) => ({ ...prev, brokerName: "", brokerNumber: "" }))} />
          ) : null}
        </div>
      ) : null}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <ContactColumn title="Owners" icon={<UserRound size={14} />} rows={owners} loading={loading} selectedPhone={formData.ownerNumber}
          onPick={pickOwner} onAdd={() => setDialogKind("OWNER")} addLabel="New owner" />
        <ContactColumn title="Brokers" icon={<Handshake size={14} />} rows={brokers} loading={loading} selectedPhone={formData.brokerNumber}
          onPick={pickBroker} onAdd={() => setDialogKind("BROKER")} addLabel="New broker" />
      </div>
      <p className="text-[11.5px] text-slate-500">Picking one fills the owner or broker details below. They are linked to this property when you save.</p>
      {/* React bubbles submit through the portal; keep it out of the inventory form. */}
      {dialogKind ? (
        <div onSubmit={(e) => e.stopPropagation()}>
        <ContactFormDialog
          key={dialogKind}
          open
          kind={dialogKind}
          contact={{ name: query.trim() && !/\d/.test(query) ? query.trim() : "" }}
          saving={saving}
          onClose={() => { if (!saving) setDialogKind(""); }}
          onSubmit={createContact}
        />
        </div>
      ) : null}
    </div>
  );
};

export default InventoryContactLinker;
