import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { AlertTriangle, Search } from "lucide-react";
import { toErrorMessage } from "../../utils/errorMessage";
import {
  checkDuplicates, createBuilding, createDbContact, createLink, listBuildings, listDbContacts, logInteraction,
} from "../../services/databaseService";
import { useDebouncedValue } from "../../hooks/useDebouncedValue";
import { FNT, MUT, field } from "../inventory/components/contactGlassTokens";
import { Btn, Check, ErrorLine, Input, Label, Modal, Select, Tag, TextArea } from "./dbUi";
import { ROLE_LABELS, contactHref, options, roleLabel, titleCase, useDatabaseMeta } from "./dbHelpers";

/* Forms of the Database module (Oct 2026 update 01). */

/* "Possible duplicates" box used by every form. Never matched by name alone. */
export const DuplicateBox = ({ duplicates = [], kind = "contact", existingId }) => (
  <div className="rounded-xl p-3 text-[13px]" style={{ background: "var(--g-warns)", color: "var(--g-ink)" }}>
    <div className="mb-1.5 flex items-center gap-2 font-semibold" style={{ color: "var(--g-warn)" }}><AlertTriangle size={15} /> {existingId ? "Already on file" : "Possible duplicates"}</div>
    <ul className="flex flex-col gap-1">
      {duplicates.map((d) => (
        <li key={d._id} className="flex flex-wrap items-center gap-2">
          <Link to={kind === "building" ? `/database/buildings/${d._id}` : kind === "inventory" ? `/inventory/${d._id}` : contactHref(d)} target="_blank" className="font-semibold underline">
            {d.name || d.propertyId || d.unitNumber}
          </Link>
          <span style={MUT}>{[d.contactCode || d.buildingCode, d.phone, d.address, d.city, d.kind ? titleCase(d.kind) : "", d.reason].filter(Boolean).join(" · ")}</span>
        </li>
      ))}
    </ul>
  </div>
);

/* Search-as-you-type pickers. */
export const BuildingPicker = ({ value, onChange, label = "Building" }) => {
  const [q, setQ] = useState("");
  const dq = useDebouncedValue(q, 250);
  const [rows, setRows] = useState([]);
  useEffect(() => {
    let live = true;
    listBuildings({ search: dq }).then((d) => { if (live) setRows(d.buildings || []); }).catch(() => {});
    return () => { live = false; };
  }, [dq]);
  return (
    <div>
      <Label>{label}</Label>
      {value ? (
        <div className="flex items-center gap-2 rounded-xl px-3 py-2 text-[13px]" style={field}>
          <span className="flex-1"><b>{value.name}</b> <span style={MUT}>{[value.buildingCode, value.locality, value.city].filter(Boolean).join(" · ")}</span></span>
          <Btn onClick={() => onChange(null)}>Change</Btn>
        </div>
      ) : (
        <>
          <div className="flex items-center gap-2 rounded-xl px-3" style={field}>
            <Search size={15} style={FNT} />
            <input className="h-10 flex-1 bg-transparent text-[13.5px] outline-none" placeholder="Search building name, locality or code" value={q} onChange={(e) => setQ(e.target.value)} />
          </div>
          <div className="mt-1 max-h-44 overflow-y-auto rounded-xl" style={field}>
            {rows.length ? rows.slice(0, 20).map((b) => (
              <button key={b._id} type="button" onClick={() => onChange(b)} className="block w-full px-3 py-2 text-left text-[13px] hover:brightness-95" style={{ borderTop: "1px solid var(--g-div)" }}>
                <b>{b.name}</b> <span style={MUT}>{[b.buildingCode, b.locality, b.city].filter(Boolean).join(" · ")}</span>
              </button>
            )) : <div className="px-3 py-2 text-[12.5px]" style={FNT}>No building found</div>}
          </div>
        </>
      )}
    </div>
  );
};

export const ContactPicker = ({ value, onChange, kind, label = "Contact" }) => {
  const [q, setQ] = useState("");
  const dq = useDebouncedValue(q, 250);
  const [rows, setRows] = useState([]);
  useEffect(() => {
    let live = true;
    listDbContacts({ search: dq, ...(kind ? { kind } : {}) }).then((d) => { if (live) setRows(d.contacts || []); }).catch(() => {});
    return () => { live = false; };
  }, [dq, kind]);
  return (
    <div>
      <Label>{label}</Label>
      {value ? (
        <div className="flex items-center gap-2 rounded-xl px-3 py-2 text-[13px]" style={field}>
          <span className="flex-1"><b>{value.name}</b> <span style={MUT}>{[value.contactCode, value.phone].filter(Boolean).join(" · ")}</span></span>
          <Btn onClick={() => onChange(null)}>Change</Btn>
        </div>
      ) : (
        <>
          <div className="flex items-center gap-2 rounded-xl px-3" style={field}>
            <Search size={15} style={FNT} />
            <input className="h-10 flex-1 bg-transparent text-[13.5px] outline-none" placeholder="Search name, phone or code" value={q} onChange={(e) => setQ(e.target.value)} />
          </div>
          <div className="mt-1 max-h-44 overflow-y-auto rounded-xl" style={field}>
            {rows.length ? rows.slice(0, 20).map((c) => (
              <button key={c._id} type="button" onClick={() => onChange(c)} className="block w-full px-3 py-2 text-left text-[13px] hover:brightness-95" style={{ borderTop: "1px solid var(--g-div)" }}>
                <b>{c.name}</b> <span style={MUT}>{[c.contactCode, c.phone, (c.roles || []).map(roleLabel).join(", ")].filter(Boolean).join(" · ")}</span>
              </button>
            )) : <div className="px-3 py-2 text-[12.5px]" style={FNT}>No contact found{kind === "OWNER" ? " in the Owner Database" : ""}</div>}
          </div>
        </>
      )}
    </div>
  );
};

/* Scope, status and authority of a link (1.3). */
const LinkFields = ({ meta, value, onChange, target }) => (
  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
    <Select label="Scope" value={value.scope || ""} onChange={(e) => onChange({ ...value, scope: e.target.value })} placeholder={target === "building" ? "Whole building" : target === "owner" ? "All of this owner's properties" : "These properties"}
      options={options(meta?.scopes || [])} />
    <Input label="Scope detail" hint="(e.g. floors 3-5, Tower B)" value={value.scopeNote || ""} onChange={(e) => onChange({ ...value, scopeNote: e.target.value })} />
    <Select label="Status" value={value.status || "CURRENT"} onChange={(e) => onChange({ ...value, status: e.target.value })} options={options(meta?.relationshipStates || ["CURRENT", "FORMER", "UNCONFIRMED"])} />
    <Select label="Authority" hint="(what they can confirm)" value={value.authority || ""} onChange={(e) => onChange({ ...value, authority: e.target.value })} placeholder="Unconfirmed" options={options(meta?.authority || [])} />
  </div>
);

/*
 * Add a contact of any role (1.2). The form follows the roles: a guard can be
 * saved with only a label and no phone; an owner or broker needs a phone and
 * goes into the existing Owner / Broker Database.
 */
export const AddContactDialog = ({ onClose, onSaved, preset = {} }) => {
  const meta = useDatabaseMeta();
  const [form, setForm] = useState({ name: "", phone: "", alternatePhone: "", email: "", company: "", designation: "", roles: preset.roles || [], isContactPoint: false, ownerType: "", sourceNote: "", notes: "" });
  const [linkTo, setLinkTo] = useState(preset.building ? "building" : preset.owner ? "owner" : "none");
  const [building, setBuilding] = useState(preset.building || null);
  const [owner, setOwner] = useState(preset.owner || null);
  const [newBuilding, setNewBuilding] = useState({ name: "", address: "", locality: "", city: "" });
  const [link, setLink] = useState({ status: "CURRENT" });
  const [dup, setDup] = useState(null);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e?.target ? e.target.value : e }));
  const roles = form.roles;
  const isOwner = roles.includes("OWNER");
  const isBroker = roles.includes("BROKER");
  const phoneNeeded = isOwner || isBroker;
  const linkRole = roles.find((r) => r !== "OWNER" && r !== "BROKER") || roles[0] || "OTHER";

  const save = async (confirm = {}) => {
    setError("");
    if (!form.name.trim()) { setError("Enter a name, or a label such as \"Aditya Gateway security desk\""); return; }
    if (!roles.length) { setError("Pick at least one role"); return; }
    if (phoneNeeded && !form.phone.trim()) { setError(`A phone number is needed for ${isOwner ? "an owner" : "a broker"}`); return; }
    setSaving(true);
    try {
      const body = { ...form, confirmDuplicate: confirm.contact === true };
      if (linkTo === "building" && building) body.links = [{ buildingId: building._id, role: linkRole, ...link }];
      if (linkTo === "owner" && owner) body.links = [{ ownerId: owner._id, role: linkRole, ...link }];
      if (linkTo === "new" && newBuilding.name.trim()) body.newBuilding = { ...newBuilding, role: linkRole, ...link, confirmDuplicate: confirm.building === true };
      if (preset.inventoryId) body.links = [...(body.links || []), { inventoryId: preset.inventoryId, role: linkRole, ...link }];
      const out = await createDbContact(body);
      onSaved?.(out.contact);
      onClose();
    } catch (e) {
      const d = e.response?.data;
      if (e.response?.status === 409 && d?.duplicates) setDup({ ...d, confirm });
      else setError(toErrorMessage(e, "Could not save the contact"));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal title="Add contact" onClose={onClose} width={720} footer={(
      <>
        <Btn onClick={onClose}>Cancel</Btn>
        {dup?.needsConfirmation ? (
          <Btn tone="primary" disabled={saving} onClick={() => save({ ...dup.confirm, [dup.duplicateKind === "building" ? "building" : "contact"]: true })}>
            {dup.duplicateKind === "building" ? "Save new building anyway" : "It's a different person – save"}
          </Btn>
        ) : null}
        <Btn tone="primary" disabled={saving} onClick={() => save(dup?.confirm || {})}>{saving ? "Saving…" : "Save contact"}</Btn>
      </>
    )}>
      <div className="flex flex-col gap-4">
        <div>
          <Label>Role(s)</Label>
          <div className="flex flex-wrap gap-1.5">
            {(meta?.roles || Object.keys(ROLE_LABELS)).map((r) => {
              const on = roles.includes(r);
              return (
                <button key={r} type="button" aria-pressed={on} onClick={() => setForm((f) => ({ ...f, roles: on ? f.roles.filter((x) => x !== r) : [...f.roles, r] }))}
                  className="h-8 rounded-full px-3 text-[12.5px] font-medium" style={on ? { background: "var(--g-bs)", color: "var(--g-b)", border: "1.5px solid var(--g-b)" } : { ...field, borderWidth: 1.5 }}>
                  {roleLabel(r)}
                </button>
              );
            })}
          </div>
          <p className="mt-1 text-[12px]" style={FNT}>One person can hold several roles. Owners go into the Owner Database and brokers into the Broker Database; everyone else is a Database contact.</p>
        </div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Input label="Name or label" value={form.name} onChange={set("name")} placeholder={roles.includes("SECURITY_GUARD") ? "e.g. Aditya Gateway security desk" : "Full name"} />
          <Input label="Phone" hint={phoneNeeded ? "(needed)" : "(optional)"} value={form.phone} onChange={set("phone")} inputMode="tel" />
          <Input label="Alternate phone" value={form.alternatePhone} onChange={set("alternatePhone")} inputMode="tel" />
          <Input label="Email" value={form.email} onChange={set("email")} type="email" />
          <Input label="Company / agency" value={form.company} onChange={set("company")} />
          <Input label="Designation" value={form.designation} onChange={set("designation")} />
          {isOwner ? <Select label="Owner type" value={form.ownerType} onChange={set("ownerType")} placeholder="Not known" options={options(meta?.ownerTypes || [])} /> : null}
          <Input label="Where this contact came from" value={form.sourceNote} onChange={set("sourceNote")} placeholder="e.g. Met at site, referred by guard" />
        </div>
        <Check label="This is a contact point (a desk or number, not one person)" checked={form.isContactPoint} onChange={set("isContactPoint")} />

        <div className="rounded-2xl p-3" style={field}>
          <Label>Link to</Label>
          <div className="mb-3 flex flex-wrap gap-1.5">
            {[["none", "Nothing yet"], ["building", "A building on file"], ["new", "A new building"], ["owner", "An owner (as their rep.)"]].map(([k, l]) => (
              <button key={k} type="button" aria-pressed={linkTo === k} onClick={() => setLinkTo(k)} className="h-8 rounded-full px-3 text-[12.5px]" style={linkTo === k ? { background: "var(--g-bs)", color: "var(--g-b)", border: "1.5px solid var(--g-b)" } : { border: "1.5px solid var(--g-line)" }}>{l}</button>
            ))}
          </div>
          {linkTo === "building" ? <BuildingPicker value={building} onChange={setBuilding} /> : null}
          {linkTo === "owner" ? <ContactPicker value={owner} onChange={setOwner} kind="OWNER" label="Owner" /> : null}
          {linkTo === "new" ? (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <Input label="Building name" value={newBuilding.name} onChange={(e) => setNewBuilding((b) => ({ ...b, name: e.target.value }))} />
              <Input label="Address" value={newBuilding.address} onChange={(e) => setNewBuilding((b) => ({ ...b, address: e.target.value }))} />
              <Input label="Locality" value={newBuilding.locality} onChange={(e) => setNewBuilding((b) => ({ ...b, locality: e.target.value }))} />
              <Input label="City" value={newBuilding.city} onChange={(e) => setNewBuilding((b) => ({ ...b, city: e.target.value }))} />
            </div>
          ) : null}
          {linkTo !== "none" || preset.inventoryId ? <div className="mt-3"><LinkFields meta={meta} value={link} onChange={setLink} target={linkTo === "owner" ? "owner" : "building"} /></div> : null}
        </div>
        <TextArea label="Notes" value={form.notes} onChange={set("notes")} />
        {dup ? <DuplicateBox duplicates={dup.duplicates} kind={dup.duplicateKind === "building" ? "building" : "contact"} existingId={dup.existingId} /> : null}
        {dup ? <p className="text-[12.5px]" style={MUT}>{dup.message}</p> : null}
        <ErrorLine message={error} />
      </div>
    </Modal>
  );
};

export const AddBuildingDialog = ({ onClose, onSaved, initial }) => {
  const meta = useDatabaseMeta();
  const [form, setForm] = useState({ name: "", aliases: "", address: "", locality: "", city: "", pincode: "", landmark: "", buildingType: "", totalFloors: "", notes: "", ...(initial || {}) });
  const [dup, setDup] = useState(null);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));
  const save = async (confirmDuplicate = false) => {
    setError(""); setSaving(true);
    try {
      const out = await createBuilding({ ...form, aliases: String(form.aliases || "").split(",").map((a) => a.trim()).filter(Boolean), confirmDuplicate });
      onSaved?.(out.building); onClose();
    } catch (e) {
      if (e.response?.status === 409 && e.response.data?.duplicates) setDup(e.response.data);
      else setError(toErrorMessage(e, "Could not save the building"));
    } finally { setSaving(false); }
  };
  const check = async () => {
    if (!form.name.trim() && !form.address.trim()) return;
    try { const d = await checkDuplicates({ type: "building", name: form.name, address: form.address, city: form.city }); setDup(d.duplicates?.length ? { duplicates: d.duplicates, needsConfirmation: true } : null); } catch { /* checked again on save */ }
  };
  return (
    <Modal title="Add building" onClose={onClose} footer={(
      <>
        <Btn onClick={onClose}>Cancel</Btn>
        {dup?.needsConfirmation ? <Btn tone="primary" disabled={saving} onClick={() => save(true)}>It's a different building – save</Btn> : <Btn tone="primary" disabled={saving} onClick={() => save(false)}>{saving ? "Saving…" : "Save building"}</Btn>}
      </>
    )}>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Input label="Building name" value={form.name} onChange={set("name")} onBlur={check} />
        <Input label="Other names" hint="(comma separated)" value={form.aliases} onChange={set("aliases")} />
        <Input label="Address" className="sm:col-span-2" value={form.address} onChange={set("address")} onBlur={check} />
        <Input label="Locality" value={form.locality} onChange={set("locality")} />
        <Input label="City" value={form.city} onChange={set("city")} />
        <Input label="Pincode" value={form.pincode} onChange={set("pincode")} />
        <Input label="Landmark" value={form.landmark} onChange={set("landmark")} />
        <Select label="Building type" value={form.buildingType} onChange={set("buildingType")} placeholder="Not set" options={options(meta?.buildingTypes || [])} />
        <Input label="Total floors" type="number" min="0" value={form.totalFloors} onChange={set("totalFloors")} />
        <TextArea label="Notes" className="sm:col-span-2" value={form.notes} onChange={set("notes")} />
      </div>
      {dup ? <div className="mt-3"><DuplicateBox duplicates={dup.duplicates} kind="building" /></div> : null}
      <div className="mt-3"><ErrorLine message={error} /></div>
    </Modal>
  );
};

/* Link an existing contact to a building, property or owner. */
export const LinkDialog = ({ onClose, onSaved, contact, building, inventoryId, ownerId, title = "Link contact" }) => {
  const meta = useDatabaseMeta();
  const [who, setWho] = useState(contact || null);
  const [where, setWhere] = useState(building || null);
  const [role, setRole] = useState((contact?.roles || []).find((r) => r !== "OWNER") || "");
  const [link, setLink] = useState({ status: "CURRENT" });
  const [error, setError] = useState("");
  const target = inventoryId ? "property" : ownerId ? "owner" : "building";
  const save = async () => {
    setError("");
    try {
      const body = { contactId: who?._id, role: role || "OTHER", ...link };
      if (inventoryId) body.inventoryId = inventoryId; else if (ownerId) body.ownerId = ownerId; else body.buildingId = where?._id;
      await createLink(body);
      onSaved?.(); onClose();
    } catch (e) { setError(toErrorMessage(e, "Could not save the link")); }
  };
  return (
    <Modal title={title} onClose={onClose} footer={<><Btn onClick={onClose}>Cancel</Btn><Btn tone="primary" onClick={save} disabled={!who || (target === "building" && !where)}>Save link</Btn></>}>
      <div className="flex flex-col gap-3">
        {contact ? null : <ContactPicker value={who} onChange={(c) => { setWho(c); if (c && !role) setRole((c.roles || []).find((r) => r !== "OWNER") || ""); }} />}
        {target === "building" && !building ? <BuildingPicker value={where} onChange={setWhere} /> : null}
        <Select label="Role here" value={role} onChange={(e) => setRole(e.target.value)} placeholder="Choose role" options={(meta?.roles || Object.keys(ROLE_LABELS)).filter((r) => r !== "OWNER").map((r) => ({ value: r, label: roleLabel(r) }))} />
        <LinkFields meta={meta} value={link} onChange={setLink} target={target} />
        <ErrorLine message={error} />
      </div>
    </Modal>
  );
};

/* Log a call, a note or an availability verification (1.6). */
export const LogDialog = ({ onClose, onSaved, contact, buildingId, inventoryId, defaultType = "CALL" }) => {
  const meta = useDatabaseMeta();
  const [type, setType] = useState(defaultType);
  const [who, setWho] = useState(contact || null);
  const [form, setForm] = useState({ outcome: "", notes: "", reportedFacts: "", nextStep: "", nextFollowUpAt: "", verificationState: "", at: "" });
  const [error, setError] = useState("");
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));
  const save = async () => {
    setError("");
    try {
      const out = await logInteraction({ type, contactId: who?._id, buildingId, inventoryId, ...form });
      onSaved?.(out.interaction); onClose();
    } catch (e) { setError(toErrorMessage(e, "Could not save")); }
  };
  const types = [["CALL", "Call"], ["NOTE", "Note"], ["SOURCE_REPORT", "Source report"], ...(inventoryId ? [["VERIFICATION", "Availability check"]] : [])];
  return (
    <Modal title="Log activity" onClose={onClose} footer={<><Btn onClick={onClose}>Cancel</Btn><Btn tone="primary" onClick={save}>Save</Btn></>}>
      <div className="flex flex-col gap-3">
        <div className="flex flex-wrap gap-1.5">
          {types.map(([k, l]) => <button key={k} type="button" aria-pressed={type === k} onClick={() => setType(k)} className="h-8 rounded-full px-3 text-[12.5px]" style={type === k ? { background: "var(--g-bs)", color: "var(--g-b)", border: "1.5px solid var(--g-b)" } : { border: "1.5px solid var(--g-line)" }}>{l}</button>)}
        </div>
        {contact ? <div className="text-[13px]">With <b>{contact.name}</b></div> : <ContactPicker value={who} onChange={setWho} label={type === "CALL" ? "Who was called" : "Contact (optional)"} />}
        {type === "CALL" ? <Select label="Outcome" value={form.outcome} onChange={set("outcome")} placeholder="Choose outcome" options={options(meta?.callOutcomes || [])} /> : null}
        {type === "VERIFICATION" ? (
          <Select label="Result" value={form.verificationState} onChange={set("verificationState")} placeholder="Choose" options={options((meta?.verificationStates || []).filter((s) => s !== "NEVER"))} />
        ) : null}
        {type === "VERIFICATION" ? <p className="text-[12px]" style={FNT}>This updates when availability was last confirmed. It does not change the property's status.</p> : null}
        {type === "SOURCE_REPORT" || type === "CALL" ? <TextArea label="What they told us" value={form.reportedFacts} onChange={set("reportedFacts")} /> : null}
        <TextArea label="Notes" value={form.notes} onChange={set("notes")} />
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <Input label="When" type="datetime-local" value={form.at} onChange={set("at")} />
          <Input label="Next step" value={form.nextStep} onChange={set("nextStep")} />
          <Input label="Follow up on" hint="(blank = by outcome)" type="date" value={form.nextFollowUpAt} onChange={set("nextFollowUpAt")} />
        </div>
        <ErrorLine message={error} />
      </div>
    </Modal>
  );
};

/* Interaction history list. */
export const InteractionList = ({ rows = [] }) => (
  rows.length ? (
    <ul className="flex flex-col">
      {rows.map((i) => (
        <li key={i._id} className="py-2 text-[13px]" style={{ borderTop: "1px solid var(--g-div)" }}>
          <div className="flex flex-wrap items-center gap-2">
            <Tag tone={i.type === "VERIFICATION" ? "ok" : i.type === "CALL" ? "info" : i.type === "OWNERSHIP_CHANGE" ? "warn" : "mute"}>{titleCase(i.type)}</Tag>
            {i.outcome ? <Tag tone="a">{titleCase(i.outcome)}</Tag> : null}
            {i.verificationState ? <Tag tone="ok">{titleCase(i.verificationState)}</Tag> : null}
            <span style={MUT}>{new Date(i.at).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" })}{i.byName ? ` · ${i.byName}` : ""}</span>
            {i.contactId?.name ? <span style={MUT}>· {i.contactId.name}</span> : null}
            {i.inventoryId?.propertyId ? <span style={MUT}>· {i.inventoryId.propertyId}</span> : null}
          </div>
          {i.reportedFacts ? <div className="mt-1">{i.reportedFacts}</div> : null}
          {i.notes ? <div className="mt-1" style={MUT}>{i.notes}</div> : null}
          {i.nextFollowUpAt ? <div className="mt-1 text-[12px]" style={{ color: "var(--g-warn)" }}>Follow up {new Date(i.nextFollowUpAt).toLocaleDateString("en-IN")}{i.nextStep ? ` · ${i.nextStep}` : ""}</div> : null}
        </li>
      ))}
    </ul>
  ) : <div className="py-4 text-center text-[13px]" style={FNT}>No calls or notes yet</div>
);
