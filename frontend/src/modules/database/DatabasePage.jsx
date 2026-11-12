import React, { useCallback, useEffect, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { Building, BookUser, Contact, Handshake, Plus, Search, Users } from "lucide-react";
import { toErrorMessage } from "../../utils/errorMessage";
import { useDebouncedValue } from "../../hooks/useDebouncedValue";
import { listBuildings, listDbContacts } from "../../services/databaseService";
import { FNT, MUT, field } from "../inventory/components/contactGlassTokens";
import { Btn, ErrorLine, Panel, Select, Table, Tag } from "./dbUi";
import { AddBuildingDialog, AddContactDialog } from "./dbDialogs";
import { contactHref, fmtDate, ROLE_LABELS, roleLabel, useDatabaseMeta } from "./dbHelpers";

/*
 * Database (Developmental Updates Oct 2026 - Update 01): buildings, owners and
 * every person who gives the team inventory information - guards,
 * maintenance staff, building / property managers, PAs, accountants,
 * representatives and brokers. One person, one record, many roles.
 */
const TABS = [
  { key: "contacts", label: "Contacts", icon: Contact, blurb: "Guards, maintenance staff, managers, PAs, accountants and representatives." },
  { key: "owners", label: "Owners", icon: BookUser, blurb: "The Owner Database. A property's owner can also be unknown until someone confirms it." },
  { key: "brokers", label: "Brokers", icon: Handshake, blurb: "The Broker Database, as before." },
  { key: "buildings", label: "Buildings", icon: Building, blurb: "Each building once, with its properties, owners and contacts counted live." },
];
const KIND_FOR_TAB = { contacts: "CONTACT", owners: "OWNER", brokers: "BROKER" };

const DatabasePage = () => {
  const navigate = useNavigate();
  const meta = useDatabaseMeta();
  const [params, setParams] = useSearchParams();
  const tab = TABS.some((t) => t.key === params.get("tab")) ? params.get("tab") : "contacts";
  const [search, setSearch] = useState("");
  const [role, setRole] = useState("");
  const q = useDebouncedValue(search, 250);
  const [rows, setRows] = useState([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [dialog, setDialog] = useState("");

  const load = useCallback(async () => {
    setLoading(true); setError("");
    try {
      if (tab === "buildings") {
        const d = await listBuildings({ search: q });
        setRows(d.buildings || []); setTotal(d.total || 0);
      } else {
        const d = await listDbContacts({ search: q, kind: KIND_FOR_TAB[tab], ...(role ? { role } : {}) });
        setRows(d.contacts || []); setTotal(d.total || 0);
      }
    } catch (e) { setError(toErrorMessage(e, "Could not load the Database")); setRows([]); }
    finally { setLoading(false); }
  }, [tab, q, role]);
  useEffect(() => { load(); }, [load]);

  const contactColumns = [
    { key: "name", label: "Name", render: (c) => <span><b>{c.name}</b>{c.isContactPoint ? <span className="ml-1"><Tag tone="info">Contact point</Tag></span> : null}<div className="text-[11.5px]" style={FNT}>{c.contactCode}</div></span> },
    { key: "roles", label: "Roles", render: (c) => <span className="flex flex-wrap justify-end gap-1 md:justify-start">{(c.roles || []).map((r) => <Tag key={r} tone="a">{roleLabel(r)}</Tag>)}</span> },
    { key: "phone", label: "Phone", render: (c) => c.phone || <span style={FNT}>No number</span> },
    { key: "links", label: "Linked", render: (c) => `${c.linkedBuildings} building${c.linkedBuildings === 1 ? "" : "s"} · ${c.linkedProperties} propert${c.linkedProperties === 1 ? "y" : "ies"}` },
    { key: "last", label: "Last contact", render: (c) => fmtDate(c.lastContactAt) },
  ];
  const buildingColumns = [
    { key: "name", label: "Building", render: (b) => <span><b>{b.name}</b><div className="text-[11.5px]" style={FNT}>{b.buildingCode}{b.aliases?.length ? ` · also ${b.aliases.join(", ")}` : ""}</div></span> },
    { key: "where", label: "Where", render: (b) => [b.locality, b.city].filter(Boolean).join(", ") || "–" },
    { key: "props", label: "Properties", right: true, render: (b) => `${b.counts?.properties ?? 0} (${b.counts?.available ?? 0} available)` },
    { key: "owners", label: "Owners", right: true, render: (b) => b.counts?.owners ?? 0 },
    { key: "contacts", label: "Contacts", right: true, render: (b) => b.counts?.contacts ?? 0 },
    { key: "brokers", label: "Brokers", right: true, render: (b) => b.counts?.brokers ?? 0 },
  ];
  const current = TABS.find((t) => t.key === tab);

  return (
    <div className="mx-auto flex w-full max-w-[1200px] flex-col gap-4 p-3 sm:p-5" style={{ color: "var(--g-ink)" }}>
      <div className="flex flex-wrap items-end gap-3">
        <div className="min-w-0 flex-1">
          <h1 className="text-[22px] font-semibold">Database</h1>
          <p className="text-[13px]" style={MUT}>Buildings, owners and everyone who gives us inventory information. Search by name, phone or code before adding, so each person is saved once.</p>
        </div>
        <Btn onClick={() => setDialog("building")}><Building size={15} /> Add building</Btn>
        <Btn tone="primary" onClick={() => setDialog("contact")}><Plus size={15} /> Add contact</Btn>
      </div>

      <div className="flex gap-1.5 overflow-x-auto pb-1">
        {TABS.map((t) => (
          <button key={t.key} type="button" aria-pressed={tab === t.key} onClick={() => { setParams({ tab: t.key }); setRole(""); }}
            className="inline-flex h-9 shrink-0 items-center gap-1.5 rounded-full px-3.5 text-[13px] font-medium"
            style={tab === t.key ? { background: "var(--g-bs)", color: "var(--g-b)", border: "1.5px solid var(--g-b)" } : { ...field, borderWidth: 1.5 }}>
            <t.icon size={15} /> {t.label}
          </button>
        ))}
      </div>

      <Panel title={`${current.label}${loading ? "" : ` · ${total}`}`} icon={current.key === "buildings" ? Building : Users} action={
        current.key === "owners" ? <Link className="text-[12.5px] font-semibold" style={{ color: "var(--g-b)" }} to="/inventory/owners">Open Owner Database</Link>
          : current.key === "brokers" ? <Link className="text-[12.5px] font-semibold" style={{ color: "var(--g-b)" }} to="/inventory/brokers">Open Broker Database</Link> : null
      }>
        <p className="mb-3 text-[12.5px]" style={FNT}>{current.blurb}</p>
        <div className="mb-3 flex flex-wrap gap-2">
          <div className="flex min-w-[220px] flex-1 items-center gap-2 rounded-xl px-3" style={field}>
            <Search size={15} style={FNT} />
            <input className="h-10 flex-1 bg-transparent text-[13.5px] outline-none" placeholder={tab === "buildings" ? "Search name, other name, locality, city or code" : "Search name, phone, company or code"} value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>
          {tab === "contacts" ? (
            <Select className="w-[220px]" value={role} onChange={(e) => setRole(e.target.value)} placeholder="All roles"
              options={(meta?.roles || Object.keys(ROLE_LABELS)).filter((r) => !["OWNER", "BROKER"].includes(r)).map((r) => ({ value: r, label: roleLabel(r) }))} />
          ) : null}
        </div>
        <ErrorLine message={error} />
        {tab === "buildings"
          ? <Table columns={buildingColumns} rows={rows} onRow={(b) => navigate(`/database/buildings/${b._id}`)} empty={loading ? "Loading…" : "No buildings yet"} />
          : <Table columns={contactColumns} rows={rows} onRow={(c) => navigate(contactHref(c))} empty={loading ? "Loading…" : "No one found"} />}
      </Panel>

      {dialog === "contact" ? <AddContactDialog preset={{ roles: tab === "owners" ? ["OWNER"] : tab === "brokers" ? ["BROKER"] : [] }} onClose={() => setDialog("")} onSaved={(c) => navigate(contactHref(c))} /> : null}
      {dialog === "building" ? <AddBuildingDialog onClose={() => setDialog("")} onSaved={(b) => navigate(`/database/buildings/${b._id}`)} /> : null}
    </div>
  );
};

export default DatabasePage;
