import React, { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  Briefcase, Check, FileText, IdCard, KeyRound, Loader2, Lock, Mail, MapPin, Phone, Plus, ShieldAlert, Upload, User, UserPlus, UserRoundPen, X,
} from "lucide-react";
import api from "../../../services/api";
import { uploadFile } from "../../../services/uploadService";
import { createFirm, listFirms, updateContact } from "../../../services/relationshipService";
import {
  CONTACT_METHOD_OPTIONS, CP_STATUS_OPTIONS, CUSTOMER_TYPE_OPTIONS, RELATIONSHIP_OPTIONS, SEGMENT_OPTIONS, TRANSACTION_OPTIONS,
} from "../relationshipOptions";
import { PickButtons, GhostButton } from "./contactGlassUi";
import FormWizard from "../../../components/ui/FormWizard";
import { ReviewGroup } from "../../../components/ui/formKit";
import { CP_TONE, FNT, MUT, field } from "./contactGlassTokens";

/*
 * Add or edit an owner / broker - a step form (CRM Web Glass "New Project
 * Form" design): Contact, Business / Property, Relationship, Terms (admins and
 * managers only) and Review. Replaces the separate add dialog and profile
 * editor: same fields, same save rules.
 *
 *  - New contact: POST /contacts (phone is the key; extra profile fields go in
 *    the same call and are validated server-side first).
 *  - Existing contact: PATCH /contacts/:id, so a phone change is checked for a
 *    clash instead of silently creating a second record.
 *  - Restricted fields (CP status, verified, brokerage, net rates, internal
 *    remarks) are only shown and sent for Admin / Manager.
 *  - Making a broker an Active CP (Terms step) opens two more sections:
 *    Aadhaar / PAN upload (stored under uploads/broker-kyc, Admin / Manager
 *    only) and an optional CRM login with page access. The login is a
 *    CHANNEL_PARTNER user made through POST /users/create, its pages set via
 *    PATCH /access/users/:id/pages, and the broker record keeps its id.
 */

const toDateInput = (v) => (v ? new Date(v).toISOString().slice(0, 10) : "");
const normalizePhone = (value) => {
  let digits = String(value || "").replace(/\D/g, "");
  if (digits.startsWith("00")) digits = digits.slice(2);
  if (digits.length === 12 && digits.startsWith("91")) digits = digits.slice(2);
  if (digits.length === 11 && digits.startsWith("0")) digits = digits.slice(1);
  return digits.length >= 7 && digits.length <= 15 ? digits : "";
};

const BROKER_TYPES = [{ value: "", label: "Not set" }, { value: "INDEPENDENT", label: "Independent" }, { value: "COMPANY", label: "Company broker" }];
const listText = (arr) => (Array.isArray(arr) ? arr.join(", ") : arr || "");
const toList = (text) => String(text || "").split(",").map((x) => x.trim()).filter(Boolean);

const Label = ({ children }) => <span className="text-[12.5px] font-medium" style={MUT}>{children}</span>;

const TextField = ({ label, icon: Icon, hint, error, value, onChange, placeholder, type = "text", inputMode, wide }) => (
  <label className={`flex min-w-0 flex-col gap-1.5 ${wide ? "sm:col-span-2" : ""}`}>
    <Label>{label}</Label>
    <span className="flex h-11 items-center gap-2 rounded-xl px-3" style={error ? { ...field, borderColor: "var(--g-bad)" } : field}>
      {Icon ? <Icon size={15} style={FNT} aria-hidden="true" /> : null}
      <input data-bare-input value={value} onChange={onChange} placeholder={placeholder} type={type} inputMode={inputMode} className="h-full min-w-0 flex-1 border-0 bg-transparent text-[14px] outline-none" style={{ color: "var(--g-ink)" }} />
    </span>
    {error ? <span className="text-[11.5px] font-medium" style={{ color: "var(--g-bad)" }}>{error}</span> : hint ? <span className="text-[11.5px]" style={FNT}>{hint}</span> : null}
  </label>
);

const AreaField = ({ label, value, onChange, placeholder, rows = 3, wide = true }) => (
  <label className={`flex min-w-0 flex-col gap-1.5 ${wide ? "sm:col-span-2" : ""}`}>
    <Label>{label}</Label>
    <textarea data-bare-input value={value} onChange={onChange} placeholder={placeholder} rows={rows} className="resize-y rounded-xl px-3 py-2.5 text-[14px] outline-none" style={field} />
  </label>
);

const SelectField = ({ label, value, onChange, options }) => (
  <label className="flex min-w-0 flex-col gap-1.5">
    <Label>{label}</Label>
    <select value={value} onChange={onChange} className="h-11 rounded-xl px-3 text-[14px] outline-none" style={field}>
      {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
    </select>
  </label>
);

const Toggle = ({ on, onChange, title, sub }) => (
  <button type="button" onClick={() => onChange(!on)} aria-pressed={on} className="flex w-full items-center justify-between gap-3 rounded-2xl px-3.5 py-3 text-left" style={field}>
    <span className="flex flex-col"><span className="text-[13.5px] font-medium">{title}</span><span className="text-[12px]" style={MUT}>{sub}</span></span>
    <span className="relative h-[26px] w-11 shrink-0 rounded-full transition" style={{ background: on ? "var(--g-bfill, var(--g-b))" : "var(--g-edge-strong, #cfdcd9)" }}>
      <i className="absolute top-[3px] h-5 w-5 rounded-full bg-white shadow transition-all" style={{ left: on ? 21 : 3 }} />
    </span>
  </button>
);

// Aadhaar and photograph are asked for on CP registration (3 Nov 2026); PAN optional.
const KYC_TYPES = [
  { type: "AADHAAR", label: "Aadhaar card" },
  { type: "PHOTO", label: "Photograph" },
  { type: "PAN", label: "PAN card" },
];
const REGISTRATION_OPTIONS = [
  { value: "REGULAR_BROKER", label: "Regular broker" },
  { value: "CHANNEL_PARTNER", label: "Channel partner (CP)" },
];
const KYC_ACCEPT = "image/jpeg,image/png,image/webp,image/heic,application/pdf,.jpg,.jpeg,.png,.webp,.heic,.pdf";
const docOf = (docs, type) => (docs || []).find((x) => x.type === type);
const storedUser = () => {
  try { return JSON.parse(localStorage.getItem("user") || "{}") || {}; } catch { return {}; }
};
const makePassword = () => {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789";
  const bytes = new Uint32Array(10);
  window.crypto.getRandomValues(bytes);
  return Array.from(bytes, (n) => chars[n % chars.length]).join("");
};

/* One KYC upload slot: pick a file, see it, open it, or remove it. */
const KycSlot = ({ label, doc, busy, onPick, onRemove }) => (
  <div className="flex min-w-0 flex-col gap-1.5">
    <Label>{label}</Label>
    {doc ? (
      <span className="flex h-11 items-center gap-2 rounded-xl px-3" style={field}>
        <FileText size={15} style={{ color: "var(--g-b)" }} aria-hidden="true" />
        <a href={doc.url} target="_blank" rel="noreferrer" className="min-w-0 flex-1 truncate text-[13.5px] underline-offset-2 hover:underline" title={doc.name}>{doc.name || "View file"}</a>
        <button type="button" onClick={onRemove} aria-label={`Remove ${label}`} className="grid h-7 w-7 place-items-center rounded-lg" style={FNT}><X size={14} /></button>
      </span>
    ) : (
      <label className="flex h-11 cursor-pointer items-center justify-center gap-2 rounded-xl px-3 text-[13.5px] font-medium" style={{ ...field, borderStyle: "dashed", color: "var(--g-b)" }}>
        {busy ? <Loader2 size={15} className="animate-spin" /> : <Upload size={15} />}
        {busy ? "Uploading…" : `Upload ${label}`}
        <input type="file" accept={KYC_ACCEPT} className="hidden" disabled={busy} onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; if (f) onPick(f); }} />
      </label>
    )}
  </div>
);

const ContactEditDrawer = ({ kind, contact, canSeeRestricted, onClose, onSaved }) => {
  const isBroker = kind === "BROKER";
  const isNew = !contact?._id;
  const [tab, setTab] = useState("contact");
  const [stepDir, setStepDir] = useState(1);
  const [tried, setTried] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [errors, setErrors] = useState({});
  const [firms, setFirms] = useState([]);
  const [newFirm, setNewFirm] = useState("");
  const [d, setD] = useState(() => {
    const c = contact || {};
    return {
      name: c.name || "", phone: c.phone || "", alternatePhone: c.alternatePhone || "", whatsapp: c.whatsapp || "",
      email: c.email || "", designation: c.designation || "", brokerType: c.brokerType || "",
      firmId: c.firmId?._id || c.firmId || "", company: c.company || "", city: c.city || "",
      segments: c.segments || [], areas: listText(c.areas), projects: listText(c.projects), propertyTypes: listText(c.propertyTypes),
      transactionTypes: c.transactionTypes || [], customerTypes: c.customerTypes || [], marketNotes: c.marketNotes || "",
      relationshipStatus: c.relationshipStatus || "", preferredContact: c.preferredContact || "",
      lastContactAt: toDateInput(c.lastContactAt), nextFollowUpAt: toDateInput(c.nextFollowUpAt), relationshipNotes: c.relationshipNotes || "",
      cpStatus: c.cpStatus || "NOT_ONBOARDED", reraNumber: c.reraNumber || "", verified: Boolean(c.verified),
      brokerageTerms: c.brokerageTerms || "", netRateNotes: c.netRateNotes || "", internalRemarks: c.internalRemarks || "",
      notes: c.notes || "", propertyDetails: c.propertyDetails || "", lastVerifiedAt: toDateInput(c.lastVerifiedAt),
      cpDocuments: Array.isArray(c.cpDocuments) ? c.cpDocuments : [],
      registrationType: c.registrationType || (c.cpStatus && c.cpStatus !== "NOT_ONBOARDED" ? "CHANNEL_PARTNER" : "REGULAR_BROKER"),
      preferredPartner: Boolean(c.preferredPartner),
    };
  });
  /* Channel partner login (Terms step, Active CP only). */
  const existingCpUserId = contact?.cpUserId?._id || contact?.cpUserId || "";
  const [kycBusy, setKycBusy] = useState("");
  const [cpTemplate, setCpTemplate] = useState(null);
  const [cpLogin, setCpLogin] = useState({ enabled: Boolean(existingCpUserId), email: contact?.email || "", password: "", pages: null, existingAccess: null });
  const [cpErrors, setCpErrors] = useState({});
  const createdCpUserId = useRef("");
  const isCp = isBroker && canSeeRestricted && (d.cpStatus !== "NOT_ONBOARDED" || d.registrationType === "CHANNEL_PARTNER");
  const cpActive = isBroker && canSeeRestricted && d.cpStatus === "ACTIVE";
  const wantsCpLogin = cpActive && cpLogin.enabled;
  const setCp = (k, value) => { setCpLogin((v) => ({ ...v, [k]: value })); setCpErrors((v) => (v[k] ? { ...v, [k]: "" } : v)); };
  const set = (k) => (e) => {
    const value = e?.target ? e.target.value : e;
    setD((v) => ({ ...v, [k]: value }));
    setErrors((v) => (v[k] ? { ...v, [k]: "" } : v));
  };

  useEffect(() => { if (isBroker) listFirms().then((r) => setFirms(r.firms || [])).catch(() => {}); }, [isBroker]);

  // Page list for the CP login, loaded the first time the broker is made Active.
  useEffect(() => {
    if (!cpActive || cpTemplate) return;
    let live = true;
    Promise.all([
      api.get("/contacts/cp-access-template"),
      existingCpUserId ? api.get(`/access/users/${existingCpUserId}/pages`).catch(() => null) : Promise.resolve(null),
    ]).then(([tpl, current]) => {
      if (!live) return;
      const pages = tpl.data?.pages || [];
      setCpTemplate(pages);
      const offered = new Set(pages.map((p) => p.key));
      const existingAccess = current?.data?.pageAccess || null;
      setCpLogin((v) => ({
        ...v,
        existingAccess,
        pages: v.pages || (existingAccess
          ? existingAccess.map((e) => e.pageKey).filter((k) => offered.has(k))
          : pages.filter((p) => p.defaultOn).map((p) => p.key)),
      }));
    }).catch((e) => { if (live) setError(e?.response?.data?.message || "Couldn't load channel partner pages"); });
    return () => { live = false; };
  }, [cpActive, cpTemplate, existingCpUserId]);

  const pickKyc = async (type, file) => {
    setKycBusy(type); setError("");
    try {
      const saved = await uploadFile(file, "broker-kyc");
      const doc = { type, name: saved.fileName || file.name, url: saved.url, uploadedAt: new Date().toISOString() };
      setD((v) => ({ ...v, cpDocuments: [...v.cpDocuments.filter((x) => x.type !== type), doc] }));
    } catch (e) {
      setError(e.message || "Upload failed");
    } finally {
      setKycBusy("");
    }
  };
  const removeKyc = (type) => setD((v) => ({ ...v, cpDocuments: v.cpDocuments.filter((x) => x.type !== type) }));

  const cpLoginErrors = () => {
    const found = {};
    if (!wantsCpLogin || existingCpUserId || createdCpUserId.current) return found;
    if (!cpLogin.email.trim()) found.email = "Login email is required";
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cpLogin.email.trim())) found.email = "Enter a valid email address";
    if (cpLogin.password.length < 6) found.password = "At least 6 characters";
    if (!(cpLogin.pages || []).length) found.pages = "Pick at least one page";
    return found;
  };

  // The page list as the access API wants it: a page keeps the actions the CP
  // already has, else the CP role's default actions, else view only.
  const cpPageAccess = () => {
    const had = new Map((cpLogin.existingAccess || []).map((e) => [e.pageKey, e.actions]));
    const offered = new Set((cpTemplate || []).map((p) => p.key));
    const kept = (cpLogin.existingAccess || []).filter((e) => !offered.has(e.pageKey));
    return [
      ...kept,
      ...(cpLogin.pages || []).map((key) => {
        const page = (cpTemplate || []).find((p) => p.key === key);
        return { pageKey: key, actions: had.get(key) || page?.defaultActions || ["view"] };
      }),
    ];
  };
  const cpPagesChanged = () => {
    if (!cpLogin.existingAccess || !cpLogin.pages) return false;
    const offered = new Set((cpTemplate || []).map((p) => p.key));
    const before = cpLogin.existingAccess.map((e) => e.pageKey).filter((k) => offered.has(k)).sort().join(",");
    return before !== [...cpLogin.pages].sort().join(",");
  };

  /* Makes (or updates) the CP login before the broker is saved, so the broker
   * record can carry its id. Returns the user id, or "" when there is none. */
  const syncCpLogin = async () => {
    if (!wantsCpLogin) return "";
    if (existingCpUserId) {
      if (cpPagesChanged()) {
        await api.patch(`/access/users/${existingCpUserId}/pages`, { pageAccess: cpPageAccess() });
        // Inventory for a CP also needs the per-account view flag.
        const hadInventory = (cpLogin.existingAccess || []).some((e) => e.pageKey === "inventory");
        const hasInventory = (cpLogin.pages || []).includes("inventory");
        if (hadInventory !== hasInventory) await api.patch(`/users/${existingCpUserId}/channel-partner/inventory-access`, { canViewInventory: hasInventory });
      }
      return existingCpUserId;
    }
    if (!createdCpUserId.current) {
      const me = storedUser();
      const { data } = await api.post("/users/create", {
        role: "CHANNEL_PARTNER",
        name: d.name.trim(),
        email: cpLogin.email.trim().toLowerCase(),
        phone: normalizePhone(d.phone),
        password: cpLogin.password,
        mustChangePassword: true,
        canViewInventory: (cpLogin.pages || []).includes("inventory"),
        // A Manager's new CP reports to that Manager; an Admin's is balanced across Managers.
        ...(String(localStorage.getItem("role") || me.role || "").toUpperCase() === "MANAGER" && (me._id || me.id) ? { reportingToId: me._id || me.id } : {}),
      });
      createdCpUserId.current = data?.user?._id || "";
      if (!createdCpUserId.current) throw new Error("The login was not created");
    }
    await api.patch(`/access/users/${createdCpUserId.current}/pages`, { pageAccess: cpPageAccess() });
    return createdCpUserId.current;
  };

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
      else setError(e?.response?.data?.message || "Couldn't add the firm");
    }
  };

  const steps = [
    { key: "contact", label: "Contact", hint: "Name & numbers" },
    { key: "business", label: isBroker ? "Business" : "Property", hint: isBroker ? "Firm & segments" : "What they own" },
    // Brokers: the Relationship step is channel-partner onboarding, which only
    // Admin / Manager can do, so other roles skip it.
    ...(!isBroker ? [{ key: "relationship", label: "Relationship", hint: "Status & follow-up" }]
      : canSeeRestricted ? [{ key: "relationship", label: "Relationship", hint: "Channel partner" }] : []),
    ...(canSeeRestricted ? [{ key: "terms", label: "Terms", hint: "Admins only" }] : []),
    { key: "review", label: "Review", hint: "Check & save" },
  ];
  const stepIndex = Math.max(0, steps.findIndex((s) => s.key === tab));
  const lastStep = steps.length - 1;

  const completion = useMemo(() => {
    const keys = ["name", "phone", "email", "city", isBroker ? "designation" : "company"];
    const filled = keys.filter((k) => String(d[k] || "").trim()).length
      + (isBroker ? (d.brokerType ? 1 : 0) + (d.firmId ? 1 : 0) + (d.segments.length ? 1 : 0) : (d.propertyDetails ? 1 : 0));
    return Math.round((filled / (isBroker ? 8 : 6)) * 100);
  }, [d, isBroker]);

  const contactErrors = () => {
    const found = {};
    if (!d.name.trim()) found.name = "Name is required";
    if (!d.phone.trim()) found.phone = "Phone is required";
    else if (!normalizePhone(d.phone)) found.phone = "Enter a valid phone number";
    if (d.email.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(d.email.trim())) found.email = "Enter a valid email address";
    return found;
  };
  const contactBad = Object.keys(contactErrors()).length > 0;
  const cpStepIndex = steps.findIndex((s) => s.key === "relationship");
  const stepAt = (key) => steps.findIndex((s) => s.key === key);
  const goTo = (index) => {
    setStepDir(index >= stepIndex ? 1 : -1);
    setTab(steps[index].key);
    setError("");
  };

  const save = async () => {
    const found = contactErrors();
    setErrors(found);
    if (Object.keys(found).length) { setTried(true); goTo(0); return; }
    const cpFound = cpLoginErrors();
    setCpErrors(cpFound);
    if (Object.keys(cpFound).length) { if (cpStepIndex >= 0) goTo(cpStepIndex); setError("Finish the channel partner login, or switch it off"); return; }

    const patch = {
      ...d,
      areas: toList(d.areas), projects: toList(d.projects), propertyTypes: toList(d.propertyTypes),
      firmId: d.firmId || null, lastContactAt: d.lastContactAt || null, nextFollowUpAt: d.nextFollowUpAt || null, lastVerifiedAt: d.lastVerifiedAt || null,
    };
    if (!isBroker) {
      ["designation", "brokerType", "firmId", "segments", "areas", "projects", "propertyTypes", "transactionTypes", "customerTypes", "marketNotes", "cpStatus", "reraNumber", "brokerageTerms", "netRateNotes", "verified", "cpDocuments"].forEach((k) => delete patch[k]);
    }
    if (!canSeeRestricted) ["brokerageTerms", "netRateNotes", "internalRemarks", "cpStatus", "verified", "cpDocuments", "preferredPartner"].forEach((k) => delete patch[k]);
    if (!isBroker) { delete patch.registrationType; delete patch.preferredPartner; }
    if (isBroker && patch.registrationType !== "CHANNEL_PARTNER" && "preferredPartner" in patch) patch.preferredPartner = false;

    setSaving(true); setError("");
    try {
      try {
        const cpUserId = await syncCpLogin();
        if (cpUserId && cpUserId !== existingCpUserId) patch.cpUserId = cpUserId;
      } catch (e) {
        if (cpStepIndex >= 0) goTo(cpStepIndex);
        setError(`Channel partner login: ${e?.response?.data?.message || e.message || "couldn't be saved"}`);
        return;
      }
      if (isNew) {
        const { data } = await api.post("/contacts", { ...patch, kind });
        onSaved?.(data, data?.alreadyExisted ? `${d.name} was already on file - record updated` : `${d.name} added`);
      } else {
        const res = await updateContact(contact._id, patch);
        onSaved?.(res?.contact || res, `${d.name} updated`);
      }
    } catch (e) {
      setError(e?.response?.data?.message || "Couldn't save");
    } finally {
      setSaving(false);
    }
  };

  const labelOf = (options, value) => options.find((o) => o.value === value)?.label || "";
  const labelsOf = (options, values) => (values || []).map((v) => labelOf(options, v) || v).join(", ");
  const firmName = firms.find((f) => f._id === d.firmId)?.name || "";
  const next = () => {
    if (stepIndex === lastStep) { save(); return; }
    if (stepIndex === 0) {
      const found = contactErrors();
      setErrors(found);
      if (Object.keys(found).length) { setTried(true); return; }
    }
    if (isBroker && steps[stepIndex]?.key === "relationship") {
      const found = cpLoginErrors();
      setCpErrors(found);
      if (Object.keys(found).length) return;
    }
    goTo(stepIndex + 1);
  };
  const stepError = stepIndex === 0 && tried && contactBad ? "Fix the highlighted fields to continue" : "";

  const body = (
    <FormWizard
      icon={isNew ? UserPlus : UserRoundPen}
      title={isNew ? `Add ${isBroker ? "broker" : "owner"}` : `Edit ${isBroker ? "broker" : "owner"} · ${contact.name}`}
      steps={steps}
      step={stepIndex}
      dir={stepDir}
      stepState={(i) => (i === 0 && tried && contactBad ? "bad" : i < stepIndex ? "done" : "todo")}
      canOpenStep={(i) => i < stepIndex || !contactBad}
      onStep={goTo}
      onClose={onClose}
      onBack={() => goTo(Math.max(0, stepIndex - 1))}
      onNext={next}
      onSkip={!isNew && stepIndex < lastStep && !saving ? save : undefined}
      skipLabel="Save now"
      primaryLabel={stepIndex === lastStep ? (saving ? "Saving…" : isNew ? `Add ${isBroker ? "broker" : "owner"}` : "Save profile") : "Continue"}
      primaryIcon={stepIndex === lastStep ? "save" : "next"}
      busy={saving}
      error={error || stepError}
      width={760}
    >
          {tab === "contact" ? (
            <>
            <p className="-mt-1 text-[13px]" style={MUT}>
              {isNew ? (isBroker ? "Enquiries from this number will be kept out of the pipeline." : "Phone number is the key - saving a number on file updates that owner.") : "Changing the phone is checked against other records."}
            </p>
            <div className="grid gap-3 sm:grid-cols-2">
              <TextField label="Name *" icon={User} value={d.name} onChange={set("name")} placeholder="Full name" error={errors.name} />
              <TextField label="Primary mobile *" icon={Phone} value={d.phone} onChange={set("phone")} placeholder="10-digit mobile" inputMode="tel" error={errors.phone} hint={isNew ? "Checked for duplicates" : "Changing it is checked against other records"} />
              <TextField label="Alternate phone" icon={Phone} value={d.alternatePhone} onChange={set("alternatePhone")} placeholder="Optional" inputMode="tel" />
              <TextField label="WhatsApp" icon={Phone} value={d.whatsapp} onChange={set("whatsapp")} placeholder="Optional" inputMode="tel" />
              <TextField label="Email" icon={Mail} value={d.email} onChange={set("email")} placeholder="name@firm.com" type="email" error={errors.email} />
              <TextField label="City" icon={MapPin} value={d.city} onChange={set("city")} placeholder="e.g. Indore" />
              {isBroker
                ? <TextField label="Designation" icon={IdCard} value={d.designation} onChange={set("designation")} placeholder="e.g. Partner" />
                : <TextField label="Company / entity" icon={Briefcase} value={d.company} onChange={set("company")} placeholder="Owning entity" />}
              <button type="button" onClick={() => setD((v) => ({ ...v, whatsapp: v.whatsapp && v.whatsapp === v.phone ? "" : v.phone }))} className="flex items-center gap-2 self-end pb-3 text-left text-[13px]" style={MUT}>
                <span className="grid h-[18px] w-[18px] place-items-center rounded-[6px] text-white" style={{ border: `2px solid ${d.whatsapp && d.whatsapp === d.phone ? "var(--g-b)" : "var(--g-fnt)"}`, background: d.whatsapp && d.whatsapp === d.phone ? "var(--g-b)" : "transparent" }}>
                  {d.whatsapp && d.whatsapp === d.phone ? <Check size={12} strokeWidth={3} /> : null}
                </span>
                WhatsApp is the same as primary mobile
              </button>
              {isBroker && isNew ? (
                <p className="flex items-start gap-2 rounded-xl px-3 py-2.5 text-[12px] sm:col-span-2" style={{ background: "var(--g-warns)", color: "var(--g-warn)" }}>
                  <ShieldAlert size={14} className="mt-px shrink-0" />
                  If this number has an open enquiry you still want to work, close it before saving - existing leads stay, but no new ones will come through.
                </p>
              ) : null}
            </div>
            </>
          ) : null}

          {tab === "business" && isBroker ? (
            <div className="flex flex-col gap-4">
              <div className="flex flex-col gap-2">
                <Label>Registration type</Label>
                <PickButtons options={REGISTRATION_OPTIONS} value={d.registrationType} onChange={(v) => setD((x) => ({
                  ...x,
                  registrationType: v || "REGULAR_BROKER",
                  // A CP registration starts as Pending; a regular broker isn't a CP.
                  ...(v === "CHANNEL_PARTNER" ? (x.cpStatus === "NOT_ONBOARDED" ? { cpStatus: "PENDING" } : {}) : { preferredPartner: false, cpStatus: "NOT_ONBOARDED" }),
                }))} />
                <span className="text-[12px]" style={MUT}>
                  {d.registrationType === "CHANNEL_PARTNER"
                    ? (canSeeRestricted ? "Upload Aadhaar and a photograph under Relationship to complete CP registration." : "An Admin or Manager completes CP registration (Aadhaar and photograph).")
                    : "Name and phone are enough for a regular broker."}
                </span>
              </div>
              <div className="flex flex-col gap-2"><Label>Broker type</Label><PickButtons options={BROKER_TYPES} value={d.brokerType} onChange={set("brokerType")} /></div>
              <div className="flex flex-col gap-2">
                <Label>Firm</Label>
                <PickButtons options={[{ value: "", label: "No firm" }, ...firms.map((f) => ({ value: f._id, label: f.name }))]} value={d.firmId} onChange={set("firmId")} />
                <div className="flex gap-2">
                  <input data-bare-input value={newFirm} onChange={(e) => setNewFirm(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addFirm(); } }} placeholder="New firm name" className="h-10 min-w-0 flex-1 rounded-xl px-3 text-[13.5px] outline-none" style={field} />
                  <GhostButton onClick={addFirm} style={{ color: "var(--g-b)" }}><Plus size={15} />New firm</GhostButton>
                </div>
              </div>
              <div className="flex flex-col gap-2"><Label>Segments</Label><PickButtons multi round options={SEGMENT_OPTIONS} value={d.segments} onChange={set("segments")} /></div>
              <div className="flex flex-col gap-2"><Label>Transaction types</Label><PickButtons multi round options={TRANSACTION_OPTIONS} value={d.transactionTypes} onChange={set("transactionTypes")} /></div>
              <div className="flex flex-col gap-2"><Label>Customer types</Label><PickButtons multi round options={CUSTOMER_TYPE_OPTIONS} value={d.customerTypes} onChange={set("customerTypes")} /></div>
              <div className="grid gap-3 sm:grid-cols-2">
                <TextField label="Areas / localities" value={d.areas} onChange={set("areas")} placeholder="Vijay Nagar, AB Road" hint="Comma separated" />
                <TextField label="Projects" value={d.projects} onChange={set("projects")} placeholder="Omex City, Shalimar Township" hint="Comma separated" />
                <TextField label="Property types" value={d.propertyTypes} onChange={set("propertyTypes")} placeholder="Plots, Offices, Showrooms" hint="Comma separated" />
                <TextField label="RERA registration no." value={d.reraNumber} onChange={set("reraNumber")} placeholder="e.g. MP-RERA-..." />
                <AreaField label="Market knowledge" value={d.marketNotes} onChange={set("marketNotes")} rows={2} />
              </div>
            </div>
          ) : null}

          {tab === "business" && !isBroker ? (
            <div className="grid gap-3 sm:grid-cols-2">
              <TextField label="Last verified" type="date" value={d.lastVerifiedAt} onChange={set("lastVerifiedAt")} />
              <div />
              <AreaField label="Property details" value={d.propertyDetails} onChange={set("propertyDetails")} placeholder="2 shops on MG Road, 1 office in Vijay Nagar" />
            </div>
          ) : null}

          {tab === "relationship" && isBroker && canSeeRestricted ? (
            <div className="flex flex-col gap-3.5">
              <Toggle
                on={isCp}
                onChange={(v) => setD((x) => ({ ...x, cpStatus: v ? (x.cpStatus !== "NOT_ONBOARDED" ? x.cpStatus : "ACTIVE") : "NOT_ONBOARDED", registrationType: v ? "CHANNEL_PARTNER" : "REGULAR_BROKER", ...(v ? {} : { preferredPartner: false }) }))}
                title="Add this broker as a channel partner?"
                sub={isCp ? "Upload KYC and, if you want, give them a CRM login" : "Turn on to onboard them as a CP"}
              />
              {isCp || d.registrationType === "CHANNEL_PARTNER" ? (
                <Toggle
                  on={Boolean(d.preferredPartner) && d.registrationType === "CHANNEL_PARTNER"}
                  onChange={(v) => setD((x) => ({ ...x, preferredPartner: Boolean(v), registrationType: "CHANNEL_PARTNER" }))}
                  title="Preferred Channel Partner"
                  sub="Set by hand for CPs who completed registration. Never automatic."
                />
              ) : null}
              {isCp ? (
                <div className="flex flex-col gap-2"><Label>Channel partner status</Label><PickButtons options={CP_STATUS_OPTIONS.filter((o) => o.value !== "NOT_ONBOARDED")} value={d.cpStatus} onChange={set("cpStatus")} toneFor={(v) => CP_TONE[v] || "mute"} /></div>
              ) : null}
              {!isCp && existingCpUserId ? (
                <p className="flex items-start gap-2 rounded-xl px-3 py-2.5 text-[12px]" style={{ background: "var(--g-warns)", color: "var(--g-warn)" }}>
                  <ShieldAlert size={14} className="mt-px shrink-0" />
                  This broker still has a CRM login. Turning CP off does not remove it - deactivate the user from Team if they should no longer sign in.
                </p>
              ) : null}
                  {isCp ? (
                    <div className="flex flex-col gap-3 rounded-2xl p-3.5" style={{ ...field, background: "var(--g-bs)" }}>
                      <div className="flex flex-col">
                        <span className="text-[13.5px] font-semibold">Channel partner KYC</span>
                        <span className="text-[12px]" style={MUT}>Photo or PDF. Only admins and managers can open these.</span>
                      </div>
                      <div className="grid gap-3 sm:grid-cols-2">
                        {KYC_TYPES.map((k) => (
                          <KycSlot key={k.type} label={k.label} doc={docOf(d.cpDocuments, k.type)} busy={kycBusy === k.type} onPick={(f) => pickKyc(k.type, f)} onRemove={() => removeKyc(k.type)} />
                        ))}
                      </div>
                    </div>
                  ) : null}
                  {cpActive ? (
                    <div className="flex flex-col gap-3 rounded-2xl p-3.5" style={{ ...field, background: "var(--g-bs)" }}>
                      {existingCpUserId ? (
                        <div className="flex items-center gap-2.5">
                          <KeyRound size={16} style={{ color: "var(--g-b)" }} />
                          <span className="flex flex-col"><span className="text-[13.5px] font-semibold">CRM login active</span><span className="text-[12px]" style={MUT}>Change which pages this channel partner can open.</span></span>
                        </div>
                      ) : (
                        <Toggle on={cpLogin.enabled} onChange={(v) => { setCp("enabled", v); if (v && !cpLogin.password) setCp("password", makePassword()); if (v && !cpLogin.email) setCp("email", d.email); }} title="Give CRM login" sub="Lets this channel partner sign in and use the pages you pick" />
                      )}
                      {cpLogin.enabled && !existingCpUserId ? (
                        <div className="grid gap-3 sm:grid-cols-2">
                          <TextField label="Login email *" icon={Mail} value={cpLogin.email} onChange={(e) => setCp("email", e.target.value)} placeholder="name@firm.com" type="email" error={cpErrors.email} />
                          <label className="flex min-w-0 flex-col gap-1.5">
                            <Label>Temporary password *</Label>
                            <span className="flex h-11 items-center gap-2 rounded-xl px-3" style={cpErrors.password ? { ...field, borderColor: "var(--g-bad)" } : field}>
                              <KeyRound size={15} style={FNT} aria-hidden="true" />
                              <input data-bare-input value={cpLogin.password} onChange={(e) => setCp("password", e.target.value)} className="h-full min-w-0 flex-1 border-0 bg-transparent font-mono text-[14px] outline-none" style={{ color: "var(--g-ink)" }} />
                              <button type="button" onClick={() => setCp("password", makePassword())} className="text-[12px] font-medium" style={{ color: "var(--g-b)" }}>New</button>
                            </span>
                            {cpErrors.password ? <span className="text-[11.5px] font-medium" style={{ color: "var(--g-bad)" }}>{cpErrors.password}</span> : <span className="text-[11.5px]" style={FNT}>Share it with the CP; they set their own at first sign-in</span>}
                          </label>
                        </div>
                      ) : null}
                      {cpLogin.enabled ? (
                        <div className="flex flex-col gap-2">
                          <Label>Page access</Label>
                          {cpTemplate && cpLogin.pages ? (
                            <PickButtons multi round options={cpTemplate.map((p) => ({ value: p.key, label: p.label }))} value={cpLogin.pages} onChange={(v) => setCp("pages", v)} />
                          ) : (
                            <span className="flex items-center gap-2 text-[12.5px]" style={MUT}><Loader2 size={14} className="animate-spin" />Loading pages…</span>
                          )}
                          {cpErrors.pages ? <span className="text-[11.5px] font-medium" style={{ color: "var(--g-bad)" }}>{cpErrors.pages}</span> : <span className="text-[11.5px]" style={FNT}>Pre-filled with the Channel Partner role defaults. Inventory also lets them view listings.</span>}
                        </div>
                      ) : null}
                    </div>
                  ) : null}
            </div>
          ) : null}

          {tab === "relationship" && !isBroker ? (
            <div className="grid gap-3 sm:grid-cols-2">
              <SelectField label="Status" value={d.relationshipStatus} onChange={set("relationshipStatus")} options={RELATIONSHIP_OPTIONS} />
              <SelectField label="Preferred contact" value={d.preferredContact} onChange={set("preferredContact")} options={CONTACT_METHOD_OPTIONS} />
              <TextField label="Last contact" type="date" value={d.lastContactAt} onChange={set("lastContactAt")} />
              <TextField label="Next follow-up" type="date" value={d.nextFollowUpAt} onChange={set("nextFollowUpAt")} />
              <AreaField label="Relationship notes" value={d.relationshipNotes} onChange={set("relationshipNotes")} rows={2} />
              <AreaField label="General notes" value={d.notes} onChange={set("notes")} placeholder="Visible to everyone with access" rows={3} />
            </div>
          ) : null}

          {tab === "terms" && canSeeRestricted ? (
            <div className="flex flex-col gap-3.5">
              <p className="flex items-center gap-2.5 rounded-2xl px-3.5 py-3 text-[12.5px]" style={{ background: "var(--g-warns)", color: "var(--g-warn)" }}>
                <Lock size={16} />Only admins and managers can see or edit this tab.
              </p>
              {isBroker ? (
                <>
                  <Toggle on={d.verified} onChange={(v) => setD((x) => ({ ...x, verified: v }))} title="Details verified" sub="Phone, firm and RERA checked by you" />
                  <AreaField label="Brokerage / referral terms" value={d.brokerageTerms} onChange={set("brokerageTerms")} placeholder="e.g. 1 month rent on lease closure" rows={2} />
                  <AreaField label="Net rates" value={d.netRateNotes} onChange={set("netRateNotes")} placeholder="Rates shared by this broker" rows={2} />
                </>
              ) : null}
              <AreaField label="Internal remarks" value={d.internalRemarks} onChange={set("internalRemarks")} placeholder={isBroker ? "Never shown to the broker" : "Internal only"} rows={2} />
            </div>
          ) : null}

          {tab === "review" ? (
            <>
              <div className="flex items-center gap-3 rounded-2xl px-4 py-3.5" style={{ background: "var(--g-bs)" }}>
                <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full text-[15px] font-semibold text-white" style={{ background: "var(--g-bfill, var(--g-b))" }}>
                  {(d.name.trim().charAt(0) || "?").toUpperCase()}
                </span>
                <div className="flex min-w-0 flex-1 flex-col">
                  <span className="truncate text-[15px] font-semibold">{d.name || "Unnamed"}</span>
                  <span className="truncate text-[12.5px]" style={MUT}>{[d.phone, d.city, isBroker ? "Broker" : "Owner"].filter(Boolean).join(" · ")}</span>
                </div>
                <span className="font-mono text-[12px] font-medium" style={{ color: "var(--g-b)" }}>{completion}% complete</span>
              </div>
              <ReviewGroup title="Contact" onEdit={() => goTo(0)} rows={[
                ["Primary mobile", d.phone], ["Alternate phone", d.alternatePhone], ["WhatsApp", d.whatsapp],
                ["Email", d.email], ["City", d.city], isBroker ? ["Designation", d.designation] : ["Company / entity", d.company],
              ]} />
              {isBroker ? (
                <ReviewGroup title="Business" onEdit={() => goTo(1)} rows={[
                  ["Registration", labelOf(REGISTRATION_OPTIONS, d.registrationType)],
                  ["Broker type", labelOf(BROKER_TYPES, d.brokerType)], ["Firm", firmName],
                  ["Segments", labelsOf(SEGMENT_OPTIONS, d.segments)], ["Transaction types", labelsOf(TRANSACTION_OPTIONS, d.transactionTypes)],
                  ["Areas", d.areas], ["RERA no.", d.reraNumber],
                ]} />
              ) : (
                <ReviewGroup title="Property" onEdit={() => goTo(1)} rows={[["Property details", d.propertyDetails], ["Last verified", d.lastVerifiedAt]]} />
              )}
              {!isBroker ? (
                <ReviewGroup title="Relationship" onEdit={() => goTo(stepAt("relationship"))} rows={[
                  ["Status", labelOf(RELATIONSHIP_OPTIONS, d.relationshipStatus)], ["Preferred contact", labelOf(CONTACT_METHOD_OPTIONS, d.preferredContact)],
                  ["Next follow-up", d.nextFollowUpAt],
                ]} />
              ) : null}
              {canSeeRestricted && isBroker ? (
                <ReviewGroup title="Channel partner" onEdit={() => goTo(stepAt("relationship"))} rows={[
                  ["Channel partner", isCp ? labelOf(CP_STATUS_OPTIONS, d.cpStatus) : "No"],
                  ["Preferred CP", d.preferredPartner && d.registrationType === "CHANNEL_PARTNER" ? "Yes" : "No"],
                  ...(isCp ? [
                    ["Aadhaar card", docOf(d.cpDocuments, "AADHAAR") ? "Uploaded" : "Not uploaded"],
                    ["Photograph", docOf(d.cpDocuments, "PHOTO") ? "Uploaded" : "Not uploaded"],
                    ["PAN card", docOf(d.cpDocuments, "PAN") ? "Uploaded" : "Not uploaded"],
                  ] : []),
                  ...(cpActive ? [
                    ["CRM login", existingCpUserId ? "Active" : cpLogin.enabled ? `Will be created · ${cpLogin.email}` : "No login"],
                    ...(cpLogin.enabled ? [["Page access", (cpLogin.pages || []).map((k) => cpTemplate?.find((p) => p.key === k)?.label || k).join(", ")]] : []),
                  ] : []),
                ]} />
              ) : null}
              {canSeeRestricted && isBroker ? (
                <ReviewGroup title="Terms" onEdit={() => goTo(stepAt("terms"))} rows={[["Verified", d.verified ? "Yes" : "No"]]} />
              ) : null}
            </>
          ) : null}
    </FormWizard>
  );
  return createPortal(body, document.body);
};

export default ContactEditDrawer;
