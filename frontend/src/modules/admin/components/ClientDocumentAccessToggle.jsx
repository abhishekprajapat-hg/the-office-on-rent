import React, { useState } from "react";
import { Lock } from "lucide-react";
import api from "../../../services/api";
import { toErrorMessage } from "../../../utils/errorMessage";

/*
 * Admin-only switch: may this person download coworking client documents?
 * (requirements 16 Oct 2026, section 09 - "specifically authorised main
 * manager"). Saves straight away and is audited on the server.
 */
const ClientDocumentAccessToggle = ({ userId, initial, isDark }) => {
  const [allowed, setAllowed] = useState(Boolean(initial));
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  const toggle = async (next) => {
    setBusy(true); setMessage("");
    try {
      await api.patch(`/access/users/${userId}/document-download`, { allowed: next });
      setAllowed(next);
      setMessage(next ? "Can now download client documents" : "Client document downloads removed");
    } catch (error) {
      setMessage(toErrorMessage(error, "Couldn't save"));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className={`col-span-2 rounded-xl border p-2.5 ${isDark ? "border-slate-700 bg-slate-950 text-slate-100" : "border-amber-200 bg-amber-50/60 text-slate-800"}`}>
      <label className="flex items-center gap-2">
        <input type="checkbox" checked={allowed} disabled={busy} onChange={(e) => toggle(e.target.checked)} />
        <Lock size={12} aria-hidden="true" />
        <span className="text-xs font-semibold">Can download coworking client documents</span>
      </label>
      <p className={`mt-1 text-[11px] ${isDark ? "text-slate-400" : "text-slate-500"}`}>
        KYC, agreements and cheque copies. Besides Admins, only people ticked here can open or download them.
      </p>
      {message ? <p className="mt-1 text-[11px] font-semibold">{message}</p> : null}
    </div>
  );
};

export default ClientDocumentAccessToggle;
