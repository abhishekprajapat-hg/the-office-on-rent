import React, { useState } from "react";
import { Link } from "react-router-dom";
import { BadgeCheck, Building, History, PhoneCall, Plus, Repeat, UserPlus, Users } from "lucide-react";
import { toErrorMessage } from "../../utils/errorMessage";
import { addOwner, getInventoryPanel, setInventoryBuilding, setOccupancy } from "../../services/databaseService";
import { FNT, MUT } from "../inventory/components/contactGlassTokens";
import { Btn, ErrorLine, Input, Modal, Panel, Select, Tag } from "./dbUi";
import { AddContactDialog, BuildingPicker, ContactPicker, InteractionList, LinkDialog, LogDialog } from "./dbDialogs";
import { AUTH_TONE, contactHref, fmtDate, isoDate, roleLabel, STATUS_TONE, titleCase, useLoader } from "./dbHelpers";

/*
 * A property's place in the Database (1.5 / 1.6): its building, owners
 * (joint, former, unknown), contacts, where the information came from,
 * availability verification and occupancy - kept apart from the unit's
 * availability status - and its call history.
 */
const InventoryDatabasePanel = ({ inventoryId, canEdit = true }) => {
  const { data, error, reload: load } = useLoader(() => getInventoryPanel(inventoryId), [inventoryId]);
  const [dialog, setDialog] = useState("");
  if (!data) return error ? <ErrorLine message={error} /> : null;
  const { building, owners = [], contacts = [], buildingContacts = [], brokers = [], sources = [], verification = {}, occupancy = {}, interactions = [] } = data;
  const currentOwners = owners.filter((o) => o.status !== "FORMER");
  const formerOwners = owners.filter((o) => o.status === "FORMER");
  const verTone = verification.overdue ? "warn" : ["CONFIRMED_OWNER", "CONFIRMED_REPRESENTATIVE"].includes(verification.state) ? "ok" : verification.state === "DISPUTED" ? "bad" : "mute";

  return (
    <div className="flex flex-col gap-4" style={{ color: "var(--g-ink)" }}>
      <ErrorLine message={error} />
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Panel title="Building" icon={Building} action={canEdit ? <Btn onClick={() => setDialog("building")}>{building ? "Change" : "Set building"}</Btn> : null}>
          {building ? (
            <div className="text-[13px]">
              <Link to={`/database/buildings/${building._id}`} className="text-[14px] font-semibold" style={{ color: "var(--g-b)" }}>{building.name}</Link>
              <div style={MUT}>{[building.buildingCode, building.address, building.locality, building.city].filter(Boolean).join(" · ")}</div>
              {buildingContacts.length ? (
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {buildingContacts.map((r) => <Link key={r._id} to={contactHref(r.contactId)}><Tag tone="a">{roleLabel(r.role)}: {r.contactId.name}</Tag></Link>)}
                </div>
              ) : <div className="mt-1 text-[12.5px]" style={FNT}>No building contacts on file</div>}
            </div>
          ) : <div className="text-[13px]" style={FNT}>Not filed under a building yet</div>}
        </Panel>

        <Panel title="Availability check and occupancy" icon={BadgeCheck} action={canEdit ? <span className="flex gap-1.5"><Btn onClick={() => setDialog("verify")}>Record check</Btn><Btn onClick={() => setDialog("occupancy")}>Occupancy</Btn></span> : null}>
          <div className="flex flex-wrap items-center gap-2 text-[13px]">
            <Tag tone={verTone}>{verification.overdue ? "Check overdue" : titleCase(verification.state || "NEVER")}</Tag>
            <span style={MUT}>Last confirmed {fmtDate(verification.confirmedAt)}{verification.confirmedBy?.name ? ` by ${verification.confirmedBy.name}` : ""}</span>
          </div>
          <div className="mt-1 text-[12.5px]" style={MUT}>Next check due {fmtDate(verification.nextDueAt)}. An overdue check is a flag only; the property's availability stays as it is.</div>
          <div className="mt-2 text-[13px]">Occupancy: <b>{titleCase(occupancy.status || "UNKNOWN")}</b>{occupancy.availableFrom ? ` · free from ${fmtDate(occupancy.availableFrom)}` : ""}</div>
        </Panel>
      </div>

      <Panel title="Owners" icon={Users} action={canEdit ? (
        <span className="flex flex-wrap gap-1.5">
          <Btn onClick={() => setDialog("joint")}><UserPlus size={14} /> {currentOwners.length ? "Add joint owner" : "Add owner"}</Btn>
          {currentOwners.length ? <Btn onClick={() => setDialog("change")}><Repeat size={14} /> Ownership changed</Btn> : null}
        </span>
      ) : null}>
        {currentOwners.length ? currentOwners.map((o) => (
          <div key={o._id} className="flex flex-wrap items-center gap-2 py-1.5 text-[13px]">
            <Link to={contactHref(o.contactId)} className="font-semibold" style={{ color: "var(--g-b)" }}>{o.contactId.name}</Link>
            <span style={MUT}>{o.contactId.phone}</span>
            {o.share ? <Tag tone="info">{o.share}</Tag> : null}
            <Tag tone={AUTH_TONE[o.authority]}>{titleCase(o.authority)}</Tag>
            <span className="text-[12px]" style={FNT}>since {fmtDate(o.startedAt)}</span>
          </div>
        )) : <div className="text-[13px]" style={{ color: "var(--g-warn)" }}>Owner unknown. The property can stay on file; add the owner once someone confirms who it is.</div>}
        {formerOwners.length ? (
          <div className="mt-2">
            <div className="text-[12px] font-semibold" style={MUT}>Former owners</div>
            {formerOwners.map((o) => <div key={o._id} className="py-0.5 text-[12.5px]" style={MUT}><Link to={contactHref(o.contactId)}>{o.contactId.name}</Link> · {fmtDate(o.startedAt)} – {fmtDate(o.endedAt)}{o.endedReason ? ` · ${o.endedReason}` : ""}</div>)}
          </div>
        ) : null}
      </Panel>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Panel title="Contacts for this property" icon={Users} action={canEdit ? <span className="flex gap-1.5"><Btn onClick={() => setDialog("link")}>Link existing</Btn><Btn tone="primary" onClick={() => setDialog("add")}><Plus size={14} /> New</Btn></span> : null}>
          {contacts.length ? contacts.map((r) => (
            <div key={r._id} className="flex flex-wrap items-center gap-2 py-1.5 text-[13px]" style={{ opacity: r.status === "FORMER" ? 0.6 : 1 }}>
              <Link to={contactHref(r.contactId)} className="font-semibold" style={{ color: "var(--g-b)" }}>{r.contactId.name}</Link>
              <Tag tone="a">{roleLabel(r.role)}</Tag><Tag tone={STATUS_TONE[r.status]}>{titleCase(r.status)}</Tag><Tag tone={AUTH_TONE[r.authority]}>{titleCase(r.authority)}</Tag>
            </div>
          )) : <div className="text-[13px]" style={FNT}>No one linked to this property directly</div>}
          {brokers.length ? (
            <div className="mt-2">
              <div className="text-[12px] font-semibold" style={MUT}>Brokers (source links)</div>
              {brokers.map((b) => <div key={b.contact._id} className="py-0.5 text-[12.5px]"><Link to={`/inventory/brokers/${b.contact._id}`}>{b.contact.name}</Link> <span style={MUT}>· {titleCase(b.availability)}</span></div>)}
            </div>
          ) : null}
        </Panel>
        <Panel title="Where the information came from" icon={History}>
          {sources.length ? sources.map((s) => (
            <div key={s._id} className="py-1.5 text-[13px]" style={{ borderTop: "1px solid var(--g-div)" }}>
              <b>{s.contactId?.name || "Unknown"}</b> <span style={MUT}>({roleLabel(s.sourceRole)}) · {fmtDate(s.at)}</span>
              {s.reportedFacts ? <div>{s.reportedFacts}</div> : null}
            </div>
          )) : <div className="text-[13px]" style={FNT}>No source recorded</div>}
        </Panel>
      </div>

      <Panel title="Calls and history" icon={History} action={canEdit ? <Btn onClick={() => setDialog("log")}><PhoneCall size={14} /> Log call</Btn> : null}>
        <InteractionList rows={interactions} />
      </Panel>

      {dialog === "building" ? <BuildingChange inventoryId={inventoryId} current={building} onClose={() => setDialog("")} onSaved={load} /> : null}
      {dialog === "joint" || dialog === "change" ? <OwnerDialog inventoryId={inventoryId} replace={dialog === "change"} onClose={() => setDialog("")} onSaved={load} /> : null}
      {dialog === "link" ? <LinkDialog title="Link a contact to this property" inventoryId={inventoryId} onClose={() => setDialog("")} onSaved={load} /> : null}
      {dialog === "add" ? <AddContactDialog preset={{ inventoryId, building }} onClose={() => setDialog("")} onSaved={load} /> : null}
      {dialog === "log" ? <LogDialog inventoryId={inventoryId} buildingId={building?._id} onClose={() => setDialog("")} onSaved={load} /> : null}
      {dialog === "verify" ? <LogDialog inventoryId={inventoryId} defaultType="VERIFICATION" onClose={() => setDialog("")} onSaved={load} /> : null}
      {dialog === "occupancy" ? <OccupancyDialog inventoryId={inventoryId} current={occupancy} onClose={() => setDialog("")} onSaved={load} /> : null}
    </div>
  );
};

const BuildingChange = ({ inventoryId, current, onClose, onSaved }) => {
  const [b, setB] = useState(current || null);
  const [error, setError] = useState("");
  const save = async () => { try { await setInventoryBuilding(inventoryId, b?._id || null); onSaved(); onClose(); } catch (e) { setError(toErrorMessage(e)); } };
  return (
    <Modal title="Building of this property" onClose={onClose} footer={<><Btn onClick={onClose}>Cancel</Btn><Btn tone="primary" onClick={save}>Save</Btn></>}>
      <BuildingPicker value={b} onChange={setB} />
      <p className="mt-2 text-[12.5px]" style={FNT}>Not on file? Add it from Database → Buildings first, so the building is saved once.</p>
      <ErrorLine message={error} />
    </Modal>
  );
};

/* Add a joint owner, or record a change of ownership (the old owners stay as history). */
const OwnerDialog = ({ inventoryId, replace, onClose, onSaved }) => {
  const [owner, setOwner] = useState(null);
  const [share, setShare] = useState("");
  const [reason, setReason] = useState("");
  const [error, setError] = useState("");
  const save = async () => {
    if (!owner) { setError("Choose the owner from the Owner Database"); return; }
    try { await addOwner(inventoryId, { contactId: owner._id, replace, share, reason }); onSaved(); onClose(); } catch (e) { setError(toErrorMessage(e)); }
  };
  return (
    <Modal title={replace ? "Ownership changed" : "Add owner"} onClose={onClose} footer={<><Btn onClick={onClose}>Cancel</Btn><Btn tone="primary" onClick={save}>Save</Btn></>}>
      <div className="flex flex-col gap-3">
        <ContactPicker kind="OWNER" label={replace ? "New owner" : "Owner"} value={owner} onChange={setOwner} />
        <p className="text-[12px]" style={FNT}>Not in the list? Add them from Database → Add contact with the Owner role first.</p>
        <Input label="Share" hint="(optional, e.g. 50%)" value={share} onChange={(e) => setShare(e.target.value)} />
        <Input label={replace ? "What happened" : "Note"} value={reason} onChange={(e) => setReason(e.target.value)} placeholder={replace ? "e.g. Sold in Oct 2026" : ""} />
        {replace ? <p className="text-[12.5px]" style={MUT}>The current owners are kept as former owners with today's date.</p> : null}
        <ErrorLine message={error} />
      </div>
    </Modal>
  );
};

const OccupancyDialog = ({ inventoryId, current, onClose, onSaved }) => {
  const [status, setStatus] = useState(current?.status || "UNKNOWN");
  const [availableFrom, setFrom] = useState(isoDate(current?.availableFrom));
  const [error, setError] = useState("");
  const save = async () => { try { await setOccupancy(inventoryId, { status, availableFrom }); onSaved(); onClose(); } catch (e) { setError(toErrorMessage(e)); } };
  return (
    <Modal title="Occupancy" onClose={onClose} footer={<><Btn onClick={onClose}>Cancel</Btn><Btn tone="primary" onClick={save}>Save</Btn></>}>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Select label="Occupancy" value={status} onChange={(e) => setStatus(e.target.value)} options={["UNKNOWN", "VACANT", "OCCUPIED"].map((v) => ({ value: v, label: titleCase(v) }))} />
        <Input label="Free from" type="date" value={availableFrom} onChange={(e) => setFrom(e.target.value)} />
      </div>
      <p className="mt-2 text-[12.5px]" style={FNT}>Occupied today does not mean unavailable: a unit can be occupied and still offered for a future date.</p>
      <ErrorLine message={error} />
    </Modal>
  );
};

export default InventoryDatabasePanel;
