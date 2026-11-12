import React, { useEffect, useMemo, useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { toErrorMessage } from "../../utils/errorMessage";
import {
  addAdjustment, addFollowUp, addLedgerEntry, addPromise, allocatePayment, createAgreement, createObligation, createOffice, createTenant,
  listTenants, recordPayment, setDispute, updateAgreement, updateTenant,
} from "../../services/enterpriseService";
import { FNT, MUT, field } from "../inventory/components/contactGlassTokens";
import { Btn, Check, ErrorLine, Input, Label, Modal, Select, TextArea } from "../database/dbUi";
import { BuildingPicker, ContactPicker } from "../database/dbDialogs";
import { useEnterpriseMeta } from "./enterpriseHelpers";
import { isoDate, money, options, roleLabel, titleCase } from "../database/dbHelpers";
import { getUsers } from "../../services/userService";
import { FilePickButton } from "./enterpriseWidgets";

/* Forms for Enterprise Leasing (Oct 2026 update 02). */

const num = (v) => (v === "" || v === null || v === undefined ? null : Number(v));

/* The employee responsible for the office (operations, renewals, collections). */
export const StaffSelect = ({ value, onChange, label = "Assigned employee" }) => {
  const [users, setUsers] = useState([]);
  useEffect(() => {
    getUsers({ limit: 500 }).then((d) => setUsers((d.users || d || []).filter((u) => u.isActive !== false && u.role !== "CHANNEL_PARTNER"))).catch(() => {});
  }, []);
  return <Select label={label} value={value || ""} onChange={(e) => onChange(e.target.value)} placeholder="Not assigned" options={users.map((u) => ({ value: u._id, label: `${u.name} (${titleCase(u.role)})` }))} />;
};

/* Files picked in a form before the record is saved. */
const PendingFiles = ({ files, setFiles, onError, label = "Receipt / proof" }) => (
  <div className="sm:col-span-full">
    <Label>{label}</Label>
    <div className="flex flex-wrap items-center gap-2">
      {files.map((f, i) => (
        <span key={i} className="inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[12px]" style={field}>
          {f.name}
          <button type="button" aria-label={`Remove ${f.name}`} onClick={() => setFiles((xs) => xs.filter((_, j) => j !== i))}><Trash2 size={12} /></button>
        </span>
      ))}
      <FilePickButton label={files.length ? "Add another" : "Attach file"} onError={onError} onUploaded={async (f) => setFiles((xs) => [...xs, f])} />
    </div>
    <p className="mt-1 text-[11.5px]" style={FNT}>Kept in the protected folder; only the Admin or users allowed to download client documents can open it.</p>
  </div>
);

export const OfficeDialog = ({ onClose, onSaved }) => {
  const meta = useEnterpriseMeta();
  const [form, setForm] = useState({ name: "", address: "", floor: "", unit: "", area: "", areaBasis: "", fitOutBudget: "", operationalStatus: "", assignedTo: "", notes: "" });
  const [building, setBuilding] = useState(null);
  const [error, setError] = useState("");
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));
  const save = async () => {
    try {
      const out = await createOffice({ ...form, assignedTo: form.assignedTo || null, buildingId: building?._id || null, address: form.address || [building?.address, building?.locality, building?.city].filter(Boolean).join(", "), area: num(form.area), fitOutBudget: num(form.fitOutBudget) });
      onSaved(out.office); onClose();
    } catch (e) { setError(toErrorMessage(e, "Could not save the office")); }
  };
  return (
    <Modal title="Add Enterprise office" onClose={onClose} footer={<><Btn onClick={onClose}>Cancel</Btn><Btn tone="primary" onClick={save}>Save office</Btn></>}>
      <div className="flex flex-col gap-3">
        <Input label="Office name" value={form.name} onChange={set("name")} placeholder="e.g. Galaxy Park 5th floor" />
        <BuildingPicker value={building} onChange={setBuilding} label="Building (from the Database)" />
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Input label="Address" className="sm:col-span-2" value={form.address} onChange={set("address")} hint="(blank = building address)" />
          <Input label="Floor" value={form.floor} onChange={set("floor")} />
          <Input label="Unit" value={form.unit} onChange={set("unit")} />
          <Input label="Area" type="number" value={form.area} onChange={set("area")} />
          <Input label="Area basis" value={form.areaBasis} onChange={set("areaBasis")} placeholder="Carpet / built-up / super built-up" />
          <Input label="Fit-out budget (₹)" type="number" value={form.fitOutBudget} onChange={set("fitOutBudget")} />
          <Select label="Status" value={form.operationalStatus} onChange={set("operationalStatus")} placeholder="Negotiation" options={options(meta?.operationalStatuses || [])} />
          <StaffSelect value={form.assignedTo} onChange={(v) => setForm((f) => ({ ...f, assignedTo: v }))} />
        </div>
        <TextArea label="Notes" value={form.notes} onChange={set("notes")} />
        <ErrorLine message={error} />
      </div>
    </Modal>
  );
};

const EMPTY_AGREEMENT = {
  agreementType: "", status: "ACTIVE", signingDate: "", possessionDate: "", commencementDate: "", rentCommencementDate: "", endDate: "",
  lockInMonths: "", lockInEndDate: "", noticePeriodMonths: "", baseRent: "", rentDueDay: "", gstPercent: "", tdsPercent: "", depositRequired: "",
  depositExpectedSettlementDate: "", renewalTerms: "", terminationTerms: "", notes: "", escalations: [], otherCharges: [],
  maintenance: { method: "INCLUDED", amount: "", note: "", passThroughAllowed: false },
  noticeReceivedDate: "", noticeExpiryDate: "", vacatingDate: "", closeOutNotes: "",
};
const DATE_KEYS = ["signingDate", "possessionDate", "commencementDate", "rentCommencementDate", "endDate", "lockInEndDate", "depositExpectedSettlementDate", "noticeReceivedDate", "noticeExpiryDate", "vacatingDate"];

const fromAgreement = (a) => {
  if (!a) return EMPTY_AGREEMENT;
  const out = { ...EMPTY_AGREEMENT, ...a };
  DATE_KEYS.forEach((k) => { out[k] = isoDate(a[k]); });
  ["lockInMonths", "noticePeriodMonths", "baseRent", "rentDueDay", "gstPercent", "tdsPercent", "depositRequired"].forEach((k) => { out[k] = a[k] ?? ""; });
  out.maintenance = { ...EMPTY_AGREEMENT.maintenance, ...(a.maintenance || {}), amount: a.maintenance?.amount ?? "" };
  out.escalations = (a.escalations || []).map((e) => ({ ...e, effectiveDate: isoDate(e.effectiveDate) }));
  out.otherCharges = (a.otherCharges || []).map((c) => ({ ...c, dueDate: isoDate(c.dueDate) }));
  return out;
};

/*
 * Owner master lease or tenant agreement (2.3). Every date is its own field,
 * as written in the executed document; tax rates are blank unless the
 * agreement says so - the accountant confirms them.
 */
export const AgreementDialog = ({ side, officeId, agreement, tenantId, onClose, onSaved }) => {
  const meta = useEnterpriseMeta();
  const [form, setForm] = useState(() => fromAgreement(agreement));
  const [landlord, setLandlord] = useState(agreement?.landlord || null);
  // Owner side: other relevant contacts - the landlord's PA, manager, accountant (2.2).
  const [others, setOthers] = useState(agreement?.otherContacts || []);
  const [addingOther, setAddingOther] = useState(false);
  const [amendmentNote, setAmendmentNote] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e?.target ? (e.target.type === "checkbox" ? e.target.checked : e.target.value) : e }));
  const setM = (k) => (e) => setForm((f) => ({ ...f, maintenance: { ...f.maintenance, [k]: e?.target ? e.target.value : e } }));
  const editing = Boolean(agreement?._id);

  const save = async () => {
    setError(""); setSaving(true);
    const body = {
      ...form,
      lockInMonths: num(form.lockInMonths), noticePeriodMonths: num(form.noticePeriodMonths), baseRent: num(form.baseRent) ?? 0, rentDueDay: num(form.rentDueDay),
      gstPercent: num(form.gstPercent), tdsPercent: num(form.tdsPercent), depositRequired: num(form.depositRequired),
      maintenance: { ...form.maintenance, amount: num(form.maintenance.amount) },
      escalations: form.escalations.map((e) => ({ ...e, value: num(e.value) })),
      otherCharges: form.otherCharges.map((c) => ({ ...c, amount: num(c.amount) })),
      amendmentNote,
    };
    ["_id", "companyId", "agreementCode", "side", "officeId", "amendments", "createdBy", "createdAt", "updatedAt", "__v", "landlord", "tenant"].forEach((k) => delete body[k]);
    if (side === "OWNER") {
      body.landlordContactId = landlord?._id || agreement?.landlordContactId || null;
      body.otherContactIds = others.map((c) => c._id);
    }
    delete body.otherContacts;
    if (side === "TENANT") body.tenantId = tenantId || agreement?.tenantId;
    try {
      const out = editing ? await updateAgreement(agreement._id, body) : await createAgreement(officeId, { ...body, side });
      onSaved(out); onClose();
    } catch (e) { setError(toErrorMessage(e, "Could not save the agreement")); }
    finally { setSaving(false); }
  };

  const dates = [
    ["signingDate", "Signing / execution"], ["possessionDate", "Possession / handover"], ["commencementDate", "Commencement / licence start"],
    ["rentCommencementDate", "Rent commencement"], ["endDate", "End / expiry"], ["lockInEndDate", "Lock-in ends", "(or give months)"],
  ];
  return (
    <Modal width={860} title={`${editing ? "Edit" : "Add"} ${side === "OWNER" ? "owner master lease" : "tenant agreement"}`} onClose={onClose} footer={<><Btn onClick={onClose}>Cancel</Btn><Btn tone="primary" disabled={saving} onClick={save}>{saving ? "Saving…" : "Save"}</Btn></>}>
      <div className="flex flex-col gap-4">
        {side === "OWNER" ? <ContactPicker kind="OWNER" label="Landlord (from the Owner Database)" value={landlord} onChange={setLandlord} /> : null}
        {side === "OWNER" ? (
          <div className="rounded-2xl p-3" style={field}>
            <div className="mb-2 flex items-center gap-2"><Label>Other contacts for this lease</Label><Btn className="ml-auto" onClick={() => setAddingOther(true)}><Plus size={14} /> Add</Btn></div>
            <div className="flex flex-wrap gap-1.5">
              {others.length ? others.map((c) => (
                <span key={c._id} className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[12.5px]" style={{ background: "var(--g-bs)", color: "var(--g-b)" }}>
                  {c.name}{(c.roles || []).length ? ` · ${(c.roles || []).map(roleLabel).join(", ")}` : ""}
                  <button type="button" aria-label={`Remove ${c.name}`} onClick={() => setOthers((xs) => xs.filter((x) => x._id !== c._id))}><Trash2 size={12} /></button>
                </span>
              )) : <span className="text-[12.5px]" style={FNT}>PA, property manager, accountant… from the Database</span>}
            </div>
            {addingOther ? <div className="mt-2"><ContactPicker label="Find contact" value={null} onChange={(c) => { if (c && !others.some((x) => x._id === c._id)) setOthers((xs) => [...xs, c]); setAddingOther(false); }} /></div> : null}
          </div>
        ) : null}
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <Input label="Agreement type" value={form.agreementType} onChange={set("agreementType")} placeholder="Lease deed / leave and licence" />
          <Select label="Status" value={form.status} onChange={set("status")} options={options(meta?.agreementStatuses || ["DRAFT", "ACTIVE"])} />
          <Input label="Rent per month (₹)" type="number" value={form.baseRent} onChange={set("baseRent")} />
          {dates.map(([k, l, h]) => <Input key={k} label={l} hint={h} type="date" value={form[k]} onChange={set(k)} />)}
          <Input label="Lock-in (months)" type="number" value={form.lockInMonths} onChange={set("lockInMonths")} />
          <Input label="Notice period (months)" type="number" value={form.noticePeriodMonths} onChange={set("noticePeriodMonths")} />
          <Input label="Rent due day" hint="(1-28)" type="number" min="1" max="28" value={form.rentDueDay} onChange={set("rentDueDay")} />
          <Input label="GST %" hint="(blank = none)" type="number" value={form.gstPercent} onChange={set("gstPercent")} />
          <Input label="TDS % expected" hint="(blank = none)" type="number" value={form.tdsPercent} onChange={set("tdsPercent")} />
          <Input label="Security deposit (₹)" type="number" value={form.depositRequired} onChange={set("depositRequired")} />
          <Input label="Deposit settlement due" type="date" value={form.depositExpectedSettlementDate} onChange={set("depositExpectedSettlementDate")} />
        </div>
        <p className="text-[12px]" style={FNT}>Tax and TDS rates are not assumed. Enter them only as the executed agreement and the accountant say.</p>

        <div className="rounded-2xl p-3" style={field}>
          <div className="mb-2 flex items-center gap-2"><Label>Escalations (as in this contract)</Label>
            <Btn className="ml-auto" onClick={() => setForm((f) => ({ ...f, escalations: [...f.escalations, { effectiveDate: "", method: "PERCENT", value: "", note: "" }] }))}><Plus size={14} /> Add</Btn>
          </div>
          {form.escalations.length ? form.escalations.map((e, i) => (
            <div key={i} className="mb-2 grid grid-cols-2 gap-2 sm:grid-cols-[1fr_1fr_1fr_2fr_auto]">
              <Input type="date" value={e.effectiveDate} onChange={(ev) => setForm((f) => ({ ...f, escalations: f.escalations.map((x, j) => (j === i ? { ...x, effectiveDate: ev.target.value } : x)) }))} />
              <Select value={e.method} onChange={(ev) => setForm((f) => ({ ...f, escalations: f.escalations.map((x, j) => (j === i ? { ...x, method: ev.target.value } : x)) }))} options={[{ value: "PERCENT", label: "% increase" }, { value: "AMOUNT", label: "₹ increase" }, { value: "NEW_RENT", label: "New rent" }]} />
              <Input type="number" placeholder="Value" value={e.value} onChange={(ev) => setForm((f) => ({ ...f, escalations: f.escalations.map((x, j) => (j === i ? { ...x, value: ev.target.value } : x)) }))} />
              <Input placeholder="Note" value={e.note || ""} onChange={(ev) => setForm((f) => ({ ...f, escalations: f.escalations.map((x, j) => (j === i ? { ...x, note: ev.target.value } : x)) }))} />
              <Btn aria-label="Remove" onClick={() => setForm((f) => ({ ...f, escalations: f.escalations.filter((_, j) => j !== i) }))}><Trash2 size={14} /></Btn>
            </div>
          )) : <div className="text-[12.5px]" style={FNT}>No escalation</div>}
        </div>

        <div className="rounded-2xl p-3" style={field}>
          <Label>Maintenance</Label>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <Select value={form.maintenance.method} onChange={setM("method")} options={[
              { value: "INCLUDED", label: "Included in rent" }, { value: "FIXED", label: "Fixed separate charge" }, { value: "ACTUAL", label: "Actual cost / reimbursement" }, { value: "OTHER", label: "Other (see note)" }]} />
            {form.maintenance.method === "FIXED" ? <Input type="number" placeholder="₹ per month" value={form.maintenance.amount} onChange={setM("amount")} /> : null}
            <Input placeholder="Note" value={form.maintenance.note} onChange={setM("note")} />
          </div>
          {side === "TENANT" ? (
            <div className="mt-2"><Check label="This agreement allows passing landlord / building cost increases on to the tenant" checked={form.maintenance.passThroughAllowed} onChange={(v) => setM("passThroughAllowed")(v)} /></div>
          ) : null}
          <p className="mt-1 text-[12px]" style={FNT}>A landlord's maintenance increase is never passed to the tenant automatically.</p>
        </div>

        <div className="rounded-2xl p-3" style={field}>
          <div className="mb-2 flex items-center gap-2"><Label>Other charges</Label>
            <Btn className="ml-auto" onClick={() => setForm((f) => ({ ...f, otherCharges: [...f.otherCharges, { chargeType: "PARKING", label: "", amount: "", frequency: "MONTHLY", dueDate: "" }] }))}><Plus size={14} /> Add</Btn>
          </div>
          {form.otherCharges.map((c, i) => {
            const upd = (k) => (ev) => setForm((f) => ({ ...f, otherCharges: f.otherCharges.map((x, j) => (j === i ? { ...x, [k]: ev.target.value } : x)) }));
            return (
              <div key={i} className="mb-2 grid grid-cols-2 gap-2 sm:grid-cols-[1fr_1.5fr_1fr_1fr_1fr_auto]">
                <Select value={c.chargeType} onChange={upd("chargeType")} options={options(meta?.chargeTypes?.filter((t) => t !== "RENT" && t !== "MAINTENANCE") || ["PARKING", "UTILITIES", "OTHER"])} />
                <Input placeholder="Name" value={c.label} onChange={upd("label")} />
                <Input type="number" placeholder="₹" value={c.amount} onChange={upd("amount")} />
                <Select value={c.frequency} onChange={upd("frequency")} options={options(meta?.chargeFrequencies || ["MONTHLY", "ONE_TIME"])} />
                <Input type="date" value={c.dueDate || ""} onChange={upd("dueDate")} />
                <Btn aria-label="Remove" onClick={() => setForm((f) => ({ ...f, otherCharges: f.otherCharges.filter((_, j) => j !== i) }))}><Trash2 size={14} /></Btn>
              </div>
            );
          })}
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <TextArea label="Renewal terms" value={form.renewalTerms} onChange={set("renewalTerms")} />
          <TextArea label="Termination terms" value={form.terminationTerms} onChange={set("terminationTerms")} />
        </div>
        {editing ? (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <Input label="Notice received" type="date" value={form.noticeReceivedDate} onChange={set("noticeReceivedDate")} />
            <Input label="Notice period ends" type="date" value={form.noticeExpiryDate} onChange={set("noticeExpiryDate")} />
            <Input label="Vacating date" type="date" value={form.vacatingDate} onChange={set("vacatingDate")} />
            <TextArea label="Handover / close-out notes" className="sm:col-span-3" value={form.closeOutNotes} onChange={set("closeOutNotes")} />
            <Input label="What changed (amendment note)" className="sm:col-span-3" value={amendmentNote} onChange={(e) => setAmendmentNote(e.target.value)} />
          </div>
        ) : null}
        {editing ? <p className="text-[12px]" style={FNT}>Saving rebuilds only future, untouched rows of the schedule. Paid, part-paid, promised, disputed and past rows stay exactly as they are.</p> : null}
        <ErrorLine message={error} />
      </div>
    </Modal>
  );
};

/* Tenant entity with its contacts; several signatories are separate people (2.4). */
export const TenantDialog = ({ tenant, onClose, onSaved }) => {
  const meta = useEnterpriseMeta();
  const [form, setForm] = useState(() => ({ legalName: "", tradeName: "", entityType: "COMPANY", businessAddress: "", registeredAddress: "", pan: "", gstin: "", cin: "", llpin: "", tan: "", notes: "", contacts: [{ role: "PRIMARY", name: "", designation: "", phone: "", email: "" }], ...(tenant || {}) }));
  const [error, setError] = useState("");
  const [dupConfirm, setDupConfirm] = useState(false);
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));
  const setC = (i, k) => (e) => setForm((f) => ({ ...f, contacts: f.contacts.map((c, j) => (j === i ? { ...c, [k]: e.target.value } : c)) }));
  const save = async () => {
    try {
      const body = { ...form, contacts: form.contacts.filter((c) => c.name.trim()), confirmDuplicate: dupConfirm };
      ["_id", "companyId", "tenantCode", "createdBy", "createdAt", "updatedAt", "__v"].forEach((k) => delete body[k]);
      const out = tenant?._id ? await updateTenant(tenant._id, body) : await createTenant(body);
      onSaved(out.tenant); onClose();
    } catch (e) {
      if (e.response?.status === 409) setDupConfirm(true);
      setError(toErrorMessage(e, "Could not save the tenant"));
    }
  };
  return (
    <Modal width={820} title={tenant?._id ? `Edit ${tenant.legalName}` : "Add tenant"} onClose={onClose} footer={<><Btn onClick={onClose}>Cancel</Btn><Btn tone="primary" onClick={save}>{dupConfirm ? "It's a different entity – save" : "Save tenant"}</Btn></>}>
      <div className="flex flex-col gap-3">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <Input label="Legal name (as on the agreement)" className="sm:col-span-2" value={form.legalName} onChange={set("legalName")} />
          <Select label="Entity type" value={form.entityType} onChange={set("entityType")} options={options(meta?.entityTypes || ["COMPANY"])} />
          <Input label="Trade / brand name" value={form.tradeName} onChange={set("tradeName")} />
          <Input label="PAN" value={form.pan} onChange={set("pan")} />
          <Input label="GSTIN" value={form.gstin} onChange={set("gstin")} />
          {form.entityType === "COMPANY" ? <Input label="CIN" value={form.cin} onChange={set("cin")} /> : null}
          {form.entityType === "LLP" ? <Input label="LLPIN" value={form.llpin} onChange={set("llpin")} /> : null}
          <Input label="TAN" value={form.tan} onChange={set("tan")} />
          <Input label="Business address" className="sm:col-span-3" value={form.businessAddress} onChange={set("businessAddress")} />
          <Input label="Registered address" className="sm:col-span-3" value={form.registeredAddress} onChange={set("registeredAddress")} />
        </div>
        <div className="rounded-2xl p-3" style={field}>
          <div className="mb-2 flex items-center gap-2"><Label>Contacts (add each signing authority separately)</Label>
            <Btn className="ml-auto" onClick={() => setForm((f) => ({ ...f, contacts: [...f.contacts, { role: "SIGNATORY", name: "", designation: "", phone: "", email: "" }] }))}><Plus size={14} /> Add</Btn>
          </div>
          {form.contacts.map((c, i) => (
            <div key={c._id || i} className="mb-2 grid grid-cols-2 gap-2 sm:grid-cols-[1fr_1.4fr_1fr_1fr_1.3fr_auto]">
              <Select value={c.role} onChange={setC(i, "role")} options={options(meta?.tenantContactRoles || ["PRIMARY", "SIGNATORY"], (r) => ({ PRIMARY: "Primary", SIGNATORY: "Signing authority", ACCOUNTS: "Accounts / billing", TDS: "TDS / compliance", FACILITY: "Facility / admin", NOTICE: "Legal notices", OTHER: "Other" }[r] || titleCase(r)))} />
              <Input placeholder="Name" value={c.name} onChange={setC(i, "name")} />
              <Input placeholder="Designation" value={c.designation || ""} onChange={setC(i, "designation")} />
              <Input placeholder="Phone" value={c.phone || ""} onChange={setC(i, "phone")} />
              <Input placeholder="Email" value={c.email || ""} onChange={setC(i, "email")} />
              <Btn aria-label="Remove" onClick={() => setForm((f) => ({ ...f, contacts: f.contacts.filter((_, j) => j !== i) }))}><Trash2 size={14} /></Btn>
            </div>
          ))}
        </div>
        <TextArea label="Notes" value={form.notes} onChange={set("notes")} />
        <ErrorLine message={error} />
      </div>
    </Modal>
  );
};

/* Pick an existing tenant, or add one. */
export const TenantPicker = ({ onPick, onClose }) => {
  const [rows, setRows] = useState([]);
  const [q, setQ] = useState("");
  const [adding, setAdding] = useState(false);
  useEffect(() => { listTenants().then((d) => setRows(d.tenants || [])).catch(() => {}); }, []);
  if (adding) return <TenantDialog onClose={() => setAdding(false)} onSaved={(t) => onPick(t)} />;
  const shown = rows.filter((t) => `${t.legalName} ${t.tradeName} ${t.tenantCode}`.toLowerCase().includes(q.toLowerCase()));
  return (
    <Modal title="Choose tenant" onClose={onClose} footer={<Btn tone="primary" onClick={() => setAdding(true)}><Plus size={14} /> New tenant</Btn>}>
      <Input placeholder="Search tenant" value={q} onChange={(e) => setQ(e.target.value)} />
      <div className="mt-2 flex flex-col">
        {shown.map((t) => (
          <button key={t._id} type="button" onClick={() => onPick(t)} className="py-2 text-left text-[13px]" style={{ borderTop: "1px solid var(--g-div)" }}>
            <b>{t.legalName}</b> <span style={MUT}>{[t.tenantCode, titleCase(t.entityType), t.tradeName].filter(Boolean).join(" · ")}</span>
          </button>
        ))}
        {!shown.length ? <div className="py-3 text-[13px]" style={FNT}>No tenant yet</div> : null}
      </div>
    </Modal>
  );
};

/*
 * Record money received or paid (2.5): one transfer can be split across
 * several items, with cash and TDS kept apart. Anything not allocated now
 * stays on the payment as unallocated and can be allocated later.
 */
export const PaymentDialog = ({ officeId, direction, obligations = [], transaction, onClose, onSaved }) => {
  const meta = useEnterpriseMeta();
  const open = useMemo(() => obligations.filter((o) => o.direction === direction && o.balance > 0).sort((a, b) => new Date(a.dueDate) - new Date(b.dueDate)), [obligations, direction]);
  const [form, setForm] = useState({ date: isoDate(new Date()), amount: "", tdsAmount: "", mode: "BANK_TRANSFER", reference: "", bankReference: "", tdsCertificateRef: "", notes: "" });
  const [alloc, setAlloc] = useState({});
  const [files, setFiles] = useState([]);
  const [error, setError] = useState("");
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));
  const available = transaction ? { cash: transaction.unallocatedCash, tds: transaction.unallocatedTds } : { cash: Number(form.amount) || 0, tds: Number(form.tdsAmount) || 0 };
  const used = Object.values(alloc).reduce((a, x) => ({ cash: a.cash + (Number(x.cash) || 0), tds: a.tds + (Number(x.tds) || 0) }), { cash: 0, tds: 0 });
  const autoFill = () => {
    let cash = available.cash; let tds = available.tds; const next = {};
    open.forEach((o) => {
      if (cash <= 0 && tds <= 0) return;
      const t = Math.min(tds, Math.max(0, (o.tdsExpected || 0) - (o.paidTds || 0)), o.balance);
      const c = Math.min(cash, o.balance - t);
      if (c > 0 || t > 0) next[o._id] = { cash: Math.round(c * 100) / 100, tds: Math.round(t * 100) / 100 };
      cash -= c; tds -= t;
    });
    setAlloc(next);
  };
  const save = async () => {
    setError("");
    const allocations = Object.entries(alloc).map(([obligationId, a]) => ({ obligationId, cash: Number(a.cash) || 0, tds: Number(a.tds) || 0 })).filter((a) => a.cash > 0 || a.tds > 0);
    try {
      const out = transaction ? await allocatePayment(transaction._id, { allocations }) : await recordPayment(officeId, { ...form, direction, amount: Number(form.amount) || 0, tdsAmount: Number(form.tdsAmount) || 0, allocations, attachments: files });
      onSaved(out.transaction); onClose();
    } catch (e) { setError(toErrorMessage(e, "Could not save the payment")); }
  };
  const isPay = direction === "PAYABLE";
  return (
    <Modal width={860} title={transaction ? "Allocate the rest of this payment" : isPay ? "Record payment to landlord" : "Record money received from tenant"} onClose={onClose} footer={<><Btn onClick={onClose}>Cancel</Btn><Btn tone="primary" onClick={save}>Save</Btn></>}>
      <div className="flex flex-col gap-3">
        {!transaction ? (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-4">
            <Input label="Date" type="date" value={form.date} onChange={set("date")} />
            <Input label={isPay ? "Cash paid (₹)" : "Cash received (₹)"} type="number" value={form.amount} onChange={set("amount")} />
            <Input label={isPay ? "TDS we deducted (₹)" : "TDS tenant deducted (₹)"} type="number" value={form.tdsAmount} onChange={set("tdsAmount")} />
            <Select label="Mode" value={form.mode} onChange={set("mode")} options={options(meta?.paymentModes || ["BANK_TRANSFER"])} />
            <Input label="Reference" value={form.reference} onChange={set("reference")} />
            <Input label="Bank / UTR ref." value={form.bankReference} onChange={set("bankReference")} />
            <Input label="TDS certificate ref." value={form.tdsCertificateRef} onChange={set("tdsCertificateRef")} />
            <Input label="Notes" value={form.notes} onChange={set("notes")} />
            <PendingFiles files={files} setFiles={setFiles} onError={setError} label={isPay ? "Payment proof / bank advice" : "Receipt / bank advice"} />
          </div>
        ) : <div className="text-[13px]">Unallocated: <b>{money(transaction.unallocatedCash)}</b> cash, <b>{money(transaction.unallocatedTds)}</b> TDS</div>}
        <div className="flex flex-wrap items-center gap-2">
          <Label>Settle these items</Label>
          <Btn className="ml-auto" onClick={autoFill}>Fill oldest first</Btn>
        </div>
        <div className="max-h-[42vh] overflow-y-auto rounded-xl" style={field}>
          {open.length ? open.map((o) => (
            <div key={o._id} className="grid grid-cols-2 items-center gap-2 px-3 py-2 text-[13px] sm:grid-cols-[2fr_1fr_1fr_1fr]" style={{ borderTop: "1px solid var(--g-div)" }}>
              <span><b>{o.label || titleCase(o.chargeType)}</b> <span style={MUT}>due {new Date(o.dueDate).toLocaleDateString("en-IN")} · balance {money(o.balance)}{o.daysOverdue ? ` · ${o.daysOverdue} days late` : ""}</span></span>
              <span className="text-[12px]" style={FNT}>TDS expected {money(o.tdsExpected)}</span>
              <Input type="number" placeholder="Cash" value={alloc[o._id]?.cash ?? ""} onChange={(e) => setAlloc((a) => ({ ...a, [o._id]: { ...a[o._id], cash: e.target.value } }))} />
              <Input type="number" placeholder="TDS" value={alloc[o._id]?.tds ?? ""} onChange={(e) => setAlloc((a) => ({ ...a, [o._id]: { ...a[o._id], tds: e.target.value } }))} />
            </div>
          )) : <div className="px-3 py-3 text-[13px]" style={FNT}>Nothing outstanding on this side</div>}
        </div>
        <div className="text-[12.5px]" style={MUT}>Allocated {money(used.cash)} cash of {money(available.cash)} · {money(used.tds)} TDS of {money(available.tds)}. Anything left stays unallocated on the payment.</div>
        <ErrorLine message={error} />
      </div>
    </Modal>
  );
};

/* Promise, follow-up, dispute or adjustment on one item. */
export const ObligationActionDialog = ({ obligation, action, onClose, onSaved }) => {
  const [form, setForm] = useState({ promisedDate: "", amount: "", note: "", nextFollowUpAt: "", reason: obligation.disputeReason || "", kind: "ADJUSTMENT" });
  const [error, setError] = useState("");
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));
  const titles = { promise: "Promise to pay", followup: "Follow-up", dispute: obligation.disputed ? "Close dispute" : "Mark disputed", adjust: "Waive or adjust" };
  const save = async () => {
    try {
      if (action === "promise") await addPromise(obligation._id, { promisedDate: form.promisedDate, amount: num(form.amount), note: form.note });
      if (action === "followup") await addFollowUp(obligation._id, { note: form.note, nextFollowUpAt: form.nextFollowUpAt });
      if (action === "dispute") await setDispute(obligation._id, { disputed: !obligation.disputed, reason: form.reason });
      if (action === "adjust") await addAdjustment(obligation._id, { amount: num(form.amount), reason: form.reason, kind: form.kind });
      onSaved(); onClose();
    } catch (e) { setError(toErrorMessage(e, "Could not save")); }
  };
  return (
    <Modal title={`${titles[action]} · ${obligation.label || titleCase(obligation.chargeType)}`} onClose={onClose} footer={<><Btn onClick={onClose}>Cancel</Btn><Btn tone="primary" onClick={save}>Save</Btn></>}>
      <div className="flex flex-col gap-3">
        <div className="text-[13px]" style={MUT}>Balance {money(obligation.balance)} · due {new Date(obligation.dueDate).toLocaleDateString("en-IN")}</div>
        {action === "promise" ? <><Input label="Promised date" type="date" value={form.promisedDate} onChange={set("promisedDate")} /><Input label="Promised amount" type="number" value={form.amount} onChange={set("amount")} /><Input label="Note" value={form.note} onChange={set("note")} /><p className="text-[12px]" style={FNT}>A promise is a follow-up, not a payment. The balance stays until money is recorded.</p></> : null}
        {action === "followup" ? <><TextArea label="What happened" value={form.note} onChange={set("note")} /><Input label="Next follow-up" type="date" value={form.nextFollowUpAt} onChange={set("nextFollowUpAt")} /></> : null}
        {action === "dispute" && !obligation.disputed ? <TextArea label="What is disputed" value={form.reason} onChange={set("reason")} /> : null}
        {action === "adjust" ? <><Select label="Kind" value={form.kind} onChange={set("kind")} options={[{ value: "ADJUSTMENT", label: "Adjustment" }, { value: "WAIVER", label: "Waiver" }]} /><Input label="Amount" type="number" value={form.amount} onChange={set("amount")} /><TextArea label="Reason (kept for audit)" value={form.reason} onChange={set("reason")} /></> : null}
        <ErrorLine message={error} />
      </div>
    </Modal>
  );
};

/* A one-off charge, or an actual-cost bill (e.g. landlord's maintenance at actuals). */
export const ChargeDialog = ({ officeId, direction, agreementId, onClose, onSaved }) => {
  const meta = useEnterpriseMeta();
  const [form, setForm] = useState({ chargeType: "MAINTENANCE", label: "", dueDate: "", gross: "", gstPercent: "", tdsExpected: "", billReference: "", notes: "" });
  const [error, setError] = useState("");
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));
  const save = async () => {
    try { await createObligation(officeId, { ...form, direction, agreementId, gross: num(form.gross), gstPercent: num(form.gstPercent), tdsExpected: num(form.tdsExpected) }); onSaved(); onClose(); }
    catch (e) { setError(toErrorMessage(e, "Could not save")); }
  };
  return (
    <Modal title={direction === "PAYABLE" ? "Add landlord bill / charge" : "Add tenant charge"} onClose={onClose} footer={<><Btn onClick={onClose}>Cancel</Btn><Btn tone="primary" onClick={save}>Save</Btn></>}>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Select label="Type" value={form.chargeType} onChange={set("chargeType")} options={options(meta?.chargeTypes || [])} />
        <Input label="Name" value={form.label} onChange={set("label")} placeholder="e.g. CAM Oct 2026 (actuals)" />
        <Input label="Due date" type="date" value={form.dueDate} onChange={set("dueDate")} />
        <Input label="Amount before tax (₹)" type="number" value={form.gross} onChange={set("gross")} />
        <Input label="GST %" hint="(blank = none)" type="number" value={form.gstPercent} onChange={set("gstPercent")} />
        <Input label="TDS expected (₹)" type="number" value={form.tdsExpected} onChange={set("tdsExpected")} />
        <Input label="Bill reference" value={form.billReference} onChange={set("billReference")} />
        <Input label="Notes" value={form.notes} onChange={set("notes")} />
      </div>
      <div className="mt-3"><ErrorLine message={error} /></div>
    </Modal>
  );
};

/* Deposit entry (2.8) or fit-out expense (2.9). */
export const LedgerDialog = ({ officeId, kind, side, onClose, onSaved }) => {
  const meta = useEnterpriseMeta();
  const [form, setForm] = useState({ entryType: side === "OWNER" ? "PAID" : "COLLECTED", date: isoDate(new Date()), amount: "", amountPaid: "", category: "CIVIL", vendor: "", reference: "", reason: "", expectedSettlementDate: "", warrantyUntil: "", notes: "" });
  const [error, setError] = useState("");
  const [files, setFiles] = useState([]);
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));
  const types = (meta?.depositEntryTypes || []).filter((t) => (side === "OWNER" ? t !== "COLLECTED" : t !== "PAID"));
  const save = async () => {
    try { await addLedgerEntry(officeId, { ...form, kind, side, amount: num(form.amount), amountPaid: num(form.amountPaid), attachments: files }); onSaved(); onClose(); }
    catch (e) { setError(toErrorMessage(e, "Could not save")); }
  };
  return (
    <Modal title={kind === "DEPOSIT" ? `${side === "OWNER" ? "Landlord" : "Tenant"} deposit entry` : "Fit-out expense"} onClose={onClose} footer={<><Btn onClick={onClose}>Cancel</Btn><Btn tone="primary" onClick={save}>Save</Btn></>}>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {kind === "DEPOSIT" ? <Select label="Entry" value={form.entryType} onChange={set("entryType")} options={types.map((t) => ({ value: t, label: { REQUIRED: "Amount required", PAID: "Paid to landlord", COLLECTED: "Collected from tenant", REFUND: "Refund", DEDUCTION: "Deduction", ADJUSTMENT: "Adjustment" }[t] || titleCase(t) }))} /> : <Select label="Category" value={form.category} onChange={set("category")} options={options(meta?.expenseCategories || [])} />}
        <Input label="Date" type="date" value={form.date} onChange={set("date")} />
        <Input label={kind === "EXPENSE" ? "Bill amount (₹)" : "Amount (₹)"} type="number" value={form.amount} onChange={set("amount")} />
        {kind === "EXPENSE" ? <><Input label="Paid to vendor so far (₹)" type="number" value={form.amountPaid} onChange={set("amountPaid")} /><Input label="Vendor" value={form.vendor} onChange={set("vendor")} /><Input label="Warranty until" type="date" value={form.warrantyUntil} onChange={set("warrantyUntil")} /></> : null}
        {kind === "DEPOSIT" && ["DEDUCTION", "ADJUSTMENT"].includes(form.entryType) ? <Input label="Reason" value={form.reason} onChange={set("reason")} /> : null}
        {kind === "DEPOSIT" ? <Input label="Expected settlement date" type="date" value={form.expectedSettlementDate} onChange={set("expectedSettlementDate")} /> : null}
        <Input label="Reference" value={form.reference} onChange={set("reference")} />
        <Input label="Notes" value={form.notes} onChange={set("notes")} />
        <PendingFiles files={files} setFiles={setFiles} onError={setError} label={kind === "EXPENSE" ? "Vendor invoice / receipt" : "Receipt / proof"} />
      </div>
      <div className="mt-3"><ErrorLine message={error} /></div>
    </Modal>
  );
};
