import React, { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Link, useNavigate } from "react-router-dom";
import {
  AlertTriangle, BadgeCheck, Building2, ChevronDown, ChevronRight, ChevronUp, CircleCheck, Download, FileSpreadsheet, FileUp, Hourglass,
  Loader2, Mail, MessageCircle, Pencil, Phone, Plus, Search, ShieldAlert, ShieldQuestion, Trash2, Upload, Users, X, XCircle,
} from "lucide-react";
import api from "../../../services/api";
import { deleteOutcomeMessage, isDeleteApprovalPending } from "../../../services/deleteRequestService";
import { usePermissions } from "../../../context/usePermissions";
import { parseContactFile, downloadContactTemplate } from "../contactBulkImport";
import { importReraBrokers } from "../../../services/relationshipService";
import { CP_STATUS_OPTIONS, SEGMENT_OPTIONS, TRANSACTION_OPTIONS, labelOf } from "../relationshipOptions";
import ContactEditDrawer from "./ContactEditDrawer";
import { Avatar, GhostButton, IconTile, Pill, PrimaryButton } from "./contactGlassUi";
import { CP_TONE, FNT, MUT, TONE, field, glassCard, prettyPhone, telHref, waHref } from "./contactGlassTokens";

/*
 * One implementation behind both the Owner and the Broker page (CRM Web Glass
 * "Broker Database" design): header actions with an Import / export tray,
 * stat tiles that double as quick filters, a filter bar with removable chips,
 * and contact cards with call / WhatsApp shortcuts.
 *
 * The two kinds differ in what the records mean, not how they are kept. Only
 * the broker page carries CP status, segments and the blocked-lead count,
 * because only brokers gate lead intake.
 */

const EMPTY_FILTERS = { segment: "", cpStatus: "", transactionType: "", area: "", source: "", stale: "", verified: "" };
const SOURCE_OPTIONS = [["RERA_IMPORT", "RERA list"], ["MANUAL", "Added manually"], ["LEAD", "From leads"], ["BULK", "Bulk upload"]];

const FilterSelect = ({ label, value, onChange, options, placeholder }) => (
  <span className="relative flex h-[42px] min-w-[130px] flex-[0_1_170px] items-center rounded-[13px]" style={{ ...field, borderColor: value ? "var(--g-b)" : undefined }}>
    <select aria-label={label} value={value} onChange={onChange} className="h-full w-full cursor-pointer appearance-none border-0 bg-transparent pl-3.5 pr-8 text-[13px] font-medium outline-none" style={{ color: "var(--g-ink)" }} data-bare-input>
      <option value="">{placeholder}</option>
      {options.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
    </select>
    <ChevronDown size={14} className="pointer-events-none absolute right-3" style={MUT} aria-hidden="true" />
  </span>
);

const ContactDatabasePage = ({ kind, title, blurb }) => {
  const navigate = useNavigate();
  const { canPageAction, role } = usePermissions();
  const isManagement = ["ADMIN", "MANAGER"].includes(String(role || localStorage.getItem("role") || "").toUpperCase());
  const isBroker = kind === "BROKER";
  const label = isBroker ? "broker" : "owner";
  const base = isBroker ? "/inventory/brokers" : "/inventory/owners";
  const canWrite = canPageAction("inventory", "create");
  const reraRef = useRef(null);
  const fileRef = useRef(null);

  const [filters, setFilters] = useState(EMPTY_FILTERS);
  const [rows, setRows] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [version, setVersion] = useState(0);
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState(null);
  const [toolsOpen, setToolsOpen] = useState(false);
  const [canSeeRestricted, setCanSeeRestricted] = useState(isManagement);

  // null when closed; {} to add, or the contact being edited.
  const [editing, setEditing] = useState(null);
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [blocked, setBlocked] = useState(null);

  const setFilter = (key, value) => { setFilters((f) => ({ ...f, [key]: value })); setPage(1); };
  const refresh = useCallback(() => setVersion((value) => value + 1), []);

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
          if (typeof data.canSeeRestricted === "boolean") setCanSeeRestricted(data.canSeeRestricted);
          setError("");
        })
        .catch((requestError) => { if (active) setError(requestError.response?.data?.message || "Unable to load contacts"); })
        .finally(() => { if (active) setLoading(false); });
    }, 200);
    return () => { active = false; clearTimeout(timer); };
  }, [kind, search, page, version, filters]);

  // Headline counts for the stat tiles - totals only, independent of filters.
  useEffect(() => {
    let active = true;
    const count = (params = {}) => api.get("/contacts", { params: { kind, page: 1, ...params } }).then(({ data }) => Number(data.total || 0)).catch(() => null);
    const asks = isBroker
      ? [count(), count({ cpStatus: "ACTIVE" }), count({ cpStatus: "NOT_ONBOARDED" }), count({ verified: "false" })]
      : [count(), count({ stale: "true" })];
    Promise.all(asks).then((values) => { if (active) setStats(values); });
    return () => { active = false; };
  }, [kind, isBroker, version]);

  useEffect(() => {
    if (!notice) return undefined;
    const timer = setTimeout(() => setNotice(""), 3500);
    return () => clearTimeout(timer);
  }, [notice]);

  const handleDelete = async (contact) => {
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
    setImporting(true); setError(""); setNotice(""); setImportResult(null);
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
      const sheetRows = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { defval: "" });
      if (!sheetRows.length) throw new Error("No rows found in the file.");
      const data = await importReraBrokers(sheetRows);
      setImportResult({ fileName: file.name, createdCount: data.created, updatedCount: data.updated, failedCount: data.skipped, failures: data.errors });
      refresh();
    } catch (importError) {
      setError(importError.response?.data?.message || importError.message || "Unable to import the RERA list");
    } finally {
      setImporting(false);
      if (reraRef.current) reraRef.current.value = "";
    }
  };

  const exportAll = async () => {
    try {
      const { data } = await api.get("/contacts/export", { params: { kind } });
      const XLSX = await import("xlsx");
      const out = (data.contacts || []).map((c) => ({
        Name: c.name, Phone: c.phone, "Alternate phone": c.alternatePhone || "", WhatsApp: c.whatsapp || "", Email: c.email || "",
        Firm: c.firmId?.name || c.company || "", City: c.city || "", Segments: (c.segments || []).join(", "), Areas: (c.areas || []).join(", "),
        Projects: (c.projects || []).join(", "), "CP status": c.cpStatus || "", "RERA no.": c.reraNumber || "", Verified: c.verified ? "Yes" : "No",
        "Relationship owner": c.relationshipOwnerId?.name || "", "Last contact": c.lastContactAt ? String(c.lastContactAt).slice(0, 10) : "",
        "Next follow-up": c.nextFollowUpAt ? String(c.nextFollowUpAt).slice(0, 10) : "", Notes: c.notes || "",
        ...(c.brokerageTerms !== undefined ? { "Brokerage terms": c.brokerageTerms || "", "Net rates": c.netRateNotes || "", "Internal remarks": c.internalRemarks || "" } : {}),
      }));
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(out.length ? out : [{ Note: "No records" }]), title.slice(0, 30));
      XLSX.writeFile(wb, `${isBroker ? "brokers" : "owners"}-backup-${new Date().toISOString().slice(0, 10)}.xlsx`);
    } catch (exportError) {
      setError(exportError.response?.data?.message || "Export failed");
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

  const tools = [
    ...(isManagement ? [{ icon: Download, label: "Export all", sub: `Excel of every ${label}`, go: exportAll }] : []),
    ...(isBroker && isManagement && canWrite ? [{ icon: FileUp, label: "Import RERA list", sub: "Name, Mobile, RERA No, Firm, Email, City", go: () => reraRef.current?.click() }] : []),
    ...(canWrite ? [
      { icon: Upload, label: importing ? "Importing…" : "Bulk upload", sub: "From a filled template", go: () => fileRef.current?.click(), busy: importing },
      { icon: FileSpreadsheet, label: "Download template", sub: "Blank sheet with the columns", go: () => downloadContactTemplate(kind) },
    ] : []),
  ];

  const statTiles = isBroker
    ? [
      { key: null, icon: Users, tone: "a", value: stats?.[0], label: `Total ${label}s` },
      { key: ["cpStatus", "ACTIVE"], icon: CircleCheck, tone: "ok", value: stats?.[1], label: "Active channel partners" },
      { key: ["cpStatus", "NOT_ONBOARDED"], icon: Hourglass, tone: "mute", value: stats?.[2], label: "Not onboarded" },
      { key: ["verified", "false"], icon: ShieldQuestion, tone: "warn", value: stats?.[3], label: "Need verification" },
    ]
    : [
      { key: null, icon: Users, tone: "a", value: stats?.[0], label: `Total ${label}s` },
      { key: ["stale", "true"], icon: AlertTriangle, tone: "warn", value: stats?.[1], label: "Not verified recently" },
    ];

  const activeChips = [
    ...(filters.segment ? [["segment", labelOf(SEGMENT_OPTIONS, filters.segment)]] : []),
    ...(filters.cpStatus ? [["cpStatus", labelOf(CP_STATUS_OPTIONS, filters.cpStatus)]] : []),
    ...(filters.transactionType ? [["transactionType", labelOf(TRANSACTION_OPTIONS, filters.transactionType)]] : []),
    ...(filters.source ? [["source", SOURCE_OPTIONS.find(([v]) => v === filters.source)?.[1] || filters.source]] : []),
    ...(filters.area ? [["area", `Area: ${filters.area}`]] : []),
    ...(filters.verified === "false" ? [["verified", "Need verification"]] : []),
    ...(filters.stale === "true" ? [["stale", "Not verified recently"]] : []),
  ];
  const clearAll = () => { setFilters(EMPTY_FILTERS); setSearch(""); setPage(1); };
  const lastPage = Math.max(1, Math.ceil(total / 50));

  return (
    <div className="ui-page-shell custom-scrollbar h-full overflow-auto" style={{ color: "var(--g-ink)" }}>
      <div className="flex flex-col gap-4 pb-4">
        {/* Heading */}
        <div className="flex flex-wrap items-start gap-4">
          <div className="flex min-w-0 flex-[1_1_420px] flex-col gap-1.5 pl-1">
            <nav className="flex flex-wrap items-center gap-2 text-[13px]" style={MUT} aria-label="Breadcrumb">
              <Link to="/inventory" className="hover:underline">Inventory</Link>
              <ChevronRight size={12} aria-hidden="true" />
              <span className="font-medium" style={{ color: "var(--g-ink)" }}>{title}</span>
              <span className="mx-1 opacity-40">|</span>
              <Link to={isBroker ? "/inventory/owners" : "/inventory/brokers"} className="font-medium hover:underline" style={{ color: "var(--g-b)" }}>
                {isBroker ? "Owner Database" : "Broker Database"}
              </Link>
            </nav>
            <p className="max-w-[640px] text-[13.5px] leading-5" style={MUT}>{blurb}</p>
          </div>
          <div className="flex flex-wrap gap-2">
            {tools.length ? (
              <GhostButton onClick={() => setToolsOpen((v) => !v)} aria-expanded={toolsOpen}>
                <Upload size={16} />Import / export{toolsOpen ? <ChevronUp size={14} style={MUT} /> : <ChevronDown size={14} style={MUT} />}
              </GhostButton>
            ) : null}
            {canWrite ? <PrimaryButton onClick={() => setEditing({})}><Plus size={18} />Add {label}</PrimaryButton> : null}
          </div>
        </div>

        <input ref={fileRef} type="file" accept=".csv,.xlsx,.xls,text/csv" className="hidden" onChange={(event) => handleFile(event.target.files?.[0])} />
        <input ref={reraRef} type="file" accept=".csv,.xlsx,.xls" className="hidden" onChange={(event) => handleReraFile(event.target.files?.[0])} />

        {toolsOpen && tools.length ? (
          <div className="grid gap-2.5 [grid-template-columns:repeat(auto-fit,minmax(200px,1fr))]">
            {tools.map((t) => (
              <button key={t.label} type="button" onClick={t.go} disabled={t.busy} className="flex items-center gap-3 rounded-2xl px-3.5 py-3 text-left transition hover:-translate-y-0.5 disabled:opacity-60" style={glassCard}>
                <IconTile icon={t.busy ? Loader2 : t.icon} size={36} radius={11} iconSize={17} />
                <span className="flex min-w-0 flex-col"><span className="text-[13.5px] font-medium">{t.label}</span><span className="truncate text-[11.5px]" style={MUT}>{t.sub}</span></span>
              </button>
            ))}
          </div>
        ) : null}

        {error ? <p role="alert" className="rounded-2xl px-4 py-3 text-[13px]" style={{ background: "var(--g-bads)", color: "var(--g-bad)" }}>{error}</p> : null}
        {importResult ? (
          <div role="status" className="rounded-2xl px-4 py-3 text-[13px]" style={{ background: "var(--g-bs)", color: "var(--g-ink)" }}>
            <p className="font-semibold">{importResult.fileName}: {importResult.createdCount} added, {importResult.updatedCount} updated, {importResult.failedCount} skipped</p>
            {importResult.failures?.length ? (
              <ul className="mt-2 max-h-40 space-y-0.5 overflow-auto text-[12px]" style={MUT}>
                {importResult.failures.map((failure) => <li key={failure.row}>Row {failure.row}: {failure.message}</li>)}
              </ul>
            ) : null}
          </div>
        ) : null}

        {/* Stat tiles - also quick filters */}
        <div className="grid gap-2.5 [grid-template-columns:repeat(auto-fit,minmax(170px,1fr))]">
          {statTiles.map((s) => {
            const on = s.key ? filters[s.key[0]] === s.key[1] : false;
            return (
              <button
                key={s.label}
                type="button"
                aria-pressed={s.key ? on : undefined}
                onClick={() => (s.key ? setFilter(s.key[0], on ? "" : s.key[1]) : clearAll())}
                className="flex items-center gap-3 rounded-[18px] p-3.5 text-left transition hover:-translate-y-0.5"
                style={{ ...glassCard, ...(on ? { background: "var(--g-glassHi)", borderColor: "var(--g-b)" } : {}) }}
              >
                <IconTile icon={s.icon} tone={s.tone} />
                <span className="flex min-w-0 flex-col">
                  <span className="text-[22px] font-semibold leading-[26px]">{s.value ?? "–"}</span>
                  <span className="truncate text-[12.5px]" style={MUT}>{s.label}</span>
                </span>
              </button>
            );
          })}
        </div>

        {/* Filter bar */}
        <div className="flex flex-col gap-2.5 rounded-[20px] p-3" style={glassCard}>
          <div className="flex flex-wrap items-center gap-2">
            <span className="flex h-[42px] min-w-0 flex-[1_1_260px] items-center gap-2 rounded-[13px] px-3.5" style={field}>
              <Search size={16} style={FNT} aria-hidden="true" />
              <input
                data-bare-input
                aria-label={`Search ${label}s`}
                placeholder={isBroker ? "Search name, phone, firm or RERA no." : "Search name, phone or company"}
                value={search}
                onChange={(event) => { setSearch(event.target.value); setPage(1); }}
                className="h-full min-w-0 flex-1 border-0 bg-transparent text-[13.5px] outline-none"
                style={{ color: "var(--g-ink)" }}
              />
              {search ? <button type="button" aria-label="Clear search" onClick={() => setSearch("")} style={FNT}><X size={15} /></button> : null}
            </span>
            {isBroker ? (
              <>
                <FilterSelect label="Segment" value={filters.segment} onChange={(e) => setFilter("segment", e.target.value)} placeholder="All segments" options={SEGMENT_OPTIONS.map((o) => [o.value, o.label])} />
                <FilterSelect label="Channel partner status" value={filters.cpStatus} onChange={(e) => setFilter("cpStatus", e.target.value)} placeholder="Any CP status" options={CP_STATUS_OPTIONS.map((o) => [o.value, o.label])} />
                <FilterSelect label="Transaction type" value={filters.transactionType} onChange={(e) => setFilter("transactionType", e.target.value)} placeholder="Any transaction" options={TRANSACTION_OPTIONS.map((o) => [o.value, o.label])} />
                <FilterSelect label="Source" value={filters.source} onChange={(e) => setFilter("source", e.target.value)} placeholder="Any source" options={SOURCE_OPTIONS} />
                <span className="flex h-[42px] min-w-[120px] flex-[0_1_150px] items-center rounded-[13px] px-3.5" style={{ ...field, borderColor: filters.area ? "var(--g-b)" : undefined }}>
                  <input data-bare-input aria-label="Area" placeholder="Area" value={filters.area} onChange={(e) => setFilter("area", e.target.value)} className="h-full min-w-0 flex-1 border-0 bg-transparent text-[13px] outline-none" style={{ color: "var(--g-ink)" }} />
                </span>
              </>
            ) : null}
          </div>
          {activeChips.length || search ? (
            <div className="flex flex-wrap items-center gap-1.5">
              {activeChips.map(([key, text]) => (
                <button key={key} type="button" onClick={() => setFilter(key, "")} className="flex h-7 items-center gap-1.5 rounded-full pl-3 pr-1.5 text-[12px] font-medium" style={{ background: "var(--g-bs)", color: "var(--g-b)" }}>
                  {text}<XCircle size={15} />
                </button>
              ))}
              <button type="button" onClick={clearAll} className="px-1.5 text-[12px] font-medium" style={MUT}>Clear all</button>
            </div>
          ) : null}
        </div>

        {/* Cards */}
        {loading ? (
          <div className="grid gap-3 [grid-template-columns:repeat(auto-fill,minmax(min(100%,300px),1fr))]">
            {[0, 1, 2].map((i) => <div key={i} className="gl-skeleton h-[230px] rounded-[20px]" />)}
          </div>
        ) : rows.length === 0 ? (
          <div className="flex flex-col items-center gap-2 rounded-[20px] px-5 py-10 text-center" style={glassCard}>
            <Search size={28} style={FNT} />
            <span className="text-[15px] font-semibold">{search || activeChips.length ? `No ${label}s match` : `No ${label}s yet`}</span>
            {search || activeChips.length
              ? <button type="button" onClick={clearAll} className="text-[13px] font-medium" style={{ color: "var(--g-b)" }}>Clear filters</button>
              : canWrite ? <PrimaryButton className="mt-1" onClick={() => setEditing({})}><Plus size={16} />Add the first {label}</PrimaryButton> : null}
          </div>
        ) : (
          <div className="grid gap-3 [grid-template-columns:repeat(auto-fill,minmax(min(100%,300px),1fr))]">
            {rows.map((row) => {
              const cp = row.cpStatus || "NOT_ONBOARDED";
              const firm = row.firmId?.name || row.company;
              const sub = [firm || (row.brokerType ? (row.brokerType === "COMPANY" ? "Company broker" : "Independent") : ""), row.city].filter(Boolean).join(" · ");
              const open = () => navigate(`${base}/${row._id}`);
              return (
                <article
                  key={row._id}
                  role="link"
                  tabIndex={0}
                  onClick={open}
                  onKeyDown={(event) => { if (event.key === "Enter") open(); }}
                  className="group flex cursor-pointer flex-col gap-3.5 rounded-[20px] p-4 transition duration-200 hover:-translate-y-0.5"
                  style={glassCard}
                >
                  <div className="flex items-start gap-3">
                    <Avatar name={row.name} id={row._id} />
                    <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                      <span className="flex min-w-0 items-center gap-1.5">
                        <span className="truncate text-[15px] font-semibold">{row.name}</span>
                        {row.verified ? <BadgeCheck size={16} style={{ color: "var(--g-b)" }} aria-label="Verified" /> : null}
                      </span>
                      <span className="truncate text-[12.5px]" style={MUT}>{sub || "Profile incomplete"}</span>
                    </div>
                    {canWrite ? (
                      <div className="flex shrink-0 gap-0.5" onClick={(e) => e.stopPropagation()}>
                        <button type="button" title="Edit" aria-label={`Edit ${row.name}`} onClick={() => setEditing(row)} className="grid h-8 w-8 place-items-center rounded-[10px] transition hover:bg-[var(--g-bs)]" style={MUT}><Pencil size={16} /></button>
                        <button type="button" title="Remove" aria-label={`Remove ${row.name}`} onClick={() => handleDelete(row)} className="grid h-8 w-8 place-items-center rounded-[10px] transition hover:bg-[var(--g-bads)]" style={{ color: "var(--g-bad)" }}><Trash2 size={15} /></button>
                      </div>
                    ) : null}
                  </div>

                  <div className="flex flex-col gap-1.5 text-[13px]">
                    <span className="flex items-center gap-2"><Phone size={14} style={FNT} /><span className="font-mono text-[12.5px]">{prettyPhone(row.phone)}</span></span>
                    <span className="flex min-w-0 items-center gap-2"><Mail size={14} style={FNT} /><span className="truncate" style={row.email ? undefined : FNT}>{row.email || "No email added"}</span></span>
                    {!isBroker && row.propertyDetails ? <span className="flex min-w-0 items-start gap-2"><Building2 size={14} className="mt-0.5 shrink-0" style={FNT} /><span className="line-clamp-2" style={MUT}>{row.propertyDetails}</span></span> : null}
                  </div>

                  <div className="flex flex-wrap gap-1.5">
                    {isBroker ? <Pill tone={CP_TONE[cp] || "mute"}>{labelOf(CP_STATUS_OPTIONS, cp)}</Pill> : null}
                    {isBroker && !row.verified ? <Pill tone="warn">Not verified</Pill> : null}
                    {!isBroker && !row.lastVerifiedAt ? <Pill tone="warn">Not verified</Pill> : null}
                    {(row.segments || []).slice(0, 2).map((s) => <Pill key={s} tone="info">{labelOf(SEGMENT_OPTIONS, s)}</Pill>)}
                    {row.source === "RERA_IMPORT" && !row.verified ? <Pill tone="vio">From RERA list</Pill> : null}
                  </div>

                  <div className="mt-auto flex items-center gap-1.5 pt-3" style={{ borderTop: "1px solid var(--g-div)" }}>
                    <span className="flex flex-1 flex-col"><span className="text-[16px] font-semibold">{row.inventoryIds?.length || 0}</span><span className="text-[11px]" style={MUT}>properties</span></span>
                    <span className="flex flex-1 flex-col"><span className="text-[16px] font-semibold">{row.leadIds?.length || 0}</span><span className="text-[11px]" style={MUT}>leads</span></span>
                    {isBroker ? (
                      <button type="button" disabled={!row.blockedLeadCount} onClick={(e) => { e.stopPropagation(); openBlocked(row); }} className="flex flex-1 flex-col text-left disabled:cursor-default" title="Enquiries refused because this number is a broker">
                        <span className="text-[16px] font-semibold" style={{ color: row.blockedLeadCount ? "var(--g-warn)" : undefined }}>{row.blockedLeadCount || 0}</span>
                        <span className="text-[11px]" style={MUT}>kept out</span>
                      </button>
                    ) : null}
                    <div className="flex gap-1.5" onClick={(e) => e.stopPropagation()}>
                      <a href={telHref(row.phone)} title={`Call ${row.name}`} aria-label={`Call ${row.name}`} className="grid h-[34px] w-[34px] place-items-center rounded-[11px]" style={{ background: TONE.a[1], color: TONE.a[0] }}><Phone size={15} /></a>
                      <a href={waHref(row.whatsapp || row.phone)} target="_blank" rel="noreferrer" title={`WhatsApp ${row.name}`} aria-label={`WhatsApp ${row.name}`} className="grid h-[34px] w-[34px] place-items-center rounded-[11px]" style={{ background: TONE.ok[1], color: TONE.ok[0] }}><MessageCircle size={16} /></a>
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
        )}

        <div className="flex items-center justify-between text-[13px]" style={MUT}>
          <span>{total} {label}{total === 1 ? "" : "s"} · page {page} of {lastPage}</span>
          <div className="flex gap-1.5">
            <GhostButton className="h-[34px] px-3 text-[13px]" disabled={page === 1} onClick={() => setPage((v) => v - 1)}>Previous</GhostButton>
            <GhostButton className="h-[34px] px-3 text-[13px]" disabled={page >= lastPage} onClick={() => setPage((v) => v + 1)}>Next</GhostButton>
          </div>
        </div>
      </div>

      {editing ? (
        <ContactEditDrawer
          key={editing._id || "new"}
          kind={kind}
          contact={editing._id ? editing : null}
          canSeeRestricted={canSeeRestricted}
          onClose={() => setEditing(null)}
          onSaved={(_, message) => { setEditing(null); setNotice(message); refresh(); }}
        />
      ) : null}

      {blocked ? createPortal(
        <div role="dialog" aria-label={`Leads kept out for ${blocked.name}`} className="fixed inset-0 z-[120] grid place-items-center p-4" style={{ background: "rgba(13,22,40,.32)", backdropFilter: "blur(3px)" }} onClick={() => setBlocked(null)}>
          <div className="max-h-[70vh] w-full max-w-lg overflow-auto rounded-3xl p-5" style={{ background: "var(--g-modal)", border: "1px solid var(--g-line)", color: "var(--g-ink)", boxShadow: "0 30px 80px rgba(13,22,40,.25)" }} onClick={(event) => event.stopPropagation()}>
            <div className="flex items-start gap-3">
              <IconTile icon={ShieldAlert} tone="warn" />
              <div className="flex min-w-0 flex-1 flex-col"><span className="text-[16px] font-semibold">Leads kept out · {blocked.name}</span><span className="text-[12.5px]" style={MUT}>Enquiries refused because this number is in the Broker Database. The most recent 50 are kept.</span></div>
              <button type="button" aria-label="Close" onClick={() => setBlocked(null)} className="grid h-9 w-9 place-items-center rounded-[11px]" style={field}><X size={17} /></button>
            </div>
            {blocked.loading ? <p className="mt-4 flex items-center gap-2 text-[13px]" style={MUT}><Loader2 size={15} className="animate-spin" />Loading…</p> : null}
            {blocked.error ? <p role="alert" className="mt-4 text-[13px]" style={{ color: "var(--g-bad)" }}>{blocked.error}</p> : null}
            {!blocked.loading && !blocked.error ? (
              <ul className="mt-4 flex flex-col gap-2">
                {blocked.entries.length === 0 ? <li className="text-[13px]" style={MUT}>Nothing yet.</li> : null}
                {blocked.entries.map((entry, index) => (
                  <li key={index} className="rounded-2xl px-3.5 py-2.5 text-[13px]" style={field}>
                    <span className="font-medium">{entry.name || "Unnamed enquiry"}</span> · <span className="font-mono text-[12.5px]">{entry.phone}</span>
                    <span className="block text-[12px]" style={MUT}>{entry.origin} · {new Date(entry.at).toLocaleString("en-IN")}</span>
                  </li>
                ))}
              </ul>
            ) : null}
          </div>
        </div>,
        document.body,
      ) : null}

      {notice ? createPortal(
        <div role="status" className="fixed bottom-6 left-1/2 z-[130] flex -translate-x-1/2 items-center gap-2 rounded-xl px-4 py-2.5 text-[13px] font-medium text-white shadow-lg" style={{ background: "#0e1630" }}>
          <CircleCheck size={17} style={{ color: "#7fe0c6" }} />{notice}
        </div>,
        document.body,
      ) : null}
    </div>
  );
};

export default ContactDatabasePage;
