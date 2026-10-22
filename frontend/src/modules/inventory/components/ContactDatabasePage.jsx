import { useCallback, useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { AlertTriangle, ArrowLeft, Download, FileUp, Loader2, Plus, ShieldAlert, Trash2, Upload } from "lucide-react";
import { Button } from "../../../components/ui";
import api from "../../../services/api";
import { deleteOutcomeMessage, isDeleteApprovalPending } from "../../../services/deleteRequestService";
import { usePermissions } from "../../../context/usePermissions";
import { parseContactFile, downloadContactTemplate, EMPTY_CONTACT } from "../contactBulkImport";
import ContactFormDialog from "./ContactFormDialog";
import { importReraBrokers } from "../../../services/relationshipService";
import { CP_STATUS_OPTIONS, SEGMENT_OPTIONS, TRANSACTION_OPTIONS, labelOf, toneOf } from "../relationshipOptions";

/*
 * One implementation behind both the Owner and the Broker page.
 *
 * The two differ in what the records mean, not in how they are kept: the same
 * fields, the same phone-as-key rule, the same import. Only the broker page
 * carries the blocked-lead column, because only brokers gate lead intake.
 */
const ContactDatabasePage = ({ kind, title, blurb }) => {
  const { canPageAction, role } = usePermissions();
  const isManagement = ["ADMIN", "MANAGER"].includes(String(role || localStorage.getItem("role") || "").toUpperCase());
  const reraRef = useRef(null);
  const [filters, setFilters] = useState({ segment: "", cpStatus: "", transactionType: "", area: "", source: "", stale: "" });
  const canWrite = canPageAction("inventory", "create");
  const fileRef = useRef(null);
  const label = kind === "BROKER" ? "broker" : "owner";

  const [rows, setRows] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [version, setVersion] = useState(0);
  const [loading, setLoading] = useState(true);

  // null when closed; the contact being edited, or EMPTY_CONTACT when adding.
  const [editing, setEditing] = useState(null);
  const [saving, setSaving] = useState(false);

  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [blocked, setBlocked] = useState(null);

  useEffect(() => {
    let active = true;
    setLoading(true);
    const timer = setTimeout(() => {
      const activeFilters = Object.fromEntries(Object.entries(filters).filter(([, v]) => v));
      api.get("/contacts", { params: { kind, search, page, ...activeFilters } })
        .then(({ data }) => {
          if (!active) return;
          setRows(data.contacts || []);
          setTotal(data.total || 0);
          setError("");
        })
        .catch((requestError) => {
          if (active) setError(requestError.response?.data?.message || "Unable to load contacts");
        })
        .finally(() => { if (active) setLoading(false); });
    }, 200);
    return () => { active = false; clearTimeout(timer); };
  }, [kind, search, page, version, filters]);

  const refresh = useCallback(() => setVersion((value) => value + 1), []);

  const handleSubmit = async (draft) => {
    setSaving(true);
    setError("");
    try {
      await api.post("/contacts", { ...draft, kind });
      setNotice(draft._id ? `${draft.name} updated` : `${draft.name} added to the ${title}`);
      setEditing(null);
      refresh();
    } catch (saveError) {
      setError(saveError.response?.data?.message || "Unable to save contact");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (contact) => {
    // A Manager's delete is a request an Admin approves.
    const needsApproval = String(localStorage.getItem("role") || "").trim().toUpperCase() === "MANAGER";
    const question = needsApproval
      ? `Ask Admin to remove ${contact.name} from the ${title}? It stays until they approve.`
      : `Remove ${contact.name} from the ${title}? Any leads already linked to them stay as they are.`;
    if (!window.confirm(question)) return;
    try {
      const { data } = await api.delete(`/contacts/${contact._id}`);
      setNotice(deleteOutcomeMessage(data, `${contact.name} removed`));
      if (!isDeleteApprovalPending(data)) refresh();
    } catch (deleteError) {
      setError(deleteError.response?.data?.message || "Unable to remove contact");
    }
  };

  const handleFile = async (file) => {
    if (!file) return;
    setImporting(true);
    setError("");
    setNotice("");
    setImportResult(null);
    try {
      const parsed = await parseContactFile(file);
      if (!parsed.length) throw new Error("No rows found in the file.");
      const { data } = await api.post("/contacts/bulk", { kind, rows: parsed });
      setImportResult({ ...data, fileName: file.name });
      refresh();
    } catch (importError) {
      setError(importError.response?.data?.message || importError.message || "Unable to import the file");
    } finally {
      setImporting(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  // RERA broker list (requirements 16 Oct 2026, 6.5): duplicates by phone or
  // registration number are filled in, not copied; nobody becomes a CP or
  // "verified" by being imported.
  const handleReraFile = async (file) => {
    if (!file) return;
    setImporting(true); setError(""); setNotice(""); setImportResult(null);
    try {
      const XLSX = await import("xlsx");
      const wb = XLSX.read(await file.arrayBuffer(), { type: "array" });
      const rows = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { defval: "" });
      if (!rows.length) throw new Error("No rows found in the file.");
      const data = await importReraBrokers(rows);
      setImportResult({ fileName: file.name, createdCount: data.created, updatedCount: data.updated, failedCount: data.skipped, failures: data.errors });
      refresh();
    } catch (importError) {
      setError(importError.response?.data?.message || importError.message || "Unable to import the RERA list");
    } finally {
      setImporting(false);
      if (reraRef.current) reraRef.current.value = "";
    }
  };

  const openBlocked = async (contact) => {
    setBlocked({ name: contact.name, loading: true, entries: [] });
    try {
      const { data } = await api.get(`/contacts/${contact._id}/blocked-leads`);
      setBlocked({ name: contact.name, loading: false, entries: data.blockedLeads || [] });
    } catch {
      setBlocked({ name: contact.name, loading: false, entries: [], error: "Could not load the blocked leads" });
    }
  };

  const lastPage = Math.max(1, Math.ceil(total / 50));

  return (
    <div className="ui-page-shell custom-scrollbar h-full overflow-auto p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold text-slate-900 dark:text-slate-100">{title}</h1>
        <div className="flex items-center gap-4 text-sm">
          <Link to={kind === "OWNER" ? "/inventory/brokers" : "/inventory/owners"} className="font-semibold text-blue-600 hover:underline">
            {kind === "OWNER" ? "Broker Database" : "Owner Database"}
          </Link>
          <Link to="/inventory" className="inline-flex items-center gap-1 text-slate-500 hover:underline">
            <ArrowLeft size={14} /> Inventory
          </Link>
        </div>
      </div>
      <p className="my-3 max-w-3xl text-sm text-slate-500">{blurb}</p>

      {error ? <p role="alert" className="mb-3 rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">{error}</p> : null}
      {notice ? <p role="status" className="mb-3 rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-700">{notice}</p> : null}

      {importResult ? (
        <div role="status" className="mb-3 rounded-lg border border-blue-200 bg-blue-50 p-3 text-sm text-blue-900">
          <p className="font-semibold">
            {importResult.fileName}: {importResult.createdCount} added, {importResult.updatedCount} updated, {importResult.failedCount} skipped
          </p>
          {importResult.failures?.length ? (
            <ul className="mt-2 max-h-40 space-y-0.5 overflow-auto text-xs">
              {importResult.failures.map((failure) => (
                <li key={failure.row}>Row {failure.row}: {failure.message}</li>
              ))}
            </ul>
          ) : null}
        </div>
      ) : null}

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <input
          aria-label="Search contacts"
          placeholder="Search name, phone or company"
          value={search}
          onChange={(event) => { setSearch(event.target.value); setPage(1); }}
          className="h-9 min-w-[220px] flex-1 rounded-lg border border-slate-300 bg-white px-3 text-[13px] outline-none focus:border-blue-600 focus:ring-2 focus:ring-blue-600/20 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
        />
        {kind === "BROKER" ? (
          <>
            <select aria-label="Segment" value={filters.segment} onChange={(e) => { setFilters((f) => ({ ...f, segment: e.target.value })); setPage(1); }} className="h-9 rounded-lg border border-slate-300 bg-white px-2 text-[13px]">
              <option value="">All segments</option>
              {SEGMENT_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
            <select aria-label="Channel partner status" value={filters.cpStatus} onChange={(e) => { setFilters((f) => ({ ...f, cpStatus: e.target.value })); setPage(1); }} className="h-9 rounded-lg border border-slate-300 bg-white px-2 text-[13px]">
              <option value="">Any CP status</option>
              {CP_STATUS_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
            <select aria-label="Transaction type" value={filters.transactionType} onChange={(e) => { setFilters((f) => ({ ...f, transactionType: e.target.value })); setPage(1); }} className="h-9 rounded-lg border border-slate-300 bg-white px-2 text-[13px]">
              <option value="">Any transaction</option>
              {TRANSACTION_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
            <input aria-label="Area" placeholder="Area" value={filters.area} onChange={(e) => { setFilters((f) => ({ ...f, area: e.target.value })); setPage(1); }} className="h-9 w-32 rounded-lg border border-slate-300 bg-white px-2 text-[13px]" />
            <select aria-label="Source" value={filters.source} onChange={(e) => { setFilters((f) => ({ ...f, source: e.target.value })); setPage(1); }} className="h-9 rounded-lg border border-slate-300 bg-white px-2 text-[13px]">
              <option value="">Any source</option>
              <option value="RERA_IMPORT">RERA list</option>
              <option value="MANUAL">Added manually</option>
              <option value="LEAD">From leads</option>
              <option value="BULK">Bulk upload</option>
            </select>
          </>
        ) : (
          <label className="flex items-center gap-1.5 text-[13px] text-slate-600">
            <input type="checkbox" checked={filters.stale === "true"} onChange={(e) => { setFilters((f) => ({ ...f, stale: e.target.checked ? "true" : "" })); setPage(1); }} />
            Not verified recently
          </label>
        )}
        {isManagement ? (
          <Button variant="secondary" leftIcon={Download} onClick={async () => {
            try {
              const { data } = await api.get("/contacts/export", { params: { kind } });
              const XLSX = await import("xlsx");
              const rows = (data.contacts || []).map((c) => ({
                Name: c.name, Phone: c.phone, "Alternate phone": c.alternatePhone || "", WhatsApp: c.whatsapp || "", Email: c.email || "",
                Firm: c.firmId?.name || c.company || "", City: c.city || "", Segments: (c.segments || []).join(", "), Areas: (c.areas || []).join(", "),
                Projects: (c.projects || []).join(", "), "CP status": c.cpStatus || "", "RERA no.": c.reraNumber || "", Verified: c.verified ? "Yes" : "No",
                "Relationship owner": c.relationshipOwnerId?.name || "", "Last contact": c.lastContactAt ? String(c.lastContactAt).slice(0, 10) : "",
                "Next follow-up": c.nextFollowUpAt ? String(c.nextFollowUpAt).slice(0, 10) : "", Notes: c.notes || "",
                ...(c.brokerageTerms !== undefined ? { "Brokerage terms": c.brokerageTerms || "", "Net rates": c.netRateNotes || "", "Internal remarks": c.internalRemarks || "" } : {}),
              }));
              const wb = XLSX.utils.book_new();
              XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(rows.length ? rows : [{ Note: "No records" }]), title.slice(0, 30));
              XLSX.writeFile(wb, `${kind === "BROKER" ? "brokers" : "owners"}-backup-${new Date().toISOString().slice(0, 10)}.xlsx`);
            } catch (exportError) {
              setError(exportError.response?.data?.message || "Export failed");
            }
          }}>Export all</Button>
        ) : null}
        {kind === "BROKER" && isManagement && canWrite ? (
          <>
            <input ref={reraRef} type="file" accept=".csv,.xlsx,.xls" className="hidden" onChange={(event) => handleReraFile(event.target.files?.[0])} />
            <Button variant="secondary" leftIcon={FileUp} disabled={importing} onClick={() => reraRef.current?.click()} title="Columns: Name, Mobile, RERA No, Firm, Email, City">
              Import RERA list
            </Button>
          </>
        ) : null}
        {canWrite ? (
          <>
            <input
              ref={fileRef}
              type="file"
              accept=".csv,.xlsx,.xls,text/csv"
              className="hidden"
              onChange={(event) => handleFile(event.target.files?.[0])}
            />
            <Button variant="secondary" leftIcon={importing ? undefined : Upload} disabled={importing} onClick={() => fileRef.current?.click()}>
              {importing ? <Loader2 size={14} className="animate-spin" /> : null}
              {importing ? "Importing…" : "Bulk upload"}
            </Button>
            <Button variant="secondary" leftIcon={Download} onClick={() => downloadContactTemplate(kind)} title="Download a CSV template">
              Template
            </Button>
            <Button leftIcon={Plus} onClick={() => setEditing({ ...EMPTY_CONTACT })}>
              Add {label}
            </Button>
          </>
        ) : null}
      </div>

      {loading ? (
        <p className="text-sm text-slate-500">Loading contacts…</p>
      ) : rows.length === 0 ? (
        <div className="rounded-xl border border-dashed border-slate-300 p-8 text-center dark:border-slate-700">
          <p className="text-sm text-slate-500">
            {search ? "No contacts match that search." : `No ${label}s yet.`}
          </p>
          {!search && canWrite ? (
            <Button className="mt-3" leftIcon={Plus} onClick={() => setEditing({ ...EMPTY_CONTACT })}>
              Add the first {label}
            </Button>
          ) : null}
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {rows.map((row) => (
            <article key={row._id} className="flex flex-col rounded-xl border border-slate-200 p-4 dark:border-slate-700">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <Link to={`${kind === "BROKER" ? "/inventory/brokers" : "/inventory/owners"}/${row._id}`} className="block truncate font-semibold text-blue-700 hover:underline dark:text-blue-300">{row.name}</Link>
                  <p className="truncate text-sm text-slate-600 dark:text-slate-300">{row.phone}</p>
                  {row.email ? <p className="truncate text-sm text-slate-500">{row.email}</p> : null}
                  {row.company || row.city ? (
                    <p className="truncate text-sm text-slate-500">{[row.company, row.city].filter(Boolean).join(" · ")}</p>
                  ) : null}
                </div>
                {canWrite ? (
                  <div className="flex shrink-0 items-center gap-2">
                    <button type="button" onClick={() => setEditing(row)} className="text-sm font-semibold text-blue-600 hover:underline">
                      Edit
                    </button>
                    <button type="button" onClick={() => handleDelete(row)} title={`Remove ${row.name}`} aria-label={`Remove ${row.name}`} className="rounded p-1 text-rose-500 hover:bg-rose-500/10">
                      <Trash2 size={14} />
                    </button>
                  </div>
                ) : null}
              </div>
              {row.propertyDetails ? <p className="mt-2 line-clamp-2 text-sm text-slate-600 dark:text-slate-300">{row.propertyDetails}</p> : null}
              {row.notes ? <p className="line-clamp-2 text-sm text-slate-500">{row.notes}</p> : null}
              {kind === "BROKER" ? (
                <div className="mt-2 flex flex-wrap gap-1 text-[11px] font-semibold">
                  <span className={`rounded-full px-2 py-0.5 ${toneOf(CP_STATUS_OPTIONS, row.cpStatus || "NOT_ONBOARDED")}`}>{labelOf(CP_STATUS_OPTIONS, row.cpStatus || "NOT_ONBOARDED")}</span>
                  {row.firmId?.name ? <span className="rounded-full bg-slate-100 px-2 py-0.5 text-slate-600">{row.firmId.name}</span> : null}
                  {(row.segments || []).map((s) => <span key={s} className="rounded-full bg-blue-50 px-2 py-0.5 text-blue-700">{labelOf(SEGMENT_OPTIONS, s)}</span>)}
                  {row.source === "RERA_IMPORT" && !row.verified ? <span className="rounded-full bg-violet-50 px-2 py-0.5 text-violet-700">RERA - unverified</span> : null}
                </div>
              ) : row.lastVerifiedAt ? null : (
                <p className="mt-2 inline-flex items-center gap-1 text-[11.5px] font-semibold text-amber-700"><AlertTriangle size={11} /> Not verified</p>
              )}
              <p className="mt-auto flex flex-wrap items-center gap-x-2 pt-2 text-xs text-slate-500">
                <span>{row.inventoryIds?.length || 0} properties · {row.leadIds?.length || 0} leads</span>
                {kind === "BROKER" && row.blockedLeadCount > 0 ? (
                  <button type="button" onClick={() => openBlocked(row)} className="inline-flex items-center gap-1 font-semibold text-amber-700 hover:underline">
                    <ShieldAlert size={12} />
                    {row.blockedLeadCount} kept out
                  </button>
                ) : null}
              </p>
            </article>
          ))}
        </div>
      )}

      <div className="mt-4 flex items-center justify-between text-sm">
        <button type="button" disabled={page === 1} onClick={() => setPage((value) => value - 1)} className="disabled:opacity-40">Previous</button>
        <span className="text-slate-500">{total} contacts · Page {page} of {lastPage}</span>
        <button type="button" disabled={page >= lastPage} onClick={() => setPage((value) => value + 1)} className="disabled:opacity-40">Next</button>
      </div>

      {editing ? (
        <ContactFormDialog
          // A different record is a different form: remount rather than sync.
          key={editing._id || "new"}
          open
          kind={kind}
          contact={editing}
          saving={saving}
          onClose={() => setEditing(null)}
          onSubmit={handleSubmit}
        />
      ) : null}

      {blocked ? (
        <div role="dialog" aria-label={`Leads kept out for ${blocked.name}`} className="fixed inset-0 z-[90] grid place-items-center bg-slate-950/40 p-4" onClick={() => setBlocked(null)}>
          <div className="max-h-[70vh] w-full max-w-lg overflow-auto rounded-xl bg-white p-4 dark:bg-slate-900" onClick={(event) => event.stopPropagation()}>
            <div className="flex items-start justify-between gap-3">
              <h3 className="font-semibold text-slate-900 dark:text-slate-100">Leads kept out — {blocked.name}</h3>
              <button type="button" onClick={() => setBlocked(null)} className="text-sm font-semibold text-slate-500">Close</button>
            </div>
            <p className="mt-1 text-xs text-slate-500">Enquiries refused because this number is in the Broker Database. The most recent 50 are kept.</p>
            {blocked.loading ? <p className="mt-3 text-sm">Loading…</p> : null}
            {blocked.error ? <p role="alert" className="mt-3 text-sm text-rose-600">{blocked.error}</p> : null}
            {!blocked.loading && !blocked.error ? (
              <ul className="mt-3 space-y-2">
                {blocked.entries.length === 0 ? <li className="text-sm text-slate-500">Nothing yet.</li> : null}
                {blocked.entries.map((entry, index) => (
                  <li key={index} className="rounded-lg border border-slate-200 p-2 text-sm dark:border-slate-700">
                    <span className="font-medium">{entry.name || "Unnamed enquiry"}</span> · {entry.phone}
                    <span className="block text-xs text-slate-500">{entry.origin} · {new Date(entry.at).toLocaleString("en-IN")}</span>
                  </li>
                ))}
              </ul>
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  );
};

export default ContactDatabasePage;
