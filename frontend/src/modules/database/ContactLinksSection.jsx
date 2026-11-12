import React, { useState } from "react";
import { Link } from "react-router-dom";
import { Building, History, Link2, PhoneCall, Plus } from "lucide-react";
import { toErrorMessage } from "../../utils/errorMessage";
import { getContactLinks, updateLink } from "../../services/databaseService";
import { FNT, MUT } from "../inventory/components/contactGlassTokens";
import { Btn, ErrorLine, Modal, Panel, Table, Tag } from "./dbUi";
import { ContactPicker, InteractionList, LinkDialog, LogDialog } from "./dbDialogs";
import { AUTH_TONE, contactHref, fmtDate, roleLabel, STATUS_TONE, titleCase, targetOf, useLoader } from "./dbHelpers";

/*
 * A contact's links (buildings, properties, owners they represent), the
 * people who represent an owner, and the call history (1.3 / 1.6). Used on
 * the Database contact page and inside the Owner / Broker profile.
 */
const ContactLinksSection = ({ contactId, compact = false }) => {
  const { data, error, setError, reload: load } = useLoader(() => getContactLinks(contactId), [contactId]);
  const [dialog, setDialog] = useState("");
  if (!data) return error ? <ErrorLine message={error} /> : null;
  const { contact, relationships = [], representatives = [], interactions = [] } = data;

  const setStatus = async (r, status) => {
    const endedReason = status === "FORMER" ? window.prompt("Why is this link ending? (e.g. changed job, sold the property)", "") : "";
    if (status === "FORMER" && endedReason === null) return;
    try { await updateLink(r._id, { status, endedReason }); load(); } catch (e) { setError(toErrorMessage(e, "Could not update")); }
  };

  const columns = [
    { key: "target", label: "Linked to", render: (r) => { const t = targetOf(r); return <span>{t.to ? <Link to={t.to} className="font-semibold" style={{ color: "var(--g-b)" }}>{t.label}</Link> : t.label} <span className="text-[11.5px]" style={FNT}>{t.kind}{t.sub ? ` · ${t.sub}` : ""}</span></span>; } },
    { key: "role", label: "Role", render: (r) => <Tag tone="a">{roleLabel(r.role)}</Tag> },
    { key: "scope", label: "Scope", render: (r) => <span>{titleCase(r.scope)}{r.scopeNote ? <span style={MUT}> · {r.scopeNote}</span> : null}{r.share ? <span style={MUT}> · {r.share}</span> : null}</span> },
    { key: "status", label: "Status", render: (r) => <span className="inline-flex flex-wrap gap-1"><Tag tone={STATUS_TONE[r.status] || "mute"}>{titleCase(r.status)}</Tag><Tag tone={AUTH_TONE[r.authority] || "mute"}>{titleCase(r.authority)}</Tag></span> },
    { key: "dates", label: "Since", render: (r) => <span style={MUT}>{fmtDate(r.startedAt)}{r.endedAt ? ` – ${fmtDate(r.endedAt)}` : ""}{r.endedReason ? ` · ${r.endedReason}` : ""}</span> },
    { key: "act", label: "", render: (r) => (r.status === "FORMER"
      ? <Btn onClick={() => setStatus(r, "CURRENT")}>Make current</Btn>
      : <span className="inline-flex gap-1">{r.authority !== "VERIFIED" ? <Btn onClick={() => updateLink(r._id, { authority: "VERIFIED" }).then(load).catch((e) => setError(toErrorMessage(e)))}>Verified</Btn> : null}<Btn onClick={() => setStatus(r, "FORMER")}>Mark former</Btn></span>) },
  ];

  return (
    <div className="flex flex-col gap-4">
      <ErrorLine message={error} />
      <Panel title="Linked buildings, properties and owners" icon={Link2} action={(
        <span className="flex flex-wrap gap-1.5">
          <Btn onClick={() => setDialog("building")}><Building size={14} /> Link building</Btn>
          {contact.kind !== "OWNER" ? <Btn onClick={() => setDialog("owner")}><Link2 size={14} /> Represents an owner</Btn> : null}
          <Link to={`/inventory?databaseSource=${contact._id}`}><Btn tone="primary"><Plus size={14} /> Add property from {compact ? "here" : "this contact"}</Btn></Link>
        </span>
      )}>
        <Table columns={columns} rows={relationships} empty="Not linked to anything yet" />
      </Panel>
      {contact.kind === "OWNER" ? (
        <Panel title="Representatives" icon={Link2} action={<Btn onClick={() => setDialog("rep")}><Plus size={14} /> Add representative</Btn>}>
          {representatives.length ? (
            <ul className="flex flex-col">
              {representatives.map((r) => (
                <li key={r._id} className="flex flex-wrap items-center gap-2 py-2 text-[13px]" style={{ borderTop: "1px solid var(--g-div)" }}>
                  <Link to={contactHref(r.contactId)} className="font-semibold" style={{ color: "var(--g-b)" }}>{r.contactId.name}</Link>
                  <Tag tone="a">{roleLabel(r.role)}</Tag><Tag tone={STATUS_TONE[r.status]}>{titleCase(r.status)}</Tag><Tag tone={AUTH_TONE[r.authority]}>{titleCase(r.authority)}</Tag>
                  <span style={MUT}>{r.contactId.phone}</span>
                </li>
              ))}
            </ul>
          ) : <div className="py-3 text-[13px]" style={FNT}>No PA, manager or accountant linked yet</div>}
        </Panel>
      ) : null}
      <Panel title="Calls and history" icon={History} action={<Btn onClick={() => setDialog("log")}><PhoneCall size={14} /> Log call</Btn>}>
        <InteractionList rows={interactions} />
      </Panel>

      {dialog === "building" ? <LinkDialog title="Link to a building" contact={contact} onClose={() => setDialog("")} onSaved={load} /> : null}
      {dialog === "owner" ? <OwnerLink contact={contact} onClose={() => setDialog("")} onSaved={load} /> : null}
      {dialog === "rep" ? <LinkDialog title="Add representative" ownerId={contact._id} onClose={() => setDialog("")} onSaved={load} /> : null}
      {dialog === "log" ? <LogDialog contact={contact} onClose={() => setDialog("")} onSaved={load} /> : null}
    </div>
  );
};

/* Link this contact to an owner they act for. */
const OwnerLink = ({ contact, onClose, onSaved }) => {
  const [owner, setOwner] = useState(null);
  if (owner) return <LinkDialog title={`Represents ${owner.name}`} contact={contact} ownerId={owner._id} onClose={onClose} onSaved={onSaved} />;
  return (
    <Modal title="Which owner?" onClose={onClose}>
      <ContactPicker kind="OWNER" label="Owner" value={owner} onChange={setOwner} />
    </Modal>
  );
};

export default ContactLinksSection;
