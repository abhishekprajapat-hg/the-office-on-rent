import React, { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { CheckCircle2, Download, FileText, Image as ImageIcon, Loader2, Plus, ShieldCheck, Star, Trash2 } from "lucide-react";
import {
  getProjectDetailsCatalogue, getProjectExport, getProjectInventory, getProjectKnowledge, linkProjectInventory, updateProjectDetails, verifyProject,
} from "../../services/projectService";
import { uploadFile } from "../../services/uploadService";
import api from "../../services/api";
import { toErrorMessage } from "../../utils/errorMessage";
import { downloadProjectPdf } from "./projectPdf";
import { AmenityStatusEditor, ApprovalStatusSelect, ContactsEditor, DocumentUploader, FieldGrid } from "./ProjectKnowledgeFields";
import { humanizeKey } from "./projectKnowledgeFormat";

const human = humanizeKey;
const input = "h-9 w-full rounded-lg border border-slate-300 bg-white px-2.5 text-[13px] outline-none focus:border-blue-400";
const area = "w-full rounded-lg border border-slate-300 bg-white px-2.5 py-2 text-[13px] outline-none focus:border-blue-400";
const TABS = [
  ["overview", "Overview"], ["specs", "Specifications"], ["pricing", "Pricing & approvals"], ["contacts", "Contacts"],
  ["amenities", "Amenities"], ["documents", "Documents"], ["media", "Images"], ["units", "Units"], ["history", "History"],
];

/*
 * Centralised project knowledge (requirements 16 Oct 2026, section 05):
 * the details a new employee needs to brief a client, plus one-click client
 * brochure and internal dossier PDFs.
 */
const ProjectKnowledgePanel = ({ projectId, category, canManage, isManagement }) => {
  const [catalogue, setCatalogue] = useState(null);
  const [knowledge, setKnowledge] = useState(null);
  const [draft, setDraft] = useState(null);
  const [tab, setTab] = useState("overview");
  const [busy, setBusy] = useState("");
  const [message, setMessage] = useState("");
  const [units, setUnits] = useState(null);

  const load = useCallback(async () => {
    try {
      const [cat, data] = await Promise.all([getProjectDetailsCatalogue(), getProjectKnowledge(projectId)]);
      setCatalogue(cat);
      setKnowledge(data.knowledge);
      setDraft(JSON.parse(JSON.stringify(data.knowledge || {})));
    } catch (e) { setMessage(toErrorMessage(e, "Couldn't load project details")); }
  }, [projectId]);
  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    if (tab === "units" && !units) getProjectInventory(projectId).then(setUnits).catch(() => setUnits({ counts: {}, units: [] }));
  }, [tab, units, projectId]);

  if (!catalogue || !draft) return <div className="rounded-xl border border-slate-200 bg-white p-5 text-sm text-slate-500"><Loader2 size={14} className="mr-2 inline animate-spin" />Loading project details…</div>;

  const setIn = (section) => (key, value) => setDraft((d) => ({ ...d, [section]: { ...(d[section] || {}), [key]: value } }));
  const save = async (patch, label = "Saved") => {
    setBusy("save"); setMessage("");
    try {
      const out = await updateProjectDetails(projectId, patch);
      setKnowledge(out.knowledge);
      setDraft(JSON.parse(JSON.stringify(out.knowledge)));
      setMessage(label);
    } catch (e) { setMessage(toErrorMessage(e, "Couldn't save")); } finally { setBusy(""); }
  };
  const download = async (type) => {
    setBusy(type); setMessage("");
    try { await downloadProjectPdf(await getProjectExport(projectId, type), catalogue); } catch (e) { setMessage(toErrorMessage(e, "Couldn't create the PDF")); } finally { setBusy(""); }
  };
  const upload = async (file, kind) => {
    const saved = await uploadFile(file, kind === "media" ? "inventory-images" : "inventory-documents");
    return saved?.url || saved?.fileUrl || saved?.file?.url;
  };

  const specFields = catalogue.specs?.[category] || [];
  const c = knowledge.completeness || { percent: 0, missing: [] };
  const disabled = !canManage;

  return (
    <div className="rounded-xl border border-slate-200 bg-white shadow-sm">
      <div className="flex flex-wrap items-center gap-3 border-b border-slate-100 p-4">
        <div className="min-w-0 flex-1">
          <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-slate-500">Project knowledge</p>
          <div className="mt-1 flex items-center gap-2">
            <span className="h-2 w-32 overflow-hidden rounded-full bg-slate-100"><span className="block h-full bg-emerald-500" style={{ width: `${c.percent}%` }} /></span>
            <span className="text-[12px] font-semibold text-slate-700">{c.percent}% complete</span>
            <span className="text-[12px] text-slate-500">· verified {knowledge.lastVerifiedAt ? new Date(knowledge.lastVerifiedAt).toLocaleDateString("en-IN") : "never"}</span>
          </div>
          {c.missing?.length ? <p className="mt-1 text-[11.5px] text-slate-400">Missing: {c.missing.slice(0, 6).join(", ")}{c.missing.length > 6 ? "…" : ""}</p> : null}
        </div>
        {canManage ? (
          <button type="button" disabled={busy === "verify"} onClick={async () => { setBusy("verify"); try { await verifyProject(projectId); await load(); setMessage("Marked as verified today"); } catch (e) { setMessage(toErrorMessage(e, "Couldn't verify")); } finally { setBusy(""); } }}
            className="inline-flex items-center gap-1 rounded-lg border border-slate-300 px-3 py-1.5 text-[12.5px] font-semibold"><CheckCircle2 size={13} /> Verified today</button>
        ) : null}
        <button type="button" disabled={Boolean(busy)} onClick={() => download("client")} className="inline-flex items-center gap-1 rounded-lg bg-emerald-600 px-3 py-1.5 text-[12.5px] font-semibold text-white disabled:opacity-60">
          {busy === "client" ? <Loader2 size={13} className="animate-spin" /> : <Download size={13} />} Client brochure
        </button>
        {isManagement ? (
          <button type="button" disabled={Boolean(busy)} onClick={() => download("internal")} className="inline-flex items-center gap-1 rounded-lg bg-slate-800 px-3 py-1.5 text-[12.5px] font-semibold text-white disabled:opacity-60">
            {busy === "internal" ? <Loader2 size={13} className="animate-spin" /> : <ShieldCheck size={13} />} Internal dossier
          </button>
        ) : null}
      </div>
      {message ? <p className="border-b border-slate-100 px-4 py-2 text-[12px] font-semibold text-slate-600">{message}</p> : null}

      <div className="flex flex-wrap gap-1 border-b border-slate-100 px-3 pt-2">
        {TABS.map(([id, label]) => (
          <button key={id} type="button" onClick={() => setTab(id)} className={`-mb-px border-b-2 px-2.5 py-2 text-[12.5px] font-semibold ${tab === id ? "border-blue-600 text-slate-900" : "border-transparent text-slate-500"}`}>{label}</button>
        ))}
      </div>

      <div className="space-y-4 p-4">
        {tab === "overview" ? (
          <>
            <FieldGrid fields={catalogue.overview} values={draft.overview} onChange={setIn("overview")} disabled={disabled} />
            {isManagement ? (
              <label className="block"><span className="mb-1 block text-[11.5px] font-semibold text-slate-600">Internal notes <span className="text-amber-600">(Admin/Manager only, never in the brochure)</span></span>
                <textarea rows={3} className={area} value={draft.internalNotes || ""} onChange={(e) => setDraft((d) => ({ ...d, internalNotes: e.target.value }))} /></label>
            ) : null}
            {canManage ? <button type="button" className="rounded-lg bg-blue-600 px-3 py-1.5 text-[12.5px] font-semibold text-white" disabled={busy === "save"} onClick={() => save({ overview: draft.overview, ...(isManagement ? { internalNotes: draft.internalNotes || "" } : {}) })}>Save overview</button> : null}
          </>
        ) : null}

        {tab === "specs" ? (
          specFields.length ? (
            <>
              <FieldGrid fields={specFields} values={draft.specs} onChange={setIn("specs")} disabled={disabled} />
              {canManage ? <button type="button" className="rounded-lg bg-blue-600 px-3 py-1.5 text-[12.5px] font-semibold text-white" disabled={busy === "save"} onClick={() => save({ specs: draft.specs })}>Save specifications</button> : null}
            </>
          ) : <p className="text-[13px] text-slate-500">No extra specifications for this project type.</p>
        ) : null}

        {tab === "pricing" ? (
          <>
            <FieldGrid fields={catalogue.pricing.filter((f) => f.source !== "project")} values={draft.pricing} onChange={setIn("pricing")} disabled={disabled} />
            {/* Charges and PLCs live on the project itself, edited in the main form. */}
            <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
              <p className="mb-2 text-[11.5px] font-semibold text-slate-600">Charges &amp; PLCs - edit these with Edit project → Pricing</p>
              <dl className="grid gap-x-4 gap-y-1 text-[12.5px] sm:grid-cols-2">
                {catalogue.pricing.filter((f) => f.source === "project").map((f) => (
                  <div key={f.key} className="flex justify-between gap-3">
                    <dt className="text-slate-500">{f.label}</dt>
                    <dd className="text-right font-medium text-slate-800">{knowledge.pricing?.[f.key] || "—"}</dd>
                  </div>
                ))}
              </dl>
            </div>
            <label className="flex items-center gap-2 text-[13px]"><input type="checkbox" checked={Boolean(draft.pricingPublished)} disabled={!isManagement} onChange={(e) => setDraft((d) => ({ ...d, pricingPublished: e.target.checked }))} /> Pricing is published (shown in the client brochure){!isManagement ? " - Admin/Manager decide" : ""}</label>
            <div className="border-t border-slate-100 pt-4">
              <p className="mb-2 text-[13px] font-semibold text-slate-800">Approvals</p>
              <FieldGrid fields={catalogue.legal} values={draft.legal} onChange={setIn("legal")} disabled={disabled} />
              <div className="mt-3"><ApprovalStatusSelect statuses={catalogue.approvalStatuses} value={draft.approvalStatus} isManagement={isManagement} disabled={disabled} onChange={(approvalStatus) => setDraft((d) => ({ ...d, approvalStatus }))} /></div>
            </div>
            {canManage ? <button type="button" className="rounded-lg bg-blue-600 px-3 py-1.5 text-[12.5px] font-semibold text-white" disabled={busy === "save"} onClick={() => save({ pricing: draft.pricing, legal: draft.legal, approvalStatus: draft.approvalStatus, ...(isManagement ? { pricingPublished: Boolean(draft.pricingPublished) } : {}) })}>Save pricing &amp; approvals</button> : null}
          </>
        ) : null}

        {tab === "contacts" ? (
          <>
            <ContactsEditor contacts={draft.contacts || []} roles={catalogue.contactRoles} disabled={disabled} onChange={(contacts) => setDraft((d) => ({ ...d, contacts }))} />
            {canManage ? <button type="button" className="rounded-lg bg-blue-600 px-3 py-1.5 text-[12.5px] font-semibold text-white" disabled={busy === "save"} onClick={() => save({ contacts: draft.contacts })}>Save contacts</button> : null}
          </>
        ) : null}

        {tab === "amenities" ? (
          <>
            {(knowledge.amenities || []).length || knowledge.otherFacilities ? (
              <p className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-[12.5px] text-slate-600">
                <span className="font-semibold">Ticked in the project form:</span> {(knowledge.amenities || []).map(human).join(", ") || "none"}
                {knowledge.otherFacilities ? <><br /><span className="font-semibold">Other facilities:</span> {knowledge.otherFacilities}</> : null}
                <br /><span className="text-slate-400">Below, give each amenity a status (available, planned, not available), mark chargeable ones and add notes.</span>
              </p>
            ) : null}
            <AmenityStatusEditor
              amenities={draft.amenityStatuses || []}
              statuses={catalogue.amenityStatuses}
              presets={catalogue.amenityPresets?.[category] || []}
              disabled={disabled}
              onChange={(amenityStatuses) => setDraft((d) => ({ ...d, amenityStatuses }))}
            />
            {canManage ? <button type="button" className="rounded-lg bg-blue-600 px-3 py-1.5 text-[12.5px] font-semibold text-white" disabled={busy === "save"} onClick={() => save({ amenityStatuses: draft.amenityStatuses })}>Save amenities</button> : null}
          </>
        ) : null}

        {tab === "documents" ? (
          <>
            <ul className="space-y-1.5">
              {(knowledge.documents || []).map((d, i) => (
                <li key={d._id || i} className={`flex flex-wrap items-center gap-2 rounded-lg border px-3 py-2 text-[12.5px] ${d.superseded ? "border-slate-100 text-slate-400" : "border-slate-200"}`}>
                  <FileText size={13} /><a href={d.url} target="_blank" rel="noreferrer" className="font-semibold text-blue-700 hover:underline">{d.name}</a>
                  <span>{human(d.category)} · v{d.version}{d.superseded ? " · superseded" : ""} · {new Date(d.uploadedAt).toLocaleDateString("en-IN")} · {d.uploadedByName}</span>
                  {d.clientShareable ? <span className="rounded-full bg-emerald-50 px-2 text-emerald-700">client-shareable</span> : null}
                </li>
              ))}
              {!knowledge.documents?.length ? <li className="text-[13px] text-slate-500">No documents yet.</li> : null}
            </ul>
            {canManage ? <DocumentUploader categories={catalogue.documentCategories} onUpload={async (file, meta) => { const url = await upload(file, "documents"); await save({ addDocuments: [{ ...meta, url }] }, "Document added"); }} /> : null}
          </>
        ) : null}

        {tab === "media" ? (
          <>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {(draft.media || []).map((m, i) => (
                <div key={m._id || i} className="rounded-lg border border-slate-200 p-2">
                  <img src={m.url} alt={m.caption || "Project"} className="h-32 w-full rounded object-contain bg-slate-50" />
                  <input className={`${input} mt-2`} placeholder="Caption" value={m.caption || ""} disabled={disabled} onChange={(e) => setDraft((d) => ({ ...d, media: d.media.map((x, n) => (n === i ? { ...x, caption: e.target.value } : x)) }))} />
                  <div className="mt-2 flex flex-wrap items-center gap-2 text-[12px]">
                    <select className="h-8 rounded border border-slate-300 px-1" value={m.category} disabled={disabled} onChange={(e) => setDraft((d) => ({ ...d, media: d.media.map((x, n) => (n === i ? { ...x, category: e.target.value } : x)) }))}>{catalogue.mediaCategories.map((c2) => <option key={c2} value={c2}>{human(c2)}</option>)}</select>
                    <button type="button" disabled={disabled} title="Cover image" onClick={() => setDraft((d) => ({ ...d, media: d.media.map((x, n) => ({ ...x, isCover: n === i })) }))} className={m.isCover ? "text-amber-500" : "text-slate-400"}><Star size={14} /></button>
                    <label className="flex items-center gap-1"><input type="checkbox" checked={m.clientVisible !== false} disabled={disabled} onChange={(e) => setDraft((d) => ({ ...d, media: d.media.map((x, n) => (n === i ? { ...x, clientVisible: e.target.checked } : x)) }))} /> In brochure</label>
                    <button type="button" disabled={disabled || i === 0} onClick={() => setDraft((d) => { const list = [...d.media]; [list[i - 1], list[i]] = [list[i], list[i - 1]]; return { ...d, media: list.map((x, n) => ({ ...x, order: n })) }; })}>↑</button>
                    <button type="button" disabled={disabled || i === draft.media.length - 1} onClick={() => setDraft((d) => { const list = [...d.media]; [list[i + 1], list[i]] = [list[i], list[i + 1]]; return { ...d, media: list.map((x, n) => ({ ...x, order: n })) }; })}>↓</button>
                    {canManage ? <button type="button" className="ml-auto text-rose-500" aria-label="Archive image" onClick={() => setDraft((d) => ({ ...d, media: d.media.filter((_, n) => n !== i) }))}><Trash2 size={13} /></button> : null}
                  </div>
                </div>
              ))}
            </div>
            {!draft.media?.length ? <p className="text-[13px] text-slate-500">No images yet. Photos are kept apart from plans and legal documents.</p> : null}
            {canManage ? (
              <div className="flex flex-wrap items-center gap-2">
                <label className="inline-flex cursor-pointer items-center gap-1 rounded-lg border border-slate-300 px-3 py-1.5 text-[12.5px] font-semibold">
                  <ImageIcon size={13} /> Add images
                  <input type="file" accept="image/*" multiple className="hidden" onChange={async (e) => {
                    const files = [...(e.target.files || [])]; e.target.value = "";
                    setBusy("upload");
                    try {
                      const urls = [];
                      for (const f of files) { urls.push(await upload(f, "media")); } // eslint-disable-line no-await-in-loop
                      setDraft((d) => ({ ...d, media: [...(d.media || []), ...urls.filter(Boolean).map((url, n) => ({ url, caption: "", category: "OTHER", order: (d.media || []).length + n, clientVisible: true }))] }));
                      setMessage("Uploaded - press Save images to keep them");
                    } catch (err) { setMessage(toErrorMessage(err, "Upload failed")); } finally { setBusy(""); }
                  }} />
                </label>
                <button type="button" className="rounded-lg bg-blue-600 px-3 py-1.5 text-[12.5px] font-semibold text-white" disabled={busy === "save" || busy === "upload"} onClick={() => save({ media: draft.media })}>Save images</button>
                {busy === "upload" ? <Loader2 size={14} className="animate-spin" /> : null}
              </div>
            ) : null}
          </>
        ) : null}

        {tab === "units" ? (
          !units ? <p className="text-[13px] text-slate-500"><Loader2 size={13} className="mr-1 inline animate-spin" />Loading…</p> : (
            <>
              {category === "COWORKING" && canManage ? <CoworkingPropertyLink projectId={projectId} linked={units.properties || []} onLinked={() => setUnits(null)} /> : null}
              <p className="text-[12.5px] text-slate-500">Live availability comes from {category === "COWORKING" ? "cabin mapping" : "Inventory"}, not from this record. {Object.entries(units.counts || {}).map(([s, n]) => `${s}: ${n}`).join(" · ") || "No units linked yet."}</p>
              {category !== "COWORKING" ? (
                <div className="flex flex-wrap items-center gap-2">
                  {canManage ? <Link to={`/inventory?addToProject=${projectId}`} className="inline-flex items-center gap-1 rounded-lg bg-blue-600 px-3 py-1.5 text-[12.5px] font-semibold text-white"><Plus size={13} /> Add unit to this project</Link> : null}
                  <Link to={`/inventory?projectId=${projectId}`} className="inline-flex items-center gap-1 rounded-lg border border-slate-300 px-3 py-1.5 text-[12.5px] font-semibold">Open in Inventory</Link>
                  {(() => {
                    const byNameOnly = (units.units || []).filter((u) => !u.projectId).length;
                    if (!byNameOnly) return null;
                    return (
                      <span className="text-[12px] text-amber-700">
                        {byNameOnly} unit{byNameOnly === 1 ? "" : "s"} only match by name{canManage ? " - " : "."}
                        {canManage ? (
                          <button type="button" className="font-semibold underline" disabled={busy === "link"} onClick={async () => {
                            setBusy("link");
                            try { const out = await linkProjectInventory(projectId); setUnits(out); setMessage(`Linked ${out.linked} unit${out.linked === 1 ? "" : "s"} to this project`); } catch (e) { setMessage(toErrorMessage(e, "Couldn't link the units")); } finally { setBusy(""); }
                          }}>link them</button>
                        ) : null}
                      </span>
                    );
                  })()}
                </div>
              ) : null}
              <ul className="space-y-1">
                {(units.units || []).map((u) => (
                  <li key={u._id} className="flex flex-wrap gap-2 rounded border border-slate-100 px-3 py-1.5 text-[12.5px]">
                    {u.isCabin
                      ? <Link to="/coworking/booking-board" className="font-semibold text-blue-700 hover:underline">{u.propertyId || u.unitNumber}</Link>
                      : <Link to={`/inventory/${u._id}`} className="font-semibold text-blue-700 hover:underline">{u.propertyId || u.unitNumber}</Link>}
                    <span>{[u.towerName, u.unitNumber, u.status].filter(Boolean).join(" · ")}</span>
                  </li>
                ))}
              </ul>
            </>
          )
        ) : null}

        {tab === "history" ? (
          <ul className="space-y-1 text-[12.5px] text-slate-600">
            {(knowledge.history || []).map((h, i) => <li key={i}>{new Date(h.at).toLocaleString("en-IN")} · {h.byName || "Someone"} · {h.change}</li>)}
            {!knowledge.history?.length ? <li className="text-slate-500">No changes recorded yet.</li> : null}
          </ul>
        ) : null}
      </div>
    </div>
  );
};

/* Links a coworking property (cabin mapping) to this workspace project. */
const CoworkingPropertyLink = ({ projectId, linked, onLinked }) => {
  const [properties, setProperties] = useState([]);
  const [pick, setPick] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    api.get("/coworking/properties").then(({ data }) => setProperties(data?.properties || data?.items || [])).catch(() => setProperties([]));
  }, []);
  const link = async () => {
    if (!pick) return;
    setBusy(true);
    try { await api.patch(`/coworking/properties/${pick}`, { projectId }); onLinked(); } finally { setBusy(false); }
  };
  return (
    <div className="flex flex-wrap items-center gap-2 rounded-lg bg-slate-50 p-2.5 text-[12.5px]">
      <span>Linked properties: {linked.length ? linked.map((p) => p.name).join(", ") : "none"}</span>
      <select className="h-8 rounded border border-slate-300 px-2" value={pick} onChange={(e) => setPick(e.target.value)}>
        <option value="">Link a coworking property…</option>
        {properties.map((p) => <option key={p._id} value={p._id}>{p.name}</option>)}
      </select>
      <button type="button" disabled={!pick || busy} onClick={link} className="rounded bg-blue-600 px-2.5 py-1 font-semibold text-white disabled:opacity-50">Link</button>
    </div>
  );
};

export default ProjectKnowledgePanel;
