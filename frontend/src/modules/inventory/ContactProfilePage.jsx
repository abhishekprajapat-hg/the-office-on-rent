import React, { useCallback, useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { Link, useLocation, useNavigate, useParams } from "react-router-dom";
import {
  AlertCircle, AlertTriangle, ArrowLeft, BadgeCheck, Briefcase, Building2, CalendarClock, Check, CircleCheck, GitBranch, GitMerge, Handshake,
  IdCard, IndianRupee, Link2, Loader2, Lock, Mail, MapPin, Megaphone, MessageCircle, Pencil, Phone, RefreshCw, Search, Tag, Trophy, Users, X,
} from "lucide-react";
import { toErrorMessage } from "../../utils/errorMessage";
import { usePermissions } from "../../context/usePermissions";
import api from "../../services/api";
import { addInventorySource, getContactProfile, mergeContact } from "../../services/relationshipService";
import ContactEditDrawer from "./components/ContactEditDrawer";
import {
  AVAILABILITY_OPTIONS, CP_STATUS_OPTIONS, RELATIONSHIP_OPTIONS, SEGMENT_OPTIONS, TRANSACTION_OPTIONS, formatShortDate, labelOf,
} from "./relationshipOptions";
import { Avatar, GhostButton, IconTile, Pill, PrimaryButton } from "./components/contactGlassUi";
import { CP_TONE, FNT, MUT, TONE, field, glassCard, prettyPhone, telHref, waHref } from "./components/contactGlassTokens";

/*
 * Owner or broker profile (requirements 16 Oct 2026, 6.1-6.4, 17.1-17.2) in
 * the CRM Web Glass "Broker Database" design: hero with contact shortcuts,
 * KPI tiles, linked inventory and referred leads on the left, details,
 * relationship and the restricted terms on the right.
 */

const money = (v) => (v === null || v === undefined || v === "" ? "–" : `₹${Number(v).toLocaleString("en-IN")}`);
const titleCase = (s) => String(s || "").replaceAll("_", " ").toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase());
const AVAIL_TONE = { AVAILABLE: "ok", ON_HOLD: "warn", BOOKED: "info", SOLD: "bad", WITHDRAWN: "mute", UNVERIFIED: "mute" };

const Panel = ({ title, icon: Icon, action, children, className = "", tone }) => (
  <section className={`overflow-hidden rounded-[22px] ${className}`} style={tone === "restricted" ? { background: "var(--g-warns)", border: "1px solid color-mix(in srgb, var(--g-warn) 25%, transparent)" } : glassCard}>
    <header className="flex items-center gap-2.5 px-[18px] py-3.5" style={{ borderBottom: `1px solid ${tone === "restricted" ? "color-mix(in srgb, var(--g-warn) 20%, transparent)" : "var(--g-div)"}` }}>
      {Icon ? <Icon size={17} style={{ color: tone === "restricted" ? "var(--g-warn)" : "var(--g-b)" }} /> : null}
      <span className="flex-1 text-[15px] font-semibold">{title}</span>
      {action}
    </header>
    {children}
  </section>
);

const DetailRow = ({ icon: Icon, label, value, first }) => (
  <div className="flex items-center gap-2.5 py-2" style={first ? undefined : { borderTop: "1px solid var(--g-div)" }}>
    {Icon ? <Icon size={15} style={FNT} /> : null}
    <span className="flex-1 text-[13px]" style={MUT}>{label}</span>
    <span className="max-w-[60%] text-right text-[13px] font-medium" style={value ? undefined : FNT}>{value || "Not added"}</span>
  </div>
);

/*
 * The unit list in the link dialog. Everything on the books is listed under
 * its category, because a broker's unit is often one nobody has named yet -
 * asking for a search term first meant staring at an empty dialog.
 */
const INVENTORY_LIST_FIELDS = "_id,propertyId,projectName,towerName,unitNumber,inventoryType,category,location,city,area,status,type,price,rent";
// The unit's own kind (Office, Shop, Flat, Plot…). Grouping on this rather
// than on inventoryType, which older records left at its Commercial default.
const categoryOf = (unit = {}) => String(unit.category || "").trim() || "Other";
const unitLabel = (unit = {}) => {
  const id = String(unit.propertyId || "").trim();
  // Many units are numbered after their property ID; printing it twice only
  // pushes the project name out of view.
  const name = [unit.projectName, unit.towerName, unit.unitNumber]
    .map((v) => String(v || "").trim())
    .filter((part, index, all) => part && part !== id && all.indexOf(part) === index)
    .join(" · ");
  return [id, name].filter(Boolean).join(" · ") || "Unit";
};
const unitMeta = (unit = {}) => [[unit.area, unit.city].filter(Boolean).join(", ") || unit.location, unit.type, unit.status]
  .map((v) => String(v || "").trim()).filter(Boolean).join(" · ");

/* One go at the dialog can link this many units; the server allows 80 writes a minute. */
const LINK_SELECTION_LIMIT = 25;

/* Link existing inventory units to this broker (6.3 / 7.2 quick action). */
const LinkInventoryDialog = ({ broker, onClose, onLinked }) => {
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("");
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);
  // A broker usually brings several units at once, so this picks many.
  const [picked, setPicked] = useState([]);
  const [prices, setPrices] = useState({});
  const [progress, setProgress] = useState("");
  const [availability, setAvailability] = useState("AVAILABLE");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  // No search term lists everything; typing narrows it on the server.
  useEffect(() => {
    let active = true;
    const term = search.trim();
    const t = setTimeout(() => {
      setLoading(true);
      api.get("/inventory", {
        params: { ...(term ? { search: term } : {}), limit: 200, page: 1, fields: INVENTORY_LIST_FIELDS },
      })
        .then(({ data }) => { if (active) setRows(data.assets || []); })
        .catch((e) => { if (active) { setRows([]); setError(toErrorMessage(e, "Couldn't load inventory")); } })
        .finally(() => { if (active) setLoading(false); });
    }, term ? 250 : 0);
    return () => { active = false; clearTimeout(t); };
  }, [search]);

  useEffect(() => {
    const onKey = (event) => { if (event.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const isPicked = (unit) => picked.some((p) => p._id === unit._id);
  const toggle = (unit) => {
    setError("");
    setPicked((list) => {
      if (list.some((p) => p._id === unit._id)) return list.filter((p) => p._id !== unit._id);
      if (list.length >= LINK_SELECTION_LIMIT) {
        setError(`You can link ${LINK_SELECTION_LIMIT} units at a time. Link these, then pick the rest.`);
        return list;
      }
      return [...list, unit];
    });
  };

  const save = async () => {
    if (!picked.length) { setError("Choose at least one unit"); return; }
    setSaving(true); setError("");
    const failed = [];
    let done = 0;
    // One call per unit, in order, so a single refusal does not lose the rest.
    for (const unit of picked) {
      setProgress(picked.length > 1 ? `Linking ${done + 1} of ${picked.length}…` : "");
      try {
        await addInventorySource(unit._id, { contactId: broker._id, askingPrice: prices[unit._id] || null, availability });
        done += 1;
      } catch (e) {
        failed.push(`${unit.propertyId || unitLabel(unit)} (${toErrorMessage(e, "failed")})`);
      }
    }
    setProgress("");
    setSaving(false);
    if (!failed.length) { onLinked(done); return; }
    // Whatever went through stays linked; the list keeps only what did not.
    setPicked((list) => list.filter((unit) => failed.some((text) => text.startsWith(String(unit.propertyId || "")))));
    setError(`${done ? `${done} linked. ` : ""}Couldn't link ${failed.length}: ${failed.slice(0, 3).join("; ")}${failed.length > 3 ? "…" : ""}`);
  };

  // Grouped by category, the biggest group first and "Other" always last.
  const counts = rows.reduce((all, unit) => ({ ...all, [categoryOf(unit)]: (all[categoryOf(unit)] || 0) + 1 }), {});
  const categories = Object.keys(counts).sort((a, b) => (a === "Other") - (b === "Other") || counts[b] - counts[a] || a.localeCompare(b));
  const groups = categories
    .filter((name) => !category || name === category)
    .map((name) => ({ label: name, units: rows.filter((unit) => categoryOf(unit) === name) }));
  const statusOptions = AVAILABILITY_OPTIONS.filter((o) => ["AVAILABLE", "ON_HOLD", "BOOKED", "SOLD", "UNVERIFIED"].includes(o.value));

  return createPortal(
    <>
      <button type="button" aria-label="Close" onClick={onClose} className="fixed inset-0 z-[120] cursor-default" style={{ background: "rgba(13,22,40,.32)", backdropFilter: "blur(3px)", WebkitBackdropFilter: "blur(3px)" }} />
      <div role="dialog" aria-modal="true" aria-label={`Link inventory to ${broker.name}`} className="fixed left-1/2 top-1/2 z-[121] flex max-h-[calc(100vh-40px)] w-[min(880px,calc(100vw-32px))] -translate-x-1/2 -translate-y-1/2 flex-col overflow-hidden rounded-3xl"
        style={{ background: "var(--g-modal)", border: "1px solid var(--g-line)", boxShadow: "0 30px 80px rgba(13,22,40,.25)", color: "var(--g-ink)", backdropFilter: "blur(var(--g-blur)) saturate(180%)", WebkitBackdropFilter: "blur(var(--g-blur)) saturate(180%)", fontFamily: "var(--font-body)" }}>
        <header className="flex items-start gap-3 px-5 pb-3.5 pt-[18px]">
          <IconTile icon={Link2} />
          <div className="flex min-w-0 flex-1 flex-col gap-0.5">
            <span className="text-[17px] font-semibold">Link inventory</span>
            <span className="text-[12.5px]" style={MUT}>Pick as many units as this broker brought - each one keeps its single record, with {broker.name} added as a source.</span>
          </div>
          <button type="button" onClick={onClose} aria-label="Close" className="grid h-[34px] w-[34px] place-items-center rounded-[11px]" style={field}><X size={17} /></button>
        </header>
        <div className="flex min-h-0 flex-col gap-3 overflow-y-auto px-5 pb-3.5">
          {error ? <p role="alert" className="rounded-xl px-3 py-2 text-[12.5px]" style={{ background: "var(--g-bads)", color: "var(--g-bad)" }}>{error}</p> : null}
          <span className="flex h-11 shrink-0 items-center gap-2 rounded-xl px-3.5" style={{ ...field, border: "1.5px solid var(--g-b)", boxShadow: "0 0 0 4px var(--g-bs)" }}>
            <Search size={16} style={{ color: "var(--g-b)" }} />
            <input data-bare-input autoFocus value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search project, building or property ID — or just pick below" className="h-full min-w-0 flex-1 border-0 bg-transparent text-[14px] outline-none" style={{ color: "var(--g-ink)" }} />
            {loading ? <Loader2 size={15} className="animate-spin" style={FNT} /> : null}
          </span>
          <div className="custom-scrollbar flex shrink-0 items-center gap-1.5 overflow-x-auto pb-1">
            {[{ value: "", label: `All · ${rows.length}` }, ...categories.map((name) => ({ value: name, label: `${name} · ${counts[name]}` }))].map((tab) => {
              const on = category === tab.value;
              return (
                <button key={tab.value || "all"} type="button" aria-pressed={on} onClick={() => setCategory(tab.value)}
                  className="h-8 shrink-0 whitespace-nowrap rounded-full px-3 text-[12.5px] font-medium transition"
                  style={on
                    ? { background: "var(--g-bs)", color: "var(--g-b)", border: "1px solid var(--g-b)" }
                    : { ...field, color: "var(--g-ink)" }}>
                  {tab.label}
                </button>
              );
            })}
          </div>
          <div className="flex min-h-[220px] flex-1 basis-[340px] flex-col gap-2.5 overflow-y-auto">
            {groups.map((group) => (
              <div key={group.label} className="flex flex-col gap-1.5">
                <span className="sticky top-0 z-[1] -mx-0.5 px-0.5 py-1 text-[11.5px] font-semibold uppercase tracking-[0.08em]" style={{ ...MUT, background: "var(--g-modal)" }}>{group.label} · {group.units.length}</span>
                <div className="grid gap-1.5 sm:grid-cols-2">
                {group.units.map((r) => {
                  const on = isPicked(r);
                  return (
                    <button key={r._id} type="button" role="checkbox" aria-checked={on} onClick={() => toggle(r)} className="flex items-center gap-3 rounded-2xl px-3 py-2.5 text-left transition"
                      style={{ ...field, border: `1.5px solid ${on ? "var(--g-b)" : "transparent"}`, background: on ? "var(--g-bs)" : field.background }}>
                      <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl" style={on ? { background: "var(--g-bfill, var(--g-b))", color: "#fff" } : { background: "var(--g-track)", color: "var(--g-mut)" }}>
                        <Building2 size={17} />
                      </span>
                      <span className="flex min-w-0 flex-1 flex-col">
                        <span className="truncate text-[13.5px] font-semibold">{unitLabel(r)}</span>
                        <span className="truncate text-[12px]" style={MUT}>{unitMeta(r)}</span>
                      </span>
                      <span className="grid h-5 w-5 shrink-0 place-items-center rounded-[7px] text-white" style={{ border: `2px solid ${on ? "var(--g-b)" : "var(--g-fnt)"}`, background: on ? "var(--g-b)" : "transparent" }}>
                        {on ? <Check size={13} strokeWidth={3} /> : null}
                      </span>
                    </button>
                  );
                })}
                </div>
              </div>
            ))}
            {!loading && !rows.length ? (
              <span className="px-0.5 py-2 text-[13px]" style={MUT}>{search.trim() ? "No units match." : "No inventory on the books yet."}</span>
            ) : null}
          </div>
          {picked.length ? (
            <div className="flex flex-col gap-2 rounded-2xl p-3" style={{ background: "var(--g-glass2)", border: "1px solid var(--g-edge, var(--g-line))" }}>
              <div className="flex items-center gap-2">
                <span className="flex-1 text-[13px] font-semibold">Selected · {picked.length}</span>
                <button type="button" onClick={() => setPicked([])} className="text-[12.5px] font-medium" style={{ color: "var(--g-b)" }}>Clear all</button>
              </div>
              <span className="text-[11.5px]" style={FNT}>The broker&apos;s asking price is per unit; the status below applies to all of them.</span>
              <div className="custom-scrollbar grid max-h-[168px] gap-2 overflow-y-auto sm:grid-cols-2">
              {picked.map((unit) => (
                <div key={unit._id} className="flex items-center gap-2">
                  <span className="min-w-0 flex-1 truncate text-[12.5px] font-medium">{unitLabel(unit)}</span>
                  <span className="flex h-9 w-[132px] shrink-0 items-center gap-1.5 rounded-xl px-2.5" style={field}>
                    <span style={MUT}>₹</span>
                    <input
                      data-bare-input
                      inputMode="numeric"
                      aria-label={`Broker's asking price for ${unitLabel(unit)}`}
                      value={prices[unit._id] || ""}
                      onChange={(e) => setPrices((all) => ({ ...all, [unit._id]: e.target.value.replace(/[^\d]/g, "") }))}
                      placeholder="Asking price"
                      className="h-full min-w-0 flex-1 border-0 bg-transparent text-[13px] outline-none"
                      style={{ color: "var(--g-ink)" }}
                    />
                  </span>
                  <button type="button" onClick={() => toggle(unit)} aria-label={`Remove ${unitLabel(unit)}`} className="grid h-8 w-8 shrink-0 place-items-center rounded-[10px]" style={field}><X size={14} /></button>
                </div>
              ))}
              </div>
            </div>
          ) : null}
          <div className="flex min-w-0 flex-col gap-1.5 sm:max-w-[260px]">
            <span className="text-[12.5px] font-medium" style={MUT}>Unit status per broker</span>
            <select value={availability} onChange={(e) => setAvailability(e.target.value)} className="h-11 rounded-xl px-3 text-[13.5px] outline-none" style={field}>
              {statusOptions.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </div>
          <span className="text-[12.5px]" style={MUT}>Unit not in the CRM? <Link to="/inventory" className="font-medium" style={{ color: "var(--g-b)" }}>Add it in Inventory</Link>, then link it here.</span>
        </div>
        <footer className="flex justify-end gap-2 px-5 py-3.5" style={{ borderTop: "1px solid var(--g-div)" }}>
          <GhostButton onClick={onClose}>Cancel</GhostButton>
          <PrimaryButton onClick={save} disabled={saving || !picked.length}>
            {saving ? <Loader2 size={15} className="animate-spin" /> : <Link2 size={15} />}
            {saving ? (progress || "Linking…") : picked.length > 1 ? `Link ${picked.length} units` : "Link unit"}
          </PrimaryButton>
        </footer>
      </div>
    </>,
    document.body,
  );
};

const ContactProfilePage = () => {
  const { contactId } = useParams();
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const kind = pathname.includes("/brokers/") ? "BROKER" : "OWNER";
  const isBroker = kind === "BROKER";
  const back = isBroker ? "/inventory/brokers" : "/inventory/owners";
  const { role } = usePermissions();
  const isManagement = ["ADMIN", "MANAGER"].includes(String(role || localStorage.getItem("role") || "").toUpperCase());
  const [data, setData] = useState(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [editing, setEditing] = useState(false);
  const [linking, setLinking] = useState(false);
  const [merging, setMerging] = useState("");

  const load = useCallback(async () => {
    try { setData(await getContactProfile(contactId)); setError(""); } catch (e) { setError(toErrorMessage(e, "Couldn't load this contact")); }
  }, [contactId]);
  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    if (!notice) return undefined;
    const t = setTimeout(() => setNotice(""), 3500);
    return () => clearTimeout(t);
  }, [notice]);

  const merge = async (dup) => {
    if (!window.confirm(`Merge ${dup.name} (${dup.phone}) into this record? Their leads, inventory and history move here and the duplicate is removed.`)) return;
    setMerging(dup._id); setError("");
    try {
      const out = await mergeContact(contactId, dup._id);
      setNotice(`Merged - moved ${out.moved.ownedInventory + out.moved.sourcedInventory} inventory link(s) and ${out.moved.referredLeads + out.moved.brokerLeads} lead link(s)`);
      await load();
    } catch (e) { setError(toErrorMessage(e, "Merge failed")); } finally { setMerging(""); }
  };

  if (!data) {
    return (
      <div className="ui-page-shell h-full overflow-auto" style={{ color: "var(--g-ink)" }}>
        <div className="flex flex-col gap-4">
          <Link to={back} className="inline-flex items-center gap-1.5 text-[13.5px]" style={MUT}><ArrowLeft size={16} /> {isBroker ? "Broker Database" : "Owner Database"}</Link>
          {error
            ? <p role="alert" className="rounded-2xl px-4 py-3 text-[13px]" style={{ background: "var(--g-bads)", color: "var(--g-bad)" }}>{error}</p>
            : (
              <>
                <div className="gl-skeleton h-[104px] rounded-3xl" />
                <div className="grid gap-2.5 [grid-template-columns:repeat(auto-fit,minmax(150px,1fr))]">{[0, 1, 2, 3, 4].map((i) => <div key={i} className="gl-skeleton h-[84px] rounded-[18px]" />)}</div>
                <div className="gl-skeleton h-[240px] rounded-[22px]" />
              </>
            )}
        </div>
      </div>
    );
  }

  const c = data.contact;
  const cp = c.cpStatus || "NOT_ONBOARDED";
  const firm = c.firmId?.name || c.company;
  const missing = (isBroker ? ["email", "city", "designation", "reraNumber"] : ["email", "city", "company"]).filter((k) => !c[k]).length
    + (isBroker && !c.brokerType ? 1 : 0) + (isBroker && !firm ? 1 : 0);

  const kpis = [
    [Building2, "Linked inventory", data.stats.inventoryCount, "a"],
    [RefreshCw, "Needs re-verification", data.stats.staleInventory, "warn"],
    ...(isBroker ? [[Users, "Referred leads", data.stats.referredLeads, "info"], [Trophy, "Closed deals", data.stats.closedDeals, "ok"]] : []),
    ...(isBroker && data.stats.brokerageReceived !== undefined ? [[IndianRupee, "Brokerage received", money(data.stats.brokerageReceived), "a"]] : []),
  ];
  const isZero = (v) => v === 0 || v === "₹0" || v === "–";

  return (
    <div className="ui-page-shell custom-scrollbar h-full overflow-auto" style={{ color: "var(--g-ink)" }}>
      <div className="flex flex-col gap-4 pb-4">
        <button type="button" onClick={() => navigate(back)} className="inline-flex items-center gap-1.5 self-start text-[13.5px] transition hover:text-[var(--g-b)]" style={MUT}>
          <ArrowLeft size={16} />{isBroker ? "Broker Database" : "Owner Database"}
        </button>
        {error ? <p role="alert" className="rounded-2xl px-4 py-3 text-[13px]" style={{ background: "var(--g-bads)", color: "var(--g-bad)" }}>{error}</p> : null}

        {/* Hero */}
        <section className="flex flex-wrap items-center gap-4 rounded-3xl p-5" style={glassCard}>
          <Avatar name={c.name} id={c._id} size={64} radius={20} text={22} />
          <div className="flex min-w-0 flex-[1_1_260px] flex-col gap-1.5">
            <span className="flex items-center gap-2 text-[22px] font-semibold tracking-[-.01em]">
              <span className="truncate">{c.name}</span>
              {c.verified ? <BadgeCheck size={20} style={{ color: "var(--g-b)" }} aria-label="Verified" /> : null}
            </span>
            <div className="flex flex-wrap items-center gap-1.5">
              {isBroker ? <Pill tone={CP_TONE[cp] || "mute"}>{labelOf(CP_STATUS_OPTIONS, cp)}</Pill> : null}
              {!c.verified ? <Pill tone="warn">Not verified</Pill> : null}
              {c.source === "RERA_IMPORT" ? <Pill tone="vio">From RERA list</Pill> : null}
              {(c.segments || []).map((s) => <Pill key={s} tone="info">{labelOf(SEGMENT_OPTIONS, s)}</Pill>)}
              {isBroker && c.cpOnboardedAt ? <span className="text-[12.5px]" style={MUT}>· Onboarded {formatShortDate(c.cpOnboardedAt)}</span> : null}
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <a href={telHref(c.phone)} title="Call" aria-label={`Call ${c.name}`} className="grid h-[42px] w-[42px] place-items-center rounded-[13px]" style={{ background: TONE.a[1], color: TONE.a[0] }}><Phone size={18} /></a>
            <a href={waHref(c.whatsapp || c.phone)} target="_blank" rel="noreferrer" title="WhatsApp" aria-label={`WhatsApp ${c.name}`} className="grid h-[42px] w-[42px] place-items-center rounded-[13px]" style={{ background: TONE.ok[1], color: TONE.ok[0] }}><MessageCircle size={18} /></a>
            {c.email ? <a href={`mailto:${c.email}`} title="Email" aria-label={`Email ${c.name}`} className="grid h-[42px] w-[42px] place-items-center rounded-[13px]" style={{ background: TONE.info[1], color: TONE.info[0] }}><Mail size={18} /></a> : null}
            {isBroker ? <GhostButton className="h-[42px]" onClick={() => setLinking(true)}><Link2 size={16} />Link inventory</GhostButton> : null}
            <PrimaryButton className="h-[42px]" onClick={() => setEditing(true)}><Pencil size={16} />Edit profile</PrimaryButton>
          </div>
        </section>

        {/* KPIs */}
        <div className="grid gap-2.5 [grid-template-columns:repeat(auto-fit,minmax(150px,1fr))]">
          {kpis.map(([Icon, label, value, tone]) => (
            <div key={label} className="flex flex-col gap-1.5 rounded-[18px] px-4 py-3.5" style={glassCard}>
              <span className="flex items-center gap-2 text-[12.5px]" style={MUT}>{React.createElement(Icon, { size: 16, style: { color: TONE[tone][0] } })}{label}</span>
              <span className="text-[24px] font-semibold" style={isZero(value) ? FNT : undefined}>{value}</span>
            </div>
          ))}
        </div>

        {data.possibleDuplicates?.length ? (
          <section className="rounded-[22px] px-[18px] py-4" style={{ background: "var(--g-warns)", border: "1px solid color-mix(in srgb, var(--g-warn) 25%, transparent)" }}>
            <p className="flex items-center gap-2 text-[13.5px] font-semibold" style={{ color: "var(--g-warn)" }}><AlertTriangle size={16} /> Possible duplicates (same phone or RERA number)</p>
            <ul className="mt-2 flex flex-col gap-2">
              {data.possibleDuplicates.map((d) => (
                <li key={d._id} className="flex flex-wrap items-center gap-2 text-[13px]">
                  <Link className="font-semibold hover:underline" style={{ color: "var(--g-b)" }} to={`${back}/${d._id}`}>{d.name}</Link>
                  <span style={MUT}>{d.phone}{d.reraNumber ? ` · RERA ${d.reraNumber}` : ""}</span>
                  {isManagement
                    ? <GhostButton className="h-8 px-3 text-[12.5px]" disabled={merging === d._id} onClick={() => merge(d)}><GitMerge size={14} />{merging === d._id ? "Merging…" : "Merge into this record"}</GhostButton>
                    : <span className="text-[12px]" style={MUT}>Ask a manager to merge</span>}
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        <div className="flex flex-wrap items-start gap-4">
          {/* Left column */}
          <div className="flex min-w-0 flex-[1_1_520px] flex-col gap-4">
            <Panel title={`Linked inventory · ${data.inventory.length}`} icon={Building2} action={isBroker ? <button type="button" onClick={() => setLinking(true)} className="text-[13px] font-medium" style={{ color: "var(--g-b)" }}>+ Link</button> : null}>
              {data.inventory.map((r, i) => {
                const link = r.myLink;
                return (
                  <div key={r._id} className="flex flex-wrap items-center gap-x-4 gap-y-3 px-[18px] py-3.5" style={i ? { borderTop: "1px solid var(--g-div)" } : undefined}>
                    <span className="h-12 w-12 shrink-0 rounded-[14px]" style={{ background: "repeating-linear-gradient(135deg, var(--g-glass2) 0 8px, var(--g-track) 8px 16px)" }} />
                    <div className="flex min-w-0 flex-[1_1_200px] flex-col gap-0.5">
                      <Link to={`/inventory/${r._id}`} className="truncate text-[14px] font-semibold hover:underline" style={{ color: "var(--g-b)" }}>{r.propertyId || r.projectName}</Link>
                      <span className="truncate text-[12.5px]" style={MUT}>{[[r.projectName, r.buildingName, r.unitNumber].filter(Boolean).join(" · "), [r.area, r.city].filter(Boolean).join(", ") || r.location].filter(Boolean).join(" · ")}</span>
                      <span className="text-[11.5px]" style={FNT}>{r.relation === "OWNER" ? "Owner" : r.relation === "SOURCE_BROKER" ? "Source broker" : "Linked"} · unit {String(r.status || "").toLowerCase() || "–"}</span>
                    </div>
                    {isBroker && link ? (
                      <div className="flex flex-col items-start gap-0.5">
                        <span className="text-[15px] font-semibold">{money(link.askingPrice ?? link.askingRent)}</span>
                        <span className="text-[11.5px]" style={MUT}>Broker quote</span>
                        {link.netRate !== undefined && link.netRate !== null ? <span className="text-[11.5px]" style={{ color: "var(--g-warn)" }}>Net {money(link.netRate)}</span> : null}
                      </div>
                    ) : null}
                    <div className="flex flex-col items-end gap-1">
                      {isBroker && link ? <Pill tone={AVAIL_TONE[link.availability] || "mute"}>{labelOf(AVAILABILITY_OPTIONS, link.availability)}</Pill> : null}
                      {r.stale
                        ? <span className="inline-flex items-center gap-1 text-[11.5px] font-medium" style={{ color: "var(--g-warn)" }}><AlertTriangle size={12} /> Re-verify</span>
                        : <span className="text-[11.5px]" style={MUT}>Confirmed {formatShortDate(link?.confirmedAt || r.lastConfirmedAt) || "–"}</span>}
                    </div>
                  </div>
                );
              })}
              {!data.inventory.length ? <p className="px-[18px] py-5 text-[13px]" style={MUT}>Nothing linked yet.</p> : null}
            </Panel>

            {isBroker ? (
              <Panel title={`Referred leads · ${data.referredLeads.length}`} icon={Users}>
                {data.referredLeads.map((l, i) => (
                  <div key={l._id} className="flex flex-wrap items-center gap-x-4 gap-y-2 px-[18px] py-3" style={i ? { borderTop: "1px solid var(--g-div)" } : undefined}>
                    <Avatar name={l.name} id={l._id} size={36} radius={12} text={12} />
                    <div className="flex min-w-0 flex-[1_1_180px] flex-col">
                      <Link to={`/leads/${l._id}`} className="truncate text-[13.5px] font-semibold hover:underline">{l.name}</Link>
                      <span className="font-mono text-[12px]" style={MUT}>{l.phone}</span>
                    </div>
                    <Pill tone="info">{titleCase(l.status)}</Pill>
                    <span className="text-[12.5px]" style={MUT}>{l.assignedTo?.name || "Unassigned"} · {formatShortDate(l.createdAt)}</span>
                    {data.canSeeRestricted ? <span className="text-[13px] font-semibold">{money(l.brokerageReceived)}</span> : null}
                  </div>
                ))}
                {!data.referredLeads.length ? (
                  <div className="flex flex-wrap items-center gap-3.5 px-[18px] py-6">
                    <IconTile icon={GitBranch} tone="mute" size={44} radius={14} iconSize={20} />
                    <div className="flex min-w-[200px] flex-1 flex-col gap-0.5">
                      <span className="text-[14px] font-medium">No referred leads yet</span>
                      <span className="text-[12.5px]" style={MUT}>Choose this broker under &ldquo;Referred by broker&rdquo; when adding a lead.</span>
                    </div>
                  </div>
                ) : null}
              </Panel>
            ) : null}
          </div>

          {/* Right column */}
          <div className="flex min-w-0 flex-[1_1_300px] flex-col gap-4">
            <Panel title="Details" icon={IdCard}>
              <div className="px-[18px] pb-3 pt-1">
                <DetailRow first icon={Phone} label="Primary mobile" value={prettyPhone(c.phone)} />
                {c.alternatePhone ? <DetailRow icon={Phone} label="Alternate phone" value={c.alternatePhone} /> : null}
                <DetailRow icon={MessageCircle} label="WhatsApp" value={c.whatsapp} />
                <DetailRow icon={Mail} label="Email" value={c.email} />
                <DetailRow icon={MapPin} label="City" value={c.city} />
                <DetailRow icon={Briefcase} label={isBroker ? "Firm" : "Company"} value={firm} />
                {isBroker ? <DetailRow icon={IdCard} label="Designation" value={c.designation} /> : null}
                {isBroker ? <DetailRow icon={Tag} label="Broker type" value={c.brokerType ? titleCase(c.brokerType === "COMPANY" ? "Company broker" : c.brokerType) : ""} /> : null}
                {isBroker ? <DetailRow icon={BadgeCheck} label="RERA no." value={c.reraNumber} /> : null}
                <DetailRow icon={Megaphone} label="Source" value={titleCase(c.source)} />
                {isBroker && (c.areas || []).length ? <DetailRow icon={MapPin} label="Areas" value={c.areas.join(", ")} /> : null}
                {isBroker && (c.projects || []).length ? <DetailRow icon={Building2} label="Projects" value={c.projects.join(", ")} /> : null}
                {isBroker && (c.transactionTypes || []).length ? <DetailRow icon={Tag} label="Transactions" value={c.transactionTypes.map((t) => labelOf(TRANSACTION_OPTIONS, t)).join(", ")} /> : null}
                {isBroker && (c.customerTypes || []).length ? <DetailRow icon={Users} label="Customer types" value={c.customerTypes.map(titleCase).join(", ")} /> : null}
                {!isBroker ? <DetailRow icon={CircleCheck} label="Last verified" value={formatShortDate(c.lastVerifiedAt)} /> : null}
                {c.marketNotes ? <p className="mt-2 rounded-xl px-3 py-2 text-[12.5px]" style={{ ...field, color: "var(--g-mut)" }}>{c.marketNotes}</p> : null}
                {c.propertyDetails ? <p className="mt-2 rounded-xl px-3 py-2 text-[12.5px]" style={{ ...field, color: "var(--g-mut)" }}>{c.propertyDetails}</p> : null}
                {c.notes ? <p className="mt-2 rounded-xl px-3 py-2 text-[12.5px]" style={{ ...field, color: "var(--g-mut)" }}>{c.notes}</p> : null}
                {missing > 0 ? (
                  <button type="button" onClick={() => setEditing(true)} className="mt-2.5 flex w-full items-center gap-2 rounded-xl px-3 py-2.5 text-left text-[12.5px] font-medium" style={{ background: "var(--g-warns)", color: "var(--g-warn)" }}>
                    <AlertCircle size={16} />{missing} field{missing === 1 ? "" : "s"} missing - complete profile
                  </button>
                ) : null}
              </div>
            </Panel>

            <Panel title="Relationship" icon={Handshake}>
              <div className="px-[18px] pb-3 pt-1">
                <DetailRow first icon={Handshake} label="Status" value={c.relationshipStatus ? labelOf(RELATIONSHIP_OPTIONS, c.relationshipStatus) : ""} />
                <DetailRow icon={Users} label="Owner (internal)" value={c.relationshipOwnerId?.name} />
                <DetailRow icon={CalendarClock} label="Last contact" value={formatShortDate(c.lastContactAt)} />
                <DetailRow icon={CalendarClock} label="Next follow-up" value={formatShortDate(c.nextFollowUpAt)} />
                <DetailRow icon={Phone} label="Preferred contact" value={titleCase(c.preferredContact)} />
                {isBroker ? <DetailRow icon={CircleCheck} label="CP onboarded" value={formatShortDate(c.cpOnboardedAt)} /> : null}
                {c.relationshipNotes ? <p className="mt-2 rounded-xl px-3 py-2 text-[12.5px]" style={{ ...field, color: "var(--g-mut)" }}>{c.relationshipNotes}</p> : null}
              </div>
            </Panel>

            {data.canSeeRestricted ? (
              <Panel title="Restricted" icon={Lock} tone="restricted" action={<span className="text-[11px] font-medium" style={{ color: "var(--g-warn)" }}>Admin &amp; manager</span>}>
                <div className="px-[18px] pb-3 pt-1">
                  {[["Brokerage terms", c.brokerageTerms], ...(isBroker ? [["Net rates", c.netRateNotes]] : []), ["Internal remarks", c.internalRemarks]].map(([label, value], i) => (
                    <div key={label} className="flex gap-2.5 py-2" style={i ? { borderTop: "1px solid color-mix(in srgb, var(--g-warn) 18%, transparent)" } : undefined}>
                      <span className="flex-1 text-[13px]" style={MUT}>{label}</span>
                      <span className="max-w-[60%] whitespace-pre-wrap text-right text-[13px] font-medium" style={value ? undefined : FNT}>{value || "Not set"}</span>
                    </div>
                  ))}
                </div>
              </Panel>
            ) : null}
          </div>
        </div>
      </div>

      {editing ? (
        <ContactEditDrawer kind={kind} contact={c} canSeeRestricted={data.canSeeRestricted} onClose={() => setEditing(false)}
          onSaved={() => { setEditing(false); setNotice("Profile saved"); load(); }} />
      ) : null}
      {linking ? <LinkInventoryDialog broker={c} onClose={() => setLinking(false)} onLinked={(count = 1) => { setLinking(false); setNotice(count > 1 ? `${count} units linked` : "Inventory linked"); load(); }} /> : null}
      {notice ? createPortal(
        <div role="status" className="fixed bottom-6 left-1/2 z-[130] flex -translate-x-1/2 items-center gap-2 rounded-xl px-4 py-2.5 text-[13px] font-medium text-white shadow-lg" style={{ background: "#0e1630" }}>
          <CircleCheck size={17} style={{ color: "#7fe0c6" }} />{notice}
        </div>,
        document.body,
      ) : null}
    </div>
  );
};

export default ContactProfilePage;
