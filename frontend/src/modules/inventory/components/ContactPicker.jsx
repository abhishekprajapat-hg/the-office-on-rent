import React, { useEffect, useState } from "react";
import { Loader2, Search, X } from "lucide-react";
import { listContacts } from "../../../services/relationshipService";

/* Type-ahead over the Owner or Broker Database. Calls onPick(contact). */
const ContactPicker = ({ kind = "BROKER", value, onPick, placeholder }) => {
  const [query, setQuery] = useState("");
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open || query.trim().length < 2) return undefined;
    let active = true;
    const timer = setTimeout(() => {
      setLoading(true);
      listContacts({ kind, search: query.trim() })
        .then((data) => { if (active) setRows(data.contacts || []); })
        .catch(() => { if (active) setRows([]); })
        .finally(() => { if (active) setLoading(false); });
    }, 250);
    return () => { active = false; clearTimeout(timer); };
  }, [kind, query, open]);

  if (value) {
    return (
      <div className="flex h-9 items-center justify-between gap-2 rounded-lg border border-blue-200 bg-blue-50 px-3 text-[13px] text-blue-900">
        <span className="truncate font-semibold">{value.name} <span className="font-normal text-blue-700">· {value.phone}</span></span>
        <button type="button" onClick={() => onPick(null)} aria-label="Clear" className="text-blue-700 hover:text-blue-900"><X size={14} /></button>
      </div>
    );
  }

  return (
    <div className="relative">
      <div className="flex h-9 items-center gap-2 rounded-lg border border-slate-300 bg-white px-3 focus-within:border-blue-400 focus-within:ring-2 focus-within:ring-blue-100">
        <Search size={14} className="text-slate-400" />
        <input
          value={query}
          onChange={(e) => { setQuery(e.target.value); setOpen(true); }}
          onFocus={() => setOpen(true)}
          placeholder={placeholder || `Search ${kind === "BROKER" ? "broker" : "owner"} by name, phone, firm`}
          className="h-full flex-1 border-0 bg-transparent text-[13px] outline-none"
          data-bare-input
        />
        {loading ? <Loader2 size={14} className="animate-spin text-slate-400" /> : null}
      </div>
      {open && query.trim().length >= 2 ? (
        <ul className="absolute z-20 mt-1 max-h-56 w-full overflow-auto rounded-lg border border-slate-200 bg-white py-1 shadow-lg">
          {rows.map((c) => (
            <li key={c._id}>
              <button type="button" onClick={() => { onPick(c); setOpen(false); setQuery(""); }} className="block w-full px-3 py-1.5 text-left text-[13px] hover:bg-blue-50">
                <span className="font-semibold text-slate-800">{c.name}</span>
                <span className="text-slate-500"> · {c.phone}{c.firmId?.name || c.company ? ` · ${c.firmId?.name || c.company}` : ""}</span>
              </button>
            </li>
          ))}
          {!loading && !rows.length ? <li className="px-3 py-2 text-[12.5px] text-slate-500">No match. Add them in the {kind === "BROKER" ? "Broker" : "Owner"} Database first.</li> : null}
        </ul>
      ) : null}
    </div>
  );
};

export default ContactPicker;
