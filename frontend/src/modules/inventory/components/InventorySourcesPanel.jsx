import React, { useState } from "react";
import { Link } from "react-router-dom";
import { AlertTriangle, CheckCircle2, Handshake, Loader2, Plus, Trash2, UserRound } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "../../../components/ui";
import { toErrorMessage } from "../../../utils/errorMessage";
import {
  addInventorySource, confirmInventory, removeInventorySource, setInventoryOwner, updateInventorySource,
} from "../../../services/relationshipService";
import ContactPicker from "./ContactPicker";
import {
  AVAILABILITY_OPTIONS, SOURCE_TYPE_OPTIONS, daysAgo, formatShortDate, labelOf, toneOf,
} from "../relationshipOptions";

const money = (v) => (v === null || v === undefined || v === "" ? "" : `₹${Number(v).toLocaleString("en-IN")}`);
const inputClass = "h-9 w-full rounded-lg border border-slate-300 bg-white px-3 text-[13px] outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100";

/*
 * Who offers this unit and when it was last checked (requirements 16 Oct
 * 2026, 6.3, 7.1, 7.3, 17.2). Not shown to Channel Partners.
 */
const InventorySourcesPanel = ({ inventoryId, asset, role, onChanged }) => {
  const isManagement = role === "ADMIN" || role === "MANAGER";
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState({ broker: null, askingPrice: "", askingRent: "", netRate: "", availability: "AVAILABLE", notes: "" });
  const [ownerPick, setOwnerPick] = useState(null);
  const [ownerOpen, setOwnerOpen] = useState(false);

  const run = async (key, fn, success) => {
    setBusy(key); setError(""); setNotice("");
    try {
      const out = await fn();
      setNotice(out?.message || success);
      await onChanged?.();
      return true;
    } catch (e) {
      setError(toErrorMessage(e, "Something went wrong"));
      return false;
    } finally {
      setBusy("");
    }
  };

  const links = asset?.sourceLinks || [];
  const last = asset?.lastConfirmedAt;
  const age = daysAgo(last);

  const submitSource = async () => {
    if (!draft.broker) { setError("Choose a broker"); return; }
    const payload = {
      contactId: draft.broker._id,
      askingPrice: draft.askingPrice || null,
      askingRent: draft.askingRent || null,
      availability: draft.availability,
      notes: draft.notes,
    };
    if (isManagement && draft.netRate !== "") payload.netRate = draft.netRate;
    const ok = await run("add", () => addInventorySource(inventoryId, payload), "Source linked");
    if (ok) { setAdding(false); setDraft({ broker: null, askingPrice: "", askingRent: "", netRate: "", availability: "AVAILABLE", notes: "" }); }
  };

  return (
    <Card>
      <CardHeader className="py-3">
        <CardTitle className="flex items-center gap-2"><Handshake size={15} className="text-blue-600" /> Source &amp; owner</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3 text-[13px]">
        {error ? <p role="alert" className="rounded-lg bg-rose-50 p-2 text-[12px] text-rose-700">{error}</p> : null}
        {notice ? <p role="status" className="rounded-lg bg-emerald-50 p-2 text-[12px] text-emerald-700">{notice}</p> : null}

        <div className="flex items-center justify-between gap-2">
          <span className="text-slate-500">Source</span>
          <span className="font-semibold text-slate-800">{labelOf(SOURCE_TYPE_OPTIONS, asset?.sourceType) || "Not set"}</span>
        </div>

        <div className={`rounded-lg p-2.5 ${asset?.stale ? "bg-amber-50 text-amber-900" : "bg-slate-50 text-slate-700"}`}>
          <div className="flex items-start gap-2">
            {asset?.stale ? <AlertTriangle size={15} className="mt-0.5 shrink-0" /> : <CheckCircle2 size={15} className="mt-0.5 shrink-0 text-emerald-600" />}
            <p className="flex-1 text-[12.5px]">
              {last ? <>Last confirmed <strong>{formatShortDate(last)}</strong> ({age === 0 ? "today" : `${age} day${age === 1 ? "" : "s"} ago`})</> : "Never confirmed"}
              {asset?.stale ? <span className="block">Check availability and price before quoting.</span> : null}
            </p>
          </div>
          <button type="button" disabled={busy === "confirm"} onClick={() => run("confirm", () => confirmInventory(inventoryId), "Marked as confirmed today")}
            className="mt-2 inline-flex items-center gap-1.5 rounded-md border border-current/20 bg-white px-2.5 py-1 text-[12px] font-semibold hover:bg-white/70 disabled:opacity-60">
            {busy === "confirm" ? <Loader2 size={12} className="animate-spin" /> : <CheckCircle2 size={12} />} Confirmed today
          </button>
        </div>

        <div className="border-t border-slate-100 pt-3">
          <div className="flex items-center justify-between">
            <span className="text-slate-500">Owner</span>
            {asset?.ownerContactId ? (
              <Link to={`/inventory/owners/${asset.ownerContactId}`} className="inline-flex items-center gap-1 font-semibold text-blue-700 hover:underline">
                <UserRound size={13} /> {asset.ownerName || "Open owner"}
              </Link>
            ) : <span className="text-slate-400">Not linked</span>}
          </div>
          {isManagement ? (
            ownerOpen ? (
              <div className="mt-2 space-y-2">
                <ContactPicker kind="OWNER" value={ownerPick} onPick={setOwnerPick} />
                <div className="flex gap-2">
                  <button type="button" className="rounded-md bg-blue-600 px-3 py-1.5 text-[12px] font-semibold text-white disabled:opacity-60" disabled={!ownerPick || busy === "owner"}
                    onClick={async () => { if (await run("owner", () => setInventoryOwner(inventoryId, ownerPick._id), "Owner linked")) { setOwnerOpen(false); setOwnerPick(null); } }}>
                    Link owner
                  </button>
                  <button type="button" className="text-[12px] font-semibold text-slate-500" onClick={() => setOwnerOpen(false)}>Cancel</button>
                </div>
              </div>
            ) : (
              <button type="button" onClick={() => setOwnerOpen(true)} className="mt-1 text-[12px] font-semibold text-blue-700 hover:underline">
                {asset?.ownerContactId ? "Change owner" : "Link an owner from the Owner Database"}
              </button>
            )
          ) : null}
        </div>

        <div className="border-t border-slate-100 pt-3">
          <p className="mb-2 text-slate-500">Brokers offering this unit ({links.length})</p>
          <ul className="space-y-2">
            {links.map((l) => (
              <li key={l._id} className="rounded-lg border border-slate-200 p-2.5">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    {l.contact?._id ? (
                      <Link to={`/inventory/brokers/${l.contact._id}`} className="font-semibold text-blue-700 hover:underline">{l.contact.name || "Broker"}</Link>
                    ) : <span className="font-semibold">{l.firm?.name || "Firm"}</span>}
                    {l.firm?.name && l.contact?._id ? <span className="text-slate-500"> · {l.firm.name}</span> : null}
                    <p className="text-[12px] text-slate-500">
                      {[l.askingPrice !== null && l.askingPrice !== undefined ? `Asking ${money(l.askingPrice)}` : "", l.askingRent ? `Rent ${money(l.askingRent)}` : "", l.netRate !== undefined && l.netRate !== null ? `Net ${money(l.netRate)}` : ""].filter(Boolean).join(" · ") || "No price given"}
                    </p>
                    <p className="text-[11.5px] text-slate-400">Confirmed {l.confirmedAt ? formatShortDate(l.confirmedAt) : "never"}</p>
                  </div>
                  <span className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold ${toneOf(AVAILABILITY_OPTIONS, l.availability)}`}>{labelOf(AVAILABILITY_OPTIONS, l.availability)}</span>
                </div>
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  <select aria-label="Availability" value={l.availability} disabled={busy === l._id}
                    onChange={(e) => run(l._id, () => updateInventorySource(inventoryId, l._id, { availability: e.target.value, confirmedAt: new Date().toISOString() }), "Availability updated")}
                    className="h-7 rounded-md border border-slate-300 bg-white px-2 text-[12px]">
                    {AVAILABILITY_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                  </select>
                  <button type="button" className="text-[12px] font-semibold text-blue-700 hover:underline" disabled={busy === l._id}
                    onClick={() => run(l._id, () => confirmInventory(inventoryId, { linkId: l._id }), "Confirmed with broker today")}>Confirmed today</button>
                  {isManagement ? (
                    <button type="button" aria-label="Remove source" className="ml-auto rounded p-1 text-rose-500 hover:bg-rose-50" disabled={busy === l._id}
                      onClick={() => { if (window.confirm("Remove this broker from the unit? The broker record stays.")) run(l._id, () => removeInventorySource(inventoryId, l._id), "Source removed"); }}>
                      <Trash2 size={13} />
                    </button>
                  ) : null}
                </div>
              </li>
            ))}
            {!links.length ? <li className="text-[12.5px] text-slate-400">No broker linked.</li> : null}
          </ul>

          {adding ? (
            <div className="mt-3 space-y-2 rounded-lg bg-slate-50 p-2.5">
              <ContactPicker kind="BROKER" value={draft.broker} onPick={(b) => setDraft((d) => ({ ...d, broker: b }))} />
              <div className="grid grid-cols-2 gap-2">
                <input className={inputClass} inputMode="numeric" placeholder="Asking price ₹" value={draft.askingPrice} onChange={(e) => setDraft((d) => ({ ...d, askingPrice: e.target.value.replace(/[^\d]/g, "") }))} />
                <input className={inputClass} inputMode="numeric" placeholder="Asking rent ₹" value={draft.askingRent} onChange={(e) => setDraft((d) => ({ ...d, askingRent: e.target.value.replace(/[^\d]/g, "") }))} />
                {isManagement ? <input className={inputClass} inputMode="numeric" placeholder="Net rate ₹ (private)" value={draft.netRate} onChange={(e) => setDraft((d) => ({ ...d, netRate: e.target.value.replace(/[^\d]/g, "") }))} /> : null}
                <select className={inputClass} value={draft.availability} onChange={(e) => setDraft((d) => ({ ...d, availability: e.target.value }))} aria-label="Availability">
                  {AVAILABILITY_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
              </div>
              <input className={inputClass} placeholder="Notes" value={draft.notes} onChange={(e) => setDraft((d) => ({ ...d, notes: e.target.value }))} />
              <div className="flex gap-2">
                <button type="button" className="rounded-md bg-blue-600 px-3 py-1.5 text-[12px] font-semibold text-white disabled:opacity-60" disabled={busy === "add"} onClick={submitSource}>
                  {busy === "add" ? "Saving…" : "Link broker"}
                </button>
                <button type="button" className="text-[12px] font-semibold text-slate-500" onClick={() => setAdding(false)}>Cancel</button>
              </div>
            </div>
          ) : (
            <button type="button" onClick={() => setAdding(true)} className="mt-2 inline-flex items-center gap-1 text-[12px] font-semibold text-blue-700 hover:underline">
              <Plus size={13} /> Add a broker source
            </button>
          )}
        </div>
      </CardContent>
    </Card>
  );
};

export default InventorySourcesPanel;
