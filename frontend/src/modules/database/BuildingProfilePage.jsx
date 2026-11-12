import React, { useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, Building, GitMerge, History, Pencil, PhoneCall, Plus, Users } from "lucide-react";
import { toErrorMessage } from "../../utils/errorMessage";
import { usePermissions } from "../../context/usePermissions";
import { getBuilding, mergeBuilding, updateBuilding, updateLink } from "../../services/databaseService";
import { FNT, MUT } from "../inventory/components/contactGlassTokens";
import { Btn, ErrorLine, Input, Modal, Panel, Select, Stat, Table, Tag, TextArea } from "./dbUi";
import { AddContactDialog, BuildingPicker, InteractionList, LinkDialog, LogDialog } from "./dbDialogs";
import { AUTH_TONE, contactHref, fmtDate, options, roleLabel, STATUS_TONE, titleCase, useDatabaseMeta, useLoader } from "./dbHelpers";

/* Building profile (1.4): details, calculated counts, units, owners, contacts, brokers, history. */
const BuildingProfilePage = () => {
  const { buildingId } = useParams();
  const navigate = useNavigate();
  const { role } = usePermissions();
  const canManage = ["ADMIN", "MANAGER"].includes(String(role || "").toUpperCase());
  const meta = useDatabaseMeta();
  const { data, error, setError, reload: load } = useLoader(() => getBuilding(buildingId), [buildingId]);
  const [dialog, setDialog] = useState("");
  const [showFormer, setShowFormer] = useState(false);
  if (!data) return <div className="p-5"><ErrorLine message={error} /></div>;
  const { building: b, counts = {}, inventory = [], contacts = [], owners = [], brokers = [], interactions = [] } = data;
  const shownContacts = contacts.filter((r) => showFormer || r.status !== "FORMER");

  const endLink = async (r) => {
    const endedReason = window.prompt("Why is this contact no longer here?", "");
    if (endedReason === null) return;
    try { await updateLink(r._id, { status: "FORMER", endedReason }); load(); } catch (e) { setError(toErrorMessage(e)); }
  };

  return (
    <div className="mx-auto flex w-full max-w-[1200px] flex-col gap-4 p-3 sm:p-5" style={{ color: "var(--g-ink)" }}>
      <Link to="/database?tab=buildings" className="inline-flex items-center gap-1.5 text-[13px]" style={MUT}><ArrowLeft size={15} /> Buildings</Link>
      <div className="flex flex-wrap items-start gap-3">
        <div className="min-w-0 flex-1">
          <h1 className="text-[22px] font-semibold">{b.name}</h1>
          <div className="text-[13px]" style={MUT}>{[b.buildingCode, b.buildingType ? titleCase(b.buildingType) : "", b.totalFloors != null ? `${b.totalFloors} floors` : ""].filter(Boolean).join(" · ")}</div>
          <div className="text-[13px]">{[b.address, b.locality, b.city, b.pincode].filter(Boolean).join(", ")}</div>
          {b.aliases?.length ? <div className="text-[12.5px]" style={FNT}>Also known as {b.aliases.join(", ")}</div> : null}
          {b.archived ? <Tag tone="bad">Archived</Tag> : null}
        </div>
        <Btn onClick={() => setDialog("edit")}><Pencil size={14} /> Edit</Btn>
        {canManage ? <Btn onClick={() => setDialog("merge")}><GitMerge size={14} /> Merge duplicate</Btn> : null}
        <Link to={`/inventory?databaseBuilding=${b._id}`}><Btn tone="primary"><Plus size={14} /> Add property here</Btn></Link>
      </div>

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
        <Stat label="Properties" value={counts.properties ?? 0} />
        <Stat label="Available" value={counts.available ?? 0} tone="ok" />
        <Stat label="Owners" value={counts.owners ?? 0} tone="info" />
        <Stat label="Contacts" value={counts.contacts ?? 0} tone="vio" />
        <Stat label="Brokers" value={counts.brokers ?? 0} tone="warn" />
      </div>
      <ErrorLine message={error} />

      <Panel title="Properties in this building" icon={Building}>
        <Table rows={inventory} empty="No property filed under this building yet" onRow={(i) => navigate(`/inventory/${i._id}`)} columns={[
          { key: "id", label: "Property", render: (i) => <b>{i.propertyId || i.unitNumber}</b> },
          { key: "unit", label: "Floor / unit", render: (i) => [i.floorNumber != null ? `Floor ${i.floorNumber}` : "", i.unitNumber].filter(Boolean).join(" · ") },
          { key: "status", label: "Availability", render: (i) => <Tag tone={i.status === "Available" ? "ok" : "mute"}>{i.status}</Tag> },
          { key: "occ", label: "Occupancy", render: (i) => titleCase(i.occupancy?.status || "UNKNOWN") },
          { key: "ver", label: "Last confirmed", render: (i) => <span>{i.verification?.overdue ? <Tag tone="warn">Overdue</Tag> : null} {fmtDate(i.verification?.confirmedAt)}</span> },
          { key: "owner", label: "Owner", render: (i) => i.ownerContactId?.name || <span style={FNT}>Unknown</span> },
        ]} />
      </Panel>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Panel title="Contacts" icon={Users} action={(
          <span className="flex flex-wrap gap-1.5">
            <Btn onClick={() => setShowFormer((v) => !v)}>{showFormer ? "Hide former" : "Show former"}</Btn>
            <Btn onClick={() => setDialog("link")}>Link existing</Btn>
            <Btn tone="primary" onClick={() => setDialog("add")}><Plus size={14} /> New contact</Btn>
          </span>
        )}>
          {shownContacts.length ? (
            <ul className="flex flex-col">
              {shownContacts.map((r) => (
                <li key={r._id} className="flex flex-wrap items-center gap-2 py-2 text-[13px]" style={{ borderTop: "1px solid var(--g-div)", opacity: r.status === "FORMER" ? 0.65 : 1 }}>
                  <Link to={contactHref(r.contactId)} className="font-semibold" style={{ color: "var(--g-b)" }}>{r.contactId.name}</Link>
                  <Tag tone="a">{roleLabel(r.role)}</Tag>
                  <Tag tone={STATUS_TONE[r.status]}>{titleCase(r.status)}</Tag>
                  <Tag tone={AUTH_TONE[r.authority]}>{titleCase(r.authority)}</Tag>
                  <span style={MUT}>{r.contactId.phone || "No phone"}{r.scopeNote ? ` · ${r.scopeNote}` : ""}{r.endedReason ? ` · ${r.endedReason}` : ""}</span>
                  {r.status !== "FORMER" ? <Btn className="ml-auto" onClick={() => endLink(r)}>Mark former</Btn> : null}
                </li>
              ))}
            </ul>
          ) : <div className="py-3 text-[13px]" style={FNT}>No contacts yet</div>}
        </Panel>
        <Panel title="Owners and brokers" icon={Users}>
          <div className="mb-1 text-[12px] font-semibold" style={MUT}>Owners</div>
          {owners.length ? owners.map((o) => (
            <div key={o._id} className="flex items-center gap-2 py-1 text-[13px]">
              <Link to={`/inventory/owners/${o._id}`} className="font-semibold" style={{ color: "var(--g-b)" }}>{o.name}</Link>
              <span style={MUT}>{o.propertyCount} propert{o.propertyCount === 1 ? "y" : "ies"}</span>
              {!o.current ? <Tag tone="mute">Former</Tag> : null}
            </div>
          )) : <div className="text-[13px]" style={FNT}>No owner known yet</div>}
          <div className="mb-1 mt-3 text-[12px] font-semibold" style={MUT}>Brokers</div>
          {brokers.length ? brokers.map((o) => (
            <div key={o._id} className="py-1 text-[13px]"><Link to={`/inventory/brokers/${o._id}`} className="font-semibold" style={{ color: "var(--g-b)" }}>{o.name}</Link> <span style={MUT}>{o.phone}</span></div>
          )) : <div className="text-[13px]" style={FNT}>No broker linked</div>}
        </Panel>
      </div>

      <Panel title="Calls and history" icon={History} action={<Btn onClick={() => setDialog("log")}><PhoneCall size={14} /> Log call</Btn>}>
        <InteractionList rows={interactions} />
      </Panel>

      {dialog === "add" ? <AddContactDialog preset={{ building: b }} onClose={() => setDialog("")} onSaved={load} /> : null}
      {dialog === "link" ? <LinkDialog title={`Link a contact to ${b.name}`} building={b} onClose={() => setDialog("")} onSaved={load} /> : null}
      {dialog === "log" ? <LogDialog buildingId={b._id} onClose={() => setDialog("")} onSaved={load} /> : null}
      {dialog === "edit" ? <EditBuilding building={b} meta={meta} canManage={canManage} onClose={() => setDialog("")} onSaved={load} /> : null}
      {dialog === "merge" ? <MergeBuilding building={b} onClose={() => setDialog("")} onSaved={load} /> : null}
    </div>
  );
};

const EditBuilding = ({ building, meta, canManage, onClose, onSaved }) => {
  const [form, setForm] = useState({ ...building, aliases: (building.aliases || []).join(", "), totalFloors: building.totalFloors ?? "" });
  const [error, setError] = useState("");
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));
  const save = async (extra = {}) => {
    try {
      const { name, aliases, address, locality, city, pincode, landmark, buildingType, totalFloors, notes } = form;
      await updateBuilding(building._id, { name, aliases: aliases.split(",").map((a) => a.trim()).filter(Boolean), address, locality, city, pincode, landmark, buildingType, totalFloors, notes, ...extra });
      onSaved(); onClose();
    } catch (e) { setError(toErrorMessage(e, "Could not save")); }
  };
  return (
    <Modal title="Edit building" onClose={onClose} footer={<>{canManage ? <Btn tone="danger" onClick={() => save({ archived: !building.archived })}>{building.archived ? "Restore" : "Archive"}</Btn> : null}<Btn onClick={onClose}>Cancel</Btn><Btn tone="primary" onClick={() => save()}>Save</Btn></>}>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Input label="Name" value={form.name} onChange={set("name")} />
        <Input label="Other names" value={form.aliases} onChange={set("aliases")} />
        <Input label="Address" className="sm:col-span-2" value={form.address} onChange={set("address")} />
        <Input label="Locality" value={form.locality} onChange={set("locality")} />
        <Input label="City" value={form.city} onChange={set("city")} />
        <Input label="Pincode" value={form.pincode} onChange={set("pincode")} />
        <Input label="Landmark" value={form.landmark} onChange={set("landmark")} />
        <Select label="Building type" value={form.buildingType || ""} onChange={set("buildingType")} placeholder="Not set" options={options(meta?.buildingTypes || [])} />
        <Input label="Total floors" type="number" value={form.totalFloors} onChange={set("totalFloors")} />
        <TextArea label="Notes" className="sm:col-span-2" value={form.notes} onChange={set("notes")} />
      </div>
      <div className="mt-3"><ErrorLine message={error} /></div>
    </Modal>
  );
};

/* Merge a duplicate into this building: every unit, link and call moves; the old name becomes an alias. */
const MergeBuilding = ({ building, onClose, onSaved }) => {
  const [dup, setDup] = useState(null);
  const [error, setError] = useState("");
  const save = async () => {
    if (!dup || dup._id === building._id) { setError("Choose the other (duplicate) building"); return; }
    if (!window.confirm(`Move everything from "${dup.name}" into "${building.name}" and remove the duplicate?`)) return;
    try { await mergeBuilding(building._id, dup._id); onSaved(); onClose(); } catch (e) { setError(toErrorMessage(e, "Could not merge")); }
  };
  return (
    <Modal title={`Merge a duplicate into ${building.name}`} onClose={onClose} footer={<><Btn onClick={onClose}>Cancel</Btn><Btn tone="primary" onClick={save}>Merge</Btn></>}>
      <BuildingPicker label="Duplicate building" value={dup} onChange={setDup} />
      <p className="mt-2 text-[12.5px]" style={FNT}>Its properties, contacts and history move here. Its name is kept as another name of this building.</p>
      <div className="mt-2"><ErrorLine message={error} /></div>
    </Modal>
  );
};

export default BuildingProfilePage;
