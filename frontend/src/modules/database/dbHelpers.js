import { useEffect, useState } from "react";
import { getDatabaseMeta } from "../../services/databaseService";

/* Helpers shared by the Database and Enterprise Leasing screens (Oct 2026). */
export const titleCase = (s) => String(s || "").replaceAll("_", " ").toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase());
export const fmtDate = (d) => (d ? new Date(d).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" }) : "–");
export const isoDate = (d) => (d ? new Date(d).toISOString().slice(0, 10) : "");
export const money = (v) => (v === null || v === undefined || v === "" ? "–" : `₹${Number(v).toLocaleString("en-IN", { maximumFractionDigits: 2 })}`);
export const options = (list = [], labeller = titleCase) => list.filter(Boolean).map((v) => ({ value: v, label: labeller(v) }));

export const ROLE_LABELS = {
  OWNER: "Owner", BROKER: "Broker", MAINTENANCE_STAFF: "Maintenance staff", SECURITY_GUARD: "Security guard", BUILDING_MANAGER: "Building manager",
  PROPERTY_MANAGER: "Property manager", PA: "PA", ACCOUNTANT: "Accountant", AUTHORIZED_REPRESENTATIVE: "Authorised representative", OTHER: "Other",
};
export const roleLabel = (r) => ROLE_LABELS[r] || titleCase(r);
export const contactHref = (c) => (c?.kind === "OWNER" ? `/inventory/owners/${c._id}` : c?.kind === "BROKER" ? `/inventory/brokers/${c._id}` : `/database/contacts/${c?._id}`);
export const STATUS_TONE = { CURRENT: "ok", FORMER: "mute", UNCONFIRMED: "warn" };
export const AUTH_TONE = { VERIFIED: "ok", REPORTED: "info", UNCONFIRMED: "warn" };

export const targetOf = (r) => {
  if (r.buildingId) return { to: `/database/buildings/${r.buildingId._id}`, label: r.buildingId.name, sub: [r.buildingId.buildingCode, r.buildingId.locality].filter(Boolean).join(" · "), kind: "Building" };
  if (r.inventoryId) return { to: `/inventory/${r.inventoryId._id}`, label: r.inventoryId.propertyId || r.inventoryId.unitNumber, sub: [r.inventoryId.projectName, r.inventoryId.status].filter(Boolean).join(" · "), kind: "Property" };
  if (r.ownerId) return { to: `/inventory/owners/${r.ownerId._id}`, label: r.ownerId.name, sub: r.ownerId.contactCode, kind: "Owner" };
  return { to: null, label: "–", sub: "", kind: "" };
};

let metaCache = null;
export const useDatabaseMeta = () => {
  const [meta, setMeta] = useState(metaCache);
  useEffect(() => {
    if (metaCache) return;
    getDatabaseMeta().then((m) => { metaCache = m; setMeta(m); }).catch(() => {});
  }, []);
  return meta;
};

/* Loads data for a page; reload() fetches again after a change. */
export const useLoader = (fetcher, deps) => {
  const [data, setData] = useState(null);
  const [error, setError] = useState("");
  const [tick, setTick] = useState(0);
  useEffect(() => {
    let live = true;
    fetcher().then((d) => { if (live) { setData(d); setError(""); } }).catch((e) => { if (live) setError(e?.response?.data?.message || e?.message || "Could not load"); });
    return () => { live = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, tick]);
  return { data, error, setError, reload: () => setTick((t) => t + 1) };
};
