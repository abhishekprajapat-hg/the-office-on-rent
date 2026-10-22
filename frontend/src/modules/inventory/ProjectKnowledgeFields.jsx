/*
 * Editors for the project knowledge record (requirements 16 Oct 2026, section
 * 05), shared by the project form and the knowledge panel on the project page.
 */
import React, { useState } from "react";
import { Loader2, Plus, Trash2 } from "lucide-react";
import { toErrorMessage } from "../../utils/errorMessage";
import { humanizeKey as human } from "./projectKnowledgeFormat";

const input = "h-9 w-full rounded-lg border border-slate-300 bg-white px-2.5 text-[13px] outline-none focus:border-blue-400";
const area = "w-full rounded-lg border border-slate-300 bg-white px-2.5 py-2 text-[13px] outline-none focus:border-blue-400";

const FieldInput = ({ field, value, onChange, disabled }) => {
  if (field.kind === "longtext") return <textarea rows={3} className={area} value={value ?? ""} onChange={(e) => onChange(e.target.value)} disabled={disabled} />;
  if (field.kind === "yesno") return <select className={input} value={value === true ? "true" : value === false ? "false" : ""} onChange={(e) => onChange(e.target.value === "" ? "" : e.target.value === "true")} disabled={disabled}><option value="">Not set</option><option value="true">Yes</option><option value="false">No</option></select>;
  if (field.kind === "list") return <input className={input} value={Array.isArray(value) ? value.join(", ") : value ?? ""} onChange={(e) => onChange(e.target.value)} placeholder="Comma separated" disabled={disabled} />;
  const type = field.kind === "date" ? "date" : field.kind === "url" ? "url" : "text";
  const shown = field.kind === "date" && value ? String(value).slice(0, 10) : value ?? "";
  return <input type={type} inputMode={field.kind === "money" || field.kind === "number" ? "decimal" : undefined} className={input} value={shown} onChange={(e) => onChange(e.target.value)} disabled={disabled} />;
};

export const FieldGrid = ({ fields = [], values = {}, onChange, disabled }) => (
  <div className="grid gap-3 sm:grid-cols-2">
    {fields.map((f) => (
      <label key={f.key} className={`block ${f.kind === "longtext" ? "sm:col-span-2" : ""}`}>
        <span className="mb-1 block text-[11.5px] font-semibold text-slate-600">
          {f.label}{f.restricted ? <span className="ml-1 text-amber-600">(Admin/Manager only)</span> : null}{f.client === false ? <span className="ml-1 text-slate-400">· never in the brochure</span> : null}
        </span>
        <FieldInput field={f} value={values?.[f.key]} onChange={(v) => onChange(f.key, v)} disabled={disabled} />
      </label>
    ))}
  </div>
);

export const ApprovalStatusSelect = ({ statuses = [], value, onChange, disabled, isManagement }) => (
  <label className="block max-w-xs">
    <span className="mb-1 block text-[11.5px] font-semibold text-slate-600">Approval status</span>
    <select className={input} value={value || "NOT_STARTED"} disabled={disabled} onChange={(e) => onChange(e.target.value)}>
      {statuses.map((s) => <option key={s} value={s} disabled={s === "VERIFIED" && !isManagement}>{human(s)}</option>)}
    </select>
    <span className="mt-1 block text-[11.5px] text-slate-500">An uploaded approval document alone is not verification. Approvals appear in the client brochure only once marked Verified by Admin/Manager.</span>
  </label>
);

export const ContactsEditor = ({ contacts = [], onChange, roles = [], disabled }) => {
  const update = (i, patch) => onChange(contacts.map((x, n) => (n === i ? { ...x, ...patch } : x)));
  return (
    <div className="space-y-2">
      {contacts.map((ct, i) => (
        <div key={ct._id || i} className="grid gap-2 rounded-lg bg-slate-50 p-3 sm:grid-cols-4">
          {["name", "organization", "phone", "email"].map((k) => <input key={k} className={input} placeholder={human(k)} value={ct[k] || ""} disabled={disabled} onChange={(e) => update(i, { [k]: e.target.value })} />)}
          <select className={input} value={ct.role || "OTHER"} disabled={disabled} onChange={(e) => update(i, { role: e.target.value })}>{roles.map((r) => <option key={r} value={r}>{human(r)}</option>)}</select>
          <input className={`${input} sm:col-span-2`} placeholder="Notes" value={ct.notes || ""} disabled={disabled} onChange={(e) => update(i, { notes: e.target.value })} />
          <div className="flex items-center justify-between gap-2">
            <label className="flex items-center gap-1.5 text-[12px]"><input type="checkbox" checked={Boolean(ct.shareable)} disabled={disabled} onChange={(e) => update(i, { shareable: e.target.checked })} /> Client-shareable</label>
            {!disabled ? <button type="button" aria-label="Remove contact" className="text-rose-500" onClick={() => onChange(contacts.filter((_, n) => n !== i))}><Trash2 size={14} /></button> : null}
          </div>
        </div>
      ))}
      {!contacts.length ? <p className="text-[13px] text-slate-500">No contacts yet.</p> : null}
      {!disabled ? (
        <button type="button" className="inline-flex items-center gap-1 rounded-lg border border-slate-300 px-3 py-1.5 text-[12.5px] font-semibold" onClick={() => onChange([...contacts, { name: "", role: "SALES", shareable: false }])}><Plus size={13} /> Add contact</button>
      ) : null}
    </div>
  );
};

export const AmenityStatusEditor = ({ amenities = [], onChange, statuses = [], presets = [], disabled }) => {
  const update = (i, patch) => onChange(amenities.map((x, n) => (n === i ? { ...x, ...patch } : x)));
  const addPresets = () => {
    const have = new Set(amenities.map((a) => String(a.name || "").trim().toLowerCase()));
    onChange([...amenities, ...presets.filter((name) => !have.has(name.toLowerCase())).map((name) => ({ name, status: "AVAILABLE" }))]);
  };
  return (
    <div className="space-y-2">
      {amenities.map((a, i) => (
        <div key={i} className="grid gap-2 sm:grid-cols-[1fr_160px_auto_1fr_auto]">
          <input className={input} placeholder="Amenity" value={a.name} disabled={disabled} onChange={(e) => update(i, { name: e.target.value })} />
          <select className={input} value={a.status} disabled={disabled} onChange={(e) => update(i, { status: e.target.value })}>{statuses.map((s) => <option key={s} value={s}>{human(s)}</option>)}</select>
          <label className="flex items-center gap-1 text-[12px]"><input type="checkbox" checked={Boolean(a.chargeable)} disabled={disabled} onChange={(e) => update(i, { chargeable: e.target.checked })} /> Chargeable</label>
          <input className={input} placeholder="Notes" value={a.notes || ""} disabled={disabled} onChange={(e) => update(i, { notes: e.target.value })} />
          {!disabled ? <button type="button" aria-label="Remove amenity" className="text-rose-500" onClick={() => onChange(amenities.filter((_, n) => n !== i))}><Trash2 size={14} /></button> : null}
        </div>
      ))}
      {!disabled ? (
        <div className="flex flex-wrap gap-2">
          <button type="button" className="inline-flex items-center gap-1 rounded-lg border border-slate-300 px-3 py-1.5 text-[12.5px] font-semibold" onClick={() => onChange([...amenities, { name: "", status: "AVAILABLE" }])}><Plus size={13} /> Add amenity</button>
          {presets.length ? <button type="button" title={presets.join(", ")} className="inline-flex items-center gap-1 rounded-lg border border-slate-300 px-3 py-1.5 text-[12.5px] font-semibold" onClick={addPresets}><Plus size={13} /> Add standard list</button> : null}
        </div>
      ) : null}
    </div>
  );
};

export const DocumentUploader = ({ categories = [], onUpload }) => {
  const [meta, setMeta] = useState({ name: "", category: "BROCHURE", clientShareable: false });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  return (
    <div className="flex flex-wrap items-center gap-2 rounded-lg bg-slate-50 p-3">
      <input className="h-9 rounded-lg border border-slate-300 px-2.5 text-[13px]" placeholder="Document name" value={meta.name} onChange={(e) => setMeta((m) => ({ ...m, name: e.target.value }))} />
      <select className="h-9 rounded-lg border border-slate-300 px-2 text-[13px]" value={meta.category} onChange={(e) => setMeta((m) => ({ ...m, category: e.target.value }))}>{categories.map((c) => <option key={c} value={c}>{human(c)}</option>)}</select>
      <label className="flex items-center gap-1 text-[12px]"><input type="checkbox" checked={meta.clientShareable} onChange={(e) => setMeta((m) => ({ ...m, clientShareable: e.target.checked }))} /> Client-shareable</label>
      <label className="inline-flex cursor-pointer items-center gap-1 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-[12.5px] font-semibold">
        {busy ? <Loader2 size={13} className="animate-spin" /> : <Plus size={13} />} Upload file
        <input type="file" className="hidden" disabled={busy} onChange={async (e) => {
          const file = e.target.files?.[0]; e.target.value = "";
          if (!file) return;
          setBusy(true); setError("");
          try { await onUpload(file, { ...meta, name: meta.name || file.name }); setMeta((m) => ({ ...m, name: "" })); } catch (err) { setError(toErrorMessage(err, "Upload failed")); } finally { setBusy(false); }
        }} />
      </label>
      <span className="text-[11.5px] text-slate-500">Same name and category = a new version; the old one is kept.</span>
      {error ? <span className="text-[12px] text-rose-600">{error}</span> : null}
    </div>
  );
};
